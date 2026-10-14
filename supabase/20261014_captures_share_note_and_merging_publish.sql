-- 14 Oct 2026 (applied to the live project by Claude via Supabase MCP, migrations
-- swimming_media_allow_iphone_video + captures_audience_note_and_merging_swimmer_publish).

-- iPhone videos (video/quicktime) were refused by the bucket, so they never left the phone. Free plan maximum: 50 MB.
update storage.buckets
set allowed_mime_types = array['audio/webm','audio/webm;codecs=opus','audio/ogg','audio/ogg;codecs=opus','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a',
  'image/jpeg','image/png','image/webp','image/heic','image/heif',
  'video/webm','video/mp4','video/quicktime','video/x-m4v','video/3gpp'],
    file_size_limit = 52428800
where id = 'swimming-media';

-- "Share with swimmer" and the capture's note never reached the cloud.
alter table public.captures add column if not exists audience text;
alter table public.captures add column if not exists note text;

-- Publishing part of a swimmer's portal keeps the rest (top-level keys sent replace those keys only).
create or replace function public.msos_publish_swimmer_payload(p_athlete_id text, p_payload jsonb)
returns bigint language plpgsql security definer set search_path to 'public' as $function$
declare v bigint;
begin
  if not exists(select 1 from public.msos_owner_accounts where user_id=auth.uid()) then raise exception 'Owner access required'; end if;
  if coalesce(trim(p_athlete_id),'')='' then raise exception 'Athlete id required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Payload required'; end if;
  insert into public.msos_swimmer_payloads(athlete_id,payload,published_by,published_at,version)
  values(p_athlete_id,p_payload,auth.uid(),now(),1)
  on conflict(athlete_id) do update set
    payload=public.msos_swimmer_payloads.payload || excluded.payload,
    published_by=excluded.published_by, published_at=now(), version=public.msos_swimmer_payloads.version+1
  returning version into v;
  return v;
end $function$;
