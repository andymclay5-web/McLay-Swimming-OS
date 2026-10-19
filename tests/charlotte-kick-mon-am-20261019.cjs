'use strict';
// Andy, Mon 19 Oct 2026 AM ("Charlotte not right esp that kick set, doubling up again, what else do you see" and
// "session analysis is putting too much weight on sprint components of kick set"). His real session, his real
// Charlotte profile (just over half, 50 kick base 2:15) and her real T400s. Proves on the Board:
//  - the heading "KICK DEVELOPMENT / BODY POSITION" is the session theme, not a 0m block (and no "Charlotte 0m");
//  - "Makeup: 100 Free / 100 Reverse IM / 50 IM Order" isn't shown twice;
//  - Charlotte's kick sets read as written ("3×50 Kick @ 2:15", not "Fr Kick") and identical work isn't listed again;
//  - in "5 Rounds: 100 Kick Build / 2 x 25 Kick" Charlotte does 3 rounds (450m), shown once under the rounds label;
// and in session analysis only the 15m MAX of each 25 counts as speed (150m, not 250m).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SRC=`KICK DEVELOPMENT / BODY POSITION\n\n\nWARM-UP\n4 x 250\n100 Free / 100 Reverse IM / 50 IM Order\nMakeup: 100 Free / 100 Reverse IM / 50 IM Order\n5 x 50 Kick @ 1:15\n25 Easy / 25 Fast\n400 IM\n\nMAIN SET\n8 x 200 Fins\n#1—4 Choice Kick\nBuild\n#5—8 FOB\nFly Kick on Back in Streamline build dist under water\n\nPOST-SET\n5 Rounds:\n  100 Kick Build @ 2:30\n  2 x 25 Kick @ 0:45\n15m MAX\n\nWARM-DOWN\n200 Easy`;
const CH={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',squad:'National',active:true,sex:'F',current_s_class:'S6'};
const PROF={id:'adapt-profile-athlete-charlotte-murphy',athlete_id:CH.id,profile_label:'Just over ½ session',default_volume_ratio:0.6,default_cycle_multiplier:1.15,rep_strategy:'Reduce repetitions first while retaining every key block.',distance_strategy:'Protect skill and quality distances; shorten long aerobic repetitions before short race work.',rest_strategy:'Preserve enough recovery to maintain the planned stimulus.',locked_rules:'Keep the same session theme and technical standards. Use full pool lengths for normal work. Aim just over half the main-squad volume.',successful_adaptations:'50m kick: 2:15 cycle held better than 2:00 on 6 August 2026; suggest 2:15 for comparable work.',active:true,activation_mode:'always'};
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.boardEngine?.workBlocks&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.dosageEngine,{timeout:25000});await p.waitForTimeout(500);
  const r=await p.evaluate(({SRC,CH,PROF})=>{const M=window.MSOS4;M.state.athletes=[CH,{id:'seth',full_name:'Seth Brown',squad:'National',active:true}];M.state.adaptationProfiles=[PROF];
    M.state.trainingTestTypes=[{id:'tf',test_key:'t400_freestyle',name:'Timed 400 Freestyle'}];M.state.trainingTestResults=[{id:'c1',athlete_id:CH.id,test_type_id:'tf',result_seconds:526.4,result_date:'2025-10-01',pool_course:'SCM',valid_for_anchor:true}];
    const s=M.parser.parse(SRC,{date:'2026-10-19',dayPart:'AM',squads:['National']});s.id='mon-am';s.identity={...s.identity,date:'2026-10-19',dayPart:'AM',squads:['National'],title:'AM · National'};M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
    M.state.attendance=[{id:'a1',session_id:s.id,athlete_id:CH.id,status:'modified'},{id:'a2',session_id:s.id,athlete_id:'seth',status:'present'}];M.state.settings.boardFocusMode=false;M.store.save(M.state);M.nav.show('board');M.ui.renderBoard();
    return new Promise(res=>setTimeout(()=>{const host=document.querySelector('#boardView');const blocks=[...host.querySelectorAll('.msos-board-block h2')].map(x=>x.textContent);
      const rowText=id=>host.querySelector(`.msos-work-row[data-item="${id}"]`)?.textContent||'';const find=re=>{for(const bl of s.blocks)for(const n of bl.items){const it=n.kind==='group'?n.items:[n];for(const x of it)if(re.test(x.raw))return x.id;}};
      const vol=M.boardModVolume.blockVolume(s.blocks.find(x=>/post/i.test(x.title)),CH,s);
      const dose=M.dosageEngine.session(s,M.state,{delivered:false});
      res({blocks,nav:[...host.querySelectorAll('[data-msos-block]')].map(x=>x.textContent),theme:host.querySelector('.msos-board-theme')?.textContent||'',top:host.querySelector('.msos-board-top').textContent,
        wu250:rowText(find(/^4 x 250/)),kick50:rowText(find(/^5 x 50 Kick/)),kick100:rowText(find(/^100 Kick/)),kick25:rowText(find(/^2 x 25 Kick/)),rounds:host.querySelector('.msos-rounds')?.textContent||'',vol,speed:dose.systems['Speed / Max'].metres,modVol:host.textContent.match(/Charl\w*\s+0m/)?'zero':''});},700));},{SRC,CH,PROF});
  assert.ok(!r.blocks.some(x=>/Kick Development/i.test(x)),`no 0m heading block: ${r.blocks}`);assert.ok(!r.nav.includes('KICK'),`nav: ${r.nav}`);
  assert.match(r.theme,/Kick Development \/ Body Position/i,'shown as the session theme');assert.equal(r.modVol,'','no "Charlotte 0m"');
  assert.equal((r.wu250.match(/100 Free \/ 100 Reverse IM \/ 50 IM Order/g)||[]).length,2,`"Makeup" line not repeated (squad + Charlotte once each): ${r.wu250}`);
  assert.match(r.kick50,/3×50 Kick @ 2:15/,'Charlotte 3×50 Kick @ 2:15 (her coach-confirmed kick base)');assert.doesNotMatch(r.kick50,/Fr Kick/,'no invented "Fr"');
  assert.doesNotMatch(r.kick100,/Charl/,'identical 100 Kick not listed again for Charlotte');assert.doesNotMatch(r.kick25,/Charl/,'identical 2×25 not listed again');
  assert.match(r.rounds,/5 ROUNDS[\s\S]*Charl[\s\S]*3 ROUNDS/,'Charlotte does 3 of the 5 rounds');
  assert.equal(r.vol,450,'her post-set is 450m, not the squad 750m');
  assert.equal(r.speed,150,'only the 15m MAX of each 25 counts as speed (5 rounds x 2 x 15m)');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('CHARLOTTE_KICK_MON_AM_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
