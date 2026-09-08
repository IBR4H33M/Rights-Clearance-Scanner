import { Router, type IRouter } from "express";
import { isCloudinaryConfigured } from "@workspace/cloudinary-storage";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const geminiConfigured = Boolean(process.env.GOOGLE_GENAI_API_KEY);
  const clickhouseConfigured = Boolean(process.env.CLICKHOUSE_HOST);
  const cloudinaryOk = isCloudinaryConfigured();

  const allOk = geminiConfigured && clickhouseConfigured && cloudinaryOk;

  const data = {
    status: allOk ? "ok" : "degraded",
    provider: "Gemini via @google/adk + @google/genai",
    detail: allOk
      ? "All services configured: Gemini (ADK), ClickHouse (MCP), Cloudinary."
      : [
          !geminiConfigured && "GOOGLE_GENAI_API_KEY not set",
          !clickhouseConfigured && "CLICKHOUSE_HOST not set",
          !cloudinaryOk && "Cloudinary credentials not set",
        ]
          .filter(Boolean)
          .join("; "),
    services: {
      gemini: geminiConfigured,
      clickhouse: clickhouseConfigured,
      cloudinary: cloudinaryOk,
    },
  };

  res.json(data);
});

export default router;
