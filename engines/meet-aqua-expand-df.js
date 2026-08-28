'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const seconds=v=>{const s=txt(v).replace(/^X/i,'');if(!s||/^(NT|SCR|NS|DNS)$/i.test(s))return null;const p=s.split(':').map(Number);if(p.some(x=>!Number.isFinite(x)))return null;return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:Number(s)};
  const athlete=name=>{const k=norm(name),a=(M.state?.athletes||[]).filter(x=>x.active!==false);return a.find(x=>norm(x.full_name)===k)||a.find(x=>norm(x.preferred_name)===k)||null};
  function eventInfo(row){const ev=row.closest('.ba-event'),label=txt(ev?.querySelector('.ba-event-head')?.textContent||'');const distance=Number(label.match(/\b(25|50|100|200|400|800|1500)\b/)?.[1]||0);let stroke='';if(/freestyle/i.test(label))stroke='Freestyle';else if(/backstroke/i.test(label))stroke='Backstroke';else if(/breaststroke/i.test(label))stroke='Breaststroke';else if(/butterfly/i.test(label))stroke='Butterfly';else if(/\bIM\b|individual medley/i.test(label))stroke='IM';return{label:label.replace(/^Event\s+\d+\s*[·:-]?\s*/i,''),distance,stroke}}
  function ensure(row){if(!row?.classList.contains('aqua'))return;const d=M.state?.meetFieldDeck;if(!d)return;d.races=Array.isArray(d.races)?d.races:[];const parts=String(row.dataset.baRow||'').split('|'),event_number=Number(parts[1]),heat=Number(parts[2]),lane=Number(parts[3]);if(!event_number||!heat||!lane)return;const cells=row.querySelector('.ba-row-main')?.children||[],name=txt(cells[1]?.textContent),meta=txt(cells[2]?.textContent),club=txt(cells[3]?.textContent),seed_time=txt(cells[4]?.textContent);if(!name)return;const a=athlete(name),info=eventInfo(row),same=d.races.find(r=>!r.relay&&Number(r.event_number)===event_number&&Number(r.heat)===heat&&Number(r.lane)===lane&&norm(r.athlete_name||r.source_name)===norm(name));if(same)return;
    const r={event_number,event:info.label,distance:info.distance,stroke:info.stroke,relay:false,heat,lane,start_time:'',seed_time,seed_seconds:seconds(seed_time),source_name:name,classification:'',sex:meta.slice(0,1),age:Number(meta.slice(1))||null,athlete_id:a?.id||'',athlete_name:a?.full_name||name,match_confidence:a?'exact-or-name':'unmatched',programme_source_id:parts[0]||''};
    d.races.unshift(r);d.swimmers=[...new Set(d.races.map(x=>x.athlete_name).filter(Boolean))];d.updated_at=new Date().toISOString();try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}
  }
  document.addEventListener('pointerdown',e=>ensure(e.target.closest?.('[data-ba-row].aqua')),true);
  document.addEventListener('click',e=>ensure(e.target.closest?.('[data-ba-row].aqua')),true);
  M.meetAquaExpandDF={build:'v4-meet-aqua-expand-20260828df',ensure};
})(globalThis);
