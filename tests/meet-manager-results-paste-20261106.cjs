'use strict';
// Andy, Fri 6 Nov 2026 06:13: pasted the 2026 Aquagym Challenge results (Hy-Tek Meet Manager text, 31 Oct - 1 Nov,
// all LC) into Input data > Race results. 1,612 lines came back "No swimmer called ...", every row SCM and dated
// today, and Save read "Save 0 results". Now Meet Manager results text is read as results: the event header gives
// distance / stroke / course, rows give the swimmer and time, only swimmers in MSOS are kept, a middle initial or para
// class doesn't stop the match, relays / DQs / exhibition swims are left out, and club-mates not in MSOS are listed.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const RAW=`AQUAGYM HY-TEK's MEET MANAGER 5.0 - 7:27 PM 1/11/2026 Page 1
2026 Aquagym Challenge Meet - 31/10/2026 to 1/11/2026
Results
Event 1 Boys 13-14 100 LC Meter Backstroke
Name Age Team Finals Time
1 Matthew Callow 14 AQGCB 1:08.54
2 Alexander Hammar 14 SELCB 1:09.06
Event 2 Women 15 & Over 100 LC Meter Backstroke
Name Age Team Finals Time
9 Annabelle Dash 15 VIKCB 1:16.75 AQUAGYM HY-TEK's MEET MANAGER 5.0 - 7:27 PM 1/11/2026 Page 2
2026 Aquagym Challenge Meet - 31/10/2026 to 1/11/2026
Results
(Event 2 Women 15 & Over 100 LC Meter Backstroke)
18 Ashley Brown 16 AQGCB 1:25.19
19 Charlotte T Murphy S6/Sm6/Sb6 18 AQGCB 2:07.52
Event 3 Mixed 1-14 200 LC Meter Freestyle Relay
Team Relay Finals Time
7 AQGCB A 2:06.66
1) Zakhar Voinov M13 2) Awatea Calman W13
3) Ruby Stace S13/Sm13/Sb13 W13 4) Matthew Callow M14
Event 4 Women 1-14 50 LC Meter Freestyle
Name Age Team Finals Time
11 Ruby Stace S13/Sm13/Sb13 13 AQGCB 39.16
--- Awatea Calman 13 AQGCB DQ
--- Ashley Brown 16 AQGCB X35.00
Event 5 Mixed 50 LC Meter Butterfly skins Multi-Class
Name Age Team Finals Time
4 Matthew Z Kofoed S18 23 AQGCB 46.71`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.inputData?.meetResults,{timeout:30000});await p.waitForTimeout(300);
  const r=await p.evaluate(t=>{const M=window.MSOS4,I=M.inputData;
    M.state.athletes=['Charlotte Murphy','Ruby Stace','Matthew Kofoed','Ashley Brown','Awatea Calman','Matthew Robertson'].map((n,i)=>({id:'a'+i,full_name:n,squad:'National',active:true}));
    const mr=I.meetResults(t,{defaults:{date:'2026-11-06'}});
    return{is:I.isMeetResults(t),plain:I.isMeetResults('Charlotte 1:05.2 100 free'),parse:I.parse(t,{kind:'race',defaults:{date:'2026-11-06'}}).length,
      rows:mr.rows.map(x=>[x.athleteId,x.distance,x.stroke,x.course,x.seconds,x.date]),meet:mr.meet,club:mr.club,missing:mr.missing};},RAW);
  assert.equal(r.is,true);assert.equal(r.plain,false,'an ordinary typed line is not meet results');
  assert.equal(r.meet,'2026 Aquagym Challenge Meet');assert.equal(r.club,'AQGCB');
  assert.deepEqual(r.rows,[
    ['a3',100,'Backstroke','LCM',85.19,'2026-10-31'],
    ['a0',100,'Backstroke','LCM',127.52,'2026-10-31'],
    ['a1',50,'Freestyle','LCM',39.16,'2026-10-31'],
    ['a2',50,'Butterfly','LCM',46.71,'2026-10-31']],JSON.stringify(r));
  assert.equal(r.parse,4,'Race results "Read it" uses the meet reader');
  assert.deepEqual(r.missing,['Matthew Callow'],'club-mates not in MSOS are listed, other clubs are not');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('MEET_MANAGER_RESULTS_PASTE_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
