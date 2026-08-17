# McLay Swimming OS — Independent Engine Catalog

This rebuild follows one rule: every coaching function has one engine owner, a narrow contract, and no hidden side effects. Screens are projections over engine outputs; they do not own coaching logic.

## Engine 1 — Session Truth
Purpose: turn natural coaching language into one deterministic canonical session.

Input: raw coach session text + explicit session identity.
Output: canonical blocks, groups/rounds, runnable sets, composition, rep patterns, cues, rest/cycle, zone, equipment and race-intent metadata.
Writes: nothing outside the returned session object.
Forbidden: athlete lookup, T400/PB lookup, adaptation, attendance, Board HTML, storage, cloud, automatic mutation of saved sessions.

Release gate: bulletproof regression bank using real McLay sessions and deliberately messy coaching language. Correct metres are necessary but not sufficient; rep intent and child structure must survive for downstream engines.

## Engine 2 — Session Lifecycle
Purpose: create, select, save, edit, restore and finish one session without identity drift.

Owns: selected session ID, draft identity, immutable original plan, current canonical revision, explicit edit journal, delivered state.
Forbidden: background reparsing or session replacement; drafts becoming authoritative without explicit coach action; parser-version changes clearing attendance or evidence.

## Engine 3 — Attendance
Purpose: answer who is actually present for this exact session.

Output: present / modified / late / absent roster keyed to session ID.
Forbidden: carrying attendance forward from another session unless the coach explicitly does so.

## Engine 4 — Performance Evidence
Purpose: one retrieval API for verified athlete evidence regardless of where it is physically stored.

Owns retrieval/provenance for: T400, test results, PB/event history, course conversion evidence, coach-entered verified results, timed-set evidence.
Consumers never search localStorage, legacy stores, IndexedDB or cloud tables themselves.

## Engine 5 — Target Prescription
Purpose: canonical set + athlete + Performance Evidence -> precise target prescription.

Owns: aerobic/T400 calculations, race-pace/PB calculations, split calculations, practical send-off, source/provenance, explicit missing-evidence response.
Forbidden: mutating the set, inventing evidence, rendering UI.

## Engine 6 — Adaptation
Purpose: canonical set + athlete constraints/history -> athlete-specific prescription.

Decision order: capability/safety -> preserve stimulus -> preserve team inclusion -> preserve pattern-dependent structure -> practical pool geometry -> volume guidance.
Percentages are guidance, never the primary rule.
Forbidden: mutating squad truth or formatting the Board.

## Engine 7 — Board Projection
Purpose: render a compact pool whiteboard from canonical session plus engine outputs.

Reads: Session Truth, Attendance, Target Prescription, Adaptation.
Owns: presentation only.
Rules: rounds grouped; parent work kept together; common work shown once; genuine modifications beside it; target/pathway context compact; missing data visible rather than fabricated.

## Engine 8 — Capture / Session Evidence
Purpose: record note, voice, photo, video, timing and observation evidence against exact session/block/set/athlete identity.

Rule: local-first; save before cloud work. Evidence remains linked permanently to the exact coaching context where it was created.

## Engine 9 — Plan Context
Purpose: annual/season -> phase/cycle -> week -> session purpose.

Owns: programme intent, priority systems, supporting systems, technical themes, target meets, weekly dose intentions.
Forbidden: rewriting delivered session truth.

## Engine 10 — Session Dose / Training Analysis
Purpose: quantify what was planned and what was actually delivered, using canonical session structure rather than loose text heuristics.

Input: Plan Context + canonical session + delivered session + attendance/modifications where relevant.
Output: dose by training system/stimulus, primary vs supporting work, distance/time exposure, work:rest context, technical/skill exposure, modified-athlete dose, planned-vs-delivered variance.

This engine owns dose logic. Reports and Coach Hub consume its output; they do not recalculate dose independently.

## Engine 11 — Swimmer Results / Performance Pathway
Purpose: turn verified swimmer performance evidence into useful current and future pathway information.

Reads: Performance Evidence + swimmer age/classification + course + meet qualification/benchmark data.
Output: current PB, WA/FINA or World Para points where valid, next achievable point steps, applicable qualifying standards, percentage/seconds to target, relevant future age/course milestones.

Rules: pathway is evidence-backed; current course matters; modified/para athletes use valid classification-aware evidence; default pathway remains concise; deeper finalist/medal/open/record detail stays secondary unless requested.

Consumers: Times, swimmer profile, individual swimmer device, Coach Board compact context, reports.
Forbidden: changing PB evidence or session truth.

## Engine 12 — Reporting / Learning
Purpose: project stored truth into athlete, squad, coach and programme reports.

Reads: Plan Context, Session Dose, Results/Pathway, Attendance, Capture Evidence, Delivered Sessions.
Outputs: session, weekly, cycle, season, athlete, squad and coach reports plus carry-forward coaching questions/actions.
Forbidden: inventing coaching truth or re-parsing historical raw text when canonical/delivered truth exists.

## Presentation surfaces
Coach Board, TV Board, Individual Swimmer, Assistant Coach, Coach Hub, Times and Reports are consumers. They are not engines of truth.

## Integration rule
An engine can be connected only when: isolated tests pass; real historical regressions pass; side-effect tests pass; the previous owner is removed rather than wrapped; no later script redefines it; and phone/deck acceptance is completed where applicable.
