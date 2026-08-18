# MSOS Poolside Engine Acceptance Boundary

This document defines what must be true before the rebuilt poolside engine chain may replace any live MSOS owner.

## The chain

`Session Truth -> Session Lifecycle -> Attendance -> Evidence Retrieval -> Targets + Adaptation -> Board Projection -> Capture Evidence`

Results / Performance Pathway consumes Evidence Retrieval in parallel and is available to Times / Swimmer projections.

## Required behaviours

1. Natural coaching language becomes one canonical session once.
2. Session Truth alone owns interpretation and distance.
3. Accepted session truth never reparses itself on boot/resume/parser-version change.
4. Drafts remain drafts until explicit Create.
5. Attendance is exact session + athlete + explicit status; prior-session status never leaks.
6. Evidence Retrieval is read-only and preserves provenance across current/legacy/reference sources.
7. Current aerobic targets use latest valid like-for-like T400 evidence.
8. Race pace uses PB / conversion / loaded race models; unsupported precision returns Target needed.
9. Adaptation order is constraint -> stimulus -> inclusion -> pattern -> pool geometry -> volume.
10. Canonical group work is never replaced by an athlete-derived copy.
11. Board only projects canonical work and engine outputs; it contains no parser, T400 or adaptation formulas.
12. Missing target/adaptation data remains visible and cannot take down canonical group work.
13. Note/voice/photo/video evidence keeps exact session/block/item/athlete identity.
14. Engine boot/load paths are read-only unless an explicit coach action writes.
15. No domain engine owns DOM, localStorage/IndexedDB, network, or another engine implementation.

## Protected live-session fixture

Tuesday 18 Aug 2026 AM:
- Warm-up 1,200m
- Pre-set 600m
- Main set 2,600m
- Post-set 800m
- Warm-down 200m
- Total 5,400m

The integration gate must also prove:
- McKenzie 400 continuous -> 300m in SCM;
- McKenzie 6 x 100 Development -> 4 x 100;
- McKenzie 4 x 100 IM Descend 1-4 remains 4 x 100;
- McKenzie 2 x 100 Build/Fast remains 2 x 100;
- Molly's current loaded T400 can produce Development targets;
- post-set 16 x 50 remains one parent with two 8 x 50 phases;
- phase #4 + #8 @ 100 Pace survives to target projection;
- an attached coach capture survives with exact board-point identity;
- close/reopen retains 5,400m, selected session and exact Roll unchanged.

## Release rule

A green engine branch is not a live-phone acceptance. Integration into a new composition root happens on the rebuild branch first. Live `main` changes only after the rebuilt owner passes rendered-phone and poolside acceptance gates.
