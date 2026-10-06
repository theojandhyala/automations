CREATE TABLE IF NOT EXISTS cloud_studio_brand_control (
 app_slug TEXT PRIMARY KEY CHECK(app_slug IN ('deadset','cast','lifescore','reclaim')),
 paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN(0,1)), updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO cloud_studio_brand_control SELECT * FROM cloud_studio_control;
INSERT OR IGNORE INTO cloud_studio_brand_control VALUES ('lifescore',0,strftime('%Y-%m-%dT%H:%M:%fZ','now')),('reclaim',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS cloud_brand_release(app_slug TEXT PRIMARY KEY,state TEXT NOT NULL);
