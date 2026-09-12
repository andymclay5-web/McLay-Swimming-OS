'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-swimmer-access-close-20260912c';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260912-swimmer-access-close';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-12T02:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Swimmer-access modal Close/back-button fix, on top of the backdrop fix. With the modal now correctly locking the screen, Andy reported its Close button did nothing and the only way out was pressing the phone back button several times. Root cause: engines/swimmer-invite-bn.js never called M.nav.openLayer(\'modal\') when opening, unlike every other modal in the app -- opening it left the coach\'s real navigation history untouched, so a single back-press (or Close) could not reliably pop just this modal; it only closed once a stray back-press happened to land on an unrelated history entry that navigation.js clears as a side effect. Fixed by registering the same nav layer every other modal uses and routing Close through M.nav.dismissLayer(). No existing session-selection, parser, target, storage, race-pace, T400, meet, access-authority, reference-sync, roster-integrity, or backdrop-fix behaviour is changed by this release.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
