'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-phone-persisted-repair-20260826a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260826-phone-persisted-repair-a';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-08-26T02:30:00Z',suiteDigest:'persisted-round-repair-ci-required',packageDigest:'candidate-ci-required-before-merge',note:'Phone persisted-state repair candidate. Full CI Guardian and phone-shape acceptance must pass on these exact bytes before main merge; physical Android acceptance remains the coach release gate.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
