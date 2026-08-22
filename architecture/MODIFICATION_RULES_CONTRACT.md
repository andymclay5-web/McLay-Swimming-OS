# MSOS Modification Rules Contract

## Why this exists

MSOS must not depend on ChatGPT remembering how a swimmer is normally modified.

The modification system must be able to explain, persist, version and evolve coaching rules from its own athlete profiles, evidence and coach decisions. The coach remains the author. Repeated edits may become suggested rules, but nothing becomes permanent without coach approval.

## One canonical session, individual projection

A modified session is an athlete-specific projection of the canonical squad session, not a second independent workout.

Each modified line should retain:
- canonical session/item ID;
- athlete ID;
- original work and timing;
- delivered modified work and timing;
- stimulus/purpose;
- rule/reason used;
- rule version;
- explicit coach override when present.

## Decision order

Use the first applicable rule unless the coach deliberately overrides it:

1. explicit coach edit for this exact session/item;
2. active temporary athlete constraint;
3. valid stimulus-specific model, e.g. John Pike race model for race work or eligible T400/training-test evidence for aerobic work;
4. coach-approved athlete/set-type rule;
5. athlete baseline profile such as 1/2 or 2/3 plus movement/end-of-pool constraints;
6. no safe rule: preserve coach-authored work/timing or ask for a coach decision rather than inventing precision.

A percentage is a fallback guide, not the whole decision.

## Work shape and timing are separate decisions

Reducing repetitions or distance does **not** mean stretching the send-off to occupy the original total set time.

Default rule:

> When a coach-authored cycle/send-off exists, retain it after a volume reduction unless a stronger athlete/stimulus timing rule explicitly changes it.

Examples:
- `4 x 75 @ 1:45` -> `2 x 75 @ 1:45`, not `2 x 75 @ 3:30`.
- `4 x 25 @ 0:45` -> `2 x 25 @ 0:45`, not `2 x 25 @ 1:30`.

A changed cycle is valid only when justified by real coaching logic: coach override, athlete-specific timing rule, aerobic target/recovery evidence, or a confirmed capability rule.

## Descending-pattern rule

A two-repetition "descent" is not useful coaching language.

When a normal `Descend 1-N` set is modified down to exactly two repetitions, convert the instruction to:

`1 Build / 1 Fast`

Do **not** apply this to a different concept such as `Descend Stroke Count`; that remains a stroke-count progression.

Examples:
- `4 x 100 Descend 1-4` -> `2 x 100 · 1 Build / 1 Fast`.
- `3 x 200 Descend Stroke Count 1-3` -> `2 x 200 · Desc SC 1-2`.

## Stimulus-first modification

### Race / quality / max
- Protect race shape, purpose and recovery.
- Prefer the authored/common interval.
- Do not automatically shorten important starts, finishes, maximum-speed or race-quality work.
- Use the John Pike race model only where its SCM event/segment evidence genuinely applies.

### Aerobic
- Preserve the intended zone and recovery relationship.
- Use valid athlete training evidence when eligible.
- A different practical cycle may be appropriate, but it must come from the aerobic decision, not inverse rep-count arithmetic.

### Skill / technical / underwater / body-line
- Protect movement quality and useful exposure.
- If volume is reduced, extra recovery is acceptable; do not create a huge new send-off merely to fill the squad set window.

### Recovery / regeneration
- Reduce load where useful without inventing a performance target.

### Movement/capability constraints
- Replace/remove the unavailable movement while preserving the closest useful purpose.
- Capability constraints outrank percentage arithmetic.

## Pool-end and pattern rules

Practical coaching structure outranks exact percentage arithmetic.

The engine may choose the nearest useful repetition/distance that:
- preserves complete descent/build/round structures where possible;
- uses practical pool lengths;
- keeps the athlete at the coaching end where that is an active athlete rule;
- does not destroy the intended stimulus.

The reason should be auditable.

## Durable rule record

A coach-approved carry-forward rule should contain fields equivalent to:

```text
rule_id
athlete_id
status = active | retired | temporary
scope = athlete | stroke | equipment | set_archetype | exact_pattern
set_archetype
match_conditions
work_action
timing_action
return_to_coaching_end
reason
source = coach_confirmed | repeated_coach_edits | imported_profile
confidence
evidence_count
effective_from
effective_until
version
supersedes_rule_id
created_by
created_at
updated_at
```

Old versions remain history.

## Learning from coach edits

Every manual modification is coaching evidence. Store the decision event rather than losing it after the session:
- athlete;
- canonical item/set type;
- generated prescription before edit;
- final coach-edited prescription;
- timing change;
- purpose/zone/race intent;
- date, coach and optional reason.

When the same correction repeats across genuinely similar sets, MSOS may propose a carry-forward rule. Example:

> McKenzie has repeatedly been changed from `4 x 75` to `2 x 75` while retaining `1:45` in similar technical/fins work. Carry this forward for this set type?

Coach choices should include:
- Yes — make rule
- Only for this type
- Edit rule first
- No — keep one-off

Nothing is silently learned into production behavior.

## Evolution

Rules evolve by version, not silent mutation.

When an established rule changes:
1. supersede/retire the old rule;
2. create a new version;
3. retain reason and effective date;
4. apply the new version to future projections unless the coach deliberately rebuilds history.

Temporary return/injury rules expire and fall back to the underlying durable profile.

## Explainability on deck

The Board stays compact, but an opened modified line must be able to answer `Why?`.

Example:

```text
McKenzie · 2 x 75 @ 1:45
Why: 2/3 profile · coaching-end rule · authored 1:45 retained
Rule: MD technical volume v3
```

The system must remain understandable and usable even when no AI assistant is available.
