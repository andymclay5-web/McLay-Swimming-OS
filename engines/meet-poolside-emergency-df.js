'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  let selected='';let queued=false;let obs=null;
  const races=()=>Array.isArray(M.state?.meetFieldDeck?.races)?M.state.meetFieldDeck.races.filter(r=>!r.relay&&r.athlete_id):[];
  const key=r=>[r.event_number||0,r.heat||0,r.lane||0,r.athlete_id||r.athlete_name||''].join('|');
  const athlete=r=>(M.state?.athletes||[]).find(a=>a.id===r.athlete_id)||null;
  const name=r=>txt(athlete(r)?.preferred_name||athlete(r)?.nickname||athlete(r)?.full_name||r.athlete_name||r.source_name||'Swimmer');
  const seed=r=>txt(r.seed_time)||(Number.isFinite(Number(r.seed_seconds))?format(Number(r.seed_seconds)):'NT');
  function format(s){if(!Number.isFinite(s))return'—';const m=Math.floor(s/60),x=(s-m*60).toFixed(2).padStart(5,'0');return m?`${m}:${x}`:x}
  function programme(){return document.querySelector('#meetView [data-meet-program-ba]')}
  function currentRace(){const rs=races();return rs.find(r=>key(r)===selected)||rs[0]||null}
  function openCapture(r,video=false){if(!r)return;M.meetOpsEngine?.openCapture?.(r);if(video)requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-video]')?.click())}
  function cardHtml(r){if(!r)return'';return`<section class="df-card"><div class="df-card-head"><div><b>${esc(name(r))}</b><small>E${r.event_number||'—'} · ${esc(txt(r.event)||`${r.distance||''} ${r.stroke||''}`)}</small></div><button data-df-close>×</button></div><div class="df-kpis"><span><small>ENTRY</small><b>${esc(seed(r))}</b></span><span><small>HEAT</small><b>${r.heat||'—'}</b></span><span><small>LANE</small><b>${r.lane||'—'}</b></span><span><small>START</small><b>${esc(txt(r.start_time)||'—')}</b></span></div><div class="df-actions"><button data-df-voice="${esc(key(r))}">Voice note</button><button data-df-video="${esc(key(r))}">Video</button><button data-df-capture="${esc(key(r))}">Capture</button></div></section>`}
  function render(){queued=false;if(M.state?.settings?.view!=='meet')return;const p=programme();if(!p)return;const rs=races();if(!rs.length)return;p.querySelector('[data-df-emergency]')?.remove();if(selected&&!rs.some(r=>key(r)===selected))selected='';const box=document.createElement('section');box.dataset.dfEmergency='1';box.className='df-shell';box.innerHTML=`<div class="df-label"><b>AQUAGYM ENTRIES</b><small>Swipe · tap race</small></div><div class="df-strip">${rs.map(r=>`<button data-df-race="${esc(key(r))}" class="${selected===key(r)?'active':''}"><b>${esc(name(r).split(' ')[0])}</b><span>E${r.event_number||'—'} · H${r.heat||'—'} L${r.lane||'—'}</span><strong>${esc(seed(r))}</strong></button>`).join('')}</div>${selected?cardHtml(currentRace()):''}`;
    const sticky=p.querySelector('.ba-sticky');if(sticky)sticky.appendChild(box);else p.prepend(box);
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(render)}
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-df-race]');if(b){e.preventDefault();e.stopPropagation();selected=b.dataset.dfRace;render();return}
    if(e.target.closest?.('[data-df-close]')){e.preventDefault();selected='';render();return}
    for(const [sel,video] of [['[data-df-video]',true],['[data-df-capture]',false],['[data-df-voice]',false]]){const x=e.target.closest?.(sel);if(!x)continue;e.preventDefault();e.stopPropagation();const r=races().find(q=>key(q)===(x.dataset.dfVideo||x.dataset.dfCapture||x.dataset.dfVoice));if(sel==='[data-df-voice]'){openCapture(r,false);requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-voice]')?.click())}else openCapture(r,video);return}
  },true);
  function style(){if(document.getElementById('df-meet-emergency-style'))return;const s=document.createElement('style');s.id='df-meet-emergency-style';s.textContent=`.df-shell{margin-top:.45rem;border-top:2px solid currentColor;padding-top:.35rem}.df-label{display:flex;justify-content:space-between;align-items:center}.df-label small{font-size:.72rem}.df-strip{display:flex!important;gap:.4rem!important;overflow-x:auto!important;overflow-y:hidden!important;max-width:100%!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;padding:.4rem 0 .55rem!important;scrollbar-width:thin}.df-strip>button{flex:0 0 112px!important;min-width:112px!important;display:grid!important;gap:.05rem!important;text-align:left!important;padding:.45rem!important;border-radius:10px!important}.df-strip>button span{font-size:.68rem;white-space:nowrap}.df-strip>button strong{font-size:1rem}.df-strip>button.active{outline:3px solid currentColor}.df-card{border:2px solid currentColor;border-radius:12px;padding:.55rem;background:var(--surface,#fff);display:grid;gap:.45rem}.df-card-head{display:flex;justify-content:space-between}.df-card-head>div{display:grid}.df-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem}.df-kpis span{display:grid;border:1px solid rgba(13,69,102,.18);border-radius:8px;padding:.35rem}.df-kpis small{font-size:.62rem}.df-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem}.df-actions button{min-height:48px;font-weight:800}@media(max-width:620px){.ba-pills{overflow-x:auto!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch}.df-kpis{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(s)}
  function install(){style();queue();const h=document.querySelector('#meetView');if(h&&!obs){obs=new MutationObserver(queue);obs.observe(h,{childList:true,subtree:false})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue()});
  M.meetEmergencyDF={render,build:'v4-meet-emergency-20260828df1'};
})(globalThis);
