'use strict';
// Input data (12 Oct 2026). Andy: "within the coach hub there needs to be very clear input data ... another coach can
// pick it up, it's got to be real clear where and how you enter the data." Agreed design (voice, 12 Oct):
//  - Two tiers. T400s and race results drive the app's targets (aerobic targets from T400, race-pace targets from
//    results), so they sit at the top, clearly marked. Other test sets are kept, measured and analysed but don't
//    change training, so they sit below as a log.
//  - Flexible input: type it loose ("William 4:24.2", "John 454.2 fly", "Alex Auer, 5:23.0, IM"), take a photo of
//    handwritten times (read by the same transcription the session photo uses), or time it live on deck (Times).
//    Date defaults to today and course to short course unless written otherwise.
//  - Nothing saves until the coach sees what was understood and confirms. Names are matched to the roster; a first
//    name shared by several swimmers is never guessed (CLAUDE.md 6.6 / multiple Matthews) -- the coach picks.
//
// Owner of one job: turning typed / photographed results into rows and handing them to the existing owners to
// save. T400s go through M.timing.saveT400 (with its own PB comparison, engines/t400-capture.js); race results and
// other test results go through the data registry (engines/data-registry.js), which owns those records and their
// cloud sync. Also exposes parse + PB check for poolside notes (engines/capture-ui.js).
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const ID=M.inputData={build:'v4-input-data-20261012'};
  const U=M.util||{},E=g.MSOSEngines||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),lc=v=>text(v).toLowerCase();
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const clock=s=>U.clock?U.clock(s):String(s);
  const STROKES=[['Freestyle',/^(fr|free|freestyle|fs)$/],['Backstroke',/^(bk|back|backstroke|bs)$/],['Breaststroke',/^(br|breast|breaststroke)$/],['Butterfly',/^(fly|bf|butterfly)$/],['IM',/^(im|medley|i\.m\.?)$/]];
  const DISTANCES=new Set([25,50,100,150,200,400,800,1500]);

  // ---------- parsing ----------
  // Times: 4:54.2 · 4.54.2 · 454.2 (= 4:54.2) · 1:05 · 26.08 · 58.9
  function timeOf(tok){const t=String(tok).replace(/[,;]$/,'');let m=t.match(/^(\d{1,2})[:.](\d{2})[.:](\d{1,2})$/);if(m)return Number(m[1])*60+Number(m[2])+Number(`0.${m[3]}`);
    m=t.match(/^(\d{1,2}):(\d{2})$/);if(m)return Number(m[1])*60+Number(m[2]);
    m=t.match(/^(\d{1,4})\.(\d{1,2})$/);if(m){const ip=m[1],frac=Number(`0.${m[2]}`);if(ip.length>=3){const min=Number(ip.slice(0,-2)),sec=Number(ip.slice(-2));if(sec>=60)return null;return min*60+sec+frac;}return Number(ip)+frac;}
    return null;}
  function strokeOf(tok){const t=lc(tok).replace(/[^a-z.]/g,'');for(const[name,re]of STROKES)if(re.test(t))return name;return'';}
  function dateOf(tok,year){let m=String(tok).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(m)return tok;m=String(tok).match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);if(m){let y=m[3]?Number(m[3]):year;if(y<100)y+=2000;return`${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}return'';}
  function courseOf(tok){const t=lc(tok);return/^(scm|sc)$/.test(t)?'SCM':/^(lcm|lc)$/.test(t)?'LCM':'';}
  // Splits loose text into one entry per time: "John 454.2, Sarah 5:01, Matt 4:48 fly" -> 3; "Alex Auer, 5:23.0, IM" -> 1.
  function entries(raw){const out=[];for(const line of String(raw||'').split(/\r?\n/)){const pieces=line.split(/[,;]|\s+-\s+|\t/).map(x=>x.trim()).filter(Boolean);let cur=[];
    const hasTime=p=>p.split(/\s+/).some(t=>timeOf(t)!=null);
    for(const p of pieces){if(hasTime(p)){const prevHasTime=cur.length&&cur.some(hasTime);if(prevHasTime&&/^[A-Za-z]/.test(p)){out.push(cur.join(' '));cur=[p];}else cur.push(p);}else{if(cur.some(hasTime)&&/^[A-Z][a-z]/.test(p)&&!strokeOf(p)&&!courseOf(p)&&p.split(/\s+/).length<=3&&!/meet|champ|pb|t400/i.test(p)){out.push(cur.join(' '));cur=[p];}else cur.push(p);}}
    if(cur.length)out.push(cur.join(' '));}
    return out.filter(x=>x.trim());}
  function athletes(){return(M.state?.athletes||[]).filter(a=>a&&a.active!==false);}
  function boardName(a){try{return M.boardEngine?.name?.(a,athletes())||'';}catch{return''}}
  // Name -> candidates. Full name (or "Name (Squad)") is exact; a deck name ("Matt K", "Luke THO") or a first name
  // only counts when exactly one active swimmer has it. Several -> the coach picks.
  function matchName(name){const n=lc(name).replace(/[^a-z' ()-]/g,' ').replace(/\s+/g,' ').trim();if(!n)return{candidates:[],kind:'none'};
    const sq=n.match(/^(.*)\(([^)]+)\)$/),base=sq?sq[1].trim():n,squad=sq?sq[2].trim():'';
    let pool=athletes().filter(a=>lc(a.full_name)===base);if(squad)pool=pool.filter(a=>lc(a.squad)===squad);if(pool.length)return{candidates:pool,kind:'full'};
    pool=athletes().filter(a=>lc(boardName(a))===base||lc(a.preferred_name||a.board_name||a.nickname)===base);if(pool.length)return{candidates:pool,kind:'deck'};
    const first=base.split(' ')[0],rest=base.split(' ').slice(1).join(' ');
    pool=athletes().filter(a=>{const parts=lc(a.full_name).split(' ');return parts[0]===first||parts[0].startsWith(first)&&first.length>=3;});
    if(rest)pool=pool.filter(a=>{const parts=lc(a.full_name).split(' ');const last=parts.slice(1).join(' ');return last.startsWith(rest)||parts.slice(1).some(p=>p.startsWith(rest));});
    return{candidates:pool,kind:pool.length===1?'first':pool.length?'ambiguous':'none'};}
  // One entry -> {name, seconds, stroke, distance, date, course, candidates, athleteId}
  function parseEntry(entry,{kind='race',defaults={}}={}){const year=Number(String(defaults.date||nzToday()).slice(0,4));let seconds=null,stroke='',distance=null,date='',course='';const nameTok=[];
    for(const tok of entry.split(/\s+/)){if(!tok)continue;const t=tok.replace(/[,;]$/,'');
      if(/^t-?400$/i.test(t)){distance=400;continue;}
      const d=dateOf(t,year);if(d&&!date){date=d;continue;}
      const tm=timeOf(t);if(tm!=null&&seconds==null){seconds=tm;continue;}
      const st=strokeOf(t);if(st&&!stroke){stroke=st;continue;}
      const c=courseOf(t);if(c&&!course){course=c;continue;}
      const dm=t.match(/^(\d{2,4})(m)?$/i);if(dm&&DISTANCES.has(Number(dm[1]))&&!distance){distance=Number(dm[1]);continue;}
      if(/^(pb|new|is|a|was|that|in|the|on|at|time|test)$/i.test(t))continue;
      if(/^\d+$/.test(t))continue;
      nameTok.push(t);}
    const name=nameTok.join(' ').replace(/[:\-–]+$/,'').trim();
    if(kind==='t400')distance=400;
    const m=matchName(name);
    return{raw:entry,name,seconds,stroke:stroke||defaults.stroke||(kind==='t400'?'Freestyle':''),distance:distance||defaults.distance||null,date:date||defaults.date||nzToday(),course:course||defaults.course||'SCM',candidates:m.candidates.map(a=>a.id),match:m.kind,athleteId:m.candidates.length===1?m.candidates[0].id:''};}
  function parse(raw,opts={}){return entries(raw).map(e=>parseEntry(e,opts)).filter(r=>r.seconds!=null||r.name);}
  ID.timeOf=timeOf;ID.parse=parse;ID.parseEntry=parseEntry;ID.matchName=matchName;

  // ---------- PB check (real results only; a conversion never counts as a PB, CLAUDE.md 2.31) ----------
  function athlete(id){return athletes().find(a=>a.id===id)||(M.state?.athletes||[]).find(a=>a.id===id)||null;}
  function raceBest(ath,{distance,stroke,course}){const Ev=E.Evidence;if(!Ev?.pbRows||!ath)return null;let best=null;
    for(const r of Ev.pbRows(ath,M.state)||[]){const d=Number(Ev.distance?.(r)??r.distance),st=Ev.rowStroke?.(r)??r.stroke,c=String(Ev.course?.(r)??r.course??r.pool_course??'').toUpperCase(),s=Ev.seconds?.(r)??Number(r.result_seconds);
      if(d!==Number(distance)||!Number.isFinite(s))continue;if(stroke&&Ev.stroke&&Ev.stroke(st)!==Ev.stroke(stroke))continue;if(course&&c&&c!==String(course).toUpperCase())continue;if(best==null||s<best.seconds)best={seconds:s,date:r.result_date||r.date||'',meet:r.meet_name||r.meet||''};}
    return best;}
  function t400Best(ath,{stroke,course}){try{const st=E.Evidence?.stroke?E.Evidence.stroke(stroke||'Freestyle'):stroke;const rows=(M.state?.trainingTestResults||[]).filter(r=>r.athlete_id===ath?.id&&Number(r.result_seconds)>0&&(!r.stroke||!st||(E.Evidence?.stroke?E.Evidence.stroke(r.stroke):r.stroke)===st));let best=null;for(const r of rows){const s=Number(r.result_seconds);if(best==null||s<best.seconds)best={seconds:s,date:r.result_date||''};}return best;}catch{return null}}
  function pbCheck(row,kind='race'){const ath=athlete(row.athleteId);if(!ath||!Number.isFinite(row.seconds))return{status:'unknown'};
    const best=kind==='t400'?t400Best(ath,row):kind==='race'?raceBest(ath,row):null;if(!best)return{status:'first',best:null};
    const delta=row.seconds-best.seconds;return{status:delta<-0.005?'pb':Math.abs(delta)<=0.005?'equal':'slower',best,delta};}
  ID.pbCheck=pbCheck;
  function pbLabel(c){return c.status==='pb'?`<b class="good-text">PB · ${Math.abs(c.delta).toFixed(2)}s faster than ${clock(c.best.seconds)}</b>`:c.status==='equal'?`Equals best ${clock(c.best.seconds)}`:c.status==='slower'?`Best ${clock(c.best.seconds)} (+${c.delta.toFixed(2)}s)`:c.status==='first'?'First recorded':'';}
  ID.pbLabel=c=>c.status==='pb'?`PB · ${Math.abs(c.delta).toFixed(2)}s faster than ${clock(c.best.seconds)}`:c.status==='equal'?`equals best ${clock(c.best.seconds)}`:c.status==='slower'?`best is ${clock(c.best.seconds)} (+${c.delta.toFixed(2)}s)`:c.status==='first'?'first recorded':'';

  // ---------- saving (handed to the owners) ----------
  function sessionFor(date,course){const cur=M.currentSession?.();if(cur&&cur.identity?.date===date)return cur;return{id:null,identity:{course:course||'SCM',date}};}
  function saveT400s(rows){const saved=[],errors=[];for(const r of rows){try{const row=M.timing.saveT400(r.athleteId,r.seconds,sessionFor(r.date,r.course),M.state,r.date,r.stroke||'Freestyle',{silent:true});if(!row.session_id)row.session_id=null;row.pool_course=r.course||row.pool_course;row.source_label='Input data · MSOS';saved.push({row,input:r});}catch(e){errors.push({input:r,message:e.message});}}
    if(saved.length){M.store?.save?.(M.state);for(const x of saved)M.cloud?.stageTrainingTestResult?.(x.row);try{E.Coordinator?.clearCache?.();g.MSOSEvidenceIndex?.invalidate?.(M.state);}catch{}}return{saved,errors};}
  async function saveRaces(rows,meet){const D=M.dataRegistry;const data=rows.map(r=>({athlete_id:r.athleteId,athlete_name:athlete(r.athleteId)?.full_name||r.name,result_date:r.date,pool_course:r.course,distance:r.distance,stroke:r.stroke,result_seconds:r.seconds,meet_name:meet||'',source_type:'manual'}));
    const pre=D.preview('results',{rows:data},{source:'Input data · MSOS',version:nzToday()});if(pre.errors.length)throw new Error(`${pre.errors.length} row(s) are missing a distance, stroke or time`);await D.commit(pre);return{saved:data.length};}
  async function saveTests(rows,testName,{distance,stroke}={}){const types=M.state.trainingTestTypes||(M.state.trainingTestTypes=[]);let tt=types.find(t=>lc(t.name)===lc(testName)||lc(t.test_key)===lc(testName));
    const known=!!tt;if(!tt){tt={id:U.uid?U.uid('testtype'):`testtype-${Date.now()}`,test_key:lc(testName).replace(/\s+/g,'_'),name:text(testName),distance:distance||null,stroke:stroke||'',active:true,local_only:true};types.push(tt);}
    const data=rows.map(r=>({id:U.uid?U.uid('testresult'):`testresult-${Date.now()}-${Math.random()}`,test_type_id:tt.id,athlete_id:r.athleteId,result_seconds:r.seconds,result_date:r.date,pool_course:r.course,stroke:r.stroke||tt.stroke||'',distance:r.distance||tt.distance||null,valid_for_anchor:false,source:'input_data',source_type:'training',source_label:`${tt.name} · Input data`,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
    M.state.trainingTestResults=(M.state.trainingTestResults||[]).concat(data);M.store?.save?.(M.state);
    // Only test types that already exist in the cloud can sync there (results need a known test type).
    if(known&&!tt.local_only)for(const r of data)M.cloud?.stageTrainingTestResult?.(r);
    try{M.dataRegistry?.invalidate?.('test_results',['tests','reports']);}catch{}
    return{saved:data.length,localOnly:!known||!!tt.local_only};}
  ID.saveT400s=saveT400s;ID.saveRaces=saveRaces;ID.saveTests=saveTests;

  // ---------- screen ----------
  const KINDS={
    t400:{title:'T400s',tier:1,blurb:'Sets every swimmer\'s aerobic training targets. The newest valid T400 is the one the Board uses.',example:'William 4:24.2\nCharlotte Murphy 5:41.2 IM\nMatt K 454.2, Elsie 5:02',fields:['stroke','date','course']},
    race:{title:'Race results',tier:1,blurb:'Feed PBs, pathway gaps and race-pace targets. Write the event with each time or set it once below.',example:'Luke Thompson 200 free 2:03.07\nCoral 50 fly 34.43\nWilliam 100 fly 59.53 LC',fields:['meet','distance','stroke','date','course']},
    test:{title:'Other test sets',tier:2,blurb:'Kept, measured and tracked over time. They don\'t change training targets.',example:'Ashley 2:31.4\nMolly 2:28.9',fields:['test','distance','stroke','date','course']}
  };
  let current=null,drafts={};
  function strokeSelect(id,val,allowBlank){return`<select data-id-f="${id}">${allowBlank?`<option value="">—</option>`:''}${['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].map(s=>`<option${s===val?' selected':''}>${s}</option>`).join('')}</select>`;}
  function defaultsHtml(kind){const k=KINDS[kind],d=drafts[kind]?.defaults||{};const out=[];
    if(k.fields.includes('test')){const types=(M.state.trainingTestTypes||[]).filter(t=>!/t400/i.test(t.test_key||t.name||'')||!/free/i.test(t.test_key||t.name||''));out.push(`<label>Test<input data-id-f="test" list="idTestTypes" value="${esc(d.test||'')}" placeholder="e.g. 200 kick, 10 x 100 test"><datalist id="idTestTypes">${types.map(t=>`<option value="${esc(t.name)}">`).join('')}</datalist></label>`);}
    if(k.fields.includes('meet'))out.push(`<label>Meet<input data-id-f="meet" value="${esc(d.meet||'')}" placeholder="e.g. Canterbury Champs"></label>`);
    if(k.fields.includes('distance'))out.push(`<label>Distance<select data-id-f="distance"><option value="">From each line</option>${[...DISTANCES].map(x=>`<option${Number(d.distance)===x?' selected':''}>${x}</option>`).join('')}</select></label>`);
    if(k.fields.includes('stroke'))out.push(`<label>Stroke${strokeSelect('stroke',d.stroke||(kind==='t400'?'Freestyle':''),kind!=='t400')}</label>`);
    out.push(`<label>Date<input type="date" data-id-f="date" value="${esc(d.date||nzToday())}"></label>`);
    out.push(`<label>Course<select data-id-f="course"><option${(d.course||'SCM')==='SCM'?' selected':''}>SCM</option><option${d.course==='LCM'?' selected':''}>LCM</option></select></label>`);
    return`<div class="id-defaults">${out.join('')}</div><p class="muted id-hint">Used for any line that doesn't say otherwise.</p>`;}
  function athleteOptions(sel,cands){const list=athletes().slice().sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));const top=cands.length>1?cands:[];return`<option value="">${top.length?`Choose — ${top.length} match`:'Choose swimmer'}</option>${top.length?`<optgroup label="Matches">${top.map(id=>{const a=athlete(id);return`<option value="${esc(id)}">${esc(a?.full_name||id)}${a?.squad?` · ${esc(a.squad)}`:''}</option>`;}).join('')}</optgroup><optgroup label="Everyone">`:''}${list.map(a=>`<option value="${esc(a.id)}"${a.id===sel?' selected':''}>${esc(a.full_name)}${a.squad?` · ${esc(a.squad)}`:''}</option>`).join('')}${top.length?'</optgroup>':''}`;}
  function reviewHtml(kind){const dr=drafts[kind];if(!dr?.rows?.length)return'';
    return`<div class="id-review"><div class="msos-check-title">CHECK BEFORE SAVING · ${dr.rows.length} line${dr.rows.length===1?'':'s'}</div>${dr.rows.map((r,i)=>{const pb=r.athleteId&&r.seconds!=null&&kind!=='test'?pbCheck(r,kind):{status:'unknown'};const warn=!r.athleteId?(r.candidates.length>1?`${r.candidates.length} swimmers match "${esc(r.name)}" — choose one`:`No swimmer called "${esc(r.name||'?')}"`):r.seconds==null?'No time found':kind==='race'&&!(r.distance&&r.stroke)?'Needs distance and stroke':'';
      return`<div class="id-row${warn?' id-row-warn':''}" data-id-row="${i}"><label class="id-inc"><input type="checkbox" data-id-r="include"${r.include!==false&&!warn?' checked':''}></label><div class="id-row-main"><select data-id-r="athleteId">${athleteOptions(r.athleteId,r.candidates)}</select><div class="id-row-fields"><input data-id-r="time" value="${r.seconds!=null?esc(clock(r.seconds)):''}" placeholder="time" inputmode="decimal">${kind!=='t400'?`<select data-id-r="distance"><option value="">dist</option>${[...DISTANCES].map(x=>`<option${Number(r.distance)===x?' selected':''}>${x}</option>`).join('')}</select>`:''}<select data-id-r="stroke">${kind!=='t400'?'<option value="">stroke</option>':''}${['Freestyle','Backstroke','Breaststroke','Butterfly','IM'].map(s=>`<option${s===r.stroke?' selected':''}>${s}</option>`).join('')}</select><input type="date" data-id-r="date" value="${esc(r.date)}"><select data-id-r="course"><option${r.course==='SCM'?' selected':''}>SCM</option><option${r.course==='LCM'?' selected':''}>LCM</option></select></div><small class="id-row-note">${warn?`<b class="warn-text">${warn}</b>`:pbLabel(pb)}${r.match==='first'||r.match==='deck'?` <span class="muted">· matched "${esc(r.name)}"</span>`:''} <span class="muted">· from "${esc(r.raw)}"</span></small></div></div>`;}).join('')}<div class="hub-actions"><button type="button" class="primary" data-id-save="${kind}">Save ${dr.rows.filter(r=>r.include!==false&&r.athleteId&&r.seconds!=null).length} result${dr.rows.filter(r=>r.include!==false&&r.athleteId&&r.seconds!=null).length===1?'':'s'}</button><button type="button" data-id-clear="${kind}">Clear</button></div></div>`;}
  function cardHtml(kind){const k=KINDS[kind],dr=drafts[kind]||{};return`<section class="page-card id-card id-${kind}" data-id-card="${kind}"><h2>${esc(k.title)}</h2><p class="muted">${esc(k.blurb)}</p>${defaultsHtml(kind)}<label class="id-free">Type or paste — any layout<textarea data-id-text rows="4" placeholder="${esc(k.example)}">${esc(dr.text||'')}</textarea></label><div class="hub-actions"><button type="button" class="primary" data-id-read="${kind}">Read it</button><label class="buttonlike id-photo">📷 Photo of times<input type="file" accept="image/*" capture="environment" data-id-photo="${kind}" hidden></label></div><div data-id-status class="muted"></div><div data-id-review>${reviewHtml(kind)}</div>${dr.done?`<p class="good-text"><b>${esc(dr.done)}</b></p>`:''}</section>`;}
  function html(){const owner=(M.access?.role?.()||'owner')==='owner';return`<section class="page-card id-head"><div class="eyebrow">INPUT DATA</div><h1>Enter times and results</h1><p>Type them any way you like, take a photo of a sheet, or time them live on deck. You'll see what was understood before anything saves.</p><div class="hub-actions"><button type="button" data-id-go="times">⏱ Time a set live (Times)</button>${owner?'<button type="button" data-id-go="data">Files &amp; reference tables</button>':''}</div></section>
    <div class="id-tier"><div class="eyebrow">AFFECTS TRAINING TARGETS</div>${cardHtml('t400')}${cardHtml('race')}</div>
    <div class="id-tier id-tier2"><div class="eyebrow">RECORDED AND TRACKED</div>${cardHtml('test')}</div>`;}
  function readDefaults(card){const d={};card.querySelectorAll('[data-id-f]').forEach(el=>{d[el.dataset.idF]=el.value;});if(d.distance)d.distance=Number(d.distance);return d;}
  function readRows(card,kind){const dr=drafts[kind];if(!dr?.rows)return;card.querySelectorAll('[data-id-row]').forEach(el=>{const r=dr.rows[Number(el.dataset.idRow)];if(!r)return;const v=s=>el.querySelector(`[data-id-r="${s}"]`);r.include=v('include').checked;r.athleteId=v('athleteId').value;const t=timeOf(v('time').value)??(U.seconds?U.seconds(v('time').value):null);r.seconds=t;if(v('distance'))r.distance=Number(v('distance').value)||null;r.stroke=v('stroke').value;r.date=v('date').value||r.date;r.course=v('course').value;});}
  function bind(host){
    host.querySelectorAll('[data-id-go]').forEach(b=>b.onclick=()=>M.nav?.show?.(b.dataset.idGo,{restoreScroll:false}));
    host.querySelectorAll('[data-id-card]').forEach(bindCard);}
  function bindCard(card){{const kind=card.dataset.idCard;const status=card.querySelector('[data-id-status]');
      const read=raw=>{const defaults=readDefaults(card);drafts[kind]={text:raw,defaults,rows:parse(raw,{kind,defaults}),done:''};paint(kind);};
      card.querySelector('[data-id-read]').onclick=()=>{const raw=card.querySelector('[data-id-text]').value;if(!raw.trim()){status.textContent='Type or paste some times first.';return;}read(raw);};
      card.querySelector('[data-id-photo]').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;status.textContent='Reading the photo…';try{const tr=await M.intake.transcribe(f,'photo');const raw=text(tr?.rawText)?String(tr.rawText):'';if(!raw)throw new Error('No writing found in the photo');card.querySelector('[data-id-text]').value=raw;status.textContent='Read from the photo — check the lines below.';read(raw);}catch(err){status.textContent=`${err.message||err}. You can type them instead.`;}};
      card.querySelector('[data-id-clear]')?.addEventListener('click',()=>{drafts[kind]={};paint(kind);});
      card.querySelectorAll('[data-id-row] select,[data-id-row] input').forEach(el=>el.addEventListener('change',()=>{readRows(card,kind);paint(kind);}));
      card.querySelector('[data-id-save]')?.addEventListener('click',async ev=>{const btn=ev.currentTarget;readRows(card,kind);const dr=drafts[kind];const rows=dr.rows.filter(r=>r.include!==false&&r.athleteId&&r.seconds!=null);if(!rows.length){status.textContent='Nothing ticked to save.';return;}btn.disabled=true;
        try{let msg='';if(kind==='t400'){const r=saveT400s(rows);msg=`Saved ${r.saved.length} T400${r.saved.length===1?'':'s'}${r.errors.length?` · ${r.errors.length} not saved: ${r.errors.map(x=>x.message).join('; ')}`:''}. Targets now use them.`;}
          else if(kind==='race'){const def=readDefaults(card);await saveRaces(rows,def.meet);msg=`Saved ${rows.length} race result${rows.length===1?'':'s'}. PBs and race-pace targets updated.`;}
          else{const def=readDefaults(card);if(!text(def.test)){status.textContent='Name the test first.';btn.disabled=false;return;}const r=await saveTests(rows,def.test,def);msg=`Saved ${r.saved} ${def.test} result${r.saved===1?'':'s'}${r.localOnly?' (new test — kept on this device)':''}.`;}
          drafts[kind]={done:msg,defaults:readDefaults(card)};paint(kind);M.toast?.(msg);}catch(err){status.textContent=err.message||String(err);btn.disabled=false;}});}}
  function paint(kind){const host=current;if(!host)return;const old=host.querySelector(`[data-id-card="${kind}"]`);if(!old)return render(host);const tmp=document.createElement('div');tmp.innerHTML=cardHtml(kind);const fresh=tmp.firstElementChild;old.replaceWith(fresh);bindCard(fresh);}
  function render(host){current=host;host.innerHTML=html();bind(host);}
  ID.render=render;ID.KINDS=KINDS;

  // ---------- times inside a poolside note (12 Oct 2026) ----------
  // Andy: "if something happens in training ... William T400 is 4:24.2, a new PB -- add it" and "if they do a dive
  // start ... was that a PB or not, I should be able to find out". After a note saves, any swimmer + time in it is
  // read the same way as Input data: a T400 is offered to save (with how it compares to their T400s); any other
  // event shows how it compares to their best real race time. Nothing is saved without a tap.
  function spot(textValue,cap){const t=String(textValue||'');if(!/\d/.test(t))return[];const isT400=/\bt\s?-?400\b|timed 400/i.test(t);const rows=parse(t,{kind:isT400?'t400':'race',defaults:{date:nzToday()}}).filter(r=>r.seconds!=null);
    const capIds=(cap?.athlete_ids||[]).length?cap.athlete_ids:(cap?.athlete_id?[cap.athlete_id]:[]);
    for(const r of rows){if(!r.athleteId&&!r.candidates.length&&capIds.length===1)r.athleteId=capIds[0];if(!r.athleteId&&r.candidates.length>1&&capIds.length){const hit=r.candidates.filter(id=>capIds.includes(id));if(hit.length===1)r.athleteId=hit[0];}r.kind=isT400||(r.distance===400&&/\b400\b/.test(t)&&/test|pb/i.test(t))?'t400':'race';if(r.kind==='t400'){r.distance=400;r.stroke=r.stroke||'Freestyle';}}
    return rows.filter(r=>r.athleteId&&(r.kind==='t400'?r.seconds>=120&&r.seconds<=1200:r.distance));}
  ID.spot=spot;
  function closeOffer(){const h=document.querySelector('#modalHost');if(h?.querySelector('[data-id-offer]'))h.innerHTML='';try{M.nav?.clearTransient?.()}catch{}}
  ID.offerFromNote=(cap)=>{try{const rows=spot(cap?.text_content,cap);if(!rows.length)return null;const host=document.querySelector('#modalHost');if(!host)return rows;
    host.innerHTML=`<div class="modal-backdrop" data-id-offer><section class="modal"><header><h2>Time in your note</h2><button data-id-offer-close>×</button></header><div class="modal-body">${rows.map((r,i)=>{const c=pbCheck(r,r.kind);const who=athlete(r.athleteId)?.full_name||r.name;return`<div class="id-offer-row"><div><b>${esc(who)}</b> · ${r.kind==='t400'?`T400 ${esc(r.stroke)}`:`${r.distance} ${esc(r.stroke||'')}`} · <b>${esc(clock(r.seconds))}</b></div><div class="${c.status==='pb'?'good-text':'muted'}">${esc(c.status==='pb'?(r.kind==='t400'?'Fastest T400 on record — ':'Faster than their best race — ')+ID.pbLabel(c):r.kind==='t400'?(c.status==='first'?'First T400 on record':ID.pbLabel(c)):c.status==='first'?'No race result on record for this event':`Race best ${clock(c.best.seconds)}${c.best.meet?` (${c.best.meet})`:''} — ${c.delta>0?`${c.delta.toFixed(2)}s off it`:'equal'}`)}</div>${r.kind==='t400'?`<button type="button" class="primary" data-id-offer-save="${i}">Save as T400</button>`:''}</div>`;}).join('')}<p class="muted">Training swims aren't saved as race results. A T400 saved here updates the swimmer's aerobic targets.</p></div><footer><button data-id-offer-close>Done</button></footer></section></div>`;
    try{M.nav?.openLayer?.('modal');}catch{}
    host.querySelectorAll('[data-id-offer-close]').forEach(b=>b.onclick=closeOffer);
    host.querySelectorAll('[data-id-offer-save]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.idOfferSave)];const out=saveT400s([r]);if(out.saved.length){b.disabled=true;b.textContent='Saved ✓';M.toast?.(`T400 saved · ${athlete(r.athleteId)?.full_name||''} ${clock(r.seconds)}`);}else M.toast?.(out.errors[0]?.message||'Not saved');});
    return rows;}catch(e){console.warn('note time check failed',e);return null;}};
})(globalThis);
