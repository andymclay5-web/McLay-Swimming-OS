'use strict';
// Real coaching failure this pins: Andy's build-list item 6 -- "board showing individual session +
// overriding squad session with modifications". The projection engine (architecture/athlete-report-core.js's
// athleteSessionProjection) already computes exactly where an individual's session diverges from the plain
// squad session -- a squad-layer or fully individual start (with any join warm-up), an early squad or
// individual finish, and the full un-truncated squad metres to compare against. But
// engines/swimmer-invite-bn.js's safeSession() discarded all of that, publishing only the already-merged
// blocks/metres to the swimmer portal -- so a swimmer whose session was genuinely modified (joined a squad
// layer late, or the squad's own session was cut short by Andy) had no way to tell their view was anything
// other than a plain, unmodified squad session.
//
// Fix: safeSession() now also publishes a `modification` field (start/finish source+label+join-work, and the
// full squad metres), and swimmer-portal.js's sessionView() renders a "this is your own version of the squad
// session" callout built from it whenever something genuinely differs -- and renders nothing at all for a
// swimmer whose session was not modified.
//
// This drives the REAL architecture engines end to end (athlete-session-core.js's real makeStart/boundary
// truth, training-history-core.js's real recordSession, athlete-report-core.js's real projection) through the
// real swimmer-invite-bn.js safeSession() and the real swimmer-portal.js modificationNote() renderer.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

global.MSOSArchitecture={
  AthleteSession:require(path.join(root,'architecture','athlete-session-core.js')),
  TrainingHistory:require(path.join(root,'architecture','training-history-core.js')),
  AthleteObservation:require(path.join(root,'architecture','athlete-observation-core.js')),
  AthleteReport:require(path.join(root,'architecture','athlete-report-core.js')),
};
global.MSOSEngines={};
const Core=global.MSOSArchitecture.AthleteSession;

const ruby={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development'};

// A session where Andy cut the squad's own session short after the Main block ('m') -- a MODIFICATION that
// applies to the whole squad, not just one swimmer (session.finish.throughBlockId, not an athlete boundary).
// Ruby also joins individually at the Main block, with a real join warm-up -- a SECOND, individual modification.
const sessionWithMods={id:'sess-mods',identity:{date:'2026-09-10',dayPart:'AM',title:'Threshold AM',squads:['Development'],course:'SCM'},
  blocks:[
    {id:'w',title:'Warm Up',items:[{id:'i-w',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100 Free'}]},
    {id:'m',title:'Main',items:[{id:'i-m',kind:'set',reps:4,distance:100,stroke:'Freestyle',zone:'Development',raw:'4 x 100 Development'}]},
    {id:'p',title:'Post',items:[{id:'i-p',kind:'set',reps:5,distance:200,stroke:'Freestyle',raw:'5 x 200 Pull'}]},
  ],
  finish:{throughItemId:'i-p',throughBlockId:'p',roundByGroup:{},actualDistance:1800}};
// A plain, un-modified session -- full squad session, no finish truncation, no individual boundary at all.
const sessionPlain={id:'sess-plain',identity:{date:'2026-09-11',dayPart:'AM',title:'Aerobic AM',squads:['Development'],course:'SCM'},
  blocks:[{id:'m2',title:'Main',items:[{id:'i-m2',kind:'set',reps:8,distance:100,stroke:'Freestyle',raw:'8 x 100 Aerobic'}]}],finish:null};

const rubyStart=Core.makeStart({session:sessionWithMods,athleteId:ruby.id,itemId:'i-m',blockId:'m',label:'4 x 100 Development',joinWork:{metres:200,text:'200 easy warm-up'}});

global.MSOS4={
  ui:{},
  state:{
    canonicalSessions:{[sessionWithMods.id]:sessionWithMods,[sessionPlain.id]:sessionPlain},
    athletes:[ruby],
    attendance:[{session_id:sessionWithMods.id,athlete_id:ruby.id,status:'modified'},{session_id:sessionPlain.id,athlete_id:ruby.id,status:'present'}],
    attendanceSnapshots:{},
    athleteSessionBoundaries:[rubyStart],
    squadSessionBoundaries:[],
    captures:[],
    settings:{},
  },
  currentSession:()=>null,
};
global.document={readyState:'complete',querySelector:()=>null,addEventListener(){}};
global.requestAnimationFrame=()=>{};
global.window=global;
global.location={search:''};

require(path.join(root,'engines','swimmer-training-bd.js'));
require(path.join(root,'engines','swimmer-invite-bn.js'));
const X=global.MSOS4.swimmerInviteBN;
assert.ok(X?.safeSession,'swimmer-invite-bn.js must install and export safeSession');

const modified=X.safeSession(ruby,sessionWithMods);
assert.ok(modified,'safeSession must build a real session for the modified fixture');
assert.equal(modified.modification.startSource,'athlete_start',"Ruby's individual join must be reflected as an athlete_start");
assert.match(modified.modification.startLabel,/4 x 100 Development/,'the start label must name the real line she joined at');
assert.equal(modified.modification.joinWorkMetres,200,"her real join warm-up metres must be published");
assert.equal(modified.modification.finishSource,'squad_finish',"the squad's own early finish must be reflected as squad_finish");
assert.match(modified.modification.finishLabel,/5 x 200 Pull/,'the finish label must name the real line the squad session ended at');
assert.equal(modified.modification.fullSquadMetres,1800,'the full un-truncated squad metres must be published for comparison');

const plain=X.safeSession(ruby,sessionPlain);
assert.ok(plain,'safeSession must build a real session for the plain fixture');
assert.equal(plain.modification.startSource,'session_start','an unmodified session must report a plain session_start');
assert.equal(plain.modification.finishSource,'planned','an unmodified session must report a plain planned finish');

// --- now drive the REAL swimmer-portal.js modificationNote(s) renderer with these exact session objects ------
function extractFunction(src,startMarker){
  const start=src.indexOf(startMarker);
  assert.ok(start>-1,`could not locate ${JSON.stringify(startMarker)} in swimmer-portal.js`);
  const braceStart=src.indexOf('{',start);
  let depth=0,i=braceStart;
  for(;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'){depth--;if(depth===0)break;}}
  return src.slice(start,i+1);
}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const portalSrc=require('node:fs').readFileSync(path.join(root,'swimmer-portal.js'),'utf8');
const modificationNote=new Function('esc',`return (${extractFunction(portalSrc,'function modificationNote(s)')});`)(esc);

const noteHtml=modificationNote(modified);
assert.match(noteHtml,/own version of the squad session/i,'a genuinely modified session must show the callout');
assert.match(noteHtml,/4 x 100 Development/,"the callout must say where Ruby's own start point is");
assert.match(noteHtml,/200m warm-up/,'the callout must surface her real join warm-up metres');
assert.match(noteHtml,/squad session finished early/i,"the callout must say the squad's own session ended early");
assert.match(noteHtml,/1,800m/,'the callout must show the full squad metres for comparison, since it differs from her own');

const plainNoteHtml=modificationNote(plain);
assert.equal(plainNoteHtml,'','an unmodified session must render no callout at all -- nothing to explain');

console.log('SWIMMER_SESSION_MODIFICATION_VISIBILITY_PASS');
