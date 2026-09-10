-- McLay Swimming OS · swimmer portal pgcrypto fix + finish-marks-attendance
--
-- Bug 1 (root cause of "QR code isn't generating"): every swimmer-portal
-- RPC that hashes a token (digest/gen_random_bytes) was created with
-- `set search_path to 'public'`. pgcrypto lives in the `extensions` schema
-- on this project, not `public`, so every one of these functions throws
-- `function digest(text, unknown) does not exist` the moment it runs —
-- meaning invite creation, invite claiming, portal snapshot fetch and
-- swimmer action submission have never actually worked, independent of
-- any client-side readiness gate. Fix: widen search_path to include
-- `extensions` on each affected function (functionally identical
-- CREATE OR REPLACE bodies otherwise — verified against the live
-- definitions pulled from pg_proc before editing).
--
-- Bug 2: msos_swimmer_submit_session_action never wrote to public.attendance
-- when a swimmer hit "Finish session" on their phone, so they were never
-- marked present on the coach's roll for that session. Fix: on a 'finish'
-- action, upsert an attendance row for (session_id, athlete_id) — insert
-- 'present' if none exists, upgrade 'absent' to 'present', but never
-- downgrade an existing 'modified' classification (that reflects a
-- deliberate coach call, e.g. a para/adapted swimmer's session).

create or replace function public.msos_create_swimmer_invite(p_athlete_id text, p_minutes integer default 15)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  raw_token text;
  inv public.msos_swimmer_invites;
begin
  if not exists(
    select 1 from public.msos_owner_accounts where user_id=auth.uid()
  ) then raise exception 'Owner access required'; end if;

  if not exists(
    select 1 from public.msos_swimmer_payloads where athlete_id=p_athlete_id
  ) then raise exception 'Publish swimmer payload first'; end if;

  raw_token := encode(gen_random_bytes(32),'hex');

  insert into public.msos_swimmer_invites(
    athlete_id,token_hash,expires_at,created_by
  )
  values(
    p_athlete_id,
    encode(digest(raw_token,'sha256'),'hex'),
    now() + make_interval(
      mins => greatest(5,least(coalesce(p_minutes,15),60))
    ),
    auth.uid()
  )
  returning * into inv;

  return jsonb_build_object(
    'invite_token',raw_token,
    'expires_at',inv.expires_at,
    'athlete_id',inv.athlete_id
  );
end $function$;

create or replace function public.msos_claim_swimmer_invite(p_invite_token text, p_device_label text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  inv public.msos_swimmer_invites;
  raw_device text;
  dev public.msos_swimmer_devices;
begin
  select * into inv
  from public.msos_swimmer_invites
  where token_hash=encode(
    digest(coalesce(p_invite_token,''),'sha256'),'hex'
  )
    and consumed_at is null
    and expires_at>now()
  for update;

  if inv.id is null then
    raise exception 'Invite invalid, expired or already used';
  end if;

  raw_device := encode(gen_random_bytes(48),'hex');

  insert into public.msos_swimmer_devices(
    athlete_id,token_hash,label,created_from_invite
  )
  values(
    inv.athlete_id,
    encode(digest(raw_device,'sha256'),'hex'),
    left(coalesce(p_device_label,''),120),
    inv.id
  )
  returning * into dev;

  update public.msos_swimmer_invites
  set consumed_at=now()
  where id=inv.id;

  return jsonb_build_object(
    'device_token',raw_device,
    'athlete_id',dev.athlete_id,
    'device_id',dev.id
  );
end $function$;

create or replace function public.msos_swimmer_portal_snapshot(p_device_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  dev public.msos_swimmer_devices;
  row public.msos_swimmer_payloads;
begin
  select * into dev
  from public.msos_swimmer_devices
  where token_hash=encode(
    digest(coalesce(p_device_token,''),'sha256'),'hex'
  )
    and revoked_at is null;

  if dev.id is null then
    raise exception 'Device access invalid or revoked';
  end if;

  update public.msos_swimmer_devices
  set last_seen_at=now()
  where id=dev.id;

  select * into row
  from public.msos_swimmer_payloads
  where athlete_id=dev.athlete_id;

  if row.athlete_id is null then
    raise exception 'Swimmer payload unavailable';
  end if;

  return jsonb_build_object(
    'athlete_id',row.athlete_id,
    'version',row.version,
    'published_at',row.published_at,
    'payload',row.payload
  );
end $function$;

create or replace function public.msos_swimmer_session_actions_snapshot(
  p_device_token text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare dev public.msos_swimmer_devices;
begin
  select * into dev
  from public.msos_swimmer_devices
  where token_hash=encode(digest(coalesce(p_device_token,''),'sha256'),'hex')
    and revoked_at is null;
  if dev.id is null then raise exception 'Device access invalid or revoked'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'action_type',a.action_type,'block_id',a.block_id,'item_id',a.item_id,
      'payload',a.payload,'created_at',a.created_at,'acknowledged_at',a.acknowledged_at
    ) order by a.created_at desc)
    from public.msos_swimmer_session_actions a
    where a.athlete_id=dev.athlete_id and a.session_id=p_session_id
  ),'[]'::jsonb);
end $function$;

create or replace function public.msos_swimmer_submit_session_action(p_device_token text, p_session_id text, p_action_type text, p_block_id text default NULL::text, p_item_id text default NULL::text, p_payload jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  dev public.msos_swimmer_devices;
  row public.msos_swimmer_session_actions;
  org_id uuid;
begin
  select * into dev
  from public.msos_swimmer_devices
  where token_hash=encode(digest(coalesce(p_device_token,''),'sha256'),'hex')
    and revoked_at is null;
  if dev.id is null then raise exception 'Device access invalid or revoked'; end if;
  if coalesce(trim(p_session_id),'')='' then raise exception 'Session id required'; end if;
  if coalesce(p_action_type,'') not in ('challenge','edit_request','finish') then raise exception 'Unsupported swimmer action'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Action payload must be an object'; end if;

  insert into public.msos_swimmer_session_actions(
    athlete_id,session_id,action_type,block_id,item_id,payload,created_from_device
  ) values(
    dev.athlete_id,p_session_id,p_action_type,nullif(trim(p_block_id),''),nullif(trim(p_item_id),''),p_payload,dev.id
  ) returning * into row;

  if p_action_type='finish' then
    select organisation_id into org_id from public.athletes where id=dev.athlete_id;
    if org_id is not null and exists(select 1 from public.sessions where id=p_session_id) then
      insert into public.attendance(id,organisation_id,session_id,athlete_id,status,updated_at)
      values('attendance-'||p_session_id||'-'||dev.athlete_id,org_id,p_session_id,dev.athlete_id,'present',now())
      on conflict (session_id,athlete_id) do update set
        status=case when public.attendance.status='absent' then 'present' else public.attendance.status end,
        updated_at=now();
    end if;
  end if;

  update public.msos_swimmer_devices set last_seen_at=now() where id=dev.id;
  return jsonb_build_object(
    'id',row.id,
    'athlete_id',row.athlete_id,
    'session_id',row.session_id,
    'action_type',row.action_type,
    'block_id',row.block_id,
    'item_id',row.item_id,
    'payload',row.payload,
    'created_at',row.created_at
  );
end $function$;
