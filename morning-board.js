'use strict';
(function(){
  const E=globalThis.MSOSEngines?.SessionTruth;
  const C=globalThis.MSOSEngines?.MorningCoaching;
  if(!E||!C)throw new Error('Morning Board engines did not load');

  const KEY='msos_morning_board_v2';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const source=$('#source'),board=$('#board'),status=$('#status'),composer=$('#composer'),editBtn=$('#editBtn'),parseBtn=$('#parseBtn'),clearBtn=$('#clearBtn'),course=$('#course'),roster=$('#roster'),squadQuick=$('#squadQuick'),dataStatus=$('#dataStatus'),clearRoster=$('#clearRoster');

  let current=null,state=null,athletes=[],selected=new Set(),timer=null;

  function saved(){
    try{return JSON.parse(localStorage.getItem(KEY)||'null')||{}}catch{return{}}
  }
  function persist(){
    try{localStorage.setItem(KEY,JSON.stringify({text:source.value,course:course.value,rosterIds:[...selected],updatedAt:new Date().toISOString()}))}catch{}
  }
  function metres(n){return `${Number(n||0).toLocaleString()}m`}
  function nodeMetres(n){return E.nodeDistance(n)}
  function seconds(sec){return C.clock(Number(sec))}
  function workText(item){
    const raw=String(item.raw||'').trim();
    return (raw||`${item.reps} x ${item.distance}${item.stroke?` ${item.stroke}`:''}`).replace(/\s+x\s+/ig,' × ');
  }
  function shortName(ath){
    const parts=String(ath?.full_name||'').trim().split(/\s+/).filter(Boolean),first=parts[0]||'?';
    const same=selectedAthletes().filter(x=>String(x.full_name||'').trim().split(/\s+/)[0]===first);
    return same.length<=1?first:`${first} ${(parts.at(-1)||'')[0]||''}`;
  }
  function selectedAthletes(){const set=selected;return athletes.filter(a=>set.has(a.id))}
  function squadName(a){return String(a?.squad||'Other').trim()||'Other'}

  function renderRoster(){
    if(!athletes.length){
      roster.innerHTML='<div class="data-warning">No active swimmers found in this browser’s MSOS data. Session parsing still works, but targets/modifications cannot.</div>';
      squadQuick.innerHTML='';
      return;
    }
    const squads=[...new Set(athletes.map(squadName))];
    squadQuick.innerHTML=squads.map(s=>`<button type="button" data-squad="${esc(s)}">${esc(s)}</button>`).join('');
    roster.innerHTML=squads.map(s=>{
      const list=athletes.filter(a=>squadName(a)===s);
      return `<div class="roster-group"><div class="roster-title">${esc(s)}</div><div class="roster-chips">${list.map(a=>`<button type="button" class="roster-chip ${selected.has(a.id)?'on':''}" data-athlete="${esc(a.id)}"><span>${esc(a.full_name)}</span>${C.profile(a,state).ratio<.98||String(a.modifications||'').trim()?'<small>MOD</small>':''}</button>`).join('')}</div></div>`;
    }).join('');

    roster.querySelectorAll('[data-athlete]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.athlete;selected.has(id)?selected.delete(id):selected.add(id);persist();renderRoster();if(current)render(current);
    });
    squadQuick.querySelectorAll('[data-squad]').forEach(b=>b.onclick=()=>{
      const ids=athletes.filter(a=>squadName(a)===b.dataset.squad).map(a=>a.id),all=ids.every(id=>selected.has(id));
      for(const id of ids)all?selected.delete(id):selected.add(id);
      persist();renderRoster();if(current)render(current);
    });
  }

  function detailHtml(item){
    const rows=[];
    if(item.pattern?.length)rows.push(`<div class="detail pattern">↳ ${item.pattern.map(x=>`${esc(x.count)} ${esc(x.text)}`).join(' · ')}</div>`);
    if(item.composition?.length)rows.push(`<div class="detail pattern">↳ ${item.composition.map(x=>`${esc(x.distance)} ${esc(x.text)}`).join(' / ')}</div>`);
    if(item.cues?.length)for(const cue of item.cues)rows.push(`<div class="cue">${esc(cue)}</div>`);
    return rows.join('');
  }
  function modPrescription(item){
    const bits=[`${Math.max(1,Number(item.reps)||1)} × ${Number(item.distance)||0}${item.stroke?` ${item.stroke}`:''}`];
    if(item.restSeconds!=null)bits.push(`${item.restSeconds}s rest`);
    if(item.cycleSeconds)bits.push(`@ ${seconds(item.cycleSeconds)}`);
    if(item.equipment?.length)bits.push(item.equipment.join(' + '));
    return bits.join(' · ');
  }
  function modificationsHtml(session,item){
    const groups=new Map();
    for(const ath of selectedAthletes()){
      const actual=C.adaptItem(item,ath,state,session);
      if(C.samePrescription(item,actual))continue;
      const k=[actual.reps,actual.distance,actual.stroke,actual.restSeconds,actual.cycleSeconds,(actual.equipment||[]).join('|'),actual.raw].join('::');
      if(!groups.has(k))groups.set(k,{actual,athletes:[],reasons:new Set()});
      const g=groups.get(k);g.athletes.push(ath);if(actual.adaptationReason)g.reasons.add(actual.adaptationReason);
    }
    if(!groups.size)return'';
    return `<aside class="mod-rail">${[...groups.values()].map(g=>`<div class="mod-box"><div class="mod-names">${g.athletes.map(a=>esc(shortName(a))).join(' · ')}</div><strong>${esc(modPrescription(g.actual))}</strong>${g.reasons.size?`<small>${esc([...g.reasons].join(' · '))}</small>`:''}</div>`).join('')}</aside>`;
  }
  function targetLine(ath,r){
    const name=esc(shortName(ath));
    if(r.status==='missing')return `<div class="target-row missing"><b>${name}</b><span>${esc(r.message||'Target needed')}</span></div>`;
    if(r.status==='ok'){
      const rest=Number(r.authoredRest);
      const sub=rest>0?`+${rest}s${r.sendOff?` · @${esc(seconds(r.sendOff))}`:''}`:(r.sendOff?`@${esc(seconds(r.sendOff))}`:'');
      return `<div class="target-row"><b>${name}</b><span class="target-time">${esc(seconds(r.seconds))}</span><span class="target-send">${esc(sub)}</span><small>${esc(r.source||'')}</small></div>`;
    }
    if(r.status==='pattern'){
      const uniq=[];const seen=new Set();
      for(const x of r.rows||[]){const k=x.zone||x.rep;if(seen.has(k))continue;seen.add(k);uniq.push(x)}
      return `<div class="target-row pattern-row"><b>${name}</b><span class="pattern-targets">${uniq.map(x=>`<span><strong>${esc((x.zone||`#${x.rep}`).slice(0,3))} ${esc(seconds(x.seconds))}</strong>${x.sendOff?`<small>@${esc(seconds(x.sendOff))}</small>`:''}</span>`).join('')}</span><small>${esc(r.source||'')}</small></div>`;
    }
    if(r.status==='rep_race'){
      return `<div class="target-row pattern-row"><b>${name}</b><span class="pattern-targets">${(r.rows||[]).map(x=>x.status==='ok'?`<span><strong>#${x.rep} ${esc(seconds(x.seconds))}</strong></span>`:`<span class="missing">#${x.rep} ${esc(x.label||x.message||'—')}</span>`).join('')}</span></div>`;
    }
    return'';
  }
  function targetsHtml(session,item){
    const rows=[];
    for(const ath of selectedAthletes()){
      const actual=C.adaptItem(item,ath,state,session),r=C.targetForItem(session,actual,ath,state);
      if(r.status==='none')continue;
      rows.push(targetLine(ath,r));
    }
    return rows.length?`<div class="targets"><div class="targets-title">TARGETS</div>${rows.join('')}</div>`:'';
  }

  function renderNode(session,node){
    if(node.kind==='cue')return `<div class="standalone-cue">${esc(node.text||node.raw)}</div>`;
    if(node.kind==='group')return `<div class="group"><div class="group-head"><strong>×${Number(node.rounds)||1} ROUNDS${node.label?` · ${esc(node.label)}`:''}</strong><span>${metres(nodeMetres(node))}</span></div>${(node.items||[]).map(x=>renderNode(session,x)).join('')}</div>`;
    const mods=modificationsHtml(session,node),targets=targetsHtml(session,node);
    return `<div class="set-line"><div class="work-grid ${mods?'has-mod':''}"><div class="set-work"><div class="set-main"><div class="work">${esc(workText(node))}</div><div class="metres">${metres(nodeMetres(node))}</div></div>${detailHtml(node)}</div>${mods}</div>${targets}</div>`;
  }

  function render(session){
    const total=E.totalDistance(session),written=session.metadata?.writtenTotal,match=session.metadata?.totalMatches!==false,swimmers=selectedAthletes();
    const verify=written==null
      ?`<div class="verify warn">Calculated ${metres(total)} · no written total supplied</div>`
      :match?`<div class="verify">Calculated ${metres(total)} · written ${metres(written)} ✓</div>`
      :`<div class="verify bad">CALCULATED ${metres(total)} · WRITTEN ${metres(written)} — check before coaching</div>`;
    const blocks=(session.blocks||[]).map(b=>`<section class="block"><div class="block-head"><h2>${esc(b.title)}</h2><strong>${metres(E.blockDistance(b))}</strong></div><div class="block-body">${(b.items||[]).map(x=>renderNode(session,x)).join('')}</div></section>`).join('');
    const rosterText=swimmers.length?swimmers.map(shortName).join(' · '):'No swimmers selected';
    board.innerHTML=`<section class="summary"><div><small>COACHING BOARD · ${esc(course.value)}</small><h1>Morning Session</h1><p>${esc(rosterText)}</p></div><div class="total">${metres(total)}</div></section>${verify}${blocks||'<div class="empty">No runnable blocks found.</div>'}<div class="engine-note">Session Truth ${esc(E.VERSION)} · Coaching ${esc(C.VERSION)} · existing MSOS evidence read-only</div>`;
    board.classList.remove('hidden');
  }

  function parse({focusBoard=false}={}){
    persist();
    const raw=source.value;
    if(!raw.trim()){current=null;board.classList.add('hidden');status.className='status';status.textContent='Paste or type a session.';return}
    try{
      current=E.parse(raw,{id:'morning-board',title:'Morning Session',course:course.value});
      const validation=E.validate(current),total=E.totalDistance(current);
      render(current);
      if(total<=0){status.className='status bad';status.textContent='No runnable distance found yet.';return}
      if(!validation.ok){status.className='status bad';status.textContent=`Check before coaching: ${validation.errors.join(' · ')}`}
      else if(!selected.size){status.className='status warn';status.textContent=`Session parsed · ${metres(total)} · select swimmers to add targets/modifications`}
      else{status.className='status good';status.textContent=`Coaching board ready · ${metres(total)} · ${selected.size} swimmer${selected.size===1?'':'s'}`}
      if(focusBoard){composer.classList.add('hidden');editBtn.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
    }catch(err){current=null;status.className='status bad';status.textContent=`Could not parse: ${err.message||err}`}
  }

  async function boot(){
    const d=saved();
    if(d.text)source.value=d.text;if(d.course)course.value=d.course;
    try{
      state=await C.loadState();athletes=C.activeAthletes(state);
      const valid=new Set(athletes.map(a=>a.id));for(const id of d.rosterIds||[])if(valid.has(id))selected.add(id);
      const t400Count=(state.trainingTestResults||[]).filter(r=>/t400/i.test((state.trainingTestTypes||[]).find(t=>t.id===r.test_type_id)?.test_key||r.test_key||'')).length;
      const pbCount=(state.coachResults||[]).length+(state.resultsEventHistory||[]).length+(state.resultsPbBoard||[]).length;
      dataStatus.textContent=`MSOS evidence: ${athletes.length} swimmers · ${t400Count} T400 rows · ${pbCount} PB/result rows`;
      dataStatus.className='data-status good';
    }catch(err){
      state={athletes:[],trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],coachResults:[],resultsEventHistory:[],resultsPbBoard:[]};athletes=[];
      dataStatus.textContent=`Athlete evidence unavailable: ${err.message||err}`;dataStatus.className='data-status bad';
    }
    renderRoster();
    if(source.value.trim()){parse();status.textContent=`Draft restored · ${status.textContent}`}
  }

  source.addEventListener('input',()=>{persist();clearTimeout(timer);timer=setTimeout(()=>parse(),250)});
  course.addEventListener('change',()=>{persist();if(current)parse()});
  parseBtn.addEventListener('click',()=>parse({focusBoard:true}));
  editBtn.addEventListener('click',()=>{composer.classList.remove('hidden');editBtn.classList.add('hidden');window.scrollTo({top:0,behavior:'smooth'})});
  clearRoster.addEventListener('click',()=>{selected.clear();persist();renderRoster();if(current)render(current)});
  clearBtn.addEventListener('click',()=>{if(!confirm('Clear the saved session text?'))return;source.value='';persist();current=null;board.innerHTML='';board.classList.add('hidden');status.className='status';status.textContent='Session text cleared.';source.focus()});
  boot();
})();
