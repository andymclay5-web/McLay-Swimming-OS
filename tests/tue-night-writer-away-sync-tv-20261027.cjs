'use strict';
// Andy, Tue 27 Oct 2026, 8:20-8:35pm:
//  1. Writer: "separating that session planning bit, so you don't have to scroll down ... a button for generate the
//     session" + the AI check "has got to be easy to find". -> one-line brief, Build it for me / Check my set / Tidy up
//     right above the box, part-by-part ideas closed under it.
//  2. Voice: "it just showed me all my words ... it needs to translate my words into a normal session format" -> the
//     transcript is tidied into his layout straight in, his own words kept.
//  3. "When another coach has finished a session ... or a swimmer does a session remotely, I need to see that pop up on
//     my screen and know that that information is stored against their profile." -> While you were away.
//  4. "the constant need to refresh and add to cloud" -> a status dot that says where the work is.
//  5. TV: "play a YouTube video of Katie Ledecky ... it will search for that and paste the URL" -> search on the TV panel.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.clock.install({time:new Date('2026-10-27T15:10:00+13:00')});
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.awayInbox&&window.MSOS4?.syncStatus&&window.MSOS4?.sessionMethodology?.tidyDictation&&window.MSOS4?.storageEngine?.ready,{timeout:30000});await p.waitForTimeout(600);
  await p.evaluate(()=>{window.MSOS4.awayInbox.maybePop=()=>{};});

  // 1. writer layout
  await p.evaluate(()=>window.MSOS4.actions.openNewSession({}));await p.waitForSelector('[data-msos-tools]');await p.waitForTimeout(400);
  const top=await p.evaluate(()=>{const h=document.querySelector('#modalHost'),y=s=>h.querySelector(s)?.getBoundingClientRect().top;return{brief:y('[data-msos-brief-wrap]'),tabs:y('.intake-tabs'),tools:y('[data-msos-tools]'),box:y('#coreRaw'),ideas:y('[data-msos-ideas]'),briefOpen:h.querySelector('[data-msos-brief-wrap]').open,ideasOpen:h.querySelector('[data-msos-ideas]').open,tabsText:[...h.querySelectorAll('[data-core-tab]')].map(x=>x.textContent)};});
  assert.ok(top.brief<top.tabs&&top.tabs<top.tools&&top.tools<top.box&&top.box<top.ideas,`order: ${JSON.stringify(top)}`);
  assert.equal(top.briefOpen,false,'the brief is one line until tapped');assert.equal(top.ideasOpen,false,'set ideas are closed under the box');
  assert.deepEqual(top.tabsText,['Type','Speak','Photo']);
  assert.ok(top.box-top.tools<200,'Build / Check / Tidy sit right above the box');
  assert.match(await p.textContent('[data-msos-brief-wrap] summary'),/Tue PM/);
  // Build it for me (nothing typed) -> a full draft from the plan, in the box
  await p.click('[data-msos-tool="build"]');await p.click('[data-msos-build-go]');await p.waitForTimeout(400);
  const drafted=await p.evaluate(()=>window.MSOS4.session.total(window.MSOS4.parser.parse(document.querySelector('#coreRaw').value,{id:'x'})));
  assert.ok(drafted>=2500,`built a session: ${drafted}m`);
  // Check my set -> the app's own checks straight away (AI review needs sign-in)
  await p.click('[data-msos-tool="check"]');await p.waitForSelector('[data-msos-tool-panel] [data-msos-check]');
  assert.match(await p.textContent('[data-msos-tool-panel]'),/SESSION CHECK/);
  // Tidy up -> his words into his format, line breaks kept, his words kept and restorable
  const said='okay so warm up four hundred choice then we\'ll do four fifties kick build on the minute';
  await p.evaluate(s=>{const A=window.MSOS4.assistant;A.available=()=>true;A.ask=async q=>{window.__q=q;return{answer:'Nothing unclear.',session_text:'WARM UP\n400 Choice\n\nMAIN SET\n4 x 50 Kick Build @1:00'};};document.querySelector('#coreRaw').value=s;},said);
  await p.click('[data-msos-tool="tidy"]');await p.waitForSelector('[data-msos-tidy-undo]');
  assert.equal(await p.inputValue('#coreRaw'),'WARM UP\n400 Choice\n\nMAIN SET\n4 x 50 Kick Build @1:00');
  assert.match(await p.evaluate(()=>window.__q),/Keep every set exactly[\s\S]*Paraphrase everything else/);
  assert.equal(await p.textContent('[data-msos-said] pre'),said,'what he said is kept');
  await p.click('[data-msos-tidy-undo]');assert.equal(await p.inputValue('#coreRaw'),said);
  // 2. voice: the transcript goes through the same tidy, straight in
  await p.evaluate(s=>{document.querySelector('#coreRaw').value=s;},said);
  const ok=await p.evaluate(()=>window.MSOS4.sessionMethodology.tidyDictation(document.querySelector('#coreRaw')));
  assert.equal(ok,true);assert.match(await p.inputValue('#coreRaw'),/^WARM UP\n400 Choice/);
  await p.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

  // 3. While you were away
  const away=await p.evaluate(async()=>{const M=window.MSOS4;
    const mk=(id,date,part,squads,by,extra={})=>{const s=M.parser.parse('WARM UP\n400 Choice\n\nMAIN SET\n8 x 100 Dev 10sR',{id});s.id=id;s.identity={date,dayPart:part,squads};s.finish={throughBlockId:'x',actualDistance:1200,plannedDistance:1200,attendanceCount:9,finishedAt:new Date().toISOString(),review:{wentWell:'Great turns',carryForward:'More kick'},...extra};s.changes=[{type:'finish_here_block',by}];M.state.canonicalSessions[id]=s;return s;};
    mk('jordan-am','2026-10-27','AM',['Development'],{role:'assistant',name:'Jordan'});
    mk('andy-am','2026-10-27','AM',['National'],{role:'owner',name:'Owner'});
    const f=M.parser.parse('MAIN SET\n4 x 400 IM',{id:'fri'});f.id='fri';f.identity={date:'2026-10-23',dayPart:'AM',squads:['National']};M.state.canonicalSessions.fri=f;
    M.state.athletes=M.state.athletes||[];M.state.athletes.push({id:'athlete-matt',full_name:'Matthew Robertson',squad:'National',active:true});
    M.cloud.ready=()=>true;M.cloud.org=()=>'org';const acked=[];
    M.swimmerInviteBN.rpc=async n=>n==='msos_owner_swimmer_access'?[{athlete_id:'athlete-matt',devices:1}]:n==='msos_owner_swimmer_session_actions'?[{id:'a1',athlete_id:'athlete-matt',session_id:'fri',action_type:'finish',payload:{rpe:4,feeling:'Good',completion:'Completed as planned',best:'fly hands'},created_at:new Date().toISOString()},{id:'a2',athlete_id:'athlete-matt',session_id:'fri',action_type:'edit_request',payload:{change:'800 pull no paddles',reason:'no gear bag'},created_at:new Date().toISOString()}]:[];
    M.swimmerInviteBN.acknowledgeSessionAction=async id=>{acked.push(id);return true;};window.__acked=acked;
    await M.awayInbox.refresh({force:true});
    const att=(M.state.attendance||[]).find(x=>x.session_id==='fri'&&x.athlete_id==='athlete-matt');
    const u=M.awayInbox.unseen();M.awayInbox.open({items:u});
    return{kinds:u.map(x=>x.kind).sort(),finishers:u.filter(x=>x.kind==='finish').map(x=>x.session.id),att:att?.status,bell:document.querySelector('#awayBtn .away-count')?.textContent};});
  assert.deepEqual(away.kinds,['finish','swim-edit_request','swim-finish']);
  assert.deepEqual(away.finishers,['jordan-am'],'another coach\'s finish shows; his own does not');
  assert.equal(away.att,'present','the remote finish counts in Matthew\'s training (session reached this phone after he tapped Finish)');
  assert.equal(away.bell,'3');
  const sheet=(await p.textContent('#awaySheet')).replace(/\s+/g,' ');
  assert.match(sheet,/Jordan finished Tue, 27 Oct · AM · Development/);assert.match(sheet,/Went well: Great turns/);
  assert.match(sheet,/Matthew Robertson finished Fri, 23 Oct/);assert.match(sheet,/Saved to Matthew's profile/);assert.match(sheet,/800 pull no paddles/);
  await p.click('[data-away-ok]');
  assert.deepEqual(await p.evaluate(()=>({n:window.MSOS4.awayInbox.unseen().length,acked:window.__acked.slice().sort(),hidden:document.querySelector('#awaySheet').hidden})),{n:0,acked:['a1','a2'],hidden:true});

  // 4. cloud status dot
  assert.match(await p.textContent('#syncDot'),/Not signed in/);
  await p.evaluate(()=>{const M=window.MSOS4;M.store.auth=()=>({access_token:'t',user:{id:'u'}});M.state.settings.cloudWritesEnabled=true;M.state.pending=[{table:'sessions',action:'upsert',record:{id:'s'}},{table:'attendance',action:'upsert',record:{id:'a'}}];M.cloud.flush=async()=>({skipped:true});M.syncStatus.paint();});
  assert.match(await p.textContent('#syncDot'),/Saving · 2 waiting/);
  await p.evaluate(()=>{window.MSOS4.state.pending=[];window.MSOS4.syncStatus.paint();});
  assert.match(await p.textContent('#syncDot'),/All saved/);

  // 5. TV: find a YouTube video by description on the main TV panel
  await p.evaluate(()=>{const M=window.MSOS4;M.cloud.fetch=async(path,o)=>{window.__vq=[path,JSON.parse(o.body)];return{videos:[{url:'https://www.youtube.com/watch?v=abcdefghijk',title:'Katie Ledecky freestyle',channel:'Swim'}]};};M.tvDisplay.openControls();});
  await p.fill('[data-tv-q]','Katie Ledecky swimming freestyle');await p.click('[data-tv-find]');await p.waitForSelector('[data-tv-yt="0"]');await p.click('[data-tv-yt="0"][data-tv-m="full"]');
  const tv=await p.evaluate(()=>({q:window.__vq,cur:window.MSOS4.tvDisplay.current()}));
  assert.deepEqual(tv.q,['/functions/v1/msos-video-search',{query:'Katie Ledecky swimming freestyle'}]);
  assert.equal(tv.cur.url,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(tv.cur.mode,'full');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TUE_NIGHT_WRITER_AWAY_SYNC_TV_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
