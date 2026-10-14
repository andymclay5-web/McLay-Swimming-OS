'use strict';
// Andy, 13 Oct 2026, after training:
//  1. "the whole cloud sync thing ... I don't want to keep having to push cloud sync. And Jordan doesn't seem to have
//     any option to ... force a sync" -> sign-in renews itself, a change is sent a few seconds after it's saved, and a
//     signed-in coach device turns sync on by itself.
//  2. Jordan's suggestions were generic: the season/weekly plan only lived on Andy's phone -> the head coach's active
//     plan datasets are shared to every coach (msos_shared_datasets; cloud stubbed here).
//  3. "it's supposed to be an anaerobic power session -- the sets that popped up in the main set should have all been
//     specific anaerobic power ... slightly extended in the recovery because it's an aerobic training phase" and
//     "did the same set I did last night".
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.seasonPlanner&&window.MSOS4?.sessionMethodology?.adjustForPhase&&window.MSOS4?.dataRegistry?.shareSync&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(600);
    await page.evaluate(()=>{window.__origCloudFetch=window.MSOS4.cloud.fetch;});

    // ---------- 3. Suggestions follow the brief ----------
    await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry;
      const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development']});
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]])await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));
      const put=(id,date,text)=>{const s=M.parser.parse(text,{date,dayPart:'PM',squads:['National']});s.id=id;s.identity={...s.identity,date,dayPart:'PM',squads:['National'],start:'18:30',end:'20:00'};M.store.putSession(M.state,s);};
      put('last-night','2026-10-12','WARM UP\n400 free\nMAIN SET\n6 x 25 @1:00\n#1 Build\n#2-6 @100 Pace\n10 x 100 10sR\n#1-3 Dev\n#4-6 OL\n#7-10 AT\nWARM DOWN\n200 easy');
      put('older','2026-10-01','WARM UP\n400 free\nMAIN SET\n8 x 25 @100 Pace @1:00\nWARM DOWN\n200 easy');
      M.state.settings.storageRevision=(Number(M.state.settings.storageRevision)||0)+1;});
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#coreSlot');
    await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/PM .*National/.test(x.textContent));sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.fill('#coreRaw','WARM UP\n400 free\nMAIN SET\n4 x 50 @2:30\n#1 Build\n#2-4 @100 Pace');await page.waitForTimeout(800);
    // 15 Oct 2026: suggestions come stage by stage -- with a warm-up and an on-brief main set written, the next part
    // is the pre-set; the coach taps "Main set" to see more main-set options.
    assert.equal(await page.getAttribute('[data-msos-stage-panel]','data-msos-stage-panel'),'PRE SET','next part to write is the pre-set');
    await page.click('#modalHost [data-msos-stage="MAIN SET"]');await page.waitForTimeout(300);
    const sug=await page.evaluate(()=>{const box=document.querySelector('#modalHost [data-msos-brief] .msos-fits');const top=[...box.querySelectorAll(':scope > .msos-fit')].map(r=>r.textContent.replace(/\s+/g,' ').trim());return{head:box.querySelector('.msos-check-title')?.textContent||'',top};});
    assert.match(sug.head,/Anaerobic Power/,`tonight's brief is Anaerobic Power: ${sug.head}`);
    const mainTop=sug.top.filter(t=>/MAIN SET/.test(t));
    assert.ok(mainTop.length>=2,`main-set suggestions offered: ${sug.top.join(' | ')}`);
    for(const t of mainTop){assert.doesNotMatch(t,/\b(Dev|OL|AT|CL|Reg)\b|Development|Threshold|Overload|Clearance/,`only anaerobic power main sets: ${t}`);}
    assert.ok(!sug.top.some(t=>/10 x 100/.test(t)),'his mixed Dev/OL/AT set from last night is not suggested');
    assert.ok(!sug.top.some(t=>/6 x 25 → 100 pace/.test(t)),"last night's 6 x 25 race-pace set isn't offered again");
    assert.ok(sug.top.some(t=>/8 x 25 @100 Pace/.test(t)&&/yours/.test(t)),'his own older race-pace set is offered');
    assert.ok(sug.top.some(t=>/\+recovery \(aerobic phase\)/.test(t)),'base phase: race-pace sets carry extra recovery');
    // Adding one inserts the extended send-offs.
    const rpBtn=await page.evaluate(()=>[...document.querySelectorAll('#modalHost [data-msos-brief] .msos-fits > .msos-fit')].find(r=>/200 pace rounds/.test(r.textContent))?.querySelector('[data-msos-insert]')?.dataset.msosInsert);
    assert.equal(rpBtn,'rp-200');
    await page.click(`#modalHost [data-msos-brief] .msos-fits > .msos-fit [data-msos-insert="rp-200"]`);await page.waitForTimeout(400);
    assert.match(await page.inputValue('#coreRaw'),/200 Easy @4:15/,'inserted with +15s (4:00 -> 4:15)');
    // "All components": other systems are kept apart under their own heading.
    const more=await page.evaluate(()=>{const d=document.querySelector('#modalHost [data-msos-more]');d.open=true;return d.innerHTML;});
    assert.match(more,/Other systems \(not today's focus\)[\s\S]*12 x 100 Dev → OL → AT → CL/,'the zone ladder sits under Other systems');
    // The draft keeps the main set in the system.
    const draft=await page.evaluate(()=>{const M=window.MSOS4,sl=M.calendar.slots('2026-10-13').find(x=>x.dayPart==='PM'&&(x.squads||[x.squad]).includes('National'));return M.sessionMethodology.draftFromBrief(M.calendar.identityFromSlot(sl));});
    const main=(draft.text.split('MAIN SET\n')[1]||'').split(/\n\n/)[0];
    assert.match(main,/@100 Pace|@200 Pace/,`draft main set is race pace: ${main}`);
    assert.doesNotMatch(main,/\b(Dev|OL|AT|CL)\b/,`no other zones in the anaerobic power main set: ${main}`);
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // ---------- 2. Plans shared to coach phones ----------
    const share=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,D=M.dataRegistry;const store={};const calls=[];
      C.ready=()=>true;C.org=()=>'org-1';
      C.fetch=async(path,opts={})=>{calls.push([opts.method||'GET',path]);if(/msos_shared_datasets\?on_conflict/.test(path)){const b=JSON.parse(opts.body);store[b.dataset_type]=b;return null;}
        if(/msos_shared_datasets\?select=dataset_type/.test(path))return Object.values(store).map(r=>({dataset_type:r.dataset_type,dataset_id:r.dataset_id,imported_at:r.imported_at}));
        if(/msos_shared_datasets\?select=dataset&/.test(path)){const t=(path.match(/dataset_type=eq\.([a-z_]+)/)||[])[1];return store[t]?[{dataset:store[t].dataset}]:[];}return[];};
      const owner=await D.shareSync();
      const sentSeason=store.season_plan?.dataset_id===D.ensureState().active.season_plan;
      // Jordan's phone: no plan at all, then the shared one arrives.
      const reg=D.ensureState();const mine={season:reg.active.season_plan,weekly:reg.active.weekly_plan};delete reg.active.season_plan;delete reg.active.weekly_plan;M.state.seasonPlans=[];M.state.weeklyPlans=[];
      M.access.setRole('assistant',{assistantId:'jordan'});const asst=await D.shareSync();const pushedByAssistant=calls.filter(c=>c[0]==='POST').length;M.access.setRole('owner');
      const brief=M.sessionMethodology.planBrief({id:'p',identity:{date:'2026-10-13',dayPart:'PM',squads:['National'],start:'18:30',end:'20:00'},blocks:[]});
      return{owner,sentSeason,asst,active:{season:D.ensureState().active.season_plan,weekly:D.ensureState().active.weekly_plan},mine,briefSystem:brief?.system,pushedByAssistant};});
    assert.deepEqual(share.owner.pushed.sort(),['season_plan','weekly_plan'],`owner shares its active plans: ${JSON.stringify(share.owner)}`);
    assert.ok(share.sentSeason);
    assert.deepEqual(share.asst.pulled.sort(),['season_plan','weekly_plan'],'a coach phone with no plan takes the shared ones');
    assert.equal(share.active.season,share.mine.season);assert.equal(share.active.weekly,share.mine.weekly);
    assert.match(share.briefSystem||'',/Anaerobic Power/,'the coach phone now has tonight\'s brief');
    assert.equal(share.pushedByAssistant,2,'an assistant never pushes plans (only the owner\'s two POSTs)');

    // ---------- 1. Sync runs itself ----------
    const sync=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud;const out={};
      // (a) an expired sign-in is renewed and the call retried
      let refreshed=[];M.cloudSessionEngine.ensureFresh=async(o={})=>{refreshed.push(!!o.force);return{}};
      let n=0;const realFetch=window.fetch;window.fetch=async()=>{n++;if(n===1)return new Response(JSON.stringify({message:'JWT expired'}),{status:401});return new Response('[]',{status:200});};
      C.fetch=window.__origCloudFetch;
      try{out.result=await M.cloud.fetch('/rest/v1/sessions?select=id');}catch(e){out.error=e.message}
      window.fetch=realFetch;out.refreshed=refreshed;out.calls=n;
      // (b) a saved change is sent a few seconds later without anyone pressing anything
      let flushed=0;M.state.settings.cloudWritesEnabled=true;C.ready=()=>true;const realOnce=C.flushOnce;C.flushOnce=async()=>{flushed++;return{ok:1,failed:[],pending:0}};
      C.queue('captures',{id:'cap-x',organisation_id:'org-1'},'upsert');await new Promise(r=>setTimeout(r,3400));out.flushedAfterChange=flushed;
      // (c) a burst of changes is one send, never overlapping
      flushed=0;for(let i=0;i<5;i++)C.queue('captures',{id:'cap-'+i,organisation_id:'org-1'},'upsert');await new Promise(r=>setTimeout(r,3400));out.flushedAfterBurst=flushed;
      // (d) signed in and not yet on: turns itself on
      M.state.settings.cloudWritesEnabled=false;M.teamAccess.isSignedIn=()=>true;let turned=0;const realTurn=C.turnOnSync;C.turnOnSync=async()=>{turned++;M.state.settings.cloudWritesEnabled=true;return{on:true}};
      out.auto=await C.autoSync();out.turned=turned;
      // (e) a build that failed its checks stays off
      M.state.settings.cloudWritesEnabled=false;M.state.settings.cloudWritesSuspended={build:M.BUILD};turned=0;out.suspended=await C.autoSync();out.turnedWhenSuspended=turned;
      C.flushOnce=realOnce;C.turnOnSync=realTurn;M.state.settings.cloudWritesSuspended=null;M.state.settings.cloudWritesEnabled=false;M.state.pending=[];
      return out;});
    assert.deepEqual(sync.refreshed,[false,true],`renewed before the call and again (forced) after a 401: ${JSON.stringify(sync)}`);
    assert.equal(sync.calls,2,'the refused call is tried once more');assert.deepEqual(sync.result,[]);
    assert.equal(sync.flushedAfterChange,1,'a saved change goes to the cloud by itself');
    assert.equal(sync.flushedAfterBurst,1,'five quick changes go in one send');
    assert.equal(sync.turned,1,'a signed-in phone turns sync on by itself');
    assert.equal(sync.turnedWhenSuspended,0,'a build that failed its checks does not');
    assert.deepEqual(errors,[],errors.join(' | '));
    console.log('TEAM_SYNC_AND_BRIEF_SETS_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
