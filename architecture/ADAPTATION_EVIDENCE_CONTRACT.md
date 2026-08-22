# MSOS Evidence-Backed Adaptation Contract

Build: `v4-im-performance-relative-20260823bs`

## Purpose

Modified work must preserve the intended training stimulus for the individual swimmer. A fixed session-load fraction such as 1/2 or 2/3 is a fallback guide, not a pace model, target-time model, or automatic interval multiplier.

The core coaching principle is:

> The modified swimmer is doing the same set at the same time as the group — their version of it.

That means preserving comparable work:rest relationships and keeping the swimmer connected to the group set window, rather than simply copying the group send-off or stretching an interval from rep-count arithmetic.

## Product naming

The short-course race-distribution source is displayed in-product as **Race pace model**. Source provenance may remain in audit/reference material, but the swimmer/coach surface should stay concise.

## Separate three different truths

1. **Load profile** — how much total session volume/load is normally appropriate for the swimmer. Legacy 1/2 or 2/3 values can remain as last-resort load guides.
2. **Performance scale** — how fast this swimmer is for the relevant stroke/course/event or training mode, derived from actual evidence such as a matching PB, Race pace model target, or T400 anchor.
3. **Set intent** — aerobic, race pace, max/quality, technical/skill, recovery, modified IM structure, or another coach-authored purpose.

Never use the load profile as though it were the swimmer's performance speed.

## Evidence priority

For an individual line, use the strongest applicable evidence in this order:

1. explicit coach edit / saved individual prescription;
2. exact Race pace model evidence for race-specific work;
3. valid matching T400 evidence for aerobic work;
4. matching stroke/course/event PB or recent measured set evidence to derive an athlete-to-reference speed factor;
5. accepted athlete-specific or set-type hard rule;
6. only then, a fallback load ratio.

Unsupported target work must say target required or remain target-free. Do not invent precision.

## Performance factor

For like-for-like distance evidence:

`athlete speed factor = reference time / athlete time`

Example: athlete SCM 200 Free = 3:21.00 (201 s), reference/main-group 200 Free = 2:38.00 (158 s).

`158 / 201 = 0.786`

So the athlete is approximately 78.6% of the reference speed for that evidence, not 2/3 by assumption.

Use a robust main-group reference, normally the median or trimmed mean of valid like-for-like evidence, rather than allowing one outlier to define the group.

## Work/rest matching

The aim is similar stimulus, not identical metres.

For target-driven or performance-scaled work:

1. identify the group's reference performance or target for the same event/stroke/course;
2. identify the modified swimmer's own matching evidence;
3. preserve the group's work:rest proportion by scaling the send-off from those performance times;
4. round the resulting practical send-off **up** to the next five-second deck interval;
5. then choose the practical rep count that keeps the swimmer's total set time closest to the group's authored set window while preserving complete movement units and the intended stimulus.

A reduced distance must never inherit the old target time just because the line was shortened.

## Send-off rules

- Reducing **rep count only** does not normally justify stretching the send-off. `4 x 75 @ 1:45 -> 2 x 75 @ 1:45` and `4 x 25 @ 0:45 -> 2 x 25 @ 1:30` are invalid automatic transformations.
- Where there is a genuine performance relationship, use it. The interval should be proportionally similar to the group's interval relative to performance, not derived from the swimmer's 1/2 or 2/3 load profile.
- Reducing **distance per rep** requires target/recovery recalculation from athlete evidence. Do not blindly keep either the old target or an arithmetically multiplied interval.

### Modified IM example

For complete IM repetitions, use exact-course IM performance evidence where available.

If the main group has a robust 100 IM reference of `1:10` and swims `5 x 100 IM @ 1:45`:

- group performance = 70 s;
- group cycle = 105 s;
- cycle/performance factor = `105 / 70 = 1.50`;
- group set window = `5 x 105 = 525 s` = `8:45`.

If McKenzie has a 100 IM PB around `1:52` (112 s):

- proportional cycle = `112 x 1.50 = 168 s`;
- round up to `2:50`;
- `3 x 2:50 = 8:30`, which remains close to the group's 8:45 window;
- `4 x 2:50 = 11:20`, which disconnects her from the group.

If Charlotte has a 100 IM PB around `2:12` (132 s):

- proportional cycle = `132 x 1.50 = 198 s`;
- round up to `3:20`;
- compare the practical total-time choices against the group's 8:45 window and choose the closest useful complete-rep option.

These are illustrations only. Production uses the swimmer's actual stored evidence and the actual group reference for that session.

If exact-course IM evidence is missing, the system must label any fallback as lower-confidence rather than pretending the timing is performance-derived.

## Intent-specific rules

### Aerobic

Matching T400 evidence is authoritative where the model applies. Use athlete-specific target work time and fit practical reps/distance/send-off to the intended zone and recovery.

### Race pace

Use the athlete's own Race pace model evidence, matching course/stroke/event and named segment where applicable. The model target must be recalculated after any distance change. If the required event evidence is not available, do not substitute a generic T400 or simple PB division.

### Modified IM

Preserve complete IM units. Use exact-course IM PB/performance evidence to scale the group cycle proportionally, then choose the rep count that keeps the swimmer connected to the group's total set window. Load ratio remains only a fallback if performance evidence is unavailable.

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
- group set window and athlete projected set time;
- reason/confidence;
- any coach override that replaced the suggestion.

Past delivered sessions are immutable. New PBs, T400 tests, race evidence or accepted athlete rules recalculate **future** suggestions only.

Coach edits are evidence, not silent global rules. Repeated similar coach edits can create a proposed athlete/context rule, but promotion to a standing rule must be explicit and reviewable.

This creates a durable loop:

`evidence -> deterministic rule -> proposed prescription -> coach delivery/edit -> saved evidence -> future refinement`

The system therefore improves without depending on an external conversation, while the coach remains the author and final decision-maker.
