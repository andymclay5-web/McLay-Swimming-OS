'use strict';
// Andy, Mon 16 Nov 2026: "i have taken captures of Matthew today. These should be visible on his profile with intelligence
// around what, when, why or what we were working on" ... "It needs to be more tangible, usable information" ... "what's
// little Johnny working on at the moment? Boom. Any coach can see that ... they can see it themselves, their parents can
// see it, it's all black and white." Proves, with his four real captures of Matthew Callow from this morning:
//  1. One plain card above the tabs: WHAT MATTHEW IS WORKING ON -- the focus in Andy's words, latest note, before/after
//     clips, which events it helps -- plus Training lately and Developing.
//  2. Clips open from the card (the capture viewer's button), grouped to the set they were taken on.
//  3. The Training tab's long lists fold to one line each; captures have their own tab (17 Nov: Timeline / By stroke /
//     By focus / Notes).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const iso=d=>d.toISOString().slice(0,10);const daysAgo=n=>iso(new Date(Date.now()-n*864e5));
const SESSION=`WARM-UP\n300 Free 15sR\n3 x 100 Back 15sR\n\nPRE-SET\n12 x 50 kick, descend 1-3 @1.10\n\nMAIN SET\n2 Rounds:\n  400 fins fly kick (fob) 15 sr\n  4 x 100 Free fins kick 15 sr\n  400 Back fins kick in streamline 15 sr\n  8 x 50 kick build @1.10\n\nPOST-SET\n8 x 25 UW underwater @45`;
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.raceElementsUI?.workingOnHtml,{timeout:30000});await p.waitForTimeout(500);
  await p.evaluate(({S,today,prev,mid})=>{const M=window.MSOS4;const mc={id:'athlete-matthew-callow',full_name:'Matthew Callow',squad:'Development',active:true,sex:'M',date_of_birth:'2012-03-01'};M.state.athletes=[mc];
    const s=M.parser.parse(S,{date:today,dayPart:'AM',squads:['National','Development'],course:'SCM'});s.id='session-1kvcy6x';M.store.putSession(M.state,s);
    const main=s.blocks.find(x=>x.type==='main_set');M.state.attendance=[{session_id:s.id,athlete_id:mc.id,status:'present'}];
    const at=(min)=>new Date(Date.now()-60*60e3+min*60e3).toISOString();const cap=(id,title,note,min,who=mc.id)=>({id,session_id:s.id,athlete_id:who,athlete_ids:who?[who]:[],capture_type:who?'video':'text',text_content:title,title,capture_note:note,block_id:main.id,created_at:at(min),audience:who?'shared':'coach',from_cloud:true});
    M.state.captures=[cap('c1','Free kick','Bit too much knees here',0),cap('c2','Fob fins','Streamline and rhythm',7),cap('c3','Fob fins','See hands out of water',9),cap('c4','Fob fins 2','After instruction to keep hands at water surface',13),cap('c5','Having to remind boys to do tumble turns for kick','',2,null),cap('cA','Free kick','',1,'athlete-awatea-calman')];
    M.state.resultsEventHistory=[['400','Freestyle',259.17],['200','Freestyle',121.28],['400','IM',298.76],['200','IM',139.53],['200','Butterfly',137.8]].flatMap(([d,st,t],i)=>[{result_id:'o'+i,athlete_id:mc.id,meet_name:'Div II',result_date:prev,course:'SCM',distance:+d,stroke:st,result_time_seconds:t+1.5},{result_id:'n'+i,athlete_id:mc.id,meet_name:'NZ SC Champs',result_date:mid,course:'SCM',distance:+d,stroke:st,result_time_seconds:t}]);
    M.state.settings.selectedAthleteId=mc.id;M.state.settings.loopAthleteTab='training';M.store.save(M.state);M.nav.show('athletes');},{S:SESSION,today:daysAgo(0),prev:daysAgo(120),mid:daysAgo(48)});
  await p.waitForSelector('[data-re-working]',{timeout:10000});
  const card=await p.evaluate(()=>document.querySelector('[data-re-working]').innerText);if(process.env.SHOT)await p.screenshot({path:process.env.SHOT,fullPage:false});
  assert.match(card,/WHAT MATTHEW IS WORKING ON/);assert.match(card,/Fob fins/i,card);assert.match(card,/After instruction to keep hands at water surface/,card);assert.match(card,/Improving after the cue/,card);
  assert.match(card,/knees/i,card);assert.match(card,/Helps .*200 Fly|Helps .*IM/,card);assert.match(card,/Training lately: 1 session in the last 4 weeks — mostly/,card);assert.match(card,/Developing: New best \d+ \w+ \d/,card);
  assert.doesNotMatch(card,/Awatea|tumble turns/,'other swimmers\' clips and the group note stay out of his card');
  const clips=await p.evaluate(()=>[...document.querySelectorAll('[data-re-working] [data-msos-capture]')].map(b=>[b.textContent.trim(),b.dataset.msosCapture]));
  assert.ok(clips.some(([t,id])=>/Before/.test(t)&&id==='c3')&&clips.some(([t,id])=>/After/.test(t)&&id==='c4'),JSON.stringify(clips));
  // training tab: the long lists folded to one line each
  await p.waitForSelector('#athletesView details.cn-fold',{timeout:10000});
  const folds=await p.evaluate(()=>[...document.querySelectorAll('#athletesView details.cn-fold')].map(d=>[d.querySelector('summary')?.innerText.split('·')[0].trim(),d.open]));
  assert.ok(folds.length>=2&&folds.every(([,o])=>!o),JSON.stringify(folds));assert.ok(folds.some(([t])=>/Training background/.test(t)),JSON.stringify(folds));
  // 17 Nov 2026: every capture lives on its own Captures tab (Timeline / By stroke / By focus / Notes), not in Training
  assert.ok(!folds.some(([t])=>/All captures/.test(t)),'captures moved to their own tab');
  await p.click('[data-cn-tab="captures"]');await p.waitForSelector('[data-re-library]',{timeout:10000});
  const lib=await p.evaluate(()=>document.querySelector('[data-re-library]').textContent.replace(/\s+/g,' '));
  assert.match(lib,/400 fins fly kick \(fob\)/,lib);assert.match(lib,/4 x 100 Free fins kick/,lib);
  assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('[data-re-capview]')].map(b=>b.textContent)),['Timeline','By stroke','By focus','Notes']);
  await p.click('[data-re-capview="focus"]');await p.waitForSelector('[data-re-capview="focus"].active');
  const focus=await p.evaluate(()=>[...document.querySelectorAll('[data-re-library] details.re-capg > summary')].map(x=>x.textContent.trim()));
  assert.ok(focus.length>=1&&focus.every(x=>/· \d+$/.test(x)),JSON.stringify(focus));
  await p.click('[data-re-capview="notes"]');await p.waitForSelector('[data-re-capview="notes"].active');
  const notes=await p.evaluate(()=>[...document.querySelectorAll('[data-re-library] [data-msos-capture]')].map(b=>b.textContent));
  assert.ok(notes.length>=1&&notes.every(t=>/“/.test(t)),'Notes view shows only the captures someone wrote on: '+JSON.stringify(notes));
  assert.equal(await p.evaluate(()=>window.MSOS4.state.settings.captureView),'notes','the chosen view is remembered');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('WORKING_ON_CARD_PASS');console.log(card);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
