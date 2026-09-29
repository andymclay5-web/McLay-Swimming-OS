'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M)return;
  const BUILD='v4-meet-swimify-format-20260929a';
  const txt=v=>M.util?.text?M.util.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isAQ=v=>{const n=norm(v);return n==='aqgcb'||n.includes('aquagym')||n.includes('aqua gym')};
  const sec=v=>{const s=txt(v).replace(/^X/i,'');if(!s||/^(NT|SCR|NS|DNS)$/i.test(s))return null;const p=s.split(':').map(Number);if(p.some(x=>!Number.isFinite(x)))return null;return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:Number(s)};
  function info(label){
    const s=txt(label),relay=/\b4\s*[x×]\s*\d+/i.test(s);
    const distance=relay?Number(s.match(/4\s*[x×]\s*(\d+)/i)?.[1]||50)*4:Number(s.match(/\b(25|50|100|200|400|800|1500)\s*m?\b/i)?.[1]||0);
    let stroke='';if(/freestyle/i.test(s))stroke='Freestyle';else if(/backstroke/i.test(s))stroke='Backstroke';else if(/breaststroke/i.test(s))stroke='Breaststroke';else if(/butterfly/i.test(s))stroke='Butterfly';else if(/\bIM\b|individual medley/i.test(s))stroke='IM';
    return{distance,stroke,relay};
  }
  function detect(raw){
    const s=String(raw||'');
    return /Datahandling:\s*Swimify\b/i.test(s)||(/Competition Date:/i.test(s)&&/^Event\s+\d+,\s*\d+m\s+/im.test(s))||(/^Event\s+\d+,\s*\d+m\s+/im.test(s)&&/\bAQGCB\b/i.test(s));
  }
  function heatMeta(s,fallback){
    let x=txt(s),start='';const tm=x.match(/(\d{1,2}:\d{2})\s*$/);if(tm){start=tm[1];x=txt(x.slice(0,tm.index))}
    let n=0,m=x.match(/,\s*(\d+)\s*(?:\(\s*\d*\s*\)?)?\s*$/);if(m)n=Number(m[1]);
    if(!n){m=x.match(/^(\d+)\s*(?:\(\s*\d+\s*\))?\s*$/);if(m)n=Number(m[1])}
    return{heat:n||fallback,start_time:start};
  }
  function parse(raw,id='session'){
    const source=String(raw||'').replace(/\r/g,''),lines=source.split('\n'),events=[];let title='',session='',date='',ev=null,heat=null,nextHeat=1;
    const addHeat=(n,start='')=>{if(!ev)return null;let h=ev.heats.find(x=>x.heat===n);if(!h){h={heat:n,start_time:txt(start),rows:[]};ev.heats.push(h)}else if(start)h.start_time=txt(start);nextHeat=Math.max(nextHeat,n+1);return h};
    for(const rawLine of lines){
      let line=rawLine.trim();if(!line)continue;
      // Swimify extraction can glue a page footer directly onto the next Event line.
      // Strip the footer prefix but preserve any trailing Event text on that same line.
      line=line.replace(/^.*?Datahandling:\s*Swimify.*?Page\s+\d+\/\d+\s*/i,'').trim();
      if(!line||/^Licensed to:/i.test(line)||/^Page\s+\d+\/\d+\b/i.test(line))continue;
      if(!title&&/Championship|Champs|Carnival|Meet/i.test(line)&&!/^Event\b/i.test(line))title=txt(line);
      if(!date){const dm=line.match(/Competition Date:\s*(.+)$/i);if(dm)date=txt(dm[1])}
      const em=line.match(/^Event\s+(\d+),?\s+(.+)$/i);
      if(em){
        let label=txt(em[2]),hs='';
        const hi=label.search(/\s+Heat(?:\s|$)/i);
        if(hi>=0){hs=txt(label.slice(hi).replace(/^Heat\s*/i,''));label=txt(label.slice(0,hi))}
        ev={event_number:Number(em[1]),event:label,...info(label),heats:[]};events.push(ev);heat=null;nextHeat=1;
        if(hs){const hm=heatMeta(hs,nextHeat);heat=addHeat(hm.heat,hm.start_time)}
        continue;
      }
      if(/^Heat(?:\s|$)/i.test(line)&&ev){const hs=txt(line.replace(/^Heat\s*/i,''));const hm=heatMeta(hs,nextHeat);heat=addHeat(hm.heat,hm.start_time);continue}
      if(!ev||!heat||/^\d+$/.test(line))continue;
      const sm=line.match(/\s+(NT|SCR|NS|DNS|X?\d+(?::\d+){0,2}\.\d+)\s*$/i);if(!sm)continue;
      const seed=txt(sm[1]).replace(/^X/i,''),body=line.slice(0,sm.index).trim(),lm=body.match(/^(\d+)\s+(.+)$/);if(!lm)continue;
      const lane=Number(lm[1]),rest=txt(lm[2]);
      const tail=rest.match(/^(.+?)\s+(?:(S\d+|SB\d+|SM\d+)\s+)?(\d{1,2})\s+([A-Z][A-Z0-9]{2,7})$/i);if(!tail)continue;
      const rawName=txt(tail[1]),visitor=/\s*\(V\)\s*$/i.test(rawName),name=txt(rawName.replace(/\s*\(V\)\s*$/i,'')),classification=txt(tail[2]||''),age=Number(tail[3]),club=txt(tail[4]).toUpperCase();
      const sex=/\bWomen\b|\bGirls\b/i.test(ev.event)?'W':/\bMen\b|\bBoys\b/i.test(ev.event)?'M':'';
      heat.rows.push({kind:'individual',lane,name,source_name:rawName,visitor,classification,sex,age,club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});
    }
    const heats=[];for(const e of events)for(const h of e.heats)heats.push({session_id:id,event_number:e.event_number,event:e.event,distance:e.distance,stroke:e.stroke,relay:e.relay,heat:h.heat,start_time:h.start_time,rows:h.rows});
    return{id,title:title||'Meet programme',session:session||id,date_range:date,events,heats,raw:source,format:'SWIMIFY'};
  }
  M.meetSwimifyFormat={build:BUILD,detect,parse,isAQ};
})(globalThis);
