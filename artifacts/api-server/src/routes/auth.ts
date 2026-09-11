import { Router, type IRouter } from "express";
import { randomUUID, createHash } from "node:crypto";
import { queryClickHouse, executeClickHouse } from "@workspace/clickhouse-mcp";
import { deleteProjectFolder } from "@workspace/cloudinary-storage";

const router: IRouter = Router();

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// ─── POST /api/auth/register ───────────────────────────────────────────────

router.post("/auth/register", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};

  if (!username || typeof username !== "string" || username.trim().length < 2) {
    res.status(400).json({ error: "Username must be at least 2 characters long" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters long" });
    return;
  }

  const cleanUsername = username.trim();
  const passwordHash = hashPassword(password);

  try {
    const { rows: existing } = await queryClickHouse(
      `SELECT id FROM users WHERE username = '${escapeStr(cleanUsername)}' LIMIT 1`
    );

    if (existing.length > 0) {
      res.status(409).json({ error: "Username already exists. Please sign in." });
      return;
    }

    const userId = randomUUID();
    const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    await executeClickHouse(
      `INSERT INTO users (id, username, password_hash, role, created_at)
       VALUES ('${escapeStr(userId)}', '${escapeStr(cleanUsername)}', '${escapeStr(passwordHash)}', 'registered', '${now}')`
    );

    res.status(201).json({
      user: {
        id: userId,
        username: cleanUsername,
        role: "registered",
        maxFileSizeBytes: 400 * 1024 * 1024, // 400 MB
        maxFileSizeLabel: "400 MB",
      },
      token: userId,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register account" });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const cleanUsername = String(username).trim();
  const passwordHash = hashPassword(String(password));

  try {
    const { rows } = await queryClickHouse(
      `SELECT id, username, role, password_hash FROM users WHERE username = '${escapeStr(cleanUsername)}' LIMIT 1`
    );

    if (rows.length === 0 || String(rows[0]?.password_hash) !== passwordHash) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const userRow = rows[0]!;
    const userId = String(userRow.id);
    const role = String(userRow.role ?? "registered");
    const isRegistered = role === "registered";

    res.json({
      user: {
        id: userId,
        username: String(userRow.username),
        role,
        maxFileSizeBytes: isRegistered ? 400 * 1024 * 1024 : 100 * 1024 * 1024,
        maxFileSizeLabel: isRegistered ? "400 MB" : "100 MB",
      },
      token: userId,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── POST /api/auth/demo ───────────────────────────────────────────────────

router.post("/auth/demo", async (req, res): Promise<void> => {
  try {
    const demoId = `demo_${randomUUID().slice(0, 8)}`;
    const guestNumber = Math.floor(1000 + Math.random() * 9000);
    const username = `Demo Guest #${guestNumber}`;
    const now = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    await executeClickHouse(
      `INSERT INTO users (id, username, password_hash, role, created_at)
       VALUES ('${escapeStr(demoId)}', '${escapeStr(username)}', '', 'demo', '${now}')`
    );

    // Create a starter demo project named Project1
    const demoProjectId = randomUUID();
    await executeClickHouse(
      `INSERT INTO projects (id, title, user_id, created_at)
       VALUES ('${escapeStr(demoProjectId)}', 'Project1', '${escapeStr(demoId)}', '${now}')`
    );

    res.json({
      user: {
        id: demoId,
        username,
        role: "demo",
        maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
        maxFileSizeLabel: "100 MB",
      },
      token: demoId,
    });
  } catch (err) {
    console.error("Demo creation error:", err);
    res.status(500).json({ error: "Failed to initialize demo session" });
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  const customHeader = req.headers["x-user-id"];
  const userId =
    (typeof customHeader === "string" && customHeader) ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const { rows } = await queryClickHouse(
      `SELECT id, username, role FROM users WHERE id = '${escapeStr(userId)}' LIMIT 1`
    );

    if (rows.length === 0) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const row = rows[0]!;
    const role = String(row.role ?? "registered");
    const isRegistered = role === "registered";

    res.json({
      user: {
        id: String(row.id),
        username: String(row.username),
        role,
        maxFileSizeBytes: isRegistered ? 400 * 1024 * 1024 : 100 * 1024 * 1024,
        maxFileSizeLabel: isRegistered ? "400 MB" : "100 MB",
      },
    });
  } catch (err) {
    console.error("Auth verification error:", err);
    res.status(500).json({ error: "Failed to verify session" });
  }
});

// ─── Demo User Purge Helper ────────────────────────────────────────────────
// Deletes all Cloudinary folders and ClickHouse records associated with a demo user
export async function purgeDemoUser(demoUserId: string): Promise<void> {
  if (!demoUserId || !demoUserId.startsWith("demo_")) return;
  console.log(`[Demo Cleanup] Starting teardown for demo session: ${demoUserId}`);

  try {
    // 1. Find all projects belonging to this demo user
    const { rows: projectRows } = await queryClickHouse(
      `SELECT id FROM projects WHERE user_id = '${escapeStr(demoUserId)}'`
    );

    // 2. Delete Cloudinary media and database records for each demo project
    for (const p of projectRows) {
      const projectId = String(p.id);
      try {
        console.log(`[Demo Cleanup] Destroying Cloudinary folder for demo project: ${projectId}`);
        await deleteProjectFolder(projectId);
      } catch (cloudErr) {
        console.warn(`[Demo Cleanup] Cloudinary folder removal error for ${projectId}:`, cloudErr);
      }

      await executeClickHouse(`ALTER TABLE assets DELETE WHERE project_id = '${escapeStr(projectId)}'`);
      await executeClickHouse(`ALTER TABLE detections DELETE WHERE project_id = '${escapeStr(projectId)}'`);
      await executeClickHouse(`ALTER TABLE reports DELETE WHERE project_id = '${escapeStr(projectId)}'`);
      await executeClickHouse(`ALTER TABLE project_stats DELETE WHERE project_id = '${escapeStr(projectId)}'`);
    }

    // 3. Delete projects
    await executeClickHouse(`ALTER TABLE projects DELETE WHERE user_id = '${escapeStr(demoUserId)}'`);

    // 4. Delete demo user record
    await executeClickHouse(`ALTER TABLE users DELETE WHERE id = '${escapeStr(demoUserId)}'`);

    console.log(`[Demo Cleanup] Successfully purged demo user ${demoUserId} and ${projectRows.length} project(s).`);
  } catch (err) {
    console.error(`[Demo Cleanup] Error purging demo user ${demoUserId}:`, err);
  }
}

// ─── POST /api/auth/demo/cleanup ───────────────────────────────────────────
// Teardown endpoint invoked on logout or beforeunload
router.post("/auth/demo/cleanup", async (req, res): Promise<void> => {
  const queryUserId = typeof req.query.userId === "string" ? req.query.userId : null;
  const bodyUserId = req.body && typeof req.body.userId === "string" ? req.body.userId : null;
  const customHeader = typeof req.headers["x-user-id"] === "string" ? req.headers["x-user-id"] : null;
  const authHeader = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;

  let userId = queryUserId || bodyUserId || customHeader || authHeader;

  // Handle sendBeacon string payloads
  if (!userId && typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed?.userId) userId = parsed.userId;
    } catch {}
  }

  if (!userId || !userId.startsWith("demo_")) {
    res.status(400).json({ error: "Invalid demo user ID" });
    return;
  }

  try {
    await purgeDemoUser(userId);
    res.json({ success: true, message: "Demo session cleared completely" });
  } catch (err) {
    console.error("Error during demo cleanup:", err);
    res.status(500).json({ error: "Failed to clean demo session" });
  }
});

// ─── Background Demo Sweeper ───────────────────────────────────────────────
// Cleans up stale demo sessions older than 2 hours in case a tab was closed offline
async function runDemoSweeper(): Promise<void> {
  try {
    const { rows } = await queryClickHouse(
      `SELECT id FROM users WHERE role = 'demo' AND created_at < now() - INTERVAL 2 HOUR LIMIT 20`
    );
    if (rows.length > 0) {
      console.log(`[Demo Sweeper] Found ${rows.length} expired demo session(s) to purge.`);
      for (const row of rows) {
        await purgeDemoUser(String(row.id));
      }
    }
  } catch (err) {
    console.warn("[Demo Sweeper] Error during background sweep:", err);
  }
}

// Initial sweep 30s after startup, then every 30 minutes
setTimeout(() => {
  runDemoSweeper().catch(() => {});
  setInterval(() => {
    runDemoSweeper().catch(() => {});
  }, 30 * 60 * 1000);
}, 30 * 1000);

export default router;

