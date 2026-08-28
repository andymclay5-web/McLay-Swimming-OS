'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.meetProgramBA)return;
  const BUILD='v4-meet-sisc-format-20260828dz4-full-rows-single-deck';
  const txt=v=>M.util?.text?M.util.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const AQ=new Set(['aquagym','aqua gym','aqgcb','aqua gym canterbury','aquagym canterbury','aquagym swimming club','aqua gym swimming club']);
  const isAQ=v=>{const n=norm(v);return AQ.has(n)||n.includes('aquagym')||n.includes('aqua gym')||n==='aqgcb'};
  const sec=v=>{const s=txt(v).replace(/^X/i,'');if(!s||/^(NT|SCR|NS|DNS)$/i.test(s))return null;const p=s.split(':').map(Number);if(p.some(x=>!Number.isFinite(x)))return null;return p.length===2?p[0]*60+p[1]:Number(s)};
  const sig=raw=>`${String(raw||'').length}:${String(raw||'').slice(0,80)}:${String(raw||'').slice(-80)}`;
  function eventInfo(label){const s=txt(label),relay=/\b4\s*[x×]\s*50\b/i.test(s);let distance=relay?200:Number(s.match(/\b(25|50|100|200|400|800|1500)\b/)?.[1]||0),stroke='';if(/freestyle/i.test(s))stroke='Freestyle';else if(/backstroke/i.test(s))stroke='Backstroke';else if(/breaststroke/i.test(s))stroke='Breaststroke';else if(/butterfly/i.test(s))stroke='Butterfly';else if(/\bIM\b|individual medley/i.test(s))stroke='IM';return{distance,stroke,relay}}
  function parse(raw,id='session'){
    const lines=String(raw||'').replace(/\r/g,'').split('\n');let title='',session='',date='',current=null,heat=null;const events=[];
    const pushHeat=(n,start='')=>{if(!current)return null;let h=current.heats.find(x=>x.heat===n);if(!h){h={heat:n,start_time:txt(start),rows:[]};current.heats.push(h)}else if(start)h.start_time=txt(start);return h};
    for(const rawLine of lines){const line=rawLine.trim();if(!line)continue;
      if(!title){const m=line.match(/^(.*?)\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}(?:\s+to\s+\d{1,2}\/\d{1,2}\/\d{4})?/);if(m&&!/MEET MANAGER|Meet Program/i.test(m[1]))title=txt(m[1])}
      if(!session){const m=line.match(/^Meet Program\s*-\s*(.+)$/i);if(m)session=txt(m[1])}
      if(!date){const m=line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{4})/);if(m)date=`${m[1]} to ${m[2]}`}
      const em=line.match(/^Event\s+(\d+)\s+(.+)$/i);if(em){current={event_number:Number(em[1]),event:txt(em[2]),...eventInfo(em[2]),heats:[]};events.push(current);heat=null;continue}
      const hm=line.match(/^Heat\s+(\d+)(?:\s+of\s+\d+)?(?:\s+(?:Finals?|Prelims?|Heats?|Semi(?:-?Finals?)?|Timed Finals?))?(?:\s+\(#\d+[^)]*\))?(?:\s+Starts at\s+(.+))?/i);if(hm){heat=pushHeat(Number(hm[1]),hm[2]||'');continue}
      if(!current||!heat)continue;
      if(/^\d+$/.test(line))continue;
      const seedMatch=line.match(/\s+(NT|SCR|NS|DNS|X?\d+(?::\d+)?\.\d+)$/i);if(!seedMatch)continue;
      const seed=txt(seedMatch[1]).replace(/^X/i,''),body=line.slice(0,seedMatch.index).trim();
      const laneMatch=body.match(/^(\d+)\s+(.+)$/);if(!laneMatch)continue;
      const lane=Number(laneMatch[1]),rest=laneMatch[2].trim();
      let m=rest.match(/^(.+?)\s+((?:S\d+(?:\/Sb\d+)?(?:\/Sm\d+)?)|(?:S\d+\/?(?:Sb\d+)?\/?(?:Sm\d+)?))\s+([MW])?(\d{1,2})\s+(.+)$/i);
      if(m){const club=txt(m[5]);heat.rows.push({kind:'individual',lane,name:txt(m[1]),classification:txt(m[2]||''),sex:txt(m[3]||'').toUpperCase(),age:Number(m[4]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});continue}
      m=rest.match(/^(.+?)\s+([MW])(\d{1,2})\s+(.+)$/i);
      if(m){const club=txt(m[4]);heat.rows.push({kind:'individual',lane,name:txt(m[1]),classification:'',sex:m[2].toUpperCase(),age:Number(m[3]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});continue}
      m=rest.match(/^(.+?)\s+(\d{1,2})\s+(.+)$/i);
      if(m){const club=txt(m[3]);heat.rows.push({kind:'individual',lane,name:txt(m[1]),classification:'',sex:'',age:Number(m[2]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});continue}
      const relay=rest.match(/^(.+?)\s+([A-Z])\s*$/i);
      if(relay){const club=txt(relay[1]);heat.rows.push({kind:'relay',lane,team:club,team_code:relay[2].toUpperCase(),club,seed_time:seed,seed_seconds:sec(seed),legs:[],is_aquagym:isAQ(club)});}
    }
    const heats=[];for(const ev of events)for(const h of ev.heats)heats.push({session_id:id,event_number:ev.event_number,event:ev.event,distance:ev.distance,stroke:ev.stroke,relay:ev.relay,heat:h.heat,start_time:h.start_time,rows:h.rows});
    return{id,title:title||'Meet programme',session:session||id,date_range:date,events,heats,raw:String(raw||'')};
  }
  function isSouthIslandSource(raw){return /South\s+Island/i.test(raw)||/South\s+Island\s+SCM\s+Championships/i.test(raw)||/AQGCB|Aquagym|Aqua\s*Gym/i.test(raw)}
  function repair(){
    const s=M.state?.meetProgramBA;if(!s?.sources?.length)return false;let changed=false;
    for(const src of s.sources){
      if(!src?.raw||!isSouthIslandSource(src.raw))continue;
      const sourceSig=sig(src.raw);
      if(src._sisc_format_build===BUILD&&src._sisc_raw_sig===sourceSig&&src.parsed?.heats?.length)continue;
      const p=parse(src.raw,src.source_id||'session');const rowCount=p.heats.reduce((n,h)=>n+h.rows.length,0);
      if(p.heats.length&&rowCount){src.parsed=p;src._sisc_format_build=BUILD;src._sisc_raw_sig=sourceSig;changed=true}
    }
    if(changed){try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}}
    return changed;
  }
  function style(){
    if(document.getElementById('meet-sisc-dz-style'))return;
    const s=document.createElement('style');s.id='meet-sisc-dz-style';s.textContent='body.meet-program-ba-active #meetView>.meet-hero,body.meet-program-ba-active #meetView>.next-race-card,body.meet-program-ba-active #meetView>.page-card{display:none!important}';document.head.appendChild(s);
  }
  style();
  const baseRender=M.meetProgramBA.render?.bind(M.meetProgramBA);
  if(baseRender)M.meetProgramBA.render=()=>{repair();return baseRender()};
  setTimeout(()=>{if(M.state?.settings?.view==='meet'){repair();baseRender?.()}},0);
  M.meetSiscFormat={build:BUILD,parse,repair,isAQ};
})(globalThis);
