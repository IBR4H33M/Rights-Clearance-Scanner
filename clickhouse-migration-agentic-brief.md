# Build Brief: Migrate off Replit, Add ClickHouse + Cloudinary, Make It Genuinely Agentic

Paste this to your coding agent in Antigravity as one prompt. Work through it in the numbered order — each phase should be verified working before moving to the next, given the time remaining.

---

## Context

This project is switching from the Replit hackathon track to the ClickHouse track. That means:
- Remove all Replit-specific dependencies and config (they are no longer required or wanted)
- ClickHouse becomes the project's core data store (not just an add-on) — this simplifies the migration and strengthens compliance with the ClickHouse track's runtime-usage requirement
- Cloudinary becomes the storage layer for uploaded video/image assets
- The Gemini API key stays the same (same Google AI Studio key as before) — only the surrounding infrastructure changes
- The agent pipeline itself needs a real architectural upgrade — see Phase 4, this is the most important functional change, not just a compliance formality

---

## Phase 1: Remove Replit-specific code and config

1. Delete `.replit` and `replit.nix` (or equivalent Replit config files) if present.
2. Remove any Replit Auth integration code (login/session handling tied to Replit's identity provider). **Recommendation given the time remaining: don't replace it with a new auth system — run the demo as a single-tenant app with no login at all.** Auth doesn't affect any judging criterion here and adds risk of new bugs this close to the deadline. If a login screen is already partially built and easy to just leave disabled/bypassed, that's fine too — don't spend time actively tearing out UI that isn't blocking anything.
3. Remove any reference to Replit's built-in Postgres (`DATABASE_URL` pointing at Replit's managed DB, Drizzle config tied to it, etc.) — this is being replaced entirely by ClickHouse in Phase 2, not swapped for a different Postgres provider.
4. Remove any Replit-specific environment variable assumptions (e.g., `REPL_ID`, `REPLIT_DB_URL`) from the codebase.
5. Add a standard `Dockerfile` (or a simple `Procfile` if targeting a platform that uses one) so the app can be deployed to any standard host — do not assume any particular hosting platform in the code itself.

## Phase 2: ClickHouse as the core data store

Replace the previous database layer entirely with ClickHouse. Use the official `mcp-clickhouse` MCP server as the access path for all reads and writes — this is a hard requirement for the hackathon track, so route actual queries through the MCP server rather than a direct ClickHouse client library call.

**Schema (create these tables in ClickHouse):**

```sql
CREATE TABLE projects (
    id String,
    title String,
    created_at DateTime
) ENGINE = MergeTree ORDER BY (id);

CREATE TABLE assets (
    id String,
    project_id String,
    type String,          -- "script" | "video" | "image"
    cloudinary_url String,
    filename String,
    uploaded_at DateTime
) ENGINE = MergeTree ORDER BY (project_id, id);

CREATE TABLE detections (
    id String,
    asset_id String,
    project_id String,
    category String,      -- "brand" | "logo" | "celebrity_name" | "song" | "existing_ip"
    name String,
    source_type String,   -- "script" | "visual" | "audio"
    source_ref String,    -- scene/line number, or timestamp
    context_snippet String,
    confidence Float32,
    risk_level String,    -- "low" | "medium" | "high"
    rationale String,
    bounding_box String,  -- JSON string: {left, top, right, bottom} or empty
    detected_at DateTime
) ENGINE = MergeTree ORDER BY (project_id, asset_id, id);
```

**Environment variables needed:**
```
CLICKHOUSE_HOST=<from ClickHouse Cloud console>
CLICKHOUSE_PORT=8443
CLICKHOUSE_USER=<from console>
CLICKHOUSE_PASSWORD=<from console>
CLICKHOUSE_SECURE=true
```

**Implementation:**
- Set up the `mcp-clickhouse` server as a tool source the backend calls (run it as a subprocess/service the app connects to, or integrate via the ADK's MCP tool-loading pattern if using Python ADK).
- All inserts (new project, new asset, new detection) and all reads (fetching a project's report, running analytics queries) must go through this MCP server, not a separate raw ClickHouse client — the hackathon rules specifically check that the MCP server is what's actually used at runtime.
- Add a simple analytics query as a second feature, since ClickHouse is built for this: "top 10 most-flagged brand names across all projects" and "risk-level distribution across all detections" — expose this as a small `/analytics` view.

## Phase 3: Cloudinary for asset storage

Replace any local/temporary file storage for uploaded videos and images with Cloudinary.

**Environment variables needed:**
```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

**Implementation:**
- On upload, send the file to Cloudinary (server-side upload using the Cloudinary SDK, or a signed upload from the frontend) and store the returned `secure_url` in the `assets.cloudinary_url` field in ClickHouse.
- When the analysis pipeline needs to process a video/image, fetch the bytes from the Cloudinary URL server-side, then pass them to Gemini (either inline as bytes if small enough, or via Gemini's File API if the video is large — check current size limits before assuming inline works for every file).
- Cloudinary's free tier is generous enough for a hackathon demo; no special configuration needed beyond an account and API keys.

This is a reasonable, low-risk choice — it's a pure storage/CDN layer with no AI involved, so it doesn't touch the "Google AI tools only" restriction at all, and it removes file-storage complexity from your own backend entirely.

## Phase 4: Make the pipeline genuinely agentic (the most important change)

**Current problem:** the pipeline is a fixed sequence — script extraction, then visual detection, then risk scoring, always in that order, hardcoded in application code. This is a pipeline, not an agent, and will read as weak on the "Technological Implementation" criterion specifically because of how central "agentic" framing is to this hackathon.

**Required architecture:**

Build one orchestrating agent (using Google ADK) with access to these tools:
- `extract_script_entities(script_text)` — returns brand/celebrity/song/IP mentions with scene references
- `detect_visual_logos(image_or_frame)` — returns logos/brands with bounding boxes and confidence
- `transcribe_and_flag_dialogue(video_or_audio)` — returns spoken brand mentions with timestamps and sentiment
- `score_risk(entity, context)` — returns risk_level and rationale for one detected entity
- `request_closer_look(asset_reference, area_of_interest)` — re-runs a more targeted detection pass on a specific region/moment when confidence is low; this is what enables self-correction
- `store_detection(...)` — writes a finalized detection to ClickHouse via the MCP server
- `query_prior_detections(project_id)` — lets the agent check what's already been found in this project before finalizing, so it can reason over the full picture rather than each detection in isolation

**The agent must decide, not the application code:**
- Give the orchestrating agent a single instruction like: *"You are reviewing this uploaded asset for rights-clearance risk. Use the available tools to identify all third-party brands, logos, and IP references, assess risk for each, and store your findings. Decide which tools are relevant based on what kind of asset this is — a script needs different tools than a video."*
- The agent should inspect the asset type/content itself and choose which extraction tools to call, not receive a hardcoded `if type == "video"` branch from your code.
- After receiving a risk score, if `confidence < 0.6` (or similar threshold you can tune), the agent should be prompted to consider calling `request_closer_look` before finalizing — this needs to be a genuine option in its tool-calling loop, not a fixed retry loop your code runs unconditionally.
- Maintain conversation/session state across the tool calls for one asset's full analysis (ADK sessions/context), so the agent's later tool calls (like risk scoring) can reference what it already found from earlier tool calls (like extraction) — this is what "state/memory across steps" means in practice; it should be reasoning over accumulated context, not receiving each result as an isolated, disconnected input.

**How to verify this is actually agentic and not just relabeled:** log every tool call the agent makes during a test run. If the exact same sequence of tool calls happens every single time regardless of input, something is still hardcoded — a genuinely agentic version should call different tools, in different orders, or trigger `request_closer_look` sometimes and not others, depending on what's actually in the asset being analyzed.

## Phase 5: Verification checklist before recording the demo

- [ ] `.replit`, `replit.nix`, and all Replit-specific code paths are gone
- [ ] `google-genai`/`google-adk` is imported and genuinely called at runtime (not just present in dependencies)
- [ ] The `mcp-clickhouse` server is genuinely in the runtime path for both writes and reads — confirm by checking logs during a test run, not just that the server is configured
- [ ] Cloudinary upload → stored URL → fetched-and-analyzed round trip works end to end for at least one video and one image
- [ ] The orchestrating agent's tool-call sequence visibly differs across different test assets (proof it's deciding, not following a fixed script)
- [ ] Repo is public, has a LICENSE file detectable in the About section
- [ ] App runs on web and is deployed somewhere reachable by a public URL (platform no longer restricted to Replit)
- [ ] Submission text description mentions: the tech stack (Gemini/ADK, ClickHouse, Cloudinary), the agentic architecture specifically (dynamic tool selection + self-correction), and the real-world clearance problem it addresses
