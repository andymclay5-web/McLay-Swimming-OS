# McLay Swimming OS — Rebuild Status

Branch: `rebuild/engine-contracts-v1`

This branch is isolated from the live GitHub Pages app. A green engine here does **not** mean the live phone app has changed.

## Engine 1 — Session Truth

Status: **ISOLATED GREEN**

Version: `2.2.2`

Protected corpus currently includes:
- 17 Aug 2026 live 4,650m session;
- 18 Aug 2026 Tuesday 5,400m session;
- verified historical 5,700m session;
- reconstructed validated Friday 4,740m canonical structure;
- protected 5,000m compact-lingo / numeric-cue fixture;
- natural out-of-order spoken session language;
- `X2`, `Repeat x2`, `repeat that three times`;
- local/nested rounds;
- parent composition and repeating patterns;
- one-pass child phases;
- rep-specific race pace such as `#4 + #8 @ 100 Pace`;
- `#1 Stroke` disambiguation;
- summary lines such as `12 x 50 Total` contributing zero metres;
- 12.5m and 15m genuine runnable work;
- numeric coaching cues that must not become phantom distance;
- zero-runnable text rejection;
- stable canonical IDs for unchanged logical input.

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

## Current next engine

**Evidence Retrieval** — one verified read interface for athlete identity, T400/test evidence, PB/event history, course-conversion evidence and provenance. Results/Pathway and Targets will consume this engine rather than searching local/legacy/cloud stores themselves.
