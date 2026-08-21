# Immediate implementation queue — voice-first / eyes-up MSOS

## Now / next release-safe foundations
- Load and Guardian-test context/timeline engine.
- Load deterministic voice command router.
- Expose one-tap Talk prototype where browser speech recognition exists; keep unavailable state explicit where not supported.
- Capture defaults to zero swimmers unless invoked from explicit swimmer/group context.
- Swimmer quick view exposes all deduped PBs, not an arbitrary subset.
- Restore Rainbow `Overload to Threshold` as a two-phase prescription.
- Restore Short Course Race Planning Calculator / John Pike-style non-dive race-pace model rather than PB ÷ distance.
- Modified 2-rep Desc sets become `1 Build / 1 Fast` when source Desc had 3+ steps.

## Next UI layer
- Swimmer TV Board: NOW / NEXT, SELF CLOCK / COACH TIME, grouped target bands.
- Equivalence grouping for modified swimmers: group identical delivered prescriptions, branch only the differences.
- One-tap swimmer deck card: all PBs, event rankings, gaps, opportunities, recent evidence.
- Current block expanded; completed/future blocks compacted.

## Native Android voice bridge
- Coaching Mode foreground service armed deliberately at session start.
- Bluetooth headset / earbud button input.
- On-device speech recognition where supported.
- Native TTS into private earbud output.
- Raw audio saved locally first.
- Native bridge hands transcript + device events into `MSOS4.voiceRouterAV.routeTranscript()`.

## Later intelligence
- Video + spoken commentary as one evidence package.
- Athlete/coach conversation capture and transcript.
- Automatic evidence synthesis at Finish Session.
- Session → week → block → season reporting rollup.
- Remote swimmer delivery from same canonical session.
- Audio-first delivery preference for swimmers who need it.
- Usage-metered AI/commercial tiers.
