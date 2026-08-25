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
// Browser runtime ownership is parser-semantics -> poolside core. Keep the Node
// Guardian harness on the same authority/load order instead of relying on the
// retired parser implementation that used to live in app.js.
require('../engines/parser-semantics.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');

// app.js owns the immutable 82-test foundation. guardian-runtime.js later owns
// the release/device composition and replaces guardian.run in the real runtime.
const result=global.MSOS4.guardian.foundationRun();
const failures=result.tests.filter(test=>!test.ok);

if(failures.length){
  console.error(JSON.stringify({passed:result.passed,total:result.total,failures},null,2));
  process.exit(1);
}

if(result.passed!==82||result.total!==82){
  console.error(`Expected the complete 82-test Guardian foundation; received ${result.passed}/${result.total}`);
  process.exit(1);
}

console.log(`V4 Guardian foundation PASS ${result.passed}/${result.total} · ${result.build}`);
