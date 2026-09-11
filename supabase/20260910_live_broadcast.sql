-- McLay Swimming OS · cross-device live-times broadcast (Phase 4)
--
-- Real coaching failure this fixes: engines/live-training-authority.js already has a working "live" relay
-- (M.live, BroadcastChannel channel name 'mclay-swimming-v4-live') that pushes the session board plus any
-- freshly-saved timed-set/T400 results to any tab in derived-display mode (view='tv' or 'swimmer') the
-- instant the coach's device saves -- but BroadcastChannel is same-browser-context only. A TV screen at
-- poolside is a SEPARATE physical device from the coach's phone, so today it never receives anything: it
-- shows whatever session board was open when it was last manually refreshed, and never updates as the
-- coach records times. This table is the cross-device transport for the exact same payload
-- (engines/live-training-authority.js's L.payload) -- one row per session, upserted repeatedly by whichever
-- coach device is actively running the session, polled by any TV device showing that same session.
--
-- Deliberately NOT a new realtime/websocket subscription (none exist anywhere in this codebase -- see
-- app.js's C.reconcileSession header comment) -- this follows the same REST-poll pattern already
-- established for session sync (Phase 2, 10 Sept 2026), just at a faster interval suited to "live" (see
-- engines/live-training-authority.js's L.pullCloud / the 4-second TV poll timer).
create table if not exists public.live_broadcast (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 0,
  from_instance text,
  updated_at timestamptz not null default now(),
  primary key (organisation_id, session_id)
);

alter table public.live_broadcast enable row level security;

-- Same policy pattern as the shared "members read/insert/update <table>" loop in
-- mclay_swimming_os_supabase_schema.sql -- any signed-in member of the organisation (owner or assistant
-- coach alike) can read the current live snapshot or push a new one; there is no separate "TV" identity,
-- a TV device is just another signed-in device showing view='tv' (see engines/access-authority.js's
-- display.tv capability).
drop policy if exists "members read live_broadcast" on public.live_broadcast;
create policy "members read live_broadcast" on public.live_broadcast
for select to authenticated using (public.is_org_member(organisation_id));

drop policy if exists "members insert live_broadcast" on public.live_broadcast;
create policy "members insert live_broadcast" on public.live_broadcast
for insert to authenticated with check (public.is_org_member(organisation_id));

drop policy if exists "members update live_broadcast" on public.live_broadcast;
create policy "members update live_broadcast" on public.live_broadcast
for update to authenticated using (public.is_org_member(organisation_id)) with check (public.is_org_member(organisation_id));
