'use strict';
// Andy, Mon 16 Nov 2026: "he needs to be able to see that on his own, what I'm working on when I'm training by myself.
// Oh, okay, I'm working on this. Then they can actually give notes around what they were working on, what their
// feeling of it was, and then that can come back to me."
// Proves the whole loop:
//  1. Coach app: the swimmer's portal card is built from SHARED clips only -- a coach-only note never reaches the swimmer.
//  2. Swimmer portal: "What I'm working on" sits above the tabs with the coach's note, the shared clip, and a
//     "How's it going?" reply that sends a focus_note (feeling + note) tied to the session the clip was taken in.
//  3. Coach app: the reply shows on the swimmer's card under that focus, in the swimmer's words.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const SESSION=`WARM-UP\n400 Free\n\nMAIN SET\n4 x 100 Free kick 15 sr\n8 x 50 Free @1.00`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  // ---- 1 + 3: coach app ----
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElementsUI?.portalWorkingOn,{timeout:30000});await p.waitForTimeout(500);
  const portalCard=await p.evaluate(({S,d})=>{const M=window.MSOS4;const mr={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'National',active:true};M.state.athletes=[mr];
    const s=M.parser.parse(S,{date:d,dayPart:'PM',squads:['National'],course:'SCM'});s.id='session-mr';M.store.putSession(M.state,s);const main=s.blocks.find(x=>x.type==='main_set');
    M.state.attendance=[{session_id:s.id,athlete_id:mr.id,status:'present'}];
    const at=n=>new Date(Date.now()-n*36e5).toISOString();
    M.state.captures=[{id:'cap-shared',session_id:s.id,athlete_id:mr.id,athlete_ids:[mr.id],capture_type:'video',title:'Free kick',text_content:'Free kick',capture_note:'Knees bending a lot — kick from the hips',block_id:main.id,created_at:at(3),audience:'shared'},
      {id:'cap-private',session_id:s.id,athlete_id:mr.id,athlete_ids:[mr.id],capture_type:'text',title:'8 x 50 Free',text_content:'8 x 50 Free',capture_note:'Coach only: lazy on the walls',block_id:main.id,created_at:at(2),audience:'coach'}];
    M.store.save(M.state);return M.raceElementsUI.portalWorkingOn(mr);},{S:SESSION,d:daysAgo(1)});
  const flat=JSON.stringify(portalCard);
  assert.match(flat,/Knees bending a lot/,flat);assert.match(flat,/kick from the hips, not the knees/i,flat);
  assert.doesNotMatch(flat,/lazy on the walls|cap-private/,'a coach-only note must never be published to the swimmer');
  const line=portalCard.lines[0];assert.equal(line.session,'session-mr');assert.ok(line.clips.some(c=>c.id==='cap-shared'),flat);

  // ---- 2: the swimmer's own portal ----
  const sp=await (await b.newContext({viewport:{width:390,height:844}})).newPage();sp.on('pageerror',e=>errors.push(e.message));
  const sent=[];
  await sp.route('**/rest/v1/rpc/**',async route=>{const name=route.request().url().split('/rpc/')[1];const body=JSON.parse(route.request().postData()||'{}');
    if(name==='msos_swimmer_portal_snapshot')return route.fulfill({json:{athlete_id:'athlete-matthew-robertson',payload:{athlete:{full_name:'Matthew Robertson',squad:'National'},sessions:[],workingOn:portalCard,sharedEvidence:[{id:'cap-shared',type:'video',title:'Free kick',text:'Knees bending a lot',url:'data:video/mp4;base64,AAAA'}]}}});
    if(name==='msos_swimmer_submit_session_action'){sent.push(body);return route.fulfill({json:{id:'act-1',action_type:body.p_action_type,payload:body.p_payload}});}
    return route.fulfill({json:[]});});
  await sp.addInitScript(()=>{localStorage.setItem('msos_swimmer_device_token_v1','device-token-test');window.MCLAY_CONFIG={...(window.MCLAY_CONFIG||{}),supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'anon'};});
  await sp.goto(BASE+'swimmer-portal.html');await sp.waitForSelector('.sp-wo',{timeout:15000});
  const card=await sp.evaluate(()=>document.querySelector('.sp-wo').innerText);if(process.env.SHOT)await sp.screenshot({path:process.env.SHOT});
  assert.match(card,/WHAT I’M WORKING ON/);assert.match(card,/Free kick — kick from the hips, not the knees/,card);assert.match(card,/Knees bending a lot/,card);assert.match(card,/▶ Clip/,card);
  assert.doesNotMatch(card,/lazy on the walls/);
  assert.ok(await sp.evaluate(()=>!!document.querySelector('.sp-wo video')),'the shared clip plays on the swimmer card');
  await sp.click('[data-focus-reply="0"]');await sp.selectOption('.sp-modal [name=feeling]','Getting better');await sp.fill('.sp-modal [name=note]','Easier with fins, lost it when tired');await sp.click('.sp-modal [data-save]');
  await sp.waitForFunction(()=>/You said: Getting better/.test(document.querySelector('.sp-wo')?.innerText||''),{timeout:10000});
  assert.equal(sent.length,1);const act=sent[0];
  assert.equal(act.p_action_type,'focus_note');assert.equal(act.p_session_id,'session-mr');assert.equal(act.p_device_token,'device-token-test');
  assert.equal(act.p_payload.feeling,'Getting better');assert.equal(act.p_payload.note,'Easier with fins, lost it when tired');assert.equal(act.p_payload.key,line.key);assert.equal(act.p_payload.captureId,'cap-shared');

  // ---- 3: the reply comes back onto the coach's card ----
  const coachCard=await p.evaluate(async payload=>{const M=window.MSOS4;M.swimmerInviteBN.sessionActionsFor=async()=>[{id:'act-1',athlete_id:'athlete-matthew-robertson',session_id:'session-mr',action_type:'focus_note',payload,created_at:new Date().toISOString()}];
    M.state.settings.selectedAthleteId='athlete-matthew-robertson';M.state.settings.loopAthleteTab='performance';M.nav.show('athletes');
    for(let i=0;i<50&&!/Getting better/.test(document.querySelector('[data-re-working]')?.innerText||'');i++)await new Promise(r=>setTimeout(r,100));
    return document.querySelector('[data-re-working]')?.innerText||'';},act.p_payload);
  assert.match(coachCard,/Matthew: Getting better — “Easier with fins, lost it when tired”/,coachCard);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SWIMMER_WORKING_ON_LOOP_PASS');console.log(card);console.log('---');console.log(coachCard);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
