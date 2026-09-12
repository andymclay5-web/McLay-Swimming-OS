'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-roster-integrity-20260912a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260912-roster-integrity';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-12T00:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Roster integrity release (Tasks #66-68). Widens the placeholder-athlete purge (engines/stability-identity-bh.js) to also catch "Meet A"/"Meet B"-style test-fixture leakage, not just the "Swimmer N" pattern. Fixes engines/data-registry.js\'s swimmer importer silently reactivating (active:true) any previously-deactivated athlete on a routine CSV/JSON re-import that omits the active column. Converts the permanent hardcoded "Sophie Newlove" squad-exclusion rule in v4-correct.js and engines/morning-coaching.js into a one-time data migration (deactivates her once, then relies on the same active flag every other athlete uses) so exclusions are a normal data state, not code. Adds a "Manage swimmers" edit control to the Data & References admin page (engines/data-admin-ui.js) so a single athlete\'s name/squad/active status can be corrected directly, without a full re-import. No existing session-selection, parser, target, storage, race-pace, T400, meet, access-authority, or reference-sync behaviour is changed by this release.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
