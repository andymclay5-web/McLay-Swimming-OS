'use strict';
// Real coaching failure this pins (Andy's own words, Phase 2 of the assistant-coach access work): "every
// edit gets tagged with who made it... sessions sync between your two phones properly, not just on
// boot... yours always wins over his if you both touch the same thing -- never the other way round."
// Before this, session.changes[] carried no actor field at all, and the ONLY way two coach devices ever
// converged on a session was a manual "Pull cloud into shadow" button reconstructing sessions by
// RE-PARSING the plain-text `workout` column (M.legacy.importSession) -- a lossy path built for
// recovering pre-v4 legacy data, not live cross-device sync, and with no concept of whose edit should win
// a conflict. This test pins the real fix: tx()'s authorship stamp, the new C.reconstructSession (a
// faithful, non-lossy rebuild straight from session_blocks.items JSON + the session_transcriptions
// change-journal), and C.reconcileSession's owner-priority merge rule.
//
// app.js cannot be require()'d directly in Node (its IIFE touches document/window). Per house convention
// (see tests/session-adaptations-reconcile-20260910.cjs), this extracts the exact, unmodified source text
// of the real functions from app.js and executes them against constructed fixtures.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'app.js'),'utf8');

function extractArrowFn(source,marker){
  const idx=source.indexOf(marker);
  assert.ok(idx>=0,`marker not found in app.js: ${marker}`);
  assert.equal(source.indexOf(marker,idx+1),-1,`expected exactly one occurrence of marker: ${marker}`);
  const rhsStart=idx+marker.length;
  const arrowIdx=source.indexOf('=>',rhsStart);
  assert.ok(arrowIdx>=0&&arrowIdx<rhsStart+40,`expected an arrow function immediately after: ${marker}`);
  const braceStart=source.indexOf('{',arrowIdx);
  assert.ok(braceStart>=0,`expected a '{' body after the arrow for: ${marker}`);
  let depth=0,i=braceStart;
  for(;i<source.length;i++){const c=source[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
  assert.ok(depth===0,`unbalanced braces while extracting: ${marker}`);
  return source.slice(rhsStart,i+1);
}
// marker must end exactly at the function body's opening '{' (e.g. include the full parameter list,
// default values and all) so brace-depth counting starts from the real body, not a default-param object.
function extractFunctionDecl(source,marker){
  const idx=source.indexOf(marker);
  assert.ok(idx>=0,`marker not found in app.js: ${marker}`);
  assert.equal(source.indexOf(marker,idx+1),-1,`expected exactly one occurrence of marker: ${marker}`);
  assert.equal(marker[marker.length-1],'{',`marker must end at the function body's opening brace: ${marker}`);
  const braceStart=idx+marker.length-1;
  let depth=0,i=braceStart;
  for(;i<source.length;i++){const c=source[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
  assert.ok(depth===0,`unbalanced braces while extracting: ${marker}`);
  return source.slice(idx,i+1);
}

let uidCounter=0;
const U={clone:v=>v==null?v:JSON.parse(JSON.stringify(v)),hash:s=>`h:${String(s).length}`,deepFreeze:o=>o,now:()=>new Date().toISOString(),uid:prefix=>`${prefix}-${++uidCounter}`};

// --- 1: tx() authorship stamp -- every change, and the session document itself, gets tagged with who made it
{
  const txSrc=extractFunctionDecl(src,'function tx(session,type,itemId,before,after,meta={}){');
  const actorSrc=extractFunctionDecl(src,'function actor(){');
  assert.match(txSrc,/session\.lastEditedBy=/,'tx() must stamp the session document itself with the acting identity');
  assert.match(txSrc,/by:?\s*by\b|,by\}/,'tx() must include the actor on the individual change row too');

  // Owner device, no team-access engine loaded at all (a solo owner before ever touching Jordan's setup).
  {
    const M={teamAccess:undefined};
    const actor=eval(`(${actorSrc})`);
    const tx=eval(`(${txSrc})`);
    const session={id:'s1'};
    const change=tx(session,'edit_item','i1',{a:1},{a:2});
    assert.deepEqual(change.by,{role:'owner',name:'Owner'},'must fall back to a bare owner stamp when team-access is not loaded at all');
    assert.deepEqual(session.lastEditedBy,{role:'owner',name:'Owner'});
  }
  // Assistant device, signed in as Jordan.
  {
    const M={teamAccess:{actor:()=>({role:'assistant',name:'Jordan'})}};
    const actor=eval(`(${actorSrc})`);
    const tx=eval(`(${txSrc})`);
    const session={id:'s1'};
    const change=tx(session,'edit_item','i1',{a:1},{a:2});
    assert.deepEqual(change.by,{role:'assistant',name:'Jordan'});
    assert.deepEqual(session.lastEditedBy,{role:'assistant',name:'Jordan'});
  }
  console.log('SESSION_AUTHORSHIP_TX_STAMP_PASS');
}

// --- 2: C.reconstructSession -- faithful rebuild from sessions+session_blocks+session_transcriptions,
// never the lossy legacy text-reparse path.
{
  const reconstructSrc=extractArrowFn(src,'C.reconstructSession=');
  const reconstructSession=eval(`(${reconstructSrc})`);
  const row={id:'sess-1',session_date:'2026-09-11',day_part:'AM',title:'',venue:'Home Pool',pool_course:'SCM',squads:['National'],workout:'MAIN SET\n4x100 Freestyle',primary_system:'Threshold',technical_focus:'Body line',plan_cue:'',updated_at:'2026-09-11T09:30:00.000Z',last_editor_role:'owner',last_editor_name:'Andy'};
  const blocks=[
    {id:'b2',block_type:'warmup',title:'WARM-UP',sort_order:1,items:[{id:'i-w1',kind:'set',reps:4,distance:100,stroke:'Freestyle'}]},
    {id:'b1',block_type:'main',title:'MAIN SET',sort_order:2,items:[{id:'i-m1',kind:'set',reps:4,distance:100,stroke:'Freestyle'}]},
  ];
  const journal={created_at:'2026-09-11T08:00:00.000Z',structured_data:{original_source_hash:'orig-hash',current_source_hash:'cur-hash',changes:[{id:'c1',type:'edit_item',itemId:'i-m1',by:{role:'owner',name:'Andy'},at:'2026-09-11T09:00:00.000Z'}],finish:{throughBlockId:'b1',actualDistance:800,finishedAt:'2026-09-11T09:29:00.000Z'}}};
  const out=reconstructSession(row,blocks,journal);
  assert.equal(out.id,'sess-1');
  assert.equal(out.blocks.length,2);
  assert.equal(out.blocks[0].id,'b2','blocks must be reordered by sort_order, not left in fetch order');
  assert.equal(out.blocks[1].id,'b1');
  assert.deepEqual(out.blocks[1].items,[{id:'i-m1',kind:'set',reps:4,distance:100,stroke:'Freestyle'}],'block items must come straight from session_blocks.items JSON, never re-derived by re-parsing workout text');
  assert.equal(out.changes.length,1,'the real change history must survive the round trip via the session_transcriptions change-journal');
  assert.equal(out.changes[0].by.name,'Andy');
  assert.equal(out.finish.actualDistance,800,'finish state must survive the round trip, not be silently dropped');
  assert.deepEqual(out.lastEditedBy,{role:'owner',name:'Andy'});
  assert.equal(out.identity.venue,'Home Pool');assert.equal(out.identity.course,'SCM');
  // No journal row at all (a session with no changes/finish yet never queues one, per C.stageSession) --
  // must still reconstruct cleanly with empty changes/finish, never throw.
  const bare=reconstructSession(row,blocks,null);
  assert.deepEqual(bare.changes,[]);assert.equal(bare.finish,null);
  console.log('SESSION_RECONSTRUCT_PASS');
}

// --- 3: C.reconcileSession -- the actual override rule. This is the critical regression test: an owner
// edit must ALWAYS beat a conflicting assistant edit regardless of timestamps (a device clock can't
// arbitrate coaching authority), and it must NEVER be true the other way round.
(async()=>{
  const reconstructSrc=extractArrowFn(src,'C.reconstructSession=');
  const reconcileSrc=extractArrowFn(src,'C.reconcileSession=');

  function buildEnv({sessionsRow,blocksRows=[],journalRows=[],ready=true,networkErrorOnFetch=false}){
    const staged=[];
    const M={state:{canonicalSessions:{}}};
    const Store={save(){}};
    const C={
      ready:()=>ready,
      org:()=>'org-1',
      networkError:e=>e?.networkError===true,
      fetch:async url=>{
        if(networkErrorOnFetch)throw{networkError:true,message:'offline'};
        if(url.includes('/rest/v1/sessions?'))return sessionsRow?[sessionsRow]:[];
        if(url.includes('/rest/v1/session_blocks?'))return blocksRows;
        if(url.includes('/rest/v1/session_transcriptions?'))return journalRows;
        throw new Error('unexpected fetch '+url);
      },
      stageSession:s=>{staged.push(s)},
    };
    C.reconstructSession=eval(`(${reconstructSrc})`);
    const reconcileSession=eval(`(${reconcileSrc})`);
    return{M,C,staged,reconcileSession};
  }
  const remoteRow=(role,name,updated_at)=>({id:'s1',session_date:'2026-09-11',day_part:'AM',venue:'',pool_course:'SCM',squads:['National'],workout:'',primary_system:'',technical_focus:'',plan_cue:'',updated_at,last_editor_role:role,last_editor_name:name});
  const localSession=(role,name,updatedAt)=>({id:'s1',identity:{squads:['National']},blocks:[],changes:[],finish:null,lastEditedBy:{role,name},updatedAt});

  // (a) local = assistant (Jordan), remote = owner (Andy), even though the LOCAL edit is timestamped
  // LATER than the remote one -- owner must still win. This is the exact "never the other way round"
  // guarantee Andy asked for.
  {
    const{M,C,staged,reconcileSession}=buildEnv({sessionsRow:remoteRow('owner','Andy','2026-09-11T09:00:00.000Z')});
    M.state.canonicalSessions.s1=localSession('assistant','Jordan','2026-09-11T09:30:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result.applied,'remote','an owner-authored remote edit must win even though the local assistant edit is timestamped later');
    assert.equal(M.state.canonicalSessions.s1.lastEditedBy.role,'owner');
    assert.equal(staged.length,0,'adopting remote must not also re-stage anything');
  }

  // (b) local = owner (Andy), remote = assistant (Jordan), even though the REMOTE edit is timestamped
  // LATER -- Andy's local edit must be kept, AND re-staged so a third device converges back to it too.
  {
    const{M,C,staged,reconcileSession}=buildEnv({sessionsRow:remoteRow('assistant','Jordan','2026-09-11T10:00:00.000Z')});
    M.state.canonicalSessions.s1=localSession('owner','Andy','2026-09-11T09:00:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result.applied,'local','an assistant-authored remote edit must NEVER beat the owner\'s local edit, even when it is newer');
    assert.equal(M.state.canonicalSessions.s1.lastEditedBy.role,'owner','local must be untouched');
    assert.equal(staged.length,1,'must re-stage the owner\'s local session so other devices converge back to it, not keep serving Jordan\'s stale remote row');
    assert.equal(staged[0].id,'s1');
  }

  // (c) same authority tier (owner vs owner, e.g. Andy's own two devices) -- falls back to timestamp
  // last-write-wins, matching the exact tie rule already proven in C.mergeAdaptationOverride (strict `>`,
  // so an exact tie keeps the local copy).
  {
    const{M,C,reconcileSession}=buildEnv({sessionsRow:remoteRow('owner','Andy','2026-09-11T11:00:00.000Z')});
    M.state.canonicalSessions.s1=localSession('owner','Andy','2026-09-11T10:00:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result.applied,'remote','same authority tier: a genuinely newer remote edit must still win');
  }
  {
    const{M,C,reconcileSession}=buildEnv({sessionsRow:remoteRow('owner','Andy','2026-09-11T10:00:00.000Z')});
    M.state.canonicalSessions.s1=localSession('owner','Andy','2026-09-11T10:00:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result.applied,'local','same authority tier, exact timestamp tie: local must be kept, not overwritten with an identical copy');
  }

  // (d) no remote row at all yet (this session has never been pushed) -- must do nothing, not throw.
  {
    const{M,C,reconcileSession}=buildEnv({sessionsRow:null});
    M.state.canonicalSessions.s1=localSession('owner','Andy','2026-09-11T09:00:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result,null);
    assert.equal(M.state.canonicalSessions.s1.lastEditedBy.role,'owner','must be untouched');
  }

  // (e) cloud not ready -- must never attempt a network call (local availability must not depend on cloud).
  {
    const{M,C,reconcileSession}=buildEnv({sessionsRow:remoteRow('owner','Andy','2026-09-11T09:00:00.000Z'),ready:false});
    M.state.canonicalSessions.s1=localSession('assistant','Jordan','2026-09-11T09:00:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result,null);
  }

  // (f) a network error mid-fetch must resolve to null, never throw (this is called fire-and-forget from
  // a 25s poll -- an uncaught rejection there must never surface as an unhandled promise rejection).
  {
    const{M,C,reconcileSession}=buildEnv({sessionsRow:remoteRow('owner','Andy','2026-09-11T09:00:00.000Z'),networkErrorOnFetch:true});
    M.state.canonicalSessions.s1=localSession('assistant','Jordan','2026-09-11T09:00:00.000Z');
    const result=await reconcileSession('s1');
    assert.equal(result,null);
  }

  // (g) no session open locally at all -- nothing to reconcile against, must return null without fetching.
  {
    const{M,C,reconcileSession}=buildEnv({sessionsRow:remoteRow('owner','Andy','2026-09-11T09:00:00.000Z')});
    const result=await reconcileSession('does-not-exist-locally');
    assert.equal(result,null);
  }

  console.log('SESSION_RECONCILE_OWNER_PRIORITY_PASS');
})().catch(e=>{console.error('SCRIPT_ERROR:',e);process.exit(1)});
