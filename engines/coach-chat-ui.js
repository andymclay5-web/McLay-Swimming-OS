'use strict';
// 2 Oct 2026 (Andy, verbatim): "a chat thing within the app where we can communicate to the whole group.
// The assistant coaches communicate to each other or me." See engines/coach-chat.js for the data/realtime
// layer this renders. index.html only ever serves the coach app (swimmers get the separate
// swimmer-portal.html), so the sticky-actions bar this adds a button to is already coach-only -- no extra
// role gate needed, matching how Capture/Voice/Edit/Finish work today.
(function(g){
  const M=g.MSOS4,K=M?.coachChat;if(!M?.state||!K)return;
  const BUILD='v4-coach-chat-20261004-extensions',U=M.coachChatUI={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeLabel=iso=>{try{return new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}catch{return'';}};
  // Same capture_type -> label convention engines/reporting-ui.js and engines/coach-loop-ui.js already use
  // (video/photo/voice/note) -- kept in sync here rather than inventing a fourth copy of this mapping.
  const CAPTURE_ICON={video:'▶',photo:'▣',voice:'♪',note:'✎'};
  function captureLabel(c){const t=String(c?.capture_type||'note').toLowerCase();const name=text(c?.text_content||c?.title);return `${CAPTURE_ICON[t]||'✎'} ${name||(t==='note'?'Note':t.charAt(0).toUpperCase()+t.slice(1))}`;}

  let panelEl=null,activeKey=K.GROUP_KEY,unsubscribe=null,pendingCaptureId=null;

  function channelList(){
    const roster=K.roster();
    const rows=[
      {key:K.GROUP_KEY,label:'Whole group',sub:'Everyone on the team'},
      {key:K.COACHES_KEY,label:'Coaches only',sub:'Just the coaching team'},
    ].concat(roster.map(r=>({key:K.dmThreadKey(r.user_id),label:r.display_name,sub:r.role==='owner'?'Owner':'Assistant coach'})));
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
    pendingCaptureId=null;
    host.innerHTML=`<header class="cc-thread-head"><button type="button" data-chat-back>‹ Channels</button><b>${esc(current?.label||'Chat')}</b></header><div class="cc-thread-messages" data-chat-messages></div><div class="cc-attach-chip" data-chat-attach-chip hidden></div><form class="cc-compose" data-chat-compose><button type="button" class="cc-attach-btn" data-chat-attach title="Attach a capture">📎</button><input type="text" maxlength="4000" placeholder="Message…" data-chat-input autocomplete="off"><button type="submit">Send</button></form>`;
    host.querySelector('[data-chat-back]').onclick=()=>{activeKey=null;renderPanel();};
    host.querySelector('[data-chat-attach]').onclick=()=>openAttachPicker(host);
    renderAttachChip(host);
    host.querySelector('[data-chat-compose]').onsubmit=async e=>{
      e.preventDefault();
      const input=host.querySelector('[data-chat-input]'),body=text(input.value);if(!body)return;
      input.value='';input.disabled=true;
      const captureId=pendingCaptureId;
      try{await K.send(activeKey,body,{captureId});pendingCaptureId=null;renderAttachChip(host);}
      catch(err){M.toast?.(err.message||'Message was not sent.');}
      input.disabled=false;input.focus();
      paintMessages();
    };
    paintMessages();
    K.history(activeKey).then(()=>paintMessages()).catch(()=>{});
  }

  // Andy, 2 Oct 2026 (verbatim): "you also need to be able to add captures to that so like add a video" --
  // the concrete scenario is a home-based coach asking a club coach "what do you see?" about a swimmer's
  // technique, attaching the video right there rather than switching apps. Reuses the SAME capture pipeline
  // the rest of the app already has (M.state.captures, synced locally via capture-ui.js's own pull), so no
  // new storage/table is needed beyond the capture_id column the 2026-10-03 migration added.
  function openAttachPicker(host){
    const wrap=host.querySelector('[data-chat-attach-picker]');
    if(wrap){wrap.remove();return;} // tap-to-toggle, same as closing any other inline popover in this app
    const caps=[...(M.state?.captures||[])].reverse().slice(0,25);
    const pop=document.createElement('div');
    pop.className='cc-attach-picker';pop.setAttribute('data-chat-attach-picker','1');
    pop.innerHTML=caps.length
      ?caps.map(c=>`<button type="button" class="cc-attach-option" data-chat-attach-pick="${esc(c.id)}">${esc(captureLabel(c))}</button>`).join('')
      :'<p class="cc-empty">No captures yet on this device.</p>';
    pop.querySelectorAll('[data-chat-attach-pick]').forEach(btn=>{
      btn.onclick=()=>{pendingCaptureId=btn.dataset.chatAttachPick;pop.remove();renderAttachChip(host);};
    });
    host.querySelector('[data-chat-compose]').insertAdjacentElement('beforebegin',pop);
  }

  function renderAttachChip(host){
    const chip=host.querySelector('[data-chat-attach-chip]');if(!chip)return;
    if(!pendingCaptureId){chip.hidden=true;chip.innerHTML='';return;}
    const cap=(M.state?.captures||[]).find(c=>c.id===pendingCaptureId);
    chip.hidden=false;
    chip.innerHTML=`<span>${esc(cap?captureLabel(cap):'Attachment')}</span><button type="button" data-chat-attach-clear title="Remove attachment">✕</button>`;
    chip.querySelector('[data-chat-attach-clear]').onclick=()=>{pendingCaptureId=null;renderAttachChip(host);};
  }

  function paintMessages(){
    if(!panelEl||activeKey==null)return;
    const box=panelEl.querySelector('[data-chat-messages]');if(!box)return;
    const me=M.store.auth()?.user?.id;
    const msgs=K._snapshot(activeKey);
    const wasAtBottom=box.scrollTop+box.clientHeight>=box.scrollHeight-8;
    box.innerHTML=msgs.map(m=>{
      const cap=m.capture_id?(M.state?.captures||[]).find(c=>c.id===m.capture_id):null;
      // The capture might not be synced to THIS device yet (captures sync per-device, same as everywhere
      // else in the app) -- still show a tappable line so the recipient knows one was sent, falling back to
      // a plain label rather than hiding the attachment just because the local metadata hasn't arrived.
      const attach=m.capture_id?`<button type="button" class="cc-msg-attach" data-msos-capture="${esc(m.capture_id)}">${esc(cap?captureLabel(cap):'📎 Attachment')}</button>`:'';
      return `<div class="cc-msg${m.sender_id===me?' cc-msg-mine':''}">${m.sender_id!==me?`<div class="cc-msg-sender">${esc(m.sender_name||'Coach')}</div>`:''}<div class="cc-msg-body">${esc(m.body)}</div>${attach}<div class="cc-msg-time">${esc(timeLabel(m.created_at))}</div></div>`;
    }).join('')||'<p class="cc-empty">No messages yet — say hello.</p>';
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
