# McLay Swimming OS v4 — Engine contracts

## Architecture rule
Each engine owns one kind of truth. If an engine is wrong, fix that engine. Do not patch its answer in the Board or another engine. Engines exchange only the minimum information required through explicit bridges.

A reporting or presentation surface may combine answers from many engines, but it does not become the owner of those answers. Derived coaching interpretation must retain the evidence that produced it.

## Session / parser truth
Owns authored workout structure, blocks, rounds, repeats, cues, totals, rest/send-off semantics and canonical session identity. It does not calculate athlete targets or modifications.

The isolated stored-round/source recovery lives in `engines/session-repair.js`. It may repair canonical structure, but it does not touch targets, modification rules or Board rendering.

## Evidence engine — `engines/evidence.js`
Owns local evidence hydration and identity matching across current/legacy athlete IDs. It exposes PB rows, training-test/T400 rows and source evidence. It does not calculate training targets or decide an athlete's #1 event.

Inputs: athlete + stored/local/reference evidence.
Outputs: matching evidence rows only.

No PB/result evidence means there is no defensible event rank. A T400 proves a training-test anchor, not a race-event rank.

## Performance interpretation — `engines/performance.js`
Owns the distinction between event performance and stroke identity.

It exposes:
- `#1 event` — the highest ranked actual event from PB/result point evidence, including IM and distance Freestyle;
- `#1 stroke` — the best applicable stroke identity from ranked stroke-event evidence;
- `#1F` — the best non-Freestyle/form stroke from ranked evidence;
- PB/event ranking evidence;
- T400/test anchors and recent timed-set evidence as related evidence, without treating them as race rankings;
- contextual stroke selection for IM-primary swimmers by asking the Stroke Balance engine when the set needs a stroke rather than an event.

An athlete with no ranked PB/result evidence returns `#1 needed`; the engine must not infer a race rank from a T400 or a generic profile label.

## Stroke exposure / balance — `engines/stroke-balance.js`
Owns longitudinal stroke exposure for every swimmer and the extra contextual logic used for IM-primary swimmers.

It retains two parallel truths:
- raw metres by Freestyle / Backstroke / Breaststroke / Butterfly;
- weighted stroke focus, where work is weighted by training intent so incidental/easy Freestyle does not swamp genuine stroke-focus work.

Initial weights are provisional methodology, not immutable physiology. The engine exposes the weights and raw values so they remain auditable and can be refined against coaching practice and evidence.

Current first-pass weights:
- easy / regeneration: 0.25;
- development: 0.45;
- overload: 0.70;
- threshold: 0.85;
- clearance / race pace: 1.00;
- max / sprint: 1.10;
- explicit technical work: 0.70;
- incidental/default Freestyle: 0.20;
- otherwise unclassified stroke work: 0.35.

The normal views use rolling 7-day and 28-day windows while retaining raw session history.

For an IM-primary swimmer, contextual stroke selection may consider, in order:
1. explicit/weekly stroke emphasis found in current programme/session metadata;
2. recent coach stroke selections as evidence of coaching intent;
3. recent weighted stroke balance, favouring an under-served applicable stroke when appropriate;
4. ranked stroke-event evidence.

The engine does not claim that exposure caused a performance change. It may provide an evidence-backed talking point such as low recent Fly focus alongside a Fly performance change.

## Aerobic engine — `engines/aerobic.js`
Owns T400 selection, aerobic coefficients, authored-rest interpretation, practical send-off and Rushton HR/SR fallback when no matching-stroke T400 exists.

Inputs: athlete, stroke, zone, distance, authored rest + evidence.
Outputs: target time/send-off or HR/SR fallback.

Default stroke interpretation remains upstream/session semantics: aerobic unspecified stroke = Freestyle.

## T400 capture — `engines/t400-capture.js`
Owns the live result-comparison behaviour when a coach records a T400. It compares the new result with the fastest valid prior T400 of the same stroke before the new row is saved, annotates the row, and reports first baseline / PB improvement / equals PB / seconds off PB. It does not calculate aerobic training targets or rank race events.

The fastest valid historical result remains the anchor selected by the Aerobic engine; a slower new test never replaces the best anchor just because it is newer.

## Race-pace engine — `engines/race-pace.js`
Owns PB lookup, course conversion, race-pace arithmetic, contextual #1/#1F stroke resolution and validated race-segment models.

Inputs: athlete, race intent, work distance, stroke/course + evidence.
Outputs: race target, resolved stroke, source or explicit missing-evidence result.

The engine distinguishes event ranking from stroke selection. When a set says `#1 Stroke`, it asks for the appropriate stroke, not merely the athlete's highest-scoring event. An IM event can therefore remain the athlete's #1 event while the set resolves to a contextually appropriate Fly/Bk/Br/Fr stroke.

Specific race segments such as `second 100 of 200 race` require a validated stored split or a validated segment model. If the evidence/model is not available, the result must say that the split/model is needed rather than inventing a proportional number.

It must never invent a target when the required evidence/model is missing.

## Modification engine — `engines/modification.js`
Owns athlete modification profiles and the final manageable prescription. It receives the canonical group prescription and may consume evidence, but it does not own PB/T400 formulas or longitudinal stroke-balance calculations.

Rules include:
- inclusion/stimulus before blind mathematical reduction;
- 1/2 and 2/3 profiles are starting constraints, not universal arithmetic;
- short quality/anaerobic work stays with the team where manageable;
- larger mixed/aerobic work is resized while preserving authored phases where possible;
- IM is structurally protected — no silent 50/75 IM units;
- when repetitions are reduced on an authored fixed cycle, the modified cycle may be lengthened to keep the swimmer in the same overall team work window instead of forcing the reduced athlete onto an impossible group send-off;
- when reps change, dependent instructions change with them — e.g. `3×200 Pull · Desc SC 1-3` becoming `2×200 Pull · Desc SC 1-2`, never retaining stale 1-3 wording;
- composition changes with modified distance rather than retaining impossible original component distances;
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

It returns a clean prescription/target package to the Board. Performance interpretation and Stroke Balance may be consulted by the Race-pace engine for contextual stroke choice; their maths does not move into the coordinator.

## Bridge — `engines/bridge.js`
The live compatibility bridge into legacy v4 APIs. It maps `M.targets`, `M.adapt` and performance requests to the isolated engines. No coaching calculations belong here.

The bridge must hydrate the same reference PB/results/base-time cache used by the swimmer Pathway before declaring performance evidence ready. Pathway may not know a PB while Race Pace cannot see it. Reference evidence is merged into runtime evidence without forcing an oversized full-state persistence merely to make the data visible to another engine.

## Board state — `engines/board-state.js`
Owns transient whiteboard interaction state only: opening/closing an inline Times panel, current block/focus state and lightweight stroke controls inside the opened target panel.

Rules:
- opening Times is a UI action and must not serialize/persist the whole application state;
- the target panel is inserted/removed at the selected set row rather than forcing a whole-Board rerender;
- lightweight UI state uses `storageEngine.saveUi()`;
- target values still come from the Coordinator / Aerobic / Race Pace engines;
- no training formula belongs in Board State.

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
- tapping a swimmer name opens swimmer Performance/Pathway while preserving Board scroll/context;
- shorthand such as `4 OL / 4 THR` is preferred over duplicated per-rep prose;
- rationale/provenance stays behind detail unless required to coach the set;
- phone and TV use the same whiteboard information hierarchy.

## Performance / Pathway UI — `engines/performance-ui.js`
Owns the coach-facing presentation of one swimmer's performance evidence. It combines, without re-calculating:
- #1 event / #1 stroke / #1F;
- PB and WA/Para ranking evidence;
- 7/28-day stroke exposure;
- T400/test anchors;
- recent timed-set evidence;
- pathway qualification information.

It provides direct links to Times/T400 and Reports. Board swimmer-name and Times-row navigation for a coach should open this performance surface, not the privacy-filtered swimmer-device session view.

## Reporting engine — `engines/reporting.js`
The Reporting engine is an aggregator/query engine, not a coaching-truth owner.

It may build reports from any registered information supplied by the specialist engines, including session volume, stroke exposure, PB/points performance, #1 event/stroke/#1F, T400/tests, timed sets, attendance/modification counts and coaching evidence.

Reports can be scoped by swimmer or squad and by selectable time windows. The catalogue is deliberately extensible so future dosage, HR/RPE/SR, race splits, technical evidence, meet results and pathway measures can be added as report fields without moving their formulas into Reporting.

A report must preserve the difference between hard evidence and interpretation. For example, raw/weighted stroke exposure is hard derived data; a suggestion that low Fly exposure may be relevant to a performance trend is a talking point, not a causal diagnosis.

Role/privacy filtering occurs before aggregation: a swimmer device can only report on that swimmer's allowed data.

## Reporting UI — `engines/reporting-ui.js`
Owns report selection and presentation only. It exposes squad/swimmer scope, 7/14/28/all-loaded windows, metric toggles and the available field catalogue, then asks the Reporting engine for the result.

Rows link back to the selected swimmer's Performance/Pathway evidence so a report remains explorable rather than becoming a dead summary.

## Navigation engine — `engines/navigation.js`
Owns top-level view transitions and active-view state. Board, Coach Hub, Roll, Times, Performance/Pathway, Reports, Swimmer and TV may request navigation, but may not claim another view's active state.

Rules:
- bottom navigation and Board quick links use the same route owner;
- Board swimmer names and Timing evidence rows open coach Performance/Pathway when the role is coach/owner;
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
The Thursday emergency recovery/pass2/deckfit layers are no longer loaded by `index.html`. Session repair, evidence, aerobic targets, T400 capture, race pace, performance interpretation, stroke exposure/balance, modifications, coordination, compatibility bridging, Board presentation/state, navigation, reporting and capture presentation now have separate active owners under `engines/`.

The old Thursday files remain in the repository only as historical/reference code. They are not part of the active runtime path.

## Starting-point acceptance
`engines/acceptance.js` runs non-mutating browser-side fixture checks at startup for the highest-risk coaching rules. `tests/engine-acceptance.cjs` and `tests/board-evidence-regression.cjs` run core regression ideas as executable Node suites. GitHub Actions syntax-checks every active engine file and runs the Node suites on pushes and pull requests. A red fixture is an engine failure, not a Board styling problem.

Real phone/desktop acceptance remains required. A workflow definition or fixture cannot prove rendered-device speed, touch behaviour, service-worker refresh or actual on-device evidence availability.