'use strict';
const assert=require('node:assert/strict');

global.addEventListener=()=>{};
global.MSOS4={
  state:{settings:{},seasonPlans:[],weeklyPlans:[]},
  ui:{},actions:{},
  util:{text:v=>String(v??'').replace(/\s+/g,' ').trim(),escape:v=>String(v??''),clock:v=>String(v??'')},
  store:{legacy:()=>({})},refs:{get:()=>[]},correct:{},
  currentSession:()=>session
};
require('../engines/plan-reference-ch.js');
const M=global.MSOS4;
const season=M.state.seasonPlans.find(x=>x.id==='season-aquagym-winter-2026-national-development');
assert.ok(season,'Winter 2026 National / Development season must be loaded');
assert.equal(season.start_date,'2026-05-11');
assert.equal(season.end_date,'2026-09-28');
assert.match(season.overarching_goal,/Finish & Breath Control/);
const week=M.state.weeklyPlans.find(x=>x.week_start==='2026-08-24'&&x.squad==='National');
assert.ok(week,'24 Aug National week must be loaded');
assert.match(week.objective,/Fly/);
assert.match(week.objective,/Finish & Breath Control/);
assert.match(week.objective,/Anaerobic Power/);
assert.match(week.objective,/South Island SC Champs/);
const mon=week.sessions.find(x=>x.day==='Monday'&&x.dayPart==='AM');
assert.ok(mon,'National Monday AM weekly structure must be linked');
assert.equal(mon.primary_system,'Aerobic Capacity');
assert.match(mon.objective,/Kick \/ Skills/);

const session={id:'plan-ch-fixture',identity:{date:'2026-08-24',dayPart:'AM',squads:['National'],venue:'AquaGym',course:'SCM'},metadata:{}};
require('../engines/coach-loop-ui.js');
const ctx=M.coachLoopUI.planContext(session);
assert.equal(ctx.linkStatus,'season+week','Coach Hub must resolve both season and week');
assert.match(ctx.seasonName,/Winter 2026/);
assert.match(ctx.seasonGoal,/Finish & Breath Control/);
assert.ok(ctx.weeklyFocus,'Weekly focus must not be blank');
assert.ok(ctx.technicalFocus,'Weekly technical focus must not be blank');
assert.equal(ctx.todayFocus,'Aerobic Capacity');
console.log('PLAN_REFERENCE_CH_PASS',ctx.seasonName,'|',ctx.weeklyFocus,'|',ctx.todayFocus);
