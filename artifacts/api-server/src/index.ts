import app from "./app";
import { logger } from "./lib/logger";
import { connectClickHouse, initSchema } from "@workspace/clickhouse-mcp";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  // Initialize ClickHouse MCP connection and schema
  try {
    logger.info("Connecting to ClickHouse via MCP server...");
    await connectClickHouse();
    await initSchema();
    logger.info("ClickHouse MCP connected and schema initialized");
  } catch (err) {
    logger.error({ err }, "Failed to initialize ClickHouse MCP — continuing anyway (queries will retry)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Startup failed");
  process.exit(1);
});
