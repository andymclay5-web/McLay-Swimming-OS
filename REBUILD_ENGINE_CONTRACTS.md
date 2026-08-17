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

## Engine sequence

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
- unknown coaching language preserved;
- no phantom metres from `10 sr`, `15m Max`, cues, composition or summary lines.

### Engine 2 — Session Lifecycle / Storage

Purpose: create, select, edit, save and restore sessions without changing identity accidentally.

Owns:
- selected session ID;
- draft IDs;
- explicit create/replace/edit transactions;
- original-plan history;
- delivered/current truth revisions.

Forbidden:
- reparsing or rewriting an existing saved session merely because the app loaded;
- clearing attendance on parser/version changes;
- making a draft authoritative until the coach explicitly creates/replaces a session.

### Engine 3 — Attendance

Purpose: answer who is actually here for this canonical session.

Owns attendance records only.

Targets/adaptations/Board read attendance; they never infer it from previous sessions.

### Engine 4 — Evidence / Performance Data

Purpose: retrieve verified athlete evidence through one interface.

Owns retrieval contracts for:
- T400;
- PB/event history;
- course conversion source;
- timed tests;
- coach-entered verified evidence.

Legacy/local/cloud storage locations are implementation details behind this engine. Consumers never search stores themselves.

### Engine 5 — Target Engine

Purpose: canonical set + athlete + evidence -> target prescription.

Owns:
- aerobic T400 calculations;
- race-pace/PB calculations;
- practical send-off calculation;
- evidence provenance;
- explicit missing-evidence result.

Forbidden:
- changing the canonical set;
- inventing targets when evidence is missing.

### Engine 6 — Adaptation Engine

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

### Engine 7 — Board Projection

Purpose: present canonical squad work + attendance + target results + actual modifications compactly.

The Board is a projection only.

Rules:
- whole session visible compactly;
- rounds remain grouped;
- composition/pattern shown beneath parent work;
- common group work left/main;
- only genuine modifications shown beside it;
- no swimmer shown unless present/selected for that session;
- target evidence is requested from Target Engine, never calculated in Board code.

### Engine 8 — Capture / Evidence Write

Purpose: attach note/voice/photo/video/timing evidence to exact session/block/set/athlete identity, local-first.

### Engine 9 — Plan Context

Purpose: annual/season -> phase -> week -> session purpose/stimulus context.

It informs session creation/review without rewriting delivered session truth.

### Engine 10 — Reporting / Learning

Purpose: project stored truth into athlete, squad, coach and programme reports.

Reports write no coaching truth.

## Integration rule

An engine does not enter the production composition root until:

1. isolated contract tests pass;
2. recovered historical/proven sessions pass;
3. side-effect tests pass;
4. previous owner for that domain is removed, not wrapped;
5. no second implementation remains later in the load order;
6. phone acceptance is completed where the engine affects deck use.

## Immediate rebuild order

1. finish Session Truth grammar and regression corpus;
2. build Session Lifecycle so drafts and saved sessions cannot compete;
3. build one Evidence API for T400/PB/results;
4. port Target Engine behind that API;
5. rebuild Adaptation around coaching rules rather than percentage scaling;
6. connect compact Board as a pure projection;
7. add Attendance before target/adaptation projection;
8. only then reconnect capture, Finish, swimmer/TV/assistant surfaces and reporting.

## Release gate

The rebuild branch must not replace `main` until the canonical owner map shows exactly one owner for Parser, Session Lifecycle, Attendance, Evidence, Targets, Adaptation and Board projection, and all protected sessions pass their regression suite.
