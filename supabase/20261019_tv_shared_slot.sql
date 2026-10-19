-- Pool TV: one shared "on top of the Board" slot for every coach (19 Oct 2026).
-- Andy: "other coaches need to be able to ... display that capture ... some sort of priority or rank ... someone else
-- is on, so you have to wait for them to go off ... any coach has a capture of any swimmer, they get a chance to talk
-- about it." Decided with Andy: the next coach waiting goes up AUTOMATICALLY when the slot frees; anything left up
-- 3 MINUTES without its coach touching it comes off by itself.
-- The Board itself is still published only by the lead phone (msos_tv_publish). The slot is separate:
--   * slot free (or the current item is 3 min stale)  -> any coach's item goes up straight away;
--   * slot taken by another coach                     -> the item joins a queue (one entry per coach, replaced if
--                                                        they ask again), and goes up automatically when it frees;
--   * the owner (head coach) always goes straight up, replacing whatever is showing;
--   * only the coach presenting, or the owner, can take it down; taking it down puts up the next in the queue.
-- The TV page reads the slot through msos_tv_frame (no coach sign-in on the TV); stale items are cleared there too,
-- so the 3-minute rule works even if the presenting phone has gone to sleep.
alter table public.msos_tv_screens
  add column if not exists overlay jsonb,
  add column if not exists overlay_by uuid,
  add column if not exists overlay_by_name text,
  add column if not exists overlay_at timestamptz,
  add column if not exists overlay_touched_at timestamptz,
  add column if not exists overlay_rev bigint not null default 0,
  add column if not exists overlay_queue jsonb not null default '[]'::jsonb;

-- internal: drop a stale item (3 min untouched) and promote the next in the queue
create or replace function public.msos_tv_slot_tidy(p_screen uuid)
returns void language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; nxt jsonb;
begin
  select * into s from public.msos_tv_screens where id=p_screen for update;
  if s.id is null then return; end if;
  if s.overlay is not null and s.overlay_touched_at < now()-interval '3 minutes' then
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
declare s public.msos_tv_screens;
begin
  select * into s from public.msos_tv_screens where id=p_screen and revoked_at is null;
  if s.id is null then raise exception 'TV not found'; end if;
  if auth.uid() is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  perform public.msos_tv_slot_tidy(s.id);
  select * into s from public.msos_tv_screens where id=p_screen;
  return jsonb_build_object('showing', s.overlay is not null, 'by', s.overlay_by, 'by_name', s.overlay_by_name, 'mine', s.overlay_by=auth.uid(),
    'overlay_id', s.overlay->>'id', 'touched_at', s.overlay_touched_at, 'rev', s.overlay_rev,
    'queue', coalesce((select jsonb_agg(jsonb_build_object('user',q->>'user','name',q->>'name','id',q->'overlay'->>'id','at',q->>'at')) from jsonb_array_elements(s.overlay_queue) q),'[]'::jsonb),
    'owner', public.mclay_is_owner(s.organisation_id));
end $$;

-- put an item up (or queue it). p_overlay is the display-ready item built by the coach's phone.
create or replace function public.msos_tv_slot_put(p_screen uuid, p_name text, p_overlay jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; me uuid:=auth.uid(); owner boolean; q jsonb;
begin
  select * into s from public.msos_tv_screens where id=p_screen and revoked_at is null;
  if s.id is null then raise exception 'TV not found'; end if;
  if me is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  if octet_length(coalesce(p_overlay,'{}'::jsonb)::text)>200000 then raise exception 'Too large for the TV'; end if;
  perform public.msos_tv_slot_tidy(s.id);
  select * into s from public.msos_tv_screens where id=p_screen for update;
  owner:=public.mclay_is_owner(s.organisation_id);
  -- my own entry never sits in the queue twice
  q:=coalesce((select jsonb_agg(x) from jsonb_array_elements(s.overlay_queue) x where (x->>'user')::uuid<>me),'[]'::jsonb);
  if s.overlay is null or s.overlay_by=me or owner then
    update public.msos_tv_screens set overlay=p_overlay, overlay_by=me, overlay_by_name=left(coalesce(p_name,''),60), overlay_at=case when s.overlay_by=me then coalesce(s.overlay_at,now()) else now() end,
      overlay_touched_at=now(), overlay_rev=overlay_rev+1, overlay_queue=q where id=s.id;
    return jsonb_build_object('status','showing','replaced', case when s.overlay is not null and s.overlay_by<>me then s.overlay_by_name end);
  end if;
  q:=q||jsonb_build_array(jsonb_build_object('user',me,'name',left(coalesce(p_name,''),60),'overlay',p_overlay,'at',now()));
  update public.msos_tv_screens set overlay_queue=q where id=s.id;
  return jsonb_build_object('status','queued','position',jsonb_array_length(q),'showing_by',s.overlay_by_name);
end $$;

-- take my item down (presenter) or anything (owner); also drops my place in the queue. The next in line goes up.
create or replace function public.msos_tv_slot_clear(p_screen uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare s public.msos_tv_screens; me uuid:=auth.uid();
begin
  select * into s from public.msos_tv_screens where id=p_screen and revoked_at is null for update;
  if s.id is null then raise exception 'TV not found'; end if;
  if me is null or not public.is_org_member_coach(s.organisation_id) then raise exception 'Coach sign-in required'; end if;
  update public.msos_tv_screens set overlay_queue=coalesce((select jsonb_agg(x) from jsonb_array_elements(overlay_queue) x where (x->>'user')::uuid<>me),'[]'::jsonb) where id=s.id;
  if s.overlay is not null and (s.overlay_by=me or public.mclay_is_owner(s.organisation_id)) then
    update public.msos_tv_screens set overlay=null, overlay_by=null, overlay_by_name=null, overlay_rev=overlay_rev+1 where id=s.id;
  end if;
  perform public.msos_tv_slot_tidy(s.id);
  return jsonb_build_object('ok',true);
end $$;

-- TV: the Board frame (as before) plus the shared slot. Clears stale items and promotes the queue as it goes.
create or replace function public.msos_tv_frame(p_secret text, p_rev bigint default 0, p_orev bigint default -1)
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
  if s.overlay is not null and s.overlay_touched_at < now()-interval '3 minutes' or (s.overlay is null and jsonb_array_length(coalesce(s.overlay_queue,'[]'::jsonb))>0) then
    perform public.msos_tv_slot_tidy(s.id);
    select * into s from public.msos_tv_screens where id=s.id;
  end if;
  if coalesce(p_rev,0)>=s.rev and coalesce(p_orev,-1)=s.overlay_rev then
    return jsonb_build_object('status','same','rev',s.rev,'orev',s.overlay_rev,'label',s.label);
  end if;
  return jsonb_build_object('status','frame','rev',s.rev,'label',s.label,'frame',s.frame,'controller',s.controller_name,
    'slot',true,'orev',s.overlay_rev,'overlay',s.overlay,'overlay_by',s.overlay_by_name,'overlay_left',
    case when s.overlay is null then null else greatest(0,180-extract(epoch from now()-s.overlay_touched_at))::int end);
end $$;

drop function if exists public.msos_tv_frame(text,bigint);
revoke all on function public.msos_tv_slot_tidy(uuid) from public, anon, authenticated;
revoke all on function public.msos_tv_slot_state(uuid) from public;
revoke all on function public.msos_tv_slot_put(uuid,text,jsonb) from public;
revoke all on function public.msos_tv_slot_clear(uuid) from public;
revoke all on function public.msos_tv_frame(text,bigint,bigint) from public;
grant execute on function public.msos_tv_slot_state(uuid) to authenticated;
grant execute on function public.msos_tv_slot_put(uuid,text,jsonb) to authenticated;
grant execute on function public.msos_tv_slot_clear(uuid) to authenticated;
grant execute on function public.msos_tv_frame(text,bigint,bigint) to anon, authenticated;
