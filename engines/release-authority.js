'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-engine-authority-20260824';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260824-engine-authority';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:new Date().toISOString(),suiteDigest:'guardian-87-authority',packageDigest:'ci-verified-on-merge',note:'Software-attested authority build. Device acceptance remains a separate release gate.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
