-- 12 Oct 2026 (applied to the live project by Claude via Supabase MCP): the v4 app links typed-session change
-- journals and timed-set identities through session_transcriptions with source_type 'text' (and 'training');
-- the old check only allowed photo/voice, so every one of those rows was rejected by cloud sync
-- ("102 failed" on Andy's phone, 11 Oct). Widen the allowed values; existing rows unaffected.
alter table public.session_transcriptions drop constraint if exists session_transcriptions_source_type_check;
alter table public.session_transcriptions add constraint session_transcriptions_source_type_check
  check (source_type = any (array['photo'::text,'voice'::text,'text'::text,'training'::text,'video'::text]));
