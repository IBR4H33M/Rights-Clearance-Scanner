import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  const data = HealthCheckResponse.parse({
    status: configured ? "ok" : "degraded",
    provider: "Gemini via @google/genai",
    detail: configured
      ? "Connected to Gemini for script and visual clearance analysis."
      : "Gemini API key is not configured.",
  });
  res.json(data);
});

export default router;
