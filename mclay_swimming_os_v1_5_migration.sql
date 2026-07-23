-- McLay Swimming OS Version 1.5 — Workflow & Evidence
-- Run once in Supabase SQL Editor before uploading the Version 1.5 website files.

alter table public.athletes
  add column if not exists date_of_birth date,
  add column if not exists primary_events text[] not null default '{}',
  add column if not exists current_focus text,
  add column if not exists technical_focus text,
  add column if not exists modifications text,
  add column if not exists coach_notes text,
  add column if not exists next_meet_name text,
  add column if not exists next_meet_date date,
  add column if not exists next_meet_venue text,
  add column if not exists pb_summary jsonb not null default '[]'::jsonb,
  add column if not exists qualifying_summary jsonb not null default '[]'::jsonb,
  add column if not exists records_summary jsonb not null default '[]'::jsonb;

alter table public.sessions
  add column if not exists plan_cue text,
  add column if not exists next_session_cue text,
  add column if not exists sets jsonb not null default '[]'::jsonb;

alter table public.session_reviews
  add column if not exists actual_distance integer not null default 0,
  add column if not exists actual_duration integer not null default 0,
  add column if not exists energy_systems jsonb not null default '{}'::jsonb,
  add column if not exists training_modes jsonb not null default '{}'::jsonb,
  add column if not exists stroke_exposure jsonb not null default '{}'::jsonb,
  add column if not exists athlete_response text,
  add column if not exists modifications text,
  add column if not exists race_split_evidence text,
  add column if not exists completed_at timestamptz;

-- Populate structured set lines from future app saves. Existing sessions remain valid.
