// Session journey recorder (22 Nov 2026). Andy agreed a weekly real-session check: run a real session end to end on
// the phone and know it held. Rather than ask him to run a test script poolside, the phone notes it as he coaches.
// Diagnostics only, like the freeze recorder: it never changes coaching state, never renders, never wraps another engine.
// Once a second it reads what is on screen -- the selected session, the view, the workout, the Roll count -- and keeps,
// per session, which poolside steps happened (Board, Roll, Times, Capture, background and back, Finish) and every
// "surprise": the session, the view or the workout changing, or Roll losing swimmers, with no tap from the coach just
// before it. That is the North Star test written down: the coach should never wonder why the session changed.
// Kept locally (last 40 sessions) and, when signed in, sent to the cloud table msos_session_journeys.
(()=>{'use strict';
  const M=window.MSOS4=window.MSOS4||{};
  if(M.journeyRecorder)return;
  const KEY='msos.journeyLog.v1',DEV_KEY='msos.freezeDevice.v1',KEEP=40,TICK_MS=1000,TAP_GRACE_MS=2500;
  const J=M.journeyRecorder={TAP_GRACE_MS};
  const now=()=>Date.now();
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const write=list=>{try{localStorage.setItem(KEY,JSON.stringify(list.slice(-KEEP)))}catch{}};
  const device=()=>{try{let d=localStorage.getItem(DEV_KEY);if(!d){d='fz-'+Math.random().toString(36).slice(2,10)+now().toString(36);localStorage.setItem(DEV_KEY,d)}return d}catch{return'fz-unknown'}};
  const short=v=>String(v??'').replace(/\s+/g,' ').trim().slice(0,60);

  // The coach's own taps (capture phase, read-only). A change within TAP_GRACE_MS of one is the coach's doing.
  let lastTap=0,lastTapText='';
  const tap=e=>{lastTap=now();lastTapText=short(e.target?.closest?.('button,a,summary,label,input,select,textarea')?.innerText||e.target?.closest?.('[data-view],[data-nav]')?.getAttribute?.('data-view')||e.target?.tagName||'')};
  for(const t of['click','input','change','keydown','touchend'])try{document.addEventListener(t,tap,{capture:true,passive:true})}catch{}

  function workoutSig(s){try{return(s?.blocks||[]).map(b=>(b.items||[]).map(i=>String(i.raw||i.text||'')).join('\n')).join('\n--\n')}catch{return''}}
  function metres(s){try{const v=M.session?.total?.(s);if(Number.isFinite(Number(v)))return Number(v)}catch{}return null}
  function rollCount(id){let n=0;for(const a of M.state?.attendance||[])if(a?.session_id===id&&String(a.status||'').toLowerCase()==='present')n++;return n}
  function snapshot(){
    const st=M.state?.settings||{};let s=null;try{s=M.currentSession?.()||null}catch{}
    return{view:String(st.view||''),sel:String(st.selectedSessionId||s?.id||''),session:s,sig:workoutSig(s),metres:metres(s),roll:s?rollCount(s.id):0,
      captures:s?(M.state?.captures||[]).filter(c=>c?.session_id===s.id).length:0,finished:!!s?.finish};
  }
  function journeyFor(s){
    const list=read(),id=s?.id;if(!id)return{list,j:null};
    let j=list.find(x=>x.session_id===id&&x.device===device());
    if(!j){j={id:`${device()}-${id}`,device:device(),session_id:id,session_date:s.identity?.date||null,slot:s.identity?.dayPart||'',build:String(M.BUILD||''),started_at:new Date().toISOString(),
      steps:{board:false,roll:false,times:false,capture:false,background:false,resumed:false,finish:false,reopened:false},rollMax:0,surprises:[],sent:false};list.push(j)}
    return{list,j};
  }
  function note(j,kind,from,to){const quiet=now()-lastTap>TAP_GRACE_MS;if(!quiet)return false;
    j.surprises.push({at:new Date().toISOString(),kind,from:short(from),to:short(to),view:short(M.state?.settings?.view),lastTapMsBefore:lastTap?now()-lastTap:null,lastTap:lastTapText,hidden:document.hidden});
    if(j.surprises.length>30)j.surprises=j.surprises.slice(-30);return true}

  let prev=null,hiddenSnap=null,dirty=false;
  function tick(){
    if(!M.state||!M.storageEngine?.ready)return;if((performance?.now?.()||0)<6000)return;// boot settles first: which session opens at start-up is the start-up gate's job, checked by its own tests
    const cur=snapshot();if(!cur.session){prev=cur;return}
    const{list,j}=journeyFor(cur.session);if(!j)return;let changed=false;
    const step=k=>{if(!j.steps[k]){j.steps[k]=true;changed=true}};
    if(cur.view==='board')step('board');if(cur.view==='roll')step('roll');if(cur.view==='times')step('times');
    if(cur.roll>j.rollMax){j.rollMax=cur.roll;changed=true}
    if(cur.finished)step('finish');if(j.steps.finish&&!cur.finished&&prev?.sel===cur.sel&&prev?.finished){changed=note(j,'finish-lost','finished','not finished')||changed}
    if(prev&&prev.session){
      if(prev.sel!==cur.sel){const pr=journeyFor(prev.session);if(pr.j&&note(pr.j,'session-changed',`${prev.session.identity?.date||''} ${prev.session.identity?.dayPart||''} ${prev.sel}`,`${cur.session.identity?.date||''} ${cur.session.identity?.dayPart||''} ${cur.sel}`)){pr.j.sent=false;write(pr.list);dirty=true;prev=cur;return}}
      else{
        if(prev.sig&&cur.sig!==prev.sig)changed=note(j,'workout-changed',prev.metres!=null?`${prev.metres}m`:'',cur.metres!=null?`${cur.metres}m`:'')||changed;
        if(cur.roll<prev.roll)changed=note(j,'roll-dropped',String(prev.roll),String(cur.roll))||changed;
        if(cur.captures>prev.captures)step('capture');
      }
      if(prev.view!==cur.view&&prev.view)changed=note(j,'view-changed',prev.view,cur.view)||changed;
    }
    prev=cur;if(changed){j.sent=false;write(list);dirty=true}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenSnap=snapshot();if(hiddenSnap.session){const{list,j}=journeyFor(hiddenSnap.session);if(j){j.steps.background=true;j.sent=false;write(list)}}send();return}
    // back on screen: what was there when the phone was put down must still be there (checked once things settle)
    const was=hiddenSnap;hiddenSnap=null;if(!was?.session)return;
    setTimeout(()=>{const cur=snapshot(),{list,j}=journeyFor(was.session);if(!j)return;j.steps.resumed=true;
      if(cur.sel!==was.sel)note(j,'session-changed-on-resume',was.sel,cur.sel);
      else{if(cur.sig!==was.sig)note(j,'workout-changed-on-resume',was.metres!=null?`${was.metres}m`:'',cur.metres!=null?`${cur.metres}m`:'');if(cur.roll<was.roll)note(j,'roll-dropped-on-resume',String(was.roll),String(cur.roll))}
      if(cur.view!==was.view)note(j,'view-changed-on-resume',was.view,cur.view);
      j.sent=false;write(list);prev=snapshot();dirty=true},3000);
  },{capture:true});
  // Reopening a finished session later (history) counts as the last step of the journey.
  let lastSel='';setInterval(()=>{try{const s=M.currentSession?.();if(!s||s.id===lastSel)return;lastSel=s.id;if(s.finish){const{list,j}=journeyFor(s);if(j&&j.steps.finish&&!j.steps.reopened&&Date.now()-Date.parse(j.started_at)>30*60000){j.steps.reopened=true;j.sent=false;write(list);dirty=true}}}catch{}},TICK_MS*2);
  setInterval(()=>{try{tick()}catch{}},TICK_MS);

  let sending=false;
  async function send(){
    if(sending)return;const org=M.cloud?.org?.(),user=M.cloud?.user?.();if(!org||!user||!M.cloud?.fetch||!navigator.onLine)return;
    const todo=read().filter(x=>!x.sent);if(!todo.length)return;sending=true;
    try{const batch=todo.slice(0,20);await M.cloud.fetch('/rest/v1/msos_session_journeys?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(batch.map(x=>({id:x.id,organisation_id:org,user_id:user,device:x.device,session_id:x.session_id,session_date:x.session_date,slot:x.slot,build:x.build,started_at:x.started_at,updated_at:new Date().toISOString(),steps:x.steps,roll_max:x.rollMax,surprises:x.surprises})))});
      const sent=new Map(batch.map(x=>[x.id,JSON.stringify([x.steps,x.surprises.length,x.rollMax])]));write(read().map(x=>sent.get(x.id)===JSON.stringify([x.steps,x.surprises.length,x.rollMax])?{...x,sent:true}:x));dirty=false}
    catch{}finally{sending=false}
  }
  setTimeout(send,30000);setInterval(()=>{if(dirty)send()},3*60000);
  J.log=read;J.send=send;J.tick=tick;
})();
