'use strict';
// Swimmer brief (16 Oct 2026). Andy: "when you bring up a swimmer, the first screen that you see is like their profile
// ... name, squad, best stroke, best events, and the level of their performance ... what meet they've qualified ...
// then be able to, on my phone, flip between different things that are displayed up there ... training ...
// performance (best events ranked in points, the season we're in, short course and long course) ... performance
// pathway information ... qualifying standards of the event next on their pathway ... past videos ... the idea is
// conversation, poolside, boom, straight away, all of the information that swimmer and the coach might ever need".
//
// Owner of one thing: the plain facts shown on the swimmer pages (profile, training, performance, pathway, videos),
// gathered from the engines that already own them -- performance (PBs, points, best stroke), the pathway engine
// (standards ladders), evidence (T400 = fastest valid per stroke), attendance, timed sets and captures. It decides
// nothing new and writes nothing. The phone shows these pages in the swimmer screen; engines/tv-link.js sends the
// page the coach picks to the pool TV. Set targets are deliberately absent: they are already on the Board.
(function(g){
  const M=g.MSOS4,EN=g.MSOSEngines;if(!M?.state)return;
  const S=M.swimmerBrief={build:'v4-swimmer-brief-20261019',PAGES:['profile','training','performance','pathway','goal','videos']};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clock=s=>{const n=Number(s);if(!Number.isFinite(n)||n<=0)return'';return M.util?.clock?M.util.clock(n):String(n);};
  const Ev=()=>EN?.Evidence;
  const short=v=>text(v).replace(/^Freestyle$/i,'Free').replace(/^Backstroke$/i,'Back').replace(/^Breaststroke$/i,'Breast').replace(/^Butterfly$/i,'Fly');
  const eventName=(d,st)=>`${Number(d)} ${short(st)}`;
  const today=()=>new Date().toISOString().slice(0,10);
  const ath=id=>(M.state.athletes||[]).find(a=>a.id===id)||null;
  const dateOf=r=>text(r?.result_date||r?.pb_date||r?.test_date||r?.date||r?.meet_date||r?.swim_date||r?.created_at||'').slice(0,10);
  const PAGE_TITLES={profile:'Profile',training:'Training',performance:'Performance',pathway:'Pathway',goal:'Goal',videos:'Videos'};
  S.titles=PAGE_TITLES;

  // The season we're in: the latest season plan that has started; otherwise the NZ season from 1 September.
  function seasonStart(now=today()){const plans=[...(M.state.seasonPlans||[]),...(M.dataRegistry?.activeRowsSync?.('season_plan')||[])];
    const started=plans.map(p=>text(p?.start_date||p?.seasonStart||p?.start).slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=now).sort();
    if(started.length)return started.at(-1);const y=Number(now.slice(0,4)),m=Number(now.slice(5,7));return`${m>=9?y:y-1}-09-01`;}
  S.seasonStart=seasonStart;
  function ageOf(a){const dob=text(a?.date_of_birth||a?.dob).slice(0,10);if(!dob)return null;try{return M.performanceEngine?.pathwayCK?.ageOn?.(dob,today())??null;}catch{return null;}}

  // ---------- performance: every event, SC and LC side by side, points, this season's best ----------
  function eventTable(a){const P=M.performanceEngine;let rows=[];try{rows=P?.rows?.(a,M.state,'')||[];}catch{}
    const start=seasonStart(),map=new Map();
    for(const r of rows){const k=`${r.distance}|${Ev()?.stroke?.(r.stroke)||r.stroke}`;if(!map.has(k))map.set(k,{distance:r.distance,stroke:Ev()?.stroke?.(r.stroke)||r.stroke,SCM:null,LCM:null,seasonSCM:null,seasonLCM:null});
      const e=map.get(k),c=r.course==='LCM'?'LCM':'SCM',d=dateOf(r.raw),cell={seconds:r.seconds,time:clock(r.seconds),date:d,points:Number(r.points)||null,system:r.pointSystem||'WA'};
      if(!e[c]||r.seconds<e[c].seconds)e[c]=cell;
      if(d&&d>=start&&(!e[`season${c}`]||r.seconds<e[`season${c}`].seconds))e[`season${c}`]=cell;}
    const out=[...map.values()].map(e=>({...e,event:eventName(e.distance,e.stroke),points:Math.max(e.SCM?.points||0,e.LCM?.points||0)||null,system:(e.SCM||e.LCM)?.system||'WA',
      seasonPoints:Math.max(e.seasonSCM?.points||0,e.seasonLCM?.points||0)||null}));
    out.sort((x,y)=>(y.points||0)-(x.points||0)||x.distance-y.distance);return out;}
  S.eventTable=eventTable;

  // ---------- pathway: highest standard achieved, and the next one, per event ----------
  function pathwayRows(a,limit=6){let pw=null;try{pw=M.performanceEngine?.pathwaysForAthlete?.(a,{});}catch{}if(!pw)return{course:'SCM',events:[]};
    const events=(pw.events||[]).slice(0,limit).map(e=>{const steps=e.ladder?.tracks?.[pw.course]||e.ladder?.steps||[];
      const done=steps.filter(s=>s.achieved&&s.kind==='qualifying').sort((x,y)=>x.seconds-y.seconds)[0]||null;
      const next=e.ladder?.nextQualifying||e.ladder?.next||null;
      return{event:eventName(e.distance,e.stroke),course:pw.course,pb:clock(e.seconds),points:Number(e.points)||null,
        achieved:done?{label:text(done.label||done.displayLabel),time:clock(done.seconds)}:null,
        next:next?{label:text(next.label||next.displayLabel),time:clock(next.seconds),gap:Number.isFinite(next.gapSeconds)?`+${Number(next.gapSeconds).toFixed(2)}`:'',gapPct:Number.isFinite(next.gapPercentage)?`${Number(next.gapPercentage).toFixed(1)}%`:''}:null};});
    return{course:pw.course,events};}
  S.pathwayRows=pathwayRows;

  // ---------- pages ----------
  function profile(a){const table=eventTable(a),pw=pathwayRows(a,6);let best='';try{best=M.performanceEngine?.bestStroke?.(a,M.state)||'';}catch{}
    if(typeof best==='object')best=best?.stroke||'';if(!best&&table[0])best=table[0].stroke;
    const level=pw.events.map(e=>e.achieved?{event:e.event,label:e.achieved.label}:null).filter(Boolean);
    return{page:'profile',name:text(a.full_name),squad:text(a.squad),age:ageOf(a),bestStroke:short(best),
      best:table.slice(0,4).map(e=>({event:e.event,scm:e.SCM?.time||'',lcm:e.LCM?.time||'',points:e.points,system:e.system})),
      level:level.slice(0,3),levelNote:level.length?'':'No qualifying standard reached yet in the events on record',goal:goalInfo(a)};}
  function attendanceRows(a,days=28){const since=new Date(Date.now()-days*864e5).toISOString().slice(0,10),out=[];
    for(const r of M.state.attendance||[]){if(r?.athlete_id!==a.id||!/present|modified|late/i.test(String(r.status||'present')))continue;const s=M.state.canonicalSessions?.[r.session_id];const d=text(s?.identity?.date).slice(0,10);if(!s||!d||d<since)continue;out.push({s,d});}
    const seen=new Set();return out.filter(x=>!seen.has(x.s.id)&&seen.add(x.s.id));}
  function training(a){const B=M.boardEngine,rows=attendanceRows(a,28);const metres=rows.reduce((n,x)=>n+(Number(x.s.finish?.actualDistance)||Number(B?.sessionDistance?.(x.s))||0),0);
    const t400=[];for(const st of ['Freestyle','Backstroke','Breaststroke','Butterfly','IM']){let list=[];try{list=Ev()?.t400Rows?.(a,M.state,st)||[];}catch{}if(!list.length)continue;
      const fastest=list[0],latest=[...list].sort((x,y)=>dateOf(y).localeCompare(dateOf(x)))[0];t400.push({stroke:short(st),fastest:clock(Ev().seconds(fastest)),fastestDate:dateOf(fastest),latest:clock(Ev().seconds(latest)),latestDate:dateOf(latest),count:list.length});}
    // timed sets: the ones that match a set on today's Board come first
    const session=M.currentSession?.(),onBoard=new Set();const walk=items=>{for(const n of items||[]){if(n?.kind==='set')onBoard.add(`${Number(n.distance)}|${Ev()?.stroke?.(n.stroke||'')||''}`);else if(n?.kind==='group')walk(n.items);}};for(const b of session?.blocks||[])walk(b.items);
    const timed=(M.state.timedSets||[]).filter(r=>r?.athlete_id===a.id&&Number(r.best)>0).map(r=>{const st=Ev()?.stroke?.(r.stroke||'')||'',sess=M.state.canonicalSessions?.[r.session_id];return{date:text(sess?.identity?.date||r.created_at).slice(0,10),label:[r.distance?eventName(r.distance,st||'').trim():'',text(r.set_label)].filter(Boolean).join(' · '),best:clock(r.best),average:clock(r.average),reps:(r.times||[]).length,match:onBoard.has(`${Number(r.distance)}|${st}`)};})
      .sort((x,y)=>(y.match-x.match)||y.date.localeCompare(x.date)).slice(0,8);
    // 19 Oct 2026 (Andy: "training over the last while ... the balances ... for swimmer ownership"): week by week, and
    // the balance of that work -- Rushton's energy systems (dosage engine, the same grouping every report uses) and strokes.
    // The swimmer's own version of each set (a modified swimmer is counted on what they swam).
    const D=M.dosageEngine,doses=[];const monday=d=>{const t=new Date(`${d}T12:00:00`);const k=(t.getDay()+6)%7;t.setDate(t.getDate()-k);return t.toISOString().slice(0,10);};
    const weeks=new Map();for(let i=3;i>=0;i--){const t=new Date();t.setDate(t.getDate()-7*i);const k=monday(t.toISOString().slice(0,10));weeks.set(k,{week:k,sessions:0,metres:0});}
    for(const x of rows){let dose=null;try{dose=D?.session?.(x.s,M.state,{athlete:a,delivered:true});}catch{}const m=Number(dose?.rawMetres)||Number(x.s.finish?.actualDistance)||Number(B?.sessionDistance?.(x.s))||0;if(dose)doses.push(dose);const w=weeks.get(monday(x.d));if(w){w.sessions++;w.metres+=m;}}
    let balance=[],strokes=[];if(D?.merge&&doses.length){const all=D.merge(doses);balance=(D.rushton?.(all.systems)||[]).map(gp=>({group:gp.group,pct:Math.round(gp.pct),metres:Math.round(gp.total),rows:gp.rows.map(r=>({label:r.label,pct:Math.round(r.pct),metres:Math.round(r.metres)}))}));
      const sm=Object.entries(all.strokes||{}).map(([k,v])=>[k,Number(v?.metres)||0]).filter(([k,v])=>v>0&&!/choice|unspecified/i.test(k)),tot=sm.reduce((n,[,v])=>n+v,0);strokes=sm.sort((x,y)=>y[1]-x[1]).slice(0,5).map(([k,v])=>({stroke:short(k),pct:tot?Math.round(v/tot*100):0,metres:Math.round(v)}));}
    return{page:'training',name:text(a.full_name),sessions28:rows.length,metres28:metres,lastSeen:rows.map(x=>x.d).sort().at(-1)||'',weeks:[...weeks.values()],balance,strokes,t400,timed};}
  function performance(a){const table=eventTable(a);return{page:'performance',name:text(a.full_name),seasonStart:seasonStart(),
    events:table.slice(0,12).map(e=>({event:e.event,points:e.points,system:e.system,scm:e.SCM?.time||'',scmDate:e.SCM?.date||'',scmPts:e.SCM?.points||null,lcm:e.LCM?.time||'',lcmDate:e.LCM?.date||'',lcmPts:e.LCM?.points||null,
      seasonScm:e.seasonSCM?.time||'',seasonLcm:e.seasonLCM?.time||''}))};}
  function goalInfo(a){const p=M.swimmerGoals?.progress?.(a.id);if(!p)return null;const gl=p.goal;
    return{event:`${eventName(gl.distance,gl.stroke)} ${gl.course==='LCM'?'LC':'SC'}`,label:gl.label,kind:gl.kind,time:clock(gl.seconds),pb:p.pb?clock(p.pb.seconds):'',pbDate:p.pb?.date||'',gap:p.gap!=null?p.gap.toFixed(2):'',gapPct:p.gapPct!=null?`${p.gapPct.toFixed(1)}%`:'',reached:p.reached,by:p.by,steps:p.steps.map(s=>({label:s.label,time:clock(s.seconds),gap:p.pb?(p.pb.seconds-s.seconds).toFixed(2):''}))};}
  S.goalInfo=goalInfo;
  function pathway(a){const pw=pathwayRows(a,6);return{page:'pathway',name:text(a.full_name),course:pw.course,events:pw.events,goal:goalInfo(a)};}
  function goal(a){return{page:'goal',name:text(a.full_name),goal:goalInfo(a)};}
  function captureRows(a){return(M.state.captures||[]).filter(c=>c?.athlete_id===a.id||(c?.athlete_ids||[]).includes(a.id)).map(c=>{const s=M.state.canonicalSessions?.[c.session_id];
    return{id:c.id,type:text(c.capture_type||'note').toLowerCase(),date:text(s?.identity?.date||c.created_at).slice(0,10),context:text(c.context_label||s?.identity?.title||''),text:text(c.text_content||c.note||'').slice(0,140),hasMedia:!!(c.media_id||c.media_path)};})
    .sort((x,y)=>y.date.localeCompare(x.date));}
  S.captureRows=captureRows;
  function videos(a){const rows=captureRows(a);return{page:'videos',name:text(a.full_name),count:rows.length,items:rows.slice(0,12)};}
  const BUILDERS={profile,training,performance,pathway,goal,videos};
  S.page=(athleteId,page='profile')=>{const a=ath(athleteId);if(!a)return null;const fn=BUILDERS[page]||profile;try{return fn(a);}catch(e){return{page,name:text(a.full_name),error:String(e?.message||e)};}};

  // ---------- one renderer for both the phone preview and the TV (tv.js carries a copy of the same layout) ----------
  function html(d){if(!d)return'<div class="sb-empty">Swimmer not found</div>';const h=`<header class="sb-head"><h3>${esc(d.name)}</h3><small>${esc(PAGE_TITLES[d.page]||'')}</small></header>`;
    const tbl=(cols,rows)=>`<table class="sb-table"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const none=t=>`<p class="sb-none">${esc(t)}</p>`;
    const goalBox=gl=>gl?`<div class="sb-goal${gl.reached?' reached':''}"><small>GOAL</small><b>${esc(gl.label)}</b><span>${esc(gl.event)} · <b>${esc(gl.time)}</b></span><span>${gl.reached?'Reached ✓':gl.pb?`PB ${esc(gl.pb)} · <b>${esc(gl.gap)}s</b> to go (${esc(gl.gapPct)})`:'No PB in this event yet'}</span></div>`:'';
    const bar=(pct)=>`<i class="sb-bar" style="width:${Math.max(0,Math.min(100,Number(pct)||0))}%"></i>`;
    if(d.error)return h+none(`Couldn't load this: ${d.error}`);
    if(d.page==='profile')return h+`<div class="sb-facts"><span>${esc(d.squad||'')}</span>${d.age!=null?`<span>Age ${esc(d.age)}</span>`:''}${d.bestStroke?`<span>Best stroke: <b>${esc(d.bestStroke)}</b></span>`:''}</div>`
      +`<h4>Best events</h4>${d.best.length?tbl(['Event','SC','LC','Pts'],d.best.map(e=>[`<b>${esc(e.event)}</b>`,esc(e.scm),esc(e.lcm),esc(e.points||'')])):none('No race results on record yet')}`
      +goalBox(d.goal)+`<h4>Level</h4>${d.level.length?`<ul class="sb-list">${d.level.map(l=>`<li><b>${esc(l.label)}</b> · ${esc(l.event)}</li>`).join('')}</ul>`:none(d.levelNote)}`;
    if(d.page==='training')return h+`<div class="sb-facts"><span><b>${esc(d.sessions28)}</b> sessions · 4 weeks</span><span><b>${Number(d.metres28||0).toLocaleString()}m</b></span>${d.lastSeen?`<span>Last: ${esc(d.lastSeen)}</span>`:''}</div>`
      +(d.weeks?.length?`<h4>Week by week</h4>${tbl(['Week of','Sessions','Metres'],d.weeks.map(w=>[esc(w.week.slice(5).split('-').reverse().join('/')),esc(w.sessions),`<b>${Number(w.metres||0).toLocaleString()}</b>`]))}`:'')
      +`<h4>Balance · energy systems</h4>${d.balance?.some(b=>b.metres>0)?`<div class="sb-balance">${d.balance.map(b=>`<div class="sb-bal-group"><p><span><b>${esc(b.group)}</b></span><b>${esc(b.pct)}%</b></p>${b.rows.map(r=>`<p class="sb-bal-row${r.metres?'':' none'}"><span>${esc(r.label)}</span>${bar(r.pct)}<b>${r.metres?`${esc(r.pct)}%`:'none'}</b></p>`).join('')}</div>`).join('')}</div>`:none('No classified training in the last 4 weeks')}`
      +(d.strokes?.length?`<h4>Balance · strokes</h4><div class="sb-balance">${d.strokes.map(r=>`<p class="sb-bal-row"><span>${esc(r.stroke)}</span>${bar(r.pct)}<b>${esc(r.pct)}%</b></p>`).join('')}</div>`:'')
      +`<h4>T400</h4>${d.t400.length?tbl(['Stroke','Fastest','Latest'],d.t400.map(t=>[esc(t.stroke),`<b>${esc(t.fastest)}</b> <small>${esc(t.fastestDate)}</small>`,`${esc(t.latest)} <small>${esc(t.latestDate)}</small>`])):none('No T400 on record')}`
      +`<h4>Timed sets</h4>${d.timed.length?tbl(['Date','Set','Best','Avg'],d.timed.map(t=>[esc(t.date),`${t.match?'▶ ':''}${esc(t.label)}`,`<b>${esc(t.best)}</b>`,esc(t.average)])):none('No timed sets yet')}`;
    // 19 Oct 2026: short course and long course side by side, each with its World Aquatics points; ranked by points
    if(d.page==='performance')return h+`<p class="sb-note">Ranked by World Aquatics points · season from ${esc(d.seasonStart)} · ★ = this season</p>${d.events.length?tbl(['#','Event','SC','Pts','LC','Pts'],d.events.map((e,i)=>[esc(i+1),`<b>${esc(e.event)}</b>`,`${esc(e.scm)}${e.seasonScm&&e.seasonScm===e.scm?' ★':''}`,`<b>${esc(e.scmPts||'')}</b>`,`${esc(e.lcm)}${e.seasonLcm&&e.seasonLcm===e.lcm?' ★':''}`,`<b>${esc(e.lcmPts||'')}</b>`])):none('No race results on record yet')}`;
    if(d.page==='goal')return h+(d.goal?goalBox(d.goal)+(d.goal.steps.length?`<h4>On the way</h4>${tbl(['Step','Time','Gap'],d.goal.steps.map(s=>[esc(s.label),`<b>${esc(s.time)}</b>`,s.gap?`${esc(s.gap)}s`:'']))}`:'')+(d.goal.by?`<p class="sb-note">Goal set by ${esc(d.goal.by)}</p>`:''):none('No goal set yet — choose one on the phone (swimmer screen → Goal)'));
    if(d.page==='pathway')return h+goalBox(d.goal)+`<p class="sb-note">${esc(d.course)} pathway</p>${d.events.length?tbl(['Event','PB','Reached','Next','Gap'],d.events.map(e=>[`<b>${esc(e.event)}</b>`,esc(e.pb),e.achieved?esc(e.achieved.label):'—',e.next?`${esc(e.next.label)} <b>${esc(e.next.time)}</b>`:'—',e.next?esc(e.next.gap):''])):none('No pathway standards for these events yet')}`;
    if(d.page==='videos')return h+(d.items.length?`<ul class="sb-list sb-videos">${d.items.map(v=>`<li><b>${esc(v.type==='note'?'Note':v.type[0].toUpperCase()+v.type.slice(1))}</b> · ${esc(v.date)}${v.context?` · ${esc(v.context)}`:''}${v.text?`<br><small>${esc(v.text)}</small>`:''}</li>`).join('')}</ul>`:none('No videos, photos or notes tagged to this swimmer yet'));
    return h;}
  S.html=html;
})(globalThis);
