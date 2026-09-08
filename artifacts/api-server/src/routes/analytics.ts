import { Router, type IRouter } from "express";
import { queryClickHouse } from "@workspace/clickhouse-mcp";

const router: IRouter = Router();

/**
 * GET /analytics
 * Returns aggregate analytics across all projects:
 * - Top 10 most-flagged brand names
 * - Risk level distribution
 */
router.get("/analytics", async (_req, res) => {
  try {
    // Top 10 most-flagged entity names
    const { rows: topBrands } = await queryClickHouse(
      `SELECT name, category, count() as detection_count, avg(confidence) as avg_confidence
       FROM detections
       GROUP BY name, category
       ORDER BY detection_count DESC
       LIMIT 10`
    );

    // Risk level distribution
    const { rows: riskDistribution } = await queryClickHouse(
      `SELECT risk_level, count() as count
       FROM detections
       GROUP BY risk_level
       ORDER BY count DESC`
    );

    // Total stats
    const { rows: totalStats } = await queryClickHouse(
      `SELECT
         count() as total_detections,
         countDistinct(project_id) as total_projects,
         countDistinct(asset_id) as total_assets
       FROM detections`
    );

    // Category distribution
    const { rows: categoryDistribution } = await queryClickHouse(
      `SELECT category, count() as count
       FROM detections
       GROUP BY category
       ORDER BY count DESC`
    );

    res.json({
      topBrands: topBrands.map((r) => ({
        name: String(r.name),
        category: String(r.category),
        detectionCount: Number(r.detection_count),
        avgConfidence: Number(r.avg_confidence ?? 0),
      })),
      riskDistribution: riskDistribution.map((r) => ({
        riskLevel: String(r.risk_level),
        count: Number(r.count),
      })),
      totalStats: {
        totalDetections: Number(totalStats[0]?.total_detections ?? 0),
        totalProjects: Number(totalStats[0]?.total_projects ?? 0),
        totalAssets: Number(totalStats[0]?.total_assets ?? 0),
      },
      categoryDistribution: categoryDistribution.map((r) => ({
        category: String(r.category),
        count: Number(r.count),
      })),
    });
  } catch (err) {
    console.error("Error fetching analytics:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;
