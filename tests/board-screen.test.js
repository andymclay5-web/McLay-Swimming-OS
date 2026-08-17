'use strict';
const assert=require('assert');
const Screen=require('../ui/board-screen.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function setup(){
 const root={innerHTML:''},models=[{schema:'msos.board.v2',sessionId:'s1'}],runtime={boardModel(){return models.at(-1)}},renderer={calls:0,renderBoard(m){this.calls++;return`<main data-session-id="${m.sessionId}">${m.sessionId}</main>`}},controller={binds:0,unbinds:0,bind(){this.binds++;return this},unbind(){this.unbinds++;return this}},controllerFactory={create(){return controller}},scroll={value:420,restored:null};
 const screen=Screen.create({root,runtime,renderer,controllerFactory,commands:{},getScroll:()=>scroll.value,setScroll:v=>{scroll.restored=v}});
 return{root,models,runtime,renderer,controller,scroll,screen};
}

test('mount renders once and locks to exact selected session',()=>{
 const x=setup(),m=x.screen.mount();assert.equal(m.sessionId,'s1');assert.equal(x.screen.snapshot().sessionId,'s1');assert.equal(x.renderer.calls,1);assert.equal(x.controller.binds,1);assert(/s1/.test(x.root.innerHTML));
});

test('ordinary rerender preserves scroll and same session',()=>{
 const x=setup();x.screen.mount();x.scroll.value=733;x.screen.render();assert.equal(x.scroll.restored,733);assert.equal(x.screen.snapshot().sessionId,'s1');
});

test('background-selected different session cannot take over mounted Board',()=>{
 const x=setup();x.screen.mount();x.models.push({schema:'msos.board.v2',sessionId:'s2'});assert.throws(()=>x.screen.render(),/session takeover blocked/);assert.equal(x.screen.snapshot().sessionId,'s1');assert(/s1/.test(x.root.innerHTML));
});

test('explicit session navigation is the only route that changes Board lock',()=>{
 const x=setup();x.screen.mount();x.models.push({schema:'msos.board.v2',sessionId:'s2'});x.screen.openSelectedSession();assert.equal(x.screen.snapshot().sessionId,'s2');assert(/s2/.test(x.root.innerHTML));
});

test('Board screen has no background timers or sync ownership',()=>{
 const fs=require('fs'),src=fs.readFileSync(require.resolve('../ui/board-screen.js'),'utf8');for(const forbidden of ['setInterval(','setTimeout(','visibilitychange','pagehide','fetch(','XMLHttpRequest','localStorage','indexedDB'])assert(!src.includes(forbidden),forbidden);
});

test('unmount only releases delegated controller',()=>{
 const x=setup();x.screen.mount();x.screen.unmount();assert.equal(x.controller.unbinds,1);assert.equal(x.screen.snapshot().mounted,false);
});

if(fails){console.error(`\n${fails} Board screen regression(s) failed`);process.exit(1)}console.log('\nALL BOARD SCREEN REGRESSIONS PASS');
