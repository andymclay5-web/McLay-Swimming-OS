'use strict';
// Live updates between phones (19 Oct 2026). Andy, after the first pool TV night: "I had to go to Coach Hub and do
// sync. I don't want to have to hit sync ... those changes need to show pretty much instantly. I don't want to be in a
// position where two coaches are doing a role and then they're contradicting each other" -- and every TV tap took ~30 s.
// The logs showed why: nothing was pushed (only coach chat was in the live-update feed, and chat on Andy's phone had
// fallen back to asking every few seconds), so every phone asked the cloud over and over and the pool connection jammed.
//
// Owner of one thing: the one live connection this phone keeps to the team cloud (Supabase Realtime, plain WebSocket --
// no script download at the pool). It hears, within a second, when another coach changes Roll, a session, a capture,
// the swimmer adaptations or coach chat, and hands each change to the owner that already knows how to apply it
// (app.js cloud: attendance rows, pullTeamData, reconcileSession, pullTeamSessions; coach-chat ingest). It never
// decides what wins -- the same "local unsent change wins" rules apply as for the 25 s catch-up, which stays as a safety
// net (slower while the live connection is up). It also sends the pool TV a "look now" nudge (no data in it) so the TV
// fetches the new Board at once instead of on its next check.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const L=M.liveSync={build:'v4-live-sync-20261019'};
  const TABLES=['attendance','sessions','session_blocks','captures','session_adaptations','coach_messages'];
  const HEARTBEAT_MS=25000;
  let ws=null,state='off',ref=0,joinRef='',topic='',hb=0,retry=0,retryTimer=0,lastToken='',connectedOrg='',lastEventAt=0;
  const handlers={};const tvTopics=new Map();
  const cfg=()=>M.store?.config?.()||g.MSOS_CONFIG||{};
  const auth=()=>M.store?.auth?.()||null;
  const org=()=>M.state.settings?.organisationId||'';
  const now=()=>Date.now();
  L.status=()=>({state,org:connectedOrg,lastEventAt,retry});
  L.live=()=>state==='live';
  L.on=(table,fn)=>{(handlers[table]||(handlers[table]=[])).push(fn);return()=>{handlers[table]=(handlers[table]||[]).filter(f=>f!==fn);};};
  function send(msg){try{if(ws&&ws.readyState===1){ws.send(JSON.stringify(msg));return true;}}catch{}return false;}
  const nextRef=()=>String(++ref);
  function wsUrl(){const c=cfg();const base=String(c.supabaseUrl||'').replace(/\/$/,'').replace(/^http/,'ws');return base&&c.supabaseAnonKey?`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(c.supabaseAnonKey)}&vsn=1.0.0`:'';}
  function canConnect(){const a=auth();return !!(wsUrl()&&org()&&a?.access_token&&(M.access?.role?.()||'owner')!=='swimmer');}
  function join(){const o=org(),a=auth();connectedOrg=o;topic=`realtime:msos-team-${o}`;joinRef=nextRef();lastToken=a?.access_token||'';
    send({topic,event:'phx_join',ref:joinRef,join_ref:joinRef,payload:{config:{broadcast:{self:false,ack:false},presence:{key:''},private:false,
      postgres_changes:TABLES.map(t=>({event:'*',schema:'public',table:t,filter:`organisation_id=eq.${o}`}))},access_token:lastToken}});
    for(const t of tvTopics.keys())joinTv(t);}
  function joinTv(t){const r=nextRef();let done;const ready=new Promise(res=>{done=res;setTimeout(()=>res(false),2000);});tvTopics.set(t,{joined:false,ref:r,ready,done});send({topic:t,event:'phx_join',ref:r,join_ref:r,payload:{config:{broadcast:{self:false,ack:false},presence:{key:''},private:false,postgres_changes:[]},access_token:lastToken}});}
  function onMessage(ev){let m;try{m=JSON.parse(ev.data);}catch{return;}
    if(m.event==='phx_reply'&&m.topic===topic&&m.ref===joinRef){if(m.payload?.status==='ok'){state='live';retry=0;emit('_status',{state});}else{state='error';emit('_status',{state,error:m.payload?.response?.reason||'join refused'});}return;}
    // 27 Oct 2026: a pool TV says whether the video it was sent actually started (tv.js report); engines/tv-display.js shows it.
    if(m.event==='broadcast'&&tvTopics.has(m.topic)&&m.payload?.event==='tv-status'){emit('_tv',m.payload.payload||{});return;}
    if(m.event==='phx_reply'&&tvTopics.has(m.topic)){const t=tvTopics.get(m.topic);if(m.ref===t.ref){t.joined=m.payload?.status==='ok';t.done?.(t.joined);}return;}
    if(m.event==='postgres_changes'&&m.topic===topic){const d=m.payload?.data||{};if(!d.table)return;lastEventAt=now();emit(d.table,{type:d.type,record:d.record||null,old:d.old_record||null});return;}
    if(m.event==='system'&&m.payload?.status==='error'){emit('_status',{state:'error',error:m.payload?.message||''});}
    if(m.event==='phx_error'||m.event==='phx_close'){if(m.topic===topic){state='error';reconnectSoon();}}}
  function emit(table,change){for(const fn of handlers[table]||[]){try{fn(change);}catch{}}}
  L._emit=emit;
  function connect(){clearTimeout(retryTimer);if(ws&&(ws.readyState===0||ws.readyState===1))return;if(!canConnect()){state='off';retryTimer=setTimeout(connect,15000);return;}
    try{ws=new WebSocket(wsUrl());}catch{reconnectSoon();return;}state='connecting';
    ws.onopen=()=>{join();clearInterval(hb);hb=setInterval(()=>{send({topic:'phoenix',event:'heartbeat',payload:{},ref:nextRef()});
      const a=auth();if(a?.access_token&&a.access_token!==lastToken){lastToken=a.access_token;send({topic,event:'access_token',payload:{access_token:lastToken},ref:nextRef()});}
      if(org()&&org()!==connectedOrg)restart();},HEARTBEAT_MS);};
    ws.onmessage=onMessage;
    ws.onclose=()=>{clearInterval(hb);if(state!=='off')state='closed';for(const t of tvTopics.values())t.joined=false;reconnectSoon();};
    ws.onerror=()=>{};}
  function reconnectSoon(){clearTimeout(retryTimer);const wait=[1000,2000,5000,10000,30000][Math.min(retry++,4)];retryTimer=setTimeout(connect,wait);}
  function restart(){try{ws?.close?.();}catch{}ws=null;connect();}
  L.connect=connect;L.restart=restart;
  L.stop=()=>{state='off';clearTimeout(retryTimer);clearInterval(hb);try{ws?.close?.();}catch{}ws=null;};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(!ws||ws.readyState>1))connect();});
  addEventListener('online',()=>{if(!ws||ws.readyState>1)connect();});

  // ---------- the pool TV: "look now" (the TV fetches the Board itself; nothing else is sent) ----------
  async function nudgeKey(screenId){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`msos-tv-nudge:${screenId}`));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);}
  L.nudgeKey=nudgeKey;
  L.nudgeTv=async screenId=>{if(!screenId||state!=='live')return false;const t=`realtime:msos-tv-${await nudgeKey(screenId)}`;if(!tvTopics.get(t)?.joined){if(!tvTopics.has(t)||!tvTopics.get(t).ready)joinTv(t);await tvTopics.get(t).ready;}
    return send({topic:t,event:'broadcast',ref:nextRef(),join_ref:tvTopics.get(t)?.ref,payload:{type:'broadcast',event:'nudge',payload:{at:now()}}});};

  // ---------- applying what other coaches changed (through the existing owners) ----------
  const C=()=>M.cloud;
  const modalOpen=()=>!!document.querySelector('#modalHost .modal');
  const view=()=>M.state.settings?.view||'board';
  let renderT=0;function renderSoon(views){clearTimeout(renderT);renderT=setTimeout(()=>{if(modalOpen()||!views.includes(view()))return;try{M.ui?.renderCurrent?.();}catch{}},250);}
  // Roll: the row itself is in the change -- applied straight away (unless this phone has its own unsent tick for that swimmer)
  L.on('attendance',({type,record})=>{if(!record||type==='DELETE')return;const st=M.state;const row={id:record.id,session_id:record.session_id,athlete_id:record.athlete_id,status:record.status,note:record.note||'',updated_at:record.updated_at};
    const cur=(st.attendance||[]).find(x=>x.session_id===row.session_id&&x.athlete_id===row.athlete_id);if(cur&&cur.status===row.status&&String(cur.note||'')===row.note)return;
    try{const r=C().upsertRows([row],st.attendance||(st.attendance=[]),'attendance',{newer:(rem,c)=>!(Date.parse(c.updated_at||'')>Date.parse(rem.updated_at||''))});st.attendance=r.rows;if(!(r.added||r.updated))return;M.store?.save?.(st);}catch{return;}
    if(row.session_id===st.settings?.selectedSessionId)renderSoon(['roll','board','tv']);});
  // captures and their media: the existing incremental pull (merges, keeps this phone's media)
  let capT=0;L.on('captures',()=>{clearTimeout(capT);capT=setTimeout(()=>{if(!C()?.ready?.())return;C().pullTeamData?.({}).then(r=>{if(r?.captures)renderSoon(['board','tv','hub','athletes']);}).catch(()=>{});},400);});
  // sessions, their sets and swimmer adaptations: the session on screen is reconciled (local unsent edits win); others are pulled
  let sesT=0,otherT=0;function sessionChange({record,old}){const sid=record?.session_id||record?.id||old?.session_id||old?.id;const cur=M.state.settings?.selectedSessionId;
    if(sid&&sid===cur){clearTimeout(sesT);sesT=setTimeout(()=>{C()?.reconcileSession?.(cur).then(r=>{if(r?.applied==='remote')renderSoon(['board','tv','roll','times']);}).catch(()=>{});},500);}
    else{clearTimeout(otherT);otherT=setTimeout(()=>{C()?.pullTeamSessions?.().then(r=>{if(r?.added||r?.updated)renderSoon(['hub','calendar']);}).catch(()=>{});},1500);}}
  L.on('sessions',sessionChange);L.on('session_blocks',sessionChange);L.on('session_adaptations',sessionChange);
  // coach chat: handed to coach chat's own merge
  L.on('coach_messages',({type,record})=>{if(type==='INSERT'&&record)try{M.coachChat?._ingestForTest?.(record);}catch{}});

  function boot(){let tries=0;const go=()=>{if(!M.storageEngine?.ready){if(++tries<80)return setTimeout(go,250);}connect();};go();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(globalThis);
