# Known deferred acceptance failures

These acceptance tests currently fail and are **deliberately not gating** the
Final Product Acceptance workflow (`tests/fpa-runner.cjs` runs them, reports
them on every CI run, but does not fail the job on them). They are all in the
layered Meet workspace / ops-bridge surface, which the technical handover
(`CLAUDE.md` §2.55, §3.12) puts behind Training stabilisation.

Do **not** delete the tests. Move a name out of the `DEFERRED` map in
`tests/fpa-runner.cjs` the moment its area is genuinely fixed.

| Test | Symptom | Suspected cause |
|---|---|---|
| `meet-sisc-programme-authority-20260827.cjs` | `[data-meet-intake-au]` not visible within 5s after a meet switch | The intake card (`engines/meet-field-au.js`) is not re-rendered when `engines/meet-workspace-cy.js` switches the active meet — several files wrap `M.ui.renderMeet` and the chain does not consistently reach `install()`. |
| `meet-working-card-phone-acceptance-20260827.cjs` | Intermittently: `.ba-intel` is missing the "Voice commentary" action, or `[data-mpo-quick-note]` resolves hidden | The `.ba-intel` the test sees is sometimes `engines/meet-sisc-format-dz.js`'s `emergency()` fallback (no action buttons) rather than `engines/meet-program-ba.js`'s real intel, and `engines/meet-program-ops-bridge.js` injects its quick-note into whichever `.ba-intel` existed first. Render-authority race. |
| `meet-new-meet-phone-acceptance-20260827.cjs` | `waitForFunction` for `managedRows().length===2` times out (30s) | The "add new meet" path in `engines/meet-workspace-cy.js` does not settle — same overlapping-render-authority tangle. |

## Orphan test files (not wired to any workflow)

- `tests/v4-browser-predeploy.test.js` — pre-dates the current release-identity
  and device-Guardian model (hardcodes an old `BUILD` string and expects an
  82-check runtime Guardian; the device Guardian is now a lightweight 4-check
  surface with the 82-check suite in CI only). Its coverage — fresh open,
  session intake, saved T400 on the Board, capture, reload, offline — is now
  carried by `tests/all-inclusive-product-acceptance-20260825.cjs`. Candidate
  for deletion; left in place pending a review decision.

## The real fix

The Meet surface is currently ~14 layered files (`meet-field-au`, `meet-ops-av`,
`meet-board-ay/az`, `meet-program-ba`, `meet-sisc-format-dz`, `meet-aqua-expand-df`,
`meet-program-ops-bridge`, `meet-workspace-cy`, `meet-poolside-de`,
`meet-sunday-simple`, `meet-tomorrow-usable`, …), several of which independently
wrap `M.ui.renderMeet` and mutate `#meetView`. The handover (§4.26) is explicit:
decide the one permanent Meet programme owner, fold the useful behaviour into it,
retire the overlays. These three failures should be fixed as part of that pass,
not by adding another overlay.
