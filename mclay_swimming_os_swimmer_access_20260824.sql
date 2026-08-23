-- McLay Swimming OS · secure swimmer access · 2026-08-24
-- Apply once in the MSOS Supabase SQL editor before issuing the first swimmer QR.
-- No service-role key is used by the browser. Invite secrets are never stored in plaintext.

create extension if not exists pgcrypto;

create table if not exists public.athlete_user_access (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  athlete_id text not null references public.athletes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null default 'swimmer' check (access_role in ('swimmer','parent')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  primary key (athlete_id,user_id)
);
create index if not exists athlete_user_access_user_idx on public.athlete_user_access(user_id) where active;

create table if not exists public.swimmer_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  athlete_id text not null references public.athletes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create index if not exists swimmer_invites_active_idx on public.swimmer_invites(athlete_id,expires_at)
where claimed_at is null and revoked_at is null;

create table if not exists public.swimmer_session_access (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  athlete_id text not null references public.athletes(id) on delete cascade,
  session_id text not null references public.sessions(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  primary key (athlete_id,session_id)
);

alter table public.athlete_user_access enable row level security;
alter table public.swimmer_invites enable row level security;
alter table public.swimmer_session_access enable row level security;

-- Current v4 evidence already understands audience. Older databases may not have the column.
alter table if exists public.captures add column if not exists audience text not null default 'coach';

create or replace function public.msos_is_org_admin(org uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.organisations o where o.id=org and o.owner_id=auth.uid())
      or exists(select 1 from public.organisation_members m where m.organisation_id=org and m.user_id=auth.uid() and m.role in ('owner','admin'));
$$;

create or replace function public.msos_can_access_athlete(aid text)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.athlete_user_access x
    where x.athlete_id=aid and x.user_id=auth.uid() and x.active=true and x.revoked_at is null
  );
$$;

revoke all on function public.msos_is_org_admin(uuid) from public;
revoke all on function public.msos_can_access_athlete(text) from public;
grant execute on function public.msos_is_org_admin(uuid) to authenticated;
grant execute on function public.msos_can_access_athlete(text) to authenticated;

-- Access-link tables: owner/admin manages; swimmer can only see their own active link.
drop policy if exists "admins manage athlete user access" on public.athlete_user_access;
create policy "admins manage athlete user access" on public.athlete_user_access
for all to authenticated
using (public.msos_is_org_admin(organisation_id))
with check (public.msos_is_org_admin(organisation_id));

drop policy if exists "users read own athlete access" on public.athlete_user_access;
create policy "users read own athlete access" on public.athlete_user_access
for select to authenticated using (user_id=auth.uid() and active=true and revoked_at is null);

drop policy if exists "admins manage swimmer invites" on public.swimmer_invites;
create policy "admins manage swimmer invites" on public.swimmer_invites
for all to authenticated
using (public.msos_is_org_admin(organisation_id))
with check (public.msos_is_org_admin(organisation_id));

drop policy if exists "admins manage swimmer session access" on public.swimmer_session_access;
create policy "admins manage swimmer session access" on public.swimmer_session_access
for all to authenticated
using (public.msos_is_org_admin(organisation_id))
with check (public.msos_is_org_admin(organisation_id));

drop policy if exists "swimmers read own session grants" on public.swimmer_session_access;
create policy "swimmers read own session grants" on public.swimmer_session_access
for select to authenticated using (public.msos_can_access_athlete(athlete_id) and active=true);

-- Owner creates a short-lived invite from a SHA-256 hash generated on-device.
create or replace function public.create_swimmer_invite(p_athlete_id text,p_token_hash text,p_expires_minutes integer default 15)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  a public.athletes%rowtype;
  r public.swimmer_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invite hash'; end if;
  select * into a from public.athletes where id=p_athlete_id and active=true;
  if a.id is null or not public.msos_is_org_admin(a.organisation_id) then raise exception 'Not permitted'; end if;
  update public.swimmer_invites set revoked_at=now()
    where athlete_id=a.id and claimed_at is null and revoked_at is null;
  insert into public.swimmer_invites(organisation_id,athlete_id,token_hash,expires_at,created_by)
  values(a.organisation_id,a.id,lower(p_token_hash),now()+make_interval(mins=>greatest(2,least(coalesce(p_expires_minutes,15),60))),auth.uid())
  returning * into r;
  return jsonb_build_object('invite_id',r.id,'athlete_id',r.athlete_id,'expires_at',r.expires_at);
end $$;

-- Claim is one-time, authenticated, expiry checked, and atomically consumes the invite.
create or replace function public.claim_swimmer_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  r public.swimmer_invites%rowtype;
  h text;
begin
  if auth.uid() is null then raise exception 'Sign in before claiming access'; end if;
  if length(coalesce(p_token,'')) < 20 then raise exception 'Invalid invite'; end if;
  h:=encode(digest(p_token,'sha256'),'hex');
  select * into r from public.swimmer_invites
    where token_hash=h and claimed_at is null and revoked_at is null and expires_at>now()
    for update;
  if r.id is null then raise exception 'Invite is invalid, expired, already used or revoked'; end if;
  insert into public.athlete_user_access(organisation_id,athlete_id,user_id,access_role,active,created_by)
    values(r.organisation_id,r.athlete_id,auth.uid(),'swimmer',true,r.created_by)
    on conflict (athlete_id,user_id) do update set active=true,revoked_at=null,revoked_by=null;
  update public.swimmer_invites set claimed_at=now(),claimed_by=auth.uid() where id=r.id;
  return jsonb_build_object('athlete_id',r.athlete_id,'organisation_id',r.organisation_id,'role','swimmer');
end $$;

create or replace function public.revoke_swimmer_access(p_athlete_id text)
returns integer
language plpgsql security definer set search_path=public
as $$
declare
  org uuid;
  n integer;
begin
  select organisation_id into org from public.athletes where id=p_athlete_id;
  if org is null or not public.msos_is_org_admin(org) then raise exception 'Not permitted'; end if;
  update public.athlete_user_access set active=false,revoked_at=now(),revoked_by=auth.uid()
   where athlete_id=p_athlete_id and active=true;
  get diagnostics n=row_count;
  update public.swimmer_invites set revoked_at=coalesce(revoked_at,now()) where athlete_id=p_athlete_id and claimed_at is null;
  return n;
end $$;

create or replace function public.swimmer_access_status(p_athlete_id text)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare org uuid;
begin
  select organisation_id into org from public.athletes where id=p_athlete_id;
  if org is null or not public.msos_is_org_admin(org) then raise exception 'Not permitted'; end if;
  return jsonb_build_object(
    'active_users',(select count(*) from public.athlete_user_access where athlete_id=p_athlete_id and active=true and revoked_at is null),
    'pending_invites',(select count(*) from public.swimmer_invites where athlete_id=p_athlete_id and claimed_at is null and revoked_at is null and expires_at>now())
  );
end $$;

revoke all on function public.create_swimmer_invite(text,text,integer) from public;
revoke all on function public.claim_swimmer_invite(text) from public;
revoke all on function public.revoke_swimmer_access(text) from public;
revoke all on function public.swimmer_access_status(text) from public;
grant execute on function public.create_swimmer_invite(text,text,integer) to authenticated;
grant execute on function public.claim_swimmer_invite(text) to authenticated;
grant execute on function public.revoke_swimmer_access(text) to authenticated;
grant execute on function public.swimmer_access_status(text) to authenticated;

-- Swimmer RLS is additive to existing coach/member policies. Swimmers are NOT inserted into organisation_members.
drop policy if exists "swimmer reads own athlete" on public.athletes;
create policy "swimmer reads own athlete" on public.athletes for select to authenticated using (public.msos_can_access_athlete(id));

drop policy if exists "swimmer reads own attendance" on public.attendance;
create policy "swimmer reads own attendance" on public.attendance for select to authenticated using (public.msos_can_access_athlete(athlete_id));

drop policy if exists "swimmer reads own captures" on public.captures;
create policy "swimmer reads own captures" on public.captures for select to authenticated
using (athlete_id is not null and public.msos_can_access_athlete(athlete_id) and audience in ('shared','swimmer'));

drop policy if exists "swimmer inserts own shared captures" on public.captures;
create policy "swimmer inserts own shared captures" on public.captures for insert to authenticated
with check (athlete_id is not null and public.msos_can_access_athlete(athlete_id) and audience='shared' and created_by=auth.uid());

drop policy if exists "swimmer reads own timed sets" on public.timed_sets;
create policy "swimmer reads own timed sets" on public.timed_sets for select to authenticated using (public.msos_can_access_athlete(athlete_id));

drop policy if exists "swimmer reads assigned sessions" on public.sessions;
create policy "swimmer reads assigned sessions" on public.sessions for select to authenticated using (
  exists(
    select 1 from public.athlete_user_access x
    join public.athletes a on a.id=x.athlete_id
    where x.user_id=auth.uid() and x.active=true and x.revoked_at is null and a.organisation_id=sessions.organisation_id
      and (
        exists(select 1 from public.swimmer_session_access ssa where ssa.athlete_id=a.id and ssa.session_id=sessions.id and ssa.active=true)
        or exists(select 1 from public.attendance at where at.athlete_id=a.id and at.session_id=sessions.id)
        or a.squad=any(sessions.squads)
      )
  )
);

-- Add own-athlete SELECT policies to optional performance tables when present.
do $$
declare t text;
begin
  foreach t in array array[
    'training_test_results','athlete_adaptation_profiles','adaptation_profiles','coach_results',
    'results_pb_board','results_event_history','results_athlete_overview','results_record_gaps','athlete_achievements',
    'meet_entries','meet_races','meet_evidence'
  ] loop
    if to_regclass('public.'||t) is not null and exists(
      select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='athlete_id'
    ) then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists "swimmer reads own rows" on public.%I',t);
      if t='meet_evidence' and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='audience') then
        execute format('create policy "swimmer reads own rows" on public.%I for select to authenticated using (public.msos_can_access_athlete(athlete_id) and audience in (''shared'',''swimmer''))',t);
      else
        execute format('create policy "swimmer reads own rows" on public.%I for select to authenticated using (public.msos_can_access_athlete(athlete_id))',t);
      end if;
    end if;
  end loop;
end $$;

-- Global reference tables are performance reference material, not other-swimmer private data.
do $$
declare t text;
begin
  foreach t in array array['pathway_standards','pathway_meets','world_aquatics_base_times','world_para_point_parameters','xlr8_course_conversions'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('drop policy if exists "authenticated read reference" on public.%I',t);
      execute format('create policy "authenticated read reference" on public.%I for select to authenticated using (true)',t);
    end if;
  end loop;
end $$;

-- A curated bootstrap means the swimmer browser never needs a broad organisation pull.
create or replace function public.swimmer_bootstrap()
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  aid text;
  org uuid;
  ath jsonb;
  out jsonb;
  t text;
  rows jsonb;
  squad_name text;
begin
  select x.athlete_id,x.organisation_id into aid,org
  from public.athlete_user_access x
  where x.user_id=auth.uid() and x.active=true and x.revoked_at is null
  order by x.created_at desc limit 1;
  if aid is null then raise exception 'No active swimmer access is linked to this account'; end if;
  select to_jsonb(a),a.squad into ath,squad_name from public.athletes a where a.id=aid and a.organisation_id=org;
  out:=jsonb_build_object('athlete',ath,'athlete_id',aid,'organisation_id',org);

  if to_regclass('public.sessions') is not null then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.session_date,s.day_part),'[]'::jsonb) into rows
    from public.sessions s where s.organisation_id=org and (
      squad_name=any(s.squads)
      or exists(select 1 from public.attendance at where at.session_id=s.id and at.athlete_id=aid)
      or exists(select 1 from public.swimmer_session_access ssa where ssa.session_id=s.id and ssa.athlete_id=aid and ssa.active=true)
    );
    out:=out||jsonb_build_object('sessions',rows);
  end if;

  foreach t in array array['attendance','captures','timed_sets','training_test_results','athlete_adaptation_profiles','adaptation_profiles','coach_results','results_pb_board','results_event_history','results_athlete_overview','results_record_gaps','athlete_achievements','meet_entries','meet_races','meet_evidence'] loop
    rows:='[]'::jsonb;
    if to_regclass('public.'||t) is not null and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='athlete_id') then
      if t in ('captures','meet_evidence') and exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='audience') then
        execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where x.athlete_id=$1 and x.audience in (''shared'',''swimmer'')',t) into rows using aid;
      else
        execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x where x.athlete_id=$1',t) into rows using aid;
      end if;
    end if;
    out:=out||jsonb_build_object(t,rows);
  end loop;

  foreach t in array array['pathway_standards','pathway_meets','world_aquatics_base_times','world_para_point_parameters','xlr8_course_conversions'] loop
    rows:='[]'::jsonb;
    if to_regclass('public.'||t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.%I x',t) into rows;
    end if;
    out:=out||jsonb_build_object(t,rows);
  end loop;
  return out;
end $$;

revoke all on function public.swimmer_bootstrap() from public;
grant execute on function public.swimmer_bootstrap() to authenticated;
