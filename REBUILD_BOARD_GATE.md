# Parser + Board release gate

This rebuild milestone is not a live release.

It is complete only when the same branch head passes:

- all Session Truth regression families;
- all inherited parser/engine regressions;
- Board projection/renderer/density/name/individual-within-team tests;
- exact Board command routing tests;
- protected Board screen session-lock tests;
- Board app integration tests;
- engine-backed poolside action integration tests;
- runtime/poolside integration tests;
- architecture boundary tests.

Required Board action ownership:

- Roll -> Attendance Engine;
- T400 / Times -> Evidence Retrieval + Results/Pathway + Target Engine reads;
- group Edit -> Session Edit + Session Lifecycle;
- swimmer-specific Edit -> Adaptation Engine explicit override;
- Note / Voice / Photo / Video -> Capture Evidence;
- evidence marker -> Capture Evidence retrieval;
- Finish -> Delivered Session.

Board never parses, calculates T400/race-pace, derives modifications, mutates attendance, or finishes a session itself.
