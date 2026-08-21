# Athlete Training Intelligence contract — 22 Aug 2026

## Purpose
The swimmer Training surface is not a notes inbox. It is the athlete-facing projection of canonical training truth over time.

Even with zero athlete-specific captures, MSOS still knows the session prescription, the athlete modification, calculated targets, attendance state, session finish state, recent exposure and upcoming programme. That structured truth must render before optional notes/video/audio evidence.

## Truth order
1. Delivered athlete-specific override / timed evidence
2. Finished canonical session + attendance + athlete prescription
3. Current attended canonical session + athlete prescription
4. Planned canonical session + athlete projection
5. Notes/captures enrich the record; they do not create the training record

Never label a projected or attendance-unknown prescription as definitely completed.

## Default Training screen
The first screen must answer, without digging:
- What did I do / what was I prescribed today?
- What were my targets?
- How much have I accumulated in the last 7 days?
- How much in the last 30 days?
- What systems, strokes and training modes have I been exposed to?
- What is coming next?
- How does this recent work relate to my current performance priorities?

## Today / selected session
Show athlete prescription, not squad metres.

For each block show:
- athlete metres
- actual adapted set wording
- zone / phase pattern
- target or target range
- send-off/rest where meaningful
- adaptive choice where selected
- relevant timing/evidence if captured

If no athlete-specific capture exists, say that no extra capture was made; do not say there is no swimmer evidence when the canonical prescription exists.

## Accumulation
Provide compact 7-day and 30-day summaries:
- attended sessions
- confirmed delivered prescription metres
- current attended prescription metres
- attendance-unknown matching sessions separately
- zone metres: Regeneration / Development / Overload / Threshold / Clearance
- race-pace / quality / skill / kick / pull exposure
- stroke exposure
- evidence count only as a secondary layer

Unknown attendance must never be silently counted as work completed.

## Performance ↔ Training
Training and Performance are two views of the same athlete record.

For each leading event / meaningful opportunity show:
- PB and performance score where valid
- next real milestone / para MQS development rung
- gap in seconds / percent where valid
- recent same-stroke exposure
- recent race-pace exposure
- relevant recent test / timed evidence
- upcoming programme exposure where useful

Language must describe supporting context, not claim causation. Example: `Recent 200 Fly supporting work: 450m Fly + 300m race-pace exposure this week` is allowed. `This training caused the PB` is not allowed without a defensible causal model.

## Upcoming
Remote and present athletes read from the same canonical programme.

Show the next few matching squad sessions transformed through the athlete prescription engine. A separate session is created only where the coach explicitly branches the athlete programme.

## Simple presentation hierarchy
1. NOW / TODAY
2. 7 DAYS / 30 DAYS
3. PERFORMANCE ↔ TRAINING
4. WHAT'S NEXT
5. EVIDENCE / HISTORY details

The screen should be glanceable on deck. Full per-session detail sits behind compact expandable blocks.

## Accessibility / modified athletes
Modified swimmers must see their actual projected prescription and accumulated athlete metres, not the squad total multiplied by a generic percentage after the fact. The adaptation engine is authoritative per item.

## Reporting link
The same athlete training ledger feeds:
`session → week → block → season → swimmer record → coach report`.

No second reporting-only dataset should be created.
