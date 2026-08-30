-- Web-controlled creative production: encrypted provider credentials, exact
-- Deadset feature captures, private source storage and an automatic renderer.

create table public.integration_secrets (
  provider text primary key,
  secret_enc text not null,
  updated_at timestamptz not null default now(),
  constraint integration_secrets_provider check (provider in ('pexels'))
);

alter table public.integration_secrets enable row level security;
-- Intentionally no browser-facing policy. Only the Worker service role can
-- read or write encrypted integration secrets.

create table public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null references public.apps(slug) on update cascade on delete cascade,
  asset_key text not null,
  label text not null,
  storage_path text not null,
  mime_type text not null,
  width integer,
  height integer,
  source_kind text not null default 'owner_upload',
  source_url text,
  licence_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_slug, asset_key),
  constraint creative_assets_mime check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint creative_assets_source check (source_kind in ('owner_upload', 'licensed_stock'))
);

alter table public.creative_assets enable row level security;

create policy "owner can read creative assets"
  on public.creative_assets for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'theojandhyala@icloud.com');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'automation-media',
  'automation-media',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies: all upload/download access goes through the
-- authenticated Worker, and only deliberate /media paths are exposed.

insert into public.automations (
  handler_key,
  name,
  description,
  app_id,
  cron,
  enabled,
  config,
  icon,
  accent,
  kind,
  orbit_ring,
  next_run_at
)
select
  'tiktok.produce',
  'Build Deadset carousels',
  'Finds licensed photos, pairs them with exact Deadset screens, renders 9:16 slides and hosts the final files.',
  a.id,
  '*/15 * * * *',
  true,
  jsonb_build_object('app_slug', 'deadset', 'max_per_run', 2),
  'sparkles',
  '#8b5cf6',
  'app',
  2,
  now()
from public.apps a
where a.slug = 'deadset'
  and not exists (
    select 1 from public.automations x
    where x.handler_key = 'tiktok.produce' and x.app_id = a.id
  );

