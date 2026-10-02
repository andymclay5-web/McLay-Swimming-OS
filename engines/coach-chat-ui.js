'use strict';
// 2 Oct 2026 (Andy, verbatim): "a chat thing within the app where we can communicate to the whole group.
// The assistant coaches communicate to each other or me." See engines/coach-chat.js for the data/realtime
// layer this renders. index.html only ever serves the coach app (swimmers get the separate
// swimmer-portal.html), so the sticky-actions bar this adds a button to is already coach-only -- no extra
// role gate needed, matching how Capture/Voice/Edit/Finish work today.
(function(g){
  const M=g.MSOS4,K=M?.coachChat;if(!M?.state||!K)return;
  const BUILD='v4-coach-chat-20261002',U=M.coachChatUI={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeLabel=iso=>{try{return new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}catch{return'';}};

  let panelEl=null,activeKey=K.GROUP_KEY,unsubscribe=null;

  function channelList(){
    const roster=K.roster();
    const rows=[{key:K.GROUP_KEY,label:'Whole group',sub:'Everyone on the team'}]
      .concat(roster.map(r=>({key:K.dmThreadKey(r.user_id),label:r.display_name,sub:r.role==='owner'?'Owner':'Assistant coach'})));
    return rows;
  }

  function renderChannelList(){
    const host=panelEl.querySelector('[data-chat-channels]');if(!host)return;
    const rows=channelList();
    host.innerHTML=rows.map(r=>{
      const unread=K.unreadCount(r.key);
      return `<button type="button" class="cc-channel${r.key===activeKey?' cc-channel-active':''}" data-chat-channel="${esc(r.key)}"><span class="cc-channel-label">${esc(r.label)}</span><span class="cc-channel-sub">${esc(r.sub)}</span>${unread?`<span class="cc-channel-badge">${unread>9?'9+':unread}</span>`:''}</button>`;
    }).join('')||'<p class="cc-empty">No other coaches yet.</p>';
    host.querySelectorAll('[data-chat-channel]').forEach(btn=>{btn.onclick=()=>openChannel(btn.dataset.chatChannel);});
  }

  function renderThread(){
    const host=panelEl.querySelector('[data-chat-thread]');if(!host)return;
    const rows=channelList();
    const current=rows.find(r=>r.key===activeKey);
    host.innerHTML=`<header class="cc-thread-head"><button type="button" data-chat-back>‹ Channels</button><b>${esc(current?.label||'Chat')}</b></header><div class="cc-thread-messages" data-chat-messages></div><form class="cc-compose" data-chat-compose><input type="text" maxlength="4000" placeholder="Message…" data-chat-input autocomplete="off"><button type="submit">Send</button></form>`;
    host.querySelector('[data-chat-back]').onclick=()=>{activeKey=null;renderPanel();};
    host.querySelector('[data-chat-compose]').onsubmit=async e=>{
      e.preventDefault();
      const input=host.querySelector('[data-chat-input]'),body=text(input.value);if(!body)return;
      input.value='';input.disabled=true;
      try{await K.send(activeKey,body);}catch(err){M.toast?.(err.message||'Message was not sent.');}
      input.disabled=false;input.focus();
      paintMessages();
    };
    paintMessages();
    K.history(activeKey).then(()=>paintMessages()).catch(()=>{});
  }

  function paintMessages(){
    if(!panelEl||activeKey==null)return;
    const box=panelEl.querySelector('[data-chat-messages]');if(!box)return;
    const me=M.store.auth()?.user?.id;
    const msgs=K._snapshot(activeKey);
    const wasAtBottom=box.scrollTop+box.clientHeight>=box.scrollHeight-8;
    box.innerHTML=msgs.map(m=>`<div class="cc-msg${m.sender_id===me?' cc-msg-mine':''}">${m.sender_id!==me?`<div class="cc-msg-sender">${esc(m.sender_name||'Coach')}</div>`:''}<div class="cc-msg-body">${esc(m.body)}</div><div class="cc-msg-time">${esc(timeLabel(m.created_at))}</div></div>`).join('')||'<p class="cc-empty">No messages yet — say hello.</p>';
    if(wasAtBottom||msgs.length<=1)box.scrollTop=box.scrollHeight;
    K.markSeen(activeKey);
    renderChannelList();
    paintBadge();
  }

  function openChannel(key){activeKey=key;renderPanel();}

  function renderPanel(){
    if(!panelEl)return;
    const showingThread=activeKey!=null;
    panelEl.querySelector('[data-chat-channels-wrap]').hidden=showingThread;
    panelEl.querySelector('[data-chat-thread]').hidden=!showingThread;
    renderChannelList();
    if(showingThread)renderThread();
  }

  function openPanel(){
    if(!panelEl){
      const host=document.querySelector('#modalHost')||document.body;
      panelEl=document.createElement('div');panelEl.className='cc-backdrop';
      panelEl.innerHTML=`<section class="cc-panel"><header class="cc-panel-head"><b>Coach chat</b><button type="button" data-chat-close>Close</button></header><div data-chat-channels-wrap><div class="cc-status" data-chat-status></div><div data-chat-channels></div></div><div data-chat-thread hidden></div></section>`;
      host.appendChild(panelEl);
      panelEl.querySelector('[data-chat-close]').onclick=closePanel;
      panelEl.addEventListener('click',e=>{if(e.target===panelEl)closePanel();});
    }
    panelEl.hidden=false;
    activeKey=null;
    const statusEl=panelEl.querySelector('[data-chat-status]');
    if(statusEl){const s=K.realtimeStatus();statusEl.textContent=s==='realtime'?'':s==='polling-fallback'||s==='polling-only'?'Checking for new messages periodically.':'Connecting…';}
    renderPanel();
  }
  function closePanel(){if(panelEl)panelEl.hidden=true;}

  function paintBadge(){
    const btn=document.querySelector('[data-sticky-chat]');if(!btn)return;
    const n=K.totalUnread();btn.dataset.ccUnread=n?(n>9?'9+':String(n)):'';
  }

  function install(){
    const btn=document.querySelector('[data-sticky-chat]');if(!btn)return;
    btn.hidden=false;btn.title='Coach chat';
    const sticky=document.querySelector('.sticky-actions');
    if(sticky){const visible=[...sticky.querySelectorAll('button')].filter(b=>!b.hidden).length;sticky.style.gridTemplateColumns=`repeat(${visible},1fr)`;}
    btn.onclick=e=>{e.preventDefault();openPanel();};
    unsubscribe=K.onUpdate(key=>{if(panelEl&&!panelEl.hidden){if(key===activeKey)paintMessages();else renderChannelList();}paintBadge();});
    K.connect().then(()=>{paintBadge();if(panelEl&&!panelEl.hidden)renderPanel();}).catch(()=>{});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  U.install=install;U.openPanel=openPanel;U.closePanel=closePanel;U.paintBadge=paintBadge;
})(globalThis);
