'use strict';
// Watch list -- the learning loop (22 Nov 2026). Andy agreed the loop should show repeated patterns with the evidence
// and a suggestion, the coach deciding. He isn't timing sets yet ("not until I can effectively use ear bud and speak"),
// so it reads what MSOS already holds: the notes coaches take on a swimmer, who was at which work, and race results.
// "What we have with ability to add soon": timed sets join as another signal once they are captured by voice.
//
// Owner of "who needs attention" signals only. Read-only over the evidence (captures, attendance, sessions, results,
// via engines/race-elements.js, the shared element list and dosing); the one thing it stores is the coach's Dismiss.
// Patterns, not proof (North Star 18/32): every signal shows the notes / sessions / races behind it, and never says
// why something is happening.
(function(g){
  const M=g.MSOS4;if(!M)return;
  const W=M.watchList={build:'v4-watch-list-20261122'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iso=d=>new Date(d).toISOString().slice(0,10);
  const daysAgo=n=>iso(Date.now()-n*864e5);
  const first=a=>String(a?.full_name||'').split(' ')[0]||'This swimmer';
  const fmtDate=d=>{try{return new Date(`${d}T12:00:00`).toLocaleDateString('en-NZ',{day:'numeric',month:'short'})}catch{return d}};
  const clock=s=>{s=Number(s);if(!Number.isFinite(s))return'—';const m=Math.floor(s/60),r=s-m*60;return m?`${m}:${r.toFixed(2).padStart(5,'0')}`:r.toFixed(2)};
  W.NOTE_DAYS=28;W.NOTE_MIN=3;W.EXPOSURE_WEEKS=6;
  // What a coach writes about a swimmer that is worth noticing when it keeps coming up: how they swim, not how hard.
  W.NOTE_ELEMENTS=['starts','underwater','breakout','turns','finish','kick','pull','technique','efficiency','breathing','pacing','backEnd','frontEnd'];
  // The work a swimmer can miss: the squad keeps doing it, the swimmer keeps not being there for it.
  W.EXPOSURE_ELEMENTS=['racePace','aerobicPower','aerobic','underwater','maxSpeed'];

  const RE=()=>M.raceElements;
  function swimmers(state=M.state){return(state?.athletes||[]).filter(a=>a&&a.active!==false&&!a.is_visitor&&(!M.access?.athleteAllowed||M.access.athleteAllowed(a)!==false))}

  // 1. The same thing noted about a swimmer again and again (own notes only, not whole-group notes).
  function noteSignals(a,state){const R=RE();if(!R?.tagText)return[];const from=daysAgo(W.NOTE_DAYS),sessions=state?.canonicalSessions||{},by=new Map();
    for(const c of state?.captures||[]){const who=[...(c.athlete_ids||[]),c.athlete_id].filter(Boolean);if(!who.includes(a.id))continue;
      const s=sessions[c.session_id];const date=String(s?.identity?.date||c.created_at||'').slice(0,10);if(!date||date<from)continue;
      const note=text([c.capture_note,c.metadata?.capture_note,c.note,c.text_content].filter(Boolean).join(' · '));if(!note)continue;
      for(const t of new Set(R.tagText(note)))if(W.NOTE_ELEMENTS.includes(t)){if(!by.has(t))by.set(t,[]);by.get(t).push({date,note,session:c.session_id||date})}}
    const out=[];for(const[id,rows]of by){const days=new Set(rows.map(r=>r.session));if(rows.length<W.NOTE_MIN||days.size<2)continue;rows.sort((x,y)=>y.date.localeCompare(x.date));
      const label=R.byId?.[id]?.label||id,set=R.suggestFor?.(id)||null;
      out.push({kind:'notes',id:`notes:${a.id}:${id}`,element:id,latest:rows[0].date,title:`${label} noted ${rows.length} times since ${fmtDate(rows.at(-1).date)}`,
        evidence:rows.slice(0,6).map(r=>`${fmtDate(r.date)} · ${r.note}`),
        suggestion:`Make ${label.toLowerCase()} a focus for ${first(a)}${set?` — e.g. ${set.label||set.code}: ${set.text}`:''}.`})}
    return out}

  // 2. Key work the squad keeps doing that the swimmer keeps missing -- only for a swimmer who is at training.
  function exposureSignals(a,state){const R=RE();if(!R?.slotProfile||!R?.advice)return[];const p=R.slotProfile(a,{weeks:W.EXPOSURE_WEEKS,state});if(!p?.held)return[];
    const attended=p.slots.reduce((n,s)=>n+s.attended,0);if(attended<3)return[];
    let worst=null;for(const id of W.EXPOSURE_ELEMENTS){const sq=p.squadHad.get(id)||0,at=p.athHad.get(id)||0;if(sq<3||at/sq>=0.5)continue;const gap=sq-at;if(!worst||gap>worst.gap)worst={id,sq,at,gap}}
    if(!worst)return[];const label=R.byId?.[worst.id]?.label||worst.id,adv=R.advice(a,worst.id,p);
    return[{kind:'exposure',id:`exposure:${a.id}:${worst.id}`,element:worst.id,latest:p.to,title:`${label}: at ${worst.at} of the squad's ${worst.sq} sessions (${W.EXPOSURE_WEEKS} weeks)`,
      evidence:[`${first(a)} was at ${attended} session${attended===1?'':'s'} in ${W.EXPOSURE_WEEKS} weeks`,...p.slots.filter(s=>(s.el.get(worst.id)||0)>0).sort((x,y)=>(y.el.get(worst.id)||0)-(x.el.get(worst.id)||0)).slice(0,3).map(s=>`${s.slot}: ${s.el.get(worst.id)} of ${s.held} had it · ${first(a)} at ${s.elAtt.get(worst.id)||0}`)],
      suggestion:adv?.text||`Worth more ${label.toLowerCase()} for ${first(a)}.`}]}

  // 3. Races: the last two swims of an event both slower than the best before them.
  function raceSignals(a,state){const R=RE();if(!R?.recentRaces)return[];const rows=R.recentRaces(a,{weeks:10,state}),by=new Map();
    for(const r of rows){if(!by.has(r.key))by.set(r.key,[]);by.get(r.key).push(r)}
    const out=[];for(const[key,list]of by){const last=list.slice(0,2);if(last.length<2||!last.every(r=>r.change!=null&&r.change>0))continue;const r0=last[0],ev=`${r0.distance} ${r0.stroke} ${r0.course||''}`.trim();
      out.push({kind:'races',id:`races:${a.id}:${key}`,latest:r0.date,title:`${ev}: last ${last.length} swims slower than best`,
        evidence:list.slice(0,4).map(r=>`${fmtDate(r.date)} · ${clock(r.seconds)}${r.change!=null?` (${r.change>0?'+':'−'}${Math.abs(r.change).toFixed(2)} on best before)`:''}${r.meet?` · ${r.meet}`:''}`),
        suggestion:`Look at the training behind ${ev} on ${first(a)}'s page before the next one.`})}
    return out}

  // 4. Timed sets against their target -- added when sets are timed (voice capture). Nothing is guessed until then.
  function timedSignals(){return[]}

  let cache=null;
  W.compute=(state=M.state)=>{const rev=`${state?.settings?.storageRevision||0}|${state?.settings?.evidenceRevision||0}|${(state?.captures||[]).length}|${(state?.attendance||[]).length}|${iso(Date.now())}`;
    if(cache?.rev===rev&&cache.state===state)return cache.rows;const dismissed=state?.watchDismissed||{};const rows=[];
    for(const a of swimmers(state)){let sig=[];for(const f of[noteSignals,exposureSignals,raceSignals,timedSignals]){try{sig=sig.concat(f(a,state))}catch{}}
      sig=sig.filter(s=>!(dismissed[s.id]&&dismissed[s.id]>=s.latest));if(sig.length)rows.push({athlete:a,signals:sig})}
    rows.sort((x,y)=>y.signals.length-x.signals.length||String(x.athlete.full_name).localeCompare(String(y.athlete.full_name)));
    cache={rev,state,rows};return rows};
  // Dismiss: hidden until something newer turns up for the same signal.
  W.dismiss=(id,latest,state=M.state)=>{state.watchDismissed=state.watchDismissed||{};state.watchDismissed[id]=latest||iso(Date.now());cache=null;try{M.store?.save?.(state)}catch{}};

  const KIND={notes:'Notes',exposure:'Training',races:'Races',timed:'Timed sets'};
  W.render=host=>{if(!host)return;const rows=W.compute();
    host.innerHTML=`<section class="page-card wl-intro"><p class="muted">Patterns from coaches' notes, who was at which work, and race results — not proof. Each shows what it's based on; you decide. Timed sets join here once they're captured by voice.</p></section>${rows.length?rows.map(({athlete:a,signals})=>`<section class="page-card wl-swimmer" data-wl-athlete="${esc(a.id)}"><header class="wl-head"><b>${esc(a.full_name)}</b><small>${esc(a.squad||'')}</small><button type="button" data-wl-open="${esc(a.id)}">Open</button></header>${signals.map(s=>`<div class="wl-signal" data-wl-signal="${esc(s.id)}"><div><span class="wl-kind">${KIND[s.kind]||s.kind}</span> <b>${esc(s.title)}</b></div><details><summary>What it's based on</summary><ul>${s.evidence.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></details><p class="wl-suggest">${esc(s.suggestion)}</p><button type="button" class="small" data-wl-dismiss="${esc(s.id)}" data-wl-latest="${esc(s.latest)}">Dismiss</button></div>`).join('')}</section>`).join(''):`<section class="page-card"><p>Nothing standing out right now.</p></section>`}`;
    host.querySelectorAll('[data-wl-open]').forEach(b=>b.addEventListener('click',()=>{M.state.settings.selectedAthleteId=b.dataset.wlOpen;try{M.storageEngine?.saveUi?.(M.state)}catch{}M.nav?.show?.('athletes',{restoreScroll:false})}));
    host.querySelectorAll('[data-wl-dismiss]').forEach(b=>b.addEventListener('click',()=>{W.dismiss(b.dataset.wlDismiss,b.dataset.wlLatest);const card=b.closest('.wl-signal'),sw=b.closest('.wl-swimmer');card?.remove();if(sw&&!sw.querySelector('.wl-signal'))sw.remove();M.toast?.('Dismissed · comes back if it keeps happening')}));
    if(!document.querySelector('#wl-style')){const st=document.createElement('style');st.id='wl-style';st.textContent=`.wl-head{display:flex;gap:.5rem;align-items:baseline}.wl-head small{opacity:.7}.wl-head button{margin-left:auto}.wl-signal{border-top:1px solid rgba(13,69,102,.12);padding:.5rem 0}.wl-kind{font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;opacity:.7}.wl-signal ul{margin:.3rem 0 .3rem 1rem;padding:0;font-size:.85rem}.wl-suggest{margin:.3rem 0;font-size:.9rem}`;document.head.appendChild(st)}};
})(window);
