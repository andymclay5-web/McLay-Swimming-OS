'use strict';
// Andy, Tue 27 Oct 2026, 7pm:
//  1. "trying to write the session for tonight, and it keeps just showing as this morning" -- with this morning's
//     session on the Board, + opened Edit for the morning; and the calendar's "Create session" for tonight opened the
//     writer on "AM · 05:30 · Development" (its option-text match found "PM" inside "DeveloPMent").
//  2. "the generate session from brief ... it's just way too short every time. It needs to be ... more realistic of the
//     time frame of my sessions" -- the draft filled to the slot clock by an estimate that runs ~20% long against his
//     real sessions (his 4,400m in a 90-min slot plans at ~112 min), giving ~2,700m.
//  3. "no need to have a different session that's three instead of four ... we want complete variations and different
//     sessions" -- the picker's "variations" were his sets with one number changed.
//  Also: "4 x 25 #1 MAX" was read as a 1m MAX (the 1 of "#1").
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const HIST=[
 ['2026-10-13','PM','WARM-UP\n4 x 200 (100 Free / 100 Reverse IM) 15sR\n\nPRE-SET\n3 Rounds:\n  4 x 50 @1:15\n1 Build\n2 Middle 20m MAX\n3 First 15m MAX\n4 Easy\n\nMAIN SET\n16x100 @dev\n3 fr 1 choice perfect tech\n\nPOST-SET\n8 x 75 Pull @1:30 Desc 1-4\n8 x 25 UW Fins @0:45\n\nWARM-DOWN\n200 Easy'],
 ['2026-10-14','PM','WARM-UP\n4 x 300 (200 Free / 100 Reverse IM)\n\nPRE-SET\n3 x 200 Pull Desc Stroke Count 1-3\n\nMAIN SET\n4 x 200 Dev 10sR\n2 x 400 overload 10sR\n4 x 100 Dev 10sR\n2x 200 thr 10sR'],
 ['2026-10-19','PM','WARM-UP\n600 Choice\n4 x 100 @ 2:00\n25 Hands by Side / 25 Scull / 50 Swim\n\nPRE-SET\n8 x 50 @ 1:10\n#1-2 Minimum Stroke Count\n#3-4 Build\n\nMAIN SET\n5 x 100 #1 Threshold 20sR\n300 Choice\n6 x 100 IM Threshold 20sR\n300 Easy\n7 x 100 Free Threshold 20sR\n200 Easy\n\nPOST-SET\n6 x 200 Pull\nMinimum Stroke Count'],
 ['2026-10-21','PM','WARM-UP\n800 Choice\n12 x 50 Kick @ 1:10 Desc 1-3\n200 IM\n\nPRE-SET\n2 Rounds:\n  3 x 50\n#1-2 Drill\n#3 @200 Pace\n\nMAIN SET\n3 Rounds:\n  200 Freestyle Regeneration\n  200 Freestyle Development\n  4 x 50 #1 @ 1:15\n  100 Easy Choice\n\nPOST-SET\n8 x 50 Bands / Swim Build']
];
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-27T19:10:00+13:00')});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.sessionMethodology?.slotTarget&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.setLibrary,{timeout:30000});await p.waitForTimeout(600);
  // 1a. + with this morning's (finished) session on the Board -> the writer, on tonight's slot
  await p.evaluate(async()=>{const M=window.MSOS4;await M.calendar.load();const s=M.parser.parse('WARM-UP\n400 Choice\n\nMAIN SET\n8 x 100 Dev 10sR',{date:'2026-10-27',dayPart:'AM',squads:['National']});s.id='am-today';s.identity={...s.identity,date:'2026-10-27',dayPart:'AM',squads:['National'],start:'05:20',end:'07:20'};M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;M.store.save(M.state);});
  await p.evaluate(()=>window.MSOS4.actions.openNewSession({fromPicked:true}));await p.waitForSelector('#coreSlot');await p.waitForTimeout(300);
  assert.match(await p.evaluate(()=>document.querySelector('#coreSlot').selectedOptions[0].textContent),/^PM · 18:30/,'+ after the morning opens the writer on tonight');
  assert.equal(await p.$('#sessionEditText'),null,'not Edit of the morning');
  // 1b. calendar -> Tue PM -> Create session -> tonight's slot (not AM "DeveloPMent")
  await p.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
  await p.evaluate(()=>window.MSOS4.ui.openSessionCalendar());await p.waitForSelector('[data-cal-date="2026-10-27"][data-cal-part="PM"]');
  await p.click('[data-cal-date="2026-10-27"][data-cal-part="PM"]');await p.waitForSelector('[data-training-cal-choice]');
  await p.click('[data-training-cal-choice]');await p.waitForSelector('#coreSlot');await p.waitForTimeout(400);
  assert.match(await p.evaluate(()=>document.querySelector('#coreSlot').selectedOptions[0].textContent),/^PM · 18:30-20:00 · National/,'Create session for tonight opens tonight\'s National slot');
  await p.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
  // 2. drafts sized like his own sessions in the slot
  const d=await p.evaluate(HIST=>{const M=window.MSOS4,SM=M.sessionMethodology;for(const [i,[date,part,t]] of HIST.entries()){const sl=M.calendar.slots(date).find(x=>x.dayPart===part&&/National/.test(x.squad));const id=sl?M.calendar.identityFromSlot(sl):{date,dayPart:part,squads:['National']};const s=M.parser.parse(t,{...id,id:'h'+i});s.id='h'+i;s.identity={...id,squads:['National']};M.state.canonicalSessions[s.id]=s;}
    const out=[];for(const date of ['2026-10-27','2026-10-28','2026-11-02']){const sl=M.calendar.slots(date).find(x=>x.dayPart==='PM'&&/National/.test(x.squad));const id=M.calendar.identityFromSlot(sl);const t=SM.slotTarget(id,M.state),dr=SM.draftFromBrief(id,M.state);out.push({date,kind:dr.kind,metres:dr.metres,target:t});}
    const sl=M.calendar.slots('2026-10-28').find(x=>x.dayPart==='PM'&&/National/.test(x.squad));const s={id:'ctx',identity:M.calendar.identityFromSlot(sl),blocks:[]};return{out,ctx:M.assistant?.context?.({session:s})||''};},HIST);
  for(const x of d.out){assert.ok(x.target.metres>=3800&&x.target.count>=2,`target comes from his recent PM sessions: ${JSON.stringify(x.target)}`);
    if(['aerobic','threshold','race','mixed'].includes(x.kind))assert.ok(x.metres>=x.target.metres*0.85,`${x.date} ${x.kind} draft ${x.metres}m is close to his usual ${x.target.metres}m (was ~2,700m)`);}
  assert.match(d.ctx,/typically about [\d,]+m[\s\S]*write a full session of about/,'the AI is told his usual volume, not to fit the slot clock');
  assert.doesNotMatch(d.ctx,/fill the slot: aim for about/,'old slot-clock instruction gone');
  // 3. picker: no two options that differ only in their numbers; Claude's sets are whole different sets
  const lib=await p.evaluate(()=>{const M=window.MSOS4,SL=M.setLibrary,SM=M.sessionMethodology;const vars=SL.all().filter(x=>x.origin==='variation');const libShapes=new Set(SM.LIB.map(x=>SL.shape(x.text)));
    const s={id:'w',identity:{date:'2026-10-27',dayPart:'PM',squads:['National']},blocks:[]};const tops=[];for(const sys of ['Development','Threshold','Race pace','Speed / Max'])for(const st of ['WARM UP','PRE SET','MAIN SET','POST SET'])tops.push(SM.stageOptions(s,M.state,{source:'plan',system:sys,phase:'Base Skills'},{plannedSystem:sys},st).top.map(x=>SL.shape(x.text)));
    return{n:vars.length,countOnly:vars.filter(v=>/instead of/.test(v.label)).length,copies:vars.filter(v=>libShapes.has(SL.shape(v.text))).map(v=>v.id),dupLists:tops.filter(t=>new Set(t).size!==t.length).length,shapeEq:SL.shape('3 Rounds:\n4 x 50 @1:15\nDesc 1-4')===SL.shape('4 Rounds:\n4 x 50 @1:30\nDesc 1-3'),shapeDiff:SL.shape('6 x 100 Dev 10sR')!==SL.shape('8 x 200 Dev 10sR')};});
  assert.ok(lib.n>=50,`Claude's sets: ${lib.n}`);assert.equal(lib.countOnly,0,'no "N instead of M" count variations');assert.deepEqual(lib.copies,[],'none is one of his sets with numbers changed');
  assert.equal(lib.dupLists,0,'no option list offers two sets that differ only in their numbers');assert.ok(lib.shapeEq,'3 rounds vs 4 rounds is the same set');assert.ok(lib.shapeDiff,'100s vs 200s are different sets');
  // #1 MAX is #1 stroke at MAX, not a 1m MAX
  const mx=await p.evaluate(()=>{const M=window.MSOS4;const s=M.parser.parse('MAIN SET\n4 x 25 #1 MAX @1:00',{id:'mx'});const d=M.dosageEngine.session(s,M.state,{delivered:false});return{label:M.boardEngine.workLabel(s.blocks[0].items[0]),speed:d.systems['Speed / Max'].metres};});
  assert.doesNotMatch(mx.label,/1m MAX/,`label: ${mx.label}`);assert.equal(mx.speed,100,'4 x 25 #1 MAX = 100m of speed work');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TUE_PM_WRITER_DRAFT_PICKER_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
