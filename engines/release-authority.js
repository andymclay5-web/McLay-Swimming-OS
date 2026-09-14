'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-board-per-rep-max-fix-20260913b';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260913-board-per-rep-max-fix';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-13T00:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Board fix: Andy authored "3x50 1 build, 1@200pace, 1 max @ 1:30" -- a per-rep breakdown where only the THIRD rep is max effort -- but the Board\'s bold work-label headline read "3×50 MAX @ 1:30", claiming the whole set was max effort. engines/board.js\'s workLabel() only ever checked whether the word "MAX" appeared anywhere in the raw line, with no regard for whether it applied to the whole set (correct for e.g. "8 x 25 MAX Sprint") or only one rep in an explicit comma-separated per-rep list (wrong). Fixed by recognising that per-rep-list shape (at least two comma-separated segments each opening with their own bare rep count) and suppressing the blanket MAX suffix in that case; the per-rep detail itself was already, and remains, visible on the row\'s cue subtitle. No existing session-selection, target, storage, race-pace, T400, meet, access-authority, reference-sync, roster-integrity, swimmer-access-modal, or IM-parsing behaviour is changed by this release.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
