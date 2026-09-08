import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  AnalyzeProjectParams,
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
import {
  queryClickHouse,
  executeClickHouse,
} from "@workspace/clickhouse-mcp";
import {
  uploadAsset as cloudinaryUpload,
  deleteAsset as cloudinaryDelete,
  fetchAssetBuffer,
} from "@workspace/cloudinary-storage";
import { analyzeAsset, type ToolCallLog } from "@workspace/agent";

const router: IRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ─── GET /projects ──────────────────────────────────────────────────────────

router.get("/projects", async (_req, res) => {
  try {
    const { rows } = await queryClickHouse(
      `SELECT id, title, created_at FROM projects ORDER BY created_at DESC`
    );

    const projectsWithAssets = await Promise.all(
      rows.map(async (row) => {
        const projectId = String(row.id);
        const { rows: assetRows } = await queryClickHouse(
          `SELECT id, project_id, type, cloudinary_url, filename, mime_type, width, height, size_bytes, uploaded_at FROM assets WHERE project_id = '${escapeStr(projectId)}'`
        );
        const { rows: detectionRows } = await queryClickHouse(
          `SELECT count() as cnt FROM detections WHERE project_id = '${escapeStr(projectId)}'`
        );
        const detectionCount = Number(detectionRows[0]?.cnt ?? 0);

        return {
          id: projectId,
          title: String(row.title),
          createdAt: String(row.created_at),
          assetCount: assetRows.length,
          detectionCount,
          reportStatus: detectionCount > 0 ? "ready" : "not_started",
          assets: assetRows.map((a) => ({
            id: String(a.id),
            projectId: String(a.project_id),
            filename: String(a.filename),
            type: String(a.type),
            mimeType: String(a.mime_type),
            uploadedAt: String(a.uploaded_at),
            sizeBytes: Number(a.size_bytes ?? 0),
            width: Number(a.width ?? 0),
            height: Number(a.height ?? 0),
            previewDataUrl: a.cloudinary_url ? String(a.cloudinary_url) : null,
          })),
        };
      })
    );

    const result = ListProjectsResponse.parse(projectsWithAssets);
    res.json(result);
  } catch (err) {
    console.error("Error listing projects:", err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// ─── POST /projects ─────────────────────────────────────────────────────────

router.post("/projects", async (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const id = randomUUID();
  const title = parsed.data.title.trim();
  const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

  try {
    await executeClickHouse(
      `INSERT INTO projects (id, title, created_at) VALUES ('${escapeStr(id)}', '${escapeStr(title)}', '${now}')`
    );

    res.status(201).json(
      CreateProjectResponse.parse({
        id,
        title,
        createdAt: now,
        assetCount: 0,
        detectionCount: 0,
        reportStatus: "not_started",
        assets: [],
      })
    );
  } catch (err) {
    console.error("Error creating project:", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// ─── POST /projects/:projectId/assets ───────────────────────────────────────

router.post("/projects/:projectId/assets", async (req, res): Promise<void> => {
  const params = UploadAssetParams.safeParse(req.params);
  const parsed = UploadAssetBody.safeParse(req.body);

  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid asset upload" });
    return;
  }

  const projectId = params.data.projectId;

  // Check project exists
  const { rows: projectRows } = await queryClickHouse(
    `SELECT id FROM projects WHERE id = '${escapeStr(projectId)}'`
  );
  if (projectRows.length === 0) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  try {
    const assetType = parsed.data.type as string;
    let cloudinaryUrl = "";
    let width = parsed.data.width ?? 0;
    let height = parsed.data.height ?? 0;
    let sizeBytes = 0;

    // Upload to Cloudinary
    const resourceType =
      assetType === "video" ? "video" : assetType === "image" ? "image" : "raw";

    const uploadResult = await cloudinaryUpload(parsed.data.contentBase64, {
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      folder: `rights-clearance/${projectId}`,
      resourceType,
    });

    cloudinaryUrl = uploadResult.secureUrl;
    if (uploadResult.width) width = uploadResult.width;
    if (uploadResult.height) height = uploadResult.height;
    sizeBytes = uploadResult.bytes;

    const assetId = randomUUID();
    const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    await executeClickHouse(
      `INSERT INTO assets (id, project_id, type, cloudinary_url, filename, mime_type, width, height, size_bytes, uploaded_at)
       VALUES ('${escapeStr(assetId)}', '${escapeStr(projectId)}', '${escapeStr(assetType)}', '${escapeStr(cloudinaryUrl)}', '${escapeStr(parsed.data.filename)}', '${escapeStr(parsed.data.mimeType)}', ${width}, ${height}, ${sizeBytes}, '${now}')`
    );

    res.status(201).json(
      UploadAssetResponse.parse({
        id: assetId,
        projectId,
        filename: parsed.data.filename,
        type: assetType,
        mimeType: parsed.data.mimeType,
        uploadedAt: now,
        sizeBytes,
        width,
        height,
        previewDataUrl: cloudinaryUrl,
      })
    );
  } catch (err) {
    console.error("Error uploading asset:", err);
    res.status(500).json({ error: "Failed to upload asset" });
  }
});

// ─── DELETE /projects/:projectId/assets/:assetId ────────────────────────────

router.delete(
  "/projects/:projectId/assets/:assetId",
  async (req, res): Promise<void> => {
    const params = DeleteAssetParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    try {
      // Get the asset's cloudinary info before deleting
      const { rows } = await queryClickHouse(
        `SELECT cloudinary_url, type FROM assets WHERE id = '${escapeStr(params.data.assetId)}' AND project_id = '${escapeStr(params.data.projectId)}'`
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      // Delete from ClickHouse (assets + related detections)
      await executeClickHouse(
        `ALTER TABLE detections DELETE WHERE asset_id = '${escapeStr(params.data.assetId)}'`
      );
      await executeClickHouse(
        `ALTER TABLE assets DELETE WHERE id = '${escapeStr(params.data.assetId)}'`
      );

      res.status(204).send();
    } catch (err) {
      console.error("Error deleting asset:", err);
      res.status(500).json({ error: "Failed to delete asset" });
    }
  }
);

// ─── POST /projects/:projectId/analyze ──────────────────────────────────────

router.post(
  "/projects/:projectId/analyze",
  async (req, res): Promise<void> => {
    const params = AnalyzeProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const projectId = params.data.projectId;

    const { rows: projectRows } = await queryClickHouse(
      `SELECT id FROM projects WHERE id = '${escapeStr(projectId)}'`
    );
    if (projectRows.length === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { rows: assetRows } = await queryClickHouse(
      `SELECT id, project_id, type, cloudinary_url, filename, mime_type, width, height FROM assets WHERE project_id = '${escapeStr(projectId)}'`
    );
    if (assetRows.length === 0) {
      res.status(400).json({ error: "Add at least one asset before analyzing" });
      return;
    }

    try {
      // Clear existing detections for re-analysis
      await executeClickHouse(
        `ALTER TABLE detections DELETE WHERE project_id = '${escapeStr(projectId)}'`
      );

      const allToolCalls: ToolCallLog[] = [];

      // Create the dependency functions for the agent
      const deps = {
        storeDetection: async (detection: Record<string, unknown>) => {
          const detId = randomUUID();
          const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
          await executeClickHouse(
            `INSERT INTO detections (id, asset_id, project_id, category, name, source_type, source_ref, context_snippet, confidence, risk_level, rationale, bounding_box, prominence, duration, sentiment, narrative_role, visual_evidence, detected_at)
             VALUES ('${escapeStr(detId)}', '${escapeStr(String(detection.asset_id ?? ""))}', '${escapeStr(String(detection.project_id ?? projectId))}', '${escapeStr(String(detection.category ?? "brand"))}', '${escapeStr(String(detection.name ?? ""))}', '${escapeStr(String(detection.source_type ?? ""))}', '${escapeStr(String(detection.source_ref ?? ""))}', '${escapeStr(String(detection.context_snippet ?? ""))}', ${Number(detection.confidence ?? 0.5)}, '${escapeStr(String(detection.risk_level ?? "medium"))}', '${escapeStr(String(detection.rationale ?? ""))}', '${escapeStr(String(detection.bounding_box ?? ""))}', '${escapeStr(String(detection.prominence ?? ""))}', '${escapeStr(String(detection.duration ?? ""))}', '${escapeStr(String(detection.sentiment ?? ""))}', '${escapeStr(String(detection.narrative_role ?? ""))}', '${escapeStr(String(detection.visual_evidence ?? ""))}', '${now}')`
          );
        },

        queryPriorDetections: async (pid: string) => {
          const { rows: detRows } = await queryClickHouse(
            `SELECT * FROM detections WHERE project_id = '${escapeStr(pid)}' ORDER BY detected_at`
          );
          return detRows;
        },

        fetchAssetBase64: async (url: string) => {
          // For scripts, fetch as text; for media, fetch as buffer
          const buffer = await fetchAssetBuffer(url);
          const base64 = buffer.toString("base64");
          // Infer mime type from URL extension
          const ext = url.split(".").pop()?.toLowerCase() ?? "";
          const mimeMap: Record<string, string> = {
            jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
            gif: "image/gif", webp: "image/webp", mp4: "video/mp4",
            mov: "video/quicktime", avi: "video/x-msvideo", txt: "text/plain",
            pdf: "application/pdf",
          };
          return { base64, mimeType: mimeMap[ext] ?? "application/octet-stream" };
        },
      };

      // Run the agent on each asset
      for (const assetRow of assetRows) {
        const asset = {
          id: String(assetRow.id),
          projectId,
          type: String(assetRow.type),
          cloudinaryUrl: String(assetRow.cloudinary_url),
          filename: String(assetRow.filename),
          mimeType: String(assetRow.mime_type),
        };

        console.log(`[Analyze] Running agent on asset: ${asset.filename} (${asset.type})`);

        try {
          const result = await analyzeAsset(deps, asset);
          allToolCalls.push(...result.toolCalls);
        } catch (agentErr) {
          console.error(`[Analyze] Agent error on asset ${asset.filename}:`, agentErr);
          // Continue with other assets even if one fails
        }
      }

      // Read all detections from ClickHouse
      const { rows: allDetections } = await queryClickHouse(
        `SELECT * FROM detections WHERE project_id = '${escapeStr(projectId)}' ORDER BY detected_at`
      );

      const counts = { low: 0, medium: 0, high: 0 };
      const detections = allDetections.map((d) => {
        const riskLevel = String(d.risk_level ?? "medium");
        if (riskLevel in counts) counts[riskLevel as keyof typeof counts]++;

        let boundingBox = null;
        try {
          const bb = String(d.bounding_box ?? "");
          if (bb && bb.startsWith("{")) boundingBox = JSON.parse(bb);
        } catch { /* ignore */ }

        return {
          id: String(d.id),
          assetId: String(d.asset_id),
          category: String(d.category ?? "brand"),
          name: String(d.name ?? ""),
          sourceRef: String(d.source_ref ?? ""),
          contextSnippet: String(d.context_snippet ?? ""),
          confidence: Number(d.confidence ?? 0.5),
          riskLevel,
          rationale: String(d.rationale ?? ""),
          boundingBox,
          frameReference: null,
          prominence: String(d.prominence ?? "") || null,
          duration: String(d.duration ?? "") || null,
          sentiment: String(d.sentiment ?? "") || null,
          narrativeRole: String(d.narrative_role ?? "") || null,
          visualEvidence: String(d.visual_evidence ?? "") || null,
        };
      });

      // Build previews from assets
      const previews = assetRows
        .filter((a) => String(a.type) === "image" || String(a.type) === "video")
        .map((a) => ({
          assetId: String(a.id),
          filename: String(a.filename),
          type: String(a.type) as "image" | "video",
          mimeType: String(a.mime_type),
          dataUrl: String(a.cloudinary_url),
          width: Number(a.width ?? 0),
          height: Number(a.height ?? 0),
        }));

      const report = {
        projectId,
        generatedAt: new Date().toISOString(),
        summary:
          detections.length > 0
            ? `${detections.length} potential rights references found across ${assetRows.length} asset${assetRows.length === 1 ? "" : "s"}.`
            : `No obvious third-party references found across ${assetRows.length} asset${assetRows.length === 1 ? "" : "s"}.`,
        counts,
        detections,
        analyzedAssets: assetRows.length,
        previews,
        toolCalls: allToolCalls,
      };

      res.json(report);
    } catch (error) {
      req.log.error({ err: error }, "Analysis failed");
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
        res.status(429).json({
          error:
            "Gemini request quota is exhausted. Wait for the quota reset or check Google AI Studio limits, then retry.",
        });
        return;
      }
      res.status(500).json({
        error: "Analysis failed. Check GOOGLE_GENAI_API_KEY and try again.",
      });
    }
  }
);

// ─── GET /projects/:projectId/report ────────────────────────────────────────

router.get("/projects/:projectId/report", async (req, res): Promise<void> => {
  const params = GetProjectReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const projectId = params.data.projectId;

  try {
    const { rows: detectionRows } = await queryClickHouse(
      `SELECT * FROM detections WHERE project_id = '${escapeStr(projectId)}' ORDER BY detected_at`
    );

    if (detectionRows.length === 0) {
      res.status(404).json({ error: "No report has been generated yet" });
      return;
    }

    const { rows: assetRows } = await queryClickHouse(
      `SELECT id, project_id, type, cloudinary_url, filename, mime_type, width, height FROM assets WHERE project_id = '${escapeStr(projectId)}'`
    );

    const counts = { low: 0, medium: 0, high: 0 };
    const detections = detectionRows.map((d) => {
      const riskLevel = String(d.risk_level ?? "medium");
      if (riskLevel in counts) counts[riskLevel as keyof typeof counts]++;

      let boundingBox = null;
      try {
        const bb = String(d.bounding_box ?? "");
        if (bb && bb.startsWith("{")) boundingBox = JSON.parse(bb);
      } catch { /* ignore */ }

      return {
        id: String(d.id),
        assetId: String(d.asset_id),
        category: String(d.category ?? "brand"),
        name: String(d.name ?? ""),
        sourceRef: String(d.source_ref ?? ""),
        contextSnippet: String(d.context_snippet ?? ""),
        confidence: Number(d.confidence ?? 0.5),
        riskLevel,
        rationale: String(d.rationale ?? ""),
        boundingBox,
        frameReference: null,
        prominence: String(d.prominence ?? "") || null,
        duration: String(d.duration ?? "") || null,
        sentiment: String(d.sentiment ?? "") || null,
        narrativeRole: String(d.narrative_role ?? "") || null,
        visualEvidence: String(d.visual_evidence ?? "") || null,
      };
    });

    const previews = assetRows
      .filter((a) => String(a.type) === "image" || String(a.type) === "video")
      .map((a) => ({
        assetId: String(a.id),
        filename: String(a.filename),
        type: String(a.type) as "image" | "video",
        mimeType: String(a.mime_type),
        dataUrl: String(a.cloudinary_url),
        width: Number(a.width ?? 0),
        height: Number(a.height ?? 0),
      }));

    const report = {
      projectId,
      generatedAt: new Date().toISOString(),
      summary: `${detections.length} potential rights references found across ${assetRows.length} asset${assetRows.length === 1 ? "" : "s"}.`,
      counts,
      detections,
      analyzedAssets: assetRows.length,
      previews,
    };

    res.json(GetProjectReportResponse.parse(report));
  } catch (err) {
    console.error("Error fetching report:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

export default router;