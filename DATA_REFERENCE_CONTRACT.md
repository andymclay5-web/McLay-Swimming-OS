# MSOS v4 — Commercial data & reference contract

## Product rule
Anything MSOS relies on to make, explain or report a coaching decision should, where practical, be createable, importable, updateable, versioned and auditable from inside MSOS without a software release.

The Data Registry owns intake, validation, version activation, provenance and routing only. It does **not** become the owner of swimming truth. After validation it routes data to the specialist engine that owns that domain.

## Update workflow
All organisation-wide updates follow:

`Add / Import → Detect owner → Preview → Validate → Match / review → Commit → Activate version → Invalidate affected derived caches → Recalculate reports/views`

A file or pasted/manual row never becomes active merely because it was selected. A preview must identify the data type, specialist owner, row count, required-field failures and duplicate keys before commit.

## Versioned reference truth
Reference data is replaceable; historical athlete evidence is not.

Examples:
- PB/result time stays the recorded result.
- a new World Aquatics base-time table changes the WA score calculated for that result;
- a new national qualifying-time set changes the swimmer's current pathway/gap report;
- a new meet QT set changes meet qualification reporting;
- a new season/weekly plan changes current planning context without rewriting sessions already delivered.

Previous reference versions stay recoverable. Activating an older version changes current calculations again without deleting newer or older datasets.

## Current data routes
| Data | Specialist owner | Update behaviour |
|---|---|---|
| World Aquatics base times / points | WA Points + Performance | versioned replacement; recalculates WA ranks, #1 event, #1 stroke, #1F and dependent reports |
| Meet/PB results | Evidence + Performance | upsert evidence; refreshes PB/ranking/pathway/reports |
| Team Manager result files | Evidence + Performance | parse/match/upsert |
| Swimmer/profile information | Athlete Profile | upsert/match |
| Test-set definitions | Testing / Timing | upsert definitions |
| T400/test results | Evidence / Testing | upsert evidence; refreshes matching anchors/targets/reports |
| National/pathway standards | Pathway | versioned replacement; recalculates pathway gaps/reports |
| Meet qualifying times | Pathway + Meet | versioned replacement; recalculates qualification/reporting |
| Calendar | Calendar | versioned replacement |
| Season plan | Planning / Methodology | versioned replacement |
| Weekly plan | Planning / Methodology | versioned replacement |
| Meet schedule/programme | Meet | upsert canonical meet truth |
| Meet entries | Meet | upsert entry truth |
| Live/official meet results | Meet + Evidence + Performance | preserve meet result then promote valid result evidence into performance/pathway |

## World Aquatics points
MSOS owns the points calculation. The active WA base-time dataset is the replaceable reference.

`P = floor(1000 × (B / T)^3)`

The active base-time version is used consistently across Performance, Race Pace, Pathway and Reporting. Imported/stored point numbers are fallback/audit evidence when no valid active base-time match exists; they are not allowed to silently outrank a current active base-time calculation.

The build includes the official active World Aquatics base-time set current on 20 Aug 2026 as a fallback reference. A future table imported and activated in Data & References supersedes that fallback without a code change.

## Reporting fan-out
Reporting is a query/aggregation engine. It owns no swimming formula. It requests fields from the engines that own them.

A reference activation must invalidate only affected derived caches and then allow all dependent reports to regenerate from the new active reference. Example: activating new national QTs changes every matching swimmer's Pathway target/gap and squad/swimmer reports; activating a new WA table recalculates every matching PB's points and therefore can change #1 event/stroke/#1F and reports.

## Poolside performance boundary
Reference loading, report rebuilding and data administration may not block Board navigation or a Times tap.

Board target interaction is local-first and progressive:
- target panels open immediately;
- target cards may fill in small animation-frame batches;
- expensive target work may prewarm in browser idle time;
- background evidence/reference hydration may refresh Performance, Reports, Tests or Data views, but must not force a Board rerender or reset Board scroll/session context.

## Commercial protections
Organisation-wide Data & References administration is an owner/admin action. Swimmer and assistant surfaces must not expose activation/import controls.

For a commercial hosted deployment, client role checks are UX only. Server-side organisation isolation/RLS must enforce the same boundary for cloud datasets, reference versions, athlete evidence and imports before production cutover.

Every persisted import/version needs organisation identity, source/provenance, imported-by identity where available, imported-at timestamp, version/effective dates, active/superseded status and deterministic/idempotent row identity.

No imported reference is allowed to overwrite historical evidence merely because a column name is similar. Domain routing occurs before mutation.

## Release acceptance
A commercial-ready release is blocked if:
- Board/Times/navigation wait on reference hydration or full-state persistence;
- an active reference version cannot be identified;
- WA point ranking mixes incompatible table versions in one current ranking;
- new QTs/standards do not fan out into Pathway and Reporting;
- PB-less swimmers receive invented #1 rankings;
- PB-backed swimmers are reported as having no PB merely because a reference table is missing;
- an import bypasses preview/validation/version/provenance;
- role or organisation isolation is only cosmetic in the production cloud layer.
