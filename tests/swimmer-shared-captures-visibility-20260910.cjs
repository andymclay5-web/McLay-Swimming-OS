'use strict';
// Real coaching failure this pins: Andy's build-list item 5 -- "captures/notes he marks available to swimmer
// [must be] available to swimmer". engines/coach-loop-ui.js's post-save "Share with swimmer" checkbox sets
// cap.audience to 'shared' or 'coach'; engines/swimmer-invite-bn.js's payloadFor is supposed to publish only
// the ones marked 'shared' (or 'swimmer') for THIS athlete into sharedEvidence, and swimmer-portal.js is
// supposed to render them under "From Andy". Each of those three pieces existed already, but nothing had ever
// driven a capture through all three end to end -- a coach unchecking the share box, or a capture belonging to
// a different swimmer, could have silently leaked to the wrong portal, or a shared one could have silently
// never reached it, without any test catching it either way.
//
// This drives the REAL swimmer-invite-bn.js payloadFor (the exact function that publishes the swimmer portal
// snapshot) against a mixed set of captures -- shared for this athlete, private (coach-only) for this athlete,
// and shared but for a DIFFERENT athlete -- then feeds the resulting sharedEvidence through the REAL
// swimmer-portal.js training() renderer, proving only the one capture that is both (a) this athlete's and (b)
// marked shared actually reaches the swimmer's own screen.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

const ruby={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development'};
const otherSwimmer={id:'ath-jonah',full_name:'Jonah Price',squad:'Development'};

global.MSOS4={
  ui:{},
  state:{
    athletes:[ruby,otherSwimmer],
    settings:{selectedAthleteId:ruby.id},
    captures:[
      // Andy ticked "Share with swimmer" on this one for Ruby -- must reach her portal.
      {id:'cap-shared-ruby',athlete_id:ruby.id,audience:'shared',title:'Great streamline off the wall',text_content:'Great streamline off the wall',created_at:'2026-09-09T18:00:00Z'},
      // Andy left this one as a private coaching note for Ruby -- must NOT reach her portal.
      {id:'cap-private-ruby',athlete_id:ruby.id,audience:'coach',title:'Watch her taper fatigue closely',text_content:'Watch her taper fatigue closely',created_at:'2026-09-09T17:00:00Z'},
      // Shared, but for a DIFFERENT swimmer entirely -- must never leak into Ruby's portal.
      {id:'cap-shared-other',athlete_id:otherSwimmer.id,audience:'shared',title:'Jonah start work',text_content:'Jonah start work',created_at:'2026-09-09T16:00:00Z'},
    ],
  },
  currentSession:()=>null,
};
global.window=global;
global.location={search:''};
global.document={readyState:'complete',querySelector:()=>null,addEventListener(){}};
global.requestAnimationFrame=()=>{};

require(path.join(root,'engines','swimmer-invite-bn.js'));
const X=global.MSOS4.swimmerInviteBN;
assert.ok(X?.payloadFor,'swimmer-invite-bn.js must install and export payloadFor');

const payload=X.payloadFor(ruby);
const ids=(payload.sharedEvidence||[]).map(x=>x.id);
assert.deepEqual(ids,['cap-shared-ruby'],`Ruby's published sharedEvidence must contain exactly her one shared capture, got: ${JSON.stringify(ids)}`);
assert.ok(!ids.includes('cap-private-ruby'),"a capture Andy did NOT mark shared must never publish to the swimmer's portal");
assert.ok(!ids.includes('cap-shared-other'),"another swimmer's shared capture must never leak into Ruby's portal");

// --- now drive the REAL swimmer-portal.js training() renderer with this exact payload -----------------------
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function extractFunction(src,startMarker){
  // Pull out one top-level function's exact source by counting braces from its opening one, rather than a
  // regex -- the body's own template-literal ${...} expressions contain '}' characters that would confuse a
  // naive non-greedy regex match.
  const start=src.indexOf(startMarker);
  assert.ok(start>-1,`could not locate ${JSON.stringify(startMarker)} in swimmer-portal.js`);
  const braceStart=src.indexOf('{',start);
  let depth=0,i=braceStart;
  for(;i<src.length;i++){
    if(src[i]==='{')depth++;
    else if(src[i]==='}'){depth--;if(depth===0)break;}
  }
  return src.slice(start,i+1);
}
function trainingSectionFrom(p){
  // swimmer-portal.js's training(p) is a pure function of the payload (p.training + p.sharedEvidence) -- load
  // the real file's source and pull out just this one function (it isn't itself require()-able, since it
  // self-invokes as a page script), then call the exact same rendering path the live portal uses.
  const src=require('node:fs').readFileSync(path.join(root,'swimmer-portal.js'),'utf8');
  const fnSrc=extractFunction(src,'function training(p)');
  const fn=new Function('esc',`return (${fnSrc});`)(esc);
  return fn(p);
}
const html=trainingSectionFrom(payload);
assert.match(html,/From Andy/,'the portal must show a "From Andy" section when shared evidence is present');
assert.match(html,/Great streamline off the wall/,"Ruby's shared capture text must render in her portal");
assert.doesNotMatch(html,/Watch her taper fatigue closely/,"Andy's private coaching note must never render in Ruby's portal");
assert.doesNotMatch(html,/Jonah start work/,"another swimmer's shared capture must never render in Ruby's portal");

console.log('SWIMMER_SHARED_CAPTURES_VISIBILITY_PASS', `sharedEvidence: ${JSON.stringify(ids)}`);
