# McLay Swimming OS — Engine Architecture

## North Star flow

Plan → Session Truth → Attendance → Targets / Adaptation → Board / Devices → Evidence → Finish → Reporting / Learning → Next Plan

The system is intentionally modular. Each engine has one owner, defined inputs and outputs, and explicit things it is forbidden to change.

## Build order

1. **Session Truth Engine** — natural coaching language → canonical session structure.
2. **Planning Context Engine** — season / cycle / week / session intent and progression context.
3. **Attendance Engine** — session-specific present / modified / away truth.
4. **Target Engine** — T400, PB, race-model and authored-target resolution.
5. **Adaptation Engine** — canonical work + athlete constraints/history → same-as-group or explicit modified work.
6. **Board Presentation Engine** — compact whiteboard projection only; no domain calculations.
7. **Evidence Engine** — note / voice / photo / video / timing linked to stable session/block/set/athlete IDs.
8. **Finish / Delivered Truth Engine** — planned vs changed vs delivered session and carry-forward.
9. **Reporting / Learning Engine** — athlete, squad, coach, week/cycle/season analysis over stored truth.
10. **Presentation Channels** — Coach Board, TV Board, Individual Device, Assistant Coach, Meet surfaces consume the same engines.

---

# Engine 1 — Session Truth

## Purpose
Convert the coach's natural session language into one deterministic canonical session document exactly once.

## Inputs
- raw session text from voice transcript, paste, type or photo transcript;
- immutable session identity supplied by the calendar/session selector: date, day part, squad(s), venue, course, start/end.

## Reads
Nothing outside the supplied input. It does not read attendance, T400, PBs, athlete profiles, plans, cloud state or UI state.

## Output
A canonical session tree:

`Session → Block → Group/Rounds → Set → Composition / Pattern / Cue`

A runnable Set owns reps × distance. Groups multiply their children by rounds. Composition, pattern and cue nodes never add distance.

## Writes
Nothing. The engine is pure. The caller decides when an accepted canonical session is persisted.

## Forbidden
The Session Truth Engine may not:
- calculate athlete targets;
- modify athletes;
- decide attendance;
- render the Board;
- infer missing distance from a written total;
- silently alter session identity;
- overwrite the original source text;
- turn child composition/cues into phantom metres.

## Required invariants
- Original raw source is retained unchanged.
- `Main set 3 rounds` and `Main Set` + `3 Rounds:` produce the same structure.
- `5 × 100 + 400` inside 3 rounds totals 2700m exactly once.
- `12 × 50` followed by `1 × 50 Scull / 1 × 50 Drill / 1 × 50 Swim` remains one 600m parent set with a repeating pattern.
- `8 × 75` followed by `25 Easy / 25 Build / 25 Fast` remains one 600m parent set with composition.
- standalone `10 sr` updates rest; it never creates a 10m set.
- unknown coaching wording is retained as a cue rather than discarded or guessed.
- a written total is an audit check, not a distance override. A mismatch blocks acceptance.

## Current status
Engine 1 is being developed on branch `engine/session-canonical-v1` and is deliberately not loaded by the production `index.html` yet.

Initial regression suite covers:
- the live 4650m Monday PM failure;
- 12×50 repeating child-pattern phantom-distance regression;
- inline `1 Scull / 1 Drill / 1 Swim` pattern;
- 3-round multiplication;
- unknown cue preservation;
- written-total mismatch rejection.

Integration into the live app happens only after the engine's regression set is expanded against proven historical sessions and accepted.