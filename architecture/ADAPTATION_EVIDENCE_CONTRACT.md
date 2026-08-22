# MSOS Evidence-Backed Adaptation Contract — BF

Build: `v4-evidence-backed-mods-20260823bf`

## Purpose

Modified work must preserve the intended training stimulus for the individual swimmer. A fixed session-load fraction such as 1/2 or 2/3 is a fallback guide, not a pace model, target-time model, or automatic interval multiplier.

## Protected naming

The short-course race-distribution source is displayed in-product only as **Race pace model**. Do not display a named attribution. Source provenance may remain in audit/reference material, but the swimmer/coach product label is `Race pace model`.

## Separate three different truths

1. **Load profile** — how much total session volume/load is normally appropriate for the swimmer. Legacy 1/2 or 2/3 values can remain as last-resort load guides.
2. **Performance scale** — how fast this swimmer is for the relevant stroke/course/event or training mode, derived from actual evidence such as a matching PB, Race pace model target, or T400 anchor.
3. **Set intent** — aerobic, race pace, max/quality, technical/skill, recovery, or another coach-authored purpose.

Never use the load profile as though it were the swimmer's performance speed.

## Evidence priority

For an individual line, use the strongest applicable evidence in this order:

1. explicit coach edit / saved individual prescription;
2. exact Race pace model evidence for race-specific work;
3. valid matching T400 evidence for aerobic work;
4. matching stroke/course/event PB or recent measured set evidence to derive an athlete-to-reference speed factor;
5. accepted athlete-specific hard constraint or learned rule;
6. only then, a fallback load ratio.

Unsupported target work must say target required or remain target-free. Do not invent precision.

## Performance factor

For like-for-like distance evidence:

`athlete speed factor = reference time / athlete time`

Example: athlete SCM 200 Free = 3:21.00 (201 s), reference/main-group 200 Free = 2:38.00 (158 s).

`158 / 201 = 0.786`

So the athlete is approximately 78.6% of the reference speed for that evidence, not 2/3 by assumption.

Use a robust main-group reference (normally median or trimmed mean of valid like-for-like target evidence) rather than allowing one outlier to define the group.

## Work/rest matching

The aim is similar stimulus, not identical metres.

For target-driven work:

1. calculate the main/reference target work time and rest relationship;
2. calculate the modified swimmer's target from their own evidence at each practical candidate distance;
3. choose the practical distance/repetition pattern that makes work duration and work:rest relationship closest to the reference while preserving the set purpose and pool-end constraints;
4. calculate the swimmer's target time again for the chosen distance;
5. use the shared send-off when the resulting work/rest relationship is close enough; otherwise calculate a swimmer-specific send-off from the same work/rest relationship.

A reduced distance must never inherit the old target time just because the line was shortened.

## Send-off rules

- Reducing **rep count only** does not justify stretching the send-off. `4 x 75 @ 1:45 -> 2 x 75 @ 3:30` and `4 x 25 @ 0:45 -> 2 x 25 @ 1:30` are invalid automatic transformations.
- Reducing **distance per rep** requires target/recovery recalculation from athlete evidence. Do not blindly keep either the old target or an arithmetically multiplied interval.
- Practical five-second rounding happens only after the target/recovery decision.

## Intent-specific rules

### Aerobic

Matching T400 evidence is authoritative where the model applies. Use athlete-specific target work time and fit practical reps/distance/send-off to the intended zone and recovery.

### Race pace

Use the athlete's own Race pace model evidence, matching course/stroke/event and named segment where applicable. The model target must be recalculated after any distance change. If the required event evidence is not available, do not substitute a generic T400 or simple PB division.

### Max / starts / finishes / technical quality

Protect quality exposure. Do not reduce solely to satisfy a global volume percentage. Hard capability constraints or an explicit coach edit may change the line. Do not show a target when the evidence does not support one.

### Recovery / easy / skill support work

Keep the Board clean unless a target is genuinely useful. These lines are often the first place to recover total session load if quality work should be protected.

## Carry-forward and evolution

Every generated adaptation decision should retain:

- session, item and swimmer IDs;
- rule version;
- source evidence IDs/types;
- reference target or reference performance;
- athlete target/performance;
- derived speed factor where used;
- chosen reps, distance, target and send-off;
- reason/confidence;
- any coach override that replaced the suggestion.

Past delivered sessions are immutable. New PBs, T400 tests, race evidence or accepted athlete rules recalculate **future** suggestions only.

Coach edits are evidence, not silent global rules. Repeated similar coach edits can create a proposed athlete/context rule, but promotion to a standing rule must be explicit and reviewable.

This creates a durable loop:

`evidence -> deterministic rule -> proposed prescription -> coach delivery/edit -> saved evidence -> future refinement`

The system therefore improves without depending on an external conversation, while the coach remains the author and final decision-maker.
