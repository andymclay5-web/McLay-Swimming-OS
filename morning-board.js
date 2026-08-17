'use strict';
(function(){
  const E=globalThis.MSOSEngines?.SessionTruth;
  if(!E)throw new Error('Session Truth Engine did not load');
  const KEY='msos_morning_board_v1';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const source=$('#source'),board=$('#board'),status=$('#status'),composer=$('#composer'),editBtn=$('#editBtn'),parseBtn=$('#parseBtn'),clearBtn=$('#clearBtn');
  let current=null,timer=null;

  function metres(n){return `${Number(n||0).toLocaleString()}m`}
  function nodeMetres(n){return E.nodeDistance(n)}
  function stripPrefix(raw){return String(raw||'').replace(/^\s*\d{1,3}\s*[x×]\s*\d{1,4}(?:\.5)?\s*/i,'').trim()}
  function workText(item){
    const raw=String(item.raw||'').trim();
    if(raw)return raw.replace(/\s+x\s+/i,' × ');
    return `${item.reps} × ${item.distance}${item.stroke?` ${item.stroke}`:''}`;
  }
  function detailHtml(item){
    const rows=[];
    if(item.pattern?.length)rows.push(`<div class="detail pattern">↳ ${item.pattern.map(x=>`${esc(x.count)} ${esc(x.text)}`).join(' · ')}</div>`);
    if(item.composition?.length)rows.push(`<div class="detail pattern">↳ ${item.composition.map(x=>`${esc(x.distance)} ${esc(x.text)}`).join(' / ')}</div>`);
    if(item.cues?.length)for(const cue of item.cues)rows.push(`<div class="cue">${esc(cue)}</div>`);
    return rows.join('');
  }
  function renderNode(node){
    if(node.kind==='cue')return `<div class="standalone-cue">${esc(node.text||node.raw)}</div>`;
    if(node.kind==='group'){
      return `<div class="group"><div class="group-head"><strong>×${Number(node.rounds)||1} ROUNDS${node.label?` · ${esc(node.label)}`:''}</strong><span>${metres(nodeMetres(node))}</span></div>${(node.items||[]).map(renderNode).join('')}</div>`;
    }
    return `<div class="set-line"><div class="set-main"><div class="work">${esc(workText(node))}</div><div class="metres">${metres(nodeMetres(node))}</div></div>${detailHtml(node)}</div>`;
  }
  function render(session){
    const total=E.totalDistance(session),written=session.metadata?.writtenTotal,match=session.metadata?.totalMatches!==false;
    const verify=written==null
      ?`<div class="verify warn">Calculated ${metres(total)} · no written total supplied</div>`
      :match
        ?`<div class="verify">Calculated ${metres(total)} · written ${metres(written)} ✓</div>`
        :`<div class="verify bad">CALCULATED ${metres(total)} · WRITTEN ${metres(written)} — check before coaching</div>`;
    const notes=(session.metadata?.sessionNotes||[]).filter(Boolean);
    const notesHtml=notes.length?`<div class="session-notes">${notes.map(x=>esc(x)).join('<br>')}</div>`:'';
    const blocks=(session.blocks||[]).map(b=>`<section class="block"><div class="block-head"><h2>${esc(b.title)}</h2><strong>${metres(E.blockDistance(b))}</strong></div><div class="block-body">${(b.items||[]).map(renderNode).join('')}</div></section>`).join('');
    board.innerHTML=`<section class="summary"><div><small>COMPACT COACH BOARD</small><h1>Morning Session</h1></div><div class="total">${metres(total)}</div></section>${verify}${notesHtml}${blocks||'<div class="empty">No runnable blocks found yet.</div>'}<div class="engine-note">Session Truth Engine ${esc(E.VERSION)} · Board display only</div>`;
    board.classList.remove('hidden');
  }
  function saveDraft(){
    try{localStorage.setItem(KEY,JSON.stringify({text:source.value,updatedAt:new Date().toISOString()}))}catch{}
  }
  function parse({focusBoard=false}={}){
    saveDraft();
    const raw=source.value;
    if(!raw.trim()){
      current=null;board.classList.add('hidden');status.className='status';status.textContent='Paste or type a session. Draft saves on this device.';return;
    }
    try{
      current=E.parse(raw,{id:'morning-board',title:'Morning Session'});
      const validation=E.validate(current),total=E.totalDistance(current);
      render(current);
      if(total<=0){status.className='status bad';status.textContent='No runnable distance found yet.';return}
      if(!validation.ok){status.className='status bad';status.textContent=`Parsed, but check this before coaching: ${validation.errors.join(' · ')}`}
      else{status.className='status good';status.textContent=`Board ready · ${metres(total)} · draft saved locally`}
      if(focusBoard){composer.classList.add('hidden');editBtn.classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}
    }catch(err){
      current=null;status.className='status bad';status.textContent=`Could not parse: ${err.message||err}`;
    }
  }
  function restore(){
    try{const d=JSON.parse(localStorage.getItem(KEY)||'null');if(d?.text){source.value=d.text;parse();status.textContent=`Draft restored · ${status.textContent}`}}catch{}
  }
  source.addEventListener('input',()=>{saveDraft();clearTimeout(timer);timer=setTimeout(()=>parse(),250)});
  parseBtn.addEventListener('click',()=>parse({focusBoard:true}));
  editBtn.addEventListener('click',()=>{composer.classList.remove('hidden');editBtn.classList.add('hidden');setTimeout(()=>source.focus(),0)});
  clearBtn.addEventListener('click',()=>{if(!confirm('Clear the saved morning-board draft?'))return;source.value='';try{localStorage.removeItem(KEY)}catch{};current=null;board.innerHTML='';board.classList.add('hidden');status.className='status';status.textContent='Draft cleared.';source.focus()});
  restore();
})();