-- McLay Swimming OS secure swimmer portal pilot
-- One-time invite -> device token. Swimmer devices never query canonical MSOS tables.
-- They can only receive the owner-published, athlete-specific JSON projection.

create extension if not exists pgcrypto;

create table if not exists public.msos_owner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.msos_swimmer_payloads (
  athlete_id text primary key,
  payload jsonb not null,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.msos_swimmer_invites (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.msos_swimmer_payloads(athlete_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.msos_swimmer_devices (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.msos_swimmer_payloads(athlete_id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_from_invite uuid references public.msos_swimmer_invites(id)
);

alter table public.msos_owner_accounts enable row level security;
alter table public.msos_swimmer_payloads enable row level security;
alter table public.msos_swimmer_invites enable row level security;
alter table public.msos_swimmer_devices enable row level security;

revoke all on public.msos_owner_accounts from anon, authenticated;
revoke all on public.msos_swimmer_payloads from anon, authenticated;
revoke all on public.msos_swimmer_invites from anon, authenticated;
revoke all on public.msos_swimmer_devices from anon, authenticated;

create or replace function public.msos_bootstrap_owner()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  if exists(select 1 from public.msos_owner_accounts) and not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then
    raise exception 'Owner already established';
  end if;
  insert into public.msos_owner_accounts(user_id) values(auth.uid()) on conflict do nothing;
  return true;
end $$;

create or replace function public.msos_publish_swimmer_payload(p_athlete_id text, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v bigint;
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  if coalesce(trim(p_athlete_id),'')='' then raise exception 'Athlete id required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Payload required'; end if;
  insert into public.msos_swimmer_payloads(athlete_id,payload,published_by,published_at,version)
  values(p_athlete_id,p_payload,auth.uid(),now(),1)
  on conflict(athlete_id) do update set payload=excluded.payload,published_by=excluded.published_by,published_at=now(),version=public.msos_swimmer_payloads.version+1
  returning version into v;
  return v;
end $$;

create or replace function public.msos_create_swimmer_invite(p_athlete_id text, p_minutes int default 15)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare raw_token text; inv public.msos_swimmer_invites;
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  if not exists(select 1 from public.msos_swimmer_payloads where athlete_id=p_athlete_id) then raise exception 'Publish swimmer payload first'; end if;
  raw_token := encode(gen_random_bytes(32),'hex');
  insert into public.msos_swimmer_invites(athlete_id,token_hash,expires_at,created_by)
  values(p_athlete_id,encode(digest(raw_token,'sha256'),'hex'),now() + make_interval(mins => greatest(5,least(coalesce(p_minutes,15),60))),auth.uid())
  returning * into inv;
  return jsonb_build_object('invite_token',raw_token,'expires_at',inv.expires_at,'athlete_id',inv.athlete_id);
end $$;

create or replace function public.msos_claim_swimmer_invite(p_invite_token text, p_device_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare inv public.msos_swimmer_invites; raw_device text; dev public.msos_swimmer_devices;
begin
  select * into inv from public.msos_swimmer_invites
  where token_hash=encode(digest(coalesce(p_invite_token,''),'sha256'),'hex')
    and consumed_at is null and expires_at>now()
  for update;
  if inv.id is null then raise exception 'Invite invalid, expired or already used'; end if;
  raw_device := encode(gen_random_bytes(48),'hex');
  insert into public.msos_swimmer_devices(athlete_id,token_hash,label,created_from_invite)
  values(inv.athlete_id,encode(digest(raw_device,'sha256'),'hex'),left(coalesce(p_device_label,''),120),inv.id)
  returning * into dev;
  update public.msos_swimmer_invites set consumed_at=now() where id=inv.id;
  return jsonb_build_object('device_token',raw_device,'athlete_id',dev.athlete_id,'device_id',dev.id);
end $$;

create or replace function public.msos_swimmer_portal_snapshot(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare dev public.msos_swimmer_devices; row public.msos_swimmer_payloads;
begin
  select * into dev from public.msos_swimmer_devices
  where token_hash=encode(digest(coalesce(p_device_token,''),'sha256'),'hex') and revoked_at is null;
  if dev.id is null then raise exception 'Device access invalid or revoked'; end if;
  update public.msos_swimmer_devices set last_seen_at=now() where id=dev.id;
  select * into row from public.msos_swimmer_payloads where athlete_id=dev.athlete_id;
  if row.athlete_id is null then raise exception 'Swimmer payload unavailable'; end if;
  return jsonb_build_object('athlete_id',row.athlete_id,'version',row.version,'published_at',row.published_at,'payload',row.payload);
end $$;

create or replace function public.msos_revoke_swimmer_devices(p_athlete_id text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  update public.msos_swimmer_devices set revoked_at=now() where athlete_id=p_athlete_id and revoked_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.msos_bootstrap_owner() to authenticated;
grant execute on function public.msos_publish_swimmer_payload(text,jsonb) to authenticated;
grant execute on function public.msos_create_swimmer_invite(text,int) to authenticated;
grant execute on function public.msos_revoke_swimmer_devices(text) to authenticated;
grant execute on function public.msos_claim_swimmer_invite(text,text) to anon, authenticated;
grant execute on function public.msos_swimmer_portal_snapshot(text) to anon, authenticated;
