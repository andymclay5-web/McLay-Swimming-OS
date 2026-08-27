'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.meetProgramBA)return;
  const BUILD='v4-meet-sisc-format-20260827dz2';
  const txt=v=>M.util?.text?M.util.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const AQ=new Set(['aquagym','aqua gym','aqgcb','aqua gym canterbury','aquagym canterbury']);
  const isAQ=v=>AQ.has(norm(v));
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
      const hm=line.match(/^Heat\s+(\d+)(?:\s+of\s+\d+)?\s+(?:Finals?|Prelims?|Heats?|Semi(?:-?Finals?)?|Timed Finals?)(?:\s+\(#\d+[^)]*\))?(?:\s+Starts at\s+(.+))?/i);if(hm){heat=pushHeat(Number(hm[1]),hm[2]||'');continue}
      if(!current||!heat)continue;
      const m=line.match(/^(\d+)\s+(.+?)\s+(?:(S\d+(?:\/Sb\d+)?(?:\/Sm\d+)?|S\d+\/?(?:Sb\d+)?\/?(?:Sm\d+)?)\s+)?(\d{1,2})\s+([A-Z0-9]+)\s+(NT|SCR|NS|DNS|X?\d+(?::\d+)?\.\d+)$/i);
      if(m){const club=txt(m[5]),seed=txt(m[6]).replace(/^X/i,'');heat.rows.push({kind:'individual',lane:Number(m[1]),name:txt(m[2]),classification:txt(m[3]||''),sex:'',age:Number(m[4]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)});continue}
      const old=line.match(/^(\d+)\s+(.+?)\s+((?:S\d+\/Sb\d+\/Sm\d+)?)([MW])(\d{1,2})\s+(.+?)\s+(NT|SCR|NS|DNS|X?\d+(?::\d+)?\.\d+)$/i);
      if(old){const club=txt(old[6]),seed=txt(old[7]).replace(/^X/i,'');heat.rows.push({kind:'individual',lane:Number(old[1]),name:txt(old[2]),classification:txt(old[3]),sex:old[4].toUpperCase(),age:Number(old[5]),club,seed_time:seed,seed_seconds:sec(seed),is_aquagym:isAQ(club)})}
    }
    const heats=[];for(const ev of events)for(const h of ev.heats)heats.push({session_id:id,event_number:ev.event_number,event:ev.event,distance:ev.distance,stroke:ev.stroke,relay:ev.relay,heat:h.heat,start_time:h.start_time,rows:h.rows});
    return{id,title:title||'Meet programme',session:session||id,date_range:date,events,heats,raw:String(raw||'')};
  }
  function repair(){
    const s=M.state?.meetProgramBA;if(!s?.sources?.length)return false;let changed=false;
    for(const src of s.sources){
      if(!src?.raw||!/AQGCB/i.test(src.raw))continue;
      const sourceSig=sig(src.raw);
      if(src._sisc_format_build===BUILD&&src._sisc_raw_sig===sourceSig&&src.parsed?.heats?.length)continue;
      const p=parse(src.raw,src.source_id||'session');const aq=p.heats.flatMap(h=>h.rows).filter(r=>r.is_aquagym).length;
      if(aq){src.parsed=p;src._sisc_format_build=BUILD;src._sisc_raw_sig=sourceSig;changed=true}
    }
    if(changed){try{M.store?.save?.(M.state)}catch{}try{M.storageEngine?.saveUi?.(M.state)}catch{}}
    return changed;
  }
  const baseRender=M.meetProgramBA.render?.bind(M.meetProgramBA);
  if(baseRender)M.meetProgramBA.render=()=>{repair();return baseRender()};
  setTimeout(()=>{if(M.state?.settings?.view==='meet'){repair();baseRender?.()}},0);
  M.meetSiscFormat={build:BUILD,parse,repair,isAQ};
})(globalThis);
