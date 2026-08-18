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

## Engine Communication Portal — Engine 0

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

Original evidence is retained. Verification does not destroy what was observed poolside.

Example:
- Swimify copy: Coral 100 Fly 1:10.23 -> provisional;
- MSOS immediately reports provisional NZSC qualification if applicable;
- official TM import later confirms 1:10.23 -> verified;
- if TM says DQ, official result becomes DQ and provisional qualification is withdrawn while the observed swim remains coaching evidence.

---

# Layer A — Identity, context and methodology

## A1 Entity Registry

Owns canonical identity for:
- club;
- coaches;
- squads;
- swimmers;
- squad memberships over time;
- swimmer active/inactive state;
- DOB/sex/classification fields;
- coach/squad relationships;
- aliases needed to match imported evidence.

Other engines request identity from Entity Registry. They do not maintain competing copies of a swimmer.

A swimmer profile screen is a projection over one canonical athlete ID, not a separate swimmer database.

## A2 Roles & Permissions

Owns what a signed-in role may ask the portal to do.

Examples:
- owner coach: full assigned programme authority;
- assistant coach: deny-by-default, assigned squads/sessions only;
- swimmer: own privacy-filtered information only;
- TV/group display: presentation only, no private notes or writes.

Role checks occur before command execution.

## A3 Methodology / Coaching Model

Owns configurable coaching philosophy and definitions, including:
- training-system/zone definitions;
- Clive Rushton / Swimformation / Cone interpretation used by the programme;
- dosage interpretation rules;
- inclusion/adaptation principles;
- race-model preferences;
- recovery/support interpretation;
- session-design principles;
- squad-specific methodology overlays;
- coach-specific philosophy overlays where deliberately different.

Objective evidence remains objective. Methodology controls how coaching engines interpret and prescribe from that evidence.

---

# Layer B — Planning and session design

## B1 Season / Programme Plan

Owns:
- season;
- target meets;
- phases/cycles;
- week structure;
- planned physiological emphasis;
- technical priorities;
- squad objectives;
- individual programme objectives.

## B2 Weekly Plan

Owns the current week's intended exposure and session purposes, derived from the season plan but editable by the coach.

## B3 Session Design

Reads:
- Methodology;
- Season/Weekly Plan;
- recent Exposure/Dose;
- squad/athlete context;
- upcoming meets;
- current performance evidence.

Outputs a proposed session/design rationale.

It never rewrites an accepted session. Once the coach accepts/types/dictates the session, Session Truth becomes authoritative.

## B4 Plan Measurement

Compares intended season/week/session emphasis with actual delivered exposure.

It reads facts from Plan, Delivered Session and Dose/Exposure. It never alters history to make plan and delivery agree.

---

# Layer C — Training-session truth

## C1 Session Truth — GREEN/LOCKED

Natural coaching language -> deterministic canonical workout.

One parser owner only.

## C2 Session Lifecycle — GREEN

Owns create/select/resume/edit/version/restore without background reparsing or session takeover.

## C3 Attendance — GREEN

Owns exact-session roll only.

## C4 Capture Evidence — GREEN

Owns note/voice/photo/video/observation evidence attached to stable session/block/set/athlete context.

## C5 Delivered Session — GREEN

Owns explicit delivered-through state and final delivered truth.

---

# Layer D — Timing, tests and performance input

## D1 Timing Engine

A generic timing tool, independent of the meaning of the timed activity.

Owns:
- running clocks;
- lane/swimmer timers;
- laps/splits;
- start/stop/reset;
- timing-session identity;
- raw measured times.

Timing does not decide whether a time is a T400 anchor, PB, race result or qualifying time.

## D2 Test Protocol Engine

Owns definitions for tests such as:
- T400 Freestyle;
- future T200/threshold/aerobic tests;
- kick tests;
- race-pace test sets;
- repeat-set protocols.

A protocol defines required distance/reps/course, fields collected, validity rules and which downstream models may use the evidence.

## D3 Test Result Input

Receives Timing/manual/import data plus Test Protocol.

Outputs a canonical test-result candidate with:
- athlete;
- protocol;
- date/course;
- total result;
- splits/repeats where applicable;
- provenance;
- validity/status.

T400 is therefore **a test protocol producing evidence**, not a Board feature.

Flow:
`Timing -> Test Result Input -> Evidence store -> Evidence Retrieval -> Targets/Pathway/Dose/Learning`

## D4 Meet Lifecycle

Owns meet-specific truth separately from training sessions:

`meet -> session -> event -> entry -> heat/lane -> race -> result -> next round`

Offline/local-first for deck use.

## D5 Meet Result Input

Accepts multiple adapters into one canonical result candidate:
- manual quick entry;
- pasted Meet Mobile text;
- pasted Swimify text;
- screenshot;
- poolside results-board photo;
- supported live feed/API;
- official TM results file.

Canonical candidate includes:
- athlete ID/match confidence;
- meet/event/race identity;
- distance/stroke/course;
- heat/lane/round;
- result time;
- splits;
- place;
- DQ/DNS status;
- source/provenance;
- verification status.

## D6 Official Meet Reconciliation

Consumes the official TM result file after/between sessions and compares it with provisional poolside evidence.

Actions:
- verify exact matches;
- correct time/place/round;
- apply DQ/DNS;
- add swims missed poolside;
- flag ambiguous swimmer/event matches;
- preserve useful live splits even if the official file omits them;
- supersede rather than delete provisional evidence.

Suggested meet reconciliation summary:
`42 official swims · 34 matched · 3 corrected · 2 DQ updates · 3 missing swims added · 0 unresolved`

---

# Layer E — Evidence and performance knowledge

## E1 Evidence Retrieval — GREEN

The only read doorway over athlete test/race/performance evidence.

No consumer searches local/cloud/legacy stores directly.

## E2 Standards & Records

Owns applicable benchmarks by date/course/age/sex/classification/programme:
- NZSC/NZAG/etc qualifying standards;
- Canterbury/regional records;
- NZ records;
- club records;
- Para/classification records;
- finalist/medal benchmarks;
- programme/squad standards.

Given an athlete + event + result, it returns applicable achievements/gaps. It does not store the athlete's result.

## E3 Results / Performance Pathway — GREEN foundation

Reads Evidence Retrieval + Standards & Records.

Owns:
- PB per event/course;
- verified/provisional progression;
- qualification achievements and gaps;
- WA/Para points where a valid model exists;
- 25-point pathway steps;
- closest/furthest progression events;
- trend/history;
- profile performance summary.

Meet Deck may display provisional interpretation. Formal PB/pathway history uses verified evidence unless a rule explicitly says otherwise.

## E4 Race Model

Owns:
- actual splits;
- ideal/projected splits;
- event-specific race shapes;
- segment targets;
- actual-vs-model comparison;
- coach/model provenance.

A PB is evidence. Race Model determines how that PB should translate into meaningful pace/split information.

---

# Layer F — Prescription engines

## F1 Targets — GREEN foundation

Reads canonical set + Evidence/Pathway/Race Model/Methodology.

Returns target and provenance.

Examples:
- `6 x 100 Free Development 10s` -> T400-based aerobic target;
- `4 x 25 @100 Pace` -> PB/Race Model segment target.

Board never calculates these.

## F2 Adaptation — GREEN foundation

Reads canonical work + athlete profile/constraints + Methodology + historical accepted adaptation knowledge.

Returns either:
- same as group;
- or explicit athlete prescription + reason/source.

Adaptations evolve from coach-confirmed overrides/evidence without rewriting canonical squad work.

Future adaptation memory should distinguish:
- permanent athlete constraint;
- temporary medical/return-to-swim constraint;
- session-specific override;
- coach-confirmed reusable preference;
- inferred suggestion awaiting coach confirmation.

---

# Layer G — Dose, exposure and learning

## G1 Session Dose — GREEN foundation

Reads planned/current/delivered canonical truth and Methodology.

Owns objective dose classification, not report formatting.

## G2 Exposure / Load

Aggregates dose over swimmer/squad/time dimensions:
- session;
- day;
- week;
- cycle;
- phase;
- event preparation window.

Supports queries such as:
- 13–14 girls' aerobic-power exposure over six weeks;
- Development swimmers short of planned threshold exposure;
- individual modified dose versus squad dose.

## G3 Learning

Reads facts produced by other engines and emits evidence-linked observations/hypotheses.

It may say:
`Low recent aerobic-power exposure is a plausible contributing factor.`

It may not say:
`That definitely caused the performance.`

Coach acceptance/rejection of suggestions becomes learning evidence, not silent self-modification.

---

# Layer H — Reporting and profile projections

## H1 Reporting

Report assembler only. It does not create new coaching truth.

A report is a query/projection over existing engine answers.

Dimensions can include:
- swimmer;
- squad;
- coach;
- age bracket;
- sex;
- classification;
- meet;
- week/cycle/phase;
- training system;
- attendance status.

This avoids separate databases for every report type.

## H2 Swimmer Profile Projection

One canonical swimmer ID; screen asks engines for:
- Results/Pathway;
- tests;
- attendance;
- recent dose/exposure;
- adaptations;
- observations/captures;
- upcoming meets/entries;
- plan/goals;
- relevant learning prompts.

The profile stores almost none of this itself.

## H3 Squad Profile Projection

Membership query + aggregate engine answers. Same for coach, age bracket, sex or any other allowed reporting dimension.

---

# Layer I — Presentation surfaces

Presentation surfaces own information density and interactions only.

## I1 Coach Board — GREEN isolated chain

Reads Board Projection. Sends explicit commands through portal owners.

## I2 Whole-group / TV Board

Same canonical session and engine outputs.

Rules:
- common work remains grouped;
- individual boxes/cards appear only when work diverges;
- target/modification information is readable at distance;
- no duplicate session copy.

## I3 Individual Swimmer Device

Privacy-filtered projection for one athlete:
- current work;
- modification;
- target;
- relevant coach-shared cue/evidence;
- pathway/meet context.

## I4 Assistant Coach

Same engines, restricted portal permissions and assigned session/squad context.

Default poolside capability target:
- Board;
- Roll;
- Timing;
- Capture;
- Meet.

No owner-only authoring/admin/cloud-repair/private-note access unless granted.

## I5 Meet Deck

Reads Meet Lifecycle + Results/Pathway + Standards + Race Model.

Immediate useful result interpretation examples:
- `Coral Sturls · 100 Fly · 1:10.23 · NZSC QT ✓ · PROVISIONAL`
- `Luke Thompson · 100 Free · 50.98 · Canterbury Record · PROVISIONAL`

Priority is **what the swim means now**, not every statistic available.

## I6 Swimmer Meet

Privacy-filtered own entries/results/next-round information and explicitly shared evidence.

## I7 Times / Testing

Timing UI + Test Protocol selection + Test Result Input. It does not own the resulting pathway or target calculations.

---

# Remote input and sync rule

The portal core is synchronous/local-first so coaching remains usable without network response.

Remote sources use adapters:
- Swimify/HY-TEK/live-result adapter;
- Meet Mobile copy/share adapter;
- official TM file import;
- cloud sync;
- standards update package.

Remote adapters validate and write into the owning input/storage engine. Normal engines then retrieve local canonical evidence through the portal.

No core engine waits on an arbitrary webpage/API during a deck action.

---

# Engine build/recovery rule

For every current MSOS feature:

1. identify the useful behaviour;
2. identify its one owning engine;
3. identify canonical inputs and outputs;
4. recover proven logic/fixtures from current versions;
5. move the logic behind that engine's portal contract;
6. test it independently;
7. test its declared portal dependencies;
8. remove the old competing owner;
9. only then expose it to presentation surfaces.

Do not rebuild a feature inside a screen merely because the old screen already contains the code.

# Definition of “Andy standard” for an engine

An engine is not marked finished until:
- one clear owner exists;
- input/output schemas are deterministic;
- reads/writes are explicit;
- all cross-engine access is portal-declared;
- query/command boundaries are correct;
- missing evidence is explicit;
- no hidden fallback/duplicate owner exists;
- local/offline behaviour is defined where relevant;
- historical/proven fixtures pass;
- failures are contained;
- reopening state does not mutate truth;
- downstream consumers can use the result without reparsing/recalculating it;
- the engine's real integration gate passes on the same commit.
