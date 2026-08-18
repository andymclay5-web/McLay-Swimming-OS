'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
const Targets=require('../engines/targets.js');
const Adaptation=require('../engines/adaptation.js');
const Board=require('../engines/board-projection.js');
const Render=require('../ui/board-renderer.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const identity={id:'individual-team',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym'};
function system(src){
 const evidence=Evidence.create({sources:[{id:'verified',priority:100,trust:'verified',data:{
  athletes:[
   {id:'mk',full_name:'McKenzie Drage',squad:'National',active:true,sex:'F'},
   {id:'molly',full_name:'Molly McKernan',squad:'Development',active:true,sex:'F'},
   {id:'std',full_name:'Standard Swimmer',squad:'Development',active:true,sex:'M'}
  ],
  training_test_types:[{id:'tt',test_key:'t400_freestyle'}],
  training_test_results:[
   {id:'mk-t400',athlete_id:'mk',test_type_id:'tt',result_seconds:450.1,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true},
   {id:'molly-t400',athlete_id:'molly',test_type_id:'tt',result_seconds:324.6,result_date:'2026-08-12',pool_course:'SCM',valid_for_anchor:true},
   {id:'std-t400',athlete_id:'std',test_type_id:'tt',result_seconds:300,result_date:'2026-06-01',pool_course:'SCM',valid_for_anchor:true}
  ],
  coach_results:[
   {id:'mk100',athlete_id:'mk',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:80,result_date:'2026-07-01'},
   {id:'molly100',athlete_id:'molly',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:60,result_date:'2026-07-01'},
   {id:'std100',athlete_id:'std',distance:100,stroke:'Freestyle',pool_course:'SCM',result_seconds:58,result_date:'2026-07-01'}
  ]
 }}]});
 const attendance=Attendance.create({storage:new Attendance.MemoryStorage(),evidence,clock:()=>new Date('2026-08-18T05:30:00+12:00').toISOString()});
 const targets=Targets.create({evidence}),adaptation=Adaptation.create({evidence}),board=Board.create({truth:Truth,attendance,adaptation,targets}),session=Truth.parse(src,identity);
 return{attendance,targets,adaptation,board,session};
}

test('modified aerobic swimmer target stays with modification, not group target row',()=>{
 const {attendance,board,session}=system('Main Set\n6 x 100 Free Development 10 sr');
 attendance.mark(session,'mk','modified');attendance.mark(session,'molly','present');attendance.mark(session,'std','present');
 const set=board.project(session).blocks[0].items[0],mod=set.modifications.find(x=>x.athleteId==='mk');
 assert(mod);assert.equal(mod.work.reps,4);assert.equal(mod.target.status,'ok');
 assert(!set.targets.some(x=>x.athleteId==='mk'));
 assert.deepEqual(set.targets.map(x=>x.athleteId).sort(),['molly','std']);
});

test('modified continuous distance displays adapted metres, never stale original raw metres',()=>{
 const {attendance,board,session}=system('Main Set\n400 Pull');attendance.mark(session,'mk','modified');
 const model=board.project(session),set=model.blocks[0].items[0],mod=set.modifications[0],html=Render.renderBoard(model);
 assert.equal(mod.work.distance,300);assert.equal((html.match(/400 Pull/g)||[]).length,1);assert(/300 Pull/.test(html));
});

test('shared phased quality keeps McKenzie with team and keeps her race target in shared phase',()=>{
 const src=`Post Set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace`,{attendance,board,session}=system(src);
 attendance.mark(session,'mk','modified');attendance.mark(session,'molly','present');
 const set=board.project(session).blocks[0].items[0];
 assert(!set.modifications.some(x=>x.athleteId==='mk'));
 const racePhase=set.phases.find(p=>p.targets.some(t=>t.athleteId==='mk'&&t.status==='rep_race'));assert(racePhase);
 const race=racePhase.targets.find(t=>t.athleteId==='mk'&&t.status==='rep_race');assert.deepEqual(race.rows.map(x=>x.rep),[4,8]);
 const html=Render.renderBoard(board.project(session));assert(!/data-athlete-id="mk"[^>]*class="msos-mod-card/.test(html));assert(/#4/.test(html)&&/#8/.test(html));
});

test('unmodified swimmer remains only in shared target rows',()=>{
 const {attendance,board,session}=system('Main Set\n6 x 100 Free Development 10 sr');attendance.mark(session,'std','present');
 const set=board.project(session).blocks[0].items[0];assert.equal(set.modifications.length,0);assert.equal(set.targets.length,1);assert.equal(set.targets[0].athleteId,'std');
});

if(fails){console.error(`\n${fails} individual-within-team Board regression(s) failed`);process.exit(1)}
console.log('\nALL INDIVIDUAL-WITHIN-TEAM BOARD REGRESSIONS PASS');
