-- Recovered from the live public schema on 2026-09-19. No account data or secrets.

PRAGMA foreign_keys = ON;

CREATE TABLE "analytics_snapshots" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "app_id" TEXT,
  "captured_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "followers" INTEGER,
  "following" INTEGER,
  "likes_total" INTEGER,
  "video_count" INTEGER,
  "views_28d" INTEGER,
  "watch_time_min" REAL,
  "comments_28d" INTEGER,
  "shares_28d" INTEGER,
  "quality" TEXT NOT NULL DEFAULT 'ok',
  "raw" TEXT CHECK ("raw" IS NULL OR json_valid("raw")),
  CHECK ((quality IN ('ok', 'partial', 'unavailable'))),
  PRIMARY KEY (id),
  FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
);

CREATE TABLE "apple_offer_code_requests" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_confirmation',
  "apple_app_id" TEXT NOT NULL,
  "app_name" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "subscription_name" TEXT NOT NULL,
  "offer_code_id" TEXT NOT NULL,
  "offer_name" TEXT NOT NULL,
  "custom_code" TEXT NOT NULL,
  "redemption_limit" INTEGER NOT NULL,
  "expiration_date" TEXT,
  "apple_resource_id" TEXT,
  "redemption_url" TEXT,
  "error" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "confirmed_at" TEXT,
  "completed_at" TEXT,
  CHECK ((status IN ('pending_confirmation', 'creating', 'succeeded', 'failed'))),
  CHECK (length(custom_code) BETWEEN 2 AND 64 AND custom_code NOT GLOB '*[^A-Z0-9]*'),
  CHECK (((redemption_limit >= 1) AND (redemption_limit <= 25000))),
  PRIMARY KEY (id)
);

CREATE TABLE "apps" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tagline" TEXT,
  "app_store_url" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "accent" TEXT NOT NULL DEFAULT '#6ea8fe',
  "icon" TEXT NOT NULL DEFAULT 'sparkle',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "promotion_enabled" INTEGER NOT NULL DEFAULT 1 CHECK ("promotion_enabled" IN (0,1)),
  PRIMARY KEY (id),
  UNIQUE (slug)
);

CREATE TABLE "artifacts" (
  "id" TEXT NOT NULL,
  "run_id" TEXT,
  "app_id" TEXT,
  "account_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','approved','publishing','published','rejected','failed')),
  "hook" TEXT,
  "caption" TEXT,
  "hashtags" TEXT NOT NULL DEFAULT '[]' CHECK ("hashtags" IS NULL OR json_valid("hashtags")),
  "video_url" TEXT,
  "thumbnail_url" TEXT,
  "duration_s" REAL,
  "publish_id" TEXT,
  "tiktok_post_id" TEXT,
  "error" TEXT,
  "scheduled_for" TEXT,
  "published_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "stage" TEXT NOT NULL DEFAULT 'concept' CHECK ("stage" IN ('research','concept','script','assets','edit','review','schedule','publish','analytics')),
  "stages" TEXT NOT NULL DEFAULT '{}' CHECK ("stages" IS NULL OR json_valid("stages")),
  "shot_notes" TEXT,
  "script" TEXT,
  "media_type" TEXT NOT NULL DEFAULT 'video',
  "photo_urls" TEXT NOT NULL DEFAULT '[]' CHECK ("photo_urls" IS NULL OR json_valid("photo_urls")),
  "asset_manifest" TEXT NOT NULL DEFAULT '{}' CHECK ("asset_manifest" IS NULL OR json_valid("asset_manifest")),
  "tiktok_privacy_level" TEXT,
  "disable_comment" INTEGER NOT NULL DEFAULT 1 CHECK ("disable_comment" IN (0,1)),
  "auto_add_music" INTEGER NOT NULL DEFAULT 0 CHECK ("auto_add_music" IN (0,1)),
  "brand_organic_toggle" INTEGER NOT NULL DEFAULT 0 CHECK ("brand_organic_toggle" IN (0,1)),
  "brand_content_toggle" INTEGER NOT NULL DEFAULT 0 CHECK ("brand_content_toggle" IN (0,1)),
  "is_aigc" INTEGER NOT NULL DEFAULT 0 CHECK ("is_aigc" IN (0,1)),
  "posting_consent_at" TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL,
  FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  CHECK ((media_type IN ('video', 'photo'))),
  CHECK ((json_array_length(photo_urls) <= 35)),
  CHECK (((tiktok_privacy_level IS NULL) OR (tiktok_privacy_level IN ('PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'))))
);

CREATE TABLE "automations" (
  "id" TEXT NOT NULL,
  "handler_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "app_id" TEXT,
  "cron" TEXT,
  "enabled" INTEGER NOT NULL DEFAULT 0 CHECK ("enabled" IN (0,1)),
  "status" TEXT NOT NULL DEFAULT 'idle' CHECK ("status" IN ('idle','running','failed','disabled')),
  "config" TEXT NOT NULL DEFAULT '{}' CHECK ("config" IS NULL OR json_valid("config")),
  "next_run_at" TEXT,
  "last_run_at" TEXT,
  "last_run_id" TEXT,
  "failure_streak" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "icon" TEXT NOT NULL DEFAULT 'gear',
  "accent" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'system',
  "orbit_ring" INTEGER NOT NULL DEFAULT 1,
  "orbit_position" REAL,
  "current_task" TEXT,
  "running_since" TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL,
  CHECK ((kind IN ('app', 'system')))
);

CREATE TABLE "creative_assets" (
  "id" TEXT NOT NULL,
  "app_slug" TEXT NOT NULL,
  "asset_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "source_kind" TEXT NOT NULL DEFAULT 'owner_upload',
  "source_url" TEXT,
  "licence_note" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((mime_type IN ('image/png', 'image/jpeg', 'image/webp'))),
  CHECK ((source_kind IN ('owner_upload', 'licensed_stock'))),
  PRIMARY KEY (id),
  UNIQUE (app_slug, asset_key),
  FOREIGN KEY (app_slug) REFERENCES apps(slug) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE "daily_reports" (
  "id" TEXT NOT NULL,
  "for_date" TEXT NOT NULL,
  "generated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "run_id" TEXT,
  "headline" TEXT,
  "summary" TEXT,
  "sections" TEXT NOT NULL DEFAULT '[]' CHECK ("sections" IS NULL OR json_valid("sections")),
  "metrics" TEXT NOT NULL DEFAULT '{}' CHECK ("metrics" IS NULL OR json_valid("metrics")),
  "delivery" TEXT NOT NULL DEFAULT 'unconfigured',
  "delivery_error" TEXT,
  CHECK ((delivery IN ('unconfigured', 'pending', 'sent', 'failed'))),
  PRIMARY KEY (id),
  UNIQUE (for_date),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
);

CREATE TABLE "integration_secrets" (
  "provider" TEXT NOT NULL,
  "secret_enc" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (provider),
  CHECK ((provider IN ('pexels', 'app_store_connect')))
);

CREATE TABLE "post_metrics" (
  "id" TEXT NOT NULL,
  "artifact_id" TEXT,
  "account_id" TEXT NOT NULL,
  "tiktok_post_id" TEXT NOT NULL,
  "captured_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "views" INTEGER,
  "likes" INTEGER,
  "comments" INTEGER,
  "shares" INTEGER,
  "watch_time_min" REAL,
  PRIMARY KEY (id),
  UNIQUE (tiktok_post_id, captured_at),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE CASCADE
);

CREATE TABLE "promotion_missions" (
  "id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "account_id" TEXT,
  "draft_run_id" TEXT,
  "producer_run_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "goal" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "angle" TEXT NOT NULL,
  "content_format" TEXT NOT NULL,
  "draft_count" INTEGER NOT NULL,
  "feature_rotation" TEXT NOT NULL DEFAULT '[]' CHECK ("feature_rotation" IS NULL OR json_valid("feature_rotation")),
  "auto_produce" INTEGER NOT NULL DEFAULT 1 CHECK ("auto_produce" IN (0,1)),
  "readiness" TEXT NOT NULL DEFAULT '{}' CHECK ("readiness" IS NULL OR json_valid("readiness")),
  "created_by" TEXT NOT NULL,
  "error" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "started_at" TEXT,
  "completed_at" TEXT,
  CHECK ((status IN ('queued', 'drafting', 'producing', 'awaiting_review', 'failed'))),
  CHECK ((goal IN ('downloads', 'feature_discovery', 'trust', 'engagement'))),
  CHECK ((angle IN ('relatable', 'problem_solution', 'proof', 'routine'))),
  CHECK ((content_format IN ('photo_carousel', 'video_brief'))),
  CHECK (((draft_count >= 1) AND (draft_count <= 6))),
  PRIMARY KEY (id),
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (draft_run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY (producer_run_id) REFERENCES runs(id) ON DELETE SET NULL,
  CHECK ((audience IN ('new_lifters', 'consistent_lifters', 'serious_gym', 'general_fitness', 'new_anglers', 'weekend_anglers', 'serious_anglers', 'local_crews')))
);

CREATE TABLE "run_events" (
  "id" INTEGER NOT NULL,
  "run_id" TEXT NOT NULL,
  "at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "level" TEXT NOT NULL DEFAULT 'info' CHECK ("level" IN ('debug','info','warn','error')),
  "message" TEXT NOT NULL,
  "data" TEXT CHECK ("data" IS NULL OR json_valid("data")),
  PRIMARY KEY (id),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE "runs" (
  "id" TEXT NOT NULL,
  "automation_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','running','succeeded','failed','cancelled')),
  "trigger" TEXT NOT NULL DEFAULT 'cron' CHECK ("trigger" IN ('cron','manual','chain')),
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "finished_at" TEXT,
  "duration_ms" INTEGER,
  "error" TEXT,
  "result" TEXT CHECK ("result" IS NULL OR json_valid("result")),
  PRIMARY KEY (id),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE TABLE "settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL CHECK ("value" IS NULL OR json_valid("value")),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (key)
);

CREATE TABLE "tiktok_accounts" (
  "id" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "display_name" TEXT,
  "app_id" TEXT,
  "open_id" TEXT,
  "access_token_enc" TEXT,
  "refresh_token_enc" TEXT,
  "token_expires_at" TEXT,
  "status" TEXT NOT NULL DEFAULT 'error' CHECK ("status" IN ('connected','expired','revoked','error')),
  "daily_post_limit" INTEGER NOT NULL DEFAULT 3,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "refresh_locked_until" TEXT,
  "refresh_token_expires_at" TEXT,
  "granted_scopes" TEXT,
  "token_provider" TEXT,
  "health" TEXT CHECK ("health" IS NULL OR json_valid("health")),
  UNIQUE (handle),
  PRIMARY KEY (id),
  UNIQUE (open_id),
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
);

CREATE TABLE "tiktok_delivery_slots" (
  "artifact_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "local_day" TEXT NOT NULL,
  "slot" TEXT NOT NULL,
  "reserved_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (artifact_id),
  UNIQUE (account_id, local_day, slot),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id),
  FOREIGN KEY (account_id) REFERENCES tiktok_accounts(id)
);

CREATE VIEW tiktok_accounts_public AS SELECT id,handle,display_name,app_id,status,daily_post_limit,token_expires_at,created_at FROM tiktok_accounts;

CREATE INDEX artifacts_account_id_status_published_at ON artifacts (account_id,status,published_at);

CREATE INDEX artifacts_app_id_status_created_at ON artifacts (app_id,status,created_at);

CREATE INDEX automations_enabled_next_run_at ON automations (enabled,next_run_at);

CREATE INDEX runs_automation_id_started_at ON runs (automation_id,started_at);

CREATE INDEX run_events_run_id_id ON run_events (run_id,id);

CREATE INDEX post_metrics_account_id_captured_at ON post_metrics (account_id,captured_at);

CREATE INDEX analytics_snapshots_account_id_captured_at ON analytics_snapshots (account_id,captured_at);
