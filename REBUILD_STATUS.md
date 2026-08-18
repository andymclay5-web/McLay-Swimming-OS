# McLay Swimming OS — Rebuild Status

Branch: `rebuild/engine-contracts-v1`

This branch is isolated from the live GitHub Pages app. A green rebuild engine here does **not** mean the live phone app has changed.

## Engine 0 — Communication Portal

Status: **GREEN / ARCHITECTURAL GATE**

All engine-to-engine traffic is being moved behind the portal contract. Reads are explicit queries, writes are explicit commands, outgoing dependencies are declared, the graph is validated before seal, undeclared access fails closed, query permission never grants command permission, payloads are cloned at boundaries, routing audit does not store swimmer/result payload values, and the sealed graph does not accept late replacement owners.

The application shell has no direct swimming-engine authority.

## Engine 1 — Session Truth

Status: **LOCKED BEHIND REGRESSION GATES**

Version: `4.0.4`

Session Truth is the only owner of workout semantics and distance. Board, Targets, Adaptation, Attendance and UI code are forbidden from reparsing the workout or inventing competing distance rules.

Protected corpus includes the live/protected 4,650m, 5,400m, 3,700m, 5,700m, 4,740m, 4,220m, 4,700m and 3,660m fixtures plus spoken-cardinal distances, rounds, nested rounds, parent composition, one-pass phases, race-pace rep instructions, summary-line suppression, 12.5m/15m runnable work, stable IDs, written-total mismatch rejection and immutable original source.

Parser changes require a failing regression fixture first.

Still on recovery ledger: exact raw source wording for protected Saturday 15 Aug 5,450m session. Its validated block invariant is 1,100 / 850 / 2,900 / 600 = 5,450m; do not invent a fake raw transcript.

## Engine 2 — Session Lifecycle

Status: **GREEN**

Version: `1.0.0`

Boot/load is read-only; stored canonical truth is not reparsed on resume; session identity changes are explicit; original plan is immutable; edits are revisioned/journalled; stale drafts cannot hijack selection; attendance is not cleared by lifecycle activity.

## Engine 3 — Entity Registry

Status: **GREEN — CANONICAL IDENTITY OWNER**

Version: `1.0.1`
Schema: `msos.entities.v1`

Owns one canonical identity for clubs, coaches, squads and swimmers plus source-ID mappings, explicit aliases, squad memberships, active/inactive status and profile dimensions such as DOB, sex and classification.

Protected behaviours:
- exact IDs and explicit aliases unify legacy/current references; there is no fuzzy identity guessing;
- stronger/current source fields win while provenance is retained;
- historical/inactive swimmers remain resolvable as history but do not enter active rosters by default;
- memberships are date-aware;
- roster and reporting dimensions are derived from canonical IDs;
- returned data is cloned so consumers cannot mutate registry truth;
- Evidence Retrieval no longer owns its own competing swimmer resolver.

Identity consumers now receive Entity Registry through declared portal contracts rather than searching athlete data independently.

## Engine 4 — Methodology / Coaching Model

Status: **GREEN**

Version: `1.0.0`
Schema: `msos.methodology.v1`

Owns configurable coaching interpretation, not objective facts.

Effective methodology is assembled deterministically through:
`programme -> club -> squad -> coach -> athlete`
with date-scoped overlays.

Current sections include physiology/framework, zones, dose interpretation, adaptation principles, race-model preferences and session-design principles. A coach/club can therefore have a different philosophy without changing the measured result or canonical workout.

Protected behaviours:
- overlays augment rather than erase unrelated base definitions;
- coach-specific rules apply only to the selected coach;
- future-dated methodology cannot leak into present decisions;
- athlete identity can supply canonical club/squad context through Entity Registry;
- missing methodology is explicit and never invented;
- methodology cannot mutate objective evidence.

## Engine 5 — Programme Plan / Plan Context

Status: **GREEN**

Version: `2.0.0`
Schema: `msos.plan.v2`

Owns:
`season -> phase -> cycle -> week -> explicit session intent`
plus meets, squad objectives, athlete objectives and planned exposure.

Protected behaviours:
- exact session intent resolves into season/phase/cycle/week context;
- target meets can be inherited across planning levels without invention;
- squad and athlete objectives use canonical Entity Registry IDs;
- weekly planned exposure is available without pretending it is delivered exposure;
- plan changes are explicit local-first commands and are journalled;
- retiring a plan row preserves history rather than deleting it;
- if no explicit session intent exists, status is `missing_session_intent` — the engine does **not** infer purpose from workout vocabulary;
- returned plan context cannot mutate stored plan truth.

The planning surface may write plan truth through portal commands. The app shell may not.

## Evidence / Results / Targets / Adaptation / Attendance

Status: **GREEN ON THE NEW IDENTITY BOUNDARY**

Evidence Retrieval now requires an injected Entity Registry contract. Results/Pathway and Targets read performance evidence through Evidence Retrieval. Adaptation, Attendance and Capture resolve swimmer identity through Entity Registry. No fallback identity owner was added to make legacy tests pass; old tests/composition roots were migrated to the one-owner model.

## Board v2

Status: **GREEN IN ISOLATED/INTEGRATION GATES — NOT LIVE**

Projection version: `2.1.0`
Renderer version: `1.2.0`
Controller version: `1.1.0`
Schema: `msos.board.v2`

Board remains a projection only: canonical work once, grouped rounds/phases, genuine modifications alongside team work, target answers under the exact set, compact swimmer names (`Kaleb`, `Alex H`, `Luke Thw` style), evidence context, block jumps and exact command context. It owns no parser, target maths, adaptation maths or storage/network logic.

## Current full release gate

The current CI chain requires all of these to pass together:
1. Engine Communication Portal;
2. Entity Registry;
3. Methodology;
4. Session Truth;
5. Programme Plan;
6. Session Lifecycle;
7. Evidence Retrieval;
8. Results / Pathway;
9. Targets;
10. Adaptation;
11. Attendance;
12. architecture boundaries;
13. portal-routed real-engine integration;
14. complete Board regression family;
15. Capture Evidence;
16. Delivered Session;
17. Session Dose;
18. protected 5,400m poolside flow;
19. Runtime reload/edit/finish integration;
20. engine-backed Board action integration.

Last code gate before this status update: workflow `32093390683` passed every job on commit `45b6a21ed179aba6e4d17cf67d47144f093ddecc`.

`main` and the live GitHub Pages app remain untouched.
