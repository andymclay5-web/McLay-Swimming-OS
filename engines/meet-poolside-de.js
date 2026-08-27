'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const BUILD='v4-meet-poolside-emergency-20260828df2';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  let selected='',queued=false,observer=null;
  const deck=()=>M.state?.meetFieldDeck||null;
  const races=()=>Array.isArray(deck()?.races)?deck().races.filter(r=>!r.relay&&(r.athlete_id||r.athlete_name)):[];
  const key=r=>[r.event_number||0,r.heat||0,r.lane||0,r.athlete_id||r.athlete_name||''].join('|');
  const athlete=r=>(M.state?.athletes||[]).find(a=>a.id===r.athlete_id)||null;
  const name=r=>txt(athlete(r)?.preferred_name||athlete(r)?.nickname||athlete(r)?.full_name||r.athlete_name||r.source_name||'Swimmer');
  function format(s){s=Number(s);if(!Number.isFinite(s))return'—';const m=Math.floor(s/60),x=(s-m*60).toFixed(2).padStart(5,'0');return m?`${m}:${x}`:x}
  const seed=r=>txt(r.seed_time)||(Number.isFinite(Number(r.seed_seconds))?format(r.seed_seconds):'NT');
  const programme=()=>document.querySelector('#meetView [data-meet-program-ba]');
  function raceByKey(k){return races().find(r=>key(r)===k)||null}
  function selectedRace(){return raceByKey(selected)||null}
  function openCapture(r,mode='capture'){
    if(!r)return;
    try{M.meetOpsEngine?.openCapture?.(r)}catch{}
    if(mode==='video')requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-video]')?.click());
    if(mode==='voice')requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-voice]')?.click());
  }
  function card(r){if(!r)return'';return`<section class="df-card"><div class="df-card-head"><div><b>${esc(name(r))}</b><small>E${r.event_number||'—'} · ${esc(txt(r.event)||`${r.distance||''} ${r.stroke||''}`)}</small></div><button data-df-close>×</button></div><div class="df-kpis"><span><small>ENTRY</small><b>${esc(seed(r))}</b></span><span><small>HEAT</small><b>${r.heat||'—'}</b></span><span><small>LANE</small><b>${r.lane||'—'}</b></span><span><small>START</small><b>${esc(txt(r.start_time)||'—')}</b></span></div><div class="df-actions"><button data-df-voice="${esc(key(r))}">Voice note</button><button data-df-video="${esc(key(r))}">Video</button><button data-df-capture="${esc(key(r))}">Capture</button></div></section>`}
  function render(){
    queued=false;if(M.state?.settings?.view!=='meet')return;
    const p=programme();if(!p)return;
    const rs=races();if(!rs.length)return;
    p.querySelector('[data-df-emergency]')?.remove();
    if(selected&&!raceByKey(selected))selected='';
    const box=document.createElement('section');box.dataset.dfEmergency='1';box.className='df-shell';
    box.innerHTML=`<div class="df-label"><b>AQUAGYM ENTRIES</b><small>Swipe · tap race</small></div><div class="df-strip">${rs.map(r=>`<button data-df-race="${esc(key(r))}" class="${selected===key(r)?'active':''}"><b>${esc(name(r).split(' ')[0])}</b><span>E${r.event_number||'—'} · H${r.heat||'—'} L${r.lane||'—'}</span><strong>${esc(seed(r))}</strong></button>`).join('')}</div>${selected?card(selectedRace()):''}`;
    const sticky=p.querySelector('.ba-sticky');if(sticky)sticky.appendChild(box);else p.prepend(box);
    const workspace=document.querySelector('#meetView [data-meet-workspace-cy]'),meet=document.querySelector('#meetView');if(workspace&&meet&&meet.firstElementChild!==workspace)meet.insertBefore(workspace,meet.firstElementChild);
    document.body.classList.add('df-programme-live');
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(render)}
  document.addEventListener('click',e=>{
    const raceBtn=e.target.closest?.('[data-df-race]');if(raceBtn){e.preventDefault();e.stopPropagation();selected=raceBtn.dataset.dfRace;render();return}
    if(e.target.closest?.('[data-df-close]')){e.preventDefault();e.stopPropagation();selected='';render();return}
    const v=e.target.closest?.('[data-df-video]');if(v){e.preventDefault();e.stopPropagation();openCapture(raceByKey(v.dataset.dfVideo),'video');return}
    const c=e.target.closest?.('[data-df-capture]');if(c){e.preventDefault();e.stopPropagation();openCapture(raceByKey(c.dataset.dfCapture),'capture');return}
    const q=e.target.closest?.('[data-df-voice]');if(q){e.preventDefault();e.stopPropagation();openCapture(raceByKey(q.dataset.dfVoice),'voice');return}
  },true);
  function style(){
    if(document.getElementById('df-meet-emergency-style'))return;
    const s=document.createElement('style');s.id='df-meet-emergency-style';s.textContent=`
      #meetView>[data-meet-workspace-cy]{position:sticky;top:0;z-index:90;background:var(--surface,#fff);margin:0 0 .35rem;box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .df-shell{margin-top:.4rem;border-top:2px solid currentColor;padding-top:.3rem}.df-label{display:flex;justify-content:space-between;align-items:center}.df-label small{font-size:.72rem}
      .df-strip{display:flex!important;gap:.4rem!important;overflow-x:scroll!important;overflow-y:hidden!important;width:100%!important;max-width:100vw!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain;padding:.4rem 0 .55rem!important;scrollbar-width:thin}
      .df-strip>button{flex:0 0 118px!important;min-width:118px!important;display:grid!important;gap:.04rem!important;text-align:left!important;padding:.45rem!important;border-radius:10px!important;touch-action:manipulation}.df-strip>button span{font-size:.67rem;white-space:nowrap}.df-strip>button strong{font-size:1.05rem}.df-strip>button.active{outline:3px solid currentColor}
      .df-card{border:2px solid currentColor;border-radius:12px;padding:.55rem;background:var(--surface,#fff);display:grid;gap:.45rem}.df-card-head{display:flex;justify-content:space-between}.df-card-head>div{display:grid}.df-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem}.df-kpis span{display:grid;border:1px solid rgba(13,69,102,.18);border-radius:8px;padding:.35rem}.df-kpis small{font-size:.62rem}.df-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem}.df-actions button{min-height:48px;font-weight:800}
      body.df-programme-live #meetView [data-meet-ops-av],body.df-programme-live #meetView [data-meet-board-ay],body.df-programme-live #meetView [data-meet-board-az],body.df-programme-live #meetView [data-meet-field-deck-au]{display:none!important}
      @media(max-width:620px){.ba-pills{display:flex!important;overflow-x:scroll!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch!important}.ba-pills>button{flex:0 0 auto!important}.df-kpis{grid-template-columns:repeat(2,1fr)}}`;
    document.head.appendChild(s)
  }
  function install(){style();queue();const h=document.querySelector('#meetView');if(h&&!observer){observer=new MutationObserver(queue);observer.observe(h,{childList:true,subtree:false})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue()});
  M.meetPoolsideRepair={build:BUILD,renderEmergency:render};
})(globalThis);
