'use strict';
// Andy, 14 Oct 2026, 7:08pm: "Jordan's phone's working good, but it's just not pulling up the times ... he's
// marked the roll on his phone, but I'm not seeing that come through on my phone ... he sent a video on the coach
// chat. I could see the video at my end, but Jordan couldn't see the video at his end."
// Checked in the live cloud first: Jordan's 18 Roll marks for tonight were there; 151 T400/test rows were readable
// by his account; the shared video file was in storage. The phones never read any of it back:
//  1. Roll: only sessions were pulled from other coaches, never attendance. C.pullTeamData now brings it in.
//  2. Times: an assistant's phone never received T400s/test types (entered on the owner's phone), so no aerobic
//     target could be worked out. C.pullTeamData({tests:true}) now brings them to assistant phones.
//  3. Video: the capture row reached the cloud before its file finished uploading and was never re-sent, so every
//     uploaded video (30 of them) had no cloud path; and the viewer only ever played a file saved on the same phone.
//     C.uploadMedia now re-sends the row with its path, C.relinkMedia repairs older ones once, and the viewer
//     downloads another phone's file from the cloud.
// Cloud is stubbed; the rows are shaped exactly like the live tables.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.cloud?.pullTeamData&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.captureUI?.openEvidence!==undefined||window.MSOS4?.cloud?.pullTeamData&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(600);
    const r=await page.evaluate(async()=>{const M=window.MSOS4,C=M.cloud,st=M.state,out={};
      const calls=[];let cloud={attendance:[],captures:[],training_test_types:[],training_test_results:[]};
      C.ready=()=>true;C.org=()=>'org-1';
      C.fetch=async(path,opts={})=>{calls.push([opts.method||'GET',path]);const t=(path.match(/^\/rest\/v1\/([a-z_]+)\?/)||[])[1];const id=(path.match(/[?&]id=eq\.([^&]+)/)||[])[1];
        if(t&&cloud[t])return id?cloud[t].filter(x=>x.id===decodeURIComponent(id)):cloud[t];return[];};
      const view=st.settings.view,sel=st.settings.selectedSessionId;

      // ---- 1. Roll marked on Jordan's phone reaches the owner's phone ----
      st.pending=[];st.settings.teamDataPulledAt=null;
      st.attendance=[{id:'attendance-old-a',session_id:'old',athlete_id:'a',status:'present',note:'',updated_at:'2026-10-01T05:00:00Z'},
        {id:'attendance-tonight-mine',session_id:'tonight',athlete_id:'mine',status:'present',note:'',updated_at:'2026-10-14T06:30:00Z'},
        {id:'attendance-tonight-unsent',session_id:'tonight',athlete_id:'unsent',status:'absent',note:'',updated_at:'2026-10-14T05:00:00Z'}];
      st.pending=[{id:'p1',key:'attendance:tonight|unsent:upsert',table:'attendance',action:'upsert',record:{session_id:'tonight',athlete_id:'unsent'},at:'x'}];
      cloud.attendance=[{id:'attendance-tonight-j1',organisation_id:'org-1',session_id:'tonight',athlete_id:'j1',status:'present',note:'',updated_at:'2026-10-14T05:53:00Z',created_by:'jordan'},
        {id:'attendance-tonight-j2',organisation_id:'org-1',session_id:'tonight',athlete_id:'j2',status:'present',note:'',updated_at:'2026-10-14T05:53:50Z',created_by:'jordan'},
        {id:'attendance-tonight-mine',organisation_id:'org-1',session_id:'tonight',athlete_id:'mine',status:'absent',note:'',updated_at:'2026-10-14T05:00:00Z',created_by:'jordan'},
        {id:'attendance-tonight-unsent',organisation_id:'org-1',session_id:'tonight',athlete_id:'unsent',status:'present',note:'',updated_at:'2026-10-14T05:59:00Z',created_by:'jordan'}];
      const roll=await C.pullTeamData();
      const at=(s,a)=>st.attendance.find(x=>x.session_id===s&&x.athlete_id===a);
      out.roll={pulled:roll.attendance,sessions:roll.sessions,j1:at('tonight','j1')?.status,j2:at('tonight','j2')?.status,old:!!at('old','a'),
        mineKept:at('tonight','mine')?.status,unsentKept:at('tonight','unsent')?.status,cursor:st.settings.teamDataPulledAt,
        sinceAsked:calls.some(c=>/attendance\?select=\*&organisation_id=eq\.org-1&updated_at=gt\./.test(c[1])),
        noTestsForOwner:!calls.some(c=>/training_test/.test(c[1])),view:st.settings.view===view,sel:st.settings.selectedSessionId===sel};
      // Bad: the old whole-table merge would have wiped every other local Roll row.
      out.oldMergeWouldWipe=C.mergeRows(cloud.attendance,[{session_id:'old',athlete_id:'a',status:'present'}],'attendance').some(x=>x.session_id==='old')===false;

      // ---- 2. T400s reach an assistant coach's phone ----
      st.pending=[];calls.length=0;
      cloud.training_test_types=[{id:'tt-t400',organisation_id:'org-1',name:'T400 Freestyle',test_key:'t400_freestyle',distance:400,stroke:'Freestyle'}];
      cloud.training_test_results=[{id:'ttr-1',organisation_id:'org-1',test_type_id:'tt-t400',athlete_id:'athlete-matthew-robertson',result_seconds:285.4,result_date:'2026-09-30',pool_course:'SCM',valid_for_anchor:true}];
      const keepTypes=st.trainingTestTypes,keepResults=st.trainingTestResults;st.trainingTestTypes=[];st.trainingTestResults=[];
      M.access.setRole('assistant',{assistantId:'jordan'});
      const t=await C.pullTeamData({tests:true});
      out.tests={pulled:t.tests,types:st.trainingTestTypes.length,results:st.trainingTestResults.map(x=>x.result_seconds)};
      M.access.setRole('owner');st.trainingTestTypes=keepTypes;st.trainingTestResults=keepResults;

      // ---- 3a. A finished upload re-sends the capture row with its cloud path ----
      st.pending=[];
      const cap={id:'capture-vid-1',session_id:'tonight',capture_type:'video',mime_type:'video/webm',media_id:'m-1',athlete_ids:['a'],created_at:'2026-10-14T05:58:00Z'};
      st.captures=(st.captures||[]).filter(c=>!/^capture-(vid|old|remote)/.test(c.id));st.captures.push(cap);
      const realGet=M.media.get;M.media.get=async id=>id==='m-1'?{blob:new Blob(['x'],{type:'video/webm'})}:realGet.call(M.media,id);
      const path=await C.uploadMedia({record:{capture_id:'capture-vid-1',media_id:'m-1',path:'v4/org-1/tonight/capture-vid-1/media.webm',mime_type:'video/webm'}});
      const resent=(st.pending||[]).find(p=>p.table==='captures'&&p.record?.id==='capture-vid-1');
      out.upload={path,resentPath:resent?.record?.media_path||null};
      // ---- 3b. Older uploads whose row never got the path are re-sent once ----
      st.pending=[];st.captures.push({id:'capture-old-1',session_id:'tonight',capture_type:'video',media_id:'m-old',media_path:'v4/org-1/tonight/capture-old-1/media.webm'});
      const n1=C.relinkMedia(),n2=C.relinkMedia();
      out.relink={first:n1,second:n2,queued:(st.pending||[]).filter(p=>p.table==='captures').map(p=>p.record.id)};
      M.media.get=realGet;

      // ---- 3c. A video recorded on another phone plays here ----
      cloud.captures=[{id:'capture-remote-1',organisation_id:'org-1',session_id:'tonight',athlete_id:'a',capture_type:'video',text_content:'',media_path:'v4/org-1/tonight/capture-remote-1/media.webm',mime_type:'video/webm',created_at:'2026-10-14T05:58:00Z',updated_at:'2026-10-14T05:58:00Z',created_by:'jordan'}];
      let downloaded='';C.mediaBlob=async p=>{downloaded=p;return new Blob(['video-bytes'],{type:'video/webm'})};
      const b=document.createElement('button');b.setAttribute('data-msos-capture','capture-remote-1');document.body.appendChild(b);b.click();
      for(let i=0;i<40&&!document.querySelector('#modalHost video');i++)await new Promise(r=>setTimeout(r,50));
      out.view={downloaded,video:!!document.querySelector('#modalHost video'),nowLocal:!!st.captures.find(c=>c.id==='capture-remote-1'&&c.from_cloud)};
      document.querySelector('#modalHost [data-close-evidence]')?.click();b.remove();
      // A capture whose file is still only on the other phone says so plainly.
      cloud.captures=[{...cloud.captures[0],id:'capture-remote-2',media_path:null}];
      await new Promise(r=>setTimeout(r,400));const b2=document.createElement('button');b2.setAttribute('data-msos-capture','capture-remote-2');document.body.appendChild(b2);b2.click();
      for(let i=0;i<40&&!/still on the phone/.test(document.querySelector('#modalHost')?.textContent||'');i++)await new Promise(r=>setTimeout(r,50));
      out.notYet=/still on the phone that recorded it/.test(document.querySelector('#modalHost')?.textContent||'');out.notYetText=(document.querySelector('#modalHost')?.textContent||'').slice(0,300);
      document.querySelector('#modalHost [data-close-evidence]')?.click();b2.remove();
      st.pending=[];
      return out;});
    assert.equal(r.roll.j1,'present','Jordan\'s Roll mark reached the owner\'s phone');
    assert.equal(r.roll.j2,'present');
    assert.deepEqual(r.roll.sessions,['tonight'],'reports which session\'s Roll changed (so only that Board/Roll redraws)');
    assert.ok(r.roll.old,'Roll for other sessions on this phone is kept (never a whole-table replace)');
    assert.equal(r.roll.mineKept,'present','a newer mark made on this phone is not overwritten by an older one');
    assert.equal(r.roll.unsentKept,'absent','a mark on this phone not yet sent always wins');
    assert.equal(r.roll.cursor,'2026-10-14T05:59:00Z','next pull only asks for newer changes');
    assert.ok(r.roll.sinceAsked,'asks only for changes since the last look');
    assert.ok(r.roll.noTestsForOwner,'the owner\'s phone (where T400s are entered) never pulls them back');
    assert.ok(r.roll.view&&r.roll.sel,'never changes the view or the selected session');
    assert.ok(r.oldMergeWouldWipe,'(why a new merge was needed: the whole-table merge drops rows not in the pull)');
    assert.equal(r.tests.types,1,'T400 test type reached the assistant phone');
    assert.deepEqual(r.tests.results,[285.4],'Matthew\'s T400 reached the assistant phone');
    assert.equal(r.upload.resentPath,r.upload.path,'after the file uploads, the capture row is sent again with its cloud path');
    assert.equal(r.relink.first,1,'an older video with no cloud path is re-sent');
    assert.equal(r.relink.second,0,'only once');
    assert.deepEqual(r.relink.queued,['capture-old-1']);
    assert.equal(r.view.downloaded,'v4/org-1/tonight/capture-remote-1/media.webm','the other phone\'s video is downloaded from the cloud');
    assert.ok(r.view.video,'and plays on this phone');
    assert.ok(r.view.nowLocal,'the shared capture is kept on this phone');
    assert.ok(r.notYet,r.notYetText+' :: '+'a file not yet uploaded by the other phone says so instead of failing');
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('TEAM_ROLL_TESTS_MEDIA_SYNC_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
