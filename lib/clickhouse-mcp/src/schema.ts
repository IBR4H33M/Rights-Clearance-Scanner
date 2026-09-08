/**
 * ClickHouse schema definitions.
 * These CREATE TABLE statements are executed via the MCP server on startup.
 */
export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS projects (
    id String,
    title String,
    created_at DateTime DEFAULT now()
  ) ENGINE = MergeTree ORDER BY (id)`,

  `CREATE TABLE IF NOT EXISTS assets (
    id String,
    project_id String,
    type String,
    cloudinary_url String,
    filename String,
    mime_type String,
    width UInt32 DEFAULT 0,
    height UInt32 DEFAULT 0,
    size_bytes UInt64 DEFAULT 0,
    uploaded_at DateTime DEFAULT now()
  ) ENGINE = MergeTree ORDER BY (project_id, id)`,

  `CREATE TABLE IF NOT EXISTS detections (
    id String,
    asset_id String,
    project_id String,
    category String,
    name String,
    source_type String,
    source_ref String,
    context_snippet String,
    confidence Float32,
    risk_level String,
    rationale String,
    bounding_box String,
    prominence String DEFAULT '',
    duration String DEFAULT '',
    sentiment String DEFAULT '',
    narrative_role String DEFAULT '',
    visual_evidence String DEFAULT '',
    detected_at DateTime DEFAULT now()
  ) ENGINE = MergeTree ORDER BY (project_id, asset_id, id)`,
];
