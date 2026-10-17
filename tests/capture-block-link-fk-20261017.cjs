'use strict';
// 17 Oct 2026 (live Supabase logs): "insert or update on table captures violates foreign key constraint
// captures_session_block_id_fkey" -- 1,381 times in 90 minutes from Andy's phone. Captures filed under a set whose
// block id isn't in the cloud's session_blocks were refused, stayed queued and were re-sent every 25s, and never
// reached the other coaches or the swimmers. Proves the capture now goes up without the cloud block link (the phone
// keeps its own), leaves the queue, and isn't re-sent; other errors still fail as before.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.cloud?.flushOnce&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,C=M.cloud;const s=M.parser.parse('MAIN SET\n4 x 100 Free',{date:'2026-10-17',dayPart:'AM',squads:['National']});s.id='fk-sess';M.store.putSession(M.state,s);
    const cap={id:'cap-fk-1',session_id:s.id,block_id:s.blocks[0].id,capture_type:'text',text_content:'Long glide',athlete_ids:['ash'],created_at:new Date().toISOString()};M.state.captures=[cap];
    M.state.pending=[{id:'q1',table:'captures',action:'upsert',record:C.projectCapture(cap),at:new Date().toISOString()}];
    M.state.settings.cloudWritesEnabled=true;M.release.canWrite=()=>true;M.release.ensure=()=>{};C.ready=()=>true;C.stageMissingAthletes=()=>{};
    const sent=[];C.fetch=async(path,opts)=>{const body=JSON.parse(opts.body||'{}');sent.push({path,block:body.session_block_id});if(/captures/.test(path)&&body.session_block_id){const e=new Error('insert or update on table "captures" violates foreign key constraint "captures_session_block_id_fkey"');e.status=409;throw e;}return null;};
    const out=await C.flushOnce();return{out,sent,detached:cap.cloud_block_detached,pending:M.state.pending.length,again:C.projectCapture(cap).session_block_id};});
  assert.equal(r.out.ok,1,'the capture reached the cloud');assert.equal(r.pending,0,'and left the queue');
  assert.deepEqual(r.sent.map(x=>!!x.block),[true,false],'tried with the block link, then without');
  assert.equal(r.detached,true);assert.equal(r.again,null,'later sends go straight up without the missing link');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CAPTURE_BLOCK_LINK_FK_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
