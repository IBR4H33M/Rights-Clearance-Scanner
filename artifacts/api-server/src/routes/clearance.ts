import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import {
  AnalyzeProjectParams,
  AnalyzeProjectResponse,
  CreateProjectBody,
  CreateProjectResponse,
  DeleteAssetParams,
  GetProjectReportParams,
  GetProjectReportResponse,
  ListProjectsResponse,
  UploadAssetBody,
  UploadAssetParams,
  UploadAssetResponse,
} from "@workspace/api-zod";

const GEMINI_MODEL = "gemini-3.5-flash-lite";

type AssetType = "script" | "image" | "video";
type RiskLevel = "low" | "medium" | "high";
type Category = "brand" | "logo" | "celebrity_name" | "song" | "existing_ip";
type Prominence = "background" | "moderate" | "featured";
type Duration = "brief" | "sustained" | "recurring";
type Sentiment = "positive" | "neutral" | "negative";
type NarrativeRole = "incidental" | "referenced_in_dialogue";

type StoredAsset = {
  id: string;
  projectId: string;
  filename: string;
  type: AssetType;
  mimeType: string;
  uploadedAt: string;
  sizeBytes: number;
  width: number;
  height: number;
  contentBase64: string;
};

type StoredDetection = {
  id: string;
  assetId: string;
  category: Category;
  name: string;
  sourceRef: string;
  contextSnippet: string;
  confidence: number;
  riskLevel: RiskLevel;
  rationale: string;
  boundingBox: { left: number; top: number; right: number; bottom: number } | null;
  frameReference: string | null;
  prominence: Prominence | null;
  duration: Duration | null;
  sentiment: Sentiment | null;
  narrativeRole: NarrativeRole | null;
  visualEvidence: string | null;
};

type StoredPreview = {
  assetId: string;
  filename: string;
  type: "image" | "video";
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
};

type StoredReport = {
  projectId: string;
  generatedAt: string;
  summary: string;
  counts: { low: number; medium: number; high: number };
  detections: StoredDetection[];
  analyzedAssets: number;
  previews: StoredPreview[];
};

type StoredProject = {
  id: string;
  title: string;
  createdAt: string;
  assets: StoredAsset[];
  report?: StoredReport;
};

type ExtractedItem = Record<string, unknown> & { assetId: string };

const projects = new Map<string, StoredProject>();
const router: IRouter = Router();

function projectResponse(project: StoredProject) {
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    assetCount: project.assets.length,
    detectionCount: project.report?.detections.length ?? 0,
    reportStatus: project.report ? "ready" : "not_started",
    assets: project.assets.map(assetResponse),
  };
}

function assetResponse(asset: StoredAsset) {
  return {
    id: asset.id,
    projectId: asset.projectId,
    filename: asset.filename,
    type: asset.type,
    mimeType: asset.mimeType,
    uploadedAt: asset.uploadedAt,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    previewDataUrl:
      asset.type === "image" || asset.type === "video"
        ? `data:${asset.mimeType};base64,${asset.contentBase64}`
        : null,
  };
}

function parseJson<T>(text: string, fallback: T): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function toPixelBox(
  value: unknown,
  width: number,
  height: number,
): StoredDetection["boundingBox"] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const [ymin, xmin, ymax, xmax] = value.map(Number);
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return null;
  const y1 = Math.min(clamp(ymin), clamp(ymax));
  const x1 = Math.min(clamp(xmin), clamp(xmax));
  const y2 = Math.max(clamp(ymin), clamp(ymax));
  const x2 = Math.max(clamp(xmin), clamp(xmax));
  return {
    left: Math.min(width, (x1 / 1000) * width),
    top: Math.min(height, (y1 / 1000) * height),
    right: Math.min(width, (x2 / 1000) * width),
    bottom: Math.min(height, (y2 / 1000) * height),
  };
}

function getProjectId(req: { params: Record<string, string | string[]> }) {
  const value = req.params.projectId;
  return Array.isArray(value) ? value[0] : value;
}

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({ apiKey });
}

async function extractFromAsset(asset: StoredAsset) {
  const ai = getAiClient();
  const schema = `Return only a JSON array. Each item must have:
category: one of brand, logo, celebrity_name, song, existing_ip
name: the specific entity name
sourceRef: scene/line reference for scripts, or frame/timestamp reference for visuals
contextSnippet: short surrounding text or visual description
confidence: number from 0 to 1`;

  if (asset.type === "script") {
    const script = Buffer.from(asset.contentBase64, "base64").toString("utf8");
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a script rights-clearance extraction agent. Identify real brands, products, celebrity or public-figure names, song titles, and existing intellectual property references. Do not flag fictional names or generic nouns. ${schema}\n\nSCRIPT FILE: ${asset.filename}\n${script.slice(0, 120000)}`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });
    return parseJson<Array<Record<string, unknown>>>(response.text ?? "[]", []);
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a visual rights-clearance detection agent. Inspect this ${asset.type} and identify visible third-party brand names, logos, and trademarked products. For videos, report each distinct reference only at the first sequence where it appears so repeated frames do not create duplicate detections. Ignore unbranded objects.\n\nReturn bounding boxes as a JSON array. Never return markdown code fencing.\nEach object must have this exact shape:\n{\n  "box_2d": [ymin, xmin, ymax, xmax],\n  "label": "brand or logo name",\n  "confidence": 0.0-1.0,\n  "prominence": "background" | "featured"\n}\nCoordinates must be integers in the range 0-1000, representing the position on a normalized 1000x1000 version of the image. Limit to 25 objects. If an object appears multiple times, disambiguate labels (for example, "Nike logo - shirt" vs "Nike logo - shoe").`,
          },
          {
            inlineData: {
              mimeType: asset.mimeType,
              data: asset.contentBase64,
            },
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });
  return parseJson<Array<Record<string, unknown>>>(response.text ?? "[]", []);
}

async function scoreDetections(
  detections: Array<Record<string, unknown>>,
  assets: StoredAsset[],
): Promise<
  Array<{
    include?: boolean;
    risk_level?: RiskLevel;
    prominence?: Prominence;
    duration?: Duration;
    sentiment?: Sentiment;
    narrative_role?: NarrativeRole;
    visual_evidence?: string;
    rationale?: string;
  }>
> {
  if (detections.length === 0) return [];
  const ai = getAiClient();
  const visualAssets = assets.filter(
    (asset) => asset.type === "image" || asset.type === "video",
  );
  const scoringInstructions = `You are a human-review triage aid for a film rights-clearance workflow, not a lawyer and not a final legal determination. For each detected entity, return one assessment in the same order as the input. Return only a JSON array with this exact shape:
{
  "include": true,
  "risk_level": "low" | "medium" | "high",
  "prominence": "background" | "moderate" | "featured",
  "duration": "brief" | "sustained" | "recurring",
  "sentiment": "positive" | "neutral" | "negative",
  "narrative_role": "incidental" | "referenced_in_dialogue",
  "visual_evidence": "one sentence describing only the legible text/logo shape and where it appears in the supplied visual evidence",
  "rationale": "one sentence beginning with 'Flagged for review because...' and citing the factors that drove the score"
}

For visual detections, set include to false when the candidate is only generic descriptive text, a scale ratio, material/size/weight specification, licensing or certification disclaimer text, a model/part/serial/reference code, an item's own generic title/model line, or an inferred component brand that is not visibly rendered and legible in the supplied image. Do not infer brands from similar products or general knowledge. If uncertain whether it is a genuine third-party trademark, exclude it. For included visual detections, visually confirm the brand name or logo is legible in the supplied image pixels. visual_evidence must describe exactly what readable brand text, wordmark, logo shape, and location are visible; never claim evidence that is not in the supplied visual evidence. For script-only detections, use an empty string for visual_evidence and use the supplied dialogue/context to assess the other fields.

Assign risk_level using this exact precedence:
- HIGH when prominence is featured and duration is sustained or recurring, OR sentiment is negative, OR narrative_role is referenced_in_dialogue.
- MEDIUM when prominence is moderate, sentiment is neutral, and narrative_role is incidental.
- LOW when prominence is background, duration is brief, sentiment is neutral or positive, and narrative_role is incidental.
- If more than one rule applies, use HIGH over MEDIUM over LOW. If no rule matches, use MEDIUM as the conservative triage fallback.
The rationale is a routing aid: say "flagged for review because..." rather than saying the item requires clearance.

EXTRACTED ENTITIES:
${JSON.stringify(detections)}`;
  const scoringParts = [
    { text: scoringInstructions },
    ...visualAssets.map((asset) => ({
      inlineData: {
        mimeType: asset.mimeType,
        data: asset.contentBase64,
      },
    })),
  ];
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: scoringParts,
      },
    ],
    config: { responseMimeType: "application/json" },
  });
  return parseJson<
    Array<{
      include?: boolean;
      risk_level?: RiskLevel;
      prominence?: Prominence;
      duration?: Duration;
      sentiment?: Sentiment;
      narrative_role?: NarrativeRole;
      visual_evidence?: string;
      rationale?: string;
    }>
  >(
    response.text ?? "[]",
    [],
  );
}

router.get("/projects", (_req, res) => {
  const result = ListProjectsResponse.parse(
    Array.from(projects.values()).map(projectResponse),
  );
  res.json(result);
});

router.post("/projects", (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const project: StoredProject = {
    id: randomUUID(),
    title: parsed.data.title.trim(),
    createdAt: new Date().toISOString(),
    assets: [],
  };
  projects.set(project.id, project);
  res.status(201).json(CreateProjectResponse.parse(projectResponse(project)));
});

router.post("/projects/:projectId/assets", (req, res) => {
  const params = UploadAssetParams.safeParse(req.params);
  const parsed = UploadAssetBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid asset upload" });
    return;
  }
  const project = projects.get(params.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const asset: StoredAsset = {
    id: randomUUID(),
    projectId: project.id,
    filename: parsed.data.filename,
    type: parsed.data.type as AssetType,
    mimeType: parsed.data.mimeType,
    uploadedAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(parsed.data.contentBase64, "base64"),
    width: parsed.data.width ?? 0,
    height: parsed.data.height ?? 0,
    contentBase64: parsed.data.contentBase64,
  };
  if (asset.sizeBytes > 18_000_000) {
    res.status(413).json({ error: "Keep test uploads under 18 MB." });
    return;
  }
  project.assets.push(asset);
  res.status(201).json(
    UploadAssetResponse.parse({
      ...assetResponse(asset),
    }),
  );
});

router.delete("/projects/:projectId/assets/:assetId", (req, res): void => {
  const params = DeleteAssetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = projects.get(params.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const assetIndex = project.assets.findIndex((asset) => asset.id === params.data.assetId);
  if (assetIndex === -1) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  project.assets.splice(assetIndex, 1);
  delete project.report;
  res.status(204).send();
});

router.post("/projects/:projectId/analyze", async (req, res): Promise<void> => {
  const params = AnalyzeProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = projects.get(params.data.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (project.assets.length === 0) {
    res.status(400).json({ error: "Add at least one asset before analyzing" });
    return;
  }

  try {
    const extracted: Array<{ asset: StoredAsset; items: Array<Record<string, unknown>> }> =
      [];
    for (const asset of project.assets) {
      extracted.push({ asset, items: await extractFromAsset(asset) });
    }
    const allItems: ExtractedItem[] = extracted.flatMap(({ asset, items }) =>
      items.map((item) => ({ ...item, assetId: asset.id })),
    );
    const scores = await scoreDetections(allItems, project.assets);
    const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
    const detections: StoredDetection[] = allItems.flatMap((item, index) => {
      const score = scores[index];
      if (score?.include === false) return [];
      const asset = assetsById.get(item.assetId);
      const isVisual = asset?.type === "image" || asset?.type === "video";
      const label = isVisual ? item.label : item.name;
      const category = isVisual
        ? String(label ?? "").toLowerCase().includes("logo")
          ? "logo"
          : "brand"
        : item.category;
      return [{
        id: randomUUID(),
        assetId: String(item.assetId),
        category: (category as Category) ?? "brand",
        name: String(label ?? "Unidentified entity"),
        sourceRef: isVisual
          ? asset?.type === "video"
            ? "First detected sequence"
            : "Visible in image"
          : String(item.sourceRef ?? "Unspecified reference"),
        contextSnippet: isVisual
          ? String(item.contextSnippet ?? `${String(label ?? "Reference")} appears in the supplied visual evidence.`)
          : String(item.contextSnippet ?? "No additional context provided."),
        confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.5))),
        riskLevel: score?.risk_level ?? "medium",
        rationale:
          score?.rationale ??
          "Flagged for review because the available assessment evidence is incomplete.",
        boundingBox: isVisual
          ? toPixelBox(item.box_2d, asset?.width ?? 0, asset?.height ?? 0)
          : null,
        frameReference:
          asset?.type === "video"
            ? "First sequence where this reference appears"
            : null,
        prominence: score?.prominence ?? (isVisual ? "featured" : null),
        duration: score?.duration ?? null,
        sentiment: score?.sentiment ?? null,
        narrativeRole: score?.narrative_role ?? null,
        visualEvidence:
          score?.visual_evidence ??
          (isVisual ? String(item.visual_evidence ?? item.contextSnippet ?? "") : null),
      }];
    });
    const counts = detections.reduce(
      (acc, detection) => {
        acc[detection.riskLevel] += 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0 },
    );
    project.report = {
      projectId: project.id,
      generatedAt: new Date().toISOString(),
      summary:
        detections.length > 0
          ? `${detections.length} potential rights references found across ${project.assets.length} asset${project.assets.length === 1 ? "" : "s"}.`
          : `No obvious third-party references found across ${project.assets.length} asset${project.assets.length === 1 ? "" : "s"}.`,
      counts,
      detections,
      analyzedAssets: project.assets.length,
      previews: project.assets
        .filter(
          (asset): asset is StoredAsset & { type: "image" | "video" } =>
            asset.type === "image" || asset.type === "video",
        )
        .map((asset) => ({
          assetId: asset.id,
          filename: asset.filename,
          type: asset.type,
          mimeType: asset.mimeType,
          dataUrl: `data:${asset.mimeType};base64,${asset.contentBase64}`,
          width: asset.width,
          height: asset.height,
        })),
    };
    res.json(AnalyzeProjectResponse.parse(project.report));
  } catch (error) {
    req.log.error({ err: error }, "Gemini analysis failed");
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
      res.status(429).json({
        error:
          "Gemini request quota is exhausted for this API key. Wait for the quota reset or check Google AI Studio billing and limits, then retry.",
      });
      return;
    }
    res.status(500).json({
      error: "Gemini analysis failed. Check GEMINI_API_KEY and try again.",
    });
  }
});

router.get("/projects/:projectId/report", (req, res) => {
  const params = GetProjectReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = projects.get(params.data.projectId);
  if (!project?.report) {
    res.status(404).json({ error: "No report has been generated yet" });
    return;
  }
  res.json(GetProjectReportResponse.parse(project.report));
});

export default router;