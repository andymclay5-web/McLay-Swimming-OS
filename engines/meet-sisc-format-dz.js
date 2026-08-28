'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.meetProgramBA)return;
  const BUILD='v4-meet-sisc-format-20260828dz6-full-programme';
  const txt=v=>M.util?.text?M.util.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isAQ=v=>{const n=norm(v);return n==='aqgcb'||n.includes('aquagym')||n.includes('aqua gym')};
  const sec=v=>{const s=txt(v).replace(/^X/i,'');if(!s||/^(NT|SCR|NS|DNS)$/i.test(s))return null;const p=s.split(':').map(Number);if(p.some(x=>!Number.isFinite(x)))return null;return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:Number(s)};
  function info(label){const s=txt(label),relay=/\b4\s*[x×]\s*\d+/i.test(s);let distance=relay?Number(s.match(/4\s*[x×]\s*(\d+)/i)?.[1]||50)*4:Number(s.match(/\b(25|50|100|200|400|800|1500)\b/)?.[1]||0),stroke='';if(/freestyle/i.test(s))stroke='Freestyle';else if(/backstroke/i.test(s))stroke='Backstroke';else if(/breaststroke/i.test(s))stroke='Breaststroke';else if(/butterfly/i.test(s))stroke='Butterfly';else if(/\bIM\b|individual medley/i.test(s))stroke='IM';return{distance,stroke,relay}}
  function parse(raw,id='session'){
    const lines=String(raw||'').replace(/\r/g,'').split('\n'),events=[];let title='',session='',date='',ev=null,heat=null,lastRelay=null;
    const addHeat=(n,start='')=>{let h=ev?.heats.find(x=>x.heat===n);if(ev&&!h){h={heat:n,start_time:txt(start),rows:[]};ev.heats.push(h)}else if(h&&start)h.start_time=txt(start);return h};
    for(const rawLine of lines){const line=rawLine.trim();if(!line)continue;
      if(!title&&/South\s+Island/i.test(line))title=txt(line.replace(/\s+-\s+\d{1,2}\/\d{1,2}\/\d{4}.*$/,''));
      if(!session){const m=line.match(/Meet Program\s*-\s*(.+)$/i);if(m)session=txt(m[1])}
      if(!date){const m=line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/);if(m)date=`${m[1]} to ${m[2]}`}
      const em=line.match(/^Event\s+(\d+)\s+(.+)$/i);if(em){ev={event_number:Number(em[1]),event:txt(em[2]),...info(em[2]),heats:[]};events.push(ev);heat=null;lastRelay=null;continue}
      const hm=line.match(/^Heat\s+(\d+)(?:\s+of\s+\d+)?(?:\s+(?:Finals?|Prelims?|Heats?|Semi(?:-?Finals?)?|Timed Finals?))?(?:\s+\(#\d+[^)]*\))?(?:\s+Starts at\s+(.+))?/i);if(hm){heat=addHeat(Number(hm[1]),hm[2]||'');lastRelay=null;continue}
      if(!ev||!heat||/^\d+$/.test(line)||/^(Lane|Name|Team)\b/i.test(line))continue;
      if(ev.relay&&lastRelay){const legRe=/(\d+)\)\s*([^\d]+?)\s+([MW])(\d{1,2})(?=\s+\d+\)|$)/g;let mm,found=false;while((mm=legRe.exec(line))){found=true;lastRelay.legs.push({leg:Number(mm[1]),name:txt(mm[2]),sex:mm[3],age:Number(mm[4])})}if(found)continue}
      const sm=line.match(/\s+(NT|SCR|NS|DNS|X?\d+(?::\d+){0,2}\.\d+)$/i);if(!sm)continue;
      const seed=txt(sm[1]).replace(/^X/i,''),body=line.slice(0,sm.index).trim(),lm=body.match(/^(\d+)\s+(.+)$/);if(!lm)continue;
      const lane=Number(lm[1]),rest=lm[2].trim();
      if(ev.relay){const rm=rest.match(/^(.+?)\s+([A-Z])$/i);if(rm){const club=txt(rm[1]);lastRelay={kind:'relay',lane,team:club,team_code:rm[2],club,seed_time:seed,seed_seconds:sec(seed),legs:[],is_aquagym:isAQ(club)};heat.rows.push(lastRelay)}continue}
      let m=rest.match(/^(.+?)\s+(S\d+(?:\/Sb\d+)?(?:\/Sm\d+)?)\s*([MW])?(\d{1,2})\s+(.+)$/i);
      if(m){const club=txt(m[5]);heat.rows.push({kind:'individual',lane,name:txt(m[1]),classification:txt(m[2]),sex:txt(m[3]).toUpperCase(),age:Number(m[4]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});continue}
      m=rest.match(/^(.+?)\s+([MW])(\d{1,2})\s+(.+)$/i);
      if(m){const club=txt(m[4]);heat.rows.push({kind:'individual',lane,name:txt(m[1]),classification:'',sex:m[2].toUpperCase(),age:Number(m[3]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});continue}
      m=rest.match(/^(.+?)\s+(\d{1,2})\s+(.+)$/i);
      if(m){const club=txt(m[3]),sex=/^Women|Girls/i.test(ev.event)?'W':/^Men|Boys/i.test(ev.event)?'M':'';heat.rows.push({kind:'individual',lane,name:txt(m[1]),classification:'',sex,age:Number(m[2]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)})}
    }
    const heats=[];for(const e of events)for(const h of e.heats)heats.push({session_id:id,event_number:e.event_number,event:e.event,distance:e.distance,stroke:e.stroke,relay:e.relay,heat:h.heat,start_time:h.start_time,rows:h.rows});
    return{id,title:title||'Meet programme',session:session||id,date_range:date,events,heats,raw:String(raw||'')};
  }
  function rawFor(src){if(src?.raw)return src.raw;const imports=M.state?.meetImports||[],d=M.state?.meetFieldDeck;return imports.find(x=>x.id===src?.source_id)?.text||imports.find(x=>x.id===d?.source_id)?.text||imports.find(x=>x.meet_id&&x.meet_id===d?.meet_id&&x.text)?.text||''}
  function repair(){const s=M.state?.meetProgramBA;if(!s?.sources?.length)return false;let changed=false;for(const src of s.sources){const raw=rawFor(src);if(!raw||!/South\s+Island|AQGCB|Aquagym|Aqua\s*Gym/i.test(raw))continue;const p=parse(raw,src.source_id||'session'),rows=p.heats.reduce((n,h)=>n+h.rows.length,0),old=src.parsed?.heats?.reduce((n,h)=>n+(h.rows?.length||0),0)||0;if(rows>0&&(src._sisc_format_build!==BUILD||rows!==old)){src.raw=raw;src.parsed=p;src._sisc_format_build=BUILD;changed=true}}if(changed){try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}}return changed}
  const base=M.meetProgramBA.render?.bind(M.meetProgramBA);
  if(base)M.meetProgramBA.render=()=>{const first=base();if(repair())return base();return first};
  setTimeout(()=>{if(M.state?.settings?.view==='meet'&&base){base();if(repair())base()}},0);
  M.meetSiscFormat={build:BUILD,parse,repair,isAQ};
})(globalThis);
