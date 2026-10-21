-- 19 Oct 2026: assistant coaches' phones could never create a new session or add a visitor swimmer.
-- Found in tonight's logs: Jordan's iPhone was refused ("new row violates row-level security policy") 600+ times
-- in 20 minutes and retried for ever. Cause: the app saves with INSERT ... ON CONFLICT DO UPDATE (safe to retry), and
-- for that statement Postgres also checks the NEW row against the table's SELECT policies. The existing SELECT
-- policies (mclay_can_view_session / mclay_can_view_athlete) look the row up by id -- a brand-new row is not there
-- yet, so the answer was always "no" for anyone but the owner. These extra SELECT policies give the same answer
-- from the row's own squad(s), so the same people see the same rows; they just also work for the row being saved.
-- Verified: as Jordan, a new National session / visitor saves; a Masters session (not his squad) is still refused.
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026.
create or replace function public.mclay_can_view_squads(target_org uuid, target_squads text[])
returns boolean language sql stable security definer set search_path to 'public','auth' as $$
  select public.mclay_is_owner(target_org)
      or (public.mclay_has_permission(target_org,'view_all_squads') and public.mclay_is_active_member(target_org))
      or exists (select 1 from public.organisation_members m
        where m.organisation_id=target_org and m.user_id=auth.uid() and coalesce(m.active,true)
          and exists (select 1 from unnest(coalesce(m.assigned_squads,'{}'::text[])) assigned
                      join unnest(coalesce(target_squads,'{}'::text[])) sq on lower(trim(assigned))=lower(trim(sq))));
$$;
revoke all on function public.mclay_can_view_squads(uuid,text[]) from public, anon;
grant execute on function public.mclay_can_view_squads(uuid,text[]) to authenticated;
create policy "assigned coach reads sessions by squad" on public.sessions for select to authenticated using (public.mclay_can_view_squads(organisation_id, squads));
create policy "assigned coach reads athletes by squad" on public.athletes for select to authenticated using (public.mclay_can_view_squad(organisation_id, squad));
