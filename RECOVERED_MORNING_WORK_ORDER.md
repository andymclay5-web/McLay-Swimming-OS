# McLay Swimming OS — Recovered Morning Work Order

## The central requirement
Build one continuous coaching operating loop, not a collection of disconnected features:

**Season plan = direction → weekly plan = intention → session plan = action → session log = evidence → weekly review = learning → next week = response.**

The dashboard must show that progression clearly and must not rely on chat or memory as the permanent record.

## Phone Coach Mode
Only five primary jobs should be visible poolside:

1. Board
2. Attendance
3. Capture
4. Athletes
5. Finish session

The phone should show brief, immediate answers. The desktop should hold planning depth, editing, history and analysis.

## Session delivery
- Paste a session from chat and turn it into a dashboard session.
- Keep the complete original workout text.
- Detect individual sets and allow a set to be pulled directly into Run Live.
- Show the current system, technical cue, carry-forward from the previous session and lead-in to the next session.
- Attendance rule: not marked means absent; only tap Here or Modified.
- Build athlete-specific and para adaptations before the main group starts, not late on deck.

## Finish-session workflow
Ask four fast questions:

1. What went well?
2. What needs reinforcing?
3. Any athlete-specific notes?
4. What carries into the next session?

Then capture the evidence needed to make the week real:
- planned versus actual distance
- actual duration
- energy-system distribution
- kick / pull / swim distribution
- stroke exposure
- attendance
- modifications
- athlete response
- race splits and other measured evidence

## Weekly progression and review
The dashboard should make the sequence and evidence visible, not just store sessions.

Current flow recovered from the discussion:
- Wednesday PM: aerobic capacity / stroke ownership
- Thursday AM: threshold pressure, transferring the previous evening's movement quality into pressure
- Friday: ANC / starts
- Saturday: all-zone rainbow work
- continue reinforcing alignment, turns, transitions and race execution

The review should immediately show what is missing rather than pretending the evidence is complete.

## Programme rules that must not be lost
- National Squad carries the fullest weekly structure.
- Development moves to six sessions per week from next month and should not simply mirror National.
- Intermediate needs stroke introduction/development, skills and endurance, speed and stroke reinforcement, rainbow work and competitive-performance training.
- Confirm season dates, athlete DOBs and primary events rather than inferring them.

## Athlete quick-answer layer
Build profiles only from confirmed information. The coach should be able to answer poolside:
- next meet and likely events
- PBs
- qualifying standards and the gap to them
- relevant club, regional, national or age-group records
- current plan focus
- technical focus
- planned adaptations
- latest notes, timed sets and race splits

Coach-only now, with a clean path to athlete/parent/other-coach access later. Private coach notes must remain separate.

## Meet and result work still to load from confirmed sources
The morning discussion included upcoming meet and swimmer-event work around:
- NZSS
- Swim Timaru
- North Canterbury Ribbon Meet
- South Island Short Course Championships in Dunedin
- New Zealand Short Course qualifying opportunities
- Awatea Calman's event/qualifying opportunities
- William Callow and Matthew Callow performance, finals/medal context and record comparisons
- confirmed AquaGym results for the wider roster

Do not invent missing results, standards, rankings, ages or records. Mark unconfirmed items clearly and attach a source/date when loaded.

## Live timing direction
The live board belongs inside the session/set workflow:
- master repeating cycle
- two or three timing channels
- same or independent lane intervals
- 5-second or 10-second wave gaps
- second, third and fourth waves
- lap splits and total times
- results saved against the athlete and source set
- stroke-rate mode as a later measured feature

## Version 1.5 delivered
- five-item phone Coach Mode
- attendance defaults to absent
- structured set detection and Run Live buttons
- plan thread: previous carry-forward, today's purpose, next lead-in
- dedicated Finish Session workflow
- weekly evidence and missing-data display
- coach-owned athlete profile fields
- Supabase migration for the new structured evidence/profile fields

## Next data work after the build is stable
1. Load confirmed DOBs and primary events.
2. Load confirmed PBs and course/date/source.
3. Load current qualifying standards and calculate gaps.
4. Load relevant records with source/date.
5. Load upcoming meets, entries and event opportunities.
6. Complete current-week actual-session evidence and weekly review.
7. Add richer set-to-plan links and stroke-rate timing after real deck testing.
