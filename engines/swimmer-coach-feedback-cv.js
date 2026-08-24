'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const X=M.swimmerCoachFeedbackCV={build:'v4-swimmer-coach-feedback-20260824cv'};
  const esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'');
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  const session=()=>M.currentSession?.()||null;
  const fmt=a=>{const p=a?.payload||{},bits=[];if(a.action_type==='finish'){bits.push(p.completion,p.feeling,p.rpe?`RPE ${p.rpe}`:'',p.best?`Best: ${p.best}`:'',p.hardest?`Hardest: ${p.hardest}`:'',p.note||'');}else if(a.action_type==='challenge'){bits.push(p.reason,p.message);}else if(a.action_type==='edit_request'){bits.push(p.change,p.reason);}return bits.filter(Boolean).join(' · ');};
  async function load(){
    const a=selected(),s=session(),panel=document.querySelector('#athletesView [data-cn-panel]');if(!a||!s||!panel||M.state?.settings?.loopAthleteTab!=='training'||!M.swimmerInviteBN?.sessionActionsFor)return;
    let rows=[];try{rows=await M.swimmerInviteBN.sessionActionsFor(a,s.id)||[];}catch{return;}if(!Array.isArray(rows))rows=[];
    panel.querySelector('[data-cv-feedback]')?.remove();const box=document.createElement('section');box.dataset.cvFeedback='1';box.className='page-card cv-feedback';
    const pending=rows.filter(r=>!r.acknowledged_at),fin=rows.find(r=>r.action_type==='finish');
    box.innerHTML=`<div class="eyebrow">SWIMMER CHECK-IN</div><h2>${esc(a.preferred_name||a.full_name)}</h2>${!rows.length?'<p class="muted">No challenge, edit request or finish check-in from this session yet.</p>':`<p class="muted">${pending.length?`${pending.length} item${pending.length===1?'':'s'} waiting for you.`:'All swimmer feedback reviewed.'}</p>${rows.slice(0,12).map(r=>`<article class="cv-action ${r.acknowledged_at?'done':''}"><div><b>${r.action_type==='finish'?'Session finished':r.action_type==='challenge'?'Challenge':'Edit request'}</b><span>${esc(fmt(r)||'No extra comment')}</span></div>${r.acknowledged_at?'<small>Reviewed ✓</small>':`<button data-cv-ack="${esc(r.id)}">Mark reviewed</button>`}</article>`).join('')}`}${fin?'<p class="cv-logged">Finish check-in is logged with the coach record for this session.</p>':''}`;
    panel.prepend(box);
    box.querySelectorAll('[data-cv-ack]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Saving…';try{await M.swimmerInviteBN.acknowledgeSessionAction(b.dataset.cvAck);await load();}catch{b.disabled=false;b.textContent='Mark reviewed';}});
  }
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-cn-tab="training"]'))setTimeout(load,0);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&M.state?.settings?.view==='athletes'&&M.state?.settings?.loopAthleteTab==='training')setTimeout(load,0);});
  const style=document.createElement('style');style.textContent=`.cv-feedback{margin-bottom:8px}.cv-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border-top:1px solid #e4ecef;padding:8px 0}.cv-action>div{display:grid;gap:2px}.cv-action span{font-size:12px;color:#536b77}.cv-action button{white-space:nowrap}.cv-action.done{opacity:.7}.cv-logged{font-size:12px;font-weight:700;margin:8px 0 0}`;document.head.appendChild(style);
  X.load=load;
})(globalThis);
