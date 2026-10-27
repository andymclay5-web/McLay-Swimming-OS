'use strict';
// Andy, 15 Oct 2026: session suggestions "need to be ... warm-up options come once you've got the warm-up sussed
// then it comes up with preset options and all of those options need to be tied back to the weekly plan
// objective and then have cues from the season plan ... i.e. in an aerobic capacity phase there might be longer
// recovery between swims" -- using his Session Writing Reference Library -- "so that when Jordan or Caleb are
// doing it, that makes sense". National squad first; younger squads next.
// Proves, in the real app, as an assistant coach writing a session from the suggestions only:
//  1. the panel goes warm-up -> pre-set -> main set -> post-set -> warm-down, each part's options matched to the
//     brief's focus, and a session built only from the suggestions is ON BRIEF;
//  2. the season phase narrows and adjusts: aerobic (Base Skills) phase = harder sets with longer recovery and
//     phase-specific sets only in their phase; a Finish-phase week offers the finish-phase sets unadjusted;
//  3. a non-National squad is told the sets are written for National;
//  4. every set in his library parses to the right distance and every main set is on brief for its own focus;
//  5. rest phrases ("Easy Finish", "Full Recovery Between Reps") no longer make a MAX set count as easy swimming;
//  6. "Anaerobic Power" / "Anaerobic Capacity" weeks are no longer mistaken for the aerobic base phase.
const assert=require('node:assert/strict');
// 27 Oct 2026 writer layout (Andy: no scrolling past the planning bit): the brief and the part-by-part set ideas are
// closed sections a coach taps open, and the start buttons sit under "Build it for me". These open them first.
const openParts=page=>page.evaluate(()=>document.querySelectorAll('#modalHost [data-msos-brief-wrap],#modalHost [data-msos-ideas]').forEach(d=>{d.open=true;}));
const openBuild=page=>page.evaluate(()=>{if(!document.querySelector('#modalHost [data-msos-build-go]'))document.querySelector('#modalHost [data-msos-tool="build"]')?.click();});
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.seasonPlanner&&window.MSOS4?.sessionMethodology?.REFLIB&&window.MSOS4?.dataRegistry?.commit&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(600);
    // The head coach's season plan (as on every coach phone) and an empty week.
    const finishDate=await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry,SM=M.sessionMethodology;
      const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development','Intermediate']});
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]])await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));
      for(const id of Object.keys(M.state.canonicalSessions))if(M.state.canonicalSessions[id]?.identity?.date>='2026-10-08')delete M.state.canonicalSessions[id];
      // a Tuesday PM in the Finish & Breath Control phase
      for(let t=Date.parse('2026-10-13T12:00:00Z');t<Date.parse('2027-04-11T12:00:00Z');t+=7*864e5){const d=new Date(t).toISOString().slice(0,10);const b=SM.planBrief({id:'p',identity:{date:d,dayPart:'PM',squads:['National']},blocks:[]});if(SM.phaseKey(b)==='finish')return d;}
      return null;});
    assert.ok(finishDate,'the generated season has a Finish & Breath Control week');

    // ---------- 1. Jordan writes Tuesday PM (Anaerobic Power, Base Skills phase) from the suggestions ----------
    await page.evaluate(()=>{window.MSOS4.access.setRole('assistant',{assistantId:'jordan'});window.MSOS4.state.settings.assistantSquads=['National'];});
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#modalHost [data-msos-brief-wrap]',{state:'attached'});await openParts(page);await page.waitForSelector('#coreSlot');
    await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/PM .*National/.test(x.textContent));sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForTimeout(700);
    const panel=()=>page.evaluate(()=>{const p=document.querySelector('#modalHost [data-msos-stage-panel]');return p?{stage:p.dataset.msosStagePanel,head:p.querySelector('.msos-check-title')?.textContent||'',notes:[...p.querySelectorAll('.msos-stage-note')].map(x=>x.textContent).join(' / '),rows:[...p.querySelectorAll(':scope > .msos-fit')].map(r=>({id:r.querySelector('[data-msos-insert]').dataset.msosInsert,text:r.textContent.replace(/\s+/g,' ').trim()})),done:[...p.querySelectorAll('[data-msos-stage].done')].map(b=>b.dataset.msosStage)}:null;});
    const addFirst=async()=>{const p=await panel();if(!p?.rows?.length)throw new Error("no options at stage "+JSON.stringify(p)+" text: "+await page.inputValue("#coreRaw"));await page.click(`#modalHost [data-msos-stage-panel] > .msos-fit [data-msos-insert="${p.rows[0].id}"]`);await page.waitForTimeout(700);return p;};
    const seen={};
    let p=await panel();
    assert.equal(p.stage,'WARM UP','an empty session starts with warm-up options');
    assert.match(p.head,/Anaerobic Power[\s\S]*WARM-UP OPTIONS/);
    assert.match(p.notes,/Base Skills \(aerobic\) phase — harder sets shown with longer recovery/);
    assert.ok(p.rows.length>=3&&p.rows.every(r=>/WARM UP ·/.test(r.text)),'only warm-ups are offered');
    seen.wu=await addFirst();
    p=await panel();
    assert.equal(p.stage,'PRE SET','after a warm-up is added, pre-set options come next');
    assert.deepEqual(p.done,['WARM UP']);
    assert.equal(p.rows[0].id,'ref-p09','the Anaerobic Power primer for an aerobic week is the first pre-set in the base phase');
    seen.pre=await addFirst();
    p=await panel();
    assert.equal(p.stage,'MAIN SET');
    assert.ok(p.rows.every(r=>/MAIN SET ·/.test(r.text)));
    assert.ok(!p.rows.some(r=>/Repeated 200-pace blocks|200 pace \(taper\)/.test(r.text)),'Finish/Taper-only sets are not offered in the Base phase');
    assert.ok(p.rows.some(r=>/Progressive race pace|Broken 200/.test(r.text)),'his library Anaerobic Power sets are offered');
    const main=p.rows[0];assert.match(main.text,/\+recovery \(aerobic phase\)/,'harder main sets carry longer recovery in the aerobic phase');
    seen.main=await addFirst();
    const afterMain=await page.inputValue('#coreRaw');
    if(main.id==='ref-anp03')assert.match(afterMain,/4 x 50 #1 @ 1:45/,'ANP03 send-off 1:30 -> 1:45 in the aerobic phase');
    p=await panel();
    assert.equal(p.stage,'POST SET','an on-brief main set moves on to the post-set');
    seen.post=await addFirst();
    p=await panel();assert.equal(p.stage,'WARM DOWN');
    await addFirst();
    const built=await page.evaluate(()=>{const M=window.MSOS4,SM=M.sessionMethodology,raw=document.querySelector('#coreRaw').value;const s=M.parser.parse(raw,{date:'2026-10-13',dayPart:'PM',squads:['National'],id:'built'});s.identity={...s.identity,date:'2026-10-13',dayPart:'PM',squads:['National'],start:'18:30',end:'20:00'};const chk=SM.planTargetCheck(s,M.state);return{raw,chk,sections:raw.match(/^(WARM UP|PRE SET|MAIN SET|POST SET|WARM DOWN)$/gm),brief:document.querySelector('#modalHost .msos-brief-check')?.textContent||''};});
    assert.deepEqual(built.sections,['WARM UP','PRE SET','MAIN SET','POST SET','WARM DOWN'],`built in order: ${built.raw}`);
    assert.equal(built.chk.plannedSystem,'Race pace');
    assert.equal(built.chk.matches,true,`a session built only from the suggestions is on brief: ${built.raw}`);
    assert.match(built.brief,/on brief/);
    // The coach can lead: tap a stage to see its options.
    await page.click('#modalHost [data-msos-stage="PRE SET"]');await page.waitForTimeout(300);
    assert.equal((await panel()).stage,'PRE SET','tapping a stage shows that part');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // ---------- 2. Finish & Breath Control phase: finish sets offered, no aerobic-phase recovery ----------
    await page.evaluate(d=>window.MSOS4.actions.openNewSession({date:d}),finishDate);await page.waitForSelector('#coreSlot');
    await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/PM .*National/.test(x.textContent));sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.fill('#coreRaw','WARM UP\n800 Choice\nPRE SET\n8 x 50 Kick Build @1:00');await page.waitForTimeout(800);
    p=await panel();
    assert.equal(p.stage,'MAIN SET');
    assert.match(p.notes,/Finish & Breath Control phase/);
    assert.doesNotMatch(p.notes,/longer recovery/);
    assert.ok(!p.rows.some(r=>/aerobic phase/.test(r.text)),'no aerobic-phase adjustment outside the base phase');
    assert.ok(p.rows.some(r=>/Repeated 200-pace blocks|200 pace repeats|Broken 200/.test(r.text)),`finish-phase Anaerobic Power sets offered: ${p.rows.map(r=>r.text.slice(0,40)).join(' | ')}`);
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // ---------- 3. A younger squad is told these are National sets ----------
    await page.evaluate(()=>{window.MSOS4.access.setRole('owner');});
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#modalHost [data-msos-brief-wrap]',{state:'attached'});await openParts(page);await page.waitForSelector('#coreSlot');
    const hasInter=await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/Intermediate/.test(x.textContent)&&!/National/.test(x.textContent));if(!o)return false;sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));return true;});
    if(hasInter){await page.waitForTimeout(700);assert.match((await panel()).notes,/written for the National squad/);}
    else{const html=await page.evaluate(()=>{const M=window.MSOS4,SM=M.sessionMethodology;const s={id:'i',identity:{date:'2026-10-13',dayPart:'PM',squads:['Intermediate']},blocks:[],metadata:{coachFocus:'Development'}};return SM.briefHtml(s);});assert.match(html,/written for the National squad — scale or simplify them for Intermediate/);}
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // ---------- 4-6. Library integrity, classifier, phase reader ----------
    const lib=await page.evaluate(()=>{const M=window.MSOS4,SM=M.sessionMethodology,D=M.dosageEngine;const want={aerobic:'Development',threshold:'Threshold',race:'Race pace',speed:'Speed / Max'};const PH={base:'Base Skills',underwater:'Under Water',turns:'Dives & Turns',finish:'Finish & Breath Control',taper:'Taper & Race'};
      const total={},off=[];for(const c of SM.REFLIB){const s=M.parser.parse(`${c.section}\n${c.text}`,{date:'2026-10-20',id:'t-'+c.id,course:'SCM'});total[c.code]=M.session.total(s);
        const sys=want[c.focus[0]];if(c.section==='MAIN SET'&&sys){const ms=M.parser.parse(`WARM UP\n400 Free\n\nMAIN SET\n${c.text}\n\nWARM DOWN\n200 Easy`,{date:'2026-10-20',id:'m-'+c.id,course:'SCM'});const ph=(c.phases||[]).includes('any')?'':PH[c.phases[0]]||'';const k=SM.planTargetCheck(ms,M.state,{source:'coach',system:sys,coachFocus:sys,phase:ph,weekFocus:''});if(!k.matches)off.push(`${c.code} (${k.dominantSystem})`);}}
      const sysOf=t=>{const s=M.parser.parse(`MAIN SET\n${t}`,{date:'2026-10-20',id:'z',course:'SCM'});const d=D.session(s,M.state,{delivered:false});return Object.entries(d.systems).filter(([,v])=>v.metres>0).sort((a,b)=>b[1].metres-a[1].metres).map(([k])=>k)[0];};
      return{count:SM.REFLIB.length,mains:SM.REFLIB.filter(c=>c.section==='MAIN SET').length,total,off,
        maxEasy:sysOf('4 x 25 Fins @ 1:30 15m Underwater MAX / Easy Finish'),maxRec:sysOf('4 x 15 Dive Start MAX\nFull Recovery Between Reps'),easy:sysOf('200 Easy'),rec:sysOf('4 x 50 Recovery'),
        phases:['Freestyle · Finish & Breath Control · Anaerobic Power','Freestyle · Dives & Turns · Anaerobic Capacity','Freestyle · Base Skills · Aerobic Capacity','Freestyle · Under Water · Aerobic Power'].map(w=>SM.phaseKey({weekFocus:w}))};});
    assert.equal(lib.count,52,'all 52 sets from his library');
    assert.equal(lib.mains,25);
    assert.deepEqual(lib.off,[],'every library main set is on brief for its own focus');
    for(const[k,v]of Object.entries({W01:800,W02:1500,W03:1600,W05:1200,W06:2100,W07:1000,P01:600,P03:1000,P08:400,AC01:1700,AC04:3000,AP01:2400,AP02:2250,AP03:2600,AP06:1400,ANC03:200,ANP01:2700,ANP02:1500,ANP04:2000,ANP05:1500,ANP06:1050,MX01:2900,MX02:2000,PS03:800,PS05:1200}))assert.equal(lib.total[k],v,`${k} distance`);
    assert.equal(lib.total.W09,0,'the 45-minute own race warm-up adds no invented distance');
    assert.equal(lib.maxEasy,'Speed / Max','"15m Underwater MAX / Easy Finish" is speed work');
    assert.equal(lib.maxRec,'Speed / Max','"Dive Start MAX / Full Recovery Between Reps" is speed work');
    assert.equal(lib.easy,'Regeneration');assert.equal(lib.rec,'Regeneration');
    assert.deepEqual(lib.phases,['finish','turns','base','underwater'],'Anaerobic weeks are not read as the aerobic base phase');
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('SESSION_LIBRARY_STAGES_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
