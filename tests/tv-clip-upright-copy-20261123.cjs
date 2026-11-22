'use strict';
// 23 Nov 2026 (Andy at the pool: clips taken earlier "still didn't render" on the TV, and phone clips showed "side on").
// A phone clip held upright is stored sideways with an "upright" tag that the TV's browser ignores. Proves:
//  - the smaller copy is drawn upright (a clip tagged 90 degrees comes out portrait, top/bottom where they belong);
//  - a clip that already went up full size is sent again as the smaller copy when the coach puts it on the TV --
//    once, to the same place, from the original still on the phone;
//  - the TV is then given a fresh link so it fetches the new copy.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.cloud?.ensureTvCopy&&window.MSOS4?.tvDisplay?.showCapture&&window.MSOS4?.storageEngine?.ready,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate(async ORG=>{const M=window.MSOS4,C=M.cloud;M.state.settings.cloudWritesEnabled=true;M.release.canWrite=()=>true;M.release.ensure=()=>{};C.ready=()=>true;C.sendSoon=()=>{};M.state.settings.organisationId=ORG;
    const sent=[];C.fetch=async(path,opt)=>{sent.push({path,size:opt?.body?.size||0,type:opt?.body?.type||'',blob:opt?.body instanceof Blob?opt.body:null});if(/\/object\/sign\//.test(path))return{signedURL:'/object/sign/swimming-media/x?token=t'};return null;};
    // a portrait phone clip: stored 640x360 with a 90-degree "upright" tag (left half red, right half blue)
    const clip=await (await fetch('/tests/fixtures-rot90.mp4')).blob();const orig=new Blob([clip],{type:'video/mp4'});
    const mediaId=await M.media.save(orig,{});const path=`v4/${ORG}/sess-tv/cap-old/media.webm`;
    M.state.captures=(M.state.captures||[]).concat({id:'cap-old',session_id:'sess-tv',capture_type:'video',media_id:mediaId,mime_type:'video/mp4',media_path:path,created_at:new Date().toISOString()});
    M.state.pending=[];M.media.SHRINK_OVER=1000;
    M.tvDisplay.showCapture('cap-old','corner');await new Promise(r=>setTimeout(r,300));
    const queued=(M.state.pending||[]).filter(x=>x.table==='media').map(x=>x.record.path);
    M.tvDisplay.showCapture('cap-old','corner');await new Promise(r=>setTimeout(r,300));const queuedAgain=(M.state.pending||[]).filter(x=>x.table==='media').length;
    await C.flushOnce();for(let i=0;i<80&&!M.state.pending.find(x=>x.table==='media')?.record?.shrink_done;i++)await new Promise(r=>setTimeout(r,250));await C.flushOnce();
    const up=sent.filter(x=>x.path.includes('/storage/v1/object/swimming-media/'));const cap=M.state.captures.find(c=>c.id==='cap-old');
    const frame=await M.tvLink.buildFrame();
    const look=bl=>new Promise(res=>{const v=document.createElement('video');v.muted=true;v.src=URL.createObjectURL(bl);v.onloadeddata=()=>v.play();v.ontimeupdate=()=>{if(v.currentTime<0.3||v._d)return;v._d=true;const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const x=c.getContext('2d');x.drawImage(v,0,0);const px=(X,Y)=>[...x.getImageData(X,Y,1,1).data].slice(0,3);res({w:c.width,h:c.height,top:px(c.width/2,4),bottom:px(c.width/2,c.height-4)})};v.onerror=()=>res({err:true})});
    const sentLook=up[0]?.blob?await look(up[0].blob):null;
    return{queued,queuedAgain,uploads:up.map(x=>({path:x.path,size:x.size})),origSize:orig.size,shrunk:cap.media_shrunk_from,uploadedAt:!!cap.media_uploaded_at,url:frame.overlay?.url||'',sentLook,why:M.media.lastShrink};},ORG);
  assert.deepEqual(r.queued,[`v4/${ORG}/sess-tv/cap-old/media.webm`],'putting a full-size clip on the TV sends the smaller copy to the same place: '+JSON.stringify(r));
  assert.equal(r.queuedAgain,1,'only once');
  assert.equal(r.uploads.length,1,JSON.stringify(r.uploads));assert.ok(r.uploads[0].size<r.origSize*0.7,'the smaller copy: '+JSON.stringify(r.uploads)+' '+JSON.stringify(r.why));
  assert.equal(r.shrunk,r.origSize);assert.ok(r.uploadedAt);assert.match(r.url,/[?&]tv=/,'the TV gets a fresh link to the new copy');
  const isRed=c=>c[0]>180&&c[2]<90,isBlue=c=>c[2]>180&&c[0]<90;
  assert.ok(r.sentLook&&r.sentLook.h>r.sentLook.w,'drawn upright (portrait): '+JSON.stringify(r.sentLook));
  assert.ok(isBlue(r.sentLook.top)&&isRed(r.sentLook.bottom),'the right way up: '+JSON.stringify(r.sentLook));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TV_CLIP_UPRIGHT_COPY_PASS',JSON.stringify(r.sentLook));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
