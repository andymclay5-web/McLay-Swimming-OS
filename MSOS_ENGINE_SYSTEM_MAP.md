# McLay Swimming OS — Engine System Map

Branch: `rebuild/engine-contracts-v1`

## Product shape

MSOS is a thin application shell around independent coaching engines.

The shell owns navigation, screen mounting, device/offline state, persistence/sync adapters, authentication/role context, installation/update state and the composition root. It does **not** own swimming calculations, pathway logic, result interpretation, session parsing, target calculation, adaptation rules, dose classification or report meaning.

Every coaching domain is one engine with one owner and an explicit portal contract.

## Engine Communication Portal — Engine 0 — GREEN

All engine-to-engine traffic crosses `rebuild/engine-portal.js`.

Portal rules:
1. every engine/surface registers one manifest;
2. every outgoing dependency is declared before seal;
3. reads are queries and writes are commands;
4. query permission never grants command permission;
5. undeclared cross-engine calls fail closed;
6. payloads/responses are cloned at boundaries;
7. routing audit records routing metadata, not swimmer/result payload values;
8. portal owns no coaching truth or engine storage;
9. no pub/sub or hidden broadcast mutates another engine;
10. local coaching paths are synchronous/local-first, with remote/network work behind separate adapters;
11. late wrappers/replacement owners cannot attach after seal;
12. nested calls retain cause lineage;
13. failure is contained and explicit, never silently redirected to a competing implementation.

The portal is a contract router, not a god object or database.

## Canonical context keys

Stable IDs, not UI labels, address engine truth:
`clubId`, `coachId`, `squadId`, `athleteId`, `sessionId`, `blockId`, `itemId`, `meetId`, `meetSessionId`, `eventId`, `raceId`, `testProtocolId`, `testResultId`, `course`, `asOfDate`.

## Evidence status model

Measured/imported evidence carries provenance and status.

Normal lifecycle:
`captured -> provisional/unverified -> reconciled -> verified`

Other states may include `corrected`, `dq`, `dns`, `superseded`, `rejected`.

Poolside evidence can be useful before verification, but permanent PB/record/pathway truth must distinguish provisional from verified evidence.

## Implemented core engines

### Entity Registry — GREEN

Canonical owner for club, coach, squad and swimmer identity, aliases/source IDs, memberships, active/inactive state, DOB/sex/classification/reporting dimensions and date-aware roster lookup.

### Methodology / Coaching Model — GREEN

Configurable coaching interpretation layered:
`programme -> club -> squad -> coach -> athlete`.

Owns physiology/framework, training-zone definitions, dose interpretation, adaptation principles, race-model preferences and session-design principles. Objective facts remain unchanged by methodology.

### Programme Plan / Plan Context — GREEN

Canonical hierarchy:
`season -> phase -> cycle -> week -> explicit session intent`.

Also owns target meets, squad objectives, athlete objectives and planned exposure. Missing intent is explicit; Plan never reverse-engineers purpose from workout vocabulary.

### Session Truth — GREEN / LOCKED

Natural coaching language -> one canonical session. Owns workout semantics, distance, rounds, composition, patterns, phases, race intent and stable set IDs.

### Session Lifecycle / Edit — GREEN

Owns create/select/resume/edit/version history without background reparsing or session identity takeover.

### Evidence Retrieval — GREEN ON ENTITY REGISTRY

Verified/read-only evidence doorway for tests, results, PBs and conversions. It no longer owns swimmer identity.

### Results / Performance Pathway — GREEN

Verified evidence -> PBs, pathway position, points/standards/gaps/trends.

### Target Engine — GREEN

Canonical set + athlete + evidence -> target prescription and provenance.

### Adaptation Engine — GREEN

Canonical set + athlete context -> same-team or modified prescription. Explicit coach overrides remain athlete/session/set scoped.

### Attendance — GREEN

Exact-session attendance only.

### Timing Engine — GREEN

Version `2.0.0`, schema `msos.timing.v2`.

Owns raw measurement only:
- timing-session identity/context;
- multi-swimmer assignments, including shared lanes/positions;
- explicit start/close/abandon;
- split and finish measurements;
- per-swimmer elapsed-time/distance ordering;
- correction and retirement history;
- reopen of in-progress timing without invented progress.

Timing does **not** decide whether a swim is a valid T400, a PB, a training anchor, a zone result or a target. It records what happened.

### Test Protocol Engine — GREEN

Version `1.0.1`, schema `msos.test-protocol.v1`.

Owns canonical test definitions and observation-validity requirements. The built-in T400 definition is `protocol-t400-freestyle / t400_freestyle`: 400m Freestyle, SCM or LCM, with course/pool-length rules and optional split evidence.

A T400 is a **test protocol / evidence vehicle, not a training zone**. Protocol changes are explicit, versioned and journalled. The engine validates measurement structure but performs no stopwatch, target or adaptation logic.

### Test Result Input Engine — GREEN

Version `1.0.0`, schema `msos.test-result.v1`.

Owns conversion of manual/imported/timing observations into provenance-bearing canonical test-result records:
- timing/manual/import input;
- exact source lineage;
- protocol validation through Test Protocol;
- provisional capture by default;
- explicit verify/correct/reject lifecycle;
- idempotent timing-source ingestion;
- verified evidence-shaped export.

It does not silently mutate Evidence Retrieval. A later explicit evidence-ingestion/sync boundary must publish verified result rows into the evidence read model.

### Coach Board — GREEN IN ISOLATED/INTEGRATION GATES

Presentation/projection only. It asks domain engines for answers and performs no swimming interpretation.

### Capture / Delivered / Dose / Reporting / Learning

Existing rebuild engines remain behind their domain boundaries and continue passing the poolside chain. Further untangling/expansion remains on the rebuild roadmap.

## Measurement pipeline contract — GREEN

`Timing -> Test Protocol validation -> Test Result Input -> explicit verification -> evidence-shaped export`

Key boundary: Timing preserves the measurement even if protocol conversion fails. Protocol validity and result verification are independent operations; no engine rewrites raw timing to make a test pass.

## Next engine layer

The next independent meet/result engines are:

1. **Meet Lifecycle Engine** — meet/session/event/entry/heat/lane/race/round lineage, separate from training-session truth.
2. **Meet Result Input Engine** — copied Meet Mobile/Swimify text, screenshots/photos, manual entry or supported feeds -> provisional canonical result candidates.
3. **Official Results Reconciliation Engine** — official TM/file evidence -> confirm/correct/DQ/add missed races while preserving provisional history.
4. **Standards & Records Engine** — qualification standards plus club/Canterbury/NZ record/category matching.
5. **Race Model Engine** — PBs/splits/ideal/projected splits -> race-segment answers for Targets, Meet and swimmer pathway views.
6. **Evidence ingestion / read-model refresh** — explicit publication of verified test/meet results into Evidence Retrieval; no hidden cross-engine mutation.
7. **Exposure / Load** and remaining reporting/learning expansion after the input/result chain is stable.

## How surfaces consume the same engines

### Group / TV Board
Same canonical session as Coach Board. Common work stays grouped; athlete-specific boxes appear only where work/targets genuinely diverge.

### Individual swimmer phone/tablet
Privacy-filtered projection of that swimmer's canonical work, targets, modifications, shared evidence, pathway and meet information.

### Assistant Coach
Same engines, permission-gated by assigned squad/session. Poolside writes are limited to explicitly granted domains.

### Meet Board
Reads Meet Lifecycle, provisional/verified Meet Results, Standards/Records, Results/Pathway and Race Model. It does not calculate record or qualifying truth itself.

### Reports / profile projections
Swimmer/squad/coach/age/sex/classification views are projections over canonical entity dimensions plus engine answers, not duplicate databases.

## Integration rule

An engine does not enter production composition until:
1. isolated contract tests pass;
2. recovered historical/proven behaviour passes;
3. side-effect tests pass;
4. dependencies cross the Portal;
5. previous competing owner is removed, not wrapped;
6. failure is explicit and contained;
7. Parser/Board/poolside gates remain green;
8. phone acceptance is completed where deck use is affected.

## Current engineering milestone gate

Workflow `32094977212` passed the complete chain on exact tested commit `315cc24e0c48dadab82a07d077c65893480c6ca0`:
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
- Timing;
- Test Protocol;
- Test Result Input;
- architecture boundaries;
- portal-routed core integration;
- portal-routed measurement-pipeline integration;
- full Board regressions;
- Capture / Delivered / Dose;
- protected 5,400m poolside flow;
- Runtime reload/edit/finish integration;
- engine-backed Board actions.

`main` remains untouched until the rebuilt owner map and production integration gates are complete.
