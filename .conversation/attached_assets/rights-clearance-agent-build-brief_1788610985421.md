# Build Brief: AI Rights & Clearance Scanner
### For Agentic Cinema Hackathon (Google Cloud + Replit Track)

Paste this whole document into Replit Agent as your initial build prompt, then work through it phase by phase. It's written so an AI coding agent has everything it needs without you re-explaining context each session.

---

## 1. One-line pitch

**An AI agent that scans a film script and its accompanying video/image assets to detect third-party brands, logos, and trademarks, then scores each one for legal clearance risk — turning a manual, expensive pre-production task into an automated first pass.**

## 2. Why this concept (keep this framing in your submission text)

Rights clearance is a real, unglamorous, expensive bottleneck in production — every visible logo, mentioned brand, or recognizable trademark in a finished film has to be manually reviewed by a clearance specialist or legal team before release, or the studio risks a lawsuit. Nobody in this hackathon is likely to build for this workflow because it isn't "creative" — it's compliance. That's exactly why it scores well on **Potential Impact** and **Quality of Idea**: it shows you understood a real problem in the industry's value chain, not just a demo of what Gemini can do.

## 3. Hard requirements checklist (do not lose points here)

- [ ] Built using **Replit Agent** during development
- [ ] Deployed and hosted on a **replit.app** or **replit.dev** domain (this IS the "Replit track" requirement — non-negotiable)
- [ ] Actually imports and calls one of: `google-adk`, `google-genai`, `google-generativeai`, or `google-cloud-aiplatform` **at runtime** — a library import + real function call in your entry point, not just in `requirements.txt` or the README
- [ ] No non-Google AI models/frameworks/APIs anywhere (no OpenAI, Anthropic, AWS AI, Azure AI, etc.) — you can still use any *non-AI* third-party service (hosting, DB, standard web frameworks) freely
- [ ] Public GitHub/GitLab/Bitbucket repo with an **OSS license file detectable in the repo's About section** (e.g. MIT — add a `LICENSE` file at the repo root; GitHub auto-detects it)
- [ ] Runs on web (simplest platform choice for you)
- [ ] Original work, created entirely during the contest period — don't reuse an old repo/project as a base
- [ ] Submission needs: hosted project URL, text description (features, tech stack, data sources, what you learned), public repo URL, ≤3 min demo video on YouTube/Vimeo, in English

## 4. System architecture

Two independent detection pipelines feeding one shared risk-scoring and reporting layer.

```
                     ┌─────────────────────┐
   Script (.txt/.pdf)│                     │
   ─────────────────▶│  Script Entity      │──┐
                      │  Extraction Agent   │  │
                      └─────────────────────┘  │
                                                ▼
                                        ┌───────────────┐        ┌──────────────────┐
                                        │  Risk Scoring │───────▶│  Report Compiler  │
                                        │  Agent        │        │  Agent            │
                                        └───────────────┘        └──────────────────┘
                                                ▲                         │
                      ┌─────────────────────┐  │                         ▼
   Video/images       │                     │  │                 Clearance Report
   ─────────────────▶ │  Visual Logo/Brand  │──┘                 (JSON + dashboard UI)
                      │  Detection Agent    │
                      └─────────────────────┘
```

- **Script Entity Extraction Agent** — reads script text, pulls out mentions of real brands, products, celebrity/public-figure names, song titles, and existing IP references, with the scene/line reference where each occurs.
- **Visual Logo/Brand Detection Agent** — takes uploaded video clips or images (storyboards, raw footage, mood boards) and identifies visible logos, branded products, or recognizable trademarks using Gemini's multimodal/video understanding, with a timestamp or frame reference.
- **Risk Scoring Agent** — for every detected item, reasons about: prominence (background vs. featured), context (positive/negative/neutral portrayal), and likely need for clearance or replacement — outputs a risk level (Low/Medium/High) with a one-line rationale.
- **Report Compiler Agent** — merges both pipelines' outputs into one structured clearance report the frontend renders as a dashboard.

You can implement this as one Google ADK agent with four **tools** (functions) rather than four separate hosted agents — that's faster to build and still satisfies "multi-agent network or AI agent" from the rules. Don't over-architect this in 5 days; a single orchestrating agent calling well-defined tool functions is the pragmatic choice.

## 5. Tech stack (fits your existing skills, minimizes new tools to learn)

- **Backend:** Python + Flask (you've already deployed Flask ML services before — reuse that muscle memory) or Node/Express if you prefer; either works with Replit
- **AI layer:** Google ADK (`google-adk`) or plain `google-genai` SDK calling Gemini (use a multimodal-capable Gemini model for the video/image pipeline, text-only calls for script parsing)
- **Frontend:** React — reuse patterns from ATSEN (tables, filters, admin-style dashboards map directly onto "list of detections with risk badges")
- **Storage:** simple — local filesystem or Replit's storage for uploaded assets during the hackathon; a lightweight SQLite/Postgres (Replit DB or Neon free tier) for detections if you want persistence between sessions. Don't over-invest in infra — a working demo matters more than production-grade storage.
- **Hosting:** Replit deployment (satisfies the track requirement automatically)

## 6. Data model (minimum viable)

```
Project
  - id, title, created_at

Asset
  - id, project_id, type ("script" | "video" | "image"), filename, uploaded_at

Detection
  - id, asset_id, category ("brand" | "logo" | "celebrity_name" | "song" | "existing_ip")
  - name (e.g. "Coca-Cola", "iPhone")
  - source_ref (scene/line number for script; timestamp/frame for video)
  - context_snippet (the surrounding text or a short visual description)
  - confidence (0-1, from the model)
  - risk_level ("low" | "medium" | "high")
  - rationale (one-line explanation from the Risk Scoring Agent)

Report
  - project_id, generated_at, summary_counts (by risk_level), detections[]
```

## 7. API endpoints (minimum viable)

```
POST   /api/projects                 create a new project
POST   /api/projects/:id/assets      upload a script file or video/image
POST   /api/projects/:id/analyze     trigger the agent pipeline on all uploaded assets
GET    /api/projects/:id/report      return the compiled clearance report
```

## 8. Step-by-step build order (fits a 5-day sprint)

**Phase 1 — Skeleton (Day 1)**
1. Scaffold the Replit project (Flask/Express + React) using Replit Agent.
2. Wire up the Gemini API key as a Replit secret.
3. Get a bare end-to-end path working: upload a plain-text script → send it to Gemini via `google-genai` → print raw output. Confirm the SDK call actually executes (this is your non-negotiable requirement).

**Phase 2 — Script pipeline (Day 2)**
4. Build the Script Entity Extraction Agent: prompt Gemini to return structured JSON (brand/celebrity/song/IP mentions + scene reference), not prose. Use a strict JSON schema in the prompt and validate/parse the response.
5. Build the Risk Scoring Agent as a second Gemini call (or a second tool in the same agent) that takes each extracted entity + its context and returns a risk level + rationale.

**Phase 3 — Visual pipeline (Day 3, morning)**
6. Add image/video upload. Start with **images/storyboards** first (simpler, cheaper, faster to demo) — send directly to Gemini's multimodal endpoint asking it to identify visible logos/brands in the frame.
7. If time allows, extend to short video clips using Gemini's native video understanding (pass the video directly rather than building a custom frame-extraction pipeline — it's faster to implement and the resources guide confirms Gemini handles this natively).

**Phase 3 — Frontend + report (Day 3, afternoon – Day 4)**
8. Build the dashboard: a table of detections with filterable risk-level badges (color-coded: green/yellow/red), source reference, and rationale. This is where "Design" points come from — make it look like a real production tool, not a JSON viewer.
9. Add a "generate report" view that summarizes counts by risk level and lists high-risk items first.

**Phase 4 — Polish, deploy, document (Day 4 – Day 5 morning)**
10. Deploy on Replit (replit.app URL).
11. Add the `LICENSE` file (MIT is simplest) at the repo root and push to a public GitHub repo.
12. Write the submission text description: problem, features, tech stack used, data sources, what you learned building it.
13. Double-check: is `google-genai`/`google-adk` genuinely imported and called somewhere that runs when the app is used? (Judges check this.)

**Phase 5 — Demo video (Day 5)**
14. Record a ≤3 min walkthrough: upload a sample script + a couple of test images with visible logos → show the pipeline run → show the risk-scored report. Narrate the real-world problem in the first 15 seconds so judges immediately understand the "why."
15. Upload to YouTube/Vimeo as public, submit early.

## 9. Test data to prepare in advance

- A short (1-3 page) sample script you write yourself, deliberately including a few obvious brand mentions ("she pulls out her iPhone", "grabs a can of Coke") — original text, avoids any copyright issue with using a real produced screenplay.
- 3-5 sample images/storyboard frames with visible logos (use openly licensed/stock images, or generate simple mockups — don't scrape copyrighted movie stills for your demo, since your submission itself must not contain third-party IP).

## 10. Things to explicitly avoid given the time budget

- Don't build user auth/multi-tenancy — a single demo project is fine.
- Don't try to support arbitrary long feature-length scripts or full movies — a scene/short-clip scope is enough to prove the concept.
- Don't build a custom video-frame-extraction + object-detection pipeline from scratch — use Gemini's native multimodal video input.
- Don't split this into 4 separately deployed microservices — one backend app with clearly separated agent/tool functions is easier to debug and demo under time pressure.
