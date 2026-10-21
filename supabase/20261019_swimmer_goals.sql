-- Swimmer goals (19 Oct 2026). Andy (after William's mum's idea): choose a goal for a swimmer -- e.g. "win a gold medal at
-- New Zealand Age Groups" -- and show it on the TV "at a push". One goal per swimmer: an event + a standard from that
-- swimmer's pathway ladder (qualifying / final / medal), or a coach-typed target time. Any coach who can see the swimmer
-- can set it; who set it is kept. Written by the phones' normal sync queue (engines/swimmer-goals.js).
create table if not exists public.msos_swimmer_goals (
  id text primary key,                         -- = athlete id (one goal per swimmer)
  organisation_id uuid not null,
  athlete_id text not null,
  goal jsonb,                                  -- {distance, stroke, course, label, kind, seconds, note} or null = cleared
  set_by uuid default auth.uid(),
  set_by_name text,
  updated_at timestamptz not null default now()
);
alter table public.msos_swimmer_goals enable row level security;
create policy "coaches read swimmer goals" on public.msos_swimmer_goals for select to authenticated using (public.mclay_can_view_athlete(organisation_id, athlete_id));
create policy "coaches add swimmer goals" on public.msos_swimmer_goals for insert to authenticated with check (public.mclay_can_view_athlete(organisation_id, athlete_id));
create policy "coaches change swimmer goals" on public.msos_swimmer_goals for update to authenticated using (public.mclay_can_view_athlete(organisation_id, athlete_id)) with check (public.mclay_can_view_athlete(organisation_id, athlete_id));
grant select, insert, update on public.msos_swimmer_goals to authenticated;
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026 (migration swimmer_goals_20261019).
