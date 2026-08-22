# Athlete Evidence Contract

## Principle
MSOS should show the session as experienced by the swimmer, then layer every reliable observation onto the exact part of that session where it belongs.

A swimmer does not need complete data for the evidence to be useful. Partial observed data is valid evidence when its scope and provenance remain explicit.

## Set-level nesting
When MSOS knows the live context, evidence attaches automatically to:
- canonical session
- swimmer
- block
- set/item
- rep when known
- timestamp

Example spoken during a live 50m set:

`Amber sr 32 45.3`

Expected deterministic result:
- swimmer: Amber Proudfoot
- current canonical set: inherited from live Context Engine
- time: 45.3s
- stroke rate: 32
- source: coach voice
- scope: partial observation unless the whole set is explicitly captured

The individual Training log should display this evidence beside that set, underneath the swimmer's actual modified prescription, target and send-off.

## Partial evidence is not failure
MSOS must not require every rep to be timed.

If only two of six repetitions were observed, display what is known, for example:
- 2 reps captured
- 45.3 / SR32
- 44.8 / SR31

Do not silently fill missing repetitions. Do not label partial observations as the swimmer's whole-set result.

## Provenance
All evidence retains its source. Supported sources include:
- coach voice
- coach note
- assistant coach
- athlete self-report
- video/photo/audio
- timed/test system
- future sensor/device evidence

One source never silently overwrites another. Conflicting observations remain auditable.

## Athlete self-report
After training, a swimmer may add data against their own delivered session and a specific set where possible:
- rep times
- stroke rate
- heart rate
- RPE
- general feeling
- comments/reflection

The athlete's entry is stored as `athlete_self_report`, not as coach-measured truth.

Late entry time and observed session context are separate concepts: the swimmer may enter information later while it still belongs to the set completed earlier.

## Notes outside a session
A coach note added directly to a swimmer when no session/set is active remains athlete-level evidence on that swimmer's timeline. It does not get forced into an unrelated session.

## Group evidence
A general group note/capture applies to an individual only when that swimmer was actually participating at the relevant point in the canonical session.

Therefore:
- group evidence before Development joins does not belong to a Development swimmer
- group evidence after an athlete leaves early does not belong to that athlete
- session-level general evidence may apply across the athlete's participation window
- explicitly named evidence remains attached to that swimmer

## Reporting
Individual reports should combine:
1. delivered individual session truth
2. actual modified sets
3. targets and send-offs
4. partial performance observations
5. named and applicable group evidence
6. athlete self-report
7. athlete-level notes
8. 7-day / 30-day accumulation
9. Performance ↔ Training interpretation

The report should distinguish fact from interpretation. Raw evidence remains immutable; summaries can be regenerated later.

## UX rule
The coach should not have to file evidence manually when context is known.

`name + observation` should be enough during live coaching.

The swimmer should not need to reconstruct the whole workout after training. Their delivered session is already present; they add only the information MSOS could not know automatically.
