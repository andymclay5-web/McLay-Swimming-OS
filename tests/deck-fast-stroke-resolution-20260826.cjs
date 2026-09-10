'use strict';
// Real coaching failure this now pins (rewritten 10 Sept 2026 -- see the flip note below): Andy reported live,
// in his own words, that a medley swimmer's #1-stroke pill "wasn't pulling... I was saying auto or no stroke
// required, no stroke there" -- and traced by Claude to this exact file's ORIGINAL intent. The Board view
// ('deckFast' mode) used to skip the real medley "which stroke needs training work" analysis
// (M.strokeBalance.recommendStroke) entirely and silently fall back to a plain highest-ranked single-stroke
// PB -- or nothing at all ("Auto") for a swimmer whose only strong ranked PB was Freestyle -- on the ONE
// screen Andy actually coaches from every day. That bypass existed because stroke-balance.js's summary() did
// an uncached 7-day session/block/item walk, too expensive to redo per stroke pill per swimmer across a full
// roster.
//
// The flip: stroke-balance.js now caches summary()/weeklyEmphasis() per athlete+day+state-revision (see its
// own comment), so repeat calls across a render pass are free after the first -- removing the reason for the
// bypass. This test used to assert the OLD (buggy) behaviour: that the deep call must NEVER happen on Board
// view. It now asserts the CORRECT behaviour Andy actually needs: Board view gets the real deep recommendation
// too, and repeated calls for the same swimmer/session/data-revision are cheap (a genuine cache hit, not a
// second real computation) -- so this fix does not reintroduce the performance problem the old bypass was
// guarding against.
const assert=require('node:assert/strict');

const athlete={id:'im1',full_name:'IM Primary'};
const rows=[
  {id:'im',athlete_id:'im1',distance:200,stroke:'IM',course:'SCM',result_seconds:125,wa_points:700},
  {id:'fr',athlete_id:'im1',distance:100,stroke:'Freestyle',course:'SCM',result_seconds:58,wa_points:650},
  {id:'bk',athlete_id:'im1',distance:100,stroke:'Backstroke',course:'SCM',result_seconds:66,wa_points:620}
];
const Evidence={
  key:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,''),
  course:r=>String(r.course||'').toUpperCase(),
  distance:r=>Number(r.distance),
  rowStroke:r=>r.stroke,
  seconds:r=>Number(r.result_seconds),
  pbRows:ath=>rows.filter(r=>r.athlete_id===ath.id),
  t400Rows:()=>[],
  stroke:v=>v
};
global.MSOSEngines={Evidence,RacePace:{rankedEvents:ath=>rows.filter(r=>r.athlete_id===ath.id).map(r=>({row:r,distance:r.distance,stroke:r.stroke,course:r.course,seconds:r.result_seconds,score:r.wa_points,pointSource:'WA'})).sort((a,b)=>b.score-a.score)}};
let deepCalls=0;
global.MSOS4={
  state:{settings:{view:'board',storageRevision:1},adaptationOverrides:[]},
  pathway:{isPara:()=>false,points:(_a,r)=>({value:r.wa_points,label:'WA',source:'result'})},
  waPointsEngine:{tableInfo:()=>({}),equivalentTime:()=>null},
  strokeBalance:{recommendStroke:()=>{deepCalls++;return{stroke:'Breaststroke',source:'deep weekly balance',confidence:'high'};}}
};
require('../engines/performance.js');
const P=global.MSOS4.performanceEngine,session={id:'s1',identity:{course:'SCM'}};

// On the Board view, the swimmer's real medley recommendation must now be used -- not a shallow PB fallback.
const board1=P.selectStrokeForContext(athlete,{raw:'#1 Stroke'},global.MSOS4.state,session,{});
assert.equal(deepCalls,1,'Board resolution must call the real deep weekly stroke-balance analysis (the previous silent bypass was the bug Andy reported)');
assert.equal(board1.stroke,'Breaststroke','the swimmer\'s real medley "needs work" recommendation must be used on Board, not a shallow highest-PB fallback');

// A second call for the exact same swimmer/session/data-revision must hit the cache, not redo the deep
// analysis -- this is what makes it safe to run everywhere (including Board with a full roster) without
// reintroducing the performance problem the old bypass existed to avoid.
const board2=P.selectStrokeForContext(athlete,{raw:'#1 Stroke'},global.MSOS4.state,session,{});
assert.equal(deepCalls,1,'a repeat call with unchanged data must be served from cache, not recomputed');
assert.equal(board2,board1,'a cache hit must return the exact same result, not a freshly rebuilt one');

// Once the underlying data genuinely changes (storageRevision bumps, e.g. after a save), it must recompute.
global.MSOS4.state.settings.storageRevision=2;
P.invalidate(global.MSOS4.state);
const board3=P.selectStrokeForContext(athlete,{raw:'#1 Stroke'},global.MSOS4.state,session,{});
assert.equal(deepCalls,2,'a genuine data change must invalidate the cache and recompute');
assert.equal(board3.stroke,'Breaststroke');

// Non-Board views behave identically -- there is no longer a separate "deck" vs "deep" code path at all.
global.MSOS4.state.settings.view='athletes';
P.invalidate(global.MSOS4.state);
const deep=P.selectStrokeForContext(athlete,{raw:'#1 Stroke'},global.MSOS4.state,session,{});
assert.equal(deepCalls,3);
assert.equal(deep.stroke,'Breaststroke');

console.log('DECK_FAST_STROKE_RESOLUTION_PASS');
