'use strict';
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SOUTH=`South Island SCM Championships 2026 - 28/08/2026 to 30/08/2026
Meet Program - Friday Afternoon - warmup from 3:00pm
Event 1 Men 12 & Over 200 SC Meter IM
Heat 1
1 Aydan Brown M14 JASCB 2:32.49
2 Angelo Liu M14 JASCB 2:29.25
3 Konrad Artz M14 ASTCB 2:23.47
4 Zachary Horton M14 JASCB 2:14.71
5 Matthew Callow M13 AQGCB 2:23.15
6 Bodie Gilmour M14 WAVSL 2:27.14
7 Arlee Williamson M14 STUCB 2:29.93
8 Tyrone Xu M14 JASCB 2:33.75`;
const fail=m=>{throw new Error(m)};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});try{
 await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>MSOS4?.storageEngine?.hydrated?.()===true,{timeout:15000});await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:15000});
 await page.evaluate(raw=>{const M=MSOS4;M.state.athletes=M.state.athletes||[];if(!M.state.athletes.some(x=>x.full_name==='Matthew Callow'))M.state.athletes.push({id:'mattc',full_name:'Matthew Callow',squad:'National',active:true});M.state.meetImports=[{id:'finals-fixture',meet_id:'south-island-2026',title:'South Island SCM Championships 2026',text:raw}];M.state.meetFieldDeck={meet_id:'south-island-2026',source_id:'finals-fixture',title:'South Island SC Champs',date:'2026-08-28',venue:'Moana pool',course:'SCM',races:[],swimmers:[]};M.state.meetProgramBA={sources:[{source_id:'finals-fixture',meet_id:'south-island-2026',raw,parsed:{heats:[]}}],commentaries:[],nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'finals-fixture',selectedEventNumber:1};M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.state.settings.view='meet';M.meetSiscFormat?.repair?.();M.store.save(M.state);M.nav?.show?.('meet',{restoreScroll:false});M.ui.renderMeet()},SOUTH);
 await page.waitForTimeout(800);
 const start=await page.evaluate(()=>{const root=document.querySelector('[data-meet-program-ba]');const r=root?.getBoundingClientRect();return{text:root?.innerText||'',programme:!!root,visible:!!(r&&r.height>20&&getComputedStyle(root).display!=='none'&&getComputedStyle(root).visibility!=='hidden'),races:MSOS4.state.meetFieldDeck?.races?.length||0}});if(!start.programme||!start.visible)fail('Meet startup did not show the programme\n'+start.text);if(start.races<1)fail('AquaGym race was not linked on startup');for(const s of ['Aydan Brown','JASCB','2:32.49','Matthew Callow','AQGCB','2:23.15'])if(!start.text.includes(s))fail('missing visible finals value '+s+'\n'+start.text);
 const matt=page.locator('[data-ba-row], [data-em-row]').filter({hasText:'Matthew Callow'}).first();await matt.scrollIntoViewIfNeeded();await matt.click();await page.waitForTimeout(300);const expanded=await page.evaluate(()=>document.querySelector('[data-meet-program-ba]')?.innerText||'');if(!/Matthew Callow/.test(expanded)||!/Seed/.test(expanded)||!/Race history|pathway/i.test(expanded))fail('Matthew did not expand in the visible programme\n'+expanded);console.log('SOUTH_ISLANDS_MEET_FIELD_ACCEPTANCE_PASS visible-startup-programme races='+start.races);
}finally{await browser.close()}})().catch(e=>{console.error(e.stack||e);process.exit(1)});
