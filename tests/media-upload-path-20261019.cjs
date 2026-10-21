'use strict';
// 19 Oct 2026, pool TV night: clips stuck on "waiting for the video to be sent". Storage logs: Jordan's two clips were
// refused 42 times because their file path had no club in it ("v4/session-…/…") -- the cloud only accepts files under
// the club's folder. And camera clips are big for the pool wifi.
// Real app. Proves:
//  1. A queued clip whose path was fixed without the club is sent to the right place (v4/<club>/<session>/<capture>/…).
//  2. With no club on the phone yet, the clip waits -- it is not sent, not refused, not set aside.
//  3. A big clip is redrawn smaller on the phone first; the smaller copy is what is sent; the original stays on the phone.
//  4. A clip put on the TV jumps the queue.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const b=await chromium.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.cloud?.uploadMedia&&window.MSOS4?.media?.shrinkVideo&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
  const r=await p.evaluate(async ORG=>{const M=window.MSOS4,C=M.cloud;M.state.settings.cloudWritesEnabled=true;M.release.canWrite=()=>true;M.release.ensure=()=>{};C.ready=()=>true;C.sendSoon=()=>{};
    const sent=[];C.fetch=async(path,opt)=>{sent.push({path,size:opt?.body?.size||0,type:opt?.body?.type||''});return null;};
    // a real 2-second camera-like clip (busy picture, high bitrate)
    const clip=await new Promise(res=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:12000000});const parts=[];rec.ondataavailable=e=>parts.push(e.data);rec.onstop=()=>res(new Blob(parts,{type:'video/webm'}));
      let n=0;const draw=()=>{const img=x.createImageData(1280,720);for(let i=0;i<img.data.length;i+=4){img.data[i]=Math.random()*255;img.data[i+1]=(i+n)%255;img.data[i+2]=Math.random()*255;img.data[i+3]=255;}x.putImageData(img,0,0);n+=7;if(rec.state==='recording')requestAnimationFrame(draw);};rec.start(250);draw();setTimeout(()=>rec.stop(),2000);});
    const mediaId=await M.media.save(clip,{});const cap={id:'cap-j1',session_id:'sess-1',capture_type:'video',media_id:mediaId,mime_type:'video/webm',created_at:new Date().toISOString()};M.state.captures=(M.state.captures||[]).concat(cap);
    // the job Jordan's phone had: queued before the phone knew the club
    M.state.settings.organisationId='';const badPath=C.mediaPath(cap);
    M.state.pending=[{id:'media:cap-j1',table:'media',action:'upload',record:{capture_id:'cap-j1',media_id:mediaId,path:badPath,mime_type:'video/webm'},at:new Date().toISOString()}];
    // 2. no club yet -> waits
    await C.flushOnce();const noOrg={sent:sent.length,pending:M.state.pending.length,parked:(M.state.pendingParked||[]).length,waiting:M.state.pending[0]?.waiting,refusals:M.state.pending[0]?.refusals||0};
    // 1 + 3. club known; big clip -> made smaller first, then sent to the club folder
    M.state.settings.organisationId=ORG;M.media.SHRINK_OVER=1000;
    await C.flushOnce();const firstPass={sent:sent.length,shrinking:C.mediaStatus('cap-j1')?.shrinking};
    for(let i=0;i<80&&!M.state.pending[0]?.record?.shrink_done;i++)await new Promise(r=>setTimeout(r,250));
    await C.flushOnce();
    const orig=await M.media.get(mediaId);
    // 4. priority
    M.state.pending=[{id:'x1',table:'media',action:'upload',record:{capture_id:'other'},at:'2026-10-19T06:00:00Z'},{id:'media:cap-j2',table:'media',action:'upload',record:{capture_id:'cap-j2'},at:'2026-10-19T06:05:00Z',nextTryAt:Date.now()+60000}];
    const prio=C.prioritiseMedia('cap-j2');const order=[...M.state.pending].sort((a,b)=>String(a.at).localeCompare(String(b.at))).map(x=>x.id);
    return{badPath,noOrg,firstPass,sent,origSize:clip.size,origKept:orig?.blob?.size,capPath:cap.media_path,shrunk:cap.media_shrunk_from,prio,order,next:M.state.pending.find(x=>x.id==='media:cap-j2').nextTryAt};},ORG);
  assert.match(r.badPath,/^v4\/\/sess-1/,'the old path had no club');
  assert.deepEqual([r.noOrg.sent,r.noOrg.pending,r.noOrg.parked,r.noOrg.refusals],[0,1,0,0],`no club: waits, nothing sent or refused ${JSON.stringify(r.noOrg)}`);assert.match(r.noOrg.waiting,/join the club/);
  assert.equal(r.firstPass.sent,0,'a big clip is made smaller before anything is sent');
  assert.equal(r.sent.length,1,'then sent once');
  assert.equal(r.sent[0].path,`/storage/v1/object/swimming-media/v4/${ORG}/sess-1/cap-j1/media.webm`,'sent into the club folder');
  assert.ok(r.sent[0].size>0&&r.sent[0].size<r.origSize*0.7,`the smaller copy is sent (${r.sent[0].size} vs ${r.origSize})`);
  assert.equal(r.origKept,r.origSize,'the original stays on the phone');assert.equal(r.capPath,`v4/${ORG}/sess-1/cap-j1/media.webm`);assert.equal(r.shrunk,r.origSize);
  assert.equal(r.prio,true);assert.deepEqual(r.order,['media:cap-j2','x1'],'the TV clip goes first');assert.equal(r.next,0);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('MEDIA_UPLOAD_PATH_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
