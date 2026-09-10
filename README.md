# RightScan — AI-Powered Rights Clearance Scanner

> Scan scripts, images, and video assets for third-party IP risks in minutes, not days.

RightScan is an agentic AI pipeline for film and TV production teams that automatically detects brand logos, celebrity references, song titles, and copyrighted IP across uploaded production assets, scores each detection by legal risk level, and generates a structured clearance report — all powered by a genuinely orchestrated Google ADK agent.

**Live Demo:** https://rights-clearance-scanner.onrender.com

---

## Table of Contents

- [Why RightScan](#why-rightscan)
- [Architecture Overview](#architecture-overview)
- [Agentic Pipeline](#agentic-pipeline)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Reproducing the Project](#reproducing-the-project)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Set Up External Services](#2-set-up-external-services)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Install Dependencies](#4-install-dependencies)
  - [5. Run in Development Mode](#5-run-in-development-mode)
  - [6. Run in Docker](#6-run-in-docker)
  - [7. Deploy to Render](#7-deploy-to-render)
- [API Reference](#api-reference)
- [Runtime Use of Google Cloud](#runtime-use-of-google-cloud)
- [License](#license)

---

## Why RightScan

Every film and TV production distributed commercially must legally clear every third-party brand, logo, celebrity likeness, song, and existing IP that appears — in dialogue, on screen, or in the background. This review is currently done manually by production lawyers and clearance coordinators, taking days per project and frequently causing post-production delays.

RightScan automates detection and risk-scoring across all asset types, reducing review time from days to minutes and surfacing only the items that genuinely need legal attention.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         React 19 SPA                            │
│  Project Manager │ Asset Uploader │ Terminal Output │ Report PDF │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST API
┌───────────────────────────────▼─────────────────────────────────┐
│                    Express 5 API Server                          │
│  /api/projects  /api/assets  /api/clearance  /api/analytics     │
└──────┬─────────────────────┬───────────────────────┬────────────┘
       │                     │                       │
┌──────▼──────┐  ┌───────────▼────────┐  ┌──────────▼──────────┐
│  Cloudinary │  │  Google ADK Agent  │  │  ClickHouse Cloud   │
│  (Asset CDN)│  │  (LlmAgent +       │  │  (via MCP server)   │
│             │  │   7 FunctionTools) │  │  Detections DB      │
└─────────────┘  └────────────────────┘  └─────────────────────┘
```

---

## Agentic Pipeline

The analysis is orchestrated by a genuine Google ADK `LlmAgent` — not a fixed sequential pipeline. For each uploaded asset, the agent:

1. **Inspects the asset type** (script / image / video / audio) and decides which tools to invoke
2. **Calls specialized tools** based on asset type:
   - `extract_script_entities` — Identifies brands, celebrity names, songs, and IP from script text using Gemini
   - `detect_visual_logos` — Detects visible brand logos and trademarked products in images/video frames with bounding box coordinates, using Gemini multimodal
   - `transcribe_and_flag_dialogue` — Transcribes spoken audio and flags IP mentions using Gemini
3. **Self-corrects via re-examination**: when detection confidence is below 0.6, the agent calls `request_closer_look` for targeted re-analysis of specific areas
4. **Deduplicates using memory**: `query_prior_detections` checks what's already been found across the project before finalizing
5. **Stores findings via MCP**: All detections are written to ClickHouse through the official `mcp-clickhouse` MCP server
6. **Risk-scores each entity**: `score_risk` classifies every detection as `low`, `medium`, or `high` risk with a rationale

The tool-call sequence visibly differs across different asset types, demonstrating genuine agentic decision-making. The full tool call log (with timing) is streamed live to the frontend terminal.

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI Orchestration | [Google ADK](https://github.com/google/adk-js) (`@google/adk`) with `LlmAgent` + `InMemoryRunner` |
| AI Model | Google Gemini via `@google/genai` (`gemini-3.5-flash-lite`) |
| Database | [ClickHouse Cloud](https://clickhouse.cloud) — accessed exclusively via `mcp-clickhouse` MCP server |
| Asset Storage | [Cloudinary](https://cloudinary.com) — video/image CDN, multimodal fetch |
| Backend | Express 5, Node.js 24, TypeScript 5.9, pino logger |
| Frontend | React 19, Vite 7, TailwindCSS 4, Recharts, React Query |
| PDF Export | `@react-pdf/renderer` |
| Monorepo Tooling | pnpm workspaces, esbuild, Vitest |
| Deployment | Docker (multi-stage), Render |

---

## Project Structure

```
Rights-Clearance-Scanner/
├── artifacts/
│   ├── api-server/                  # Express 5 API server
│   │   └── src/
│   │       ├── app.ts               # Express app with static SPA serving
│   │       ├── index.ts             # Server entrypoint
│   │       └── routes/
│   │           ├── clearance.ts     # Asset upload + agent trigger + SSE stream
│   │           ├── analytics.ts     # Risk aggregation & project stats
│   │           ├── auth.ts          # Project authentication
│   │           └── health.ts        # Health check endpoint
│   └── rights-clearance-scanner/   # React 19 SPA (Vite)
│       └── src/
│           ├── pages/               # Home, Workspace, Report
│           ├── components/          # UI components including Terminal, ReportView
│           └── lib/                 # API client, PDF export, auth
├── lib/
│   ├── agent/                       # Google ADK agent + tool implementations
│   │   └── src/
│   │       ├── index.ts             # LlmAgent, InMemoryRunner, analyzeAsset()
│   │       └── tools.ts             # 5 Gemini-powered tool functions
│   ├── clickhouse-mcp/              # MCP client wrapper for ClickHouse
│   │   └── src/
│   │       ├── index.ts             # connect, query, execute, schema init
│   │       └── schema.ts            # ClickHouse DDL (projects, assets, detections)
│   ├── cloudinary/                  # Cloudinary upload + fetch-as-base64
│   ├── api-spec/                    # OpenAPI 3.1 specification (YAML)
│   ├── api-zod/                     # Zod schemas generated from OpenAPI spec
│   └── api-client-react/            # React Query hooks generated from spec
├── scripts/                         # Codegen scripts (Zod, React Query)
├── Dockerfile                       # Multi-stage Docker build
├── .env.example                     # All required environment variable keys
├── pnpm-workspace.yaml              # pnpm workspaces config
└── tsconfig.base.json               # Shared TypeScript config
```

---

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js** v20+ (v24 recommended) — [nodejs.org](https://nodejs.org)
- **pnpm** v10+ — `npm install -g pnpm`
- **Python 3.11+** — needed for the `mcp-clickhouse` MCP server
- **uv** (Python package runner) — [astral.sh/uv](https://astral.sh/uv)
- **Docker** (optional, for containerized deployment)
- **ClickHouse Cloud** account — [clickhouse.cloud](https://clickhouse.cloud) (free tier available)
- **Cloudinary** account — [cloudinary.com](https://cloudinary.com) (free tier available)
- **Google AI Studio** API key — [aistudio.google.com](https://aistudio.google.com) (free tier available)

---

## Reproducing the Project

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Rights-Clearance-Scanner.git
cd Rights-Clearance-Scanner
```

### 2. Set Up External Services

#### ClickHouse Cloud

1. Create a free cluster at [clickhouse.cloud](https://clickhouse.cloud)
2. Note your **hostname**, **default user**, and **password** from the connection details panel
3. The database schema (`projects`, `assets`, `detections` tables) is created automatically on first server start — no manual migration needed

#### Cloudinary

1. Sign up or log in at [cloudinary.com](https://cloudinary.com)
2. From your Dashboard, copy your **Cloud Name**, **API Key**, and **API Secret**

#### Google AI Studio

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API key** → **Create API key**
3. Copy the key — this is your `GOOGLE_GENAI_API_KEY`

#### Install the MCP ClickHouse Server (required for local dev)

The ClickHouse MCP server runs as a subprocess launched by the API server. Install it via `uv`:

```bash
# Install uv (if not already installed)
# macOS/Linux:
curl -Ls https://astral.sh/uv/install.sh | sh

# Windows:
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# Verify uvx is available:
uvx --version
```

> **Windows note:** `uvx` must be accessible in `PATH`. Alternatively, create a Python venv and install directly:
> ```bash
> python -m venv .venv
> .venv\Scripts\activate
> pip install mcp-clickhouse
> ```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

```env
# ClickHouse Cloud
CLICKHOUSE_HOST=your-host.clickhouse.cloud
CLICKHOUSE_PORT=8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your-password
CLICKHOUSE_SECURE=true
CLICKHOUSE_ALLOW_WRITE_ACCESS=true
CLICKHOUSE_ALLOW_DROP=true

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Google AI (Gemini / ADK)
GOOGLE_GENAI_API_KEY=your-gemini-api-key

# Server
PORT=8080
NODE_ENV=development
LOG_LEVEL=info
```

### 4. Install Dependencies

```bash
pnpm install
```

This installs all packages across all workspace projects in one step.

### 5. Run in Development Mode

Open two terminals:

**Terminal 1 — API Server**
```bash
pnpm --filter @workspace/api-server run dev
# Server starts on http://localhost:8080
```

**Terminal 2 — Frontend SPA**
```bash
pnpm --filter @workspace/rights-clearance-scanner run dev
# Vite dev server starts on http://localhost:5173
```

The frontend proxies all `/api/*` requests to the API server automatically. Open [http://localhost:5173](http://localhost:5173) in your browser.

#### Full Production Build (local)

```bash
pnpm run build
node --enable-source-maps ./artifacts/api-server/dist/index.mjs
# Full app (frontend + backend) on http://localhost:8080
```

### 6. Run in Docker

The included `Dockerfile` performs a multi-stage build:

- **Build stage**: compiles TypeScript, runs Vite, bundles the API server with esbuild
- **Runtime stage**: installs Python + `mcp-clickhouse`, copies only production artifacts

```bash
# Build the Docker image
docker build -t rightscan .

# Run the container
docker run -p 8080:8080 \
  -e CLICKHOUSE_HOST=your-host.clickhouse.cloud \
  -e CLICKHOUSE_PORT=8443 \
  -e CLICKHOUSE_USER=default \
  -e CLICKHOUSE_PASSWORD=your-password \
  -e CLICKHOUSE_SECURE=true \
  -e CLICKHOUSE_ALLOW_WRITE_ACCESS=true \
  -e CLICKHOUSE_ALLOW_DROP=true \
  -e CLOUDINARY_CLOUD_NAME=your-cloud-name \
  -e CLOUDINARY_API_KEY=your-api-key \
  -e CLOUDINARY_API_SECRET=your-api-secret \
  -e GOOGLE_GENAI_API_KEY=your-gemini-api-key \
  rightscan
```

Open [http://localhost:8080](http://localhost:8080).

### 7. Deploy to Render

1. Push this repository to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Select **Docker** as the runtime (Render auto-detects the `Dockerfile`)
4. Add all environment variables from your `.env` in the Render dashboard under **Environment**
5. Click **Deploy** — Render will build the multi-stage Docker image and serve the full app

> **Note:** The `mcp-clickhouse` Python package is pre-installed in the Docker runtime stage via `/opt/venv`. On Render, `uvx` is not available, but the Dockerfile handles this by installing `mcp-clickhouse` into a venv and adding it to `PATH`.

---

## API Reference

All endpoints are prefixed with `/api`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server health, model info, MCP connection status |
| `POST` | `/api/projects` | Create a new clearance project |
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/assets/upload` | Upload an asset (multipart form) and trigger agent analysis |
| `GET` | `/api/assets/:projectId` | List all assets for a project |
| `GET` | `/api/clearance/:projectId` | Get all detections for a project |
| `GET` | `/api/clearance/asset/:assetId` | Get detections for a specific asset |
| `GET` | `/api/clearance/stream/:assetId` | SSE stream of live agent tool-call logs |
| `GET` | `/api/analytics/risk-breakdown` | Risk level counts across a project |
| `GET` | `/api/analytics/category-breakdown` | Detection category breakdown |
| `GET` | `/api/analytics/timeline` | Detections over time |

---

## Runtime Use of Google Cloud

This project imports and calls Google Cloud / Google AI services directly in application code — not just listed in dependencies.

### `@google/adk` — Google Agent Development Kit

**File:** [`lib/agent/src/index.ts`](lib/agent/src/index.ts)

```typescript
import { FunctionTool, LlmAgent, InMemoryRunner } from "@google/adk";

// Creates an orchestrating agent with 7 registered FunctionTools
const agent = new LlmAgent({
  name: "rights_clearance_agent",
  model: "gemini-3.5-flash-lite",
  instruction: "...",
  tools,
});

// Runs the agent asynchronously, streaming events
const runner = new InMemoryRunner({ agent, appName: "rights-clearance" });
const events = runner.runAsync({ userId, sessionId, newMessage });
for await (const event of events) { /* process tool call events */ }
```

### `@google/genai` — Google Generative AI SDK

**File:** [`lib/agent/src/tools.ts`](lib/agent/src/tools.ts)

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });

// Multimodal call: image/video frame analysis with bounding boxes
const response = await ai.models.generateContent({
  model: "gemini-3.5-flash-lite",
  contents: [{
    role: "user",
    parts: [
      { text: "Detect visible brand logos..." },
      { inlineData: { mimeType, data: base64 } },
    ],
  }],
  config: { responseMimeType: "application/json" },
});
```

Used for: entity extraction from scripts, visual logo detection with bounding boxes, audio/video transcription, risk scoring, and targeted re-examination of low-confidence detections.

---

## License

[MIT](LICENSE)
