# McLay Swimming OS v4 — Engine contracts

## Architecture rule
Each engine owns one kind of truth. If an engine is wrong, fix that engine. Do not patch its answer in the Board or another engine. Engines exchange only the minimum information required through explicit bridges.

## Session / parser truth
Owns authored workout structure, blocks, rounds, repeats, cues, totals, rest/send-off semantics and canonical session identity. It does not calculate athlete targets or modifications.

The isolated stored-round/source recovery lives in `engines/session-repair.js`. It may repair canonical structure, but it does not touch targets, modification rules or Board rendering.

## Evidence engine — `engines/evidence.js`
Owns local evidence hydration and identity matching across current/legacy athlete IDs. It exposes PB rows, training-test/T400 rows and source evidence. It does not calculate training targets.

Inputs: athlete + stored/local evidence.
Outputs: matching evidence rows only.

## Aerobic engine — `engines/aerobic.js`
Owns T400 selection, aerobic coefficients, authored-rest interpretation, practical send-off and Rushton HR/SR fallback when no matching-stroke T400 exists.

Inputs: athlete, stroke, zone, distance, authored rest + evidence.
Outputs: target time/send-off or HR/SR fallback.

Default stroke interpretation remains upstream/session semantics: aerobic unspecified stroke = Freestyle.

## T400 capture — `engines/t400-capture.js`
Owns the live result-comparison behaviour when a coach records a T400. It compares the new result with the fastest valid prior T400 of the same stroke before the new row is saved, annotates the row, and reports first baseline / PB improvement / equals PB / seconds off PB. It does not calculate aerobic training targets.

The fastest valid historical result remains the anchor selected by the Aerobic engine; a slower new test never replaces the best anchor just because it is newer.

## Race-pace engine — `engines/race-pace.js`
Owns PB lookup, course conversion, #1/#1F resolution from performance evidence, race-pace arithmetic and any validated race-segment models.

Inputs: athlete, race intent, work distance, stroke/course + evidence.
Outputs: race target, resolved stroke, source or explicit missing-evidence result.

It must never invent a target when the required evidence/model is missing.

## Modification engine — `engines/modification.js`
Owns athlete modification profiles and the final manageable prescription. It receives the canonical group prescription and may consume evidence, but it does not own PB/T400 formulas.

Rules include:
- inclusion/stimulus before blind mathematical reduction;
- 1/2 and 2/3 profiles are starting constraints, not universal arithmetic;
- short quality/anaerobic work stays with the team where manageable;
- larger mixed/aerobic work is resized while preserving authored phases where possible;
- IM is structurally protected — no silent 50/75 IM units;
- when repetitions are reduced on an authored fixed cycle, the modified cycle may be lengthened to keep the swimmer in the same overall team work window instead of forcing the reduced athlete onto an impossible group send-off;
- when reps change, dependent instructions change with them — e.g. `3×200 Pull · Desc SC 1-3` becoming `2×200 Pull · Desc SC 1-2`, never retaining stale 1-3 wording;
- return-to-start/pool-end alignment is the default for generated modified work unless an athlete profile explicitly says otherwise;
- coach-authored shape overrides beat generated modifications;
- a stroke-only override must never erase the athlete's generated modification shape;
- athlete capability constraints such as Amber upper-body equivalents and Conor fin/breaststroke restrictions belong here, not in Board code;
- capability substitutions retain relevant coaching intent: e.g. a Kick Build changed to Amber upper-body work keeps the Build instruction without falsely continuing to display Kick.

Outputs: prescription only. Rationale/evidence may be attached for inspection but is not Board copy.

## Interpretive coordinator — `engines/coordinator.js`
This is a traffic controller, not a formula engine.

It decides which specialist engine should answer the current question:
- aerobic -> Aerobic engine;
- race pace/#1 -> Race-pace engine;
- modified prescription -> Modification engine;
- non-target drill/easy/kick/max skill work -> no false target.

It returns a clean prescription/target package to the Board.

## Bridge — `engines/bridge.js`
The only live compatibility bridge into legacy v4 APIs. It maps `M.targets` and `M.adapt` calls to the isolated engines. No calculations belong here.

## Board engine — `engines/board.js`
The shop window. It owns how correct answers are presented and interacted with, never how they are calculated.

Board principles from the physical whiteboards:
- common squad work appears once;
- modifications sit beside the exact line they modify, not in a separate whole-session card;
- the modified line always carries enough of the changed prescription to coach it: changed reps/distance, changed send-off/rest, changed instruction/pattern, and the modified swimmer's applicable target/time;
- modified swimmer targets stay on that swimmer's modified line by default; opening `Times` is for the standard/group swimmers and does not make the coach hunt through a mixed able/modified list;
- compact first/preferred names, not anonymous initials;
- first-name collisions use compact surname disambiguation;
- Times opens across the full Board width;
- Times shows the answer once (`OL 1:10/1:20 · THR 1:08/1:20`), never every repeated rep or provenance text;
- multiple swimmers are laid out across the screen, not one giant row per swimmer;
- stroke is a small tappable pill whose resting label is the resolved stroke (`Fr`, `Bk`, `Br`, `Fly`, `IM`), not a large select box;
- a stroke change triggers a fresh engine interpretation while preserving the modification shape;
- tapping a swimmer name opens swimmer information while preserving Board scroll/context;
- shorthand such as `4 OL / 4 THR` is preferred over duplicated per-rep prose;
- rationale/provenance stays behind detail unless required to coach the set;
- phone and TV use the same whiteboard information hierarchy.

## Navigation engine — `engines/navigation.js`
Owns top-level view transitions and active-view state. Board, Coach Hub, Roll, Times, Swimmer and TV may request navigation, but may not claim another view's active state.

Rules:
- bottom navigation and Board quick links use the same route owner;
- a Board renderer may update Board DOM but cannot force Board active after another view was selected;
- Board scroll/session context is remembered before leaving and restored when appropriate;
- Android/browser history remains separate from target/modification logic.

## Capture UI — `engines/capture-ui.js`
Owns the capture surface only. Evidence saving remains in the existing capture/evidence path.

Rules:
- the deck exposes one `Capture` entry point instead of three duplicate buttons that open the same place;
- Note, Voice, Photo and Video remain available inside Capture;
- attending swimmers are the default visible/selected population;
- absent squad swimmers are hidden by default and require an explicit `Show squad` action;
- full squad/pathway administration remains available elsewhere and is not removed from data.

## Active boundary — 20 Aug 2026
The Thursday emergency recovery/pass2/deckfit layers are no longer loaded by `index.html`. Session repair, evidence, aerobic targets, T400 capture, race pace, modifications, coordination, compatibility bridging, Board presentation, navigation and capture presentation now have separate active owners under `engines/`.

The old Thursday files remain in the repository only as historical/reference code. They are not part of the active runtime path.

## Starting-point acceptance
`engines/acceptance.js` runs non-mutating browser-side fixture checks at startup for the highest-risk coaching rules. `tests/engine-acceptance.cjs` runs the same core ideas as an executable Node regression suite. GitHub Actions syntax-checks every active engine file and runs the Node suite on pushes and pull requests. A red fixture is an engine failure, not a Board styling problem.