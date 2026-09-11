-- McLay Swimming OS · authorship columns for real cross-device session sync (Phase 2)
--
-- Real coaching failure this fixes (Andy's own words): "every edit gets tagged with who made it... yours
-- always wins over his if you both touch the same thing -- never the other way round." Today the
-- `sessions` row a device pushes carries no record of WHO last edited it, so there is no way for a
-- second device pulling this row back down to know whether the edit it's looking at came from the owner
-- or from an assistant coach -- which is required before any priority-based (owner always wins) merge
-- rule can exist at all.
--
-- Applied live to project cwoqjxiniuwmslltsfgi on 10 Sept 2026 (migration name
-- sessions_last_editor_authorship); this file records it in the repo for the record/future reference.
alter table public.sessions add column if not exists last_editor_role text;
alter table public.sessions add column if not exists last_editor_name text;
comment on column public.sessions.last_editor_role is 'owner | assistant -- whichever device last pushed this session row, per engines/team-access.js / access-authority.js role at the moment of the edit. Used by the client-side owner-priority merge rule (never enforced here, since sync is REST push/pull, not a trusted server-side writer check -- see the "always wins" comment for why this stays a client convenience, not the security boundary).';
comment on column public.sessions.last_editor_name is 'Display name of whoever last pushed this session row (owner display name, or the assistant coach display name from organisation_members) -- shown to coaches so a sync conflict is explainable, not just silently resolved.';
