# McLay Swimming OS — Engine Ownership Rebuild

Branch: `rebuild/engine-contracts-v1`

This branch is intentionally isolated from the live Pages build. It exists to remove competing implementation owners and rebuild MSOS one engine at a time.

## Why this rebuild exists

The current main app has multiple implementations owning the same domains:

- `app.js` defines the base Parser, Adaptation and Target engines.
- `v4-correct.js` replaces/extends Adaptation and Target behaviour.
- `v4-poolside-core.js` replaces Parser behaviour again, replaces Board rendering, replaces session intake, and contains an automatic selected-session repair on app load.
- `engines/session-truth.js` and `engines/morning-coaching.js` exist as separate engines but are not the authoritative owners used by the main app.

That violates the product rule that every authoritative domain operation has one implementation owner.

## Non-negotiable architecture rule

Each engine has:

1. one purpose;
2. explicit inputs;
3. explicit reads;
4. explicit outputs;
5. explicit writes;
6. one storage owner;
7. forbidden side effects;
8. regression tests before integration.

No screen or late-loaded script is allowed to redefine another engine's domain functions.

A consumer may request information from another engine, but it may not duplicate that engine's calculation or search its storage directly.

## Canonical flow

`Plan context -> Session intake -> Session Truth -> Session Lifecycle -> Attendance -> Evidence/Results -> Targets + Adaptation -> Board/TV/Swimmer/Assistant projections -> Capture/Delivered truth -> Dose analysis -> Reporting/Learning -> next plan decision`

The canonical session is interpreted once. Every later surface consumes that understood structure rather than reparsing coach language.

## Engine sequence and contracts

### Engine 1 — Session Truth

Purpose: natural coaching language -> deterministic canonical session.

Owns:
- blocks;
- rounds/groups;
- runnable sets;
- reps and distance;
- stroke/mode/equipment text;
- authored rest/cycle;
- composition;
- repeating rep patterns;
- rep-specific instructions;
- cues;
- race-pace intent metadata;
- written-total comparison;
- stable canonical node IDs.

Reads:
- raw coach session text;
- explicit session identity supplied by Session Lifecycle.

Writes:
- nothing outside its returned canonical session object.

Forbidden:
- athlete data;
- attendance;
- T400/PB lookup;
- modifications;
- Board HTML;
- localStorage;
- cloud;
- automatic mutation of an already saved session.

Hard regressions include:
- 17 Aug live 4,650m session;
- Tue AM 18 Aug 5,400m session;
- Sat National protected 5,450m session;
- headings with rounds;
- nested/local rounds;
- `12 x 50 Total` = summary metadata, zero extra metres;
- `12 x 50` plus `1 Scull / 1 Drill / 1 Swim` = 600m once;
- `16 x 50` plus `8 x 50 Bands / 8 x 50 Swim` = parent 800m with two child phases, not 1,600m;
- `1 @ 200 Pace` survives as rep-specific race intent;
- `#4 + #8 @ 100 Pace` survives as rep-specific race intent;
- unknown coaching language preserved;
- no phantom metres from `10 sr`, `15m Max`, cues, composition or summary lines.

### Engine 2 — Session Lifecycle / Storage

Purpose: create, select, edit, save and restore sessions without changing identity accidentally.

Owns:
- selected session ID;
- draft IDs;
- explicit create/replace/edit transactions;
- original-plan history;
- delivered/current truth revisions;
- local-first canonical session persistence.

Forbidden:
- reparsing or rewriting an existing saved session merely because the app loaded;
- clearing attendance on parser/version changes;
- making a draft authoritative until the coach explicitly creates/replaces a session;
- changing date/squad/slot identity without explicit coach action.

### Engine 3 — Attendance

Purpose: answer who is actually here for this canonical session.

Owns attendance records only.

Targets/adaptations/Board read attendance; they never infer it from previous sessions.

### Engine 4 — Evidence Retrieval

Purpose: provide one verified read interface over athlete evidence regardless of where it is physically stored.

Owns retrieval contracts for:
- T400 and other test evidence;
- PB/event history;
- course conversion source;
- timed-set evidence;
- coach-entered verified results;
- evidence provenance and recency.

Legacy/local/cloud storage locations are implementation details behind this engine. Consumers never search those stores themselves.

Forbidden:
- calculating training targets;
- calculating pathway positions;
- rewriting result history because a consumer requested it.

### Engine 5 — Results / Performance Pathway

Purpose: verified swimmer evidence -> swimmer performance and pathway answers.

Owns:
- current PB per event/course;
- qualification standards and gap-to-standard;
- pathway/points ladder position;
- closest/furthest events;
- progress history and meaningful trend;
- meet/event readiness facts;
- swimmer profile performance summary.

Reads:
- Evidence Retrieval;
- meet standards/pathway rules;
- swimmer identity/classification where applicable.

Outputs deterministic answer objects that Times, Swimmer Device, Coach profile and Reports may display.

Forbidden:
- Board rendering;
- changing PB/result evidence;
- creating training targets directly.

### Engine 6 — Target Engine

Purpose: canonical set + athlete + evidence -> target prescription.

Owns:
- aerobic T400 calculations;
- race-pace/PB calculations;
- practical send-off calculation;
- rep-specific target rows;
- evidence provenance;
- explicit missing-evidence result.

Reads Evidence Retrieval and, where useful, Results/Pathway for event/PB context.

Forbidden:
- changing the canonical set;
- inventing targets when evidence is missing;
- searching local/cloud stores itself.

### Engine 7 — Adaptation Engine

Purpose: canonical set + athlete profile/constraints -> athlete prescription.

Order of decision:
1. capability/safety constraint;
2. preserve set purpose/stimulus;
3. preserve team inclusion where practical;
4. preserve pattern-dependent structure;
5. practical pool-end geometry;
6. volume guidance.

A percentage is guidance, never the primary rule.

Example McKenzie contract in SCM:
- continuous condensed work returns to the starting end;
- 400 continuous may become 300, not 275;
- 200 continuous may become 150, not 125;
- `4 x 100 Descend 1-4` keeps four reps unless a specific athlete rule says otherwise;
- `2 x 100 1 Build / 1 Fast` keeps the two-rep pattern;
- short shared quality work stays with the team when practical.

Forbidden:
- mutating canonical squad work;
- Board-specific formatting;
- blindly applying a volume percentage when it destroys the set.

### Engine 8 — Board Projection

Purpose: present canonical squad work + attendance + target results + actual modifications compactly.

The Board is a projection only. It does not interpret coach language and does not calculate targets or modifications.

Rules:
- whole session visible compactly;
- rounds remain grouped;
- composition/pattern shown beneath parent work;
- common group work left/main;
- only genuine modifications shown beside it;
- no swimmer shown unless present/selected for that session;
- target evidence is requested from Target Engine, never calculated in Board code;
- an engine failure is contained: squad work still renders and the failed derived item is visibly marked unavailable.

### Engine 9 — Capture / Evidence Write

Purpose: attach note/voice/photo/video/timing evidence to exact session/block/set/athlete identity, local-first.

Owns:
- evidence record creation;
- media/local save acknowledgement;
- stable links to session/block/set/athlete/coach/time;
- later cloud replication state.

Forbidden:
- changing session prescription;
- deciding what an observation means.

### Engine 10 — Delivered Session / Finish

Purpose: record what was actually delivered from canonical session revisions plus explicit Finish state.

Owns:
- delivered-through point;
- planned-vs-delivered structural record;
- live edit journal linkage;
- final delivered session snapshot.

Forbidden:
- silently regenerating delivered truth from the original plan.

### Engine 11 — Plan Context

Purpose: annual/season -> phase/cycle -> week -> session purpose/stimulus context.

Owns the planning hierarchy and intended emphasis.

It informs session creation and review without rewriting delivered session truth.

### Engine 12 — Session Dose / Coaching Analysis

Purpose: canonical planned session + delivered session + attendance/evidence -> objective description of the training dose actually delivered.

Owns:
- distance/duration composition by training system/stimulus;
- primary versus supporting work;
- recovery/reset context so recovery metres do not distort the session's intended tone;
- athlete-specific delivered dose where modifications materially change it;
- planned-versus-delivered comparison;
- week/phase exposure accumulation;
- evidence-linked coaching flags such as under/over-exposure, repeated missed work, or a mismatch with the planned emphasis.

Reads:
- Plan Context;
- Session Truth;
- Delivered Session;
- Attendance;
- Adaptation outputs actually delivered;
- captured/test evidence where relevant.

Outputs analysis facts and coaching prompts. It does not write the session or plan.

This is where the existing 'dose' logic belongs. Coach Hub and Reports display these answers; they do not independently classify the session.

### Engine 13 — Reporting / Learning

Purpose: project stored truth and analysis into athlete, squad, coach and programme reports.

Owns report assembly only.

Examples:
- swimmer progression/pathway report;
- squad exposure and attendance report;
- session/week/cycle dose report;
- planned versus delivered report;
- coach behaviour/observation report;
- evidence-linked next-action summary.

Reads Results/Pathway, Session Dose/Analysis, Attendance, Capture evidence and Plan Context.

Reports write no coaching truth.

### Engine 14 — Presentation Surfaces

Coach Board, TV Board, Individual Swimmer Device, Assistant Coach, Times and Meet views are separate presentation channels over the engines above.

They may choose different information density and privacy rules, but they do not own duplicate swimming logic.

## Integration rule

An engine does not enter the production composition root until:

1. isolated contract tests pass;
2. recovered historical/proven sessions pass;
3. side-effect tests pass;
4. previous owner for that domain is removed, not wrapped;
5. no second implementation remains later in the load order;
6. failure behaviour is explicit and contained;
7. phone acceptance is completed where the engine affects deck use.

## Immediate rebuild order

1. finish Session Truth grammar and regression corpus;
2. build Session Lifecycle so drafts and saved sessions cannot compete;
3. build one Evidence Retrieval API for T400/PB/results;
4. build Results/Pathway over that evidence API;
5. port Target Engine behind Evidence/Results contracts;
6. rebuild Adaptation around coaching rules rather than percentage scaling;
7. build Attendance as exact current-session truth;
8. connect compact Board as a pure projection;
9. reconnect Capture and Delivered/Finish truth;
10. rebuild Plan Context and Session Dose/Analysis;
11. build Reports/Learning over those engines;
12. then expose TV, Swimmer, Assistant and Times surfaces over the same contracts.

## Release gate

The rebuild branch must not replace `main` until the canonical owner map shows exactly one owner for Session Truth, Session Lifecycle, Attendance, Evidence Retrieval, Results/Pathway, Targets, Adaptation, Board Projection, Capture, Delivered Truth, Plan Context, Session Dose/Analysis and Reporting/Learning, and all protected historical sessions pass their regression suites.
