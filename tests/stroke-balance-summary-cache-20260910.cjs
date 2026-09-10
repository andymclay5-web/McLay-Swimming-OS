'use strict';
// Real coaching failure this fixes: engines/performance.js's selectStrokeForContext used to skip the real
// medley "which stroke needs work" analysis entirely on the Board/TV view, because THIS file's summary() did
// an uncached 7-day session/block/item walk -- too expensive to redo per stroke pill per swimmer across a
// full roster on the one screen Andy actually coaches from every day (see
// tests/deck-fast-stroke-resolution-20260826.cjs for the caller-side half of this fix). This test proves the
// fix at its source: summary() and weeklyEmphasis() now cache per athlete+day+state-revision, so repeated
// calls for the same swimmer on the same render pass are genuinely free (a real cache hit, not a relabelled
// recomputation), while a real data change (storageRevision bump) still recomputes -- which is what makes it
// safe to remove the Board-view bypass without reintroducing the slowdown it existed to avoid.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

global.MSOSEngines={
  Evidence:{stroke:v=>{const s=String(v||'');return['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].includes(s)?s:'';}},
  Modification:{adaptItem:(item)=>item}, // no per-athlete adaptation needed for this fixture
};

const ruby={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development'};
const session={id:'sess-1',identity:{date:'2026-09-09',squads:['Development']},
  blocks:[{id:'m',title:'Main',items:[{id:'i1',kind:'set',reps:8,distance:100,stroke:'Breaststroke',raw:'8 x 100 Breaststroke'}]}]};

global.MSOS4={
  state:{
    settings:{storageRevision:1},
    canonicalSessions:{[session.id]:session},
    attendance:[{session_id:session.id,athlete_id:ruby.id,status:'present'}],
  },
};

require(path.join(root,'engines','stroke-balance.js'));
const B=global.MSOS4.strokeBalance;
assert.ok(B?.summary,'stroke-balance.js must install and export summary');

const s1=B.summary(ruby,global.MSOS4.state,{days:7,anchorDate:'2026-09-10'});
assert.equal(s1.sessions,1,'the one attended session in range must be counted');
assert.ok(s1.weighted.Breaststroke>0,'Breaststroke work must be attributed from the real session/block/item data');

const s2=B.summary(ruby,global.MSOS4.state,{days:7,anchorDate:'2026-09-10'});
assert.equal(s2,s1,'a repeat call with unchanged data must return the exact cached object, not a fresh recomputation');

global.MSOS4.state.settings.storageRevision=2;
const s3=B.summary(ruby,global.MSOS4.state,{days:7,anchorDate:'2026-09-10'});
assert.notEqual(s3,s1,'a real data change (storageRevision bump) must invalidate the cache and recompute');
assert.equal(s3.sessions,1);

// weeklyEmphasis() gets the same treatment.
const e1=B.weeklyEmphasis(global.MSOS4.state,'2026-09-10');
const e2=B.weeklyEmphasis(global.MSOS4.state,'2026-09-10');
assert.equal(e2,e1,'weeklyEmphasis must also cache per state-revision + anchorDate');

console.log('STROKE_BALANCE_SUMMARY_CACHE_PASS');
