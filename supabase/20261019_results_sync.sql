-- Meet results sync (19 Oct 2026). Andy: "build the automated way and scrape for historical data of current swimmers to
-- update msos and automate future updates as well as have ability to load manually or later integrate with swimify and
-- meet mobile".
-- * msos_results_sources: every results file MSOS has looked at (SwimInfo NZ "TM Results File" zips, files a coach
--   uploads, later Swimify / Meet Mobile), so a file is imported once and the coach can see what came from where.
-- * Imported swims go into race_results with approved=false. Nothing reaches the PB board, pathway or race-pace targets
--   (official_personal_bests / results_event_history read approved rows only) until a coach approves them.
-- * msos_results_inbox / msos_results_review: what's waiting, and approve / skip -- owner only.
-- * A daily job (pg_cron + pg_net) asks the msos-results-sync edge function to check SwimInfo for new files.
create table if not exists public.msos_results_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  source text not null default 'swiminfo',          -- swiminfo | upload | swimify | meetmobile
  url text not null,                                -- the file's address (or upload:<name>:<sha256>)
  page_url text,                                    -- the meet page it was found on
  page_title text,
  meet_id uuid,
  meet_name text, meet_start date, meet_end date, course text,
  status text not null default 'new',               -- new | imported | no_results | error | skipped
  swims_total int, swims_ours int, swimmers_ours int,
  unmatched jsonb not null default '[]'::jsonb,     -- swimmers in our club(s) that didn't match anyone in MSOS
  error text,
  found_at timestamptz not null default now(),
  imported_at timestamptz,
  unique (organisation_id, url)
);
alter table public.msos_results_sources enable row level security;
-- race_results.import_batch_id -> result_import_batches: the sync function writes one batch row per results file (same id
-- as the msos_results_sources row). Splits from the results file are kept on each swim.
alter table public.race_results add column if not exists splits jsonb;
revoke all on public.msos_results_sources from anon, authenticated;

-- What's waiting for the coach: per file, the pending swims (with PB flag against approved results).
create or replace function public.msos_results_inbox(p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
begin
  if auth.uid() is null or not public.is_org_member_coach(p_org) then raise exception 'Coach sign-in required'; end if;
  return jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'source',s.source,'url',s.url,'page_url',s.page_url,'meet_name',coalesce(s.meet_name,s.page_title),'meet_start',s.meet_start,'meet_end',s.meet_end,'course',s.course,'status',s.status,
        'swims_total',s.swims_total,'swims_ours',s.swims_ours,'swimmers_ours',s.swimmers_ours,'unmatched',s.unmatched,'error',s.error,'found_at',s.found_at,'imported_at',s.imported_at,
        'pending',(select count(*) from race_results r where r.import_batch_id=s.id and r.approved=false and coalesce(r.result_status,'')<>'REJECTED')) order by coalesce(s.meet_start,s.found_at::date) desc)
      from msos_results_sources s where s.organisation_id=p_org and s.found_at>now()-interval '400 days' or (s.organisation_id=p_org and exists(select 1 from race_results r where r.import_batch_id=s.id and r.approved=false and coalesce(r.result_status,'')<>'REJECTED'))),'[]'::jsonb),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'source_id',r.import_batch_id,'athlete_id',r.athlete_id,'name',a.full_name,'raw_name',r.raw_swimmer_name,'course',r.course,'distance',r.distance,'stroke',r.stroke,'round',r.round,
        'time',r.result_time_text,'seconds',r.result_time_seconds,'status',r.result_status,'place',r.official_place,'date',r.result_date,'confidence',r.match_confidence,
        'pb',(r.result_status='OK' and r.result_time_seconds < coalesce((select min(x.result_time_seconds) from race_results x where x.organisation_id=r.organisation_id and x.athlete_id=r.athlete_id and x.approved and x.course=r.course and x.distance=r.distance and x.stroke=r.stroke and x.result_status='OK' and x.intermediate_split=false),1e9)))
        order by r.result_date desc, a.full_name, r.distance)
      from race_results r left join athletes a on a.id=r.athlete_id where r.organisation_id=p_org and r.approved=false and r.import_batch_id in (select id from msos_results_sources where organisation_id=p_org) and coalesce(r.result_status,'')<>'REJECTED'),'[]'::jsonb));
end $$;

-- Approve or skip swims. Approving makes them official results (PB board, pathway, targets). Skipped swims stay marked
-- so a later sync never brings them back.
create or replace function public.msos_results_review(p_org uuid, p_approve uuid[] default '{}', p_reject uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare a int; r int;
begin
  if auth.uid() is null or not public.mclay_is_owner(p_org) then raise exception 'Only the head coach can approve results'; end if;
  update race_results set approved=true, approved_at=now(), approved_by=auth.uid() where organisation_id=p_org and id=any(coalesce(p_approve,'{}')) and approved=false and athlete_id is not null;
  get diagnostics a = row_count;
  update race_results set result_status='REJECTED', official_result=false where organisation_id=p_org and id=any(coalesce(p_reject,'{}')) and approved=false;
  get diagnostics r = row_count;
  return jsonb_build_object('approved',a,'skipped',r);
end $$;

revoke all on function public.msos_results_inbox(uuid) from public, anon;
revoke all on function public.msos_results_review(uuid,uuid[],uuid[]) from public, anon;
grant execute on function public.msos_results_inbox(uuid) to authenticated;
grant execute on function public.msos_results_review(uuid,uuid[],uuid[]) to authenticated;

-- Daily check of SwimInfo NZ at 6:10am NZ time (17:10 UTC the day before, during NZDT; 18:10 UTC in winter is fine too).
create extension if not exists pg_net;
create extension if not exists pg_cron;
select vault.create_secret(encode(extensions.gen_random_bytes(24),'hex'),'msos_results_cron_secret','msos-results-sync daily job')
  where not exists (select 1 from vault.secrets where name='msos_results_cron_secret');
create or replace function public.msos_results_sync_tick(p_action text default 'scan', p_extra jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path to 'public','extensions' as $$
declare secret text; rid bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name='msos_results_cron_secret';
  select net.http_post(url:='https://cwoqjxiniuwmslltsfgi.supabase.co/functions/v1/msos-results-sync',
    headers:=jsonb_build_object('Content-Type','application/json','x-msos-cron',secret),
    body:=jsonb_build_object('action',p_action,'organisation_id','9d40beff-e632-414d-9daa-7ee78104ad2a')||coalesce(p_extra,'{}'::jsonb),
    timeout_milliseconds:=140000) into rid;
  return rid;
end $$;
revoke all on function public.msos_results_sync_tick(text,jsonb) from public, anon, authenticated;
create or replace function public.msos_results_cron_ok(p_secret text)
returns boolean language sql security definer set search_path to 'public','extensions' as $$
  select coalesce(length(p_secret)>20 and p_secret=(select decrypted_secret from vault.decrypted_secrets where name='msos_results_cron_secret'),false)
$$;
revoke all on function public.msos_results_cron_ok(text) from public, anon, authenticated;
grant execute on function public.msos_results_cron_ok(text) to service_role;
select cron.schedule('msos-results-sync-daily','10,25,40,55 17 * * *',$$select public.msos_results_sync_tick('scan')$$);
-- one-off history backfill (2017-2026) for current swimmers: one results file a minute (an edge call has a CPU limit)
-- until the function records it finished; the morning check runs four times so a busy weekend is all read
select cron.schedule('msos-results-backfill','* * * * *',$$select public.msos_results_sync_tick('backfill','{"years":[2026,2025,2024,2023,2022,2021,2020,2019,2018,2017],"budget_ms":50000}'::jsonb) where not exists (select 1 from public.msos_results_sources where url='backfill:done:2026,2025,2024,2023,2022,2021,2020,2019,2018,2017')$$);
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026 (via the Supabase MCP), in this order.
