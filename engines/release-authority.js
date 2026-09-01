'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-session-selection-authority-20260901a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260901-session-selection-authority';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-01T19:15:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Session selection authority repair. Browser/Android navigation history may restore view/detail state but can no longer select or replace the active training session. Session changes remain explicit coach actions only. Training remains free of Meet chrome and operational hydration remains non-destructive.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
