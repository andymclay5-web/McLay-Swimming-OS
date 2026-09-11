-- McLay Swimming OS · self-service membership lookup for real, signed-in team access
--
-- Real coaching failure this fixes (Andy's own words, following on from the assistant-coach access review):
-- the assistant-coach invite/accept RPCs (mclay_create_assistant_invite, mclay_accept_assistant_invite) already
-- existed and work correctly, but nothing let an already-accepted coach (e.g. Jordan) find out "what am I on
-- this organisation" on a LATER app load -- mclay_coach_access_roster is owner-only by design (it lists
-- everyone), and organisation_members itself has RLS enabled with no policies at all, so a plain REST select
-- returns nothing for anyone. Without this, Jordan's device would only ever know its own role for the single
-- session right after accepting an invite; reopening the app tomorrow would have no way to re-confirm his role,
-- squads or permissions, or notice Andy revoked/changed his access.
--
-- This is intentionally narrow: it returns only the calling user's own row (auth.uid() = user_id), never
-- anyone else's -- unlike mclay_coach_access_roster it needs no owner check, because a member reading their own
-- membership is always safe.

create or replace function public.mclay_my_membership(target_org uuid)
returns table(role text, display_name text, email text, active boolean, assigned_squads text[], permissions jsonb)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.role, m.display_name, m.email, m.active, m.assigned_squads, m.permissions
  from public.organisation_members m
  where m.organisation_id = target_org
    and m.user_id = auth.uid();
$$;

grant execute on function public.mclay_my_membership(uuid) to authenticated;
