CREATE TABLE IF NOT EXISTS cloud_studio_control (
 app_slug TEXT PRIMARY KEY CHECK(app_slug IN ('deadset','cast')),
 paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN(0,1)),
 updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO cloud_studio_control VALUES ('deadset',0,strftime('%Y-%m-%dT%H:%M:%fZ','now')),('cast',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS cloud_studio_work (
 run_id TEXT PRIMARY KEY, app_slug TEXT NOT NULL, kind TEXT NOT NULL,
 local_day TEXT NOT NULL, started_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_studio_daily ON cloud_studio_work(app_slug,kind,local_day);
CREATE TABLE IF NOT EXISTS cloud_studio_attempts (
 artifact_id TEXT NOT NULL, input_hash TEXT NOT NULL, attempted_at TEXT NOT NULL,
 PRIMARY KEY(artifact_id,input_hash)
);
