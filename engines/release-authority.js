'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-sep1-board-parser-cleanup-20260901a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260901-board-parser-cleanup';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-01T05:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Targeted Sep 1 Board/parser cleanup authority. Cue-only repeat patterns fold without changing distance truth; Board preserves authored coaching intent and suppresses empty target panels. CI must validate these exact runtime bytes; physical Android acceptance remains the coach release gate.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
