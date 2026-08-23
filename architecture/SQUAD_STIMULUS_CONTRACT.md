# Squad Stimulus and Readiness Contract

Status: consolidation contract
Date: 23 August 2026

## Core coaching principle

Squad placement is not a speed-matching test.

> A swimmer belongs in a squad when they can receive the intended stimulus of that squad, through an appropriate individual prescription, while remaining meaningfully connected to the team environment.

This is especially important for para swimmers and other athletes whose absolute speed may differ substantially from the squad while their training level, competitive level and ability to handle the squad's stimulus justify the placement.

## Assigned squad is the reference domain

Modification and readiness comparisons are anchored to the swimmer's **assigned squad**, not simply whoever is present today.

Examples:
- A National swimmer is compared against the National stimulus/reference bank.
- A Development swimmer is compared against Development.
- If a swimmer attends a mixed session, the lead/assigned squad remains the default reference unless the coach explicitly changes the comparison context.

## Reference quality hierarchy

Use the strongest fair comparator available:

1. current-session swimmers from the assigned squad **only when the live sample is representative**;
2. recent valid assigned-squad evidence bank;
3. recent historical cohort for the assigned squad and same set/stimulus type;
4. stable squad benchmark built from sufficient recent evidence;
5. broader programme benchmark only when squad evidence is unavailable;
6. individual load-profile fallback, explicitly marked low confidence.

### Live sample quality gate

A live cohort should normally require at least **3 valid comparable swimmers** after filtering for:
- assigned squad/training level;
- relevant evidence type;
- course/stroke/event where required;
- evidence recency/validity;
- outlier protection.

A small or unrepresentative roster must not redefine the squad benchmark.

Example: McKenzie training with only Henry does not make Henry the National reference if his performance level is not representative of the squad. Use the stable National reference bank instead.

## Stimulus decides the comparator

There is no single performance ratio for a swimmer.

### Aerobic / sustained work
Prefer:
- relevant T400 evidence;
- relevant aerobic test evidence;
- recent measured aerobic-set evidence.

Compare swimmer evidence with the assigned squad's robust reference (normally median/trimmed reference).

### Sprint / race-quality work
Prefer:
- exact or closest relevant PB;
- Race pace model evidence;
- recent measured sprint/race-quality evidence.

### Technical / skill / starts / turns / maximum-quality work
Use:
- capability constraints;
- quality/recovery requirement;
- relevant recent evidence where useful.

Absolute speed difference alone is not permission to reduce the work.

### Crossover work
Where aerobic and race-performance evidence both matter, the authored set intent determines weighting. The system should retain both evidence sources and confidence rather than force a false hard boundary.

## Modification objective

For every individual prescription, attempt to preserve all four in this order:

1. intended physiological/technical stimulus;
2. safe and achievable athlete work;
3. connection to the squad's starts, rounds and overall set window;
4. appropriate total load for the athlete.

The 1/2 or 2/3 profile is a total-load fallback, not a pace or interval model.

## Common-start decision

A modified swimmer should keep the group's send-off when the individual work still preserves the intended stimulus.

Example: short sprint/quality work with large recovery may remain identical for the modified swimmer because the extra seconds of work do not materially compromise recovery.

When the common interval would materially change or destroy the intended stimulus:

1. consider changing distance/work while retaining common starts;
2. otherwise derive an athlete-specific work:rest relationship from valid performance evidence;
3. choose practical reps/distance so the swimmer remains connected to the group's overall set window.

## Squad readiness / promotion

Readiness is multi-dimensional, not a single time cutoff.

A future Squad Readiness projection should report at least:
- aerobic stimulus readiness;
- race-quality/speed stimulus readiness;
- technical/skill readiness;
- sustainable session-load readiness;
- recovery/work:rest compatibility;
- ability to remain operationally connected to the squad;
- evidence confidence and gaps.

Possible result language:

```text
Development → National
Aerobic stimulus: Ready with individual projection
Race-quality stimulus: Ready
Technical demand: Ready
Sustainable load: Developing
Squad connection: Suitable
Evidence confidence: High
```

The coach makes the promotion decision. MSOS provides evidence and explains how the swimmer can fit the stimulus.

## Evidence provenance

Every comparison should retain:
- athlete ID;
- assigned squad;
- stimulus classification;
- comparator type;
- comparator source and date window;
- reference population N;
- reference value and dispersion where available;
- swimmer value;
- relative performance factor;
- confidence;
- fallback reason if live/squad evidence was insufficient.

This allows the system to improve without hiding how a prescription or readiness suggestion was reached.
