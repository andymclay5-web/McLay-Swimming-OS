-- Phase 5 (10 Sept 2026) -- "remote/off-site monitoring and interaction for Andy," specifically the
-- "add alerts, not just a view" option: Andy wants to know something needs him -- starting with Jordan
-- proposing a stroke change that the evidence gate in engines/modification-edit.js held back for owner
-- review (row.pendingStrokeProposal, shipped in Phase 3) -- without having to happen to reopen that
-- swimmer's editor or notice the Board's small red flag. No push/notification/alert mechanism of any
-- kind existed anywhere in this app before this (confirmed repo-wide: no service-worker push handler,
-- no webhook, no email-sending code path other than Supabase's own OTP sign-in mail).
--
-- Design: real Web Push (RFC 8030 + VAPID), sent by a new Edge Function (send-coach-alert) that the
-- client calls directly and authenticated as the real signed-in user -- no database trigger, no pg_net,
-- no shared webhook secret needed, because the Edge Function's own verify_jwt=true already proves the
-- caller is a real, signed-in org member before it does anything. The VAPID keypair is the one genuine
-- secret this needs; rather than requiring Andy (who has no local dev environment or Supabase CLI -- see
-- the Delivery workflow notes in project memory) to set an Edge Function secret by hand, it lives in the
-- new app_secrets table below, readable only by the Edge Function's own auto-provided service-role
-- client (service_role bypasses RLS by Supabase convention; no anon/authenticated policy exists on this
-- table at all, so PostgREST can never serve it to a client regardless of RLS).

create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
-- Deliberately zero policies: RLS with no policy denies every row to anon/authenticated even if a future
-- grant is added by mistake. Only the service_role connection (Edge Functions' own auto-injected
-- SUPABASE_SERVICE_ROLE_KEY) can ever read or write this table, since service_role bypasses RLS by
-- Supabase's standard role configuration.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "members manage own push subscription" on public.push_subscriptions;
create policy "members manage own push subscription" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(organisation_id))
  with check (user_id = auth.uid() and public.is_org_member(organisation_id));
-- Deliberately no select-all-org-members policy: a subscription is a private capability of the device
-- that registered it, not something Jordan should be able to enumerate for Andy's phone. The Edge
-- Function reads across users' subscriptions via its own service-role client, not this policy.

create table if not exists public.coach_alerts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text references public.sessions(id) on delete set null,
  athlete_id text references public.athletes(id) on delete set null,
  kind text not null,
  title text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.coach_alerts enable row level security;
drop policy if exists "members read coach_alerts" on public.coach_alerts;
create policy "members read coach_alerts" on public.coach_alerts
  for select to authenticated using (public.is_org_member(organisation_id));
drop policy if exists "members insert coach_alerts" on public.coach_alerts;
create policy "members insert coach_alerts" on public.coach_alerts
  for insert to authenticated with check (public.is_org_member(organisation_id));
drop policy if exists "members update coach_alerts" on public.coach_alerts;
create policy "members update coach_alerts" on public.coach_alerts
  for update to authenticated using (public.is_org_member(organisation_id)) with check (public.is_org_member(organisation_id));
-- This table is also the durable, in-app fallback for the alert itself: even on a device that never
-- enables push (permission denied, unsupported browser, notifications muted), the record of "Jordan
-- proposed a stroke change" survives here and can be listed/read -- push delivery is a convenience on
-- top of it, never the only record, matching this app's "local/durable data first, notification is an
-- add-on" convention elsewhere (e.g. the Board's pendingStrokeFlag already shows it with zero network).

create index if not exists coach_alerts_org_unread_idx on public.coach_alerts(organisation_id, read_at);
