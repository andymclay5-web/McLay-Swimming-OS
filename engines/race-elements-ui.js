'use strict';
// 13 Nov 2026 -- projections of engines/race-elements.js (the owner of labels, race needs and dosing). Called by the views
// that own each surface: board.js (set labels), swimmer-instant-open-cn.js (event card + "Race links" tab). Nothing here
// decides anything; it only renders what M.raceElements returns.
(function(g){
  const M=g.MSOS4;if(!M)return;const RE=()=>M.raceElements;
  const UI=M.raceElementsUI=M.raceElementsUI||{};
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s);
  const shortStroke=s=>({Freestyle:'Free',Backstroke:'Back',Breaststroke:'Breast',Butterfly:'Fly',IM:'IM'}[s]||s||'');
  const day=d=>{if(!d)return'';const x=new Date(`${d}T12:00:00`);return x.toLocaleDateString('en-NZ',{day:'numeric',month:'short'});};
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  const isSwimmer=()=>(M.access?.role?.()||'owner')==='swimmer';
  const FAMILY_ORDER=['skills','speed','race','engine','technique'];

  function css(){if(document.querySelector('style[data-re-css]'))return;const s=document.createElement('style');s.dataset.reCss='1';s.textContent=`
.re-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}.re-chips i{font-style:normal;font-size:11px;line-height:1;padding:3px 6px;border-radius:9px;background:rgba(56,132,255,.12);color:inherit;opacity:.85;white-space:nowrap}
.re-chips i[data-f=skills]{background:rgba(0,170,140,.15)}.re-chips i[data-f=speed]{background:rgba(240,120,0,.15)}.re-chips i[data-f=race]{background:rgba(210,40,90,.14)}.re-chips i[data-f=engine]{background:rgba(56,132,255,.14)}.re-chips i[data-f=technique]{background:rgba(140,90,220,.14)}
.re-box{margin-top:10px;padding-top:8px;border-top:1px solid rgba(127,127,127,.25)}.re-box h4{margin:4px 0 6px;font-size:14px}.re-row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:6px 0;border-bottom:1px solid rgba(127,127,127,.12)}
.re-row b{font-size:14px}.re-row span{font-size:12px;opacity:.8;text-align:right}.re-row small{grid-column:1/-1;font-size:12px;opacity:.75}.re-need{font-size:11px;letter-spacing:1px;opacity:.6}
.re-bar{height:6px;border-radius:3px;background:rgba(56,132,255,.55);grid-column:1/-1}.re-note{font-size:12px;opacity:.7;margin-top:6px}.re-race{padding:8px 0;border-bottom:1px solid rgba(127,127,127,.15)}.re-race b{font-size:14px}
.re-views{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}.re-views button{padding:6px 11px;border-radius:999px;border:1px solid #cbdde5;background:#fff;font-weight:800;font-size:12px;color:#0d4566}.re-views button.active{background:#0d4566;color:#fff;border-color:#0d4566}details.re-capg>summary{cursor:pointer;font-size:14px;margin-bottom:4px}.re-reply{margin-top:6px;padding:6px 9px;border-radius:9px;background:#eef6f0;color:#1b5b40;font-size:13px}.re-reply small{color:#647a86}.re-up{color:#1a8f4a}.re-down{color:#c0392b}.re-cap{font-size:12px;padding:4px 0}.re-sum{margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(56,132,255,.08)}.re-sum h4{margin:0 0 6px;font-size:15px}.re-sum p{margin:4px 0;font-size:14px;line-height:1.35}.re-focus{margin:4px 0 2px 18px;padding:0;font-size:14px}.re-focus li{margin:3px 0}.re-more{margin-top:8px}.re-working{border-left:4px solid rgba(56,132,255,.7)}.re-work-list{margin:6px 0 8px 18px;padding:0}.re-work-list li{margin:8px 0;font-size:15px;line-height:1.4}.re-clips-row{display:flex;gap:8px;margin-top:6px}.re-clip-btn{padding:6px 12px;border-radius:16px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit;font-size:13px}.re-capg{padding:10px 0;border-top:1px solid rgba(127,127,127,.18)}.re-capg b{font-size:15px}.re-clips{display:flex;flex-direction:column;gap:6px;margin-top:6px}.re-clip{display:flex;gap:8px;align-items:flex-start;text-align:left;padding:8px 10px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;font:inherit;font-size:14px}.re-clip.after{border-color:rgba(26,143,74,.6)}.re-clip>span:first-child{width:18px;opacity:.8}.re-more>summary{cursor:pointer;font-size:13px;opacity:.75;padding:4px 0}`;document.head.appendChild(s);}
  const chip=id=>{const e=RE().byId[id];return e?`<i data-f="${e.family}">${esc(e.chip)}</i>`:'';};
  const chipRow=ids=>ids?.length?`<div class="re-chips">${ids.map(chip).join('')}</div>`:'';
  const dots=w=>'●'.repeat(Math.round(w))+'○'.repeat(3-Math.round(w));

  // Board: a few labels under a set. Skills / speed / race first -- the Board stays a whiteboard.
  UI.boardChips=(session,item)=>{try{css();const tags=RE()?.tagsForItem?.(session,item?.id)||[];if(!tags.length)return'';const order=t=>FAMILY_ORDER.indexOf(RE().byId[t]?.family);return chipRow([...tags].sort((a,b)=>order(a)-order(b)).slice(0,3));}catch{return'';}};

  function elementRows(list,{max=8}={}){return list.slice(0,max).map(x=>`<div class="re-row"><b>${esc(x.label)} <span class="re-need" title="how much this race needs it">${dots(x.weight)}</span></b><span>${plural(Math.round(x.sets),'set')} · ${plural(x.sessions,'session')}${x.metres?` · ${Math.round(x.metres)}m`:` · ${Math.round(x.efforts)} efforts`}</span><small>${x.examples.map(e=>`${esc(day(e.date))} ${esc(e.label)}`).join(' · ')}</small></div>`).join('');}
  function captureRows(caps,max=5){if(isSwimmer())caps=caps.filter(c=>c.capture?.audience==='shared'||c.capture?.audience==='swimmer');return caps.slice(0,max).map(c=>`<div class="re-cap">${chipRow(c.tags.slice(0,3))}<b>${esc(day(c.date))}</b> · ${esc(c.type)}${c.setLabel?` · ${esc(c.setLabel)}`:''}${c.group?' · group':''}${c.note?` — ${esc(c.note.slice(0,160))}`:''}</div>`).join('');}
  function behindBlock(title,b,a){if(!b.sessions)return`<div class="re-box"><h4>${esc(title)}</h4><p class="muted">No sessions recorded for ${esc(a.full_name)} between ${esc(day(b.from))} and ${esc(day(b.to))}.</p></div>`;
    return`<div class="re-box"><h4>${esc(title)}</h4><p class="re-note">${plural(b.sessions,'session')} (${b.attended} on the roll) · ${esc(day(b.from))} – ${esc(day(b.to))}</p>${b.elements.length?elementRows(b.elements):'<p class="muted">None of the work in this window is labelled for what this race needs.</p>'}${b.missing.length?`<p class="re-note">Not in this window: ${b.missing.map(m=>esc(m.label)).join(', ')}</p>`:''}${b.captures.length?`<h4>Notes &amp; captures</h4>${captureRows(b.captures)}`:''}</div>`;}

  // Back-end speed: back half against front half from race splits (loaded per swimmer from race_results), next to the
  // back-end work in training (back-end wording, plus race pace repeated 3+ times -- Andy, 13 Nov).
  const sec=v=>`${v>=0?'+':'−'}${Math.abs(v).toFixed(2)}s`;
  function backEndRows(h,max=5){return h.rows.slice(0,max).map(x=>`<div class="re-row"><b>${esc(day(x.date))}${x.round?` · ${esc(x.round)}`:''} · ${clock(x.seconds)}</b><span>${clock(x.front)} / ${clock(x.back)} · <b class="${x.diff<=0?'re-up':''}">${sec(x.diff)}</b></span>${x.close>0?`<small>Last ${x.closeOf}m ${clock(x.close)}</small>`:''}</div>`).join('');}
  function trendLine(h){return h.earlierAvg==null?'<p class="re-note">One swim with splits so far — the trend shows from the next one.</p>':`<p class="re-note">Latest back half ${sec(h.latest.diff)} vs ${sec(h.earlierAvg)} average over ${plural(h.rows.length-1,'earlier swim')} → <b class="${h.better?'re-up':'re-down'}">${h.better?'closing better':'fading more'} (${sec(h.change)})</b></p>`;}
  UI.backEndHtml=(a,event)=>{const R=RE();const loaded=!!M.state?.raceSplits?.[a.id];const h=loaded?R.backEndHistory(a,event):null;
    const b=R.behind(a,event,{weeks:8});const be=b.elements.find(x=>x.id==='backEnd');
    const work=be?`<p class="re-note">Back-end work, last 8 weeks: ${plural(Math.round(be.sets),'set')} · ${plural(be.sessions,'session')}${be.examples.length?` — ${be.examples.slice(0,3).map(e=>`${esc(day(e.date))} ${esc(e.label)}`).join(' · ')}`:''}</p>`:'<p class="re-note">No back-end work labelled in the last 8 weeks.</p>';
    const body=!loaded?'<p class="muted">Loading race splits…</p>':h?`${backEndRows(h)}${trendLine(h)}`:'<p class="muted">No race splits for this event yet.</p>';
    return`<div class="re-box" data-re-backend="${esc(`${event.distance}|${event.stroke}|${event.course}`)}"><h4>Back-end speed · front half / back half</h4>${body}${work}</div>`;};
  UI.backEndAllHtml=(a,course)=>{const R=RE();if(!M.state?.raceSplits?.[a.id])return'<div class="re-box" data-re-backend-all><h4>Back-end speed by event</h4><p class="muted">Loading race splits…</p></div>';
    const evs=[];for(const r of R.splitRows(a)){const ev={distance:Number(r.distance),stroke:R.strokeOf(r.stroke),course:String(r.course||'').toUpperCase().replace(/^SC$/,'SCM').replace(/^LC$/,'LCM')};if(ev.course===course&&!evs.some(x=>x.distance===ev.distance&&x.stroke===ev.stroke))evs.push(ev);}
    const rows=evs.map(ev=>({ev,h:R.backEndHistory(a,ev)})).filter(x=>x.h).map(({ev,h})=>{const b=R.behind(a,ev,{weeks:6,before:h.latest.date});const be=b.elements.find(x=>x.id==='backEnd');
      return`<div class="re-row"><b>${esc(ev.distance)} ${esc(shortStroke(ev.stroke))} · ${clock(h.latest.seconds)}</b><span>back half <b class="${h.better===false?'re-down':h.better?'re-up':''}">${sec(h.latest.diff)}</b>${h.earlierAvg!=null?` (avg ${sec(h.earlierAvg)})`:''}</span><small>${esc(day(h.latest.date))} · ${be?`${plural(Math.round(be.sets),'back-end set')} in the 6 weeks before`:'no back-end work labelled in the 6 weeks before'}</small></div>`;}).join('');
    return`<div class="re-box" data-re-backend-all><h4>Back-end speed by event · ${esc(course)}</h4>${rows||'<p class="muted">No race splits in this course yet.</p>'}<p class="re-note">Back half minus front half; smaller is a stronger finish. Repeated race-pace sets count as back-end work.</p></div>`;};
  UI.ensureSplits=a=>{const R=RE();if(!a?.id||M.state?.raceSplits?.[a.id]?.v===2||(M.state?.raceSplits?.[a.id]&&!M.cloud?.ready?.())||UI._splitsLoading===a.id)return;if(!M.cloud?.ready?.()){M.state.raceSplits=M.state.raceSplits||{};M.state.raceSplits[a.id]={at:'',rows:[]};return;}UI._splitsLoading=a.id;
    R.loadSplits(a).catch(()=>{M.state.raceSplits=M.state.raceSplits||{};M.state.raceSplits[a.id]={at:'',rows:[]};}).finally(()=>{UI._splitsLoading='';try{document.dispatchEvent(new CustomEvent('msos-races-loaded',{detail:{athleteId:a.id}}));}catch{}/* the swimmer page redraws its swim history */
      for(const el of document.querySelectorAll('[data-re-backend]')){const[d,st,c]=el.dataset.reBackend.split('|');el.outerHTML=UI.backEndHtml(a,{distance:Number(d),stroke:st,course:c});}
      for(const el of document.querySelectorAll('[data-re-summary]')){const[d,st,c]=el.dataset.reSummary.split('|');el.outerHTML=UI.summaryHtml(a,{distance:Number(d),stroke:st,course:c});}
      const ov=document.querySelector('[data-re-overview]');if(ov){const c=document.querySelector('[data-cn-course].active')?.dataset.cnCourse||M.state.settings.pathwayCourse||'SCM';ov.outerHTML=UI.overviewHtml(a,c);}
      const all=document.querySelector('[data-re-backend-all]');if(all){const c=document.querySelector('[data-cn-course].active')?.dataset.cnCourse||M.state.settings.pathwayCourse||'SCM';all.outerHTML=UI.backEndAllHtml(a,c);}});};

  // Plain-language summaries (Andy, 14 Nov: "a brief summary tied to training and each event ... what is lacking and what
  // is being done ... anyone swimmer coach parent can see straight up what's happening and what needs to be worked on").
  const evName=ev=>`${ev.distance} ${shortStroke(RE().strokeOf(ev.stroke))}`;
  const list=xs=>xs.map(x=>`${esc(x.label)}${x.sessions?` (${x.sessions})`:''}`).join(' · ');
  const tryLine=f=>`${f.advice?.text?`<br><span>${esc(f.advice.text)}</span>`:''}${f.suggest?`<br><span class="re-note">Set to try: <b>${esc(f.suggest.label)}</b> — ${esc(f.suggest.text)}</span>`:''}`;
  const raceLine=r=>!r?'':`<p>${r.fading?'📉':'📈'} <b>Races:</b> ${r.diff>=0?`back half ${Math.abs(r.diff).toFixed(2)}s slower than the front`:`back half ${Math.abs(r.diff).toFixed(2)}s faster than the front`} at the last swim with splits (${esc(day(r.date))})${r.trend==='worse'?' — fading more than before':r.trend==='better'?' — closing better than before':''}.</p>`;
  const strokeLine=x=>!x?'':`<p>🏊 <b>${esc(x.stroke)} work:</b> ${x.sets} set${x.sets===1?'':'s'} · ${Math.round(x.metres)}m of ${Math.round(x.total)}m (${Math.round(100*x.share)}%)${x.choice?` · plus ${Math.round(x.choice)}m Choice / #1 that may have been ${esc(x.stroke==='IM'?'IM':x.stroke.toLowerCase())}`:''}${x.share<0.1?' — low for this event':''}.</p>`;
  UI.summaryHtml=(a,event)=>{const R=RE();const s=R.summary(a,event);const key=`${event.distance}|${event.stroke}|${event.course}`;
    if(!s.sessions)return`<div class="re-sum" data-re-summary="${esc(key)}"><h4>${esc(evName(event))} · summary</h4><p class="muted">No sessions recorded for ${esc(a.full_name)} in the last ${s.weeks} weeks — the summary fills in from the roll.</p></div>`;
    /* 17 Nov 2026 (Andy: "the whole summary section needs to be simplified"): three lines -- what is getting done, the
       one thing to do next and where it sits in the week, and how the races are finishing. The full breakdown (needs,
       light, missing, stroke share, a set to try) stays under "Show the detail". */
    const top=s.focus[0],got=[...s.done].sort((x,y)=>y.weight-x.weight||y.sessions-x.sessions).slice(0,3).map(x=>x.label.toLowerCase());
    return`<div class="re-sum" data-re-summary="${esc(key)}"><h4>${esc(evName(event))} · training, last ${s.weeks} weeks</h4>
      ${got.length?`<p>✅ Getting ${esc(got.join(', '))}.</p>`:''}
      ${top?`<p>👉 <b>Next: ${esc(top.label.toLowerCase())}</b> — ${esc(String(top.why||'').replace(/[.\s]*$/,'.'))}${top.advice?.text?` ${esc(top.advice.text)}`:''}</p>`:'<p>👍 Everything this race leans on is getting regular work.</p>'}
      ${raceLine(s.race)}</div>`;};
  UI.overviewHtml=(a,course)=>{const R=RE();const o=R.overview(a,{course});
    if(!o.events.length)return`<div class="re-sum" data-re-overview><h4>What's happening</h4><p class="muted">No ${esc(course)} races in the last 12 months to tie the training to.</p></div>`;
    const gapLine=g=>`<b>${esc(g.label)}</b> <span class="re-note">(${[...g.missing,...g.light].map(evName).join(', ')}${g.sessions?` · ${g.sessions} session${g.sessions===1?'':'s'}`:' · none'})</span>`;
    return`<div class="re-sum" data-re-overview><h4>What's happening · ${esc(a.full_name)}</h4><p class="re-note">Last ${o.weeks} weeks · ${o.sessions} sessions · tied to ${o.events.map(evName).join(', ')}</p>
      ${o.strong.length?`<p>✅ <b>Strong:</b> ${o.strong.slice(0,4).map(t=>esc(t.label)).join(' · ')}</p>`:''}
      ${o.gaps.length?`<p>⚠️ <b>Needs work:</b> ${o.gaps.slice(0,4).map(gapLine).join(' · ')}</p>`:''}
      ${o.fading.length?`<p>📉 <b>Races:</b> back half fading in ${o.fading.map(s=>`${evName(s.event)} (${s.race.diff>=0?'+':'−'}${Math.abs(s.race.diff).toFixed(2)}s)`).join(', ')}</p>`:''}
      ${o.priorities.length?`<p>👉 <b>Priorities:</b></p><ol class="re-focus">${o.priorities.map(f=>`<li><b>${esc(f.label)}</b> — ${esc(f.why)}${tryLine(f)}</li>`).join('')}</ol>`:''}</div>`;};

  // Captures as a coaching story on the swimmer's profile: what (the set + its labels), when, why (Andy's note), the
  // sequence on a set (before -> after the cue), recurring themes, and which of their events the work feeds.
  const timeOf=t=>{const d=new Date(t);return isNaN(d)?'':d.toLocaleTimeString('en-NZ',{hour:'numeric',minute:'2-digit'}).replace(' ','').toLowerCase();};
  const weekday=d=>{const x=new Date(`${d}T12:00:00`);return isNaN(x)?'':x.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short'});};
  const BLOCK={warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down'};
  // 17 Nov 2026 (Andy: "the roll needs to be for marking off attendance, but they need to be listed on the actual swimmers
  // page ... they need to be categorised a bit better, stroke, note, timeline ... a reference point for each swimmer that
  // we can all check"). Every capture of the swimmer over the last six months, one tap to play, in four views of the same
  // list: Timeline (by session), By stroke, By focus (what was being worked on), Notes (only the ones someone wrote on).
  const VIEWS=[['timeline','Timeline'],['stroke','By stroke'],['focus','By focus'],['notes','Notes']];
  const STROKES=['Freestyle','Backstroke','Breaststroke','Butterfly','IM'];
  const capView=()=>{const v=M.state?.settings?.captureView;return VIEWS.some(x=>x[0]===v)?v:'timeline';};
  UI.captureLibraryHtml=(a,{view=capView(),weeks=26}={})=>{try{css();const R=RE();if(!R||!a)return'';
    let list=R.captureStory(a,{weeks}).story.flat();if(isSwimmer())list=list.filter(x=>['shared','swimmer'].includes(x.capture?.audience));
    list.sort((x,y)=>String(y.time||y.date).localeCompare(String(x.time||x.date)));const first=String(a.full_name||'').split(' ')[0];
    const icon=t=>t==='video'?'▶':t==='photo'?'▣':t==='voice'?'♪':'✎';
    const item=(x,{showDate=true}={})=>`<button type="button" class="re-clip${x.after?' after':''}" data-msos-capture="${esc(x.capture.id)}"><span>${icon(x.type)}</span><span><b>${esc(x.set?.label||x.title||'Capture')}</b>${x.note?` — “${esc(x.note)}”`:''}<i class="re-note">${showDate?` · ${esc(day(x.date))}`:''}${x.group?' · group':''}${x.after?' · after the cue':''}</i></span></button>`;
    const groups=(keyOf,order)=>{const m=new Map();for(const x of list){for(const k of [].concat(keyOf(x)))(m.get(k)||m.set(k,[]).get(k)).push(x);}const keys=[...m.keys()].sort((p,q)=>order?order(p,q):0);return keys.map(k=>[k,m.get(k)]);};
    let body='';
    if(view==='timeline'){const g=groups(x=>`${x.date}|${x.session?.identity?.dayPart||x.session?.dayPart||''}`,(p,q)=>q.localeCompare(p));
      body=g.map(([k,xs])=>{const[d,part]=k.split('|');return`<div class="re-capg"><div class="re-note">${esc(weekday(d))}${part?` · ${esc(part)}`:''}</div><div class="re-clips">${xs.map(x=>item(x,{showDate:false})).join('')}</div></div>`;}).join('');}
    else if(view==='stroke'){const g=groups(x=>STROKES.includes(x.stroke)?x.stroke:/\b(kick|drill|scull|skill|start|turn|underwater|streamline)\b/i.test(`${x.title} ${x.note} ${x.set?.label||''}`)?'Kick & skills':'Other',(p,q)=>{const o=[...STROKES,'Kick & skills','Other'];return o.indexOf(p)-o.indexOf(q);});
      body=g.map(([k,xs])=>`<details class="re-capg" open><summary><b>${esc(k)}</b> · ${xs.length}</summary><div class="re-clips">${xs.map(x=>item(x)).join('')}</div></details>`).join('');}
    else if(view==='focus'){const g=groups(x=>x.themes.length?x.themes:['Not tagged yet'],(p,q)=>p==='Not tagged yet'?1:q==='Not tagged yet'?-1:0);
      body=g.sort((x,y)=>(x[0]==='Not tagged yet')-(y[0]==='Not tagged yet')||y[1].length-x[1].length).map(([k,xs])=>`<details class="re-capg"${k==='Not tagged yet'?'':' open'}><summary><b>${esc(k)}</b> · ${xs.length}</summary><div class="re-clips">${xs.map(x=>item(x)).join('')}</div></details>`).join('');}
    else{const notes=list.filter(x=>x.note);body=notes.length?`<div class="re-clips">${notes.map(x=>item(x)).join('')}</div>`:'<p class="muted">No written notes yet.</p>';}
    return`<section class="page-card" data-re-library="${esc(a.id)}"><div class="eyebrow">CAPTURES · ${esc(a.full_name)}</div><h2>${list.length} capture${list.length===1?'':'s'} · last 6 months</h2>
      <div class="re-views">${VIEWS.map(([k,l])=>`<button type="button" data-re-capview="${k}" class="${k===view?'active':''}">${l}</button>`).join('')}</div>
      ${list.length?body:`<p class="muted">No captures of ${esc(first)} yet. Capture from the Board and pick ${esc(first)} — it lands here.</p>`}</section>`;}catch(err){return'';}};
  if(!UI._libBound){UI._libBound=true;document.addEventListener('click',ev=>{const b=ev.target?.closest?.('[data-re-capview]');if(!b)return;const sec=b.closest('[data-re-library]');const a=(M.state?.athletes||[]).find(x=>x.id===sec?.dataset.reLibrary);if(!a)return;
    M.state.settings.captureView=b.dataset.reCapview;try{M.storageEngine?.saveUi?.(M.state);}catch{}sec.outerHTML=UI.captureLibraryHtml(a,{view:b.dataset.reCapview});});}
  UI.capturesHtml=a=>{try{css();const R=RE();if(!R||!a)return'';const yearAgo=new Date(Date.now()-365*864e5).toISOString().slice(0,10);const count=new Map();
    for(const r of R.results(a))if(r.date>=yearAgo){const k=`${r.distance}|${r.stroke}|${r.course}`;count.set(k,(count.get(k)||0)+1);}
    const events=[...count.entries()].sort((x,y)=>y[1]-x[1]).slice(0,6).map(([k])=>{const[d,st,c]=k.split('|');return{distance:Number(d),stroke:st,course:c};});
    const st=R.captureStory(a,{weeks:8,events});let story=st.story;if(isSwimmer())story=story.map(g=>g.filter(x=>['shared','swimmer'].includes(x.capture?.audience))).filter(g=>g.length);
    const first=String(a.full_name||'').split(' ')[0];
    if(!story.length)return`<section class="page-card" data-re-captures><div class="eyebrow">CAPTURES · ${esc(a.full_name)}</div><h2>What we're working on</h2><p class="muted">No captures of ${esc(first)} in the last 8 weeks.</p></section>`;
    const icon=t=>t==='video'?'▶':t==='photo'?'▣':t==='voice'?'♪':'✎';
    const group=g=>{const x=g[0],evs=[...new Map(g.flatMap(c=>c.feeds).map(e=>[`${e.distance}|${e.stroke}`,e])).values()];const tags=[...new Set(g.flatMap(c=>c.tags))];
      const seq=g.length>=2&&g.some(c=>c.after);
      return`<div class="re-capg"><div class="re-note">${esc(weekday(x.date))} · ${esc(timeOf(x.time))}${x.block?` · ${esc(BLOCK[x.block]||x.block)}`:''}</div>
        <b>${esc(x.set?.label||x.title||'Capture')}</b>${chipRow(tags.slice(0,4))}
        <div class="re-clips">${g.map(c=>`<button type="button" class="re-clip${c.after?' after':''}" data-msos-capture="${esc(c.capture.id)}"><span>${icon(c.type)}</span><span>${c.note?esc(c.note):esc(c.title||c.type)}${c.group?' <i class="re-note">(group)</i>':''}${c.after?' <i class="re-note">· after the cue</i>':''}</span></button>`).join('')}</div>
        ${seq?`<p class="re-note">Before → after the coaching cue: compare the first and last clip.</p>`:''}
        ${evs.length?`<p class="re-note">This work feeds ${evs.map(evName).join(', ')}.</p>`:''}</div>`;};
    return`<section class="page-card" data-re-captures><div class="eyebrow">CAPTURES · ${esc(a.full_name)}</div><h2>What we're working on</h2>
      <p class="re-note">Last 8 weeks · ${st.count} capture${st.count===1?'':'s'}${st.latest?` · latest ${esc(weekday(st.latest.date))}`:''}</p>
      ${st.themes.length?`<p>🎯 <b>Recurring:</b> ${st.themes.slice(0,4).map(([t,n])=>`${esc(t)}${n>1?` (${n})`:''}`).join(' · ')}</p>`:''}
      ${story.slice(0,6).map(group).join('')}${story.length>6?`<p class="re-note">+ ${story.length-6} earlier</p>`:''}</section>`;}catch(err){return`<section class="page-card"><p class="muted">Captures unavailable: ${esc(err.message||err)}</p></section>`;}};

  // ---- The one card (Andy, 16 Nov: "what's little Johnny working on at the moment? Boom. Any coach can see that ... they
  // can see it themselves, their parents can see it, it's all black and white"). Plain words, three parts: working on /
  // training lately / developing. Detail stays in the tabs. ----
  const FAM_WORDS={aerobic:'aerobic base',aerobicPower:'aerobic power',kick:'kick',pull:'pull',technique:'technique and drills',efficiency:'stroke length',maxSpeed:'speed',resisted:'resisted speed',racePace:'race pace',underwater:'underwaters',turns:'turns',starts:'starts',breakout:'breakouts',finish:'finishes',backEnd:'back-end speed',frontEnd:'front-end speed',pacing:'pacing',breathing:'breathing',relay:'relay takeovers'};
  UI.workingOnText=(a,{state=M.state}={})=>{const R=RE();const w=R.workingOn(a,{state});const first=String(a.full_name||'').split(' ')[0];const lines=[];
    for(const c of w.cards){if(c.kind==='capture')lines.push({head:`${c.where?`${c.where} — `:''}${c.theme.toLowerCase()}`,body:`${c.latestNote?`“${c.latestNote}”`:''}${c.days>1?` Noted on ${c.days} days since ${day(c.first)}.`:` Noted ${day(c.last)}${c.clips>1?` · ${c.clips} clips`:''}.`}${c.after?' Improving after the cue.':''}`,helps:c.feeds.length?`Helps ${c.feeds.slice(0,3).map(evName).join(', ')}.`:'',clips:[c.before&&c.after&&c.before!==c.after?['Before',c.before]:null,c.after?['After',c.after]:['Clip',c.latestClip]].filter(Boolean),key:`clip:${c.latestClip}`,session:c.session||'',c});
      else if(c.kind==='race')lines.push({head:`Back half of the ${evName(c.feeds[0]||{distance:c.where.split(' ')[0],stroke:c.where.split(' ')[1]})}`,body:`Back half ${Math.abs(c.race.diff).toFixed(2)}s slower than the front${c.race.trend==='worse'?', fading more than before':''}.`,helps:c.advice?.text||'',clips:[],key:`race:${c.where}`,session:'',c});
      else lines.push({head:c.theme,body:c.why?`${c.why[0].toUpperCase()}${c.why.slice(1)}.`:'',helps:c.advice?.text||'',clips:[],key:`gap:${c.element}`,session:'',c});}
    const mix=R.mix(a,{weeks:4,state});const top=[...mix.rows].filter(r=>FAM_WORDS[r.id]).sort((x,y)=>y.sets-x.sets).slice(0,3).map(r=>FAM_WORDS[r.id]);
    const lately=mix.sessions?`${mix.sessions} session${mix.sessions===1?'':'s'} in the last 4 weeks${top.length?` — mostly ${top.slice(0,-1).join(', ')}${top.length>1?' and ':''}${top[top.length-1]}`:''}.`:`No sessions recorded for ${first} in the last 4 weeks.`;
    const pbs=R.recentRaces(a,{weeks:12,state}).filter(r=>r.change!=null&&r.change<0).sort((x,y)=>x.change-y.change).slice(0,2);
    const developing=pbs.length?pbs.map(r=>`New best ${evName(r)} ${clock(r.seconds)} (${r.change.toFixed(2)}s)${r.meet?` at ${r.meet}`:''}`).join(' · '):'';
    return{first,lines,lately,developing,captures:w.captures};};
  /* The swimmer's own view (swimmer portal): the same card, built only from captures the coach shared with the swimmer
     (coach-only notes never leave the coach app). Plain JSON -- the portal is a static page with no engines. */
  UI.portalWorkingOn=a=>{try{const R=RE();if(!R||!a)return null;const shared=c=>['shared','swimmer'].includes(String(c?.audience||''))||!([c?.athlete_id,...(c?.athlete_ids||[])].filter(Boolean).length);
    const state={...M.state,captures:(M.state.captures||[]).filter(shared)};const t=UI.workingOnText(a,{state});
    return{at:new Date().toISOString(),first:t.first,lately:t.lately,developing:t.developing,lines:t.lines.map(l=>({key:l.key,head:l.head[0].toUpperCase()+l.head.slice(1),body:l.body,helps:l.helps,session:l.session,clips:l.clips.map(([label,id])=>({label,id}))}))};}catch(err){return null;}};
  /* what the swimmer said back about a focus ("focus_note" from the portal), newest first, per swimmer */
  UI.replies=UI.replies||{};
  UI.replyFor=(a,l)=>{const list=UI.replies[a?.id]||[];const clipIds=new Set([...l.clips.map(([,id])=>id),...(l.c?.ids||[])]);const head=String(l.head||'').toLowerCase();
    return list.find(r=>r.payload?.key===l.key||clipIds.has(r.payload?.captureId)||String(r.payload?.focus||'').toLowerCase()===head)||null;};
  UI.loadReplies=async a=>{try{const rows=await M.swimmerInviteBN?.sessionActionsFor?.(a);const list=(Array.isArray(rows)?rows:[]).filter(r=>r.action_type==='focus_note').sort((x,y)=>String(y.created_at||'').localeCompare(String(x.created_at||'')));
    const before=JSON.stringify(UI.replies[a.id]||[]);UI.replies[a.id]=list;if(before!==JSON.stringify(list))document.querySelectorAll('[data-re-working]').forEach(el=>{if(el.dataset.reWorking===String(a.id))el.outerHTML=UI.workingOnHtml(a);});return list;}catch(err){return[];}};
  UI.workingOnHtml=a=>{try{css();if(!RE()||!a)return'';const t=UI.workingOnText(a);
    const item=(l,i)=>`<li><b>${esc(l.head[0].toUpperCase()+l.head.slice(1))}</b>${l.body?`<br>${esc(l.body)}`:''}${l.helps?`<br><span class="re-note">${esc(l.helps)}</span>`:''}${l.clips.length?`<div class="re-clips-row">${l.clips.map(([k,id])=>`<button type="button" class="re-clip-btn" data-msos-capture="${esc(id)}">▶ ${esc(k)}</button>`).join('')}</div>`:''}${(r=>r?`<div class="re-reply">💬 <b>${esc(t.first)}:</b> ${esc([r.payload?.feeling,r.payload?.note&&`“${r.payload.note}”`].filter(Boolean).join(' — '))} <small>${esc(day(String(r.created_at||'').slice(0,10)))}</small></div>`:'')(UI.replyFor(a,l))}</li>`;
    return`<section class="page-card re-working" data-re-working="${esc(a.id)}"><div class="eyebrow">WHAT ${esc(t.first.toUpperCase())} IS WORKING ON</div>
      ${t.lines.length?`<ol class="re-work-list">${t.lines.map(item).join('')}</ol>`:`<p class="muted">Nothing noted yet — take a capture with a note on ${esc(t.first)} and it shows here.</p>`}
      <p><b>Training lately:</b> ${esc(t.lately)}</p>
      ${t.developing?`<p><b>Developing:</b> ${esc(t.developing)}</p>`:''}</section>`;}catch(err){return'';}};

  // Swimmer page, one event: what this race needs, and the training behind it.
  UI.behindHtml=(a,e,course)=>{try{css();const R=RE();if(!R||!a||!e)return'';const event={distance:Number(e.distance),stroke:e.stroke,course};const needs=R.needs(event).filter(n=>n.weight>=2);
    const last=R.results(a).filter(r=>r.distance===event.distance&&r.stroke===R.strokeOf(event.stroke)&&r.course===course).pop();
    const recent=last&&(Date.now()-new Date(`${last.date}T12:00:00`).getTime())<200*864e5;
    UI.ensureSplits(a);const summary=UI.summaryHtml(a,event);
    const parts=[`<div class="re-box"><h4>What a ${esc(event.distance)} ${esc(shortStroke(R.strokeOf(event.stroke)))} needs</h4>${chipRow(needs.map(n=>n.id))}</div>`];
    /* the full picture moved out of the summary: every gap with where it sits in the week and a set to try */
    {const sm=R.summary(a,event);if(sm.sessions)parts.push(`<div class="re-box"><h4>Last ${sm.weeks} weeks · ${sm.sessions} sessions</h4>${sm.done.length?`<p>✅ <b>Being done:</b> ${list([...sm.done].sort((x,y)=>y.weight-x.weight||y.sessions-x.sessions).slice(0,6))}</p>`:''}${sm.light.length?`<p>⚠️ <b>Light:</b> ${list(sm.light)}</p>`:''}${sm.missing.length?`<p>❌ <b>Missing:</b> ${list(sm.missing)}</p>`:''}${strokeLine(sm.stroke)}${sm.focus.length?`<ol class="re-focus">${sm.focus.map(f=>`<li><b>${esc(f.label)}</b> — ${esc(f.why)}${tryLine(f)}</li>`).join('')}</ol>`:''}<p class="re-note">(n) = sessions with that work. Patterns, not proof.</p></div>`);}
    const lastB=recent?R.behind(a,{...event,date:last.date},{weeks:6,before:last.date}):null;
    if(lastB?.sessions)parts.push(behindBlock(`Training behind ${last.meet?esc(last.meet):'the last race'} · ${day(last.date)} · ${clock(last.seconds)}`,lastB,a));
    parts.push(UI.backEndHtml(a,event));
    parts.push(behindBlock('Training feeding this event now · last 8 weeks',R.behind(a,event,{weeks:8}),a));
    parts.push('<p class="re-note">Work is labelled automatically from the session wording. Patterns, not proof.</p>');
    return`<section class="re-behind" data-re-behind>${summary}<details class="re-more"><summary>Show the detail</summary>${parts.join('')}</details></section>`;}catch(err){return`<p class="muted">Race links unavailable: ${esc(err.message||err)}</p>`;}};

  // Swimmer page, "Race links" tab: the whole picture.
  UI.tabHtml=(a,course)=>{try{css();const R=RE();if(!R)return'';const all=R.results(a),yearAgo=new Date(Date.now()-365*864e5).toISOString().slice(0,10);
    const evs=[];for(const r of all)if(r.date>=yearAgo&&r.course===course&&!evs.some(x=>x.distance===r.distance&&x.stroke===r.stroke))evs.push({distance:r.distance,stroke:r.stroke,course});
    const mix=R.mix(a,{weeks:8,events:evs});const max=Math.max(1,...mix.rows.map(x=>x.sets));
    const fam=FAMILY_ORDER.map(f=>{const rows=mix.rows.filter(x=>x.family===f).sort((x,y)=>y.sets-x.sets);if(!rows.length)return'';const name=R.FAMILIES.find(x=>x[0]===f)?.[1]||f;
      return`<h4>${esc(name)}</h4>${rows.map(x=>`<div class="re-row"><b>${esc(x.label)}</b><span>${plural(x.sets,'set')} · ${plural(x.sessions,'session')}${x.metres?` · ${Math.round(x.metres)}m`:''}</span><div class="re-bar" style="width:${Math.max(4,Math.round(100*x.sets/max))}%"></div>${x.feeds.length?`<small>Feeds ${x.feeds.map(ev=>`${ev.distance} ${shortStroke(ev.stroke)}`).join(', ')}</small>`:''}</div>`).join('')}`;}).join('');
    const races=R.recentRaces(a,{weeks:12});
    const raceHtml=races.length?races.slice(0,10).map(r=>{const b=R.behind(a,r,{weeks:6,before:r.date});const top=b.elements.slice(0,3);const ch=r.change==null?'first swim':r.change<0?`<span class="re-up">${r.change.toFixed(2)}s on best</span>`:`<span class="re-down">+${r.change.toFixed(2)}s on best</span>`;
      return`<div class="re-race"><b>${esc(r.distance)} ${esc(shortStroke(r.stroke))} ${esc(r.course)} · ${clock(r.seconds)}</b> · ${ch}<div class="re-note">${esc(r.meet)} · ${esc(day(r.date))}${b.sessions?` · ${plural(b.sessions,'session')} in the 6 weeks before`:''}</div>${top.length?chipRow(top.map(x=>x.id)):''}${top.length?`<div class="re-note">${top.map(x=>`${esc(x.label)} ${Math.round(x.sets)}`).join(' · ')} sets</div>`:''}</div>`;}).join(''):'<p class="muted">No races in the last 12 weeks.</p>';
    const pats=R.patterns(a,{weeks:24}).slice(0,8);
    const patHtml=pats.length?pats.map(p=>`<div class="re-row"><b>${esc(p.label)}</b><span>${p.faster}/${p.withWork} faster</span><small>${plural(p.sets,'set')} before ${plural(p.races.length,'race')} it matters to: ${p.races.slice(0,5).map(l=>`${l.race.distance} ${esc(shortStroke(l.race.stroke))} ${l.race.change<0?'':'+'}${l.race.change.toFixed(2)}`).join(' · ')}</small></div>`).join(''):'<p class="muted">Needs races with a previous best to compare against.</p>';
    UI.ensureSplits(a);    const capsAll=R.capturesFor(a,R.sessionsFor(a,mix.from,mix.to));const caps=capsAll.filter(c=>c.tags.length);
    return`<section class="page-card re-tab" data-re-tab><div class="eyebrow">RACE LINKS · ${esc(a.full_name)}</div><h2>Training ↔ races</h2>
      ${UI.overviewHtml(a,course)}
      <div class="re-box"><h4>Recent races and the training behind them</h4>${raceHtml}</div>
      ${UI.backEndAllHtml(a,course)}
      <div class="re-box"><h4>Patterns · last 24 weeks</h4>${patHtml}<p class="re-note">Faster = quicker than their previous best in that event. Patterns, not proof.</p></div>
      <div class="re-box"><h4>Training mix · last 8 weeks · ${plural(mix.sessions,'session')}</h4>${fam||'<p class="muted">No sessions recorded in the last 8 weeks.</p>'}</div>
      ${caps.length&&!isSwimmer()?`<div class="re-box"><h4>Notes &amp; captures · last 8 weeks</h4>${captureRows(caps,10)}</div>`:''}
      <p class="re-note">Every set is labelled automatically from the session wording (underwater, dive, turns, breakout, max, parachute, MSC, race pace…).</p></section>`;}catch(err){return`<section class="page-card"><p class="muted">Race links unavailable: ${esc(err.message||err)}</p></section>`;}};
})(globalThis);
