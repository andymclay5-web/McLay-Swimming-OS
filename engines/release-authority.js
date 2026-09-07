'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-training-session-capture-20260907a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260907-training-session-capture';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-07T15:25:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Training-first release repair. Published 7 September session intake remains authoritative, leaving Meet cannot hide the Training Capture/Edit/Finish action bar, Capture saves locally against the selected canonical session, and the service-worker cache generation is advanced so installed phones receive the current September calendar. Existing session-selection, parser, target, storage and race-pace authority remain unchanged.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
