'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-remote-alerts-20260910a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260910-remote-alerts';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-10T21:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Phase 5 remote-alerts release. Adds real Web Push (RFC 8030 + VAPID) coach alerts via the new send-coach-alert Edge Function and push-alerts.js engine, starting with the stroke-change evidence-gate proposal notifying the owner off the pool deck. No existing session-selection, parser, target, storage, race-pace, meet, or access-authority behaviour is changed by this release.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
