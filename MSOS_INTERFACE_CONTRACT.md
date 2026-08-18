# McLay Swimming OS — Interface Contract

Branch: `rebuild/engine-contracts-v1`
Status: pre-production integration contract

This document locks the everyday coach workflow before the rebuilt engines are assembled into the live app. It deliberately keeps the familiar v3-style operating model while removing the old competing implementation owners underneath it.

## 1. Primary owner workflow

For the owner/coach, **Calendar is the normal home/navigation surface**.

The primary path is:

`Calendar -> Date -> Scheduled session occurrence -> Board -> poolside action -> Back to that date`

The app must not make a long mixed past/present/future session dropdown the primary way to find work. A compact current-session indicator may exist, but Calendar remains the authoritative navigation surface for session history and future work.

There is no separate "Past" navigation concept required for ordinary session retrieval. Historical sessions remain on their real calendar date.

## 2. Calendar month view

The month view shows dates, not duplicated workout bodies.

A date may indicate:
- no training;
- one scheduled occurrence;
- several occurrences on the same day;
- meet/event activity;
- finished versus still-to-run session state.

Tapping a date opens that date. It does not silently select or launch a different session.

The month view may highlight today and dates containing sessions, but it must remain compact enough to navigate one-handed on a phone.

## 3. Day view

The day view lists the actual occurrences on that date in clock order.

Each occurrence card shows only the information needed to identify it:
- AM/PM or clock window;
- squad(s);
- venue;
- course when known;
- session state: unentered / draft / ready / live / finished;
- meet/event name when the occurrence is an event.

If several squads are explicitly linked to one shared occurrence, the day view shows **one session card**, with squad timing underneath it rather than several unrelated copies.

Example:

`Tuesday AM · AquaGym · SCM`

- `National 05:20-07:20`
- `Development 05:30-07:00 · joins +10 min`

This remains one canonical workout occurrence.

## 4. Multiple squads and staggered starts

Different squad start/end times are schedule truth, not separate workout trees.

For a shared occurrence:
- Session Schedule owns each squad's slot and offset;
- Session Truth owns one canonical workout;
- Session Lifecycle owns one accepted/revised session document;
- Adaptation may later use a squad's schedule entry context when a different start requires different delivered work;
- Board displays the resulting context but does not calculate it.

The Schedule engine exposes `startOffsetMinutes` and `endBeforeLatestMinutes`. Those are context only. It must never delete the opening ten minutes, generate a second workout, or guess which lines a later-starting squad should miss.

Any actual different delivered prescription is an explicit adaptation/session-delivery decision built from the canonical workout plus schedule context.

## 5. Add Session from Calendar

`+ Add session` should normally be launched from a selected date/occurrence, not from a blank global form.

The selected occurrence preloads and locks known context:
- date;
- AM/PM;
- participating squad(s);
- each squad's start/end time;
- venue;
- course;
- schedule occurrence ID;
- target meet / programme context when available through Plan.

The coach should then see the simple intake question:

**How do you want to enter this session?**

- Paste / Type
- Voice / Transcribe
- Photo of written session

Unknown/unpublished sessions can still be added through an explicit Custom Session path, but custom identity must never be silently substituted for a published slot.

## 6. Session creation ownership

The intended creation chain is:

`Calendar Surface -> Session Schedule -> occurrence identity -> Session Lifecycle draft -> Session Truth parse/validate -> Session Lifecycle accept -> bind canonical session ID back to schedule occurrence`

Important consequences:
- the Calendar does not parse workouts;
- Session Truth does not choose dates/times/squads;
- Session Lifecycle does not infer a calendar slot;
- the app shell does not write schedule or swimming truth directly.

## 7. Board entry

Tapping a ready/live occurrence opens the Board for the exact bound canonical session ID.

Board header/context should make the current truth obvious without taking over the screen:
- date / AM-PM;
- squad group;
- venue/course where relevant;
- staggered-start cue only where it changes poolside use.

Example compact cue:

`National 05:20 · Development 05:30 (+10)`

The Board itself remains the compact command/display surface already protected by rebuild tests.

## 8. Back behavior

Android/browser Back must traverse MSOS history before leaving the app.

Normal examples:
- Board -> that date's Day view;
- Day view -> Calendar month;
- swimmer/session detail -> previous MSOS surface;
- modal/editor -> close modal/editor;
- only from the root Calendar with no internal history should Back be allowed to leave the PWA/browser context.

Background sync/hydration/resume must never rewrite this navigation stack.

## 9. Persistence and return later

A scheduled occurrence remains findable on its date indefinitely.

If a session is:
- drafted: reopening the date returns the draft;
- accepted: reopening opens the same canonical session;
- live-edited: reopening shows the latest canonical revision;
- finished: reopening shows delivered truth/history rather than creating a fresh session;
- superseded: history remains explicit and navigable.

Creating a later session must not overwrite an earlier date's occurrence or selected session.

## 10. Calendar versus programme planning

Calendar answers **when/where/who is training**.

Programme Plan answers **why that training exists in the season/week**.

They interact through stable IDs/contracts but remain separate owners. Calendar must not reverse-engineer physiological purpose from session text, and Plan must not move a session to another time slot.

## 11. Meets on the calendar

Meet/event occurrences can sit on Calendar dates alongside training.

A meet occurrence opens Meet Deck / meet workflow, not a fake training session. Authorable event slots may carry a linked warm-up/training session when explicitly created, but meet race truth remains owned by Meet Lifecycle.

## 12. Role-specific home behavior

The v3-familiar owner workflow does not force every role to use the same home screen.

- **Owner/coach:** Calendar-first normal navigation, with Board one tap from the selected occurrence.
- **Assistant coach:** assigned current/day sessions first; Calendar may be filtered to assigned squads/sessions only.
- **TV/group display:** Board projection only; no authoring navigation.
- **Individual swimmer:** own current/upcoming session and pathway/meet information; no other swimmers' calendar truth.

Roles & Permissions remains the authority for what each surface can read/write.

## 13. Interface non-negotiables

1. Familiar v3-style practical navigation takes priority over novelty.
2. Calendar is the ordinary source of past, present and future session navigation.
3. A date tap never launches an unrelated session.
4. A shared multi-squad workout is one canonical session occurrence.
5. Different squad times are visible without duplicating the workout.
6. Add Session inherits selected calendar context automatically.
7. No giant form before the coach chooses Paste/Type, Voice or Photo.
8. No long session selector as the primary history/navigation UI.
9. No hidden background process may change selected date, occurrence, session, swimmer, view or scroll.
10. Back works like a normal Android/web app.
11. Finished sessions remain on the calendar and reopen exactly as delivered/saved.
12. Presentation surfaces do not own swimming logic.

## 14. Deployment acceptance for this workflow

Before this interface can be called deployment-ready, rendered phone testing must prove at minimum:

- month -> date -> occurrence -> Board -> Back -> same date;
- National 05:20 + Development 05:30 shared occurrence displays as one workout with correct +10 context;
- Add Session from that occurrence inherits both squad timings without manual re-entry;
- creating the next day's session cannot replace the previous day's session;
- finishing and reopening preserves canonical blocks, edits, attendance, captures and delivered truth;
- screen off/background/foreground returns to the same date/session/Board and scroll context;
- Android Back never unexpectedly closes the app while internal history exists;
- offline Calendar and already-loaded sessions remain usable;
- assistant/swimmer/TV role restrictions remain enforced;
- all existing Parser, Board, poolside, measurement, meet, performance and architecture CI gates remain green on the exact candidate head.

This contract is intentionally more specific than a visual mock-up. The final shell may be styled/refined, but changing these workflow rules requires an explicit contract change and acceptance update rather than ad-hoc interface tinkering.
