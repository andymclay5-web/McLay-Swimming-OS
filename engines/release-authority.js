'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-operational-authority-root-20260901a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260901-operational-authority-root';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-01T07:30:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Operational authority root repair. Hydration is non-destructive after live boot, session repair is explicit-only, navigation owns surface lifecycle, and TV/swimmer live state remains derived from coach operational truth. No date/session-specific recovery logic is permitted.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
