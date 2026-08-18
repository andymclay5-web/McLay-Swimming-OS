'use strict';
const assert=require('assert');
const Shell=require('../assembly/shell-model.js');
const Renderer=require('../assembly/shell-renderer.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
const occurrence={id:'occ-1',type:'occurrence',date:'2026-08-19',dayPart:'AM',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',sessionId:'s1',kind:'training',squadEntries:[{squadLabel:'National',start:'05:20',end:'07:20'}]};
const delivery={id:'d1',session_id:'s1',status:'finished',finished_at:'2026-08-19T07:15:00+12:00',planned_distance:900,current_distance:1000,delivered_distance:1000};
const navigation={route:()=>({type:'day',date:'2026-08-19'}),openDate(){},markInteractive(){}};
console.log(`Assembly finished-session projection ${Shell.VERSION} / ${Renderer.VERSION}`);
test('ShellModel reads delivered truth but does not mutate schedule occurrence',()=>{const scheduleRow=JSON.stringify(occurrence),model=Shell.create({schedule:{day:()=>({date:'2026-08-19',status:'training',items:[occurrence],notes:[]})},navigation,deliveryForSession:id=>id==='s1'?delivery:null,today:()=> '2026-08-19'}).day('2026-08-19'),item=model.items[0];assert.strictEqual(item.delivery.id,'d1');assert.strictEqual(item.label.state,'finished');assert.strictEqual(JSON.stringify(occurrence),scheduleRow)});
test('finished day card says Finished and Review Board with delivered distance',()=>{const html=Renderer.sessionCard({...occurrence,delivery,label:{text:'National',clock:'05:20–07:20'}});assert(/Finished/.test(html));assert(/Review Board/.test(html));assert(/Delivered 1,000m/.test(html));assert(/is-finished/.test(html))});
test('finished Board has delivered status while original Board markup remains present',()=>{const html=Renderer.renderBoard({boardHtml:'<main class="msos-board"><button data-board-action="finish">Finish</button>BOARD</main>',occurrence,delivery,sessionId:'s1'});assert(/data-session-finished="true"/.test(html));assert(/Delivered session/.test(html));assert(/Finished · 1,000m/.test(html));assert(/msos-board/.test(html));assert(/data-board-action="finish"/.test(html),'renderer should not rewrite the canonical Board HTML; CSS hides repeated Finish')});
test('unfinished Board stays explicitly unfinished and has no delivered banner',()=>{const html=Renderer.renderBoard({boardHtml:'BOARD',occurrence,delivery:null,sessionId:'s1'});assert(/data-session-finished="false"/.test(html));assert(!/Delivered session/.test(html))});
if(failures){console.error(`\n${failures} finished-session regression(s) failed`);process.exit(1)}
console.log('\nALL FINISHED SESSION PROJECTION REGRESSIONS PASS');
