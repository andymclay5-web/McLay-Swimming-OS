'use strict';
// Set library screen (19 Oct 2026). Andy: review the sets "in a sheet or an editable form" -- yes or no, and see who
// wrote each one. A projection of engines/set-library.js: Waiting / Kept / Dropped / All, by part of the session and by
// author, with a search. The head coach keeps (✓), drops (✗) or edits a set; any coach can add one (it waits for him).
// Opened from Input data and from the session writer's suggestions.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const UI=M.setLibraryUI={build:'v4-set-library-ui-20261019'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SL=()=>M.setLibrary;const owner=()=>(M.access?.role?.()||'owner')==='owner';
  const SECTIONS=['WARM UP','PRE SET','MAIN SET','POST SET','WARM DOWN'],SEC_LABEL={'WARM UP':'Warm-up','PRE SET':'Pre-set','MAIN SET':'Main','POST SET':'Post-set','WARM DOWN':'Warm-down'};
  const TABS=[['waiting','Waiting'],['approved','Kept'],['rejected','Dropped'],['all','All']];
  let st={tab:'waiting',section:'',author:'',q:'',show:40,editing:'',adding:false,msg:''};
  UI.state=()=>({...st});
  function rows(){const all=SL()?.all?.()||[];const q=st.q.toLowerCase();
    return all.filter(x=>(st.tab==='all'||(st.tab==='waiting'?(x.status==='proposed'||x.status==='check'):x.status===st.tab))&&(!st.section||x.section===st.section)&&(!st.author||x.author===st.author)&&(!q||`${x.label} ${x.text} ${x.author}`.toLowerCase().includes(q)));}
  function chip(a){return`<span class="sl-author sl-a-${esc(String(a||'').toLowerCase())}">${esc(a||'?')}</span>`;}
  UI.chip=chip;
  function rowHtml(x){const can=owner(),ed=st.editing===x.id;const status={approved:'Kept',rejected:'Dropped',proposed:'Waiting for review',check:'Needs a look'}[x.status]||x.status;
    return`<article class="sl-row sl-${esc(x.status)}" data-sl-row="${esc(x.id)}"><header>${chip(x.author)}<b>${esc(x.label)}</b><small>${esc(SEC_LABEL[x.section]||x.section)} · ${esc(status)}${x.reviewedBy?` · ${esc(x.reviewedBy)}`:''}</small></header>
      ${x.issues?.length?`<p class="sl-issue">⚠ ${esc(x.issues.join(' · '))}</p>`:''}
      ${ed?`<label class="id-free">Name<input data-sl-label value="${esc(x.label)}"></label><textarea data-sl-text rows="${Math.min(10,x.text.split('\n').length+1)}">${esc(x.text)}</textarea>`:`<pre class="sl-text">${esc(x.text)}</pre>`}
      ${x.use?`<small class="sl-use">${esc(x.use)}</small>`:''}
      ${can?`<div class="sl-acts">${ed?`<button type="button" data-sl-save="${esc(x.id)}">Save & keep</button><button type="button" data-sl-cancel>Cancel</button>`:`<button type="button" class="sl-yes" data-sl-do="approved" data-sl-id="${esc(x.id)}" ${x.status==='approved'?'disabled':''}>✓ Keep</button><button type="button" class="sl-no" data-sl-do="rejected" data-sl-id="${esc(x.id)}" ${x.status==='rejected'?'disabled':''}>✗ Drop</button><button type="button" data-sl-edit="${esc(x.id)}">Edit</button>`}</div>`:''}</article>`;}
  function html(){const lib=SL();if(!lib)return'<p class="muted">The set library is not loaded.</p>';const c=lib.counts(),list=rows(),authors=[...new Set(lib.all().map(x=>x.author).filter(Boolean))].sort();
    const waitingN=(c.proposed||0)+(c.check||0);
    return`<p class="muted">${c.total} sets · ${c.approved} kept · ${waitingN} waiting${owner()?' for you':' for the head coach'}. Every set shows who wrote it. Only kept sets are offered when writing a session (plus at most one new one to try, marked).</p>
      <nav class="sl-tabs">${TABS.map(([k,l])=>`<button type="button" data-sl-tab="${k}" class="${st.tab===k?'on':''}">${esc(l)}${k==='waiting'?` (${waitingN})`:k==='approved'?` (${c.approved})`:k==='rejected'?` (${c.rejected||0})`:''}</button>`).join('')}</nav>
      <div class="sl-filters"><select data-sl-section><option value="">Every part</option>${SECTIONS.map(s=>`<option value="${esc(s)}" ${st.section===s?'selected':''}>${esc(SEC_LABEL[s])}</option>`).join('')}</select><select data-sl-author><option value="">Everyone</option>${authors.map(a=>`<option ${st.author===a?'selected':''}>${esc(a)}</option>`).join('')}</select><input type="search" data-sl-q placeholder="Search" value="${esc(st.q)}"></div>
      <details class="sl-add" ${st.adding?'open':''}><summary>＋ Add a set</summary><select data-sl-new-section>${SECTIONS.map(s=>`<option value="${esc(s)}" ${s==='MAIN SET'?'selected':''}>${esc(SEC_LABEL[s])}</option>`).join('')}</select><input data-sl-new-label placeholder="Name (optional)"><textarea data-sl-new-text rows="4" placeholder="Write it the way you'd write it in a session"></textarea><button type="button" data-sl-add>Add</button></details>
      ${st.msg?`<p class="muted" data-sl-msg>${esc(st.msg)}</p>`:''}
      <div class="sl-list">${list.length?list.slice(0,st.show).map(rowHtml).join(''):'<p class="muted">Nothing here.</p>'}</div>${list.length>st.show?`<div class="hub-actions"><button type="button" data-sl-more>Show more (${list.length-st.show})</button></div>`:''}`;}
  function paint(){const host=document.querySelector('#modalHost [data-sl-body]');if(!host)return;const y=host.closest('.modal')?.scrollTop||0;host.innerHTML=html();bind(host);const m=host.closest('.modal');if(m)m.scrollTop=y;}
  function bind(host){const set=(k,v)=>{st={...st,[k]:v,show:k==='show'?v:40};paint();};
    host.querySelectorAll('[data-sl-tab]').forEach(b=>b.onclick=()=>set('tab',b.dataset.slTab));
    host.querySelector('[data-sl-section]')?.addEventListener('change',e=>set('section',e.target.value));
    host.querySelector('[data-sl-author]')?.addEventListener('change',e=>set('author',e.target.value));
    const q=host.querySelector('[data-sl-q]');if(q){q.oninput=()=>{st.q=q.value;clearTimeout(UI._qt);UI._qt=setTimeout(paint,250);};}
    host.querySelector('[data-sl-more]')?.addEventListener('click',()=>{st.show+=40;paint();});
    host.querySelectorAll('[data-sl-do]').forEach(b=>b.onclick=()=>{try{SL().review(b.dataset.slId,b.dataset.slDo);st.msg='';}catch(e){st.msg=e.message;}paint();});
    host.querySelectorAll('[data-sl-edit]').forEach(b=>b.onclick=()=>{st.editing=b.dataset.slEdit;paint();});
    host.querySelector('[data-sl-cancel]')?.addEventListener('click',()=>{st.editing='';paint();});
    host.querySelector('[data-sl-save]')?.addEventListener('click',e=>{const row=e.currentTarget.closest('[data-sl-row]');try{SL().review(e.currentTarget.dataset.slSave,'approved',{text:row.querySelector('[data-sl-text]').value,label:row.querySelector('[data-sl-label]').value});st.editing='';st.msg='Saved and kept.';}catch(err){st.msg=err.message;}paint();});
    host.querySelector('[data-sl-add]')?.addEventListener('click',()=>{try{const x=SL().add({section:host.querySelector('[data-sl-new-section]').value,text:host.querySelector('[data-sl-new-text]').value,label:host.querySelector('[data-sl-new-label]').value});st.adding=false;st.msg=x.status==='approved'?'Added to your kept sets.':'Added — it waits for the head coach.';}catch(e){st.adding=true;st.msg=e.message;}paint();});}
  UI.open=(opts={})=>{const host=document.querySelector('#modalHost');if(!host)return;st={...st,...opts,editing:'',msg:''};
    host.innerHTML=`<div class="modal-backdrop" data-sl-modal><section class="modal wide sl-modal"><header><h2>Set library</h2><button type="button" data-sl-close>×</button></header><div class="modal-body" data-sl-body></div><footer><button type="button" data-sl-close>Done</button></footer></section></div>`;
    try{M.nav?.openLayer?.('modal');}catch{}
    host.querySelectorAll('[data-sl-close]').forEach(b=>b.onclick=()=>{host.innerHTML='';try{M.nav?.clearTransient?.();}catch{}try{M.ui?.renderCurrent?.();}catch{}});
    paint();if(Date.now()-(M.state.setLibrary?.pulledAt||0)>30000)SL()?.pull?.().then(n=>{if(n)paint();}).catch(()=>{});};
  UI.card=()=>{const lib=SL();if(!lib)return'';const c=lib.counts(),w=(c.proposed||0)+(c.check||0);return`<section class="page-card sl-card"><h3>Set library</h3><p class="muted">${c.total} sets from Andy, Jordan, Kaleb, Claude and the earlier library — ${w} waiting${owner()?' for your yes or no':''}.</p><div class="hub-actions"><button type="button" data-sl-open>Open the set library</button></div></section>`;};
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-sl-open]');if(b){e.preventDefault();UI.open({tab:b.dataset.slTab||'waiting'});}});
})(globalThis);
