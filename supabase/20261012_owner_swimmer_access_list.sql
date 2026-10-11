-- 12 Oct 2026 (applied to the live project by Claude via Supabase MCP). Andy: "somewhere we can see swimmers that
-- have the app, and manage that". Read-only summary per swimmer for the owner: active device links (QR), last
-- seen, real-account link, last published portal update, open invites. Owner-only, same check as
-- msos_revoke_swimmer_devices. No tokens or hashes are returned.
create or replace function public.msos_owner_swimmer_access()
returns table(athlete_id text, devices integer, last_seen_at timestamptz, has_account boolean, last_published_at timestamptz, open_invites integer)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  return query
  with ids as (
    select d.athlete_id from public.msos_swimmer_devices d
    union select p.athlete_id from public.msos_swimmer_payloads p
    union select i.athlete_id from public.msos_swimmer_invites i
    union select a.id from public.athletes a where a.linked_user_id is not null
  )
  select ids.athlete_id,
    (select count(*)::int from public.msos_swimmer_devices d where d.athlete_id=ids.athlete_id and d.revoked_at is null),
    (select max(d.last_seen_at) from public.msos_swimmer_devices d where d.athlete_id=ids.athlete_id and d.revoked_at is null),
    exists(select 1 from public.athletes a where a.id=ids.athlete_id and a.linked_user_id is not null),
    (select max(p.published_at) from public.msos_swimmer_payloads p where p.athlete_id=ids.athlete_id),
    (select count(*)::int from public.msos_swimmer_invites i where i.athlete_id=ids.athlete_id and i.consumed_at is null and i.expires_at>now())
  from ids;
end $$;
revoke all on function public.msos_owner_swimmer_access() from public, anon;
grant execute on function public.msos_owner_swimmer_access() to authenticated;
