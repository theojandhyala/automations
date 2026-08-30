-- Native TikTok photo carousels, source provenance and the creator-controlled
-- posting choices required by TikTok's Content Posting API.

alter table public.artifacts
  add column media_type text not null default 'video'
    check (media_type in ('video', 'photo')),
  add column photo_urls text[] not null default '{}',
  add column asset_manifest jsonb not null default '{}'::jsonb,
  add column tiktok_privacy_level text,
  add column disable_comment boolean not null default true,
  add column auto_add_music boolean not null default false,
  add column brand_organic_toggle boolean not null default false,
  add column brand_content_toggle boolean not null default false,
  add column is_aigc boolean not null default false,
  add column posting_consent_at timestamptz;

alter table public.artifacts
  add constraint artifacts_photo_count
  check (cardinality(photo_urls) <= 35),
  add constraint artifacts_privacy_level
  check (
    tiktok_privacy_level is null or
    tiktok_privacy_level in (
      'PUBLIC_TO_EVERYONE',
      'FOLLOWER_OF_CREATOR',
      'MUTUAL_FOLLOW_FRIENDS',
      'SELF_ONLY'
    )
  );

-- Deadset now drafts the two-slide native photo format three times a week.
-- These are drafts only: the schedule does not bypass the review/consent gate.
update public.automations a
   set name = 'Draft native carousels — Deadset',
       description = 'Drafts real-photo hooks paired with exact Deadset feature proof.',
       cron = '0 18 * * 1,3,5',
       config = jsonb_build_object(
         'app_slug', 'deadset',
         'count', 2,
         'content_format', 'photo_carousel',
         'source_policy', 'licensed_real_only',
         'feature_rotation', jsonb_build_array(
           'muscle_diagram',
           'training_heatmap',
           'pr_wall',
           'progression_board',
           'workout_plan',
           'live_logger'
         )
       )
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'deadset'
   and a.handler_key = 'tiktok.generate';

update public.automations
   set name = 'Publish approved TikToks',
       description = 'Publishes only owner-reviewed videos or photo carousels with explicit posting choices.'
 where handler_key = 'tiktok.publish';
