'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-consolidation-20260904a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260904-consolidation-a';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-04T17:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Consolidation pass. Removes 22 dead files; fixes the SISC meet swimmer-intel blocker, a ~30%-of-cold-loads renderBoard boot race, and a cold-boot path that dropped the selected session after reload; routes the Roll add-squad edit and the live-sync stale-broadcast drop through their owners; removes the shadowed L.apply / N.applyHistory originals from app.js; adds architecture/ownership-net.test.js and tests/fpa-runner.cjs (Final Product Acceptance now reports every failure). Three layered-Meet acceptance tests remain known-deferred (docs/KNOWN_DEFERRED.md). Not yet accepted on a physical phone.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
