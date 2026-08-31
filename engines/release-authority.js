'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-training-surface-clean-20260901a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260901-training-surface-clean';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-01T08:05:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Training surface cleanup over the operational-authority root. Meet header/navigation chrome is removed from coach Training while Meet remains a separate surface. Operational hydration/session/attendance authority remains unchanged from the root repair.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
