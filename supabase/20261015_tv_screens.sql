-- TV link (15 Oct 2026). Andy: "build the full tv link ... TV board version of what I have on my phone board".
-- A TV (any browser: smart TV, laptop on HDMI, Chromecast tab) opens tv.html. It makes its own random secret,
-- asks for a short pairing code and shows it. A coach types that code into TV controls on the phone; from then
-- on the TV only ever shows the display frame the controlling phone publishes for THAT screen.
-- Security: the TV holds only its own secret (hashed here); it can read nothing but its own frame. Pairing,
-- publishing and revoking need a signed-in coach of the organisation. Owner or coach can unpair a screen.
create table if not exists public.msos_tv_screens(
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique,
  pair_code text unique,
  pair_expires_at timestamptz,
  organisation_id uuid references public.organisations(id) on delete cascade,
  label text,
  paired_at timestamptz,
  paired_by uuid,
  revoked_at timestamptz,
  frame jsonb,
  rev bigint not null default 0,
  controller_device text,
  controller_name text,
  controller_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.msos_tv_screens enable row level security;
-- No direct table policies: every access goes through the functions below.
revoke all on public.msos_tv_screens from anon, authenticated;

-- TV: ask for (or re-show) a pairing code. Anonymous: the TV is not a person.
create or replace function public.msos_tv_pair_request(p_secret text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare h text; s public.msos_tv_screens; code text; alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; tries int:=0;
begin
  if length(coalesce(p_secret,''))<32 then raise exception 'TV secret too short'; end if;
  h:=encode(digest(p_secret,'sha256'),'hex');
  select * into s from public.msos_tv_screens where secret_hash=h;
  if s.id is not null and s.organisation_id is not null and s.revoked_at is null then
    return jsonb_build_object('status','paired','label',s.label);
  end if;
  if s.id is not null and s.pair_code is not null and s.pair_expires_at>now() and s.revoked_at is null then
    return jsonb_build_object('status','pairing','code',s.pair_code,'expires_at',s.pair_expires_at);
  end if;
  loop
    code:='';
    for i in 1..6 loop code:=code||substr(alphabet,1+floor(random()*length(alphabet))::int,1); end loop;
    exit when not exists(select 1 from public.msos_tv_screens where pair_code=code);
    tries:=tries+1; if tries>20 then raise exception 'Could not make a code'; end if;
  end loop;
  -- a revoked TV starts again from a clean row
  delete from public.msos_tv_screens where secret_hash=h;
  -- tidy abandoned, never-paired requests
  delete from public.msos_tv_screens where organisation_id is null and pair_expires_at<now()-interval '1 day';
  insert into public.msos_tv_screens(secret_hash,pair_code,pair_expires_at) values(h,code,now()+interval '30 minutes');
  return jsonb_build_object('status','pairing','code',code,'expires_at',now()+interval '30 minutes');
end $$;

-- TV: get the current frame (only when newer than what it already has).
create or replace function public.msos_tv_frame(p_secret text, p_rev bigint default 0)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare h text; s public.msos_tv_screens;
begin
  h:=encode(digest(coalesce(p_secret,''),'sha256'),'hex');
  select * into s from public.msos_tv_screens where secret_hash=h;
  if s.id is null then return jsonb_build_object('status','unknown'); end if;
  if s.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if s.organisation_id is null then
    return jsonb_build_object('status', case when s.pair_expires_at>now() then 'pairing' else 'expired' end,'code',s.pair_code);
  end if;
  update public.msos_tv_screens set last_seen_at=now() where id=s.id and (last_seen_at is null or last_seen_at<now()-interval '20 seconds');
  if coalesce(p_rev,0)>=s.rev then
    return jsonb_build_object('status','same','rev',s.rev,'label',s.label);
  end if;
  return jsonb_build_object('status','frame','rev',s.rev,'label',s.label,'frame',s.frame,'controller',s.controller_name);
end $$;

-- Coach: pair the TV showing this code to the organisation.
create or replace function public.msos_tv_pair(p_org uuid, p_code text, p_label text default null)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; c text:=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
begin
  if auth.uid() is null or not public.is_org_member_coach(p_org) then raise exception 'Coach sign-in required'; end if;
  select * into s from public.msos_tv_screens where pair_code=c and organisation_id is null and revoked_at is null;
  if s.id is null or s.pair_expires_at<now() then raise exception 'That code is not showing on a TV (or has expired). Reload the TV page for a new one.'; end if;
  update public.msos_tv_screens set organisation_id=p_org, label=coalesce(nullif(trim(p_label),''),'Pool TV'), paired_at=now(), paired_by=auth.uid(), pair_code=null, pair_expires_at=null
    where id=s.id;
  return jsonb_build_object('id',s.id,'label',coalesce(nullif(trim(p_label),''),'Pool TV'));
end $$;

-- Coach: the organisation's TVs.
create or replace function public.msos_tv_list(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if auth.uid() is null or not public.is_org_member_coach(p_org) then raise exception 'Coach sign-in required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'paired_at',paired_at,'last_seen_at',last_seen_at,
    'controller_device',controller_device,'controller_name',controller_name,'controller_at',controller_at) order by paired_at)
    from public.msos_tv_screens where organisation_id=p_org and revoked_at is null),'[]'::jsonb);
end $$;

-- Coach: publish what the TV shows. Only the phone controlling the TV writes; another phone must take over.
create or replace function public.msos_tv_publish(p_screen uuid, p_device text, p_name text, p_frame jsonb, p_take boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens;
begin
  select * into s from public.msos_tv_screens where id=p_screen and revoked_at is null;
  if s.id is null then raise exception 'TV not found'; end if;
  if auth.uid() is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  if not coalesce(p_take,false) and s.controller_device is not null and s.controller_device<>p_device
     and s.controller_at>now()-interval '45 minutes' then
    return jsonb_build_object('ok',false,'controller',s.controller_name);
  end if;
  if octet_length(p_frame::text)>400000 then raise exception 'TV frame too large'; end if;
  update public.msos_tv_screens set frame=p_frame, rev=rev+1, controller_device=p_device, controller_name=left(coalesce(p_name,''),60), controller_at=now()
    where id=s.id returning * into s;
  return jsonb_build_object('ok',true,'rev',s.rev);
end $$;

-- Coach: unpair a TV (it goes back to showing a new code).
create or replace function public.msos_tv_revoke(p_screen uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens;
begin
  select * into s from public.msos_tv_screens where id=p_screen;
  if s.id is null then raise exception 'TV not found'; end if;
  if auth.uid() is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  update public.msos_tv_screens set revoked_at=now(), frame=null where id=s.id;
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.msos_tv_pair_request(text) from public;
revoke all on function public.msos_tv_frame(text,bigint) from public;
revoke all on function public.msos_tv_pair(uuid,text,text) from public;
revoke all on function public.msos_tv_list(uuid) from public;
revoke all on function public.msos_tv_publish(uuid,text,text,jsonb,boolean) from public;
revoke all on function public.msos_tv_revoke(uuid) from public;
grant execute on function public.msos_tv_pair_request(text) to anon, authenticated;
grant execute on function public.msos_tv_frame(text,bigint) to anon, authenticated;
grant execute on function public.msos_tv_pair(uuid,text,text) to authenticated;
grant execute on function public.msos_tv_list(uuid) to authenticated;
grant execute on function public.msos_tv_publish(uuid,text,text,jsonb,boolean) to authenticated;
grant execute on function public.msos_tv_revoke(uuid) to authenticated;
