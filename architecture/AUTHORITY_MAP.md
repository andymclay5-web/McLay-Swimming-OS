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
| Canonical session / parser / live edits | `app.js` (`Store.putSession`, `M.session.*`, `M.changes.*`) | read canonical session, request transactions | maintain a second session tree or rewrite original plan |
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
| Build identity | `engines/release-authority.js` (last shipped `.BUILD` writer, load-order now enforced — see note below) | display the manifest | independently invent a build ID |
| Squad stimulus/readiness | **consolidation target: new squad-stimulus owner** | compare athlete to squad reference | use whoever happens to attend today as the only reference |

Note: `v4-poolside-core.js` wraps the parser and delegates persistence back to `app.js`'s
`Store.putSession`/`M.session.*`/`M.changes.*` — it is not itself the CRUD owner. Similarly,
`architecture/athlete-session-core.js` (Athlete/session boundaries, above) contains no writes of
its own; the real boundary-write implementation is `engines/athlete-session-bd.js`, which goes
through `Store.putSession` like any other adapter.

Note on build identity (closed 3 September 2026, see WRITER_MAP_FINDINGS.md §9 addendum): six
shipped files each assign `.BUILD` on their own top-level load (`app.js`, `v4-correct.js`,
`v4-poolside-core.js`, `engines/bridge.js`, `engines/coach-loop-ui.js`,
`engines/release-authority.js`). This was not converted into a single owner that the other five
delegate to — `v4-correct.js`'s writer legitimately reads the prior `M.BUILD` value first as a
base-build lineage check and must keep doing so, and the other four were left alone rather than
risk removing writers whose blast radius wasn't fully characterised. What was actually unsafe was
that "release-authority.js writes last" was pure load-order accident (script position 79 of 80),
not an enforced contract — a reorder or a new file inserted after it would have silently rolled
the attested build back with nothing to catch it. `tests/build-identity-final-writer-order-20260903.cjs`
now makes that ordering an explicit, self-maintaining regression test (it discovers `.BUILD`
writers from the shipped file list dynamically, so a future writer is picked up automatically) and
proves `engines/release-authority.js`'s own write has no dependency on any earlier writer
succeeding, so it is safe by construction as long as it stays last. Note also that `<script defer>`
tags execute independently of one another — a thrown error in one of the middle five writers does
not stop later scripts from running, which is why the practical risk here was always the ordering,
not a mid-chain exception.

## Modification consolidation status

`engines/modification.js` is now the only **active runtime policy owner** for individual prescription decisions after `engines/bridge.js` binds it to `M.adapt.item`.

The following loaded files have been reduced to compatibility or projection roles and must not replace either `M.adapt.item` or `E.Modification.adaptItem`:

- `engines/contract-fixes-ak.js`
- `engines/contract-fixes-al.js`
- `engines/adaptive-options-am.js`
- `engines/phone-fixes-ao.js`
- `engines/amber-ratio-ap.js`
- `engines/amber-alignment-aq.js`
- `engines/amber-alignment-as.js`
- `engines/amber-alignment-at.js`

The authority CI gate checks runtime order so a future late-loaded file cannot quietly become a second Modification owner.

The current core Modification policy now distinguishes:
- **stimulus** from total-load percentage;
- **assigned-squad comparison** from whoever happens to attend today;
- T400 comparison for aerobic work from PB/race evidence for quality work;
- common-start work where the intended work:rest remains intact;
- shorter work on the same starts when that better preserves group connection;
- individual evidence-based send-off/repetition plans when common timing would change the stimulus;
- low-confidence 1/2 or 2/3 load fallback only when better evidence is unavailable.

## Transitional wrappers still to retire

These files still contain useful behaviour or historical debt outside the completed active Modification ownership pass.

- `v4-correct.js` — loaded before the engine bridge. Its old adaptation wrapper is superseded at runtime but should eventually be removed from source after its remaining compatibility behaviour is relocated.
- `engines/rainbow-rules-au.js` — currently not loaded by `index.html`, but still contains parser/RacePace/Modification wrapper code. Its valid rules should be folded into the relevant owners before the file is retired.
- `engines/presence-persistence-bc.js` — currently wraps `M.store.save` to journal attendance/presence. Move this to a storage hook/event API.
- ~~`engines/guardian-runtime.js` — currently wraps `M.store.save` for Guardian startup behaviour. Move this through an explicit storage API.~~ Read in full and corrected: this file wraps `M.guardian.run`, not `M.store.save`, and its only storage interaction is `M.storageEngine.saveGuardianResult(...)` — already the sanctioned `storage.js` API. No remediation needed here.
- `engines/release-guardian-*.js` — historical runtime Guardian overlays. Consolidation target is one current Guardian contract generated from source tests, without result replacement/filtering.

## Modification-specific consolidation rule

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
