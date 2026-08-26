'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const X=M.swimmerFeedbackCU={build:'v4-swimmer-feedback-20260826a'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim(),esc=v=>M.util?.escape?M.util.escape(String(v??'')):String(v??'');
  const selected=()=>{const id=M.state?.settings?.selectedAthleteId;return(M.state?.athletes||[]).find(a=>a.id===id)||null;};
  const currentSessionId=()=>String(M.currentSession?.()?.id||'');
  function label(a){if(a.action_type==='finish')return'Session finish';if(a.action_type==='challenge')return'Challenge';return'Edit request';}
  function detail(a){const p=a.payload||{};if(a.action_type==='finish')return [p.completion,p.feeling,p.rpe?`RPE ${p.rpe}`:'',p.best?`Best: ${p.best}`:'',p.hardest?`Hardest: ${p.hardest}`:'',p.note].filter(Boolean).join(' · ');if(a.action_type==='challenge')return[p.reason,p.message].filter(Boolean).join(' · ');return[p.change,p.reason].filter(Boolean).join(' · ');}
  function annotatePerformance(){
    const root=document.querySelector('#athletesView');if(!root)return;
    root.querySelectorAll('.cn-event>summary').forEach(summary=>{
      const pb=summary.querySelector('strong');if(pb&&!/^PB\b/i.test(text(pb.textContent)))pb.textContent=`PB ${text(pb.textContent)}`;
      const next=summary.querySelector('[data-cn-next]');if(next&&!/pathway/i.test(text(next.textContent)))next.textContent=`Pathway · ${text(next.textContent)||'next step'}`;
    });
  }
  async function render(){
    const ath=selected(),panel=document.querySelector('#athletesView [data-cn-panel]');if(!ath||!panel||M.state?.settings?.loopAthleteTab!=='training')return;
    panel.querySelector('[data-cu-feedback]')?.remove();
    const box=document.createElement('section');box.className='page-card';box.dataset.cuFeedback='1';box.innerHTML='<div class="eyebrow">SWIMMER FEEDBACK</div><h2>Session check-in</h2><p class="muted">Loading swimmer edits, challenges and finish log…</p>';panel.append(box);
    const rows=await M.swimmerInviteBN?.sessionActionsFor?.(ath,currentSessionId())||[];if(!box.isConnected)return;
    if(!rows.length){box.innerHTML='<div class="eyebrow">SWIMMER FEEDBACK</div><h2>Session check-in</h2><p class="muted">No swimmer edits, challenges or finish log yet.</p>';return;}
    box.innerHTML=`<div class="eyebrow">SWIMMER FEEDBACK</div><h2>${esc(ath.full_name)} · session check-in</h2>${rows.map(a=>`<article class="cu-feedback-row"><div><b>${esc(label(a))}</b><span>${esc(detail(a)||'No note')}</span><small>${esc(String(a.created_at||'').replace('T',' ').slice(0,16))}${a.acknowledged_at?' · reviewed':''}</small></div>${a.acknowledged_at?'':`<button data-cu-ack="${esc(a.id)}">Mark reviewed</button>`}</article>`).join('')}`;
    box.querySelectorAll('[data-cu-ack]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await M.swimmerInviteBN?.acknowledgeSessionAction?.(b.dataset.cuAck);await render();}catch{b.disabled=false;}});
  }
  function install(){
    const athleteRoot=document.querySelector('#athletesView');
    athleteRoot?.addEventListener('click',e=>{if(e.target.closest?.('[data-cn-tab="training"]'))setTimeout(render,0);});
    if(athleteRoot){const observer=new MutationObserver(annotatePerformance);observer.observe(athleteRoot,{subtree:true,childList:true,characterData:true});annotatePerformance();}
    if(M.state?.settings?.view==='athletes'&&M.state?.settings?.loopAthleteTab==='training')setTimeout(render,0);
    const s=document.createElement('style');s.textContent='.cu-feedback-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 0;border-top:1px solid #e4edf1;align-items:center}.cu-feedback-row>div{display:grid;gap:2px}.cu-feedback-row span{font-size:12px}.cu-feedback-row small{font-size:10px;color:#647a86}.cu-feedback-row button{font-size:11px}';document.head.append(s);
  }
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
  X.render=render;X.annotatePerformance=annotatePerformance;
})(globalThis);
