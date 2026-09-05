# Rights Clearance Scanner

An AI-assisted production desk that scans scripts and visual assets for potential third-party rights references and compiles a risk-scored clearance report.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/rights-clearance-scanner run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `GEMINI_API_KEY` — Google AI Studio key, stored in Replit Secrets

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/rights-clearance-scanner/src/App.tsx` — clearance workspace and report UI
- `artifacts/rights-clearance-scanner/src/index.css` — visual theme and layout utilities
- `artifacts/api-server/src/routes/clearance.ts` — project, asset, Gemini analysis, and report API
- `lib/api-spec/openapi.yaml` — source of truth for the API contract

## Architecture decisions

- The first pass keeps project state in the API process for a fast hackathon demo; uploaded content is base64-encoded in memory and never sent to the browser after upload.
- Script and visual extraction are separate Gemini prompts, followed by a dedicated risk-scoring Gemini call so evidence and legal-risk reasoning remain distinct.
- Visual detections follow the normalized 0–1000 `box_2d` contract from Gemini; the server converts those coordinates to pixel boxes using the uploaded media dimensions before the report is rendered.
- The frontend uses generated OpenAPI React Query hooks so the UI and API share the same request and response shapes.

## Product

- Create a production review project.
- Add script, image, or video assets.
- Run Gemini extraction and risk scoring.
- Filter and review detections with source references, context, confidence, and rationale.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Test uploads are capped at 18 MB of decoded media; the JSON request envelope is configured to 25 MB because base64 expands the payload.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
