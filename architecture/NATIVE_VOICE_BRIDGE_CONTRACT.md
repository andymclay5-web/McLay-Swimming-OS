# Native Voice Bridge Contract — Android

Status: native boundary contract; coaching logic remains in MSOS web/core.

## Purpose

Provide reliable pocket/earbud interaction without rewriting MSOS natively.

## Native responsibilities

- arm/disarm Coaching Mode foreground service
- receive supported headset/media-button gestures
- choose/maintain Bluetooth microphone route where permitted
- one-shot on-device speech recognition where available
- local raw audio capture
- native TTS to private audio route
- haptic/tone feedback
- survive screen lock/background according to Android foreground-service rules
- publish normalized bridge events to MSOS

## Web/core responsibilities

- athlete resolution
- context resolution
- command interpretation
- PB/pathway/target lookup
- evidence envelope creation
- TV/athlete delivery authorization
- reporting
- AI fallback and cost control

## Proposed plugin API

### Methods from MSOS to native

`startCoachingMode(options)`

Options:
- sessionId
- recognitionLanguage (`en-NZ` default)
- headsetButtonEnabled
- rawAudioRetention
- privateTtsEnabled

Returns current bridge state.

`stopCoachingMode()`

`listenOnce(options)`

Options:
- timeoutMs
- saveRawAudio
- hintPhrases (current swimmer display names, current set vocabulary)

Returns:
- transcript
- confidence when available
- rawAudioId when retained
- startedAt / endedAt
- inputDevice metadata

`speak(text, options)`

Options:
- interruptPolicy
- privateOnly (default true)
- rate

`startLongRecording(options)`

For explicit athlete/coach conversation capture.

`stopLongRecording()`

`haptic(kind)`

Kinds: listening, saved, warning, error.

`getCapabilities()`

Returns feature availability rather than assuming every phone/earbud supports every path.

## Events from native to MSOS

`bridgeState`
- off / armed / listening / transcribing / recording / error

`headsetGesture`
- single_press / double_press / long_press where reliably distinguishable

`speechResult`
- transcript
- confidence
- rawAudioId
- timestamps

`recordingSaved`
- rawAudioId
- duration
- timestamps

`audioRouteChanged`
- device type/name/id

`bridgeError`
- stable error code
- recoverable boolean
- user-safe message

## Gesture proposal

Do not depend on all gestures until hardware testing proves them.

Minimum viable:
- single press: listen once / stop listen
- long recording starts through voice command or phone action initially

Later, if hardware is reliable:
- double press: replay last private answer
- long press: conversation recording

## State and privacy

Coaching Mode must be visible through Android foreground-service notification.

Long recording has a distinct state from one-shot speech recognition.

The bridge must never silently switch a private response to speaker/TV.

Raw audio is local first and may be retained/deleted according to account and consent policy.

## Offline behavior

All essential voice capture remains useful offline:

- on-device recognition if available
- raw audio save
- context binding
- deterministic command execution where data is local
- local evidence save

Cloud transcription / AI is queued and optional.

## Failure behavior

If recognition fails:
- raw audio remains if configured
- MSOS may offer replay/manual attach later
- current Board/context is not changed

If Bluetooth input route disappears:
- notify privately
- fallback to phone mic only if permission/policy allows
- never lose current session context

## Acceptance matrix

Test at minimum:
- app foreground, screen on
- screen off / pocket
- lock then headset press while Coaching Mode already armed
- background/foreground transition
- Bluetooth disconnect/reconnect
- phone call interruption
- no network
- recognition unavailable
- TTS while pool environment is noisy
- multiple first-name collisions in roster

No native bridge release is accepted until it passes the existing Board background/resume stability gate too.
