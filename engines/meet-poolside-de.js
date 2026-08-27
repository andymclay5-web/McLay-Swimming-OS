'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const BUILD='v4-meet-poolside-emergency-20260828df3-heat-groups';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  let selectedHeat='',queued=false,observer=null;
  const deck=()=>M.state?.meetFieldDeck||null;
  const races=()=>Array.isArray(deck()?.races)?deck().races.filter(r=>!r.relay&&(r.athlete_id||r.athlete_name)):[];
  const raceKey=r=>[r.event_number||0,r.heat||0,r.lane||0,r.athlete_id||r.athlete_name||''].join('|');
  const heatKey=r=>[r.event_number||0,r.heat||0,txt(r.start_time)||''].join('|');
  const athlete=r=>(M.state?.athletes||[]).find(a=>a.id===r.athlete_id)||null;
  const name=r=>txt(athlete(r)?.preferred_name||athlete(r)?.nickname||athlete(r)?.full_name||r.athlete_name||r.source_name||'Swimmer');
  function format(s){s=Number(s);if(!Number.isFinite(s))return'—';const m=Math.floor(s/60),x=(s-m*60).toFixed(2).padStart(5,'0');return m?`${m}:${x}`:x}
  const seed=r=>txt(r.seed_time)||(Number.isFinite(Number(r.seed_seconds))?format(r.seed_seconds):'NT');
  const programme=()=>document.querySelector('#meetView [data-meet-program-ba]');
  function raceByKey(k){return races().find(r=>raceKey(r)===k)||null}
  function heatGroups(){
    const map=new Map();
    for(const r of races().sort((a,b)=>(a.event_number||0)-(b.event_number||0)||(a.heat||0)-(b.heat||0)||(a.lane||0)-(b.lane||0))){
      const k=heatKey(r);if(!map.has(k))map.set(k,{key:k,event:r.event_number||0,heat:r.heat||0,start:txt(r.start_time)||'',eventLabel:txt(r.event)||`${r.distance||''} ${r.stroke||''}`,races:[]});
      map.get(k).races.push(r);
    }
    return [...map.values()];
  }
  function heatByKey(k){return heatGroups().find(h=>h.key===k)||null}
  function openCapture(r,mode='capture'){
    if(!r)return;
    try{M.meetOpsEngine?.openCapture?.(r)}catch{}
    if(mode==='video')requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-video]')?.click());
    if(mode==='voice')requestAnimationFrame(()=>document.querySelector('#modalHost [data-mo-voice]')?.click());
  }
  function swimmerRow(r){return`<div class="df-swimmer"><div class="df-swimmer-main"><b>${esc(name(r))}</b><span>L${r.lane||'—'} · <strong>${esc(seed(r))}</strong></span></div><div class="df-swimmer-actions"><button data-df-voice="${esc(raceKey(r))}">Voice</button><button data-df-video="${esc(raceKey(r))}">Video</button><button data-df-capture="${esc(raceKey(r))}">Capture</button></div></div>`}
  function heatCard(h){if(!h)return'';return`<section class="df-card"><div class="df-card-head"><div><b>E${h.event} · HEAT ${h.heat}</b><small>${esc(h.eventLabel)}${h.start?` · ${esc(h.start)}`:''}</small></div><button data-df-close>×</button></div><div class="df-heat-summary"><span><small>AQUAGYM</small><b>${h.races.length}</b></span><span><small>START</small><b>${esc(h.start||'—')}</b></span></div><div class="df-swimmers">${h.races.map(swimmerRow).join('')}</div></section>`}
  function heatTile(h){return`<button data-df-heat="${esc(h.key)}" class="${selectedHeat===h.key?'active':''}"><div><b>E${h.event} · H${h.heat}</b><strong>${h.races.length} AQ</strong></div><small>${esc(h.start||'')}</small>${h.races.map(r=>`<span>${esc(name(r).split(' ')[0])} · L${r.lane||'—'} · <b>${esc(seed(r))}</b></span>`).join('')}</button>`}
  function render(){
    queued=false;if(M.state?.settings?.view!=='meet')return;
    const p=programme();if(!p)return;
    const groups=heatGroups();if(!groups.length)return;
    p.querySelector('[data-df-emergency]')?.remove();
    if(selectedHeat&&!heatByKey(selectedHeat))selectedHeat='';
    const box=document.createElement('section');box.dataset.dfEmergency='1';box.className='df-shell';
    box.innerHTML=`<div class="df-label"><b>AQUAGYM HEATS</b><small>Swipe · tap heat</small></div><div class="df-strip">${groups.map(heatTile).join('')}</div>${selectedHeat?heatCard(heatByKey(selectedHeat)):''}`;
    const sticky=p.querySelector('.ba-sticky');if(sticky)sticky.appendChild(box);else p.prepend(box);
    const workspace=document.querySelector('#meetView [data-meet-workspace-cy]'),meet=document.querySelector('#meetView');if(workspace&&meet&&meet.firstElementChild!==workspace)meet.insertBefore(workspace,meet.firstElementChild);
    document.body.classList.add('df-programme-live');
  }
  function queue(){if(queued)return;queued=true;requestAnimationFrame(render)}
  document.addEventListener('click',e=>{
    const heatBtn=e.target.closest?.('[data-df-heat]');if(heatBtn){e.preventDefault();e.stopPropagation();selectedHeat=heatBtn.dataset.dfHeat;render();return}
    if(e.target.closest?.('[data-df-close]')){e.preventDefault();e.stopPropagation();selectedHeat='';render();return}
    const v=e.target.closest?.('[data-df-video]');if(v){e.preventDefault();e.stopPropagation();openCapture(raceByKey(v.dataset.dfVideo),'video');return}
    const c=e.target.closest?.('[data-df-capture]');if(c){e.preventDefault();e.stopPropagation();openCapture(raceByKey(c.dataset.dfCapture),'capture');return}
    const q=e.target.closest?.('[data-df-voice]');if(q){e.preventDefault();e.stopPropagation();openCapture(raceByKey(q.dataset.dfVoice),'voice');return}
  },true);
  function style(){
    if(document.getElementById('df-meet-emergency-style'))return;
    const s=document.createElement('style');s.id='df-meet-emergency-style';s.textContent=`
      #meetView>[data-meet-workspace-cy]{position:sticky;top:0;z-index:90;background:var(--surface,#fff);margin:0 0 .35rem;box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .df-shell{margin-top:.4rem;border-top:2px solid currentColor;padding-top:.3rem}.df-label{display:flex;justify-content:space-between;align-items:center}.df-label small{font-size:.72rem}
      .df-strip{display:flex!important;gap:.45rem!important;overflow-x:auto!important;overflow-y:hidden!important;width:100%!important;max-width:100vw!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain;padding:.4rem 0 .55rem!important;scrollbar-width:thin;scroll-snap-type:x proximity}
      .df-strip>button{flex:0 0 205px!important;min-width:205px!important;display:grid!important;gap:.18rem!important;text-align:left!important;padding:.5rem!important;border-radius:11px!important;touch-action:pan-x!important;scroll-snap-align:start}.df-strip>button>div{display:flex;justify-content:space-between;gap:.3rem;align-items:center}.df-strip>button>div strong{font-size:.72rem}.df-strip>button>small{font-size:.68rem}.df-strip>button>span{font-size:.72rem;white-space:nowrap}.df-strip>button.active{outline:3px solid currentColor}
      .df-card{border:2px solid currentColor;border-radius:12px;padding:.55rem;background:var(--surface,#fff);display:grid;gap:.5rem}.df-card-head{display:flex;justify-content:space-between}.df-card-head>div{display:grid}.df-heat-summary{display:grid;grid-template-columns:1fr 1fr;gap:.3rem}.df-heat-summary span{display:grid;border:1px solid rgba(13,69,102,.18);border-radius:8px;padding:.35rem}.df-heat-summary small{font-size:.62rem}.df-swimmers{display:grid;gap:.45rem}.df-swimmer{border:1px solid rgba(13,69,102,.18);border-radius:10px;padding:.45rem;display:grid;gap:.4rem}.df-swimmer-main{display:flex;justify-content:space-between;gap:.5rem;align-items:center}.df-swimmer-main span{white-space:nowrap}.df-swimmer-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem}.df-swimmer-actions button{min-height:46px;font-weight:800}
      body.df-programme-live #meetView [data-meet-ops-av],body.df-programme-live #meetView [data-meet-board-ay],body.df-programme-live #meetView [data-meet-board-az],body.df-programme-live #meetView [data-meet-field-deck-au]{display:none!important}
      @media(max-width:620px){.ba-pills{display:flex!important;overflow-x:auto!important;touch-action:pan-x!important;-webkit-overflow-scrolling:touch!important}.ba-pills>button{flex:0 0 auto!important}.df-strip>button{flex-basis:190px!important;min-width:190px!important}}
    `;
    document.head.appendChild(s)
  }
  function install(){style();queue();const h=document.querySelector('#meetView');if(h&&!observer){observer=new MutationObserver(queue);observer.observe(h,{childList:true,subtree:false})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue()});
  M.meetPoolsideRepair={build:BUILD,renderEmergency:render};
})(globalThis);
