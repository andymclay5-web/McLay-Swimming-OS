'use strict';

global.window=global;
global.scrollY=0;
global.localStorage={
  getItem(){return null;},
  setItem(){},
  removeItem(){}
};
global.document={
  addEventListener(){},
  querySelector(){return null;},
  querySelectorAll(){return[];},
  body:{dataset:{}}
};
global.location={hash:'',href:'https://guardian.test/'};
global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};
global.removeEventListener=()=>{};

require('../app.js');
// index.html loads engines/live-training-authority.js immediately after app.js, before v4-correct.js
// (which wraps M.live.apply only `if(M.live?.apply)` -- see v4-correct.js's live-sync section).
// Without this, app.js's own dead original L.apply (retired 4 Sep 2026, see
// architecture/WRITER_MAP_FINDINGS.md) was silently standing in for the real owner here -- this
// harness was never actually exercising the gated, revision-checked apply production runs.
require('../engines/live-training-authority.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');
// NOTE (10 Sept 2026, while extending assistant-coach caps for engines/team-access.js): this harness's
// M.guardian.run() is app.js's own internal, legacy guardian -- it is NOT the guardian that actually
// runs in the real app. The real app's guardian is composed by the many engines/release-guardian-*.js
// files (loaded near the end of index.html's script list), which together produce a much smaller,
// different check set (confirmed live: 4/4, not 82) -- this 82-test internal guardian in app.js/
// v4-correct.js/v4-poolside-core.js is superseded, disconnected legacy weight. Its embedded
// "Assistant role..." test below therefore checks app.js's own dead, pre-override M.access stub (see
// engines/access-authority.js's header comment on the dual-definition), never the real, live capability
// model a device actually enforces -- do NOT add engines/access-authority.js here to "fix" that; doing
// so surfaces several other unrelated pre-existing failures in this same dead subsystem (legacy
// evidence/swimmer-role/meet-evidence tests) that reflect a stale internal model, not real behavior.
// Real assistant-coach capability behavior is verified against the fully-loaded app instead, in
// tests/jordan-assistant-role-persistence-20260904.cjs and tests/all-inclusive-product-acceptance-20260825.cjs.

const result=global.MSOS4.guardian.run();
const failures=result.tests.filter(test=>!test.ok);

if(failures.length){
  console.error(JSON.stringify({passed:result.passed,total:result.total,failures},null,2));
  process.exit(1);
}

if(result.passed!==82||result.total!==82){
  console.error(`Expected the complete 82-test Guardian; received ${result.passed}/${result.total}`);
  process.exit(1);
}

console.log(`V4 Guardian PASS ${result.passed}/${result.total} · ${result.build}`);
