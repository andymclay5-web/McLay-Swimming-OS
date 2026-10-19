'use strict';
// Andy, 19 Oct 2026: "in the reports analysis ... it shows volumes of regeneration development overload threshold
// clearance but there's nothing to do with the anaerobic side showing up. I sort of need to know. We need to probably
// categorize that and actually display it again, tie back to Clive Rushton's ethos for the model of how we do that."
// Rushton grouping (Andy's own words, 4 Oct, engines/session-methodology.js): Anaerobic Capacity = ATP-PC, top-end
// speed, assisted/resisted; Anaerobic Power = race pace, lactate tolerance; Clearance = top of Aerobic Power.
// Uses Andy's real sessions from last week (Supabase sessions.workout, 12-17 Oct 2026). Proves:
//  1. Reports > This session shows Aerobic and Anaerobic groups; 13 Oct Dev (4x50 @200 Pace, 100 MAX, 2 rounds)
//     -> Anaerobic Power 400m, Anaerobic Capacity 200m.
//  2. An all-aerobic session (12 Oct) still shows the Anaerobic group, both rows "none".
//  3. Session detail (Coach Hub) classifies with the same engine: 16 Oct speed session shows Anaerobic Capacity.
//  4. The swimmer training history counts lines with no aerobic zone written on them (they used to vanish).
//  5. The swimmer Training tab names the groups and always shows the anaerobic rows.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESS={
  'oct12':['2026-10-12',`WARM-UP\n600 (200 fr / 100 rev imo) Reg — Posture & body line, long exhale\n\nPRE-SET\n12 x 25 Kick @0:45 — Streamline on back, hips up / chest down, 6—1—6 rotation\n\nMAIN SET\n6 Rounds:\n  200 Reg 10sR — steady 6-beat, hold line; 4 UW kicks each wall to 7.5m\n  2 x 100 Dev 10sR — Hold stroke length; posture & body line; controlled breathing pattern\n\nPOST-SET\n8 x 25 Scull / Swim Reg @0:45 — Front-mid scull into long-line swim\n\nWARM-DOWN\n400 Easy Reg — Mobility and posture`],
  'oct13dev':['2026-10-13',`WARM-UP\n4 x 300 (200 Free / 100 Reverse IM)\n\nPRE-SET\n3 x 200 Pull Desc Stroke Count 1-3\n5 x 50 Kick Build @1:00\n\nMAIN SET\n2 Rounds:\n  4 x 50 @200 Pace\n  200 Easy @4:00\n  100 Scull\n  1 x 100 MAX\n\nPOST-SET\n8 x 75 Pull @1:30 Desc 1-4\n8 x 25 UW Fins @0:45`],
  'oct16':['2026-10-16',`WARM-UP\n400 Free\n4 x 100 Choice 15sR\n8 x 50 #1 @ 1:15\nOdd Minimum Stroke Count / Even Build\n\nPRE-SET\n4 x 25 Fins @ 1:30\n15m MAX / Easy Finish\n200 Easy\nFull Recovery\n4 x 50 (Dive Start first 15m max)\n400 easy choice\n\nMAIN SET\n8 x 12.5 Bands Only MAX @0:30\n200 sculling\n8 x 25 (15 max) @ 0:50\n200 drill\n8 x 12.5 kick MAX @ 0:30\n\nPOST-SET\n800 Fins & Paddles\nMinimum Stroke Count\n\nWARM-DOWN\n200 easy`]};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
  try{const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE);await page.waitForFunction(()=>window.MSOS4?.dosageEngine?.rushtonHtml&&window.MSOS4?.hubPanels?.renderReports&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await page.waitForTimeout(400);
    await page.evaluate(SESS=>{const M=window.MSOS4;for(const[id,[date,src]]of Object.entries(SESS)){const s=M.parser.parse(src,{date,dayPart:'AM',squads:['Development']});s.id=id;s.identity={...s.identity,date,dayPart:'AM',squads:['Development']};M.store.putSession(M.state,s);}M.store.save(M.state);},SESS);
    const sessionReport=id=>page.evaluate(id=>{const M=window.MSOS4;M.state.settings.selectedSessionId=id;const host=document.createElement('div');document.body.appendChild(host);M.hubPanels.renderReports(host,{report:'session'});
      const g=[...host.querySelectorAll('.rushton-group')].map(x=>({head:x.querySelector('.rushton-head').textContent,rows:[...x.querySelectorAll('.rushton-row')].map(r=>({sys:r.dataset.rushtonSystem,text:r.textContent}))}));host.remove();return g;},id);
    // 1. 13 Oct Dev
    let g=await sessionReport('oct13dev');
    const an=g.find(x=>/^Anaerobic/.test(x.head));assert.ok(an,'Anaerobic group shown');assert.ok(g.find(x=>/^Aerobic/.test(x.head)),'Aerobic group shown');
    assert.match(an.rows.find(r=>r.sys==='Race pace').text,/Anaerobic Power[\s\S]*race pace · lactate tolerance[\s\S]*400m/);
    assert.match(an.rows.find(r=>r.sys==='Speed / Max').text,/Anaerobic Capacity[\s\S]*ATP-PC[\s\S]*200m/);
    assert.match(an.head,/Anaerobic[\s\S]*600m/);
    // 2. all-aerobic day still shows the anaerobic side, as none
    g=await sessionReport('oct12');
    const an12=g.find(x=>/^Anaerobic/.test(x.head));assert.ok(an12,'Anaerobic group shown on an aerobic day');
    assert.deepEqual(an12.rows.map(r=>/none/.test(r.text)),[true,true],'both anaerobic rows say none');
    assert.match(g.find(x=>/^Aerobic/.test(x.head)).rows.map(r=>r.text).join('|'),/Regeneration[\s\S]*Aerobic Capacity/);
    // 3. Session detail on Coach Hub uses the same classification
    const detail=await page.evaluate(()=>{const M=window.MSOS4;M.state.settings.selectedSessionId='oct16';M.store.save(M.state);M.coachLoopUI.setHubPanel('session');M.nav.show('hub');M.coachLoopUI.renderCoachHub();
      const box=document.querySelector('#hubView .loop-intelligence [data-rushton]');return box?[...box.querySelectorAll('.rushton-row')].map(r=>({sys:r.dataset.rushtonSystem,text:r.textContent})):null;});
    assert.ok(detail,'Session detail shows the Rushton groups');
    assert.match(detail.find(r=>r.sys==='Speed / Max').text,/Anaerobic Capacity[\s\S]*\d+m/);
    assert.ok(!/Unclassified/.test(JSON.stringify(detail)),'grouped view has no Unclassified row');
    // 4. swimmer training history counts the anaerobic lines
    const th=await page.evaluate(()=>{const M=window.MSOS4,T=window.MSOSArchitecture.TrainingHistory;const s=M.state.canonicalSessions.oct13dev;const items=[];const walk=(xs,m)=>{for(const x of xs||[]){if(x.kind==='group')walk(x.items,m*(x.rounds||1));else if(x.kind==='set')items.push([x,m]);}};for(const b of s.blocks)walk(b.items,1);
      const z={};for(const[x,m]of items){const l=T.itemLoad(x,m);for(const[k,v]of Object.entries(l.zones))z[k]=(z[k]||0)+v;}return z;});
    assert.equal(th['Race pace'],400,'4 x 50 @200 Pace x 2 rounds');assert.equal(th['Speed / Max'],200,'100 MAX x 2 rounds');
    // 5. swimmer Training tab chips
    const chips=await page.evaluate(()=>window.MSOS4.swimmerTrainingBG.windowHtml('Last 7 days',{confirmedDeliveredMetres:1200,sessions:1,zones:{Development:1000,'Race pace':200}}));
    assert.match(chips,/Aerobic<\/b> 1,000m[\s\S]*Aerobic Capacity 1,000m[\s\S]*Anaerobic<\/b> 200m[\s\S]*Anaerobic Power 200m[\s\S]*Anaerobic Capacity none/);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('RUSHTON_ANAEROBIC_REPORTS_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
