# Developing MSOS

Short orientation for anyone (person or AI) picking up the code. Read
`CLAUDE.md` first — it is the product + architecture handover and takes
precedence over anything here.

## Layout

- No build step. `index.html` loads `config.js`, `seed.js`, `app.js`, then the
  engine layer (`engines/*.js`) and the transitional wrappers (`v4-correct.js`,
  `v4-poolside-core.js`) as plain `<script defer>` in a fixed order. The order
  matters — several engines wrap functions defined earlier.
- `morning-board.html` and `swimmer-portal.html` are separate entry points with
  their own small script sets.
- The service worker (`sw.js`) precaches the exact shipping file list. Its
  `BUILD` / `CACHE` strings, `VERSION.txt` and `engines/release-authority.js`
  must all agree (`tests/release-package.test.js` proves it).

## Running the tests locally

Node ≥ 22.

```bash
# pure-Node tests (fast, no browser)
for t in tests/*.cjs tests/*.test.js architecture/*.test.js pilot/*.test.js; do
  node "$t" || echo "FAIL $t"
done

# browser tests (need Playwright + Chromium + a static server)
npm install --no-save playwright@1.55.0 && npx playwright install chromium
python3 -m http.server 8765 &
MSOS4_TEST_URL=http://127.0.0.1:8765/ node tests/fpa-runner.cjs   # Final Product Acceptance
```

A browser test is any file that `require`s `playwright`. `tests/fpa-runner.cjs`
runs the whole acceptance journey, reports every failure, and only gates on the
`REQUIRED` set — the `DEFERRED` set (`docs/KNOWN_DEFERRED.md`) still runs and
reports but does not block.

On Windows, `.gitattributes` forces LF checkout; if you see a test choke on
`\r`, your Git predates `.gitattributes` support — set `core.autocrlf false` and
re-checkout.

## CI

12 workflows in `.github/workflows/`. The ones that gate a merge:

| Workflow | What it protects |
|---|---|
| `full-guardian.yml` | session truth, the V4 Guardian, engine regressions, the SISC meet browser test, architecture regression, release-package integrity |
| `architecture-foundation.yml` | `architecture/authority-audit.test.js` + `architecture/ownership-net.test.js` (frozen writer sets) + the architecture contract/runtime tests |
| `engine-acceptance.yml` | the coaching regression fixtures (parser, modification, T400, Saturday truth, pathway, board evidence, …) |
| `coherent-runtime-release.yml` | runtime generation contract + repeated-round parser truth |
| `final-product-acceptance.yml` | `tests/fpa-runner.cjs` |

## The one rule

Fix the **owner** of a behaviour, never add a second thing that masks the first
(`CLAUDE.md` §2.1, §15). Before editing a file, confirm it is the runtime owner
of what you are changing — `index.html`'s load order plus
`architecture/AUTHORITY_MAP.md` and `architecture/WRITER_MAP_FINDINGS.md` tell
you who owns what. `architecture/ownership-net.test.js` freezes the tracked
writer sets: if your change adds or removes a writer of a protected state, that
test fails on purpose — update its list in the same commit and say why.
