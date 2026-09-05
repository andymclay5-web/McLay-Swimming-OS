'use strict';
// Proves engines/live-training-authority.js's L.apply rejects a stale/out-of-order live-sync
// message from the SAME sender before touching any state, rather than applying it and only
// ratcheting the revision counter afterwards -- while still accepting a message from a DIFFERENT
// sender even when its revision number happens to be lower (the counter is a per-sender local
// clock, not a shared logical one, so cross-sender comparison must never gate application).
//
// Real-world framing: L.apply only ever runs on a same-device derived display tab (TV/swimmer),
// fed over a same-origin BroadcastChannel from a coach-operational tab in the same browser -- see
// the addendum in architecture/WRITER_MAP_FINDINGS.md for why this is NOT cross-device live-sync.
// A backgrounded/frozen tab flushing a delivery backlog, or any future transport swap, could still
// deliver an older snapshot after a newer one was already shown; this closes that gap.
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
global.document={addEventListener:()=>{},getElementById:()=>null,querySelectorAll:()=>[]};
global.MSOS4={
  BUILD:'test-build',
  util:{now:()=>'2026-09-04T06:00:00.000Z'},
  state:{canonicalSessions:{s:{id:'s',blocks:[{id:'main',items:[{id:'boot'}]}]}},attendance:[],adaptationOverrides:[],trainingTestResults:[],settings:{selectedSessionId:'s',view:'tv',activeRole:'owner',activeUserAthleteId:'',assistantId:'',surfaceMode:'training',liveRevision:0}},
  access:{role:()=>global.MSOS4.state.settings.activeRole,sessionAllowed:()=>true},
  ui:{renderTV:()=>{global.MSOS4._tv=(global.MSOS4._tv||0)+1},renderSwimmer:()=>{}},
  live:{instanceId:'self',suppress:false},
};
require(path.resolve(__dirname,'../engines/live-training-authority.js'));
const M=global.MSOS4,L=M.live;

const msg=(from,revision,label)=>({kind:'v4-live-state',build:'test-build',from,authority:'coach-operational',sourceView:'board',sourceRole:'owner',surfaceMode:'training',sessionId:'s',session:{id:'s',blocks:[{id:'main',items:[{id:label}]}]},attendance:[{session_id:'s',athlete_id:'mck',status:'present',tag:label}],adaptationOverrides:[],trainingTestResults:[],revision});

// 1: a fresh message from coach-a (revision 10) must apply.
assert.equal(L.apply(msg('coach-a',10,'v10')),true,'first message from a sender must apply');
assert.equal(M.state.canonicalSessions.s.blocks[0].items[0].id,'v10');
assert.equal(M.state.attendance[0].tag,'v10');

// 2: a STALE message from the SAME sender (revision 5 < 10 already applied from coach-a) must be
// rejected before touching any state -- not applied-then-ratcheted.
assert.equal(L.apply(msg('coach-a',5,'STALE-v5')),false,'stale message from the same sender must be rejected');
assert.equal(M.state.canonicalSessions.s.blocks[0].items[0].id,'v10','a rejected stale message must not overwrite the newer session content already shown');
assert.equal(M.state.attendance[0].tag,'v10','a rejected stale message must not overwrite newer attendance already shown');

// 3: a later, genuinely newer message from coach-a (revision 11) must still apply normally.
assert.equal(L.apply(msg('coach-a',11,'v11')),true,'a newer message from the same sender must apply');
assert.equal(M.state.canonicalSessions.s.blocks[0].items[0].id,'v11');

// 4: a message from a DIFFERENT sender (coach-b) with a LOWER revision than coach-a's last (11)
// must still apply -- revision is a per-sender counter, not a shared clock, so a second legitimate
// source must never be silently dropped just because its own counter started lower.
assert.equal(L.apply(msg('coach-b',3,'coach-b-first')),true,'a first message from a different sender must apply even if its revision number is lower than another sender\'s');
assert.equal(M.state.canonicalSessions.s.blocks[0].items[0].id,'coach-b-first');

// 5: a stale repeat from coach-b (revision 1 < 3 already applied from coach-b) must be rejected,
// while coach-a's own history is unaffected by coach-b's counter.
assert.equal(L.apply(msg('coach-b',1,'STALE-coach-b')),false,'stale message from coach-b must be rejected using coach-b\'s own last-applied revision, not coach-a\'s');
assert.equal(M.state.canonicalSessions.s.blocks[0].items[0].id,'coach-b-first');
assert.equal(L.apply(msg('coach-a',10,'STALE-coach-a-again')),false,'coach-a\'s own stale revision 10 must still be rejected after a coach-b message was applied in between');

console.log('LIVE_TRAINING_AUTHORITY_STALE_REVISION_PASS same-sender-stale-rejected cross-sender-not-blocked');
