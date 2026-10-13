'use strict';
// Andy, 13 Oct 2026, 6:37pm: "Jordan wrote a session on his phone but I can't see it. When I hit any tonight
// session it just is blank asking me to write it."
//  1. The owner's phone only ever read the ONE selected session back from the cloud, so a session another coach
//     wrote never arrived. C.pullTeamSessions now brings in sessions written/changed elsewhere, without selecting
//     anything or changing the view.
//  2. The owner-beats-assistant rule let an EMPTY slot opened on the owner's phone win over the session Jordan
//     actually wrote for that slot (and re-send the empty copy over his). An empty, unedited local slot now takes
//     the other coach's written session; the owner's real work still wins.
// Cloud is stubbed (this sandbox cannot reach Supabase); the rows are the app's own cloud projection of a session.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.cloud?.pullTeamSessions&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(600);
    const r=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,st=M.state;
      const ident={date:'2026-10-13',dayPart:'PM',squads:['National'],venue:'AquaGym',course:'SCM',start:'18:30',end:'20:00',title:'PM · National'};
      const mk=(id,text)=>{const s=M.parser.parse(text,{...ident,id});s.id=id;s.identity={...s.identity,...ident};return s;};
      // What Jordan's phone sent: his written session for tonight's slot, plus one for Thursday.
      const jordan=mk('slot-tonight','WARM UP\n400 free\nMAIN SET\n8 x 100 free @1:40\nWARM DOWN\n200 easy');jordan.lastEditedBy={role:'assistant',name:'Jordan'};
      const thu=mk('thu-jordan','WARM UP\n600 free\nMAIN SET\n10 x 50 kick');thu.identity={...thu.identity,date:'2026-10-15'};thu.lastEditedBy={role:'assistant',name:'Jordan'};
      const rowsFor=s=>({row:{...C.projectSession(s),last_editor_role:'assistant',last_editor_name:'Jordan',updated_at:'2026-10-13T05:30:00Z'},blocks:(s.blocks||[]).map(b=>C.projectBlock(s,b))});
      const cloud={'slot-tonight':rowsFor(jordan),'thu-jordan':rowsFor(thu)};
      const calls=[];
      C.ready=()=>true;C.org=()=>'org-1';
      C.fetch=async path=>{calls.push(path);const id=(path.match(/[?&]id=eq\.([^&]+)/)||[])[1];const sid=(path.match(/session_id=eq\.([^&]+)/)||[])[1];
        if(/^\/rest\/v1\/sessions\?/.test(path)){if(id)return cloud[decodeURIComponent(id)]?[cloud[decodeURIComponent(id)].row]:[];return Object.values(cloud).map(x=>x.row);}
        if(/^\/rest\/v1\/session_blocks\?/.test(path)){if(sid)return cloud[decodeURIComponent(sid)]?.blocks||[];return Object.values(cloud).flatMap(x=>x.blocks);}
        return[];};
      // Andy's phone: tonight's slot opened but nothing written (empty, owner, no edits) and on screen.
      const empty={id:'slot-tonight',kind:'session',identity:{...ident},blocks:[],metadata:{},changes:[]};
      st.canonicalSessions['slot-tonight']=empty;M.selectSession('slot-tonight');st.pending=[];
      delete st.canonicalSessions['thu-jordan'];st.settings.teamSessionsPulledAt=null;
      const view=st.settings.view;
      // The selected slot: the 25s reconcile now takes Jordan's written session and does not re-send the empty one.
      const rec=await C.reconcileSession('slot-tonight');
      const after=st.canonicalSessions['slot-tonight'];
      const resent=(st.pending||[]).some(p=>p.table==='sessions'&&p.record?.id==='slot-tonight');
      // The team pull: Thursday's session arrives; nothing is selected for the coach.
      const pull=await C.pullTeamSessions();
      // Owner's real work still beats an assistant's copy.
      const mine=mk('slot-tonight','WARM UP\n800 free\nMAIN SET\n4 x 400 pull');mine.changes=[{at:'x',kind:'edit'}];mine.lastEditedBy={role:'owner',name:'Andy'};st.canonicalSessions['slot-tonight']=mine;
      const rec2=await C.reconcileSession('slot-tonight');
      return{rec:rec?.applied,total:M.session.total(after),resent,pull,thu:M.session.total(st.canonicalSessions['thu-jordan']||{blocks:[]}),selected:st.settings.selectedSessionId,viewSame:st.settings.view===view,cursor:st.settings.teamSessionsPulledAt,rec2:rec2?.applied||'local',mineKept:M.session.total(st.canonicalSessions['slot-tonight']),
        squadScoped:calls.some(c=>/sessions\?select=\*&organisation_id=eq\.org-1&updated_at=gt\./.test(c))};});
    assert.equal(r.rec,'remote','an empty slot on the owner\'s phone takes the session Jordan wrote for it');
    assert.equal(r.total,1400,'Jordan\'s session (400 + 800 + 200) is now on Andy\'s phone');
    assert.equal(r.resent,false,'the empty copy is never sent back over Jordan\'s session');
    assert.ok(r.pull.added>=1,`team pull brought in Thursday: ${JSON.stringify(r.pull)}`);
    assert.equal(r.thu,1100,'Jordan\'s Thursday session arrived');
    assert.equal(r.selected,'slot-tonight','the team pull never changes the selected session');
    assert.ok(r.viewSame,'the team pull never changes the view');
    assert.equal(r.cursor,'2026-10-13T05:30:00Z','next pull only asks for newer changes');
    assert.ok(r.squadScoped,'pull asks for changes since the last look (squad scope is enforced by the database)');
    assert.notEqual(r.rec2,'remote','the owner\'s own written, edited session still beats an assistant copy');
    assert.equal(r.mineKept,2400);
    // 3. Jordan's Roll was empty: an assistant phone takes the roster the database lets it see; the owner's never.
    const roster=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud;const cloudAth=[{id:'a1',full_name:'William Callow',squad:'National',active:true},{id:'a2',full_name:'Elsie Knowles',squad:'Development',active:true}];
      let asked=0;C.fetch=async path=>{if(/^\/rest\/v1\/athletes\?/.test(path)){asked++;return cloudAth;}return[];};
      const ownerBefore=JSON.stringify(M.state.athletes);const owner=await C.pullTeamRoster();const ownerSame=JSON.stringify(M.state.athletes)===ownerBefore;
      M.state.athletes=[];M.access.setRole('assistant',{assistantId:'jordan'});const asst=await C.pullTeamRoster();const names=M.state.athletes.map(a=>a.full_name).sort();M.access.setRole('owner');
      return{owner,ownerSame,asst,names,asked};});
    assert.equal(roster.owner.skipped,true,'never replaces the owner\'s roster from the cloud');assert.ok(roster.ownerSame);
    assert.deepEqual(roster.names,['Elsie Knowles','William Callow'],'assistant phone now has swimmers for Roll');
    // 4. Chat button after any other pop-up has closed (Andy: "the button doesn't work on mine").
    const chat=await page.evaluate(()=>{const M=window.MSOS4;M.coachChatUI.openPanel();M.coachChatUI.closePanel();document.querySelector('#modalHost').innerHTML='';M.coachChatUI.openPanel();const p=document.querySelector('.cc-backdrop');return!!(p&&p.isConnected&&!p.hidden);});
    assert.equal(chat,true,'chat opens even after another pop-up cleared the screen');
    assert.deepEqual(errors,[],errors.join(' | '));
    console.log('TEAM_SESSIONS_REACH_OWNER_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
