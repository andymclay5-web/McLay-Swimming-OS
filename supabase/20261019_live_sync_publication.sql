-- Live updates between phones (19 Oct 2026). Andy: "I don't want to have to hit sync ... changes need to show pretty
-- much instantly ... two coaches doing a role ... contradicting each other."
-- engines/live-sync.js keeps one Supabase Realtime connection per phone and listens for changes to these tables for its
-- club (row-level security still decides what each coach receives). Only coach_messages was in the feed before.
alter publication supabase_realtime add table public.attendance, public.sessions, public.session_blocks, public.captures, public.session_adaptations;
-- APPLIED to project cwoqjxiniuwmslltsfgi on 19 Oct 2026 (checked: the publication lists attendance, captures,
-- coach_messages, session_adaptations, session_blocks, sessions; a real attendance change reached a listening
-- connection within a second).
