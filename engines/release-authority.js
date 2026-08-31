'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-meet-sunday-smooth-20260830a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260830-current-release-authority';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-08-30T00:00:00Z',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Current runtime authority. CI must validate these exact runtime bytes; physical Android acceptance remains the coach release gate.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
