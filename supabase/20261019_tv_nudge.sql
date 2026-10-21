-- Pool TV "look now" nudge (19 Oct 2026). Andy: "any button push took probably 30 seconds to actually show on the TV
-- ... within a couple of seconds to 3-5 seconds at the most."
-- msos_tv_frame now also returns `nudge`: the name of this screen's live channel (first 32 hex of
-- sha256('msos-tv-nudge:'||screen id)). Coach phones send a data-free broadcast there after every change
-- (engines/live-sync.js nudgeTv); the TV (tv.js) listens and fetches its frame at once instead of waiting for its next
-- check. The nudge carries no Board data -- the TV still reads only its own frame through this function.
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026 (migration tv_frame_nudge_key_20261019).
CREATE OR REPLACE FUNCTION public.msos_tv_frame(p_secret text, p_rev bigint DEFAULT 0, p_orev bigint DEFAULT '-1'::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare h text; s public.msos_tv_screens; nk text;
begin
  h:=encode(digest(coalesce(p_secret,''),'sha256'),'hex');
  select * into s from public.msos_tv_screens where secret_hash=h;
  if s.id is null then return jsonb_build_object('status','unknown'); end if;
  if s.revoked_at is not null then return jsonb_build_object('status','revoked'); end if;
  if s.organisation_id is null then
    return jsonb_build_object('status', case when s.pair_expires_at>now() then 'pairing' else 'expired' end,'code',s.pair_code);
  end if;
  nk:=left(encode(digest('msos-tv-nudge:'||s.id::text,'sha256'),'hex'),32);
  update public.msos_tv_screens set last_seen_at=now() where id=s.id and (last_seen_at is null or last_seen_at<now()-interval '20 seconds');
  if s.overlay is not null and s.overlay_touched_at < now()-interval '3 minutes' or (s.overlay is null and jsonb_array_length(coalesce(s.overlay_queue,'[]'::jsonb))>0) then
    perform public.msos_tv_slot_tidy(s.id);
    select * into s from public.msos_tv_screens where id=s.id;
  end if;
  if coalesce(p_rev,0)>=s.rev and coalesce(p_orev,-1)=s.overlay_rev then
    return jsonb_build_object('status','same','rev',s.rev,'orev',s.overlay_rev,'label',s.label,'nudge',nk);
  end if;
  return jsonb_build_object('status','frame','rev',s.rev,'label',s.label,'frame',s.frame,'controller',s.controller_name,
    'slot',true,'orev',s.overlay_rev,'overlay',s.overlay,'overlay_by',s.overlay_by_name,'nudge',nk,'overlay_left',
    case when s.overlay is null then null else greatest(0,180-extract(epoch from now()-s.overlay_touched_at))::int end);
end $function$;
