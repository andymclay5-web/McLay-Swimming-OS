# McLay Swimming OS — Engine System Map

Branch: `rebuild/engine-contracts-v1`

## Product shape

MSOS is a thin application shell around independent coaching engines.

The shell owns:
- navigation;
- screen mounting;
- device/offline state;
- local persistence adapters;
- cloud replication adapters;
- authentication/role context;
- installation/update state;
- the composition root.

The shell does **not** own swimming calculations, pathway logic, result interpretation, session parsing, target calculation, adaptation rules, dose classification or report meaning.

Every coaching domain is an engine with one owner and an explicit portal contract.

## Engine Communication Portal — Engine 0 — GREEN

All engine-to-engine traffic crosses `rebuild/engine-portal.js`.

Portal rules:
1. every engine/surface registers one manifest;
2. every outgoing dependency is declared before the portal is sealed;
3. reads are `query` operations;
4. writes are `command` operations;
5. query permission never grants command permission;
6. an engine cannot call another engine's undeclared operation;
7. payloads and responses are cloned at the boundary;
8. the routing audit records caller/target/operation/context only, never swimmer/result payload values;
9. the portal owns no coaching truth and no engine storage;
10. no pub/sub or hidden broadcast may mutate other engines;
11. the local coaching path is synchronous/local-first; remote/network activity sits behind separate sync/input adapters;
12. once composition is sealed, late wrappers/replacement owners cannot be attached;
13. nested calls preserve one cause lineage for diagnostics without sharing domain state;
14. failure is contained and explicit; there is no silent fallback to another implementation.

The portal is a contract router, **not** a god object and not a database.

## Canonical context keys

Inputs and engine answers should carry only the identifiers needed for their scope:

- `clubId`
- `coachId`
- `squadId`
- `athleteId`
- `sessionId`
- `blockId`
- `itemId`
- `meetId`
- `meetSessionId`
- `eventId`
- `raceId`
- `testProtocolId`
- `testResultId`
- `course`
- `asOfDate`

These IDs are stable addresses. Screens do not infer identity from names or current UI state.

## Evidence status model

Any measured/imported result carries provenance and status.

Recommended lifecycle:

`captured -> provisional/unverified -> reconciled -> verified`

Alternative terminal/revision states:
- `corrected`
- `dq`
- `dns`
- `superseded`
- `rejected`

Poolside evidence can be useful before official verification, but permanent PB/record/pathway truth must be able to distinguish provisional from verified evidence.

## Implemented core engines

### Entity Registry — GREEN

One canonical owner for club, coach, squad and swimmer identity.

Owns:
- canonical IDs;
- explicit aliases and source-ID mapping;
- squad memberships;
- active/inactive state;
- DOB/sex/classification/reporting dimensions;
- date-aware roster lookup.

Legacy/current evidence sources may contain different athlete IDs or approved aliases. Entity Registry resolves those references once. Evidence, Attendance, Adaptation, Capture, Methodology and Planning consume that identity contract rather than maintaining competing resolvers.

### Methodology / Coaching Model — GREEN

Stores coaching interpretation rather than objective measurements.

Overlay order:
`programme -> club -> squad -> coach -> athlete`

Owns configurable definitions for:
- physiology/framework;
- training zones;
- dose interpretation;
- adaptation principles;
- race-model preferences;
- session-design principles.

A recorded swim time remains the same fact regardless of methodology. Methodology affects how eligible decision engines interpret or use that fact.

### Programme Plan / Plan Context — GREEN

Canonical planning hierarchy:
`season -> phase -> cycle -> week -> explicit session intent`

Also owns target meets, squad objectives, athlete objectives and planned exposure.

Plan writes are explicit commands and journalled. Missing session intent is explicit; Plan does not reverse-engineer a plan from workout vocabulary.

### Session Truth — GREEN / LOCKED

Natural coaching language -> one canonical session. Owns workout semantics, distance, rounds, composition, patterns, phases, race intent and stable set IDs.

### Session Lifecycle / Edit — GREEN

Owns create/select/resume/edit/version history without background reparsing or session identity takeover.

### Evidence Retrieval — GREEN ON ENTITY REGISTRY

The read doorway over test/result/PB/conversion evidence. It no longer owns swimmer identity.

### Results / Performance Pathway — GREEN

Verified evidence -> PBs, pathway position, points/standards/gaps/trends.

### Target Engine — GREEN

Canonical set + athlete + evidence -> target prescription and provenance.

### Adaptation Engine — GREEN

Canonical set + athlete context -> same-team or modified prescription. Explicit coach overrides remain athlete/session/set scoped.

### Attendance — GREEN

Exact-session attendance only.

### Coach Board — GREEN IN ISOLATED/INTEGRATION GATES

Presentation/projection only. It asks engines for answers; it does not calculate swimming truth.

### Capture / Delivered / Dose / Reporting / Learning

Existing rebuild engines are retained behind their domain boundaries and continue passing the full poolside chain. They are scheduled for further untangling/expansion after measurement and meet-input engines are added.

## Next engine layer

The next independent input/measurement engines are:

1. **Timing Engine** — clocks, laps, splits, multi-swimmer/lane timing and timing-session identity; it records measurements but does not decide their meaning.
2. **Test Protocol Engine** — canonical definitions of T400 and future training/test protocols, including valid conditions, expected measurement fields and which downstream models may use the result.
3. **Test Result Input Engine** — timing/manual/imported test evidence -> canonical provisional/verified test-result records with provenance.
4. **Meet Lifecycle Engine** — meet/session/event/entry/heat/lane/race/round lineage, separate from training-session truth.
5. **Meet Result Input Engine** — copied Meet Mobile/Swimify text, screenshots/photos, manual entry or supported live feeds -> provisional canonical result candidates.
6. **Official Results Reconciliation Engine** — official TM file -> confirm/correct/DQ/add missed races while preserving provisional history.
7. **Standards & Records Engine** — qualification standards, club/Canterbury/NZ records and category matching.
8. **Race Model Engine** — PBs/splits/ideal or projected splits -> race-segment answers for Targets, Meet and swimmer pathway views.

## How future surfaces consume the same engines

### Group / TV Board
Same canonical session as Coach Board. Common work remains grouped; athlete-specific boxes appear only where work or targets genuinely diverge.

### Individual swimmer phone/tablet
Privacy-filtered projection of that swimmer's canonical work, targets, modifications, shared evidence, pathway and meet information.

### Assistant Coach
Same underlying engines, permission-gated by assigned squad/session. Default poolside writes are limited to explicitly granted domains.

### Meet Board
Reads Meet Lifecycle, provisional/verified Meet Results, Standards/Records, Results/Pathway and Race Model. It does not calculate records or qualifying times itself.

### Reports / profile projections
A swimmer, squad, coach, age bracket, sex, classification or other reporting slice is a projection over canonical entity dimensions plus engine answers. There is no duplicate report database per view.

## Integration rule

An engine does not enter the production composition root until:

1. isolated contract tests pass;
2. recovered historical/proven behaviour passes;
3. side-effect tests pass;
4. all dependencies cross the Engine Portal;
5. the previous competing owner is removed, not wrapped;
6. failure behaviour is explicit and contained;
7. existing Parser/Board/poolside regression gates remain green;
8. phone acceptance is completed where the engine affects deck use.

## Current milestone gate

Workflow `32093574222` passed the complete chain on commit `a6d34b9afb12e9509f94bf4b665a617a3dd13456` before this system-map documentation update:
- Engine Portal;
- Entity Registry;
- Methodology;
- Programme Plan;
- Session Truth;
- Session Lifecycle;
- Evidence Retrieval;
- Results / Pathway;
- Targets;
- Adaptation;
- Attendance;
- architecture boundaries;
- portal-routed integration;
- full Board regressions;
- Capture / Delivered / Dose;
- 5,400m poolside flow;
- Runtime integration;
- engine-backed Board actions.

`main` remains untouched until the rebuilt owner map and production integration gates are complete.
