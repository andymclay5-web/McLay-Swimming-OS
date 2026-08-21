# McLay Swimming OS — Eyes-Up Architecture Blueprint

Date: 22 August 2026
Status: architecture contract; implementation can be staged without replacing the stable v4 runtime.

## 1. Product north star

MSOS exists to increase the amount and quality of coaching, not to increase the amount of software operation.

Protected interaction order:

**Eyes up first → voice first → swimmer Board second → phone touch only when necessary.**

Protected system rule:

**MSOS should know enough about where the coach is that the coach mostly tells it what happened, not where to file it.**

The architecture must preserve the existing product principles:

- Fast.
- Stable.
- Reliable.
- Adaptable.
- Always learning.
- Individual within the team.
- Coach-authored truth is never silently overwritten.
- Local-first poolside operation.
- Cloud is replication, not the source of live truth.
- Original plan remains immutable.
- Delivered work is recorded separately from intended work.
- No fake targets, fake classifications or invented evidence.

## 2. The system is one truth with many projections

Do not build separate mini-products for Coach Board, TV, swimmer phone, remote athlete, Meet or reporting. They are projections over shared canonical truth.

Canonical domains:

1. Athlete identity and profile.
2. Season / phase / weekly plan.
3. Canonical authored session.
4. Live delivered-session event stream.
5. Current context hypothesis.
6. Performance evidence and PB/pathway data.
7. Raw coaching evidence.
8. Derived transcripts and interpretations.
9. Meet programme and race evidence.
10. Reports and carry-forward actions.

Projection surfaces:

- Coach phone.
- Private coach earbud.
- Swimmer-facing TV Board.
- Individual swimmer device.
- Remote swimmer session runner.
- Assistant-coach device.
- Meet Deck.
- Reports / Coach Hub.

A projection may hide, group, simplify or reformat truth. It must not create a competing source of truth.

## 3. Architectural layers

### Layer A — Canonical Truth

Owns sessions, athletes, attendance, PBs, pathways, performance data, modifications and delivered edits.

No voice, UI or AI layer is allowed to mutate original-plan truth directly.

### Layer B — Event Ledger

Every meaningful live action becomes an append-only event:

- session_started
- context_anchor
- item_started
- rep_observed
- item_completed
- live_edit
- branch_created
- attendance_changed
- evidence_captured
- target_spot_checked
- swimmer_message_sent
- tv_projection_changed
- session_finished

This is the missing bridge between "the session plan" and "what actually happened".

The event ledger provides recovery, audit, reporting and context re-anchoring.

### Layer C — Context Engine

Maintains MSOS's best current hypothesis of where the coach is.

Truth hierarchy:

1. Explicit coach / meet anchor.
2. Direct MSOS action or delivered evidence.
3. Estimated timeline.

The timeline is advisory only.

A Context Frame contains:

- session_id
- block_id
- item_id
- rep / round when known
- planned start/end
- actual drift
- source
- confidence
- timestamp

Context can be re-anchored through touch or voice:

- "Starting Main Set."
- "We're on number four."
- "Next set."
- Board Next action.
- Finish-here action.
- Meet event/heat anchor.

The system never hides uncertainty. Low-confidence context stays low confidence until re-anchored.

### Layer D — Interaction / Command Router

Voice is an input surface, not the intelligence engine itself.

Pipeline:

`audio → transcript → deterministic parser → context binding → capability check → action/query → destination`

Deterministic first:

- swimmer names
- PB queries
- pathway queries
- current targets
- current session/block/set
- rep times
- stroke rate
- HR
- RPE
- context anchors
- open capture/video
- show known media
- next set/block
- athlete message

AI fallback only for genuinely ambiguous or interpretive language.

Private-by-default output rule:

- Answers go to private earbud/coach phone by default.
- Public TV output requires an explicit TV/Board/Screen destination.
- Athlete-device delivery requires an explicit athlete message action or a preconfigured delivery rule.

Examples:

- "Henry 100 Fly PB" → private deterministic query.
- "Henry's targets for this set" → private deterministic query using current context.
- "Henry fourth 50 34.2 stroke rate 56" → local evidence capture.
- "TV Henry last freestyle video" → deliberate public media projection.
- "Ruby message, keep the hips up coming off the wall" → athlete-device delivery.

### Layer E — Evidence Ledger

Raw evidence is immutable.

Raw objects:

- note
- voice
- conversation
- video
- photo
- timed observation
- athlete reflection

A raw evidence object contains context at capture time, not merely a file.

Derived records are separate:

- transcript
- extracted metrics
- interpretation
- coaching theme
- carry-forward action
- later AI analysis

A later better interpretation supersedes an older interpretation; it never rewrites the recording or original transcript.

This protects scientific usefulness, coach trust and future model upgrades.

### Layer F — Projection Engine

Creates surface-appropriate views from canonical truth.

#### TV / swimmer Board

The Board answers:

- What are we doing now?
- What is next?
- Is this SELF CLOCK or COACH TIME?
- What is my target / rest / send-off?
- Is my prescription different from the group?

It should aggressively group equivalent prescriptions.

If McKenzie and Ruby have identical delivered work, show them together. If Amber differs only in one option, branch only that difference.

Fingerprint the actual prescription, not merely the athlete identity.

#### Coach phone

Current block is expanded. Completed and future blocks are compact.

Swimmer tap opens an instant deck card with:

- all valid PBs
- course-aware event dedupe
- best events by WA/para metric
- next meaningful gap for every event
- opportunities
- recent relevant evidence

#### Individual / remote athlete

A swimmer receives the same canonical session transformed through their own target/modification layer.

Absence does not create new programming work.

A separate workout branch is created only when the coach deliberately prescribes different work.

### Layer G — Delivery Router

Routes information to the correct surface:

- private_earbud
- private_phone
- tv
- athlete_device
- group_device
- assistant_device
- report_only

Delivery preferences belong to the athlete profile.

Examples:

- text-first
- audio-first
- larger text
- reduced clutter
- haptic cue

Ruby's audio-first message is therefore not a separate special product. It is a delivery preference over the same evidence/message object.

### Layer H — Reporting / Learning Pipeline

Capture once, roll upward automatically:

`session → week → block → season → athlete record → coach report`

Finish Session creates a factual report immediately from delivered events and evidence.

Interpretive summaries are an additional layer, never a prerequisite for the factual report.

Possible outputs:

- attendance and delivered metres
- modified-delivery summary
- timing-mode distribution
- performance evidence captured
- athlete voice/reflections
- technical themes supported by evidence
- programme deviations
- context drift / schedule variance
- carry-forward actions
- unresolved evidence requiring coach review

Weekly/block reports consume session reports rather than re-reading raw data from scratch every time.

### Layer I — AI Orchestrator

AI must be optional and metered.

Local/free path handles ordinary poolside operation.

AI is justified for:

- ambiguous command interpretation
- long conversation transcription where device transcription is insufficient
- evidence summarisation
- cross-session trend analysis
- semantic coaching search
- video/audio analysis when supported and useful
- report synthesis

The orchestrator owns:

- feature entitlement
- model selection
- budget
- queue priority
- retry policy
- privacy/redaction policy
- cached derived output
- usage ledger

No UI surface directly calls a paid model.

## 4. Session Timeline and Context

### Planned timeline

Generated when a session is authored from:

- authored cycle/send-off
- explicit rest
- target/race model when relevant
- realistic final-rep swim time
- block transitions
- configurable coaching/setup allowance

It should provide ranges rather than false precision where inputs are uncertain.

Example:

- 06:41–06:50 3 × 200 Development
- 06:51–06:57 3 × 100 IM Desc
- 06:58–07:11 4 × 150 OL → THR

### Live re-anchoring

If Main Set actually begins at 06:49, that single anchor shifts the advisory timeline after it.

If the coach later says "starting 100 Build", that newer anchor becomes more authoritative.

The system can show:

`Main Set · +6 min · 94%`

without pretending that 94% is fact.

### Meet timeline

Same engine, different rows:

programme → event → heat → lane/race.

Meet schedule changes and explicit event/heat anchors reflow future estimates. The meet clock never overrides a confirmed race result or coach anchor.

## 5. Timing Ownership

Timing ownership is a first-class property of a prescription.

### SELF CLOCK

Default for:

- Regeneration
- Development
- Overload
- Threshold
- most steady aerobic work

The target engine may calculate to tenths internally, but swimmer presentation should use a practical range / rounded target plus rest.

Purpose: swimmer owns pacing and departure; coach coaches movement and intent.

### COACH TIME

Default for:

- race pace
- max/sprint
- tests
- exact split work
- starts/finishes when timing is part of the objective

The Board groups swimmers into practical timing cohorts when possible without corrupting individual stimulus.

### SHARED

Skill/recovery/other work where neither precise athlete self-timing nor coach timing is necessary.

## 6. Voice / Earbud State Machine

States:

1. OFF
2. COACHING_MODE_ARMED
3. IDLE_LISTEN_READY
4. LISTENING
5. TRANSCRIBING
6. ROUTING
7. CONFIRMING
8. LONG_RECORDING
9. ERROR_RECOVERABLE

Coaching Mode is deliberately armed at session start.

A headset press while armed starts one-shot listening. Another press can stop it. Long recording is explicit (conversation/video commentary), not accidental continuous listening.

Feedback should be minimal:

- short tone: listening
- short success tone/haptic: saved/executed
- error tone + private explanation only when necessary

## 7. Android Native Bridge

The PWA remains the product core. Native Android exists to provide capabilities the web layer cannot reliably provide:

- foreground Coaching Mode service
- Bluetooth/headset media-button handling
- on-device speech recognition where available
- microphone routing
- native text-to-speech
- lock/background survival
- local audio recording
- notification/recording state
- haptics
- deep link into MSOS action/query routes

The bridge hands normalized events/transcripts to the web runtime. It does not own coaching logic.

This preserves one product logic layer across phone, TV and future platforms.

## 8. Remote / Holiday Athlete Architecture

A remote run references:

- canonical_session_id
- athlete_id
- projection_version
- source item IDs
- local completion/evidence ledger

The remote athlete never receives a copied free-standing session as the default. Their screen is a projection of the same canonical session.

On completion, only delivered events/evidence sync back. The original session is unchanged.

This makes Ashburton / holiday / travel use almost free from a programming-work perspective.

## 9. Accessibility as Delivery Preference

Accessibility must live in projection/delivery, not in duplicated workout data.

Athlete preferences may include:

- audio-first coach messages
- text + audio
- large text
- reduced visual density
- simplified current-item view
- haptic notifications

This provides a natural route for swimmers who benefit from audio communication without creating a parallel app.

## 10. Swimmer Performance Quick View

The deck view must answer a real conversation immediately.

Rules:

- show every valid PB, not an arbitrary top-six subset
- dedupe identical event/course evidence by canonical event key
- keep provenance behind the PB
- show LCM/SCM explicitly
- show best event ranking once per event/course
- para classifications are event-correct (S/SB/SM)
- show next meaningful milestone/gap for every event where evidence exists
- keep achieved meets collapsed rather than dominating the pathway

The default question is not "which page is the result on?" It is "what does the coach/swimmer need to know right now?"

## 11. Prescription Equivalence Grouping

Board real estate is protected.

Build an actual prescription fingerprint from:

- reps
- distance
- stroke
- cycle
- rest
- zone/rep pattern
- equipment
- meaningful cues
- target/send-off
- adaptive mode

Group athletes whose fingerprints match.

Then show branches only for differences.

Example:

`McKenzie + Ruby · 6 × 100 Development · SELF CLOCK`

`Amber → same volume, Pull option`

not three full duplicate boxes.

## 12. Data / persistence model

Append-only / immutable where possible:

- msos_events
- context_anchors
- raw_evidence
- evidence_transcripts
- evidence_interpretations
- delivery_messages
- remote_session_runs
- usage_ledger
- report_snapshots

Existing state can be bridged gradually. No destructive migration is required to prove the architecture.

## 13. Recovery and offline model

Poolside writes are local first.

Every write has a stable ID before replication.

Foreground live Board is protected from background pull/hydration repaint.

Voice capture path:

1. raw audio/text saved locally
2. evidence envelope saved locally
3. success confirmation
4. transcription/AI can happen later
5. cloud replication when allowed

A transcription failure must never lose the original recording.

## 14. Commercial capability model

Do not make the core coaching product intentionally weak.

Capabilities can scale by plan:

### Core

- canonical sessions
- Board / TV
- pathway/PBs
- remote athlete projection
- local capture
- deterministic reporting

### Voice

- on-device speech
- earbud bridge
- private TTS
- audio messages
- voice command/control

### Intelligence

- cloud transcription allowance
- semantic interpretation
- automatic evidence synthesis
- advanced reporting
- selected media analysis

### Club AI

- larger usage pools
- multi-coach intelligence
- richer organisational reporting
- advanced media/transcription budgets

Actual names/prices remain commercial decisions. Architecture exposes capabilities and usage; UI should not hardcode pricing.

## 15. Usage economics

Every variable-cost operation writes a usage record:

- capability
- provider/model
- units
- estimated/actual cost where available
- account
- athlete/session context only when needed
- timestamp

This makes margin measurable and allows allowances, hard caps, top-ups or fair-use policies later.

Local deterministic operations have zero AI usage records.

## 16. Safety / privacy / youth recording

Recording must be intentional and visible in system state.

Requirements:

- Coaching Mode is deliberately armed.
- Long conversation recording is explicitly started/stopped.
- clear local recording indicator / notification
- club/guardian consent policy can be represented in athlete profile
- private raw media does not become TV-visible without explicit public route
- athlete-facing evidence respects audience permissions
- assistant role cannot access unrelated athlete evidence
- advertisers / commercial analytics are not part of athlete evidence flow

## 17. Implementation boundaries

### Must remain deterministic/local where practical

- canonical session truth
- modification derivation
- PB/result retrieval
- pathway standards/gaps
- T400/aerobic targets
- race-pace model
- context anchors
- simple command parsing
- timing ownership
- prescription grouping
- local evidence save
- factual report counts

### AI may enrich, never become source truth

- ambiguous natural language
- transcript cleanup
- coaching-theme extraction
- report prose
- longitudinal pattern suggestions
- media interpretation

Any AI-derived claim must retain evidence IDs and confidence/provenance.

## 18. Acceptance gates

### Context

- explicit anchor always outranks timeline
- context survives lock/background/resume
- stale cloud data cannot move current context
- timeline can be corrected without rewriting delivered history

### Voice

- one press → one intentional capture
- named athlete resolves reliably or asks, never guesses between collisions
- default response is private
- public TV requires explicit destination
- raw capture survives transcription/network failure
- no continuous paid API usage while idle

### TV

- NOW/NEXT legible at pool distance
- SELF CLOCK / COACH TIME obvious
- grouped identical prescriptions
- no fake targets
- current information requires no coach handwriting

### Athlete device

- same canonical session
- correct individual projection
- offline-capable
- local completion/evidence syncs later
- accessibility delivery preferences honored

### Reporting

- Finish generates factual report without manual data trawl
- interpretation links back to evidence
- week/block/season rollups consume session truth
- no ungrounded "why" claims

## 19. Migration sequence

1. Keep current v4 accepted behavior stable.
2. Land pure architecture modules and contracts inertly.
3. Connect current Context Engine to event ledger.
4. Add Board NOW/NEXT + timing ownership projection.
5. Add deck swimmer all-PB / gaps projection.
6. Fix capture default context selection.
7. Add web one-shot Talk only as prototype.
8. Build Android Voice Bridge and Coaching Mode.
9. Add athlete-device / remote runner projection.
10. Add evidence-ledger derived transcript/interpretation stores.
11. Make Finish Session materialize factual report automatically.
12. Add AI orchestrator + usage meter only after local paths are proven.
13. Commercialize capabilities without fragmenting canonical truth.

## 20. Architecture test sentence

Every new feature should be challenged with:

**Does this give the coach/swimmer useful intelligence with less interaction, while preserving canonical truth and poolside stability?**

If the answer is no, it does not belong in the main poolside path.
