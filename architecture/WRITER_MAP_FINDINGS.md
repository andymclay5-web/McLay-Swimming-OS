# MSOS Writer Map Findings — Authority Consolidation Audit

Status: audit complete, first pass
Date: 3 September 2026
Scope: all 80 files actually loaded by `index.html` (verified exact match against the live `<script>` tag list), cross-referenced against `architecture/AUTHORITY_MAP.md` (23 Aug 2026).

Method: exhaustive file-by-file trace of every writer to seven protected-state domains (canonical session identity, navigation/view, attendance, prescription/adaptation, evidence/T400/PB, storage/hydration, live-sync + Meet + build identity), classifying each writer as OWNER, ADAPTER/PROJECTION, or ILLEGAL WRITER against the declared owners in `AUTHORITY_MAP.md`. Two of the most severe findings (T400 recency, ratio-as-pace) were additionally confirmed by actually executing the real files with Node, not just reading them.

This document lists every finding, ordered by the handover document's own priority ordering (canonical session → selected-session → storage/hydration → navigation → attendance → adaptation overrides → target/evidence → Meet/Training crossover → build identity → cosmetic debt). Within each section, **live/confirmed bugs affecting real production behavior are listed before dormant/architectural debt.**

---

## Priority summary — the 5 findings that are live, confirmed, and affect real coaching/data outcomes today

These are not architecture debt; they are bugs currently shipping to real users:

1. **`v4-poolside-core.js:159-233,408`** — on every app boot, a hardcoded-constant matcher silently rewrites and re-persists (and cloud-stages) any canonical session matching exact date/squad/total/block-signature values from one specific historical bug (2026-08-15 National AM). Same anti-pattern was already found, fixed, and reverted once before for a different date (git history: `0bb4498`, `d8ef29f`) — this one survived.
2. **`v4-poolside-core.js:361`** (`repairSelected`, runs on every load) — if the parser's repair pass finds a stored session's distance doesn't match its written total, this silently **wipes all attendance rows already taken for that session** and swaps in a different session id as canonical. Real Roll-data-loss risk, no user prompt.
3. **`engines/access-authority.js:8-29`** (`ensure`/`resetOwner`) — re-validated on *every* render, including background/non-click renders. If a swimmer or assistant's role binding looks stale (e.g. a background roster sync lands while they're on the Athletes/Swimmer screen), they get silently bounced to the Board view with no click, no history event, no explanation.
4. **`engines/evidence-index.js:23`** — monkey-patches the owner's T400 selection from "newest valid result wins" to "fastest result wins" (confirmed by running both versions against the same fixture). Corrupts every downstream T400 consumer: aerobic pacing, modification comparisons, performance predictions, the T400-capture "faster/slower than PB" toast — everywhere T400 evidence is used.
5. **`engines/training-prescription-policy.js:30-38`** (`kickCycleSeconds`) — for a modified swimmer on a 50m kick set (other than two specifically hardcoded names), derives that swimmer's send-off/cycle time as `authored_squad_cycle / volumeRatio` — inventing a pace purely from a load ratio, the exact anti-pattern the product spec bans. Runs downstream of and silently overwrites `modification.js`'s real, evidence-based decision for the same field.

A sixth, lower-severity but still-live finding: **Meet nav chrome resurfaces for Assistant/Swimmer roles on Training pages** (`live-training-authority.js`'s one-time DOM removal is undone by `app.js`'s unconditional per-render nav rebuild) — directly contradicts a same-week commit's stated intent.

Recommend tackling in roughly that order — #1/#2 because they silently destroy or rewrite real session/attendance data with no user action, #3 because it's an active UX bug, #4/#5 because they produce silently wrong training prescriptions.

---

## 1. Canonical session writers

**Doc/code mismatch, unrelated to any bug:** `AUTHORITY_MAP.md` names `v4-poolside-core.js` as owner of "Canonical session / parser / live edits." In the real runtime, the actual CRUD implementation (`Store.putSession`, `M.session.*`, `M.changes.*` — the change journal) lives in **`app.js`**, loaded before `v4-poolside-core.js`. `v4-poolside-core.js` wraps the parser and delegates persistence back to `app.js`. Worth fixing the doc regardless of any code change, so future work looks in the right file.

**ILLEGAL WRITERS:**
- **`engines/attendance-roster.js:25-28`** (`addSquad`) — clearest single-file violation. Clones the session, mutates `identity.squads`, pushes a change-journal entry, commits via `M.store.putSession` — full session-editing behavior, done entirely from the Roll UI's "Add squad" action, outside the session-edit surface. If a coach is mid-edit while this fires, the assistant's write silently replaces the whole session entry.
- **`v4-poolside-core.js:159-233`** (`repairKnownSessionTruth`/`repairKnownSavedSessions`) — see priority #1 above. Live, confirmed, runs every boot.
- **`engines/session-repair.js:22`** — a second, independently-written repair/reparse implementation that writes `canonicalSessions[id]` directly, bypassing `Store.putSession`. Confirmed **not called anywhere in the 80-file shipping scope** except a test harness exercising a pure helper on synthetic data — currently dead, but fully wired on `M.sessionRepair` and one call away from becoming a second live session-tree constructor.
- **`engines/live-training-authority.js:29`** (`L.apply`) — installs a whole session object received over cross-device live-sync directly into `canonicalSessions`, no journal entry, no cloud staging. Narrow exposure: gated to `tv`/`swimmer` derived views only, so it can't touch Board's canonical session today — but see §4/§8, it lacks a timestamp/revision check before applying.
- **`v4-poolside-core.js:221-231`** — the owner's own `repairKnownSavedSessions` bypasses this same file's own `Store.putSession` (used elsewhere in the file) and also skips cloud-staging on its "pure semantic repair" branch. Internal inconsistency, not cross-file.

**ADAPTER (uses the sanctioned path, flagged for context):**
- `engines/athlete-session-bd.js:15-16` — real write-implementation for "Athlete/session boundaries," a domain the doc assigns to `architecture/athlete-session-core.js` (which contains zero writes — read-only helpers only). Goes through `Store.putSession`, so not a raw violation, but the doc's ownership line is wrong. Also: `app.js`'s undo only recognizes six known journal-entry types; a boundary journal entry sitting on top would make Undo silently no-op.
- `v4-correct.js:1456-1479` — third wrapper of `M.live.apply`, restores view/session-selection state around a live-sync apply. Defensive, not new content.
- `engines/storage.js:56-64,68` — IndexedDB hydration fill-only backfill of missing sessions. Documented owner of a separate domain, correctly additive.

---

## 2. Selected-session writers

- **`app.js:1034`** (`UI.renderHeader`) — on every header render (including background-triggered ones), if the currently-selected session becomes disallowed for the active role, silently re-points `selectedSessionId` to a different session. Defensible as a permission fail-safe, but it's a background writer with no click behind it — worth a comment/guard so it's clearly intentional.
- **`app.js:852`** (original `N.applyHistory`) — dead code, fully superseded by `engines/navigation.js:29`, but it's the *exact* failure mode the product doc prohibits (Back/Forward selecting a different session) sitting live in source, one load-order change away from resurfacing. `N.state()` (never overwritten, still from `app.js`) continues to embed `sessionId` in every history entry, ready to be misused if `applyHistory` is ever "fixed" the wrong way again.
- **`engines/navigation.js:29`** — current, correct, live implementation. Confirmed it never touches `selectedSessionId`. This is the one to keep.

---

## 3. Storage / hydration

- **`v4-poolside-core.js:159-233,408`** — see priority #1. Also creates a genuine boot-order race: if the repair fires before `storage.js`'s hydration gate is ready, the repair's save is silently dropped as a no-op, then overwritten again when hydration resolves and restores the un-repaired record from IndexedDB — compounding the confusion on top of the underlying violation.
- **`engines/bridge.js:40`** (`deepHydrate`) + **`engines/evidence.js:26`** (`hydrate`) — reads `localStorage`/IndexedDB directly, bypassing `storage.js`'s API, and on merge lets the **stale snapshot's rows win over live in-memory rows** on ID collision — exactly the "late hydration overwrites active state" pattern the product rule bans. Mitigating factor: `deepHydrate` is defined but **never called anywhere in the 80-file scope** today — dormant, but live and exported on `M.engineBridge.deepHydrate`, one call away from firing.
- **`engines/meet-ops-av.js:11,13,14`** (`backup`/`restoreBackup`) — a second, parallel localStorage-only persistence channel for meet operational data, entirely bypassing `storage.js`. Restore is gated to only fill empty state, so overwrite risk is low, but it's unambiguously a second state owner for meet data.
- Lower-severity direct-localStorage writers outside `storage.js`'s declared scope (auth tokens, config, session-creation draft, PB-sync completion flag): `app.js:481-483`, `engines/cloud-session.js:10`, `v4-poolside-core.js:334,337,348,349`, `engines/bridge.js:5,23`. Different domain than operational state — flagging only in case the authority doc is ever tightened to cover all local persistence.

**Confirmed working as designed:** `storage.js`'s `hydrate()` correctly implements "live must outrank stale hydration" via `operationalAlreadyLive()` — merge-only once the app is live, full replace only during genuine cold boot. `startup-gate.js` blocks first paint until hydration resolves. `M.store.save` is defined exactly once and never monkey-patched. `session-repair.js`'s functions are confirmed **not** auto-wired (unlike `v4-poolside-core.js`'s repair) — deliberately de-fanged, consistent with the reverted "Sep 1" pattern.

**Documentation correction:** `AUTHORITY_MAP.md` describes `engines/guardian-runtime.js` as wrapping `M.store.save`. Read in full — it doesn't; it wraps `M.guardian.run` and its only storage interaction is a compliant call into `storage.js`'s own `saveGuardianResult` API. The doc's own remediation note for this file is based on a stale premise.

---

## 4. Navigation / view takeover

- **`engines/access-authority.js:8-29`** — see priority #3. The one confirmed live UX bug in this domain.
- **`engines/stability-identity-bh.js:47-67,91-92`** — same "reset view to board" pattern, wired to hydration completion (`afterHydrate`) and to every render via a `configureRoleChrome` wrap. A second live copy of the same bug class.
- **`engines/guardian-device-state-bj.js:22-46`** — a third, near-identical copy. Confirmed **never called** in the 80-file scope (only a read-only diagnostic from this file is invoked) — currently dead, but three independent copies of identical logic is itself the "no single owner" problem in miniature.
- **`engines/storage.js:23,68`** — genuine async race: `hydrate()` is a real IndexedDB round-trip not awaited by boot; its "am I already live" heuristic can misfire on a fast round-trip, causing a wholesale `M.state` replace (including `settings.view`) after the app is already interactive. Real, not just theoretical — this is the timing mechanism behind findings §1 and §3's interaction.
- **`app.js:1034`** — see §2 above, applies here too (a navigation-relevant background writer).
- **Live-sync chain** (`app.js:737` dead original → `live-training-authority.js:20-37` → `v4-correct.js:1456-1479` wrapper) — net effective behavior is correct today (Board/Roll/Times/Hub fully protected from any incoming broadcast mutation), but depends on load order and guard clauses holding; the dead original remains one reorder away from resurfacing. Separately: no message carries a timestamp/revision check *before* being applied (only after, to bump a counter) — narrow gap where a stale out-of-order broadcast could momentarily un-update a TV/swimmer display.

**Legitimate, confirmed correct today:** `engines/navigation.js` (the live navigation engine — scopes history strictly to view/detail-layer/scroll, never session selection), all explicit-click writers in `board.js`/`board-state.js`/`coach-loop-ui.js`/the meet UI files.

---

## 5. Attendance writers

- **`v4-poolside-core.js:361`** — see priority #2. Real data-loss risk, runs on every load.
- **`v4-poolside-core.js:356`** (`create.onclick`) — same shape (attendance-clear co-located with parse+putSession+selectedSessionId), but on inspection this is benign: a brand-new session legitimately has no roll yet. Flagged for a human to confirm the reading, not acted on.
- **`app.js:762`** — a complete second `UI.renderRoll` implementation with its own inline attendance-write handler, independently written, missing features the real owner has (no note normalization, no roster/squad-add). Currently shadowed/dead because `attendance-roster.js` loads later and unconditionally reassigns `UI.renderRoll` — but it's an accident of script order, not a guard, and becomes live again if load order changes or the owner's top-of-file guard ever fails.
- **`engines/stability-identity-bh.js:20-21`** vs **`engines/guardian-device-state-bj.js:26-27`** — two independently-written, near-identical functions both filtering `attendance` to purge placeholder-athlete rows. Real duplicate-ownership problem for this narrow slice, should be consolidated into `attendance-roster.js`.
- **`v4-correct.js:1426,1443`** — wraps `UI.renderRoll` to run `enforceRoster()` first; discarded by `attendance-roster.js`'s later flat reassignment. Low-risk today (roster hygiene still runs via `renderCurrent`'s own wrap), but any direct `renderRoll()` call bypassing `renderCurrent` skips it — a third file competing for the same hook.

**Owner, confirmed clean:** `engines/attendance-roster.js`'s `setAttendance` is the sole legitimate write path in the normal Roll flow. No file was found writing attendance from inside a function that also reparses the workout or recomputes distance (the specific "Roll write triggers reparse" pattern) — the real risks found run in the reverse direction (session repair destroys attendance), which is arguably worse since it's not gated on any user action at all.

---

## 6. Adaptation / modification override writers

- **`engines/training-prescription-policy.js:30-38`** — see priority #5. Confirmed by execution. Also directly contradicts the owner's own explicit per-athlete rules for the same two swimmers it hardcodes floors for (McKenzie's "keep coach-authored cycle," Charlotte's 130-140 range) — `Math.max(authored, floor)` can silently override both.
- **`v4-correct.js:307-331`** (illegal wrapper of `M.adapt.item`) — confirmed **inert today**: this file loads before `modification.js`/`bridge.js`, so at the moment its guard (`if(M.adapt?.item)`) runs, `M.adapt.item` doesn't exist yet, and the wrapper never installs. This matches `AUTHORITY_MAP.md`'s own existing note about this file. Still a landmine: reorder the scripts or change the guard, and this reactivates as both an illegal wrapper *and* a second ratio-as-pace violation (it has its own hardcoded McKenzie 75m rest-floor).
- **`v4-correct.js:248-271`** (`M.adapt.profile=`) — unguarded, does execute at load, temporarily overwrites the real profile table before `bridge.js` overwrites it again (final, correct) moments later. Net effect harmless today, but there are now **three different ratio tables** in source with three different numbers (`v4-correct.js`, `app.js:329` — dead but undocumented, and `modification.js`) — pure drift risk, worth deleting the two dead copies.
- **Four independent writers of the `adaptationOverrides` array** (coach-requested override rows, not policy — individually legitimate): `app.js:834`, `engines/modification-edit.js:19`, `engines/board.js:49`, `engines/board-state.js:81`. Inconsistent field coverage between them (app.js's editor can't touch cycle/rest/equipment/cues at all), and one **confirmed dual-wiring risk**: `board.js` and `board-state.js` both bind to the same `data-msos-stroke` DOM attribute with independently-coded, near-identical write logic — whichever module's listener attaches last wins, silently.
- Stroke-resolution logic is triplicated (`coordinator.js`, `race-pace.js`, `board.js`) but all three correctly delegate the actual ranking decision to one real function — soft duplication only, no policy violation.

**Owner, confirmed clean:** `engines/modification.js`'s `adaptItem` is never reassigned anywhere in the 80 files. Verified every place it computes a pace/cycle value derives from real T400/PB evidence, never from the raw load ratio directly — it's the clean reference implementation that `training-prescription-policy.js` then violates downstream.

---

## 7. Target / evidence alternate owners

- **`engines/evidence-index.js:23`** — see priority #4. Confirmed by execution.
- **`engines/evidence.js:29`** + **`engines/bridge.js:16`** — the owner's own `t400Rows()` has no course filter at all, and the live wiring (`bridge.js:16`) explicitly accepts and discards a `_course` parameter. SCM and LCM T400 results for the same stroke get silently pooled into one candidate set. Inconsistent with the rest of the codebase, which is otherwise course-aware (PB logic, base-time/points merge keys).
- **`v4-correct.js:337-349`** — dormant (overwritten by `bridge.js:16` at runtime), but a second, independently-maintained "fastest wins" T400 selector with a comment explicitly (and incorrectly) asserting that's the correct behavior. Compounded by a stale self-test in the same file (`guardianContractTests`) that still asserts "T400 uses fastest valid exact-stroke anchor" as expected/passing — it only still passes because its fixture's fastest row happens to also be the newest, so it doesn't actually catch the live bug in `evidence-index.js`.

**Checked, no violation found:** modeled/predicted values (`race-pace.js`'s `modeledAnchor`, `performance.js`'s `modeledEvent`) never get written back into real evidence tables. No silent Freestyle-substitution when a named stroke has no evidence — explicit "missing" status returned instead. `race-pace.js`, `reference-bridge.js`, `reference-authority.js`, `wa-points.js`, `data-registry.js`, `meet-board-ay.js` all confirmed course-aware and compliant.

---

## 8. Meet / Training crossover

- **`engines/live-training-authority.js:13-18`** (`stripMeetChrome`) + **`app.js:1032-1035`** — see priority #6. The one-time DOM removal of the Meet nav button only half-works (the static header button removal sticks; the bottom-nav removal is dead code because that button doesn't exist yet at the time it runs), and `configureRoleChrome()` unconditionally rebuilds `.bottom-nav` from `navConfig()` on every render, which still includes a `meet` entry for Assistant and Swimmer roles. Net effect: the Meet button reappears on Training pages for those two roles from the very first render onward, fully clickable (both roles have meet-view permission by default) — directly contradicting the commit that added `stripMeetChrome` and its own build tag (`...-no-meet-chrome`). Two fixes possible: filter `meet` out of `navConfig()`'s output for these roles, or make the strip run every render instead of once.
- **`engines/meet-ops-av.js`** backup/restore — already covered in §3, also relevant here as a meet-domain-specific storage bypass.

**Checked, no violation found:** none of the 12 `meet-*.js` files write `canonicalSessions`, `selectedSessionId`, `attendance`, or call into `modification.js`'s `adaptItem` — confirmed zero cross-writes. DOM injection correctly scoped to `#meetView`/meet-prefixed selectors, with the one shared touchpoint (`.sticky-actions` relabeling) correctly restoring Training labels on every render (unlike the nav-button bug, this one's "restore every render" approach actually works). Live-sync correctly ignores the Meet view in both directions.

---

## 9. Build / release identity

**`AUTHORITY_MAP.md` already names this an open "consolidation target."** Confirmed the underlying mechanism: **six independent, unguarded writers** of `M.BUILD` in load order — `app.js:5` (bootstrap default) → `v4-correct.js:18-19` → `v4-poolside-core.js:6-7` → `engines/bridge.js:8` → `engines/coach-loop-ui.js:6-9` → `engines/release-authority.js:4-5` (final, intended value). None are "set only if unset" — each blindly overwrites. The app is coherent today purely because `release-authority.js` happens to load last (position 79/80). Concrete, confirmed failure mode: the Connection and Guardian screens both read `M.BUILD` directly at render time; a future script reorder, a new script inserted after `release-authority.js`, or a thrown error in any of the middle five writers would silently roll the displayed build string back to an earlier date — looking exactly like an app rollback with no actual rollback having occurred. Several downstream systems trust `M.BUILD`'s coherence for real gating logic (cloud-write cutover, live-sync cross-tab compatibility, service-worker staleness detection, Guardian's own release-attestation check) — all currently self-consistent, but only by accident of ordering.

**Status: closed 3 September 2026** — see the addendum below ("§9 build-identity consolidation") for what was investigated and the actual fix (an enforced, self-maintaining load-order regression test; no writer removed).

---

## 10. Purely cosmetic / documentation debt

- **`sw.js` vs `index.html` version-string mismatch** for `engines/race-target-intent.js` (`?v=20260901a` in the service worker's precache list vs `?v=20260831c` in `index.html`) — quick fix, low risk but worth closing so the precached asset isn't silently stale.
- **Session-identity ownership doc is wrong** (§1) — should say `app.js`, not `v4-poolside-core.js`, for the real CRUD implementation.
- **`athlete-session-core.js` ownership doc is misleading** (§1) — the file has zero writes; the real boundary-write implementation is `athlete-session-bd.js`, going through `Store.putSession`.
- **`guardian-runtime.js` remediation note is based on a stale premise** (§3) — it doesn't wrap `M.store.save`.
- Dead ratio-table copy at `app.js:329` (superseded twice, never read) — safe to delete.
- Live-sync echo: `v4-correct.js:1476-1477` re-saves after applying a remote message, triggering an avoidable re-broadcast to other tabs. Not a correctness bug, worth cleaning up in the same pass.

---

## Files/domains checked and confirmed clean (no findings)

`engines/modification.js` (owner, verified never reassigned, verified ratio never used as a pace input), `engines/navigation.js` (owner, verified never touches session selection), `engines/attendance-roster.js`'s core write path, `engines/storage.js`'s `hydrate`/`M.store.save` core design, all 12 `meet-*.js` engines' isolation from training state, `race-pace.js`/`reference-bridge.js`/`reference-authority.js`/`wa-points.js`/`data-registry.js` course-awareness, modeled-value/evidence separation across `race-pace.js` and `performance.js`.

---

## Addendum — landmine-removal pass findings (post-fix #6)

Working through §7's "then work down through the dormant-but-live landmines" step surfaced several
corrections to this document's own claims, found only by empirically checking each candidate
against the real script-load order and the existing test suite (not just reading the source) before
touching it. Recorded here so the next pass doesn't repeat the same investigation:

- **`v4-correct.js:307-331` (`M.adapt.item` wrapper) is not inert.** §6 claimed the wrapper's guard
  never passes because `M.adapt.item` doesn't exist yet when this file loads. Verified by execution
  (`require('app.js')` then checking `typeof M.adapt.item`): `app.js:337` sets a real base
  `M.adapt.item` before `v4-correct.js` loads, so the guard passes and the wrapper does install. In
  full production it is still shadowed a few scripts later by `bridge.js`'s final assignment, same
  as `M.adapt.profile` and `M.targets.t400` next to it — but it is not "never installs." Left
  in place: `baseAdaptItem` is real, load-order-dependent working code, not dead weight.
- **`engines/session-repair.js`'s `repairOne`/`repairStored` are deliberately-kept, tested API, not
  a landmine to delete.** `tests/board-evidence-regression.cjs` asserts these functions exist in
  source; `tests/recovered-richer-local-round-repair-20260826.cjs` calls `repairOne` directly and
  asserts it performs a real repair; `tests/operational-authority-root-20260901.cjs` separately
  asserts the file must **not** auto-run. Together these confirm the file's actual, intended
  contract is "correct manual repair tool, never auto-wired" — exactly what §3 already praised as
  "deliberately de-fanged." No change made.
- **`engines/bridge.js`'s `deepHydrate` is deliberately-kept API, not dead code.**
  `tests/bridge-operational-fast-start-20260826.cjs` asserts it exists as a distinct chunk of source
  or the test's own string-slicing logic breaks. It is intentionally excluded from the fast-boot
  path and exposed for on-demand full evidence hydration. No change made.
- **`engines/stability-identity-bh.js`'s `A.role`/`A.setRole` wrapper is unit-tested in isolation**
  (`tests/stability-identity-bh.cjs` requires this file alone, with a minimal `M.access` mock, and
  asserts this wrapper's own validation/throw behavior). It is superseded in the full 80-file stack
  by `engines/access-authority.js` loading later, but deleting it breaks its own dedicated test. Left
  in place.
- **Real, fixed bug found in the same file**: `resetOwner()`/`normalize()` forced `settings.view`
  back to `'board'` unconditionally, including from the `configureRoleChrome` wrap that runs on
  *every* render and from post-hydration `afterHydrate` — the same live "silent background
  navigation" bug already fixed in `access-authority.js` (priority #3), just a second copy. Fixed by
  adding a `navigate` flag, defaulting to `false` for the two background call sites and `true` only
  for the one-time startup repair of confirmed-corrupted role state (the scenario
  `tests/stability-identity-bh.cjs` actually exercises).
- **Genuinely removed as confirmed-dead** (zero call sites in the 80-file shipping scope or in
  `tests/`, verified by grep before deletion): `app.js:762`'s duplicate `UI.renderRoll` and
  `v4-correct.js`'s wrapper of it (both discarded every time by `attendance-roster.js`'s later
  unconditional reassignment), and `engines/guardian-device-state-bj.js`'s `cleanupPlaceholders`
  (a second, always-unused copy of `stability-identity-bh.js`'s live `purgePlaceholders`).
- **Real bug fixed**: `v4-correct.js:337-349`'s own T400 selector had the same "fastest wins"
  defect as priority #4's `evidence-index.js` (this copy is shadowed by `bridge.js` in production,
  but is the version actually exercised by the Guardian test harness, which never loads
  `bridge.js`). Sorted to newest-valid-first to match the real owner, and added a Guardian
  self-test (older-faster vs newer-slower) that the old fixture's coincidental fastest=newest data
  would not have caught.
- **`app.js:329`'s ratio-fallback table is not dead.** §10 called it "superseded twice, never
  read." It is in fact the closure the Guardian-test-path `M.adapt.item` wrapper's `baseAdaptItem`
  actually uses internally for its own reps/distance scaling, independent of whatever
  `M.adapt.profile` currently resolves to — confirmed by tracing the closure, not just usage
  counts. It does contain a stale athlete roster (references athletes no longer on the historical
  fallback list used elsewhere) and is real duplicate-table drift risk exactly as §6 says, but is
  not safe to delete outright without also verifying every Guardian self-test that exercises
  `M.adapt.item`. Left as a follow-up rather than acted on in this pass.

## Addendum — §9 build-identity consolidation (closed 3 September 2026)

Andy asked for the build-identity item to be tackled as its own dedicated pass, deliberately
deferred out of the main landmine-removal pass above. Investigation before any code change:

- **Re-verified the six writers empirically**, not just by re-reading §9's claim. `v4-correct.js`'s
  writer is not actually a "blind overwrite" like the other five — it reads the prior `M.BUILD`
  value into `BASE_BUILD` first and validates it against an `EXPECTED_BASE_BUILD` constant as a
  deliberate base-build lineage check (`C.baseBuild`), which several Guardian self-tests and the
  T400 sort-order self-test both depend on. This writer was correctly left untouched.
- **The other four writers' guard clauses were read individually** (`app.js`, `v4-poolside-core.js`,
  `engines/bridge.js`, `engines/coach-loop-ui.js`) — none depends on another writer's success or
  reads a prior `M.BUILD` value; each is an independent, unconditional overwrite exactly as §9
  describes. `engines/release-authority.js`'s own guard is `if(!M)return;` — trivial, and provably
  independent of every other writer (proved by loading it in Node against a bare
  `global.MSOS4={}` with no prior state at all: it still produces a fully self-consistent
  `M.BUILD`/`M.RELEASE_ATTESTATION`/`M.releaseAuthority`).
- **`<script defer>` tags execute independently of one another** — confirmed this means a thrown
  error in one of the middle five writers does *not* stop later scripts (including
  `release-authority.js`) from running. So §9's "thrown error in any of the middle five writers"
  failure mode is already largely mitigated by ordering alone today; the real, live risk is the
  other half of §9's sentence — a future script reorder, or a new file inserted after
  `release-authority.js` that also stamps `.BUILD` — since nothing enforced "release-authority.js
  loads last" beyond it happening to sit at script position 79 of 80.
- **Checked whether the various `engines/release-guardian-*.js` and `v4-thursday-*.js` files that
  also write `M.RELEASE_ATTESTATION`** (surfaced by a repo-wide grep) are shipped: none are —
  confirmed via `grep -o` against every `<script src>` in `index.html`, and separately confirmed
  that `tests/release-package.test.js` already asserts several of them (`release-guardian-bg.js`,
  `release-guardian-bj.js`, `release-guardian-bl.js`, `privacy-hardening-bk.js`) are *not* loaded.
  `engines/release-guardian-bl.js` does still have its own dedicated isolation test
  (`tests/guardian-current-runtime-bl.cjs`) exercising it directly — left alone, out of scope, not
  touched.
- **Decided against removing any of the five overwrite-writers.** Given the actual risk is ordering
  rather than a mid-chain exception, and this session's own repeated experience that "looks like a
  landmine" writers often turn out to have real, tested dependents, removing writers whose full
  blast radius wasn't characterised was judged higher-risk than the problem being solved.
- **Fix actually made: `tests/build-identity-final-writer-order-20260903.cjs`**, a new,
  dependency-free Node regression test. It (a) parses `index.html`'s real script order and
  dynamically discovers every shipped file that assigns `.BUILD` (no hardcoded writer list, so a
  future writer is picked up automatically), and asserts `engines/release-authority.js` is the
  last one — proven to actually catch a reorder via a negative-control run (script tags swapped in
  memory, confirmed the assertion fails with the actual offending file named); and (b) proves
  `release-authority.js`'s write has no dependency on any prior writer's state. `AUTHORITY_MAP.md`'s
  "consolidation target" row and note were updated to record this as closed. Full local suite
  (58 Node-executable test files, Playwright/browser-server acceptance tests excluded — see below)
  green before and after.
- **Note on the Playwright/browser acceptance suite** (`tests/final-product-acceptance-20260825.cjs`,
  `tests/all-inclusive-product-acceptance-20260825.cjs`, `tests/v4-browser-predeploy.test.js`, and
  others requiring a live server + Chromium): these already hardcode stale expected `BUILD` strings
  (e.g. `'v4-final-acceptance-20260825a'`, `'v4-poolside-core-20260819f-targettruth'`) that predate
  `engines/release-authority.js`'s current `'v4-race-pace-shorthand-targets-20260901a'`, and
  `CLAUDE.md`'s own handover notes record Final Product Acceptance already blocked on an unrelated
  SISC persistence failure. This drift pre-dates this pass, is unrelated to build-identity
  consolidation, and was not touched — flagged here rather than silently left unmentioned.

## Recommended order of work

Per `AUTHORITY_MAP.md`'s own change-gate ("every consolidation PR should reduce or hold the wrapper count, never increase it") and its stated repair philosophy (establish full picture, identify intended ownership, then repair one owner at a time):

1. Remove `v4-poolside-core.js`'s hardcoded-constant session rewrite (§1, priority #1) — this is actively mutating specific real historical data on every boot with no user consent.
2. Review and likely remove/guard `repairSelected`'s attendance-wipe-on-mismatch behavior (§1/§5, priority #2) — real data-loss risk.
3. Fix `access-authority.js`'s `ensure()`/`resetOwner()` to not force-navigate away from the current view on background/non-click renders (§4, priority #3).
4. Fix `evidence-index.js`'s T400 sort back to newest-valid (§7, priority #4) — this is corrupting every T400-based target in the app.
5. Remove or fix `training-prescription-policy.js`'s `kickCycleSeconds` ratio-derived pace floor (§6, priority #5).
6. Fix the Meet-nav-button resurfacing for Assistant/Swimmer roles (§8, priority #6) — small, contained fix.
7. Then work down through the dormant-but-live landmines (§1 session-repair.js, §6 v4-correct.js's inert wrapper, §7 v4-correct.js's inert T400 selector, §3 bridge.js's deepHydrate) — none are firing today, but each is one load-order change away from becoming live, and removing them (per the change-gate's "reduce wrapper count") closes that risk permanently rather than leaving it to luck.
8. Build-identity consolidation (§9) and the documentation corrections (§10) can follow once the live bugs are closed.
