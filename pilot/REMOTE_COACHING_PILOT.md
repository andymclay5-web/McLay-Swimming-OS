# MSOS Remote Coaching Pilot

## Pilot athletes

Matthew Robertson and Molly McKernan are AquaGym swimmers based in Ashburton. They are the first confirmed remote-coaching pilot athletes.

Occasional visiting swimmers from Ashburton are not remote-coaching athletes by default and must never be auto-enrolled or granted portal access by location, club association, or name similarity.

## Product hypothesis

MSOS can let a swimmer remain part of the same coaching programme when they cannot train physically with the squad. Remote coaching should be a projection of the same canonical coaching truth, not a second programme the coach has to maintain.

Core rule:

> Absence should not create extra programming work for the coach.

A remote athlete should receive their own prescribed version of the planned session, including valid adaptations, targets, send-offs, race-pace work, cues, and pathway context. Opening a remote session must never fabricate attendance or completed training.

## Pilot experience

The athlete portal should progressively support:

1. Today's / next assigned session.
2. Athlete-specific prescription from the same canonical AquaGym session.
3. Clear remote-session label when not physically present.
4. Targets, send-offs, timing ownership, and coaching cues.
5. Athlete self-entry for times, stroke rate, HR, RPE, feeling, and comments.
6. Photo/video/voice evidence where explicitly enabled.
7. Post-session completion confirmation and actual delivered work.
8. Coach feedback attached to the exact athlete/session/set.
9. 7-day / 30-day training history and performance links.
10. Meet/pathway context from the same athlete record.

## Evidence rule

Remote self-reported information remains athlete self-report with provenance. It must not silently become coach-measured evidence, official result evidence, PB truth, or attendance truth.

## Commercial direction to test

Do not design this as a one-off Ashburton feature. Treat Matthew and Molly as the controlled beta for a potential AquaGym / MSOS Remote Coaching product.

Potential service layers to validate before pricing:

- **Remote Programme** — individual session delivery, targets, completion and basic feedback.
- **Remote Coaching** — programme plus structured coach review, messaging, evidence and session feedback.
- **Performance Remote** — deeper performance/pathway review, race planning, meet review, video and periodic live coach contact.

The software should make higher-touch service possible without forcing the coach to manually duplicate every session.

## Marketing proposition to validate

Possible positioning:

**Train where you are. Stay connected to the programme.**

or

**Your coach. Your programme. Wherever you train.**

The proof must come from the pilot before public marketing claims are made.

## Release gates before external athlete rollout

- athlete authentication;
- server-side row-level privacy / authorization;
- explicit guardian/consent handling where required;
- reliable remote session sync;
- offline/recovery behavior;
- clear completion vs planned vs attendance truth;
- coach-to-athlete feedback loop;
- physical Android/iPhone testing;
- no access to another swimmer's data;
- no coach-private evidence leakage.
