# MSOS Runtime Authority Map

Status: consolidation guardrail
Date: 23 August 2026

## Purpose

MSOS must have one authoritative owner for each coaching/runtime decision. Adapter layers may expose an owner to another surface, but they must not silently replace that owner's policy.

The consolidation rule is:

> One domain, one policy owner, many projections.

A later-loaded file is not allowed to become the new policy merely because it executes later.

## Authoritative owners

| Domain | Authoritative owner | Projection / adapter files may | Projection / adapter files may not |
| --- | --- | --- | --- |
| Canonical session / parser / live edits | `v4-poolside-core.js` | read canonical session, request transactions | maintain a second session tree or rewrite original plan |
| Athlete evidence identity / PB lookup primitives | `engines/evidence.js` | hydrate/merge evidence | invent replacement evidence or reinterpret identity |
| Aerobic physiology / T400 targets | `engines/aerobic.js` | display target, request target | replace T400 coefficients or choose a different target rule |
| Race-specific target model | `engines/race-pace.js` | display race target | substitute generic PB division when the race model is required |
| Individual modification prescription | `engines/modification.js` | display/edit an explicit override | add athlete/set policy by wrapping `adaptItem`/`M.adapt.item` |
| Prescription + target coordination | `engines/coordinator.js` | request prescription | maintain a competing target/modification path |
| Persistent local operational state | `engines/storage.js` | request save/read | replace local-first truth with cloud or a second state owner |
| Attendance roster | `engines/attendance-roster.js` | project Here/Modified/Away | infer full attendance from unrelated evidence |
| Athlete training history | `architecture/training-history-core.js` | report/project history | mutate historical delivered truth |
| Athlete/session boundaries | `architecture/athlete-session-core.js` | expose Start/End controls | infer completion percentages or invent attendance |
| Raw evidence semantics | `architecture/evidence-core.js` target architecture + current capture storage | create derived records | rewrite raw evidence/transcript history |
| Context model | `architecture/context-core.js` target architecture | bind current actions/evidence | treat timeline estimates as stronger than explicit coach anchors |
| Interaction/voice intent | `architecture/interaction-core.js` target architecture | route deterministic commands | allow AI interpretation to bypass capability/context checks |
| Meet truth | Meet domain modules | project programme/race evidence | mutate training-session truth |
| TV / swimmer / coach Board | projection surfaces | group/hide/reformat prescriptions | calculate a competing prescription |
| Guardian / release policy | CI tests + immutable product contracts | report failures | filter out a failing foundation assertion and manufacture a pass |
| Build identity | **consolidation target: one build manifest** | display the manifest | independently invent a build ID |
| Squad stimulus/readiness | **consolidation target: new squad-stimulus owner** | compare athlete to squad reference | use whoever happens to attend today as the only reference |

## Transitional wrappers to retire

These files contain useful behaviour that must be folded into an owner before the wrapper is removed. They are not permission to add more wrappers.

- `v4-correct.js` — contains proven compatibility behaviour but also wraps adaptation/target/timing surfaces. Fold durable coaching policy back into authoritative engines.
- `engines/contract-fixes-ak.js` / `engines/contract-fixes-al.js` — compatibility layers; retire rules into their true owners.
- `engines/adaptive-options-am.js` — athlete-option projection; ensure policy lives in Modification, not the UI adapter.
- `engines/phone-fixes-ao.js` — phone presentation/interaction fixes only; no domain policy should remain here.
- `engines/amber-ratio-ap.js`, `engines/amber-alignment-aq.js`, `engines/amber-alignment-as.js`, `engines/amber-alignment-at.js` — athlete-specific correction chain. Durable constraints must migrate to athlete profile/rule data or `engines/modification.js`, then these layers retire.
- `engines/release-guardian-*.js` — historical runtime Guardian overlays. Consolidation target is one current Guardian contract generated from source tests, without test-result replacement/filtering.

## Modification-specific consolidation rule

The recent modification discussion is the example that proves why this map is required.

The authoritative Modification engine must answer, in order:

1. What stimulus did the coach author?
2. Which evidence best represents the swimmer relative to the **assigned squad** for this stimulus?
3. Is the current squad/session sample representative enough to use live, or must a stable squad reference bank be used?
4. Can the swimmer keep the same work and common send-off without materially changing the stimulus?
5. If not, can work distance/repetition shape change while preserving common starts/group rhythm?
6. If not, derive an individual work:rest/send-off from evidence and choose practical work so the swimmer remains connected to the group set window.
7. Use 1/2, 2/3 etc. only as low-confidence **load** fallbacks, never as speed models.

This policy belongs in one engine. Tests, Board, Times and swimmer surfaces consume its output; they do not redefine it.

## Promotion / squad readiness principle

Squad placement is not "can you keep up?".

It is:

> Can this swimmer receive the intended stimulus of this squad, with an appropriate individual projection, while remaining meaningfully part of the team environment?

A future Squad Stimulus Profile should use rolling squad evidence (T400, relevant PB/race evidence, recurring set structures, sustainable load and technical demands). Current attendance is only one evidence source and must pass a minimum-quality gate before becoming the comparator.

## Change gate

Until consolidation is complete:

- no new policy wrapper may be added around an authoritative function;
- a necessary bug fix goes into the authoritative owner where practical;
- if a transitional wrapper must remain, it must be recorded here with a retirement target;
- stale tests are updated at source; they are not hidden by runtime result filtering;
- every consolidation PR should reduce or hold the wrapper count, never increase it.
