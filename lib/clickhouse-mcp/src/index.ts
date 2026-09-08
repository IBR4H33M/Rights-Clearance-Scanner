import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SCHEMA_SQL } from "./schema.js";

export type QueryResult = {
  rows: Array<Record<string, unknown>>;
  text?: string;
};

let mcpClient: Client | null = null;
let transport: StdioClientTransport | null = null;

/**
 * Connect to the mcp-clickhouse MCP server subprocess.
 * Reuses the existing connection if already connected.
 */
export async function connectClickHouse(): Promise<Client> {
  if (mcpClient) return mcpClient;

  const env: Record<string, string> = {
    CLICKHOUSE_HOST: process.env.CLICKHOUSE_HOST ?? "",
    CLICKHOUSE_PORT: process.env.CLICKHOUSE_PORT ?? "8443",
    CLICKHOUSE_USER: process.env.CLICKHOUSE_USER ?? "default",
    CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD ?? "",
    CLICKHOUSE_SECURE: process.env.CLICKHOUSE_SECURE ?? "true",
  };

  // Determine which command to use for running mcp-clickhouse
  // Try uvx first (fast, no install), fall back to python -m
  const isWindows = process.platform === "win32";
  let command: string;
  let args: string[];

  if (isWindows) {
    command = "cmd.exe";
    args = ["/c", "uvx", "mcp-clickhouse"];
  } else {
    command = "uvx";
    args = ["mcp-clickhouse"];
  }

  transport = new StdioClientTransport({
    command,
    args,
    env: { ...process.env, ...env } as Record<string, string>,
  });

  mcpClient = new Client(
    { name: "rights-clearance-scanner", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  await mcpClient.connect(transport);
  console.log("[ClickHouse MCP] Connected to mcp-clickhouse server");

  return mcpClient;
}

/**
 * Execute a read query via the MCP server and return parsed rows.
 */
export async function queryClickHouse(sql: string): Promise<QueryResult> {
  const client = await connectClickHouse();
  const result = await client.callTool({
    name: "read_query",
    arguments: { query: sql },
  });

  const text =
    Array.isArray(result.content) && result.content.length > 0
      ? String((result.content[0] as { text?: string }).text ?? "")
      : "";

  // The MCP server returns tab-separated data with headers
  const rows = parseClickHouseResponse(text);
  return { rows, text };
}

/**
 * Execute a write query (INSERT/CREATE/ALTER) via the MCP server.
 */
export async function executeClickHouse(sql: string): Promise<string> {
  const client = await connectClickHouse();

  // mcp-clickhouse exposes run_select_query for reads and
  // we use the query tool for writes too
  const result = await client.callTool({
    name: "write_query",
    arguments: { query: sql },
  });

  const text =
    Array.isArray(result.content) && result.content.length > 0
      ? String((result.content[0] as { text?: string }).text ?? "")
      : "";

  return text;
}

/**
 * Initialize the ClickHouse schema (creates tables if they don't exist).
 */
export async function initSchema(): Promise<void> {
  for (const statement of SCHEMA_SQL) {
    try {
      await executeClickHouse(statement);
    } catch (err) {
      console.error(`[ClickHouse MCP] Schema init error for statement:`, err);
    }
  }
  console.log("[ClickHouse MCP] Schema initialized");
}

/**
 * Disconnect from the MCP server.
 */
export async function disconnectClickHouse(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
  if (transport) {
    await transport.close();
    transport = null;
  }
}

/**
 * Parse tab-separated ClickHouse response into rows of objects.
 */
function parseClickHouseResponse(
  text: string
): Array<Record<string, unknown>> {
  if (!text || !text.trim()) return [];

  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]!.split("\t");
  const rows: Array<Record<string, unknown>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]!.split("\t");
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j]!.trim();
      const val = values[j]?.trim() ?? "";
      // Try to parse numbers
      const num = Number(val);
      row[key] = val === "" ? null : !isNaN(num) && val !== "" ? num : val;
    }
    rows.push(row);
  }

  return rows;
}

export { SCHEMA_SQL } from "./schema.js";
