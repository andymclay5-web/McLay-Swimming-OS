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
.re-up{color:#1a8f4a}.re-down{color:#c0392b}.re-cap{font-size:12px;padding:4px 0}`;document.head.appendChild(s);}
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
  UI.ensureSplits=a=>{const R=RE();if(!a?.id||M.state?.raceSplits?.[a.id]||UI._splitsLoading===a.id)return;if(!M.cloud?.ready?.()){M.state.raceSplits=M.state.raceSplits||{};M.state.raceSplits[a.id]={at:'',rows:[]};return;}UI._splitsLoading=a.id;
    R.loadSplits(a).catch(()=>{M.state.raceSplits=M.state.raceSplits||{};M.state.raceSplits[a.id]={at:'',rows:[]};}).finally(()=>{UI._splitsLoading='';
      for(const el of document.querySelectorAll('[data-re-backend]')){const[d,st,c]=el.dataset.reBackend.split('|');el.outerHTML=UI.backEndHtml(a,{distance:Number(d),stroke:st,course:c});}
      const all=document.querySelector('[data-re-backend-all]');if(all){const c=document.querySelector('[data-cn-course].active')?.dataset.cnCourse||M.state.settings.pathwayCourse||'SCM';all.outerHTML=UI.backEndAllHtml(a,c);}});};

  // Swimmer page, one event: what this race needs, and the training behind it.
  UI.behindHtml=(a,e,course)=>{try{css();const R=RE();if(!R||!a||!e)return'';const event={distance:Number(e.distance),stroke:e.stroke,course};const needs=R.needs(event).filter(n=>n.weight>=2);
    const last=R.results(a).filter(r=>r.distance===event.distance&&r.stroke===R.strokeOf(event.stroke)&&r.course===course).pop();
    const recent=last&&(Date.now()-new Date(`${last.date}T12:00:00`).getTime())<200*864e5;
    const parts=[`<div class="re-box"><h4>What a ${esc(event.distance)} ${esc(shortStroke(R.strokeOf(event.stroke)))} needs</h4>${chipRow(needs.map(n=>n.id))}</div>`];
    if(recent)parts.push(behindBlock(`Training behind ${last.meet?esc(last.meet):'the last race'} · ${day(last.date)} · ${clock(last.seconds)}`,R.behind(a,{...event,date:last.date},{weeks:6,before:last.date}),a));
    UI.ensureSplits(a);parts.push(UI.backEndHtml(a,event));
    parts.push(behindBlock('Training feeding this event now · last 8 weeks',R.behind(a,event,{weeks:8}),a));
    parts.push('<p class="re-note">Work is labelled automatically from the session wording. Patterns, not proof.</p>');
    return`<section class="re-behind" data-re-behind>${parts.join('')}</section>`;}catch(err){return`<p class="muted">Race links unavailable: ${esc(err.message||err)}</p>`;}};

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
      <div class="re-box"><h4>Recent races and the training behind them</h4>${raceHtml}</div>
      ${UI.backEndAllHtml(a,course)}
      <div class="re-box"><h4>Patterns · last 24 weeks</h4>${patHtml}<p class="re-note">Faster = quicker than their previous best in that event. Patterns, not proof.</p></div>
      <div class="re-box"><h4>Training mix · last 8 weeks · ${plural(mix.sessions,'session')}</h4>${fam||'<p class="muted">No sessions recorded in the last 8 weeks.</p>'}</div>
      ${caps.length&&!isSwimmer()?`<div class="re-box"><h4>Notes &amp; captures · last 8 weeks</h4>${captureRows(caps,10)}</div>`:''}
      <p class="re-note">Every set is labelled automatically from the session wording (underwater, dive, turns, breakout, max, parachute, MSC, race pace…).</p></section>`;}catch(err){return`<section class="page-card"><p class="muted">Race links unavailable: ${esc(err.message||err)}</p></section>`;}};
})(globalThis);
