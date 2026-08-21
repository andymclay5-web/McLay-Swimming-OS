# Eyes-Up Data Schema Contract

This is the target logical schema. It can initially live in local state/IndexedDB and be replicated to cloud tables later.

## `msos_events`

Append-only live facts.

Fields:
- id
- occurred_at
- session_id
- actor_id
- actor_role
- event_type
- block_id nullable
- item_id nullable
- athlete_ids array
- payload json
- source (`coach_touch`, `coach_voice`, `system_action`, `meet`, `athlete_device`)
- device_id
- local_sequence
- synced_at nullable

No event should be edited to change history. Corrections are new events referencing superseded event IDs.

## `context_anchors`

Can be represented as `msos_events` of type `context_anchor`; separate table/view only if performance requires it.

Fields:
- event_id
- block_id
- item_id
- rep
- round
- confidence_at_capture
- anchor_source

## `raw_evidence`

Immutable evidence envelope.

Fields:
- id
- created_at
- author_id
- source
- evidence_type
- session_id
- block_id
- item_id
- rep nullable
- athlete_ids
- media_id nullable
- raw_text nullable
- metrics json
- audience json
- consent json
- integrity_hash nullable

## `evidence_transcripts`

Derived, replaceable without mutating raw evidence.

Fields:
- id
- evidence_id
- created_at
- engine
- engine_version
- language
- transcript_text
- confidence
- segments json
- supersedes nullable

## `evidence_interpretations`

Derived coaching/AI analysis.

Fields:
- id
- evidence_ids
- created_at
- engine
- engine_version
- interpretation_kind
- claims json
- carry_forward json
- confidence
- supersedes nullable

Claims must carry evidence IDs when materialized into reports.

## `delivery_messages`

One message object, multiple delivery projections.

Fields:
- id
- created_at
- author_id
- athlete_ids / group_ids
- text nullable
- audio_evidence_id nullable
- delivery_preference_snapshot json
- audience
- expires_at nullable
- delivered_at nullable
- acknowledged_at nullable

## `remote_session_runs`

References canonical truth rather than copying it.

Fields:
- id
- canonical_session_id
- athlete_id
- projection_version
- created_at
- started_at
- finished_at
- status
- device_id
- source_item_ids
- local_event_cursor
- synced_at nullable

## `report_snapshots`

Materialized reports generated from canonical event/evidence inputs.

Fields:
- id
- scope_type (`session`, `week`, `block`, `season`, `athlete`)
- scope_id
- generated_at
- source_event_cursor
- source_evidence_cursor
- factual_payload json
- interpretation_ids
- status

A report snapshot can be regenerated; it is not the source of raw truth.

## `usage_ledger`

Variable-cost feature usage.

Fields:
- id
- account_id
- occurred_at
- capability
- provider
- model nullable
- units
- unit_type
- estimated_cost nullable
- actual_cost nullable
- session_id nullable
- metadata json

## Athlete delivery preferences

May remain on athlete profile or move to `athlete_delivery_preferences`.

Fields:
- athlete_id
- text_enabled
- audio_first
- large_text
- simplified_view
- haptic_enabled
- consent_profile_id

## Conflict rules

- Raw evidence and events are append-only.
- Canonical session edits use existing live-edit/branch rules.
- Derived transcript/interpretation conflicts resolve by explicit supersession/version, not destructive overwrite.
- Remote athlete events merge by stable event ID/local sequence; they do not replace the coach's canonical authored plan.
