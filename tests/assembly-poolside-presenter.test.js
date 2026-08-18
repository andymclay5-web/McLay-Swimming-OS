'use strict';
const assert=require('assert');
const Presenter=require('../assembly/poolside-presenter.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
console.log(`Assembly Poolside Presenter ${Presenter.VERSION}`);

test('Roll sheet is compact and exposes attendance actions without duplicating Board work',()=>{const html=Presenter.panelHtml({type:'roll',eligible:[{id:'a1',full_name:'Alex Auer'}],here:[{id:'a1',full_name:'Alex Auer',status:'present'}],summary:{here:1}},{answers:new Map()});assert(/Roll · 1 here/.test(html));assert(/data-status="present"/.test(html));assert(/Modified/.test(html));assert(!/MAIN SET|Warm-up/.test(html))});

test('Times sheet renders verified T400 answer only after the action supplies it',()=>{const answers=new Map([['a1',{status:'ok',seconds:324.6,date:'2026-08-12'}]]),html=Presenter.panelHtml({type:'times',athletes:[{id:'a1',full_name:'Molly McKernan'}]},{answers});assert(/5:24\.6/.test(html));assert(/2026-08-12/.test(html));assert(/T400/.test(html))});

test('voice photo and video never pretend media was saved before adapter exists',()=>{for(const mode of ['voice','photo','video']){const html=Presenter.panelHtml({type:'capture',mode,textMode:mode,roll:{eligible:[]}},{answers:new Map()});assert(/adapter not connected yet/.test(html));assert(/will not pretend media has saved/.test(html))}});

test('note capture can link one or more swimmers or remain group scoped',()=>{const html=Presenter.panelHtml({type:'capture',mode:'note',textMode:'note',roll:{here:[{id:'a1',full_name:'Alex Auer'},{id:'a2',full_name:'Molly McKernan'}]}},{answers:new Map()});assert(/capture-athlete/.test(html));assert(/Alex Auer/.test(html));assert(/Molly McKernan/.test(html));assert(/Save note/.test(html))});

test('group and swimmer edit sheets expose only explicit editable fields',()=>{const group=Presenter.panelHtml({type:'editSet',item:{raw:'6 x 100 Freestyle Development',reps:6,distance:100,restSeconds:10}},{answers:new Map()}),athlete=Presenter.panelHtml({type:'editAthleteSet',athlete:{id:'mk',name:'McKenzie Drage'},item:{raw:'400 Pull',reps:1,distance:400},current:{work:{reps:1,distance:300}}},{answers:new Map()});assert(/Reps/.test(group)&&/Distance/.test(group)&&/Rest seconds/.test(group));assert(/Individual within team/.test(athlete));assert(/300/.test(athlete));assert(!/T400 formula|qualification logic/i.test(group+athlete))});

test('Finish sheet requires an explicit confirm action and states planned work is preserved',()=>{const html=Presenter.panelHtml({type:'finish'},{answers:new Map()});assert(/Confirm full session finished/.test(html));assert(/planned session stays preserved/i.test(html));assert(/data-panel-action="finish-confirm"/.test(html))});

test('all coach text is escaped before insertion into panel HTML',()=>{const html=Presenter.panelHtml({type:'evidence',items:[{type:'note',text:'<img src=x onerror=alert(1)>'}]},{answers:new Map()});assert(!html.includes('<img src=x'));assert(html.includes('&lt;img'))});

if(failures){console.error(`\n${failures} poolside presenter regression(s) failed`);process.exit(1)}
console.log('\nALL ASSEMBLY POOLSIDE PRESENTER REGRESSIONS PASS');
