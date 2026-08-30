-- Secure remote operations: encrypted App Store Connect credentials and a
-- two-stage audit trail for production offer-code creation.

alter table public.integration_secrets
  drop constraint integration_secrets_provider;

alter table public.integration_secrets
  add constraint integration_secrets_provider
  check (provider in ('pexels', 'app_store_connect'));

create table public.apple_offer_code_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_confirmation',
  apple_app_id text not null,
  app_name text not null,
  subscription_id text not null,
  subscription_name text not null,
  offer_code_id text not null,
  offer_name text not null,
  custom_code text not null,
  redemption_limit integer not null,
  expiration_date date,
  apple_resource_id text,
  redemption_url text,
  error text,
  created_by text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  constraint apple_offer_code_status check (
    status in ('pending_confirmation', 'creating', 'succeeded', 'failed')
  ),
  constraint apple_offer_code_format check (custom_code ~ '^[A-Z0-9]{2,64}$'),
  constraint apple_offer_code_limit check (redemption_limit between 1 and 25000)
);

alter table public.apple_offer_code_requests enable row level security;

create policy "owner can read Apple offer-code requests"
  on public.apple_offer_code_requests for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'theojandhyala@icloud.com');

create index apple_offer_code_requests_created_idx
  on public.apple_offer_code_requests (created_at desc);
