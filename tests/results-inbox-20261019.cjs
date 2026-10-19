'use strict';
// Andy, 19 Oct 2026: "build the automated way and scrape for historical data of current swimmers to update msos and
// automate future updates as well as have ability to load manually or later integrate with swimify and meet mobile".
// Proves:
//  1. The results-file reader (engines/results-hy3.js): a real Hy-Tek .hy3 inside a deflated .zip reads in the browser
//     with no library -- meet, course, swimmers, times, rounds, splits in metres; NZ para classes come off the name
//     ("Murphy S6/Sb6/Sm6" -> Murphy, S6/SB6/SM6); an entries-only zip is refused with a plain reason.
//  2. Matching is exact: name + date of birth; a confirmed alias; name only when MSOS has no DOB; a same-name swimmer
//     with a different DOB is NOT matched but offered as a possible match.
//  3. Input data shows the Meet results inbox to the head coach (not to an assistant): meets waiting, PB flags,
//     "Is this your swimmer?" with both dates of birth, swimmers from the club not in MSOS.
//  4. Add all / untick one / Skip meet send exactly those ids to msos_results_review; nothing is approved otherwise.
//  5. "Yes, William" sends the link (athlete, file name, file DOB) to the sync function; Upload sends the file.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
// ---- a small NZ-style results file (fixed columns as Hy-Tek writes them) ----
const pad=(s,n)=>String(s).padEnd(n).slice(0,n),lpad=(s,n)=>String(s).padStart(n).slice(-n);
function line(code,fields,len=130){const a=Array(len).fill(' ');a[0]=code[0];a[1]=code[1];for(const[start,val]of fields){const v=String(val);for(let i=0;i<v.length;i++)a[start-1+i]=v[i];}return a.join('').replace(/\s+$/,'');}
function hy3(){const L=[];
  L.push(line('A1',[[3,'07Results From MM to TM'],[44,'MM5 8.0Fd']]));
  L.push(line('B1',[[3,pad('2026 Canterbury West Coast Championships',45)],[48,pad('Parakiore',45)],[93,'01232026'],[101,'01252026']]));
  L.push(line('B2',[[3,pad('',45)],[99,'L']]));
  L.push(line('C1',[[3,pad('AQGCB',5)],[8,pad('Aquagym Swimming Club',30)]]));
  L.push(line('D1',[[3,'F'],[4,lpad('101',5)],[9,pad('Murphy S6/Sb6/Sm6',20)],[29,pad('Charlotte',20)],[70,pad('AQGMCT190308',14)],[89,'03192008'],[97,lpad('17',3)]]));
  L.push(line('E1',[[3,'F'],[4,lpad('101',5)],[14,'F'],[16,lpad('400',6)],[22,'A'],[39,pad('8',4)],[51,'L']]));
  L.push(line('E2',[[3,'P'],[4,lpad('514.96',8)],[12,'L'],[21,lpad('1',3)],[24,lpad('3',3)],[30,lpad('6',4)]]));
  L.push(line('G1',[[3,'P'],[4,' 4'],[6,lpad('120.10',8)],[14,'P'],[15,' 8'],[17,lpad('250.40',8)],[25,'P'],[26,'12'],[28,lpad('382.00',8)],[36,'P'],[37,'16'],[39,lpad('514.96',8)]]));
  L.push(line('E2',[[3,'F'],[4,lpad('514.47',8)],[12,'L'],[30,lpad('4',4)]]));
  L.push(line('D1',[[3,'M'],[4,lpad('102',5)],[9,pad('Callow',20)],[29,pad('William',20)],[70,pad('AQGCWJ271110',14)],[89,'11272010'],[97,lpad('15',3)]]));
  L.push(line('E1',[[3,'M'],[4,lpad('102',5)],[14,'M'],[16,lpad('50',6)],[22,'A'],[39,pad('12',4)],[51,'L']]));
  L.push(line('E2',[[3,'F'],[4,lpad('26.08',8)],[12,'L'],[30,lpad('2',4)]]));
  L.push(line('D1',[[3,'F'],[4,lpad('103',5)],[9,pad('Newlove S19/Sb19/Sm19',20)],[29,pad('Sophie',20)],[89,'10132012'],[97,lpad('13',3)]]));
  L.push(line('E1',[[3,'F'],[4,lpad('103',5)],[14,'F'],[16,lpad('50',6)],[22,'D'],[39,pad('14',4)],[51,'L']]));
  L.push(line('E2',[[3,'F'],[4,lpad('NS',8)],[12,'L'],[13,'R']]));
  L.push(line('Z0',[]));return L.join('\r\n');}
function zip(name,data){const raw=zlib.deflateRawSync(Buffer.from(data,'latin1')),nb=Buffer.from(name),crc=zlib.crc32?zlib.crc32(Buffer.from(data,'latin1')):0;
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(raw.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nb.length,26);
  const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(8,10);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(raw.length,20);cd.writeUInt32LE(data.length,24);cd.writeUInt16LE(nb.length,28);cd.writeUInt32LE(0,42);
  const local=Buffer.concat([lh,nb,raw]),central=Buffer.concat([cd,nb]);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length,16);
  return Buffer.concat([local,central,end]);}
const RESULTS_ZIP=zip('Meet Results-CWC-001.hy3',hy3()),EVENTS_ZIP=zip('Meet Events-CWC.hyv','x');
// ---- stand-in server ----
const calls={review:[],fn:[]};
const inbox={sources:[{id:'src-1',source:'swiminfo',meet_name:'2026 Canterbury West Coast Championships',meet_start:'2026-01-23',course:'LCM',status:'imported',swims_ours:3,unmatched:[{name:'William Callow',dob:'2010-11-27',club:'AQGCB',swims:4,suggest:{athlete_id:'will',athlete_name:'William Callow',msos_dob:'2010-11-22'}},{name:'Elliot Watson',dob:'2009-04-09',club:'ASTCB',swims:3,suggest:null}]}],
  pending:[{id:'r1',source_id:'src-1',athlete_id:'char',name:'Charlotte Murphy',course:'LCM',distance:400,stroke:'Freestyle',round:'Heat',time:'8:34.96',pb:false,confidence:'name_dob'},{id:'r2',source_id:'src-1',athlete_id:'char',name:'Charlotte Murphy',course:'LCM',distance:400,stroke:'Freestyle',round:'Final',time:'8:34.47',pb:true,confidence:'name_dob'},{id:'r3',source_id:'src-1',athlete_id:'soph',name:'Sophie Newlove',course:'LCM',distance:50,stroke:'Butterfly',round:'Final',time:'1:02.10',pb:true,confidence:'name_only'}]};
async function wire(page){await page.route(/\/(rest\/v1\/rpc\/msos_results_|functions\/v1\/msos-results-sync)/,async route=>{const req=route.request(),url=req.url(),b=JSON.parse(req.postData()||'{}');
  if(/msos_results_inbox/.test(url))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(inbox)});
  if(/msos_results_review/.test(url)){calls.review.push(b);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({approved:(b.p_approve||[]).length,skipped:(b.p_reject||[]).length})});}
  calls.fn.push(b);if(b.action==='link')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({linked:true,athlete:'William Callow',files:1,redone:[{swims_added:4}]})});
  if(b.action==='upload')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({meet:'2026 Canterbury West Coast Championships',swims_added:3,swimmers_ours:2})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({checked:4,results:[]})});});
  await page.route(/\/rest\/v1\/(coach_results|results_pb_board|results_event_history)/,r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));}
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
  try{const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));await wire(page);
    await page.goto(BASE);await page.waitForFunction(()=>window.MSOS4?.resultsFile&&window.MSOS4?.resultsInbox&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await page.waitForTimeout(400);
    // ---- 1 + 2: reader and matching, in the browser ----
    const r=await page.evaluate(async([zipB64,evB64])=>{const R=window.MSOS4.resultsFile,u=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));const p=await R.read(u(zipB64),'x.zip');let ev='';try{await R.read(u(evB64))}catch(e){ev=e.message;}
      const m=R.matcher([{id:'char',full_name:'Charlotte Murphy',date_of_birth:'2008-03-19'},{id:'will',full_name:'William Callow',date_of_birth:'2010-11-22'},{id:'soph',full_name:'Sophie Newlove',date_of_birth:null}]),s=R.suggester([{id:'will',full_name:'William Callow',date_of_birth:'2010-11-22'}]);
      return{meet:p.meet,results:p.results.map(x=>({who:`${x.swimmer.first} ${x.swimmer.last}`,cls:x.swimmer.classes,d:x.distance,st:x.stroke,c:x.course,rd:x.round,t:x.timeText,status:x.status,place:x.place,date:x.date,splits:x.splits})),ev,
        match:p.swimmers.map(sw=>[sw.first,m(sw)?.athlete?.id||null,m(sw)?.confidence||null,s(sw)?.athlete_id||null])};},[RESULTS_ZIP.toString('base64'),EVENTS_ZIP.toString('base64')]);
    assert.equal(r.meet.name,'2026 Canterbury West Coast Championships');assert.equal(r.meet.course,'LCM');assert.equal(r.meet.start,'2026-01-23');
    const ch=r.results.filter(x=>x.who==='Charlotte Murphy');assert.equal(ch.length,2,'heat and final');
    assert.deepEqual(ch.map(x=>[x.d,x.st,x.c,x.rd,x.t,x.place]),[[400,'Freestyle','LCM','Heat','8:34.96',6],[400,'Freestyle','LCM','Final','8:34.47',4]]);
    assert.deepEqual(ch[0].cls,{s:'S6',sb:'SB6',sm:'SM6'},'para classes read off the name');
    assert.deepEqual(ch[0].splits.map(x=>x.metres),[100,200,300,400],'splits in metres');assert.equal(ch[0].date,'2026-01-23','no swim date -> meet start');
    assert.equal(r.results.find(x=>x.who==='Sophie Newlove').status,'DNS','no-show kept as DNS');
    assert.match(r.ev,/no results file[\s\S]*hyv/);
    assert.deepEqual(r.match,[['Charlotte','char','name_dob',null],['William',null,null,'will'],['Sophie','soph','name_only',null]],'William is offered, not matched');
    // ---- 3: the inbox on Input data (head coach) ----
    await page.evaluate(ORG=>{const M=window.MSOS4;M.state.settings.organisationId=ORG;M.store.saveAuth({access_token:'tok',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy',email:'andy@x.nz'}});M.store.save(M.state);M.nav.show('hub');M.coachLoopUI.openHubPanel('input');},ORG);
    await page.waitForSelector('[data-results-inbox-card] .ri-meet',{timeout:10000});
    const text=await page.textContent('[data-results-inbox-card]');
    assert.match(text,/2026 Canterbury West Coast Championships[\s\S]*3 swims · 2 swimmers · 2 PBs/);
    assert.match(text,/Is this your swimmer\?[\s\S]*William Callow[\s\S]*born 27 Nov 2010[\s\S]*MSOS: born 22 Nov 2010/);
    assert.match(text,/1 swimmer from your clubs in these files aren't in MSOS/);
    // ---- 4: review ----
    await page.click('[data-ri-toggle="src-1"]');await page.waitForSelector('[data-ri-pick="r1"]');
    assert.match(await page.textContent('.ri-rows'),/Sophie Newlove[\s\S]*name only/);
    await page.click('[data-ri-pick="r1"]');await page.waitForFunction(()=>/Add 2 ticked/.test(document.querySelector('[data-ri-approve="src-1"]')?.textContent||''));
    await page.click('[data-ri-approve="src-1"]');await page.waitForFunction(()=>/Added 2 swims/.test(document.querySelector('[data-ri-msg]')?.textContent||''),{timeout:8000});
    assert.deepEqual(calls.review.at(-1),{p_org:ORG,p_approve:['r2','r3'],p_reject:['r1']});
    page.once('dialog',d=>d.accept());await page.click('[data-ri-skip="src-1"]');await page.waitForFunction(n=>window.__n=n,1);await page.waitForTimeout(600);
    assert.deepEqual(calls.review.at(-1).p_approve,[]);assert.equal(calls.review.at(-1).p_reject.length,3);
    // ---- 5: link + upload ----
    await page.click('[data-ri-link="will"]');await page.waitForFunction(()=>/Linked to William Callow\. 4 swims/.test(document.querySelector('[data-ri-msg]')?.textContent||''),{timeout:8000});
    assert.deepEqual((({action,athlete_id,name,dob})=>({action,athlete_id,name,dob}))(calls.fn.at(-1)),{action:'link',athlete_id:'will',name:'William Callow',dob:'2010-11-27'});
    await page.setInputFiles('[data-ri-file]',{name:'GRMCB-Results007.ZIP',mimeType:'application/zip',buffer:RESULTS_ZIP});
    await page.waitForFunction(()=>/3 swims for 2 of your swimmers/.test(document.querySelector('[data-ri-msg]')?.textContent||''),{timeout:8000});
    const up=calls.fn.at(-1);assert.equal(up.action,'upload');assert.equal(Buffer.from(up.file_b64,'base64').equals(RESULTS_ZIP),true,'the file is sent unchanged');
    await page.setInputFiles('[data-ri-file]',{name:'events.zip',mimeType:'application/zip',buffer:EVENTS_ZIP});
    await page.waitForFunction(()=>/isn't a results file MSOS can read/.test(document.querySelector('[data-ri-msg]')?.textContent||''),{timeout:8000});
    assert.equal(calls.fn.at(-1).action,'upload');assert.equal(calls.fn.filter(c=>c.action==='upload').length,1,'an entries file is never sent');
    // ---- 3b: an assistant coach doesn't see it ----
    await page.evaluate(()=>{const M=window.MSOS4;M.state.settings.activeRole='assistant';M.state.settings.assistantSquads=['National'];M.store.save(M.state);});
    const asst=await page.evaluate(()=>{const h=document.createElement('div');document.body.appendChild(h);window.MSOS4.resultsInbox.render(h);const t=h.innerHTML;h.remove();return t;});
    if((await page.evaluate(()=>window.MSOS4.access?.role?.()))!=='owner')assert.equal(asst,'','assistant sees nothing');
    // the edge function reads files with the very same reader the app uses
    assert.equal(fs.readFileSync(path.join(__dirname,'..','supabase','functions','msos-results-sync','results-hy3.js'),'utf8'),fs.readFileSync(path.join(__dirname,'..','engines','results-hy3.js'),'utf8'),'supabase/functions/msos-results-sync/results-hy3.js must be a copy of engines/results-hy3.js');
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('RESULTS_INBOX_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
