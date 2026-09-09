import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "600mb" }));
app.use(express.urlencoded({ limit: "600mb", extended: true }));

app.use("/api", router);

// Serve compiled frontend in production if dist/public or ./public exists
const candidateDirs = [
  path.resolve(import.meta.dirname, "public"),
  path.resolve(import.meta.dirname, "../../rights-clearance-scanner/dist/public"),
  path.resolve(import.meta.dirname, "../rights-clearance-scanner/dist/public"),
  path.resolve(process.cwd(), "artifacts/rights-clearance-scanner/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(process.cwd(), "public"),
];

const publicDir = candidateDirs.find((dir) => fs.existsSync(dir) && fs.existsSync(path.join(dir, "index.html")));
if (publicDir) {
  logger.info({ publicDir }, "Serving static frontend from publicDir");
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  logger.warn({ candidateDirs }, "No static frontend directory with index.html found");
}

export default app;
