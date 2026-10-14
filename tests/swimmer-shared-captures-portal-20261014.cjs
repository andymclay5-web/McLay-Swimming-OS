'use strict';
// Andy, 14 Oct 2026, 8:43pm: "Jordan took some videos and made some notes for Matthew and ticked share to swimmer
// ... I was expecting that to pop up on Matthew's phone and that didn't happen" / "my screen was showing ... warm up
// 48%, which makes no sense to me".
// Found in the live cloud: every swimmer's portal had 0 results, 0 T400s and 0 shared notes -- the publish made on
// every session save sent those parts empty and replaced the whole portal. "Share with swimmer" and the note were
// never stored in the cloud (no columns), and only the owner's phone can publish, so another coach's shared capture
// had no way to reach the swimmer. (Separately: iPhone videos were refused by the storage bucket -- fixed in the
// bucket settings.)
// This proves, against the real app files:
//  1. the session-save publish sends only the session parts (the server now merges, so the rest is kept);
//  2. a capture another coach shared with a swimmer, arriving on the owner's phone, publishes that swimmer's
//     shared notes, with a private link for a video;
//  3. share + note go to the cloud with the capture and come back on another phone;
//  4. results/T400s are republished in the background for swimmers who have the app, at most every 6 hours;
//  5. the Board no longer shows the voice engine's "Warm-up 48%" guess.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.swimmerInviteBN?.publishShared&&window.MSOS4?.cloud?.pullTeamData&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(600);
    const r=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,X=M.swimmerInviteBN,st=M.state,out={};
      const wait=ms=>new Promise(res=>setTimeout(res,ms));
      // Every publish to a swimmer's portal goes through the msos_publish_swimmer_payload RPC.
      const published=[];const realFetch=window.fetch;
      window.fetch=async(url,opts={})=>{const u=String(url);if(/\/rest\/v1\/rpc\/msos_publish_swimmer_payload/.test(u)){published.push(JSON.parse(opts.body));return new Response('1',{status:200});}
        if(/\/rest\/v1\/rpc\/msos_owner_swimmer_access/.test(u))return new Response(JSON.stringify([{athlete_id:'athlete-matthew-robertson',devices:1,has_account:false},{athlete_id:'athlete-elsie-knowles',devices:0,has_account:false}]),{status:200});
        return realFetch(url,opts);};
      M.store.auth=()=>({access_token:'tok'});C.ready=()=>true;C.org=()=>'org-1';
      const signed=[];
      C.fetch=async(path,opts={})=>{if(/\/storage\/v1\/object\/sign\//.test(path)){signed.push(path);return{signedURL:'/object/sign/swimming-media/x?token=abc'};}
        const t=(path.match(/^\/rest\/v1\/([a-z_]+)\?/)||[])[1];return t==='captures'?cloudCaps:[];};
      let cloudCaps=[];
      const mat=st.athletes.find(a=>a.id==='athlete-matthew-robertson')||(st.athletes.push({id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'National',active:true}),st.athletes.at(-1));

      // 1. Session-save publish carries the session parts only.
      const s=M.parser.parse('WARM UP\n400 free\nMAIN SET\n8 x 100 free',{id:'pub-test',date:'2026-10-14',dayPart:'PM',squads:[mat.squad||'National'],venue:'AquaGym',course:'SCM'});
      published.length=0;M.store.putSession(st,s);
      for(let i=0;i<60&&!published.length;i++)await wait(50);
      out.sessionPublish=published.length?Object.keys(published[0].p_payload).sort():null;

      // 2+3. Jordan's shared video + note for Matthew arrives on the owner's phone.
      published.length=0;st.settings.teamDataPulledAt=null;st.pending=[];
      cloudCaps=[{id:'capture-jordan-1',organisation_id:'org-1',session_id:'pub-test',athlete_id:mat.id,capture_type:'video',text_content:'Fly breakout',note:'Hold the kick through the breakout',audience:'shared',media_path:'v4/org-1/pub-test/capture-jordan-1/media.webm',mime_type:'video/quicktime',created_at:'2026-10-14T06:10:00Z',updated_at:'2026-10-14T06:10:00Z',created_by:'jordan'},
        {id:'capture-jordan-2',organisation_id:'org-1',session_id:'pub-test',athlete_id:'athlete-elsie-knowles',capture_type:'text',text_content:'Coach-only note',note:'',audience:'coach',media_path:null,created_at:'2026-10-14T06:11:00Z',updated_at:'2026-10-14T06:11:00Z',created_by:'jordan'}];
      const pull=await C.pullTeamData();
      for(let i=0;i<80&&!published.length;i++)await wait(50);
      out.pull={shared:pull.shared};
      const p=published.find(x=>x.p_athlete_id===mat.id);
      out.sharedPublish=p?{keys:Object.keys(p.p_payload).sort(),rows:p.p_payload.sharedEvidence.map(x=>({id:x.id,title:x.title,text:x.text,type:x.type,url:x.url||null,leaks:'media_path' in x}))}:null;
      out.elsiePublished=published.some(x=>x.p_athlete_id==='athlete-elsie-knowles');
      out.signed=signed.length;
      const local=st.captures.find(c=>c.id==='capture-jordan-1');
      out.local={audience:local?.audience,note:local?.capture_note,title:local?.title};
      // What this phone would send for its own capture: share + note included.
      out.projected=(({audience,note})=>({audience,note}))(C.projectCapture({id:'own',session_id:'pub-test',capture_type:'text',text_content:'t',audience:'shared',capture_note:'Nice turn'}));

      // 4. Background refresh for swimmers who have the app (Matthew has a device; Elsie does not).
      published.length=0;st.settings.portalFullAt={};
      const r1=await X.refreshAppSwimmers();const r2=await X.refreshAppSwimmers();
      out.refresh={first:r1?.refreshed||r1?.error,second:r2?.refreshed??null,keys:published[0]?Object.keys(published[0].p_payload).sort():null,count:published.length};

      // 5. No engine-confidence badge on the Board.
      M.nav.show('board');M.ui.renderCurrent();await wait(300);
      out.badge=!!document.querySelector('#boardView [data-av-context]');
      window.fetch=realFetch;delete st.canonicalSessions['pub-test'];st.captures=st.captures.filter(c=>!/^capture-jordan/.test(c.id));st.pending=[];
      return out;});
    assert.deepEqual(r.sessionPublish,['athlete','publishedAt','schema','session','sessions'],'a session save publishes only the session parts, never empty results/notes');
    assert.deepEqual(r.pull.shared,['athlete-matthew-robertson'],'the shared capture is recognised as Matthew\'s');
    assert.ok(r.sharedPublish,'Matthew\'s shared notes were published from the owner\'s phone');
    assert.deepEqual(r.sharedPublish.keys,['publishedAt','sharedEvidence'],'only the shared notes are sent (the rest of his portal is kept)');
    const row=r.sharedPublish.rows.find(x=>x.id==='capture-jordan-1');
    assert.ok(row,'Jordan\'s video is in Matthew\'s shared list');
    assert.equal(row.title,'Fly breakout');assert.equal(row.text,'Hold the kick through the breakout','the note travels with it');
    assert.equal(row.type,'video');assert.match(row.url||'',/\/storage\/v1\/object\/sign\/swimming-media\/x\?token=abc/,'the video goes with a private link');
    assert.equal(row.leaks,false,'the coaches-only cloud path is not handed to the swimmer');
    assert.ok(!r.sharedPublish.rows.some(x=>x.id==='capture-jordan-2'),'a coach-only note is never shared');
    assert.equal(r.elsiePublished,false,'nothing is published for a coach-only capture');
    assert.deepEqual(r.local,{audience:'shared',note:'Hold the kick through the breakout',title:'Fly breakout'},'share + note arrive on the other phone');
    assert.deepEqual(r.projected,{audience:'shared',note:'Nice turn'},'share + note are sent with this phone\'s captures');
    assert.equal(r.refresh.first,'athlete-matthew-robertson','results/T400s republished for the swimmer with the app');
    assert.equal(r.refresh.second,null,'not again within 6 hours, and not for swimmers without the app');
    assert.equal(r.refresh.count,1);
    assert.ok(r.refresh.keys.includes('performance')&&r.refresh.keys.includes('tests')&&r.refresh.keys.includes('sharedEvidence')&&!r.refresh.keys.includes('session'),`full refresh never touches the session parts: ${r.refresh.keys}`);
    assert.equal(r.badge,false,'no "Warm-up 48%" engine badge on the Board');
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('SWIMMER_SHARED_CAPTURES_PORTAL_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
