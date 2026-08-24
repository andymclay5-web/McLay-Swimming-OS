-- McLay Swimming OS · swimmer session interaction layer
-- Secure swimmer-device writes for challenge/edit/finish feedback.
-- Swimmer devices never write canonical session tables directly.

create table if not exists public.msos_swimmer_session_actions (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.msos_swimmer_payloads(athlete_id) on delete cascade,
  session_id text not null,
  action_type text not null check (action_type in ('challenge','edit_request','finish')),
  block_id text,
  item_id text,
  payload jsonb not null default '{}'::jsonb,
  created_from_device uuid references public.msos_swimmer_devices(id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id)
);

create index if not exists msos_swimmer_session_actions_lookup
  on public.msos_swimmer_session_actions(athlete_id,session_id,created_at desc);

alter table public.msos_swimmer_session_actions enable row level security;
revoke all on public.msos_swimmer_session_actions from anon, authenticated;

create or replace function public.msos_swimmer_submit_session_action(
  p_device_token text,
  p_session_id text,
  p_action_type text,
  p_block_id text default null,
  p_item_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dev public.msos_swimmer_devices;
  row public.msos_swimmer_session_actions;
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
end $$;

create or replace function public.msos_swimmer_session_actions_snapshot(
  p_device_token text,
  p_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

create or replace function public.msos_owner_swimmer_session_actions(
  p_athlete_id text,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',a.id,'athlete_id',a.athlete_id,'session_id',a.session_id,'action_type',a.action_type,
      'block_id',a.block_id,'item_id',a.item_id,'payload',a.payload,'created_at',a.created_at,
      'acknowledged_at',a.acknowledged_at
    ) order by a.created_at desc)
    from public.msos_swimmer_session_actions a
    where a.athlete_id=p_athlete_id
      and (p_session_id is null or a.session_id=p_session_id)
  ),'[]'::jsonb);
end $$;

create or replace function public.msos_ack_swimmer_session_action(p_action_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  update public.msos_swimmer_session_actions
  set acknowledged_at=coalesce(acknowledged_at,now()),acknowledged_by=coalesce(acknowledged_by,auth.uid())
  where id=p_action_id;
  return found;
end $$;

grant execute on function public.msos_swimmer_submit_session_action(text,text,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.msos_swimmer_session_actions_snapshot(text,text) to anon,authenticated;
grant execute on function public.msos_owner_swimmer_session_actions(text,text) to authenticated;
grant execute on function public.msos_ack_swimmer_session_action(uuid) to authenticated;
