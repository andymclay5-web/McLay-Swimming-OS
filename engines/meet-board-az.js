'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui)return;
  const U=M.util||{},BUILD='v4-meet-board-hotfix-20260821az';
  const deck=()=>M.state?.meetFieldDeck||null,txt=v=>U.text?U.text(v):String(v??'').trim(),clock=s=>U.clock?U.clock(s):Number(s).toFixed(2),now=()=>U.now?U.now():new Date().toISOString();
  const race=()=>M.meetOpsEngine?.selectedRace?.()||null;
  function members(r){if(!r?.relay)return[];return(deck()?.races||[]).filter(x=>x.relay&&x.event_number===r.event_number&&(x.heat||0)===(r.heat||0)&&(x.lane||0)===(r.lane||0)).sort((a,b)=>(a.relay_leg||0)-(b.relay_leg||0))}
  function save(){try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}}
  function ensureRelayAthlete(){const r=race();if(!r?.relay)return;const ids=members(r).map(x=>x.athlete_id).filter(Boolean),o=M.state.meetOps=M.state.meetOps||{};if(ids.length&&!ids.includes(o.selectedAthleteId)){o.selectedAthleteId=ids[0];save()}}
  function relayResult(r){const h=document.querySelector('#modalHost'),x=M.meetOpsEngine?.recordFor?.(r,true)||{};h.innerHTML=`<div class="modal-backdrop"><section class="modal"><header><h2>Official relay result</h2><button data-az-close>×</button></header><div class="modal-body"><p><b>E${r.event_number} · ${r.distance||200} ${txt(r.stroke)} relay</b> · H${r.heat||'—'} L${r.lane||'—'}</p><label>Official time<input data-az-time value="${x.official_result_seconds!=null?clock(x.official_result_seconds):''}" placeholder="2:03.45"></label><label>Place<input data-az-place type="number" min="1" value="${x.official_place||''}"></label><p class="muted">Shared relay result only. No individual PB is created.</p></div><footer><button data-az-save>Save relay result</button><button data-az-close>Close</button></footer></section></div>`;M.nav?.openLayer?.('modal');const close=()=>{h.innerHTML='';M.nav?.dismissLayer?.()};h.querySelectorAll('[data-az-close]').forEach(b=>b.onclick=close);h.querySelector('[data-az-save]').onclick=()=>{const raw=txt(h.querySelector('[data-az-time]').value),sec=U.seconds?.(raw)??Number(raw);if(!Number.isFinite(sec)||sec<=0)return M.toast?.('Enter a valid relay time');x.official_result_seconds=sec;x.official_place=Number(h.querySelector('[data-az-place]').value)||null;x.official_at=now();x.updated_at=now();save();close();M.toast?.(`Relay official ${clock(sec)} saved`);M.meetOpsEngine?.render?.()}}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-ay-results],[data-ay-official]');if(!b)return;const r=race();if(!r?.relay)return;e.preventDefault();e.stopImmediatePropagation();relayResult(r)},true);
  const host=document.querySelector('#meetView');if(host)new MutationObserver(()=>ensureRelayAthlete()).observe(host,{childList:true,subtree:true});
  ensureRelayAthlete();
  M.meetBoardAZ={build:BUILD,ensureRelayAthlete,relayResult};
})(globalThis);
