# MSOS Runtime Architecture Audit — 9 September 2026

Status: audit complete
Scope: current `main` (HEAD `65115e5`, "fix: make startup session and Times evidence local-first"), independently re-verified against the 9 September 2026 coach handover note's specific list of live symptoms. Cross-referenced against `architecture/WRITER_MAP_FINDINGS.md` (3-4 Sept audit) and `architecture/AUTHORITY_MAP.md` (23 Aug), both of which are now stale relative to this document — see §7.

Method: six parallel deep-dives, each covering one live symptom or audit dimension, each required to ground findings in actual current code (not the prior audit's line numbers, which have shifted) and to reproduce by execution wherever feasible rather than by inspection alone. Two of the findings below (§1, §2) were confirmed by running the real, unmodified engine files against constructed fixtures.

**The headline answer to the question this audit was commissioned to answer:** consolidate, do not rebuild. See §6.

---

## 1. Session-identity crossover ("morning content becomes tonight's content, morning notes remain attached") — ROOT CAUSE FOUND, REPRODUCED

**Not** a background-repair or navigation bug (the class the 3-4 Sept audit was built to find and mostly fixed). It lives in the one place workout text is actually authored: the "Add session" intake modal in `v4-poolside-core.js`, via a single global localStorage draft key:

```js
v4-poolside-core.js:17   const DRAFT_KEY='mclay_swimming_os_v4_poolside_draft_e';
```

The draft is scoped only by **calendar date**, not by slot/dayPart/session id. Sequence: coach opens "Add session" in the morning, types AM text (autosaved every keystroke); abandons the modal without clicking Create (only `create.onclick` clears the draft — closing the modal does not). That evening, opening "Add session" again for tonight: the dropdown first correctly defaults to PM, then is **immediately and unconditionally overwritten back to the stale AM slot and AM text** because `draft.date===today` still matches. The coach visibly corrects the dropdown to PM — a normal action — but `slot.onchange` never clears the textarea, so it still holds the morning's text. Clicking Create builds a session whose `identity` (date/AM-PM/venue/squads) is tonight's but whose `blocks`/`metadata.sessionNotes` are the morning's — exactly the reported symptom.

**Confirmed by execution**: a Node harness requiring the real, unmodified `app.js`, `engines/parser-semantics.js`, `v4-correct.js`, `v4-poolside-core.js` through a minimal fake DOM reproduced a session created with `identity.dayPart='PM'` and the morning's `sessionNotes` intact.

A second, compounding issue in the same code path: `create.onclick` unconditionally clears any existing attendance rows whose `session_id` matches the new session's deterministic slot-hash id — meaning reopening "Add session" for a slot that already has Roll data silently wipes it.

This bug predates both the 3-4 Sept audit and the 103 commits since (introduced 17 Aug, commit `c4b193c`) — outside the scope either was built to catch, since it's an intake-time bug, not a background-write bug.

**Fix**: key the draft by slot id (or the deterministic session id), not by date alone; clear the textarea whenever `slot.onchange` fires with a draft/slot mismatch. **Regression test**: seed `localStorage` with a same-day AM draft, open the modal for PM, assert the textarea is empty/flagged rather than pre-filled with the AM text.

---

## 2. Modified swimmer shows unchanged mainstream target — ROOT CAUSE FOUND, REPRODUCED

**The single most product-critical finding in this audit.** `engines/coordinator.js` has two different functions that both claim to compute "the target for this item for this athlete," and only one of them applies the modification:

- `prescription()` — calls `Modification.adaptItem()` first, computes the target off the **adapted** item. Correct.
- `targetForItem()` — resolves stroke only, computes off the **original, unmodified** item. **Never calls `adaptItem`.**

`targetForItem` — not `prescription` — is what the live Board's Times panel actually calls (`engines/board-state.js`'s `targetCard`/`ensureTargetJob`, plus a second, dead copy in `engines/board.js`). Any modified swimmer whose adaptation changes reps/distance/cycle/rest (not just stroke) gets the mainstream number on the Times panel.

**Reproduced by execution**: Charlotte Murphy (ratio 0.5), item `1 x 400 Freestyle Race Pace`.
- `Modification.adaptItem` correctly halves it to `1 x 200` (322.9s → target for the *correct* halved distance is 161.5s).
- `Coordinator.targetForItem(session, <original 400 item>, athlete, state)` → **322.9s — the mainstream number.**
- `Coordinator.prescription(...)` (adapts internally) → **161.5s — correct.**

A second, likely more common contributor: for short quality/race-pace work, `adaptItem`'s `commonSafe` branch is *designed* to make zero structural change (correctly protecting the stimulus, per the coach's own modification philosophy). The evidence of that deliberate decision — `adaptationReason`, e.g. "common interval preserves short quality stimulus" — is computed but **never rendered anywhere on the live Board**. A coach has no way to tell "correctly protected, no change needed" apart from "the modification pipeline silently did nothing." Given the coach's own complaint is exactly this ambiguity, this is very likely part of what's actually being seen, not just the `targetForItem` bug in isolation.

**Fix**: make the Times panel call `prescription()` (or make `targetForItem` call `adaptItem` first, matching `prescription`'s own order) — one call-site-level fix, not a rearchitecture. Render `adaptationReason` on modified rows so "protected" is visibly distinct from "broken." **Regression test**: the Charlotte fixture above, asserting the Times-panel code path returns the adapted target, not the mainstream one.

---

## 3. Twenty-second target latency — ROOT CAUSE FOUND

`engines/board-state.js`'s `raceEvidencePending(item)` gates all target rendering on **cloud** roster-sync status:

```js
if(M.engineBridge&&!M.engineBridge.hydrated)return true;
const s=M.engineBridge?.pbRosterSync?.status||'idle';
return s==='running'||(s==='idle'&&!!M.engineBridge?.canAttemptCloudRead?.());
```

It never checks whether usable local evidence already exists — the check `engines/bridge.js`'s own `whenRaceEvidenceReady()` correctly makes elsewhere via `localPbReferenceCount()`. So even with PB/T400 already loaded locally, if the roster hasn't synced with Supabase yet this session, the board blocks target rendering until that network round trip (including a token refresh) completes — the reported 20-second stall on a slow poolside connection. This directly inverts the stated policy ("deterministic answers from already-loaded data should be immediate; cloud enrichment can be later").

**Fix**: check `localPbReferenceCount()` (or equivalent) first; only block on cloud sync when there is genuinely no usable local evidence at all.

---

## 4. Board taskbar flash/disappear + phone-zoom instability

**Flash/disappear — plausible mechanism, not yet browser-confirmed.** `.bottom-nav`/`.sticky-actions` are unconditionally rebuilt by `UI.configureRoleChrome()` every time `UI.renderCurrent()` runs — and on a single boot, `renderCurrent()` is now called independently from at least four places that complete at different times (the startup-gate ready-promise callback, which calls it *before* `activateView` — the reverse of the normal `N.show()` order; `M.boot()`'s own direct call; the `cloud.pullEvidence().then()` callback; `stability-identity-bh.js`'s `afterHydrate` raf). Each rebuild re-decides button visibility from whatever role/permission state has settled *at that instant*. If those settle at different times, the bar can visibly change shape 2-4 times in the first second or two — matching "appears to load/expand then disappear." Not yet reproduced in a browser; the fix (make chrome-configuring renders idempotent against a single post-hydration state, and restore `activateView`-then-`renderCurrent` ordering everywhere) is independent of and does not require confirming the exact flash mechanism first.

**Phone-zoom — confirmed, structural.** `.sticky-actions`/`.bottom-nav` are `position:fixed` with hardcoded pixel offsets; there is no `visualViewport` handling, no `--vh` custom property, and no `resize` listener anywhere in the repo, and the viewport meta tag doesn't disable pinch-zoom. This is the standard setup for Android Chrome's known `position:fixed`-detaches-under-pinch-zoom behavior. Also found in passing: `v4-correct.css`'s mobile media query sets `.sticky-actions{z-index:40}`, below `.bottom-nav`'s `z-index:49` — a latent stacking bug that could let the nav bar occlude Capture/Edit/Finish under the right reflow conditions.

The Sept 7 Meet-chrome fix (`b535fc1`, `clearMeetChrome()` in `navigation.js`) is confirmed intact and unregressed — but it only ever covered one CSS class; it doesn't touch either bug above.

**Fix**: add `visualViewport`-based positioning (or a `--vh` custom property recalculated on resize) for the sticky bars; fix the z-index inversion; coordinate the render-order race in §4's first half.

---

## 5. Finish / Capture / typing / video

PR #135 (`3664bae`…`65115e5`) states its own scope as startup session-selection and boot evidence deferral only, and that check held — none of the four Finish/Capture/typing/video symptoms below are touched by it, so none should be expected fixed by it, and none are.

- **Finish delay — not reproduced; the call path is already correctly local-first.** Traced Finish end to end: local save (`Store.putSession`/`Store.save`) is synchronous and unconditional; the only network call (`C.flush`) is wired solely to a manual "Activate cloud" button, never to Finish. If Finish is still slow on the phone, the cause is elsewhere (most likely the same chrome-render race in §4, or a slow full-board re-render), not a network wait in the Finish path itself.
- **Typing latency — a real, current mechanism found, though possibly not the one the coach means.** The Finish-review modal's textareas call `M.store.save(M.state)` — a full-app-state serialize and IndexedDB write — on every keystroke, debounced only 40ms (far shorter than typing cadence, so it doesn't coalesce). The plain Capture note textarea has no `oninput` handler at all, so if the coach's complaint is about Capture specifically rather than the Finish-review screen, this doesn't yet explain it — worth confirming which screen he means before fixing.
- **Capture defaulting to all swimmers — confirmed, exact line.** The sticky Capture button calls `M.actions.openCapture({type:'note'})` with no athlete filter; `openCapture`'s default-selection logic falls back to every present/modified athlete when no explicit list is given.
- **Video load / stuck overlay — partially explained.** The full video Blob is read out of IndexedDB in one `objectStore.get` before anything renders (no streaming) — plausible cause of the ~45s stall on a large clip. No custom overlay code exists anywhere in the repo for either video-rendering site (both use bare native `<video controls>`); the stuck-overlay symptom is most likely a native browser control-repaint quirk from injecting the `<video>` element via `innerHTML`, not an app bug — needs a real device session to pin down further.

---

## 6. Parser fidelity — both reported bugs found, reproduced, and are genuine new edge cases (not regressions)

Both live in the same real parser (`app.js`'s `parseBlock`, wrapped by `engines/parser-semantics.js` — the only wrapper actually loaded; a second wrapper, `engines/parser-natural-structure-cw.js`, exists in the repo but is not referenced by `index.html` and is dead).

**"300/200/100/5/3" loses structure.** `attachPostCues`'s composition-merge heuristic (built for the legitimate case of "500 = 300 Free + 200 inline breakdown") merges any smaller trailing number into the prior set's `composition` whenever the numbers happen to sum exactly — with no requirement that they were actually meant as a sub-breakdown. Fed a genuine descending ladder (300, 200, 100 as three separate swims), 200+100 coincidentally equals 300, so the heuristic false-triggers and swallows both as if they were inside the 300. The trailing single-digit "5"/"3" match no numeric pattern and fall through as meaningless orphan cue text. Reproduced: total parses as 300m with everything after it either absorbed or turned into orphan cues, instead of a real ≥600m ladder.

**Free text disappears unless bracketed — same mechanism, not a separate profile field.** Checked and ruled out: this is not athlete-profile-note handling; there is no bracket-gating logic anywhere outside the workout parser. Any coach remark that happens to start with a 2-4 digit number and doesn't exactly sum-match the previous set's distance becomes an orphaned `kind:'component'` node — and `engines/board.js`'s renderer has no case for `'component'`, falling through to a bare `return''`, so the remark is silently invisible. Wrapping the same remark in parentheses avoids the numeric-anchored regex entirely, routing it to `cues` instead, which **does** render — exactly matching "disappears unless in brackets."

Existing parser test coverage (all passing on HEAD) covers nested rounds, `on45`-style intervals, descending 1-N, `#1`/`#1F`, Odd/Even, and the *intended* composition-merge case — but nothing tests a standalone descending ladder whose later numbers coincidentally sum to an earlier one, nor a numeric-led remark that fails the sum-match. Both are genuine previously-uncovered edge cases, not regressions of previously-working behavior.

**Fix**: tighten `attachPostCues`'s merge heuristic to require an explicit adjacency/marker signal, not bare numeric coincidence; give `board.js`'s node renderer a visible fallback for any node kind it doesn't specifically handle, so no authored line can ever silently vanish.

---

## 7. Codebase health: dead weight, churn, and documentation currency

**Dead weight is real but low-risk, not a crisis.** 80 of 149 non-test `.js` files under root/`engines`/`architecture` are actually loaded by `index.html` (54%). Of the 69 not loaded: 4 belong to the two sibling HTML shells (accounted for, not dead); 21 `architecture/*-core.js` files are dead in the runtime but each has its own dedicated test requiring it directly — per the 3-4 Sept audit's own precedent, these read as deliberately-kept tested APIs, not landmines, and should not be deleted; the remaining ~44 (`v4-deck-emergency/final/hotfix/recovery.js`, the five `v4-thursday-*` files, ~15 `engines/release-guardian-*` alphabetic-suffix files, and a handful of other scattered dead engines) are genuinely orphaned with zero references anywhere and zero dedicated tests — safe to delete outright. The 15-deep `release-guardian-*` chain is the clearest concrete example of the "append-only generation" pattern the product owner named as a worry — worth a dedicated cleanup pass, though it currently carries zero runtime risk since none of it loads.

**The PR #133/#134 revert is genuinely clean.** Diffed current HEAD against the exact restore-target commit for all four files the revert touched (`swimmer-invite-bn.js`/`.css`, `swimmer-portal.html`/`.js`) — byte-identical. No drift back in since. A later, legitimate fix (`79a3352`) some may worry re-introduced part of the reverted feature actually predates the revert entirely and is baked identically into both sides.

**The commit-churn pattern is real, and worth naming plainly.** Of the 103 commits since the 3-4 Sept audit, 54 — over half — were spent building a swimmer-portal QR/preview feature across roughly four hours on 7 September, then discarding it wholesale in a single revert. That is exactly the "build fast, thrash, revert whole" pattern the product owner is worried about, and it is real, not a false alarm. The other ~49 commits look like ordinary, healthy small-batch fix/test/ci iteration on Training/Board/Meet subsystems. The revert itself was executed cleanly (see above) — so the pattern cost real time and effort but did not leave lasting damage. It's a sequencing/discipline lesson, not evidence the architecture itself is unsound.

**All three governing documents are stale.** `AUTHORITY_MAP.md` (last touched 4 Sept) is 112 commits behind HEAD; `WRITER_MAP_FINDINGS.md` and `CLAUDE.md` (last touched 6 Sept) are 93 commits behind. None mention the revert, PR #135, or this audit. They should be refreshed before being trusted as the basis for further consolidation work.

---

## 8. The consolidate-vs-rebuild recommendation

**Consolidate. Do not rebuild the operational core.**

The case for this, plainly:

The ownership model itself — the thing a rebuild would exist to fix — is not fragmented in the way the product owner feared. The 3-4 September audit did real, substantive consolidation work (single canonical-session owner, single navigation owner, the force-navigate-on-background-render bug fixed in its primary location, dead duplicate code removed, a real regression-test net built around every fix), and this audit independently re-verified that work held under 103 more commits of real subsequent development without regressing. That is exactly the evidence you'd want before trusting an architecture to consolidate further: it already survived a stress test.

Every new, product-critical bug this audit found — the AM/PM draft-key crossover, the modified-swimmer target bug, the 20-second latency gate, the Capture default-selection, the parser sum-match heuristic — is a narrow, single- or two-location logic bug inside an otherwise correctly-owned function, not a case of two different subsystems fighting over the same state. `coordinator.js` is not disputed between owners; it simply contains two functions that should agree and don't. `board-state.js`'s latency gate is not fighting another gate; it's checking the wrong signal. These are the kind of bugs any codebase of this size accumulates, and they are each fixable in isolation, with a regression test proving the specific coaching failure they caused, in the same style the 3-4 September audit already used successfully six times running.

The dead-weight and churn findings are real but do not change this conclusion. Dead files carry zero risk while unloaded, and a rebuild would not avoid re-accumulating some version of the same thing — the 3-4 Sept audit's own address to the wrapper-count problem (a self-enforcing regression test that dynamically discovers every writer of a given property and asserts a single final one) is a better long-term defense against renewed fragmentation than a rewrite would be, since it makes future drift fail CI rather than relying on a fresh codebase staying clean by virtue of being fresh.

The one real caution the churn finding supports: discipline in sequencing. Fifty-four commits spent building and then discarding a feature in one sitting is a warning against reaching for the next exciting surface (the swimmer portal) before the current one (the Board) is dependable — which is precisely the priority order the product owner already set for himself in the handover note. This audit's own findings make the case for following that order, not for abandoning the codebase that order is meant to stabilize.

---

## 9. Concrete sequence

**Phase 1 — fix the confirmed, product-critical Board bugs (highest coaching impact first):**
1. Modified-swimmer mainstream-target bug (§2) — make the Times panel call `prescription()`, not `targetForItem()`, or make `targetForItem` adapt first. Render `adaptationReason` on modified rows.
2. AM/PM session-crossover via the stale intake draft key (§1) — key by slot/session id, clear on slot mismatch.
3. Twenty-second target latency (§3) — gate on local evidence availability first, cloud second.
4. Capture default-selection (§5) — stop defaulting to every present athlete.

Each of these gets its own regression test reproducing the actual reported failure, per this repo's established practice.

**Phase 2 — Board stability/UX:**
5. Startup chrome-render race (§4) — single authoritative post-hydration chrome render, consistent `activateView`-then-`renderCurrent` ordering.
6. Sticky-bar phone-zoom detachment + the sticky/nav z-index inversion (§4).
7. Finish-review typing latency (§5) — confirm with the coach whether this or plain Capture-note typing is the one he's hitting, then lengthen/scope the autosave debounce accordingly.

**Phase 3 — parser fidelity (§6):**
8. Tighten the composition sum-match heuristic to require an explicit signal, not numeric coincidence.
9. Give the Board's node renderer a visible fallback for unrecognized node kinds so no authored line can silently disappear.

**Phase 4 — cleanup, alongside or after 1-3, lower urgency:**
10. Delete the confirmed-dead `v4-deck-*`/`v4-thursday-*` files and evaluate the 15-deep `release-guardian-*` chain for pruning.
11. Resolve the third, drifted ratio table (`app.js:329` — confirmed to now have wrong values and a missing athlete, live only by load-order accident) — fix or delete now, while it's understood, rather than leaving it as a landmine for the next reorder.
12. Refresh `AUTHORITY_MAP.md`, `WRITER_MAP_FINDINGS.md`, and `CLAUDE.md` to reflect the current post-revert, post-#135 state.

**Phase 5 — only once Phase 1-2 are verified dependable on the real phone:** proceed to the TV/swimmer-facing projection work, continuing to use Matthew as the pilot but keeping the architecture generic per the handover note's own instruction — not before, and not as a way to avoid the less exciting Board-reliability work.
