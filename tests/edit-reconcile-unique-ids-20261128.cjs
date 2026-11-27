'use strict';
// 28 Nov 2026 (Andy, 7:45 am, photo: editing Sat AM after "100 sharpeners" became sets of their own, Apply said
// "Session does not pass canonical validation" -- Duplicate item id). Keeping the old ids on matched lines could hand a
// line an id a new line already had. Proves an edit keeps the matched lines' ids (Charlotte's edits stay on them) and
// gives any clashing new line a fresh id, so the edit validates.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.parser&&window.MSOS4?.session?.reconcileIds,{timeout:30000});
  const r=await p.evaluate(()=>{const M=window.MSOS4,o={date:'2026-11-28',dayPart:'AM',squads:['National'],id:'session-sat'};
    const text='WARM-UP\n400 fr\n100 sharpeners\n400 IM\n\nWARM DOWN\n200 choice';
    const fresh=M.parser.parse(text,o),[fr,sh,im]=fresh.blocks[0].items;
    // the saved session, read before sharpeners were their own lines: the 400 fr had the id the new sharpeners line now gets
    const prev=M.parser.parse('WARM-UP\n400 fr\n400 IM',o);prev.blocks[0].items[0].id=sh.id;prev.blocks[0].items[1].id='item-im-kept';
    const next=M.parser.parse(text,o);M.session.reconcileIds(prev,next);const v=M.session.validate(next),[nfr,nsh,nim]=next.blocks[0].items;
    return{ok:v.ok,errors:v.errors,total:v.total,frKept:nfr.id===sh.id,imKept:nim.id==='item-im-kept',shFresh:nsh.id!==sh.id&&!!nsh.id};});
  assert.ok(r.ok,JSON.stringify(r.errors));assert.equal(r.total,1100);
  assert.ok(r.frKept&&r.imKept,'matched lines keep their ids: '+JSON.stringify(r));assert.ok(r.shFresh,'the clashing new line gets a fresh id');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('EDIT_RECONCILE_UNIQUE_IDS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
