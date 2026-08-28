'use strict';
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SOUTH=`South Island SCM Championships 2026 - 28/08/2026 to 30/08/2026
Meet Program - Friday Morning - warmup from 7.30am
Event 1 Men 12 & Over 200 SC Meter IM
Heat 1 of 5 Finals Starts at 08:15 AM
1 Jack Other M14 Neptune Swimming 2:35.11
2 Matthew Callow M13 Aquagym Swimming Club 2:29.45
3 Tom Rival M15 Jasi Swimming 2:27.31
4 Matthew Robertson M14 AQGCB 2:25.20
Heat 2 of 5 Finals Starts at 08:20 AM
1 William Callow M13 Aqua Gym 2:40.00
2 Sam Other M14 Wharenui Swimming Club 2:38.10`;
const fail=(m)=>{throw new Error(m)};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});try{
 await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>MSOS4?.storageEngine?.hydrated?.()===true,{timeout:15000});await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:15000});
 await page.evaluate(()=>{const M=MSOS4;M.state.athletes=M.state.athletes||[];for(const [id,name] of [['mattc','Matthew Callow'],['mattr','Matthew Robertson'],['willc','William Callow']])if(!M.state.athletes.some(x=>x.full_name===name))M.state.athletes.push({id,full_name:name,squad:'National',active:true});M.state.meetImports=[{id:'south-fixture',meet_id:'south-island-2026',title:'South Island SCM Championships 2026',text:''}];M.state.meetFieldDeck={meet_id:'south-island-2026',source_id:'south-fixture',title:'South Island SCM Championships 2026',races:[]};M.state.meetProgramBA={sources:[{source_id:'south-fixture',meet_id:'south-island-2026',raw:'',parsed:{heats:[]}}],commentaries:[],meetWorkspaces:{},nowKey:'',selectedKey:'',selectedAthleteId:'',expandedKey:'',selectedSourceId:'south-fixture',selectedEventNumber:1};M.state.meetOps={races:{},evidence:[],selectedAthleteId:'',selectedRaceKey:''};M.state.settings.view='meet';M.store.save(M.state)});
 await page.evaluate(raw=>{const M=MSOS4;M.state.meetImports[0].text=raw;M.state.meetProgramBA.sources[0].raw=raw;M.meetSiscFormat?.repair?.();M.meetProgramBA?.render?.()},SOUTH);await page.waitForTimeout(500);
 const out=await page.evaluate(()=>{const root=document.querySelector('[data-meet-program-ba]')||document.querySelector('#meetView');const text=root?.innerText||'';const rows=[...root.querySelectorAll('[data-ba-row]')].map(x=>({text:x.innerText,aq:x.classList.contains('aqgcb'),key:x.getAttribute('data-ba-row')}));return{text,rows}});
 for(const s of ['Jack Other','Neptune Swimming','2:35.11','Matthew Callow','Aquagym Swimming Club','2:29.45','Tom Rival','Jasi Swimming','2:27.31','Matthew Robertson','AQGCB','2:25.20','William Callow','Aqua Gym','2:40.00'])if(!out.text.includes(s))fail('missing rendered programme value: '+s+'\n'+out.text);
 const aq=out.rows.filter(r=>r.aq);if(aq.length<3)fail('AquaGym rows not identified: '+JSON.stringify(out.rows));
 const matt=out.rows.find(r=>r.text.includes('Matthew Callow'));if(!matt)fail('Matthew row absent');await page.click(`[data-ba-row="${matt.key}"]`);await page.waitForTimeout(300);const expanded=await page.evaluate(()=>document.querySelector('[data-meet-program-ba]')?.innerText||'');if(!/Matthew Callow/.test(expanded))fail('Matthew expansion lost identity');if(!/Voice|Video|Result|split|PB|pathway|evidence/i.test(expanded))fail('AquaGym expansion lacks coaching controls/intelligence\n'+expanded);
 console.log('SOUTH_ISLANDS_MEET_FIELD_ACCEPTANCE_PASS rows='+out.rows.length+' aq='+aq.length);
}finally{await browser.close()}})().catch(e=>{console.error(e.stack||e);process.exit(1)});
