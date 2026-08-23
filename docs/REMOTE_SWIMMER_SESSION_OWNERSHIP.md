# Remote Swimmer Session Ownership

## Product intent
Give an AquaGym swimmer ownership of the same coached session when they are not physically on deck, without creating a second disconnected workout or losing the evidence of what they actually did.

The swimmer receives the canonical squad session projected through their own prescription. Example: `8 × 100 Fr DEV · 1:12 on 1:25`.

The coach-authored session remains immutable. Athlete actions create individual execution/override/evidence records linked back to that canonical session.

## Core model
Keep these truths separate:

- `source_session_id` — canonical AquaGym session used as the programme source.
- `programmed_date` — date the source session belonged to.
- `execution_date` / `started_at` / `completed_at` — when the swimmer actually performed it.
- `mode` — `in_person`, `remote`, or `makeup`.
- `athlete_id` — swimmer completing the work.
- `prescription_snapshot` — the swimmer-specific work/targets shown when they performed it.
- `completion` — completed, partial, stopped-at, skipped-with-reason.
- `athlete_notes` / evidence — notes, observations, optional timing/capture evidence from that execution.
- `coach_review` — reviewed/unreviewed plus coach response where needed.

A swimmer may therefore complete Friday's programmed session on Saturday, or be directed by the coach to repeat a useful Thursday session later. Training history credits the work to the execution date while retaining the source-session/date link.

## Swimmer session surface
The swimmer should see:

1. The normal squad session structure.
2. Their individualized work, target, recovery/send-off, stroke and rationale where relevant.
3. Their own pathway and training history alongside the session context.
4. Simple progress/completion controls.
5. Notes/evidence capture tied to the exact execution.

Opening/viewing a session never creates attendance or completion.

## Athlete-requested stroke change
A swimmer can tap the stroke and request a change.

Flow:

1. Ask: `Why do you want to change this stroke?`
2. Record requested stroke + rationale against this swimmer and source set.
3. Evaluate against the existing programmed stimulus and deterministic coaching rules/evidence.
4. If it clearly remains inside the programmed response, approve the individual override and show why it fits.
5. If it clearly conflicts with the programmed response, do not change the prescription. Show: `That change doesn't fit the programmed response for this set. Contact Andy if you want to discuss it.`
6. If the rule/evidence is insufficient to decide safely, do not guess. Mark `Coach review` and keep the current prescription until the coach approves it.

Prior coach-approved choices should be reusable as evidence/context, but they never silently rewrite future sessions.

## Coach Roll / review
Remote work must remain visible to the coach without pretending the swimmer was physically Here.

Roll/review vocabulary should distinguish:

- Here
- Modified
- Away
- Remote
- Made up

A Remote/Made up row should expose the actual execution date and a review marker. Opening it should show the swimmer's actual prescription, changes/rationales, completion point, notes and evidence.

The original session attendance record remains tied to the source session. The remote execution record carries the actual date/time.

## Training history
Training history should use actual execution date for load chronology while preserving:

- source session title/date
- prescribed vs actually completed work
- stroke changes and their provenance
- targets / HR-SR guidance
- athlete notes/evidence
- coach review
- partial/finished status

This closes the current information gap created by informal instructions such as `do this workout tomorrow` or later reports like `I had a swim`.

## Acceptance examples

### Same session, next day
Friday source session → swimmer completes Saturday remotely.
- Coach Roll on Friday source: `Remote · completed Sat 24 Aug`.
- Athlete training log: work appears on Saturday.
- Record retains `Source: Friday session`.

### Re-use an older coached session
Coach says to repeat Thursday's useful session on Sunday.
- Athlete opens Thursday source session.
- A new execution is created for Sunday; canonical Thursday session is unchanged.
- Sunday training load/history records the individualized work actually completed.

### Stroke request
`8 × 100 Fr DEV · 1:12 on 1:25` → swimmer requests Backstroke and gives a reason.
- If Backstroke can still deliver the intended Development stimulus with valid evidence/targeting, approve an individual execution override and store the rationale.
- If it cannot, reject the change without altering the source prescription and direct the swimmer to contact Andy.

## Architecture constraints
- No duplicate canonical session for remote work.
- No attendance merely from opening a session.
- No athlete edit may mutate the squad's canonical prescription.
- Actual execution date must never overwrite programmed/source date.
- Training load must be based on the individualized delivered prescription, not merely squad attendance.
- Rules may approve only inside known coaching constraints; ambiguous cases go to coach review.
- Local-first persistence and existing evidence/history owners remain authoritative.
