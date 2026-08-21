# Implementation Map — architecture to current MSOS files

This map prevents the architecture from becoming a parallel rewrite.

## Existing modules to preserve and extend

- `v4-poolside-core.js` — canonical session parsing/live session truth.
- `engines/modification.js` + adaptive layers — individual prescription derivation.
- `engines/aerobic.js` — deterministic physiological target engine.
- `engines/race-pace.js` + Rainbow race-model layer — deterministic race target engine.
- `engines/coordinator.js` — target/prescription coordination.
- `engines/board.js` — coach Board projection.
- `engines/board-state.js` — poolside state persistence.
- `engines/capture-ui.js` — current evidence entry surface.
- `engines/swimmer-tabs-ui.js` — current swimmer profile/performance projection.
- `engines/reporting.js` — reporting foundation.
- Meet modules — meet-specific programme/context projection.

## Existing new foundation (22 Aug)

- `engines/context-engine-av.js` — early session timeline/context hypothesis.
- `engines/voice-router-av.js` — early deterministic voice routing.
- `engines/voice-ui-av.js` — browser one-shot prototype only.
- `engines/context-voice-av.css` — context/quick-view presentation.
- `engines/release-guardian-av.js` — early regression contract.
- `engines/rainbow-rules-au.js` — Rainbow/race-model coaching corrections.

## Architecture modules in this directory

These are pure, inert contracts first. They do not alter the live Board simply by existing.

- `context-core.js` — target Context Engine model.
- `interaction-core.js` — deterministic intent/action envelope.
- `evidence-core.js` — immutable raw evidence + derived records.
- `projection-core.js` — timing ownership and prescription grouping.
- `report-core.js` — factual report rollup.
- `entitlement-core.js` — capabilities/usage boundary.

## Integration sequence

### Integration 1 — context events

Bridge current `context-engine-av.js` to append-only context anchors/events rather than keeping context as incidental UI state.

### Integration 2 — swimmer TV Board

Use Projection timing ownership and grouping rules inside TV/Board surface. Do not rebuild target calculations.

### Integration 3 — deck quick view

Replace arbitrary event subset with a canonical all-PB projection and dedupe by event/course key.

### Integration 4 — capture

Make context-first athlete selection the default. Create raw evidence envelope at save time.

### Integration 5 — native bridge

Native transcript enters through the same interaction parser used by browser Talk prototype.

### Integration 6 — report materialization

Finish Session consumes event/evidence ledgers and writes a factual session report immediately.

### Integration 7 — remote athlete

Project canonical session through existing modification/target coordinator; store only remote delivered events/evidence.

### Integration 8 — AI

Only after local flows are stable, add an orchestrator that consumes evidence and emits derived interpretation records.
