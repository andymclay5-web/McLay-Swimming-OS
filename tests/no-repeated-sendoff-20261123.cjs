'use strict';
// 23 Nov 2026 (Andy, photo of the pool TV: under "100 IM @ 2:00" every swimmer read "@ 2:00", under "8x25 Kick MAX
// @ 0:45" every swimmer "@ 45" -- "these times that are repeating the send off ... there's no need for times, shows on
// phone too"). Proves a swimmer with no target and the set's own send-off gets nothing on the TV or the phone's Times
// cards, and a TV set where nobody has anything to show has no swimmer row.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.tvLink?.buildFrame&&window.MSOS4?.boardStateEngine?.fillPanel,{timeout:30000});await p.waitForTimeout(800);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,S=M.boardStateEngine;
    const s=M.parser.parse('MAIN SET\n100 IM @ 2:00\n8 x 25 Kick MAX #1 kick max @ 0:45',{date:new Date().toISOString().slice(0,10),dayPart:'AM',squads:['National']});s.id='rep-sess';M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
    const ath=[['mr','Matt R'],['zac','Zac'],['el','Elsie']].map(([id,n])=>({id,full_name:n+' Test',squad:'National',active:true,sex:'M'}));M.state.athletes=ath;M.state.attendance=ath.map(a=>({session_id:s.id,athlete_id:a.id,status:'present'}));
    M.state.settings.boardFocusMode=true;M.state.settings.boardBlockBySession={[s.id]:s.blocks[0].id};
    const f=await M.tvLink.buildFrame();const rows=f.blocks[0].rows.filter(x=>x.k==='set').map(x=>({work:x.work,targets:x.targets||null}));
    M.nav.show('board');M.ui.renderCurrent();
    return{rows};});
  const cards=[];for(let i=0;i<2;i++){const btn=p.locator('#boardView [data-msos-times]').nth(i);await btn.click();await p.waitForSelector('#boardView .msos-target-card',{timeout:8000});cards.push((await p.locator('#boardView .msos-target-panel').first().innerText()).replace(/\s+/g,' ').trim());await btn.click();await p.waitForTimeout(300)}r.cards=cards;
  assert.equal(r.rows.length,2,JSON.stringify(r.rows));
  for(const row of r.rows)assert.equal(row.targets,null,`no swimmer row repeating the send-off under "${row.work}": ${JSON.stringify(row.targets)}`);
  for(const c of r.cards){assert.doesNotMatch(c,/@\s*(2:00|0?:?45)/,'phone Times cards don\'t repeat the send-off: '+c);assert.match(c,/Matt/,'the swimmer (and stroke button) is still there: '+c)}
  assert.deepEqual(errors,[],errors.join('\n'));console.log('NO_REPEATED_SENDOFF_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
