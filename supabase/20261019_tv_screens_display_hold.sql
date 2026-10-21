-- Pool TV: readable on any screen, a second screen, and items that stay up (19 Oct 2026, after the first pool TV night).
-- Andy: "The screen ... probably thirty-two inches ... adaptable for whatever the screen is ... add a bigger screen as the
-- second screen ... not that clear on how that works." / "a button where I could swap between black and white or white and
-- black" / "15 minutes with phone off; after 3 minutes another coach can put captures up ... they can also should be able
-- to take over the whole screen ... by linking their phone."
--
-- * display (per screen): {"theme":"light"|"dark","size":-2..3}. Each TV keeps its own look -- a 32" and a 65" can
--   differ. Set from any coach phone (msos_tv_set); the TV reads it with its frame.
-- * follows (per screen): a second TV can show exactly what another TV shows ("Same as Pool TV"). Everything a coach
--   sends goes to the lead screen; every follower draws it. Publishing or using the slot on a follower acts on its lead.
-- * The shared slot now HOLDS an item for 15 minutes after its coach last touched it (leaving the app no longer takes it
--   down). After 3 minutes untouched it is "open": another coach's item replaces it straight away instead of waiting.
-- * Taking over the whole Board from another phone is unchanged (msos_tv_publish with p_take) -- the phone shows the
--   button.
alter table public.msos_tv_screens
  add column if not exists follows uuid references public.msos_tv_screens(id) on delete set null,
  add column if not exists display jsonb not null default '{}'::jsonb;

-- the screen that actually holds the Board and slot for this one (itself, or the one it follows)
create or replace function public.msos_tv_lead(p_screen uuid)
returns uuid language sql stable security definer set search_path to 'public','extensions' as $$
  select coalesce((select l.id from public.msos_tv_screens s join public.msos_tv_screens l on l.id=s.follows
                    where s.id=p_screen and l.revoked_at is null and l.organisation_id=s.organisation_id), p_screen)
$$;
revoke all on function public.msos_tv_lead(uuid) from public, anon, authenticated;

-- internal: 15 minutes untouched -> off; 3 minutes untouched and someone waiting -> the next goes up
create or replace function public.msos_tv_slot_tidy(p_screen uuid)
returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; nxt jsonb;
begin
  select * into s from public.msos_tv_screens where id=p_screen for update;
  if s.id is null then return; end if;
  if s.overlay is not null and (s.overlay_touched_at < now()-interval '15 minutes'
     or (s.overlay_touched_at < now()-interval '3 minutes' and jsonb_array_length(coalesce(s.overlay_queue,'[]'::jsonb))>0)) then
    update public.msos_tv_screens set overlay=null, overlay_by=null, overlay_by_name=null, overlay_rev=overlay_rev+1 where id=s.id;
    s.overlay:=null;
  end if;
  if s.overlay is null and jsonb_array_length(coalesce(s.overlay_queue,'[]'::jsonb))>0 then
    nxt:=s.overlay_queue->0;
    update public.msos_tv_screens set overlay=nxt->'overlay', overlay_by=(nxt->>'user')::uuid, overlay_by_name=nxt->>'name',
      overlay_at=now(), overlay_touched_at=now(), overlay_rev=overlay_rev+1, overlay_queue=overlay_queue-0 where id=s.id;
  end if;
end $$;

create or replace function public.msos_tv_slot_state(p_screen uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; lead uuid:=public.msos_tv_lead(p_screen);
begin
  select * into s from public.msos_tv_screens where id=lead and revoked_at is null;
  if s.id is null then raise exception 'TV not found'; end if;
  if auth.uid() is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  perform public.msos_tv_slot_tidy(s.id);
  select * into s from public.msos_tv_screens where id=lead;
  return jsonb_build_object('showing', s.overlay is not null, 'by', s.overlay_by, 'by_name', s.overlay_by_name, 'mine', s.overlay_by=auth.uid(),
    'overlay_id', s.overlay->>'id', 'touched_at', s.overlay_touched_at, 'rev', s.overlay_rev, 'hold_s', 900, 'open_s', 180, 'lead', s.id,
    'queue', coalesce((select jsonb_agg(jsonb_build_object('user',q->>'user','name',q->>'name','id',q->'overlay'->>'id','at',q->>'at')) from jsonb_array_elements(s.overlay_queue) q),'[]'::jsonb),
    'owner', public.mclay_is_owner(s.organisation_id));
end $$;

create or replace function public.msos_tv_slot_put(p_screen uuid, p_name text, p_overlay jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; me uuid:=auth.uid(); owner boolean; q jsonb; lead uuid:=public.msos_tv_lead(p_screen); open boolean;
begin
  select * into s from public.msos_tv_screens where id=lead and revoked_at is null;
  if s.id is null then raise exception 'TV not found'; end if;
  if me is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  if octet_length(coalesce(p_overlay,'{}'::jsonb)::text)>200000 then raise exception 'Too large for the TV'; end if;
  perform public.msos_tv_slot_tidy(s.id);
  select * into s from public.msos_tv_screens where id=lead for update;
  owner:=public.mclay_is_owner(s.organisation_id);
  open:=s.overlay_touched_at < now()-interval '3 minutes';
  q:=coalesce((select jsonb_agg(x) from jsonb_array_elements(s.overlay_queue) x where (x->>'user')::uuid<>me),'[]'::jsonb);
  if s.overlay is null or s.overlay_by=me or owner or open then
    update public.msos_tv_screens set overlay=p_overlay, overlay_by=me, overlay_by_name=left(coalesce(p_name,''),60), overlay_at=case when s.overlay_by=me then coalesce(s.overlay_at,now()) else now() end,
      overlay_touched_at=now(), overlay_rev=overlay_rev+1, overlay_queue=q where id=s.id;
    return jsonb_build_object('status','showing','replaced', case when s.overlay is not null and s.overlay_by<>me then s.overlay_by_name end);
  end if;
  q:=q||jsonb_build_array(jsonb_build_object('user',me,'name',left(coalesce(p_name,''),60),'overlay',p_overlay,'at',now()));
  update public.msos_tv_screens set overlay_queue=q where id=s.id;
  return jsonb_build_object('status','queued','position',jsonb_array_length(q),'showing_by',s.overlay_by_name,
    'open_in', greatest(0,180-extract(epoch from now()-s.overlay_touched_at))::int);
end $$;

create or replace function public.msos_tv_slot_clear(p_screen uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; me uuid:=auth.uid(); lead uuid:=public.msos_tv_lead(p_screen);
begin
  select * into s from public.msos_tv_screens where id=lead and revoked_at is null for update;
  if s.id is null then raise exception 'TV not found'; end if;
  if me is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  update public.msos_tv_screens set overlay_queue=coalesce((select jsonb_agg(x) from jsonb_array_elements(overlay_queue) x where (x->>'user')::uuid<>me),'[]'::jsonb) where id=s.id;
  if s.overlay is not null and (s.overlay_by=me or public.mclay_is_owner(s.organisation_id)) then
    update public.msos_tv_screens set overlay=null, overlay_by=null, overlay_by_name=null, overlay_rev=overlay_rev+1 where id=s.id;
  end if;
  perform public.msos_tv_slot_tidy(s.id);
  return jsonb_build_object('ok',true);
end $$;

-- publishing to a follower publishes to its lead
create or replace function public.msos_tv_publish(p_screen uuid, p_device text, p_name text, p_frame jsonb, p_take boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; lead uuid:=public.msos_tv_lead(p_screen);
begin
  select * into s from public.msos_tv_screens where id=lead and revoked_at is null;
  if s.id is null then raise exception 'TV not found'; end if;
  if auth.uid() is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  if not coalesce(p_take,false) and s.controller_device is not null and s.controller_device<>p_device
     and s.controller_at>now()-interval '45 minutes' then
    return jsonb_build_object('ok',false,'controller',s.controller_name);
  end if;
  if octet_length(p_frame::text)>400000 then raise exception 'TV frame too large'; end if;
  update public.msos_tv_screens set frame=p_frame, rev=rev+1, controller_device=p_device, controller_name=left(coalesce(p_name,''),60), controller_at=now()
    where id=s.id returning * into s;
  return jsonb_build_object('ok',true,'rev',s.rev,'lead',s.id);
end $$;

create or replace function public.msos_tv_list(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if auth.uid() is null or not public.is_org_member_coach(p_org) then raise exception 'Coach sign-in required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'paired_at',paired_at,'last_seen_at',last_seen_at,
    'controller_device',controller_device,'controller_name',controller_name,'controller_at',controller_at,'follows',follows,'display',display) order by paired_at)
    from public.msos_tv_screens where organisation_id=p_org and revoked_at is null),'[]'::jsonb);
end $$;

-- Coach: name a TV, make it follow another (or stand alone), and set its look. p_patch keys: label, follows ('' = alone),
-- theme ('light'|'dark'), size (-2..3).
create or replace function public.msos_tv_set(p_screen uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; f uuid; d jsonb;
begin
  select * into s from public.msos_tv_screens where id=p_screen and revoked_at is null for update;
  if s.id is null then raise exception 'TV not found'; end if;
  if auth.uid() is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  d:=coalesce(s.display,'{}'::jsonb);
  if p_patch ? 'theme' then d:=d||jsonb_build_object('theme',case when p_patch->>'theme'='dark' then 'dark' else 'light' end); end if;
  if p_patch ? 'size' then d:=d||jsonb_build_object('size',greatest(-2,least(3,coalesce((p_patch->>'size')::int,0)))); end if;
  if p_patch ? 'follows' then
    if coalesce(p_patch->>'follows','')='' then f:=null;
    else
      f:=public.msos_tv_lead((p_patch->>'follows')::uuid);
      if f=s.id or not exists(select 1 from public.msos_tv_screens where id=f and organisation_id=s.organisation_id and revoked_at is null) then raise exception 'That TV can''t be followed'; end if;
      -- anything that followed this screen now follows the new lead (no chains)
      update public.msos_tv_screens set follows=f where follows=s.id;
    end if;
    update public.msos_tv_screens set follows=f where id=s.id;
  end if;
  update public.msos_tv_screens set display=d, label=coalesce(nullif(trim(p_patch->>'label'),''),label), rev=rev+1 where id=s.id returning * into s;
  return jsonb_build_object('ok',true,'id',s.id,'follows',s.follows,'display',s.display,'label',s.label);
end $$;
revoke all on function public.msos_tv_set(uuid,jsonb) from public, anon;
grant execute on function public.msos_tv_set(uuid,jsonb) to authenticated;

-- TV: its own look and label, the lead's Board and slot, and the lead's "look now" channel.
create or replace function public.msos_tv_frame(p_secret text, p_rev bigint DEFAULT 0, p_orev bigint DEFAULT '-1'::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare h text; s public.msos_tv_screens; l public.msos_tv_screens; nk text; r bigint;
begin
  h:=encode(digest(coalesce(p_secret,''),'sha256'),'hex');
  select * into s from public.msos_tv_screens where secret_hash=h;
  if s.id is null then return jsonb_build_object('status','unknown'); end if;
  if s.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if s.organisation_id is null then
    return jsonb_build_object('status', case when s.pair_expires_at>now() then 'pairing' else 'expired' end,'code',s.pair_code);
  end if;
  update public.msos_tv_screens set last_seen_at=now() where id=s.id and (last_seen_at is null or last_seen_at<now()-interval '20 seconds');
  select * into l from public.msos_tv_screens where id=public.msos_tv_lead(s.id);
  if l.overlay is not null and l.overlay_touched_at < now()-interval '3 minutes' or (l.overlay is null and jsonb_array_length(coalesce(l.overlay_queue,'[]'::jsonb))>0) then
    perform public.msos_tv_slot_tidy(l.id);
    select * into l from public.msos_tv_screens where id=l.id;
  end if;
  nk:=left(encode(digest('msos-tv-nudge:'||l.id::text,'sha256'),'hex'),32);
  -- a follower's own settings change bumps its own rev; the Board rev is the lead's
  r:=l.rev+case when l.id<>s.id then s.rev else 0 end;
  if coalesce(p_rev,0)>=r and coalesce(p_orev,-1)=l.overlay_rev then
    return jsonb_build_object('status','same','rev',r,'orev',l.overlay_rev,'label',s.label,'nudge',nk,'display',s.display);
  end if;
  return jsonb_build_object('status','frame','rev',r,'label',s.label,'frame',l.frame,'controller',l.controller_name,
    'slot',true,'orev',l.overlay_rev,'overlay',l.overlay,'overlay_by',l.overlay_by_name,'nudge',nk,'display',s.display,'follows',l.id<>s.id,
    'overlay_left', case when l.overlay is null then null else greatest(0,900-extract(epoch from now()-l.overlay_touched_at))::int end);
end $function$;
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026 (migration tv_display_follow_hold_20261019).
