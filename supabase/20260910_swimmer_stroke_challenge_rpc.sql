-- McLay Swimming OS · instant, evidence-checked swimmer stroke challenge
--
-- Real coaching failure this fixes (Andy's own voice-memo spec, build-list item 8 follow-up): a swimmer
-- training alone -- "Matthew will be doing his sessions when I'm not thinking about swimming" -- needs an
-- evidence-checked answer to "can I do backstroke instead?" right there on their own device, not only once
-- Andy later opens his feedback inbox. The swimmer's device (swimmer-portal.js) has no access to the coach
-- app's in-memory engines (M.performanceEngine/M.strokeBalance), so this function does NOT recompute the
-- evidence itself -- that would be a second, competing implementation of logic that already has one owner
-- (engines/stroke-balance.js's challengeEvidence, see its own comment). Instead it applies the exact same
-- approve rule against the evidence snapshot engines/swimmer-invite-bn.js already publishes alongside the
-- session (item.strokeEvidence), computed by the real engines at QR-publish time. If the evidence agrees, the
-- swimmer is told so immediately AND the override is written straight into session_adaptations -- the same
-- cloud table and the same {sessionId,itemId,athleteId,patch:{stroke},active,createdAt,updatedAt} row shape
-- engines/modification-edit.js's own poolside stroke-change UI already produces (app.js's
-- projectAdaptationRows) -- so app.js's pullSessionAdaptations (added alongside this migration) picks it up
-- and reflects it on Andy's own board next time his app refreshes. If the evidence does not agree, the swimmer
-- is told to check with Andy, exactly as today, and nothing is auto-applied.

create or replace function public.msos_swimmer_submit_stroke_challenge(
  p_device_token text,
  p_session_id text,
  p_block_id text,
  p_item_id text,
  p_current_stroke text,
  p_proposed_stroke text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  dev public.msos_swimmer_devices;
  v_payload jsonb;
  v_session jsonb;
  v_item jsonb;
  v_evidence jsonb;
  v_is_medley boolean;
  v_approved boolean := false;
  v_reason text;
  v_share numeric;
  v_top text;
  v_proposed_points text;
  v_top_points text;
  v_action public.msos_swimmer_session_actions;
  v_org_id uuid;
  v_existing_snapshot jsonb;
  v_existing_overrides jsonb;
  v_prior_created_at text;
  v_now text := to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_new_override jsonb;
  v_merged_overrides jsonb;
begin
  select * into dev
  from public.msos_swimmer_devices
  where token_hash=encode(digest(coalesce(p_device_token,''),'sha256'),'hex')
    and revoked_at is null;
  if dev.id is null then raise exception 'Device access invalid or revoked'; end if;
  if coalesce(trim(p_session_id),'')='' or coalesce(trim(p_item_id),'')='' then raise exception 'Session and item id required'; end if;
  if coalesce(p_proposed_stroke,'') not in ('Freestyle','Backstroke','Breaststroke','Butterfly') then raise exception 'Unsupported stroke'; end if;

  -- Locate the published evidence for this exact item (session may be the "current" one or any calendar entry).
  select payload into v_payload from public.msos_swimmer_payloads where athlete_id=dev.athlete_id;
  if v_payload is null then raise exception 'No swimmer payload published'; end if;

  select s into v_session from jsonb_array_elements(coalesce(v_payload->'sessions','[]'::jsonb)) s
  where s->>'id'=p_session_id limit 1;
  if v_session is null and (v_payload->'session'->>'id')=p_session_id then v_session := v_payload->'session'; end if;
  if v_session is null then raise exception 'Session not found in your published view'; end if;

  select i into v_item from jsonb_array_elements(coalesce(v_session->'blocks','[]'::jsonb)) b,
    jsonb_array_elements(coalesce(b->'items','[]'::jsonb)) i
  where i->>'id'=p_item_id limit 1;
  if v_item is null then raise exception 'Set not found in your published session'; end if;

  v_evidence := v_item->'strokeEvidence';
  if v_evidence is null or jsonb_typeof(v_evidence)='null' then
    v_reason := 'No evidence has been published for this set — check with Andy.';
  else
    v_is_medley := coalesce((v_evidence->>'isMedley')::boolean,false);
    if v_is_medley then
      v_approved := coalesce(v_evidence->'needsWorkStrokes' ? p_proposed_stroke, false);
      v_share := coalesce((v_evidence->'shares'->>p_proposed_stroke)::numeric,0);
      v_reason := case when v_approved
        then format('IM training-volume logic agrees: %s is under-trained this week (%s%% of weighted 7-day volume).', p_proposed_stroke, trim(to_char(v_share,'FM990.0')))
        else format('IM training-volume logic: %s already gets %s%% of weighted 7-day volume — that doesn''t match the "needs work" logic. Check with Andy.', p_proposed_stroke, trim(to_char(v_share,'FM990.0')))
      end;
    else
      v_top := nullif(v_evidence->>'topStroke','');
      v_approved := v_top is not null and p_proposed_stroke = v_top;
      v_proposed_points := v_evidence->'rankedPoints'->>p_proposed_stroke;
      v_top_points := case when v_top is not null then v_evidence->'rankedPoints'->>v_top else null end;
      v_reason := case
        when v_approved then format('Ranked evidence agrees: %s is the highest World Aquatics points stroke.', p_proposed_stroke)
        when v_proposed_points is not null and v_top is not null then format('Ranked evidence: %s (%s pts) outranks %s (%s pts) — that doesn''t match the #1-by-points logic. Check with Andy.', v_top, v_top_points, p_proposed_stroke, v_proposed_points)
        else format('No ranked World Aquatics evidence for %s — check with Andy.', p_proposed_stroke)
      end;
    end if;
  end if;

  insert into public.msos_swimmer_session_actions(
    athlete_id,session_id,action_type,block_id,item_id,payload,created_from_device
  ) values(
    dev.athlete_id,p_session_id,'challenge',nullif(trim(p_block_id),''),nullif(trim(p_item_id),''),
    jsonb_build_object(
      'kind','stroke','currentStroke',coalesce(p_current_stroke,''),'proposedStroke',p_proposed_stroke,
      'reason',coalesce(p_reason,''),
      'autoVerdict',jsonb_build_object('approved',v_approved,'reason',v_reason,'evaluatedAt',v_now)
    ),
    dev.id
  ) returning * into v_action;

  update public.msos_swimmer_devices set last_seen_at=now() where id=dev.id;

  if v_approved then
    select organisation_id into v_org_id from public.athletes where id=dev.athlete_id;
    if v_org_id is not null then
      select evidence_snapshot into v_existing_snapshot from public.session_adaptations
        where session_id=p_session_id and athlete_id=dev.athlete_id for update;
      v_existing_overrides := coalesce(v_existing_snapshot->'v4_item_overrides','[]'::jsonb);
      select x->>'createdAt' into v_prior_created_at from jsonb_array_elements(v_existing_overrides) x
        where x->>'itemId'=p_item_id and x->>'athleteId'=dev.athlete_id limit 1;
      v_new_override := jsonb_build_object(
        'id','v4-adaptation-item-'||encode(digest(p_session_id||'|'||p_item_id||'|'||dev.athlete_id,'sha256'),'hex'),
        'sessionId',p_session_id,'itemId',p_item_id,'athleteId',dev.athlete_id,
        'patch',jsonb_build_object('stroke',p_proposed_stroke),
        'active',true,
        'createdAt',coalesce(v_prior_created_at,v_now),
        'updatedAt',v_now,
        'source','swimmer_stroke_challenge'
      );
      select coalesce(jsonb_agg(x),'[]'::jsonb) into v_merged_overrides
        from jsonb_array_elements(v_existing_overrides) x
        where not (x->>'itemId'=p_item_id and x->>'athleteId'=dev.athlete_id);
      v_merged_overrides := v_merged_overrides || jsonb_build_array(v_new_override);

      insert into public.session_adaptations(
        id,organisation_id,session_id,athlete_id,adapted_text,generation_method,rule_snapshot,evidence_snapshot,coach_approved,created_at,updated_at
      ) values(
        'v4-adaptation-'||encode(digest(p_session_id||'|'||dev.athlete_id,'sha256'),'hex'),
        v_org_id,p_session_id,dev.athlete_id,
        jsonb_array_length(v_merged_overrides)||' swimmer/coach override(s), incl. an evidence-approved swimmer stroke challenge',
        'msos_v4_swimmer_stroke_challenge','[]'::jsonb,
        jsonb_build_object('schema',4,'v4_item_overrides',v_merged_overrides),
        true,now(),now()
      )
      on conflict (session_id,athlete_id) do update set
        evidence_snapshot=excluded.evidence_snapshot,
        adapted_text=excluded.adapted_text,
        generation_method=excluded.generation_method,
        updated_at=now();
    end if;
  end if;

  return jsonb_build_object('id',v_action.id,'approved',v_approved,'reason',v_reason,'appliedToBoard',v_approved and v_org_id is not null);
end $$;

grant execute on function public.msos_swimmer_submit_stroke_challenge(text,text,text,text,text,text,text) to anon, authenticated;
