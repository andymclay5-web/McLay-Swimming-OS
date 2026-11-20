// Freeze recorder (21 Nov 2026). Andy: "Phone's freezing up quite a lot ... it kind of comes and goes, so to be able to
// see what's causing it would be quite good."
// Diagnostics only. It never changes coaching state, never renders, never wraps another engine. It watches the main
// thread: a heartbeat that should tick every 250ms, plus the browser's own long-task reports. When the screen is stuck
// for FREEZE_MS or more it notes what was on screen and what the coach last touched, keeps the last 60 locally, and
// (when signed in) sends them to the cloud table msos_client_freezes so they can be read without asking the coach.
(()=>{'use strict';
  const M=window.MSOS4=window.MSOS4||{};
  if(M.freezeRecorder)return;
  const FREEZE_MS=700,TICK_MS=250,KEEP=60,KEY='msos.freezeLog.v1',DEV_KEY='msos.freezeDevice.v1';
  const F=M.freezeRecorder={FREEZE_MS};
  const now=()=>Date.now();
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const write=list=>{try{localStorage.setItem(KEY,JSON.stringify(list.slice(-KEEP)))}catch{}};
  const device=()=>{try{let d=localStorage.getItem(DEV_KEY);if(!d){d='fz-'+Math.random().toString(36).slice(2,10)+now().toString(36);localStorage.setItem(DEV_KEY,d)}return d}catch{return'fz-unknown'}};
  const short=v=>String(v??'').replace(/\s+/g,' ').trim().slice(0,80);

  // What the coach last touched (capture phase, read-only).
  let lastAction=null;
  const describe=el=>{if(!el||el.nodeType!==1)return'';const parts=[];let n=el;for(let i=0;n&&i<4;i++,n=n.parentElement){const data=[...(n.attributes||[])].filter(a=>a.name.startsWith('data-')).slice(0,2).map(a=>a.value?`${a.name}=${short(a.value).slice(0,24)}`:a.name);parts.push(`${n.tagName.toLowerCase()}${n.id?'#'+n.id:''}${data.length?'['+data.join(',')+']':''}`);if(n.id)break}return parts.join(' < ')};
  const note=type=>e=>{lastAction={type,at:now(),target:describe(e.target),text:short(e.target?.closest?.('button,a,summary,label')?.innerText||'')}};
  for(const t of['click','input','change','touchstart','scroll'])try{document.addEventListener(t,note(t),{capture:true,passive:true})}catch{}
  let hiddenAt=0;document.addEventListener('visibilitychange',()=>{hiddenAt=document.hidden?now():0;lastTick=now()},{capture:true});

  function context(){
    const s=M.state||{},set=s.settings||{};let session=null;try{session=M.currentSession?.()||null}catch{}
    const count=v=>Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:0;
    let mem=null;try{const m=performance.memory;if(m)mem={usedMB:Math.round(m.usedJSHeapSize/1048576),limitMB:Math.round(m.jsHeapSizeLimit/1048576)}}catch{}
    return{view:set.view||'',boardMode:set.boardMode||set.boardView||'',session:session?{id:session.id,date:session.identity?.date,slot:session.identity?.dayPart,blocks:(session.blocks||[]).length}:null,
      athlete:set.selectedAthleteId||'',scrollY:Math.round(window.scrollY||0),domNodes:document.getElementsByTagName('*').length,
      counts:{sessions:count(s.canonicalSessions),athletes:count(s.athletes),attendance:count(s.attendance),captures:count(s.captures),pending:count(s.pending),coachResults:count(s.coachResults)},
      online:navigator.onLine,memory:mem,lastAction:lastAction&&now()-lastAction.at<15000?{...lastAction,msBefore:now()-lastAction.at}:null};
  }
  function record(duration,source){
    if(duration<FREEZE_MS)return;
    const at=now()-duration,c=context(),list=read();
    const row={id:`${device()}-${at}`,happened_at:new Date(at).toISOString(),duration_ms:Math.round(duration),source,build:String(M.BUILD||M.RELEASE_ATTESTATION?.build||''),view:c.view,detail:c};
    if(list.some(x=>Math.abs(Date.parse(x.happened_at)-at)<1500))return;// the heartbeat and the long-task report saw the same stall
    list.push(row);write(list);F.lastFreeze=row;queueSend();
  }
  // Heartbeat: a timer that should fire every TICK_MS. If it fires late, the main thread was blocked for the gap.
  let lastTick=now();
  setInterval(()=>{const t=now(),gap=t-lastTick-TICK_MS;lastTick=t;if(document.hidden||hiddenAt)return;if(gap>=FREEZE_MS)record(gap,'heartbeat')},TICK_MS);
  // The browser's own long-task reports (Chrome / Android), which catch stalls a timer can miss at boot.
  try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>=FREEZE_MS&&!document.hidden){const t=performance.timeOrigin+e.startTime;const list=read();if(!list.some(x=>Math.abs(Date.parse(x.happened_at)-t)<1500))record(e.duration,'longtask')}}).observe({type:'longtask',buffered:true})}catch{}

  // Sending: best effort, never in the way. Only rows not yet sent; only when signed in to an organisation.
  let sending=false,timer=0;
  function queueSend(){clearTimeout(timer);timer=setTimeout(send,5000)}
  async function send(){
    if(sending)return;const org=M.cloud?.org?.(),user=M.cloud?.user?.();if(!org||!user||!M.cloud?.fetch||!navigator.onLine)return;
    const list=read(),todo=list.filter(x=>!x.sent);if(!todo.length)return;sending=true;
    try{await M.cloud.fetch('/rest/v1/msos_client_freezes?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
        body:JSON.stringify(todo.slice(0,30).map(x=>({id:x.id,organisation_id:org,user_id:user,device:device(),build:x.build,happened_at:x.happened_at,duration_ms:x.duration_ms,view:x.view,detail:{...x.detail,source:x.source}})))});
      const sent=new Set(todo.slice(0,30).map(x=>x.id));write(read().map(x=>sent.has(x.id)?{...x,sent:true}:x));if(todo.length>30)queueSend();}
    catch{}finally{sending=false}
  }
  setTimeout(send,20000);setInterval(send,5*60000);
  F.log=read;F.send=send;F.record=record;F.device=device;
})();
