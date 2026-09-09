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

function parseBoundingBox(raw: unknown) {
  if (!raw) return null;
  try {
    const bb = String(raw).trim();
    if (bb && (bb.startsWith("{") || bb.startsWith("["))) {
      const parsed = JSON.parse(bb);
      if (Array.isArray(parsed) && parsed.length === 4) {
        return {
          top: Number(parsed[0]),
          left: Number(parsed[1]),
          bottom: Number(parsed[2]),
          right: Number(parsed[3]),
        };
      } else if (parsed && typeof parsed === "object") {
        return {
          left: Number((parsed as any).left ?? (parsed as any).xmin ?? 0),
          top: Number((parsed as any).top ?? (parsed as any).ymin ?? 0),
          right: Number((parsed as any).right ?? (parsed as any).xmax ?? 1000),
          bottom: Number((parsed as any).bottom ?? (parsed as any).ymax ?? 1000),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getUserIdFromReq(req: any): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers["x-user-id"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }
  const q = req.query?.userId;
  if (typeof q === "string" && q.trim()) {
    return q.trim();
  }
  const bodyUser = req.body?.userId;
  if (typeof bodyUser === "string" && bodyUser.trim()) {
    return bodyUser.trim();
  }
  return "";
}

// ─── GET /projects ──────────────────────────────────────────────────────────

router.get("/projects", async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    // If not authenticated, return empty array - never expose other users' projects
    if (!userId) {
      res.json([]);
      return;
    }

    const { rows } = await queryClickHouse(
      `SELECT id, title, created_at, user_id FROM projects WHERE user_id = '${escapeStr(userId)}' ORDER BY created_at DESC`
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
          userId: String(row.user_id ?? ""),
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
  const userId = getUserIdFromReq(req);
  const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

  try {
    await executeClickHouse(
      `INSERT INTO projects (id, title, user_id, created_at) VALUES ('${escapeStr(id)}', '${escapeStr(title)}', '${escapeStr(userId)}', '${now}')`
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

// ─── PATCH /projects/:projectId (Edit / Rename Project) ─────────────────────

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const { projectId } = req.params;
  const { title } = req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const cleanTitle = title.trim();
  try {
    await executeClickHouse(
      `ALTER TABLE projects UPDATE title = '${escapeStr(cleanTitle)}' WHERE id = '${escapeStr(projectId)}'`
    );
    res.json({ id: projectId, title: cleanTitle });
  } catch (err) {
    console.error("Error updating project:", err);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// ─── DELETE /projects/:projectId (Delete Project & Associated Data) ─────────

router.delete("/projects/:projectId", async (req, res): Promise<void> => {
  const { projectId } = req.params;
  try {
    await executeClickHouse(
      `ALTER TABLE projects DELETE WHERE id = '${escapeStr(projectId)}'`
    );
    await executeClickHouse(
      `ALTER TABLE assets DELETE WHERE project_id = '${escapeStr(projectId)}'`
    );
    await executeClickHouse(
      `ALTER TABLE detections DELETE WHERE project_id = '${escapeStr(projectId)}'`
    );
    await executeClickHouse(
      `ALTER TABLE reports DELETE WHERE project_id = '${escapeStr(projectId)}'`
    );
    await executeClickHouse(
      `ALTER TABLE project_stats DELETE WHERE project_id = '${escapeStr(projectId)}'`
    );
    res.json({ success: true, id: projectId });
  } catch (err) {
    console.error("Error deleting project:", err);
    res.status(500).json({ error: "Failed to delete project" });
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

  // Check file limits based on role: Demo = 100MB, Registered = 400MB
  const userRole = (req.headers["x-user-role"] as string) || (req.body?.userRole as string) || "registered";
  const maxBytes = userRole === "demo" ? 100 * 1024 * 1024 : 400 * 1024 * 1024;
  const rawSize = parsed.data.contentBase64 ? Math.round((parsed.data.contentBase64.length * 3) / 4) : 0;
  if (rawSize > maxBytes) {
    const limitLabel = userRole === "demo" ? "100 MB" : "400 MB";
    res.status(413).json({
      error: `File size (~${(rawSize / (1024 * 1024)).toFixed(1)} MB) exceeds the ${limitLabel} limit for ${userRole === "demo" ? "demo mode" : "registered users"}.`,
    });
    return;
  }

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
      const storedKeys = new Set<string>();

      // Create the dependency functions for the agent
      const deps = {
        storeDetection: async (detection: Record<string, unknown>) => {
          const name = String(detection.name ?? "").trim();
          const assetId = String(detection.asset_id ?? "");
          const key = `${assetId}:${name.toLowerCase()}`;
          if (!name || storedKeys.has(key)) return;
          storedKeys.add(key);
          const detId = randomUUID();
          const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
          await executeClickHouse(
            `INSERT INTO detections (id, asset_id, project_id, category, name, source_type, source_ref, context_snippet, confidence, risk_level, rationale, bounding_box, prominence, duration, sentiment, narrative_role, visual_evidence, detected_at)
             VALUES ('${escapeStr(detId)}', '${escapeStr(String(detection.asset_id ?? ""))}', '${escapeStr(String(detection.project_id ?? projectId))}', '${escapeStr(String(detection.category ?? "brand"))}', '${escapeStr(name)}', '${escapeStr(String(detection.source_type ?? ""))}', '${escapeStr(String(detection.source_ref ?? ""))}', '${escapeStr(String(detection.context_snippet ?? ""))}', ${Number(detection.confidence ?? 0.5)}, '${escapeStr(String(detection.risk_level ?? "medium"))}', '${escapeStr(String(detection.rationale ?? ""))}', '${escapeStr(String(detection.bounding_box ?? ""))}', '${escapeStr(String(detection.prominence ?? ""))}', '${escapeStr(String(detection.duration ?? ""))}', '${escapeStr(String(detection.sentiment ?? ""))}', '${escapeStr(String(detection.narrative_role ?? ""))}', '${escapeStr(String(detection.visual_evidence ?? ""))}', '${now}')`
          );
        },

        queryPriorDetections: async (pid: string) => {
          const { rows: detRows } = await queryClickHouse(
            `SELECT * FROM detections WHERE project_id = '${escapeStr(pid)}' ORDER BY detected_at`
          );
          return detRows;
        },

        fetchAssetBase64: async (url: string) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to fetch asset from ${url}: ${res.status}`);
          const headerMime = res.headers.get("content-type")?.split(";")[0]?.trim();
          const arrayBuf = await res.arrayBuffer();
          const base64 = Buffer.from(arrayBuf).toString("base64");
          const ext = url.split(".").pop()?.toLowerCase() ?? "";
          const mimeMap: Record<string, string> = {
            jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
            gif: "image/gif", webp: "image/webp", mp4: "video/mp4",
            mov: "video/quicktime", avi: "video/x-msvideo", txt: "text/plain",
            pdf: "application/pdf",
          };
          const mimeType = (headerMime && headerMime !== "application/octet-stream")
            ? headerMime
            : mimeMap[ext] ?? "image/jpeg";
          return { base64, mimeType };
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

        const boundingBox = parseBoundingBox(d.bounding_box);

        return {
          id: String(d.id),
          assetId: String(d.asset_id),
          category: String(d.category ?? "brand"),
          name: String(d.name ?? ""),
          sourceType: String(d.source_type ?? ""),
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
        .filter((a) => String(a.type) === "image" || String(a.type) === "video" || String(a.type) === "audio")
        .map((a) => ({
          assetId: String(a.id),
          filename: String(a.filename),
          type: String(a.type) as "image" | "video",
          mimeType: String(a.mime_type),
          dataUrl: String(a.cloudinary_url),
          width: Number(a.width ?? 0),
          height: Number(a.height ?? 0),
        }));

      const reportId = randomUUID();
      const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

      const { rows: priorReports } = await queryClickHouse(
        `SELECT count() as cnt FROM reports WHERE project_id = '${escapeStr(projectId)}'`
      );
      const reportSeq = Number(priorReports[0]?.cnt ?? 0) + 1;
      const reportName = `Report #${reportSeq} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

      const report = {
        id: reportId,
        projectId,
        name: reportName,
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

      try {
        const detectionsJson = JSON.stringify(detections);
        const toolCallsJson = JSON.stringify(allToolCalls);
        await executeClickHouse(
          `INSERT INTO reports (id, project_id, name, summary, risk_high, risk_medium, risk_low, analyzed_assets, detections_json, tool_calls_json, generated_at)
           VALUES ('${escapeStr(reportId)}', '${escapeStr(projectId)}', '${escapeStr(reportName)}', '${escapeStr(report.summary)}', ${counts.high}, ${counts.medium}, ${counts.low}, ${assetRows.length}, '${escapeStr(detectionsJson)}', '${escapeStr(toolCallsJson)}', '${now}')`
        );

        await executeClickHouse(
          `INSERT INTO project_stats (project_id, scans_count, total_detections, high_risk_count, medium_risk_count, low_risk_count, last_scan_at, updated_at)
           VALUES ('${escapeStr(projectId)}', ${reportSeq}, ${detections.length}, ${counts.high}, ${counts.medium}, ${counts.low}, '${now}', '${now}')`
        );
      } catch (saveErr) {
        console.error("Failed to save report record to ClickHouse:", saveErr);
      }

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

// ─── GET /projects/:projectId/reports ───────────────────────────────────────
// Get all reports recorded for this project

router.get("/projects/:projectId/reports", async (req, res): Promise<void> => {
  const projectId = req.params.projectId;
  try {
    const { rows } = await queryClickHouse(
      `SELECT id, project_id, name, summary, risk_high, risk_medium, risk_low, analyzed_assets, generated_at
       FROM reports WHERE project_id = '${escapeStr(projectId)}' ORDER BY generated_at DESC`
    );

    const reports = rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      name: String(r.name || `Report ${String(r.id).slice(0, 8)}`),
      summary: String(r.summary ?? ""),
      counts: {
        high: Number(r.risk_high ?? 0),
        medium: Number(r.risk_medium ?? 0),
        low: Number(r.risk_low ?? 0),
      },
      analyzedAssets: Number(r.analyzed_assets ?? 0),
      generatedAt: String(r.generated_at),
    }));

    res.json(reports);
  } catch (err) {
    console.error("Error fetching reports list:", err);
    res.status(500).json({ error: "Failed to fetch reports list" });
  }
});

// ─── GET /projects/:projectId/reports/:reportId ─────────────────────────────
// Get specific historical report with full detections & tool calls

router.get("/projects/:projectId/reports/:reportId", async (req, res): Promise<void> => {
  const { projectId, reportId } = req.params;
  try {
    const { rows } = await queryClickHouse(
      `SELECT * FROM reports WHERE id = '${escapeStr(reportId)}' AND project_id = '${escapeStr(projectId)}' LIMIT 1`
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const r = rows[0]!;
    let detections: unknown[] = [];
    let toolCalls: unknown[] = [];

    try {
      if (r.detections_json) detections = JSON.parse(String(r.detections_json));
    } catch { /* ignore */ }

    try {
      if (r.tool_calls_json) toolCalls = JSON.parse(String(r.tool_calls_json));
    } catch { /* ignore */ }

    const { rows: assetRows } = await queryClickHouse(
      `SELECT id, project_id, type, cloudinary_url, filename, mime_type, width, height FROM assets WHERE project_id = '${escapeStr(projectId)}'`
    );

    const previews = assetRows
      .filter((a) => String(a.type) === "image" || String(a.type) === "video" || String(a.type) === "audio")
      .map((a) => ({
        assetId: String(a.id),
        filename: String(a.filename),
        type: String(a.type) as "image" | "video",
        mimeType: String(a.mime_type),
        dataUrl: String(a.cloudinary_url),
        width: Number(a.width ?? 0),
        height: Number(a.height ?? 0),
      }));

    res.json({
      id: String(r.id),
      projectId: String(r.project_id),
      name: String(r.name || `Report ${String(r.id).slice(0, 8)}`),
      generatedAt: String(r.generated_at),
      summary: String(r.summary ?? ""),
      counts: {
        high: Number(r.risk_high ?? 0),
        medium: Number(r.risk_medium ?? 0),
        low: Number(r.risk_low ?? 0),
      },
      detections,
      analyzedAssets: Number(r.analyzed_assets ?? 0),
      previews,
      toolCalls,
    });
  } catch (err) {
    console.error("Error fetching single report:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// ─── DELETE /projects/:projectId/reports/:reportId ──────────────────────────
// Delete a specific report

router.delete("/projects/:projectId/reports/:reportId", async (req, res): Promise<void> => {
  const { projectId, reportId } = req.params;
  try {
    await executeClickHouse(
      `ALTER TABLE reports DELETE WHERE id = '${escapeStr(reportId)}' AND project_id = '${escapeStr(projectId)}'`
    );
    res.json({ success: true, message: "Report deleted successfully" });
  } catch (err) {
    console.error("Error deleting report:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ─── GET /projects/:projectId/stats ─────────────────────────────────────────
// Get project-level clearance statistics stored in ClickHouse

router.get("/projects/:projectId/stats", async (req, res): Promise<void> => {
  const projectId = req.params.projectId;
  try {
    const { rows: reportRows } = await queryClickHouse(
      `SELECT count() as scans, sum(risk_high) as total_high, sum(risk_medium) as total_med, sum(risk_low) as total_low
       FROM reports WHERE project_id = '${escapeStr(projectId)}'`
    );

    const { rows: assetRows } = await queryClickHouse(
      `SELECT count() as total_assets, type FROM assets WHERE project_id = '${escapeStr(projectId)}' GROUP BY type`
    );

    const { rows: detectionRows } = await queryClickHouse(
      `SELECT count() as total, category FROM detections WHERE project_id = '${escapeStr(projectId)}' GROUP BY category`
    );

    const scansCount = Number(reportRows[0]?.scans ?? 0);
    const highRisks = Number(reportRows[0]?.total_high ?? 0);
    const medRisks = Number(reportRows[0]?.total_med ?? 0);
    const lowRisks = Number(reportRows[0]?.total_low ?? 0);

    res.json({
      projectId,
      scansCount,
      riskTotals: {
        high: highRisks,
        medium: medRisks,
        low: lowRisks,
      },
      assetBreakdown: assetRows.map((a) => ({
        type: String(a.type),
        count: Number(a.total_assets ?? 0),
      })),
      categoryBreakdown: detectionRows.map((d) => ({
        category: String(d.category),
        count: Number(d.total ?? 0),
      })),
    });
  } catch (err) {
    console.error("Error fetching project stats:", err);
    res.status(500).json({ error: "Failed to fetch project statistics" });
  }
});

// ─── GET /projects/:projectId/report ────────────────────────────────────────
// Returns the latest report (reads latest from reports table, fallback to detections)

router.get("/projects/:projectId/report", async (req, res): Promise<void> => {
  const params = GetProjectReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const projectId = params.data.projectId;

  try {
    // Check if there is an entry in reports table
    const { rows: latestReportRows } = await queryClickHouse(
      `SELECT * FROM reports WHERE project_id = '${escapeStr(projectId)}' ORDER BY generated_at DESC LIMIT 1`
    );

    const { rows: assetRows } = await queryClickHouse(
      `SELECT id, project_id, type, cloudinary_url, filename, mime_type, width, height FROM assets WHERE project_id = '${escapeStr(projectId)}'`
    );

    const previews = assetRows
      .filter((a) => String(a.type) === "image" || String(a.type) === "video" || String(a.type) === "audio")
      .map((a) => ({
        assetId: String(a.id),
        filename: String(a.filename),
        type: String(a.type) as "image" | "video",
        mimeType: String(a.mime_type),
        dataUrl: String(a.cloudinary_url),
        width: Number(a.width ?? 0),
        height: Number(a.height ?? 0),
      }));

    if (latestReportRows.length > 0) {
      const r = latestReportRows[0]!;
      let detections: unknown[] = [];
      let toolCalls: unknown[] = [];
      try {
        if (r.detections_json) detections = JSON.parse(String(r.detections_json));
      } catch { /* ignore */ }
      try {
        if (r.tool_calls_json) toolCalls = JSON.parse(String(r.tool_calls_json));
      } catch { /* ignore */ }

      res.json({
        id: String(r.id),
        projectId: String(r.project_id),
        name: String(r.name || "Latest Clearance Report"),
        generatedAt: String(r.generated_at),
        summary: String(r.summary ?? ""),
        counts: {
          high: Number(r.risk_high ?? 0),
          medium: Number(r.risk_medium ?? 0),
          low: Number(r.risk_low ?? 0),
        },
        detections,
        analyzedAssets: Number(r.analyzed_assets ?? assetRows.length),
        previews,
        toolCalls,
      });
      return;
    }

    // Fallback to detections table if no report record was saved yet
    const { rows: detectionRows } = await queryClickHouse(
      `SELECT * FROM detections WHERE project_id = '${escapeStr(projectId)}' ORDER BY detected_at`
    );

    if (detectionRows.length === 0) {
      res.status(404).json({ error: "No report has been generated yet" });
      return;
    }

    const counts = { low: 0, medium: 0, high: 0 };
    const detections = detectionRows.map((d) => {
      const riskLevel = String(d.risk_level ?? "medium");
      if (riskLevel in counts) counts[riskLevel as keyof typeof counts]++;

      const boundingBox = parseBoundingBox(d.bounding_box);

      return {
        id: String(d.id),
        assetId: String(d.asset_id),
        category: String(d.category ?? "brand"),
        name: String(d.name ?? ""),
        sourceType: String(d.source_type ?? ""),
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

    const report = {
      projectId,
      generatedAt: new Date().toISOString(),
      summary: `${detections.length} potential rights references found across ${assetRows.length} asset${assetRows.length === 1 ? "" : "s"}.`,
      counts,
      detections,
      analyzedAssets: assetRows.length,
      previews,
    };

    res.json(report);
  } catch (err) {
    console.error("Error fetching report:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

export default router;