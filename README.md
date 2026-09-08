# Rights Clearance Scanner

An AI-powered production desk that scans scripts, images, and video assets for potential third-party rights references and compiles a risk-scored clearance report — powered by a genuinely agentic architecture that dynamically decides which analysis tools to apply per asset.

## Tech Stack

- **AI Engine**: Google Gemini via [Google ADK](https://github.com/google/adk-js) (Agent Development Kit)
- **Data Store**: [ClickHouse Cloud](https://clickhouse.cloud) accessed exclusively through the official `mcp-clickhouse` MCP server
- **Asset Storage**: [Cloudinary](https://cloudinary.com) for video/image CDN and storage
- **Backend**: Express 5, Node.js 24, TypeScript 5.9
- **Frontend**: React 19, Vite 7, TailwindCSS 4, Recharts
- **Monorepo**: pnpm workspaces

## Agentic Architecture

The analysis pipeline is not a fixed sequence — it's a genuine ADK orchestrating agent that:

1. **Inspects the asset type** (script, image, video) and decides which tools to call
2. **Dynamically selects tools**: `extract_script_entities`, `detect_visual_logos`, `transcribe_and_flag_dialogue`
3. **Self-corrects**: when confidence < 0.6, the agent calls `request_closer_look` for a targeted re-analysis
4. **Reasons over accumulated context**: uses `query_prior_detections` to check what's already been found before finalizing
5. **Stores results via MCP**: all detections are written to ClickHouse through the MCP server

The tool-call sequence visibly differs across different asset types — proof that the agent is deciding, not following a hardcoded script.

## Setup

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# Build and run
pnpm run build
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/rights-clearance-scanner run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLICKHOUSE_HOST` | ClickHouse Cloud hostname |
| `CLICKHOUSE_PORT` | ClickHouse HTTPS port (8443) |
| `CLICKHOUSE_USER` | ClickHouse username |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `CLICKHOUSE_SECURE` | Enable TLS (`true`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `GOOGLE_GENAI_API_KEY` | Google AI Studio API key |
| `PORT` | Server port (default: 8080) |

## Project Structure

```
├── artifacts/
│   ├── api-server/          # Express API server
│   └── rights-clearance-scanner/  # React frontend
├── lib/
│   ├── agent/               # ADK orchestrating agent + tools
│   ├── clickhouse-mcp/      # ClickHouse MCP client wrapper
│   ├── cloudinary/           # Cloudinary upload/fetch wrapper
│   ├── api-spec/            # OpenAPI specification
│   ├── api-zod/             # Generated Zod schemas
│   └── api-client-react/    # Generated React Query hooks
└── Dockerfile
```

## Real-World Problem

Film and TV productions must clear every visible brand, logo, celebrity reference, and copyrighted work before distribution. This scanner automates the detection and risk-scoring of third-party IP across scripts, images, and video — reducing manual review time from days to minutes while flagging the items that genuinely need legal attention.
