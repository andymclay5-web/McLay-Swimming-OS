# McLay Swimming OS — Rebuild Status

Branch: `rebuild/engine-contracts-v1`

This branch is isolated from the live GitHub Pages app. A green rebuild engine here does **not** mean the live phone app has changed.

## Engine 0 — Communication Portal

Status: **GREEN / ARCHITECTURAL GATE**

All engine-to-engine traffic crosses explicit portal query/command contracts. Outgoing dependencies are declared before seal; undeclared access fails closed; query permission never grants command permission; boundary payloads are cloned; routing audit stores no swimmer/result payload values; late replacement owners cannot attach after seal. The application shell has no direct swimming-engine authority.

## Engine 1 — Session Truth

Status: **LOCKED BEHIND REGRESSION GATES**
Version: `4.0.4`

Session Truth remains the only owner of workout semantics and distance. Its protected live/historical parser corpus remains green. Parser changes require a failing regression fixture first.

Recovery ledger remains: exact raw source wording for protected Saturday 15 Aug 5,450m session; validated block invariant 1,100 / 850 / 2,900 / 600 = 5,450m.

## Engine 2 — Session Lifecycle

Status: **GREEN**
Version: `1.0.0`

Stored canonical truth is not reparsed on resume; original plan is immutable; edits/identity changes are explicit and journalled; stale drafts cannot hijack selection or clear attendance.

## Engine 3 — Entity Registry

Status: **GREEN — CANONICAL IDENTITY OWNER**
Version: `1.0.1`
Schema: `msos.entities.v1`

Canonical clubs/coaches/squads/swimmers, exact aliases/source IDs, date-aware memberships, active/inactive state and reporting/profile dimensions. Evidence, Attendance, Adaptation, Capture, Methodology, Planning and Timing consume this identity contract rather than maintaining competing resolvers.

## Engine 4 — Methodology / Coaching Model

Status: **GREEN**
Version: `1.0.0`
Schema: `msos.methodology.v1`

Owns coaching interpretation layered `programme -> club -> squad -> coach -> athlete`, including physiology/framework, zones, dose interpretation, adaptation principles, race-model preferences and session-design principles. Objective measurements remain objective facts.

## Engine 5 — Programme Plan / Plan Context

Status: **GREEN**
Version: `2.0.0`
Schema: `msos.plan.v2`

Owns `season -> phase -> cycle -> week -> explicit session intent`, target meets, squad/athlete objectives and planned exposure. Missing intent is explicit; the engine never infers purpose from workout vocabulary.

## Engine 6 — Timing

Status: **GREEN — RAW MEASUREMENT OWNER**
Version: `2.0.0`
Schema: `msos.timing.v2`

Owns timing-session identity/context, multi-swimmer assignments, split/finish measurements, explicit start/close/abandon, correction/retirement history and reload-safe in-progress timing.

Protected boundary: **Timing records what happened; it does not decide what the measurement means.** It contains no T400-validity rule, zone logic, target calculation, PB decision or `valid_for_anchor` flag.

## Engine 7 — Test Protocol

Status: **GREEN — TEST DEFINITION OWNER**
Version: `1.0.1`
Schema: `msos.test-protocol.v1`

Owns canonical test definitions and validity requirements. Built-in `protocol-t400-freestyle / t400_freestyle` defines a 400m Freestyle observation in SCM/LCM with course/pool-length and split-structure requirements.

Protected boundary: **T400 is a test protocol/evidence vehicle, not a training zone.** Protocol writes are explicit, versioned and journalled. Test Protocol performs no stopwatch, target or adaptation logic.

## Engine 8 — Test Result Input

Status: **GREEN — PROVENANCE / VERIFICATION OWNER**
Version: `1.0.0`
Schema: `msos.test-result.v1`

Owns manual/import/timing observation intake into canonical test-result records. It preserves source lineage, validates against Test Protocol, captures results as provisional by default, and supports explicit verify/correct/reject transitions.

Timing-source ingestion is idempotent. A correction invalidates prior verification until reverified. Rejected evidence remains historical but is excluded from usable evidence.

Verified rows can be exported in Evidence Retrieval shape, but Test Result Input **does not silently mutate Evidence Retrieval**. Publication into the evidence read model remains an explicit future ingestion/sync boundary.

## Evidence / Results / Targets / Adaptation / Attendance

Status: **GREEN ON THE NEW IDENTITY AND MEASUREMENT BOUNDARIES**

Evidence Retrieval remains the performance read doorway. Results/Pathway and Targets consume Evidence Retrieval; Adaptation/Attendance/Capture use canonical Entity Registry identity. New verified test results cannot jump directly into those owners through hidden mutation.

## Board v2

Status: **GREEN IN ISOLATED/INTEGRATION GATES — NOT LIVE**

Projection `2.1.0`; Renderer `1.2.0`; Controller `1.1.0`; schema `msos.board.v2`.

Board remains projection only: canonical team work once, genuine modifications beside it, exact target/evidence context, compact human-readable swimmer names and exact command routing. It owns no parser, target maths, adaptation maths, timing interpretation or persistence/network logic.

## Measurement pipeline — GREEN

The now-protected chain is:

`Timing raw measurements -> Test Protocol validation -> Test Result Input provisional record -> explicit verification -> evidence-shaped export`

Failure is contained. A 300m finish recorded by Timing remains valid raw timing evidence even if conversion to the 400m T400 protocol correctly fails. No engine edits the source measurement to force a pass.

## Current full release gate

The CI chain now requires all of these to pass together:
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
12. Timing;
13. Test Protocol;
14. Test Result Input;
15. architecture boundaries;
16. portal-routed real-engine integration;
17. portal-routed measurement-pipeline integration;
18. complete Board regression family;
19. Capture Evidence;
20. Delivered Session;
21. Session Dose;
22. protected 5,400m poolside flow;
23. Runtime reload/edit/finish integration;
24. engine-backed Board action integration.

Exact tested engineering milestone: commit `315cc24e0c48dadab82a07d077c65893480c6ca0`, workflow `32094977212`. **Every job passed on that same head**, including the new Timing, Test Protocol, Test Result Input and measurement-pipeline jobs plus the existing Board/poolside/runtime chain.

## Next build block

Next independent engines:
1. Meet Lifecycle;
2. Meet Result Input;
3. Official Results Reconciliation.

Then Standards & Records, Race Model, and the explicit verified-evidence publication/read-model boundary.

`main` and the live GitHub Pages app remain untouched.
