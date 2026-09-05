import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import {
  AnalyzeProjectParams,
  AnalyzeProjectResponse,
  CreateProjectBody,
  CreateProjectResponse,
  GetProjectReportParams,
  GetProjectReportResponse,
  ListProjectsResponse,
  UploadAssetBody,
  UploadAssetParams,
  UploadAssetResponse,
} from "@workspace/api-zod";

type AssetType = "script" | "image" | "video";
type RiskLevel = "low" | "medium" | "high";
type Category = "brand" | "logo" | "celebrity_name" | "song" | "existing_ip";

type StoredAsset = {
  id: string;
  projectId: string;
  filename: string;
  type: AssetType;
  mimeType: string;
  uploadedAt: string;
  sizeBytes: number;
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
};

type StoredReport = {
  projectId: string;
  generatedAt: string;
  summary: string;
  counts: { low: number; medium: number; high: number };
  detections: StoredDetection[];
  analyzedAssets: number;
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
      model: "gemini-2.5-flash",
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
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a visual rights-clearance detection agent. Inspect this ${asset.type} and identify visible logos, branded products, trademarks, celebrity likenesses, or recognizable existing IP. Ignore unbranded objects. ${schema}`,
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
): Promise<Array<{ riskLevel: RiskLevel; rationale: string }>> {
  if (detections.length === 0) return [];
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are the risk scoring agent for a film rights-clearance workflow. For each extracted entity, assess prominence, context, and likely need for legal clearance or replacement. Return only a JSON array in the same order. Each item must have riskLevel (low, medium, or high) and rationale (one concise sentence). Be practical and cautious, not definitive legal advice.\n\nEXTRACTED ENTITIES:\n${JSON.stringify(detections)}`,
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });
  return parseJson<Array<{ riskLevel: RiskLevel; rationale: string }>>(
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
    contentBase64: parsed.data.contentBase64,
  };
  project.assets.push(asset);
  res.status(201).json(
    UploadAssetResponse.parse({
      id: asset.id,
      projectId: asset.projectId,
      filename: asset.filename,
      type: asset.type,
      mimeType: asset.mimeType,
      uploadedAt: asset.uploadedAt,
      sizeBytes: asset.sizeBytes,
    }),
  );
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
    const scores = await scoreDetections(allItems);
    const detections: StoredDetection[] = allItems.map((item, index) => ({
      id: randomUUID(),
      assetId: String(item.assetId),
      category: (item.category as Category) ?? "brand",
      name: String(item.name ?? "Unidentified entity"),
      sourceRef: String(item.sourceRef ?? "Unspecified reference"),
      contextSnippet: String(item.contextSnippet ?? "No additional context provided."),
      confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.5))),
      riskLevel: scores[index]?.riskLevel ?? "medium",
      rationale:
        scores[index]?.rationale ??
        "Review this reference with a clearance specialist before release.",
    }));
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
    };
    res.json(AnalyzeProjectResponse.parse(project.report));
  } catch (error) {
    req.log.error({ err: error }, "Gemini analysis failed");
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