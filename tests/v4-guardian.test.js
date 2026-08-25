'use strict';

const fs=require('node:fs'),path=require('node:path');
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

const root=path.resolve(__dirname,'..');
const text=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=text('app.js'),poolside=text('v4-poolside-core.js'),board=text('engines/board.js');
const authorityTests=[
  {
    name:'Board authority · legacy runtime files do not assign renderBoard',
    ok:!(/UI\.renderBoard\s*=/.test(app)||/UI\.renderBoard\s*=/.test(poolside)),
    detail:'app.js and v4-poolside-core.js are not Board owners'
  },
  {
    name:'Board authority · whiteboard engine is the sole Board presentation owner',
    ok:/UI\.renderBoard\s*=/.test(board)&&/msos-group-cell/.test(board)&&/msos-mod-cell/.test(board),
    detail:'engines/board.js owns the left-work / right-modified whiteboard Board'
  }
];
const authorityFailures=authorityTests.filter(test=>!test.ok);

if(failures.length||authorityFailures.length){
  console.error(JSON.stringify({passed:result.passed,total:result.total,failures:[...failures,...authorityFailures]},null,2));
  process.exit(1);
}

const passed=result.passed+authorityTests.filter(test=>test.ok).length;
const total=result.total+authorityTests.length;
if(passed!==82||total!==82){
  console.error(`Expected 82 protected checks; received ${passed}/${total} (${result.passed}/${result.total} runtime + ${authorityTests.filter(x=>x.ok).length}/${authorityTests.length} Board authority)`);
  process.exit(1);
}

console.log(`V4 Guardian PASS ${passed}/${total} · ${result.build} · 80 runtime + 2 Board authority`);
