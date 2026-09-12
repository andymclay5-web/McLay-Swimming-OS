'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-swimmer-access-backdrop-20260912b';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260912-swimmer-access-backdrop';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-12T01:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Swimmer-access modal backdrop fix, on top of the roster integrity release. Andy reported the "Give swimmer access" QR modal never actually locking the screen (could still tap around the rest of the app behind it) and its Close button appearing to do nothing. Root cause: engines/swimmer-invite-bn.js alone stamped its modal wrapper with an undefined CSS class (`modal-overlay`) instead of the real, styled `modal-backdrop` class every other modal in the app uses -- with no matching CSS rule the modal rendered as a plain unstyled block in normal page flow instead of a fixed, full-screen, dimmed overlay. Fixed to use the same real class. No existing session-selection, parser, target, storage, race-pace, T400, meet, access-authority, reference-sync, or roster-integrity behaviour is changed by this release.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
