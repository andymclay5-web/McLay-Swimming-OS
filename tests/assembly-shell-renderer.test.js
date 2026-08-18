'use strict';
const assert=require('assert');
const Renderer=require('../assembly/shell-renderer.js');
let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
console.log(`Assembly Renderer ${Renderer.VERSION}`);

test('Calendar renders compact month navigation and one date button per real cell',()=>{const model={month:'2026-08',previousMonth:'2026-07',nextMonth:'2026-09',weekdays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],cells:[null,{date:'2026-08-18',day:18,today:true,status:'training',count:2,hasSessions:true,hasMeet:false}]};const html=Renderer.renderCalendar(model);assert(html.includes('August 2026'));assert(html.includes('data-date="2026-08-18"'));assert(html.includes('calendar-count">2'));assert(html.includes('data-month="2026-07"'));assert(html.includes('data-month="2026-09"'))});

test('shared multi-squad day occurrence renders as one card with exact staggered timing',()=>{const item={id:'occ',type:'occurrence',date:'2026-08-18',dayPart:'AM',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',sessionId:'s1',label:{text:'National + Development',clock:'05:20–07:20'},squadEntries:[{squadLabel:'National',start:'05:20',end:'07:20',startOffsetMinutes:0,endBeforeLatestMinutes:0},{squadLabel:'Development',start:'05:30',end:'07:00',startOffsetMinutes:10,endBeforeLatestMinutes:20}]};const html=Renderer.renderDay({date:'2026-08-18',status:'training',items:[item]});assert.strictEqual((html.match(/day-session-card/g)||[]).length,1);assert(html.includes('National'));assert(html.includes('Development'));assert(html.includes('joins +10 min'));assert(html.includes('Open Board'))});

test('session intake makes shared-squad choice explicit and does not pretend voice/photo are connected',()=>{const slots=[{id:'nat',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',squadEntries:[{squadLabel:'National'}]},{id:'dev',start:'05:30',end:'07:00',venue:'AquaGym',course:'SCM',squadEntries:[{squadLabel:'Development'}]}],html=Renderer.renderIntake({item:{date:'2026-08-18',dayPart:'AM',venue:'AquaGym',course:'SCM'},availableDaySlots:slots,selectedSlotIds:['nat','dev']});assert.strictEqual((html.match(/name="slot"/g)||[]).length,2);assert.strictEqual((html.match(/checked/g)||[]).length,2);assert(html.includes('Paste / Type'));assert(/Voice \/ Transcribe[\s\S]*disabled|disabled[\s\S]*Voice \/ Transcribe/.test(html));assert(/Photo[\s\S]*Not connected yet/.test(html))});

test('Board wrapper shows schedule offsets outside the canonical Board projection',()=>{const html=Renderer.renderBoard({boardHtml:'<main class="msos-board">CANONICAL BOARD</main>',occurrence:{squadEntries:[{squadLabel:'National',start:'05:20',end:'07:20',startOffsetMinutes:0},{squadLabel:'Development',start:'05:30',end:'07:00',startOffsetMinutes:10}]}});assert(html.includes('CANONICAL BOARD'));assert(html.includes('Scheduled group'));assert(html.includes('joins +10 min'))});

test('shell uses Calendar and Board as compact primary navigation and Back only away from root',()=>{const root=Renderer.shell({body:'x',route:{type:'calendar'}}),day=Renderer.shell({body:'x',route:{type:'day'}});assert(root.includes('Calendar'));assert(root.includes('Board'));assert(!root.includes('data-app-action="back"'));assert(day.includes('data-app-action="back"'))});

test('renderer escapes coach/session text instead of injecting markup',()=>{const html=Renderer.renderTextEntry({draftId:'d',title:'<img src=x onerror=1>',source:'<script>alert(1)</script>'});assert(!html.includes('<script>alert'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(!html.includes('<img src=x onerror=1>'))});

if(failures){console.error(`\n${failures} Assembly Renderer regression(s) failed`);process.exit(1)}
console.log('\nALL ASSEMBLY RENDERER REGRESSIONS PASS');
