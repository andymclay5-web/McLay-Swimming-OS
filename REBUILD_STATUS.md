# McLay Swimming OS — Rebuild Status

Branch: `rebuild/engine-contracts-v1`

This branch is isolated from the live GitHub Pages app. A green rebuild engine here does **not** mean the live phone app has changed.

## Engine 1 — Session Truth

Status: **LOCKED BEHIND REGRESSION GATES**

Version: `4.0.4`

Session Truth is the only owner of workout semantics and distance. Board, Targets, Adaptation, Attendance and UI code are forbidden from reparsing the workout or inventing competing distance rules.

Protected corpus currently includes:
- 17 Aug 2026 live 4,650m session;
- 18 Aug 2026 Tuesday 5,400m session;
- historical controlled spoken 3,700m session;
- verified historical 5,700m session;
- Friday 7 Aug protected 4,740m canonical structure;
- Tuesday 11 Aug protected compact-lingo / numeric-cue cases;
- Friday 14 Aug delivered 4,220m structure;
- 22 Jul 4,700m authored R1 / R2 / R3 variants;
- 23 Jul 3,660m implicit opening work + three authored round variants;
- natural out-of-order spoken session language canonicalised into coaching block order while retaining source order;
- spoken cardinal distances such as `four hundred choice` and repetition language such as `six hundreds`;
- `X2`, `Repeat x2`, `repeat that three times`;
- local/nested rounds;
- parent composition and repeating patterns;
- one-pass child phases;
- rep-specific race pace such as `#4 + #8 @ 100 Pace`;
- `#1` primary-stroke notation versus explicit `Rep #1` disambiguation;
- summary lines such as `12 x 50 Total` contributing zero metres;
- 12.5m and 15m genuine runnable work;
- `175 MSC / 25 Max` and compact `175 msc-25 max` internal composition;
- numeric coaching cues that must not become phantom distance;
- zero-runnable text rejection;
- stable canonical IDs for unchanged logical input;
- written-total mismatch rejection;
- original source retained as immutable evidence.

Parser changes now require a failing regression fixture first. Do not reopen Session Truth casually while working on Board/UI.

Still on recovery ledger:
- exact raw source wording for protected Saturday 15 Aug 5,450m session. Its validated block invariant is 1,100 / 850 / 2,900 / 600 = 5,450m; do not invent a fake raw transcript.

## Engine 2 — Session Lifecycle

Status: **ISOLATED GREEN**

Version: `1.0.0`

Protected behaviours:
- boot/load is read-only;
- saved selected session survives reload unchanged;
- stale/restored drafts cannot become authoritative or hijack selection;
- Create from draft is explicit;
- same session ID cannot be silently recreated;
- replacement is explicit and journalled;
- first accepted original plan remains immutable;
- live/current edits are revisioned and journalled;
- ordinary edits cannot change session identity;
- identity changes require an explicit identity transaction;
- parser/raw-source differences on later boot never regenerate stored canonical truth;
- unrelated attendance data is preserved byte-for-byte;
- selecting another session is explicit;
- superseding a session preserves its history.

## Board v2 — current focus

Status: **INTEGRATION / RELEASE GATE IN PROGRESS — NOT LIVE**

Projection version: `2.1.0`
Renderer version: `1.2.0`
Controller version: `1.1.0`
Schema: `msos.board.v2`

Mechanical ownership:
- **Projection** reads canonical Session Truth + exact-session Attendance + Target + Adaptation + optional Capture Evidence.
- **Renderer** converts the projection to compact poolside HTML only.
- **Controller** converts exact `data-session-id + data-block-id + data-item-id` taps into commands for injected owners only.
- Board has no parser, no aerobic formula, no adaptation formula, no storage/network ownership and no cross-engine file imports.
- Session Truth distance functions are injected at the composition root; Board never calculates metres independently.

Current protected Board behaviours:
- whole canonical session remains visible with zero attendance;
- shared work appears once;
- round groups stay grouped rather than exploding into repeated rows;
- composition, pattern and phases remain nested under their parent set;
- only genuine swimmer differences create modification cards;
- modified swimmer targets stay with modified work and are excluded from shared target rows;
- modified phase targets stay with the modified athlete;
- missing targets remain visible and are never fabricated;
- exact-session present / modified / late swimmers only;
- absent or stale-session swimmers do not leak onto Board;
- progressive unique swimmer identifiers (`AMc`, `AMa`, etc.);
- evidence markers retain exact session/block/item context;
- sticky poolside actions expose Roll, T400 / Times, Capture, Voice, Photo, Video and Finish;
- Edit / Note actions carry exact stable context;
- generated rep-pattern expansion is suppressed when it would duplicate the compact authored pattern;
- adapted work rewrites stale raw distance/repetition prefixes so a `400 Pull -> 300` modification displays `300 Pull`, not `400 Pull`;
- Target/Adaptation failures are contained and cannot replace canonical group work;
- projection is read-only across session, attendance, evidence and capture state;
- phone CSS stacks modified work under the matching group set while desktop keeps the side rail.

Current Board release gate now includes:
1. architecture boundary tests;
2. full Session Truth family;
3. Targets / Adaptation / Attendance dependencies;
4. complete `board*.test.js` family;
5. Capture Evidence regression;
6. 5,400m poolside integration flow;
7. Runtime integration including reload/edit/finish.

`main` and the live GitHub Pages app remain untouched.
