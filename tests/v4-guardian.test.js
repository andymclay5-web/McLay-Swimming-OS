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
  getElementById(){return null;},
  querySelector(){return null;},
  querySelectorAll(){return[];},
  body:{dataset:{}}
};
global.location={hash:'',href:'https://guardian.test/'};
global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};
global.removeEventListener=()=>{};

require('../app.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');
// L.apply owner (moved out of app.js on the consolidation branch); the Guardian
// self-test for live-sync display behaviour exercises it.
require('../engines/live-training-authority.js');

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
