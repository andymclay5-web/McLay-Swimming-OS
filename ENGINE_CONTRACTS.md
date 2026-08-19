# McLay Swimming OS v4 — Engine contracts

## Architecture rule
Each engine owns one kind of truth. If an engine is wrong, fix that engine. Do not patch its answer in the Board or another engine. Engines exchange only the minimum information required through explicit bridges.

## Session / parser truth
Owns authored workout structure, blocks, rounds, repeats, cues, totals, rest/send-off semantics and canonical session identity. It does not calculate athlete targets or modifications.

## Evidence engine — `engines/evidence.js`
Owns local evidence hydration and identity matching across current/legacy athlete IDs. It exposes PB rows, training-test/T400 rows and source evidence. It does not calculate training targets.

Inputs: athlete + stored/local evidence.
Outputs: matching evidence rows only.

## Aerobic engine — `engines/aerobic.js`
Owns T400 selection, aerobic coefficients, authored-rest interpretation, practical send-off and Rushton HR/SR fallback when no matching-stroke T400 exists.

Inputs: athlete, stroke, zone, distance, authored rest + evidence.
Outputs: target time/send-off or HR/SR fallback.

Default stroke interpretation remains upstream/session semantics: aerobic unspecified stroke = Freestyle.

## Race-pace engine — `engines/race-pace.js`
Owns PB lookup, course conversion, #1/#1F resolution from performance evidence, race-pace arithmetic and any validated race-segment models.

Inputs: athlete, race intent, work distance, stroke/course + evidence.
Outputs: race target, resolved stroke, source or explicit missing-evidence result.

It must never invent a target when the required evidence/model is missing.

## Modification engine — `engines/modification.js`
Owns athlete modification profiles and the final manageable prescription. It receives the canonical group prescription and may use evidence through explicit calls, but does not own PB/T400 formulas.

Rules include:
- inclusion/stimulus before blind mathematical reduction;
- 1/2 and 2/3 profiles are starting constraints, not universal arithmetic;
- short quality/anaerobic work should stay with the team where manageable;
- IM is structurally protected — do not silently invent 50/75 IM units;
- return-to-start/pool-end rules apply where required;
- coach-authored overrides beat generated modifications;
- a stroke-only override must not erase the athlete's modification shape.

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
- modifications sit beside the exact work they modify;
- only differences are shown;
- compact first/preferred names, not anonymous initials;
- first-name collisions use compact surname disambiguation;
- targets expand across the available Board width;
- multiple swimmers are laid out across the screen, not one giant card per swimmer;
- stroke is a small tappable pill (`Auto`, `Fr`, `Bk`, `Br`, `Fly`, `IM`);
- tapping a swimmer name opens swimmer information while preserving Board context;
- shorthand such as `4 OL / 4 THR` is preferred over duplicated per-rep prose;
- rationale/provenance stays behind detail unless required to coach the set;
- phone and TV preserve the same whiteboard information hierarchy.

## Current transition boundary — 20 Aug 2026
The Thursday recovery/pass2/deckfit files are retained temporarily as renderer/session-repair scaffolding because they contain the current working two-column Board DOM and stored-round recovery. They load before the new bridge. The new isolated bridge then becomes the final owner of target and modification functions, preventing those earlier emergency patches from remaining authoritative.

Next cleanup is to move the remaining renderer/session-repair responsibilities into their proper Board/Session engines and then remove the Thursday scaffold from the active load entirely.
