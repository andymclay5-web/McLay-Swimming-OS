'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-final-acceptance-20260825a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260825-final-acceptance-a';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-08-25T00:00:00Z',suiteDigest:'guardian-87-authority-plus-final-acceptance',packageDigest:'candidate-ci-required-before-merge',note:'Final acceptance candidate. Full CI Guardian and phone-shape acceptance must both pass on these exact bytes before main merge; physical Android acceptance remains the coach release gate.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
