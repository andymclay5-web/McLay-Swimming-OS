'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-race-pace-shorthand-targets-20260901a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260901-race-pace-shorthand-targets';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-01T20:20:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Race-pace shorthand target repair. Deck notation such as 50 #1 @100p @1:30 is promoted to canonical 100 race-pace intent so the existing race-pace engine produces swimmer-specific target times instead of showing only the send-off. Session selection, training surface and storage authority repairs remain unchanged.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
