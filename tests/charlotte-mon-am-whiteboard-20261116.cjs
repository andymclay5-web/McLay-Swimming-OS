'use strict';
// Andy, Mon 16 Nov 2026 05:40 -- photo of the pool whiteboard: squad on the left, Charlotte on the right, written by hand.
// The app's Charlotte column must match his board line for line (his 3x50 Bk warm-up is his own edit on the phone):
//   200 fr / 200 fr / 4x50 Br · 7x50 Kick ↓1-4/5-7 on 2:15 · X2 [250 fob fins / 2x100 fr kick fins / 250 Bk kick fins /
//   5x50 Kick no fins Build on 2:15] · 8x25 ↓H2O · 100 warm down.
// Before: the kick read "7 × 50 kick, Desc 1-3 @ 2:15 · Desc 1-3" -- the bridge kept the squad's repeating 1-3 although 7
// can't repeat in threes, and both "descend 1-3" (set line) and "Desc 1-3" (cue) showed.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESSION=`WARM-UP
300 Free 15sR
3 x 100 Back 15sR
300 Free 15sR
6 x 50 Breast 15sR

PRE-SET
12 x 50 kick, descend 1-3 @1.10
Desc 1-3

MAIN SET
2 Rounds:
  400 fins fly kick (fob) 15 sr
  4 x 100 Free fins kick 15 sr
  400 Back fins kick in streamline 15 sr
  8 x 50 kick build @1.10

POST-SET
8 x 25 UW underwater @45

WARM-DOWN
200 choice`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOSEngines?.Coordinator?.prescription&&window.MSOS4?.boardEngine?.cueText,{timeout:30000});await p.waitForTimeout(400);
  const r=await p.evaluate(t=>{const M=window.MSOS4,E=window.MSOSEngines,B=M.boardEngine;
    const ch={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true};M.state.athletes=[ch];
    M.state.adaptationProfiles=[{id:'p',athlete_id:ch.id,default_volume_ratio:0.6,active:true,activation_mode:'always'}];
    const s=M.parser.parse(t,{id:'mon',date:'2026-11-16',dayPart:'AM',squads:['National'],course:'SCM'});s.id='mon';const out=[];
    const walk=xs=>{for(const i of xs||[]){if(i.kind==='group')walk(i.items);else if(i.kind==='set'){const x=E.Coordinator.prescription(s,i,ch,M.state).item;out.push({raw:x.raw,reps:x.reps,d:x.distance,cyc:x.cycleSeconds||null,cue:B.cueText(x)});}}};s.blocks.forEach(bl=>walk(bl.items));return out;},SESSION);
  const j=JSON.stringify(r,null,1);const line=re=>r.find(x=>re.test(x.raw));
  assert.equal(line(/^200 Free/).reps*line(/^200 Free/).d,200,j);assert.match(line(/Breast/).raw,/^4 × 50 Breast/,j);
  const kick=line(/descend|Desc/i);assert.equal(kick.reps,7);assert.equal(kick.cyc,135);assert.match(kick.raw,/Desc 1-4 \/ 5-7/,j);assert.doesNotMatch(kick.cue,/Desc 1-3/,j);assert.equal((kick.cue.match(/Desc 1-4 \/ 5-7/g)||[]).length,1,`once: ${kick.cue}`);
  assert.match(line(/fly kick/).raw,/^250 fins fly kick/,j);assert.match(line(/Free fins kick/).raw,/^2 × 100 Free fins kick/,j);assert.match(line(/Back fins kick/).raw,/^250 Back fins kick/,j);
  const build=line(/kick build/);assert.equal(build.reps,5);assert.equal(build.cyc,135);assert.match(line(/UW underwater/).raw,/^8 x 25/,j);assert.match(line(/choice/i).raw,/^100 choice/,j);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CHARLOTTE_MON_AM_WHITEBOARD_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
