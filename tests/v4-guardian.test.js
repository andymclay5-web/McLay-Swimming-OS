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
