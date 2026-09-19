// Generated from recovered live schema; contains no records or credentials.
export interface ColumnSpec { kind: string; nullable: boolean; generated?: string; default?: unknown }
export const operationsSchema: Record<string, Record<string, ColumnSpec>> = {
  "analytics_snapshots": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "account_id": {
      "kind": "string",
      "nullable": false
    },
    "app_id": {
      "kind": "string",
      "nullable": true
    },
    "captured_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "followers": {
      "kind": "number",
      "nullable": true
    },
    "following": {
      "kind": "number",
      "nullable": true
    },
    "likes_total": {
      "kind": "number",
      "nullable": true
    },
    "video_count": {
      "kind": "number",
      "nullable": true
    },
    "views_28d": {
      "kind": "number",
      "nullable": true
    },
    "watch_time_min": {
      "kind": "number",
      "nullable": true
    },
    "comments_28d": {
      "kind": "number",
      "nullable": true
    },
    "shares_28d": {
      "kind": "number",
      "nullable": true
    },
    "quality": {
      "kind": "string",
      "nullable": false,
      "default": "ok"
    },
    "raw": {
      "kind": "json",
      "nullable": true
    }
  },
  "apple_offer_code_requests": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "pending_confirmation"
    },
    "apple_app_id": {
      "kind": "string",
      "nullable": false
    },
    "app_name": {
      "kind": "string",
      "nullable": false
    },
    "subscription_id": {
      "kind": "string",
      "nullable": false
    },
    "subscription_name": {
      "kind": "string",
      "nullable": false
    },
    "offer_code_id": {
      "kind": "string",
      "nullable": false
    },
    "offer_name": {
      "kind": "string",
      "nullable": false
    },
    "custom_code": {
      "kind": "string",
      "nullable": false
    },
    "redemption_limit": {
      "kind": "number",
      "nullable": false
    },
    "expiration_date": {
      "kind": "string",
      "nullable": true
    },
    "apple_resource_id": {
      "kind": "string",
      "nullable": true
    },
    "redemption_url": {
      "kind": "string",
      "nullable": true
    },
    "error": {
      "kind": "string",
      "nullable": true
    },
    "created_by": {
      "kind": "string",
      "nullable": false
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "confirmed_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "completed_at": {
      "kind": "timestamp",
      "nullable": true
    }
  },
  "apps": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "slug": {
      "kind": "string",
      "nullable": false
    },
    "name": {
      "kind": "string",
      "nullable": false
    },
    "tagline": {
      "kind": "string",
      "nullable": true
    },
    "app_store_url": {
      "kind": "string",
      "nullable": true
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "accent": {
      "kind": "string",
      "nullable": false,
      "default": "#6ea8fe"
    },
    "icon": {
      "kind": "string",
      "nullable": false,
      "default": "sparkle"
    },
    "sort_order": {
      "kind": "number",
      "nullable": false,
      "default": 0
    },
    "promotion_enabled": {
      "kind": "boolean",
      "nullable": false,
      "default": true
    }
  },
  "artifacts": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "run_id": {
      "kind": "string",
      "nullable": true
    },
    "app_id": {
      "kind": "string",
      "nullable": true
    },
    "account_id": {
      "kind": "string",
      "nullable": true
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "draft"
    },
    "hook": {
      "kind": "string",
      "nullable": true
    },
    "caption": {
      "kind": "string",
      "nullable": true
    },
    "hashtags": {
      "kind": "json",
      "nullable": false,
      "default": []
    },
    "video_url": {
      "kind": "string",
      "nullable": true
    },
    "thumbnail_url": {
      "kind": "string",
      "nullable": true
    },
    "duration_s": {
      "kind": "number",
      "nullable": true
    },
    "publish_id": {
      "kind": "string",
      "nullable": true
    },
    "tiktok_post_id": {
      "kind": "string",
      "nullable": true
    },
    "error": {
      "kind": "string",
      "nullable": true
    },
    "scheduled_for": {
      "kind": "timestamp",
      "nullable": true
    },
    "published_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "updated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "stage": {
      "kind": "string",
      "nullable": false,
      "default": "concept"
    },
    "stages": {
      "kind": "json",
      "nullable": false,
      "default": {}
    },
    "shot_notes": {
      "kind": "string",
      "nullable": true
    },
    "script": {
      "kind": "string",
      "nullable": true
    },
    "media_type": {
      "kind": "string",
      "nullable": false,
      "default": "video"
    },
    "photo_urls": {
      "kind": "json",
      "nullable": false,
      "default": []
    },
    "asset_manifest": {
      "kind": "json",
      "nullable": false,
      "default": {}
    },
    "tiktok_privacy_level": {
      "kind": "string",
      "nullable": true
    },
    "disable_comment": {
      "kind": "boolean",
      "nullable": false,
      "default": true
    },
    "auto_add_music": {
      "kind": "boolean",
      "nullable": false,
      "default": false
    },
    "brand_organic_toggle": {
      "kind": "boolean",
      "nullable": false,
      "default": false
    },
    "brand_content_toggle": {
      "kind": "boolean",
      "nullable": false,
      "default": false
    },
    "is_aigc": {
      "kind": "boolean",
      "nullable": false,
      "default": false
    },
    "posting_consent_at": {
      "kind": "timestamp",
      "nullable": true
    }
  },
  "automations": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "handler_key": {
      "kind": "string",
      "nullable": false
    },
    "name": {
      "kind": "string",
      "nullable": false
    },
    "description": {
      "kind": "string",
      "nullable": true
    },
    "app_id": {
      "kind": "string",
      "nullable": true
    },
    "cron": {
      "kind": "string",
      "nullable": true
    },
    "enabled": {
      "kind": "boolean",
      "nullable": false,
      "default": false
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "idle"
    },
    "config": {
      "kind": "json",
      "nullable": false,
      "default": {}
    },
    "next_run_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "last_run_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "last_run_id": {
      "kind": "string",
      "nullable": true
    },
    "failure_streak": {
      "kind": "number",
      "nullable": false,
      "default": 0
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "updated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "icon": {
      "kind": "string",
      "nullable": false,
      "default": "gear"
    },
    "accent": {
      "kind": "string",
      "nullable": true
    },
    "kind": {
      "kind": "string",
      "nullable": false,
      "default": "system"
    },
    "orbit_ring": {
      "kind": "number",
      "nullable": false,
      "default": 1
    },
    "orbit_position": {
      "kind": "number",
      "nullable": true
    },
    "current_task": {
      "kind": "string",
      "nullable": true
    },
    "running_since": {
      "kind": "timestamp",
      "nullable": true
    }
  },
  "creative_assets": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "app_slug": {
      "kind": "string",
      "nullable": false
    },
    "asset_key": {
      "kind": "string",
      "nullable": false
    },
    "label": {
      "kind": "string",
      "nullable": false
    },
    "storage_path": {
      "kind": "string",
      "nullable": false
    },
    "mime_type": {
      "kind": "string",
      "nullable": false
    },
    "width": {
      "kind": "number",
      "nullable": true
    },
    "height": {
      "kind": "number",
      "nullable": true
    },
    "source_kind": {
      "kind": "string",
      "nullable": false,
      "default": "owner_upload"
    },
    "source_url": {
      "kind": "string",
      "nullable": true
    },
    "licence_note": {
      "kind": "string",
      "nullable": true
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "updated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    }
  },
  "daily_reports": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "for_date": {
      "kind": "string",
      "nullable": false
    },
    "generated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "run_id": {
      "kind": "string",
      "nullable": true
    },
    "headline": {
      "kind": "string",
      "nullable": true
    },
    "summary": {
      "kind": "string",
      "nullable": true
    },
    "sections": {
      "kind": "json",
      "nullable": false,
      "default": []
    },
    "metrics": {
      "kind": "json",
      "nullable": false,
      "default": {}
    },
    "delivery": {
      "kind": "string",
      "nullable": false,
      "default": "unconfigured"
    },
    "delivery_error": {
      "kind": "string",
      "nullable": true
    }
  },
  "integration_secrets": {
    "provider": {
      "kind": "string",
      "nullable": false
    },
    "secret_enc": {
      "kind": "string",
      "nullable": false
    },
    "updated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    }
  },
  "post_metrics": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "artifact_id": {
      "kind": "string",
      "nullable": true
    },
    "account_id": {
      "kind": "string",
      "nullable": false
    },
    "tiktok_post_id": {
      "kind": "string",
      "nullable": false
    },
    "captured_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "views": {
      "kind": "number",
      "nullable": true
    },
    "likes": {
      "kind": "number",
      "nullable": true
    },
    "comments": {
      "kind": "number",
      "nullable": true
    },
    "shares": {
      "kind": "number",
      "nullable": true
    },
    "watch_time_min": {
      "kind": "number",
      "nullable": true
    }
  },
  "promotion_missions": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "app_id": {
      "kind": "string",
      "nullable": false
    },
    "account_id": {
      "kind": "string",
      "nullable": true
    },
    "draft_run_id": {
      "kind": "string",
      "nullable": true
    },
    "producer_run_id": {
      "kind": "string",
      "nullable": true
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "queued"
    },
    "goal": {
      "kind": "string",
      "nullable": false
    },
    "audience": {
      "kind": "string",
      "nullable": false
    },
    "angle": {
      "kind": "string",
      "nullable": false
    },
    "content_format": {
      "kind": "string",
      "nullable": false
    },
    "draft_count": {
      "kind": "number",
      "nullable": false
    },
    "feature_rotation": {
      "kind": "json",
      "nullable": false,
      "default": []
    },
    "auto_produce": {
      "kind": "boolean",
      "nullable": false,
      "default": true
    },
    "readiness": {
      "kind": "json",
      "nullable": false,
      "default": {}
    },
    "created_by": {
      "kind": "string",
      "nullable": false
    },
    "error": {
      "kind": "string",
      "nullable": true
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "started_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "completed_at": {
      "kind": "timestamp",
      "nullable": true
    }
  },
  "run_events": {
    "id": {
      "kind": "number",
      "nullable": false,
      "generated": "sequence"
    },
    "run_id": {
      "kind": "string",
      "nullable": false
    },
    "at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "level": {
      "kind": "string",
      "nullable": false,
      "default": "info"
    },
    "message": {
      "kind": "string",
      "nullable": false
    },
    "data": {
      "kind": "json",
      "nullable": true
    }
  },
  "runs": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "automation_id": {
      "kind": "string",
      "nullable": false
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "queued"
    },
    "trigger": {
      "kind": "string",
      "nullable": false,
      "default": "cron"
    },
    "started_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "finished_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "duration_ms": {
      "kind": "number",
      "nullable": true
    },
    "error": {
      "kind": "string",
      "nullable": true
    },
    "result": {
      "kind": "json",
      "nullable": true
    }
  },
  "settings": {
    "key": {
      "kind": "string",
      "nullable": false
    },
    "value": {
      "kind": "json",
      "nullable": false
    },
    "updated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    }
  },
  "tiktok_accounts": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "handle": {
      "kind": "string",
      "nullable": false
    },
    "display_name": {
      "kind": "string",
      "nullable": true
    },
    "app_id": {
      "kind": "string",
      "nullable": true
    },
    "open_id": {
      "kind": "string",
      "nullable": true
    },
    "access_token_enc": {
      "kind": "string",
      "nullable": true
    },
    "refresh_token_enc": {
      "kind": "string",
      "nullable": true
    },
    "token_expires_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "error"
    },
    "daily_post_limit": {
      "kind": "number",
      "nullable": false,
      "default": 3
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "updated_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    },
    "refresh_locked_until": {
      "kind": "timestamp",
      "nullable": true
    },
    "refresh_token_expires_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "granted_scopes": {
      "kind": "string",
      "nullable": true
    },
    "token_provider": {
      "kind": "string",
      "nullable": true
    },
    "health": {
      "kind": "json",
      "nullable": true
    }
  },
  "tiktok_delivery_slots": {
    "artifact_id": {
      "kind": "string",
      "nullable": false
    },
    "account_id": {
      "kind": "string",
      "nullable": false
    },
    "local_day": {
      "kind": "string",
      "nullable": false
    },
    "slot": {
      "kind": "string",
      "nullable": false
    },
    "reserved_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    }
  },
  "tiktok_accounts_public": {
    "id": {
      "kind": "string",
      "nullable": false,
      "generated": "uuid"
    },
    "handle": {
      "kind": "string",
      "nullable": false
    },
    "display_name": {
      "kind": "string",
      "nullable": true
    },
    "app_id": {
      "kind": "string",
      "nullable": true
    },
    "status": {
      "kind": "string",
      "nullable": false,
      "default": "error"
    },
    "daily_post_limit": {
      "kind": "number",
      "nullable": false,
      "default": 3
    },
    "token_expires_at": {
      "kind": "timestamp",
      "nullable": true
    },
    "created_at": {
      "kind": "timestamp",
      "nullable": false,
      "generated": "now"
    }
  }
};
