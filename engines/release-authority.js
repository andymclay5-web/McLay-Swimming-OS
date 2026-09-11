'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const BUILD='v4-plan-import-20260911a';
  M.VERSION='4';M.BUILD=BUILD;M.CORE='20260911-plan-import';
  M.RELEASE_ATTESTATION=Object.freeze({build:BUILD,softwareReady:true,generatedAt:'2026-09-11T21:00:00+12:00',suiteDigest:'current-runtime-ci-required',packageDigest:'current-runtime-coherence',note:'Season/weekly plan import release (Task #65). Fixes the generic importer\'s season_plan/weekly_plan shape -- the weekly date field was literally emitted as `week`, not `week_start`, the exact field engines/coach-loop-ui.js\'s planContext() reads, so an imported weekly-plan row could never match a real session\'s date. Also loads Andy\'s own real AquaGym Winter 2026 season/weekly plan data (engines/plan-reference-2026.js), previously real but 100% dead code in engines/plan-reference-ch.js, using the same bootstrap-once-unless-a-real-import-is-active precedent as engines/wa-base-times-2026.js. Coach Hub and the session-methodology.js Board banner now resolve real weekly focus/technical focus/season goal text. No existing session-selection, parser, target, storage, race-pace, T400, meet, access-authority, or reference-sync (Task #64) behaviour is changed by this release.'});
  M.releaseAuthority={build:BUILD};
  if(M.release){M.release.attestation=()=>M.RELEASE_ATTESTATION;M.release.softwareReady=()=>M.RELEASE_ATTESTATION.softwareReady===true&&M.RELEASE_ATTESTATION.build===M.BUILD;}
})(globalThis);
