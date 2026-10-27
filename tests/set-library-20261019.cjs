'use strict';
// Andy, 19 Oct 2026 (after the first pool TV night): session suggestions were "poor and similar" and one made no sense;
// "pick out the sessions ... come up with versions that are similar ... identify if it's my session or your session, my
// set or your set, or one that Jordan's written or one that Caleb's written. I think the author of the set should be
// shown"; reviewed in "a sheet or an editable form"; hundreds of sets.
// Real app. Proves:
//  1. The library holds hundreds of sets: Andy's (methodology + reference library + his own sessions), ChatGPT's
//     examples, Claude's variations, coach-added sets -- every one with its author.
//  2. Every Claude variation keeps its original's main training system (checked again here with the app's parser and
//     dosage engine) and changes one thing; none has a per-rep pattern (#1-4 ...) that no longer matches its repeats.
//  3. The sense check holds back "200 #1 Hands by Side" (the set Andy found made no sense) until he looks at it.
//  4. Suggestions: six DIFFERENT options -- no two from the same set or starting the same way, at most one set still
//     waiting for review (marked "new · not reviewed"), authors shown, and a different mix on a different day.
//  5. The head coach keeps / drops a set from the suggestion itself or in the Set library screen (edit and keep too);
//     a dropped set is never offered again; decisions go to the team (msos_set_library); an assistant can add a set,
//     which waits for him, but cannot approve.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.setLibrary&&window.MSOS4?.setLibraryUI&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
  const r=await p.evaluate(ORG=>{const M=window.MSOS4,SL=M.setLibrary,SM=M.sessionMethodology,D=M.dosageEngine;M.state.settings.organisationId=ORG;M.cloud.sendSoon=()=>{};M.state.pending=[];
    // one of Andy's sessions on this phone, so his own sets are in the library too
    const s=M.parser.parse('WARM UP\n400 free\nMAIN SET\n3 Rounds:\n5 x 100 Threshold 10sR\n200 Easy\nPOST SET\n6 x 200 Pull 10sR',{date:'2026-10-14',dayPart:'PM',squads:['National']});s.id='old-1';s.identity={...s.identity,date:'2026-10-14',dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);M.state.settings.storageRevision=(Number(M.state.settings.storageRevision)||0)+1;
    const all=SL.all(),by={};for(const x of all)by[x.author]=(by[x.author]||0)+1;
    // 2. recheck every Claude variation with the parser + dosage
    const sys=(sec,t)=>{const q=M.parser.parse(`${sec}\n${t}`,{date:'2026-10-20',dayPart:'PM',squads:['National'],id:'chk'});const d=D.session({id:`chk-${Math.random()}`,identity:q.identity,blocks:q.blocks},M.state,{delivered:false});return Object.entries(d.systems).filter(([k,v])=>k!=='Unclassified'&&v.metres>0).sort((a,b)=>b[1].metres-a[1].metres).map(([k])=>k)[0]||'';};
    // 27 Oct 2026: Claude's entries are now whole, different sets (not one of Andy's with a number changed). Each must
    // parse to real metres, its main system must be one it is tagged with (main sets), and no two sets in the library
    // may be the same shape -- same words, only the numbers different (Andy: "no need to have ... three instead of four").
    const vars=all.filter(x=>x.origin==='variation');const wrong=[];const seen=new Map();
    for(const x of all.filter(z=>z.origin!=='session'&&z.origin!=='coach')){const k=SL.shape(x.text);if(seen.has(k)&&(x.origin==='variation'||seen.get(k).origin==='variation'))wrong.push(`${x.id}: same shape as ${seen.get(k).id}`);if(!seen.has(k))seen.set(k,x);}
    for(const v of vars){const q=M.parser.parse(`${v.section}\n${v.text}`,{id:'m'});if(!(M.session.total(q)>0))wrong.push(`${v.id}: no metres`);if(v.section==='MAIN SET'){const s0=sys(v.section,v.text);if(!(v.fits||[]).includes(s0))wrong.push(`${v.id}: main system ${s0} not in ${v.fits}`);}
      const idx=[...v.text.matchAll(/^\s*#\s*(\d+)(?:\s*[-–—]\s*(\d+))?/gm)].map(m=>Number(m[2]||m[1]));const reps=Number((v.text.match(/^\s*(\d+)\s*x\s*\d/m)||[])[1]||0);if(idx.length&&reps&&(v.text.match(/^\s*\d+\s*x\s*\d/gm)||[]).length===1&&/^\s*\d+\s*x/.test(v.text.split('\n')[0])&&Math.max(...idx)!==reps)wrong.push(`${v.id}: #-pattern ${Math.max(...idx)} vs ${reps} reps`);}
    const p01=all.find(x=>x.code==='P01');
    return{total:all.length,by,vars:vars.length,wrong,p01:{status:p01.status,issues:p01.issues},mine:all.filter(x=>x.origin==='session').length,authors:[...new Set(all.map(x=>x.author))]};},ORG);
  assert.ok(r.total>=140,`a full library (${r.total})`);assert.ok(r.vars>=50,`Claude's different sets: ${r.vars}`);
  assert.ok(r.by.Andy>=50&&r.by.ChatGPT>=10&&r.by.Claude>=50,`authors: ${JSON.stringify(r.by)}`);assert.ok(r.mine>=2,"Andy's own session sets are in the library");
  assert.deepEqual(r.wrong,[],r.wrong.join('\n'));
  assert.equal(r.p01.status,'check');assert.match(r.p01.issues.join(' '),/200 hands-by-side on #1 stroke/);
  // 4. suggestions in the writer
  const sug=async date=>p.evaluate(date=>{const M=window.MSOS4,SM=M.sessionMethodology;const s={id:'w',identity:{date,dayPart:'PM',squads:['National']},blocks:[]};
    const o=SM.stageOptions(s,M.state,{source:'plan',system:'Threshold',phase:'Base Skills'},{plannedSystem:'Threshold'},'MAIN SET');return o.top.map(x=>({id:x.id,first:x.text.split('\n')[0].trim().toLowerCase(),base:x.base||x.id,author:x.author,status:x.status}));},date);
  const d1=await sug('2026-10-20'),d2=await sug('2026-10-23');
  assert.ok(d1.length>=5&&d1.length<=6,`5-6 options: ${d1.length}`);
  assert.equal(new Set(d1.map(x=>x.first)).size,d1.length,'no two start the same way');assert.equal(new Set(d1.map(x=>x.base)).size,d1.length,'no two from the same set');
  assert.ok(d1.filter(x=>x.status!=='approved').length<=1,'at most one not-yet-reviewed set');assert.ok(d1.every(x=>x.status==='approved'||x.status==='proposed'));
  assert.notDeepEqual(d1.map(x=>x.id),d2.map(x=>x.id),'a different mix on another day');
  // the writer shows authors, and the head coach's ✓/✗ on a new one
  await p.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-20'}));await p.waitForSelector('#coreSlot');
  await p.fill('#coreRaw','WARM UP\n400 free\nPRE SET\n8 x 50 Kick Build @1:00');await p.waitForTimeout(600);
  await p.evaluate(()=>{const b=document.querySelector('#modalHost [data-msos-stage="MAIN SET"]');b&&b.click();});await p.waitForTimeout(300);
  const panel=await p.evaluate(()=>{const box=document.querySelector('#modalHost .msos-fits');return{authors:[...box.querySelectorAll(':scope > .msos-fit .sl-author')].map(x=>x.textContent),lib:box.querySelector('[data-sl-open]')?.textContent||''};});
  assert.ok(panel.authors.length>=5,`every option shows its author: ${panel.authors}`);assert.match(panel.lib,/Set library · \d{3} sets · \d+ waiting/);
  // review from the suggestion (force a Claude one into view via the library API to keep this deterministic)
  const v=await p.evaluate(()=>{const M=window.MSOS4,x=M.setLibrary.all().find(z=>z.origin==='variation');M.setLibrary.review(x.id,'rejected');return{id:x.id,status:M.setLibrary.byId(x.id).status,queued:M.state.pending.filter(q=>q.table==='msos_set_library').map(q=>M.cloud.recordFor(q))};});
  assert.equal(v.status,'rejected');assert.equal(v.queued.length,1);assert.equal(v.queued[0].status,'rejected');assert.equal(v.queued[0].organisation_id,ORG);assert.equal(v.queued[0].author,'Claude');
  const offered=await p.evaluate(id=>{const M=window.MSOS4,SM=M.sessionMethodology;let seen=false;for(const date of ['2026-10-20','2026-10-21','2026-10-22','2026-10-24','2026-10-25','2026-10-26']){const s={id:'w',identity:{date,dayPart:'PM',squads:['National']},blocks:[]};for(const st of ['PRE SET','MAIN SET','POST SET']){const o=SM.stageOptions(s,M.state,null,null,st);if([...o.top,...o.more].some(x=>x.id===id))seen=true;}}return seen;},v.id);
  assert.equal(offered,false,'a dropped set is never offered again');
  // 5. the Set library screen: Waiting tab, keep, edit + keep
  await p.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';window.MSOS4.setLibraryUI.open({tab:'waiting',author:'Claude'});});await p.waitForSelector('[data-sl-row]');
  const first=await p.getAttribute('[data-sl-row]','data-sl-row');await p.click(`[data-sl-do="approved"][data-sl-id="${first}"]`);
  assert.equal(await p.evaluate(id=>window.MSOS4.setLibrary.byId(id).status,first),'approved');
  const p01=await p.evaluate(()=>window.MSOS4.setLibrary.all().find(x=>x.code==='P01').id);
  await p.evaluate(()=>window.MSOS4.setLibraryUI.open({tab:'waiting',author:'',q:'bands only @ 1:30'}));await p.waitForSelector(`[data-sl-edit="${p01}"]`);await p.click(`[data-sl-edit="${p01}"]`);
  await p.fill(`[data-sl-row="${p01}"] [data-sl-text]`,'8 x 50 Bands Only @ 1:30 Build\n4 x 50 #1 @ 1:15\n25 Hands by Side / 25 Swim');await p.click(`[data-sl-save="${p01}"]`);
  const fixed=await p.evaluate(id=>{const x=window.MSOS4.setLibrary.byId(id);return{status:x.status,text:x.text,issues:x.issues};},p01);
  assert.equal(fixed.status,'approved');assert.match(fixed.text,/25 Hands by Side \/ 25 Swim/);assert.deepEqual(fixed.issues,[]);
  // an assistant adds a set: it waits; they can't approve
  const asst=await p.evaluate(()=>{const M=window.MSOS4;M.state.settings.activeRole='assistant';M.state.settings.assistantSquads=['National'];let err='';const x=M.setLibrary.add({section:'MAIN SET',text:'4 x 200 Dev 10sR\n2 x 400 Overload 10sR'});try{M.setLibrary.review(x.id,'approved');}catch(e){err=e.message;}M.state.settings.activeRole='owner';return{x,err};});
  assert.equal(asst.x.status,'proposed');assert.match(asst.err,/Only the head coach/);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SET_LIBRARY_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
