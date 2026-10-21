-- Set library reviews and coach-written sets (19 Oct 2026). Andy: "identify if it's my session or your session, my set or
-- your set, or one that Jordan's written or one that Caleb's written. I think the author of the set should be shown" /
-- review in "a sheet or an editable form".
-- One row per set the team has a say on: the head coach's decision on a built-in or Claude set (approved / rejected,
-- with his edits), or a set a coach added. The built-in sets themselves ship with the app (engines/session-methodology.js,
-- engines/set-library-data.js); engines/set-library.js merges these rows over them.
create table if not exists public.msos_set_library (
  id text primary key,
  organisation_id uuid not null,
  section text,                      -- WARM UP | PRE SET | MAIN SET | POST SET | WARM DOWN
  label text,
  text text,                         -- null = keep the built-in text
  use_note text,
  author text,                       -- Andy | Jordan | Kaleb | Claude | ChatGPT | ...
  status text not null default 'proposed',   -- approved | proposed | rejected
  focus text[],
  reviewed_by_name text,
  set_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.msos_set_library enable row level security;
create policy "coaches read set library" on public.msos_set_library for select to authenticated using (public.is_org_member_coach(organisation_id));
-- any coach can add a set (it waits for review); only the head coach approves or rejects
create policy "coaches add sets" on public.msos_set_library for insert to authenticated with check (public.is_org_member_coach(organisation_id) and (status='proposed' or public.mclay_is_owner(organisation_id)));
create policy "head coach reviews sets" on public.msos_set_library for update to authenticated using (public.mclay_is_owner(organisation_id)) with check (public.mclay_is_owner(organisation_id));
grant select, insert, update on public.msos_set_library to authenticated;
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026 (migration set_library_20261019).
