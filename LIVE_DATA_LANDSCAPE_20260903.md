# MSOS live data landscape — snapshot 3 September 2026

Purpose: a structural map of the actual production data behind McLay Swimming OS, so a future
session (Claude or otherwise) can orient quickly instead of re-discovering the schema from
scratch. **This is a snapshot, not a live source** — row counts, date ranges and coverage gaps
below will drift as the club keeps using the app. The Supabase project itself is always the
authoritative current state; re-query it for anything time-sensitive. Nothing here is a substitute
for `DATA_REFERENCE_CONTRACT.md` (the ownership/update-flow contract) or `AUTHORITY_MAP.md` (the
runtime writer map) — this document is the "what data actually exists today" companion to those.

## Backend identity

- Supabase project: **McLay Swimming OS** (`cwoqjxiniuwmslltsfgi`, region `ap-northeast-1`),
  created 22 July 2026. A second, apparently-unrelated project (`ldkxgkigfbviyxlspxrl`,
  "andymclay5@gmail.com's Project") also exists on the account — not touched, not the app backend.
- Single organisation row: `McLay Swimming OS` (id `9d40beff-e632-414d-9daa-7ee78104ad2a`),
  created 22 July 2026 — confirms this is a single-tenant deployment today (one club, one
  `organisation_id` value stamped on every row), even though the schema (`organisations`,
  `organisation_members`, RLS on every table) is built multi-tenant-ready.
- All 68 `public` tables have Row Level Security enabled.

## Schema landscape (populated tables, by domain)

Row counts below are actual `count(*)`, not the Postgres planner estimate (`pg_stat_user_tables`
reports 0 for every table here — `ANALYZE` has apparently never run — so don't trust that view for
this database).

**Roster / identity**
- `athletes` — 72 rows, 72 active. Columns include `pb_summary`, `qualifying_summary`,
  `records_summary` (all `jsonb`) — **every row's `pb_summary` sampled was `[]`**. PBs are not
  being persisted to this column; the app almost certainly computes current PB/ranking live from
  `race_results`/`coach_results` rather than reading a maintained cache column. Worth confirming
  in the client code before assuming this column means anything.
- `athlete_aliases` — 34 (name-matching aliases for result import).
- Squad breakdown (active): Intermediate 21, Development 18, Fitness 17, National 9, Junior 5,
  Novice Para 1.

**Training / testing**
- `training_test_results` — 177 rows, **100% T400 Freestyle** (`training_test_types` has 10 test
  types defined, but only `t400_freestyle` has any results). Course tag: essentially all `SCM`
  (one row has a null course). Result dates cluster on the 1st of each month from 2025-10-01
  through 2026-06-01, plus one later capture 2026-08-14 — reads like a monthly test-day cadence
  in the training programme, not continuous testing.
- `training_test_types` — 10 defined test types (only T400 Freestyle actually used yet).
- `athlete_adaptation_profiles` — 7, `athlete_adaptation_rules` — 4, `session_adaptations` — 2,
  `adaptation_learning_events` — 2. Individual-modification data exists but is thin — a handful of
  athletes, not the whole roster.

**Sessions**
- `sessions` — 153 rows, spanning 2026-07-22 to 2026-09-05 (so includes near-future planned
  sessions, not just delivered ones), across 5 venues.
- `session_blocks` — 132, `session_lane_assignments` — 533, `session_participants` — 30,
  `session_transcriptions` — 53, `session_reviews` — 19.
- `attendance` — 258, `captures` — 90 (coach notes/media captured during sessions).
- `season_plans`, `weekly_plans`, `squad_timetable_slots`, `session_zone_classifications`,
  `session_zone_summaries` — all **empty**. The season/weekly planning layer and zone
  classification layer are built (schema exists, `sessions` has `season_plan_id`/`weekly_plan_id`
  foreign columns ready) but not populated — planning context isn't actually being captured yet,
  or is being captured elsewhere and not synced here.

**Racing / results**
- `race_results` — 650 rows, **27 of 72 athletes** have at least one. Course split: LCM 458
  (21 athletes, 2026-01-23 to 2026-05-17), SCM 169 (23 athletes, 2025-09-21 to 2025-11-02), 23
  rows with no course tag. **The club's actual competitive season is majority long-course** — NZ
  Opens, NAGS, South Island LC, Canterbury Champs, Div II are all LCM; only Aquagym Challenge and
  NZSC (both 2025) were SCM meets.
- `coach_results` — 672 (coach-entered/manual result records, a parallel/overlapping source to
  `race_results` — likely the older or manual-entry pathway; not reconciled against `race_results`
  as part of this pass).
- `race_results_staging` — 637 (import staging, presumably the pre-approval buffer for
  `race_results`).
- `meets` — 10 defined (NZ Opens 2026, NAGS 2026, South Island LC 2026, Canterbury Champs 2026,
  Div II 2026, plus 3 individual-swimmer European meets and 2 2025 SCM meets).
- `athlete_achievements` — 6. `swim_meets`, `swim_meet_entries`, `swim_meet_feedback` — all
  **empty** (a second, apparently-superseded or not-yet-wired meet schema alongside `meets`).

**Reference / pathway data** (large, mostly static reference tables — not club-specific)
- `pathway_standards` — 4,406, `performance_pathway_benchmarks` — 2,236,
  `performance_point_milestones` — 1,190, `world_para_point_parameters` — 384,
  `qualifying_standards` — 275, `target_squad_standards` — 272, `world_aquatics_base_times` — 70,
  `pathway_meets` — 8, `squad_programmes` — 7. These back the WA-points/pathway-gap calculations
  described in `DATA_REFERENCE_CONTRACT.md`.

**Legacy / staging / admin**
- `mclay_v3213_snz_results_stage_20260811` — 176, `mclay_result_backup_20260811` — 61: dated,
  one-off staging/backup tables from an 11 August 2026 import — worth confirming with Andy whether
  these are safe to archive/drop once trusted, or need to stay as an audit trail.
- `result_import_batches`, `coach_invitations`, `training_pace_models`, `coaching_profiles`,
  `result_import_audits`, `coach_communications` — 1 row each (single-tenant singletons/admin
  config, as expected for a one-club deployment).
- `test_sets`, `test_set_attempts`, `timed_sets` — all **empty**. The structured test-set/timing
  schema exists but timed-set capture isn't landing here yet.
- `msos_owner_accounts`, `msos_swimmer_payloads`, `msos_swimmer_invites`, `msos_swimmer_devices`
  — all **empty**. This is the remote-swimmer-device backend (secure swimmer login/own-device
  sync). Confirms `CLAUDE.md` §3.9's note that Matthew's remote-swimmer setup is a stated priority
  but not yet actually live in production — zero rows anywhere in that pathway.
- `race_goals`, `competition_records`, `athlete_squad_history`, `athlete_individual_plans`,
  `athlete_classifications`, `xlr8_base_times`, `xlr8_course_conversions`, `xlr8_scores`,
  `reference_import_batches`, `reference_import_rows`, `coach_result_aliases`,
  `legacy_training_archive`, `weekly_reports` — all **empty**. Schema built ahead of use for
  several features (race goal-setting, XLR8 scoring, a reference-import audit trail, weekly
  reports) that haven't been turned on yet.

## Read this alongside the writer-map work done today

The T400 SCM/LCM course-isolation fix made earlier in this session (evidence.js → aerobic.js →
bridge.js, `tests/t400-course-isolation-20260903.cjs`) has **no observed real-world trigger yet**
— every T400 result on file is SCM. But the club's actual race season is majority LCM (458 of 650
race results), so an LCM T400 test day is a plausible near-term event, not a hypothetical — the
fix is dormant-safe today and will matter for real the first time someone captures a T400 in a
long-course pool.

## Open questions worth putting to Andy, not guessed at here

- Is `coach_results` (672 rows) meant to be reconciled/deduplicated against `race_results`
  (650 rows), or are they intentionally two separate pathways (manual coach entry vs imported
  official results)?
- Are the two `_20260811`-dated legacy tables safe to archive?
- Is `pb_summary` on `athletes` meant to be kept in sync, or is it known-dead and PB truth is
  entirely computed client-side from `race_results`/`coach_results`?
