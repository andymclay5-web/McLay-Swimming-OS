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
require('../v4-correct.js');
require('../v4-poolside-core.js');

const result=global.MSOS4.guardian.run();
const failures=result.tests.filter(test=>!test.ok);

if(failures.length){
  console.error(JSON.stringify({passed:result.passed,total:result.total,failures},null,2));
  process.exit(1);
}

if(result.passed!==73||result.total!==73){
  console.error(`Expected the complete 73-test Guardian; received ${result.passed}/${result.total}`);
  process.exit(1);
}

console.log(`V4 Guardian PASS ${result.passed}/${result.total} · ${result.build}`);
