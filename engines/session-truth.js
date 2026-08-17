'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.SessionTruth=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const BLOCK_TYPES={
    'warm up':'warm_up','warm-up':'warm_up','warmup':'warm_up',
    'pre set':'pre_set','pre-set':'pre_set','preset':'pre_set',
    'main set':'main_set','main-set':'main_set','main':'main_set',
    'post set':'post_set','post-set':'post_set','postset':'post_set',
    'warm down':'warm_down','warm-down':'warm_down','warmdown':'warm_down',
    'cool down':'warm_down','cool-down':'warm_down','cooldown':'warm_down',
    'test':'test'
  };
  const BLOCK_TITLES={warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',warm_down:'Warm-down',test:'Test',other:'Other'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lines=v=>String(v??'').replace(/\r/g,'').split('\n');
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(text).join('|').toLowerCase())}`;
  const clone=v=>JSON.parse(JSON.stringify(v));
  function blockType(v){const key=text(v).toLowerCase().replace(/\s+/g,' ');return BLOCK_TYPES[key]||'other'}
  function heading(line){
    const t=text(line).replace(/[:]+$/,'');
    const same=t.match(/^(warm\s*[- ]?up|pre\s*[- ]?set|main\s*[- ]?set|post\s*[- ]?set|warm\s*[- ]?down|cool\s*[- ]?down|test)\s*(?:[-—–:·]\s*)?(\d{1,2})\s*rounds?\b\s*(.*)$/i);
    if(same)return{type:blockType(same[1]),rounds:Number(same[2]),tail:text(same[3])};
    const type=blockType(t);return type!=='other'?{type,rounds:null,tail:''}:null;
  }
  function roundLine(line){const m=text(line).match(/^(\d{1,2})\s+rounds?\s*:?\s*(.*)$/i);return m?{rounds:Number(m[1]),tail:text(m[2])}:null}
  function explicitRepeat(line){const m=text(line).match(/^(\d{1,3})\s*[x×]\s*(\d{1,4}(?:\.5)?)\b\s*(.*)$/i);return m?{reps:Number(m[1]),distance:Number(m[2]),tail:text(m[3])}:null}
  function singleDistance(line){const m=text(line).match(/^(\d{2,4}(?:\.5)?)\b\s*(.*)$/);return m?{distance:Number(m[1]),tail:text(m[2])}:null}
  function zoneName(v){const t=text(v);if(/\b(?:regeneration|regen|reg)\b/i.test(t))return'Regeneration';if(/\b(?:development|dev)\b/i.test(t))return'Development';if(/\b(?:overload|ol)\b/i.test(t))return'Overload';if(/\b(?:threshold|thr)\b/i.test(t))return'Threshold';if(/\b(?:clearance|cl)\b/i.test(t))return'Clearance';return''}
  function strokeName(v){const t=text(v);if(/\b(?:freestyle|free|fr)\b/i.test(t))return'Freestyle';if(/\b(?:backstroke|back|bk)\b/i.test(t))return'Backstroke';if(/\b(?:breaststroke|breast|br)\b/i.test(t))return'Breaststroke';if(/\b(?:butterfly|fly)\b/i.test(t))return'Butterfly';if(/\bIM\b/i.test(t))return'IM';if(/\bchoice\b/i.test(t))return'Choice';return''}
  function equipment(v){const t=text(v);return['Fins','Paddles','Pull','Bands','Snorkel'].filter(x=>new RegExp(`\\b${x}\\b`,'i').test(t))}
  function restSeconds(v){const m=text(v).match(/\b(\d{1,3})\s*(?:sr|s\s*r|sec(?:onds?)?\s*rest|s\s*rest|rest)\b/i);return m?Number(m[1]):null}
  function cycleSeconds(v){const t=text(v);let m=t.match(/(?:@|\bon\b)\s*(\d{1,2})[:.]([0-5]\d)\b/i);if(m)return Number(m[1])*60+Number(m[2]);m=t.match(/\bon\s+(\d{2,3})\b/i);if(m){const n=Number(m[1]);if(n>=20&&n<=599)return n}return null}
  function makeSet(sessionId,blockTypeName,order,raw,reps,distance){return{id:stable('set',sessionId,blockTypeName,order,raw),kind:'set',order,reps:Math.max(1,Number(reps)||1),distance:Math.max(0,Number(distance)||0),stroke:strokeName(raw),zone:zoneName(raw),restSeconds:restSeconds(raw),cycleSeconds:cycleSeconds(raw),equipment:equipment(raw),raw:text(raw),composition:[],pattern:[],repPattern:[],cues:[]}}
  function setDistance(set){return(Number(set?.reps)||1)*(Number(set?.distance)||0)}
  function nodeDistance(node){if(!node)return 0;if(node.kind==='set')return setDistance(node);if(node.kind==='group')return Math.max(1,Number(node.rounds)||1)*(node.items||[]).reduce((n,x)=>n+nodeDistance(x),0);return 0}
  function blockDistance(block){return(block?.items||[]).reduce((n,x)=>n+nodeDistance(x),0)}
  function totalDistance(session){return(session?.blocks||[]).reduce((n,b)=>n+blockDistance(b),0)}
  function parseInlinePattern(line){const t=text(line);if(!t.includes('/'))return null;const parts=t.split('/').map(text).filter(Boolean);if(parts.length<2)return null;const out=[];for(const p of parts){const m=p.match(/^(\d{1,2})\s+(.+)$/);if(!m)return null;out.push({count:Number(m[1]),text:text(m[2])})}return out}
  function foldChildren(items){
    const a=clone(items||[]);
    for(let i=0;i<a.length;i++){
      const parent=a[i];if(parent?.kind!=='set'||Number(parent.reps)<2)continue;
      let j=i+1,kids=[],cycleCount=0;
      while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.distance)!==Number(parent.distance)||Number(c.reps)>=Number(parent.reps))break;kids.push(c);cycleCount+=Number(c.reps)||1;j++}
      if(kids.length>=2&&cycleCount>0&&Number(parent.reps)%cycleCount===0){parent.pattern=parent.pattern||[];for(const c of kids)parent.pattern.push({count:Number(c.reps)||1,text:text(c.raw).replace(/^\d{1,3}\s*[x×]\s*\d{1,4}(?:\.5)?\s*/i,'')});a.splice(i+1,kids.length);continue}
      j=i+1;let parts=[],sum=0;
      while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.reps)!==1||Number(c.distance)<=0||Number(c.distance)>=Number(parent.distance))break;parts.push(c);sum+=Number(c.distance);j++;if(sum>=Number(parent.distance))break}
      if(parts.length>=2&&Math.abs(sum-Number(parent.distance))<0.001){parent.composition=parent.composition||[];for(const c of parts)parent.composition.push({distance:Number(c.distance),text:text(c.raw).replace(/^\d{1,4}(?:\.5)?\s*/,'')});a.splice(i+1,parts.length)}
    }
    return a;
  }
  function parseBlock(sessionId,type,rawLines){
    const root=[];let order=0,currentSet=null,currentGroup=null;
    const list=()=>currentGroup?currentGroup.items:root;
    const push=n=>{list().push(n);if(n.kind==='set')currentSet=n};
    for(const rawLine of rawLines){
      const line=text(rawLine);if(!line){currentSet=null;continue}
      const rl=roundLine(line);if(rl){const g={id:stable('group',sessionId,type,order,line),kind:'group',order:++order,rounds:rl.rounds,label:rl.tail||'',items:[]};root.push(g);currentGroup=g;currentSet=null;continue}
      const restOnly=line.match(/^(\d{1,3})\s*(?:sr|s\s*r|s\s*rest|sec(?:onds?)?\s*rest|rest)$/i);if(restOnly&&currentSet){currentSet.restSeconds=Number(restOnly[1]);continue}
      const cycleOnly=line.match(/^(?:@|on)\s*(\d{1,2})[:.](\d{2})$/i)||line.match(/^on\s+(\d{2,3})$/i);if(cycleOnly&&currentSet){currentSet.cycleSeconds=cycleSeconds(line);continue}
      const rep=explicitRepeat(line);if(rep){push(makeSet(sessionId,type,++order,line,rep.reps,rep.distance));continue}
      const one=singleDistance(line);if(one){push(makeSet(sessionId,type,++order,line,1,one.distance));continue}
      const inline=parseInlinePattern(line);if(inline&&currentSet){currentSet.pattern.push(...inline);continue}
      if(currentSet){currentSet.cues.push(line);continue}
      list().push({id:stable('cue',sessionId,type,++order,line),kind:'cue',order,text:line,raw:line});
    }
    return foldChildren(root.map(n=>n.kind==='group'?{...n,items:foldChildren(n.items)}:n));
  }
  function createSession(identity,source){const id=identity?.id||stable('session',identity?.date||'',identity?.dayPart||'',identity?.title||'',source);return{schema:'msos.session.v1',engineVersion:VERSION,id,identity:{date:identity?.date||'',dayPart:identity?.dayPart||'',title:identity?.title||'',squads:[...(identity?.squads||[])],venue:identity?.venue||'',course:identity?.course||'',start:identity?.start||'',end:identity?.end||''},originalSource:{text:String(source??''),hash:hash(source)},blocks:[],metadata:{writtenTotal:null,parsedTotal:0,totalMatches:true,warnings:[]}}}
  function parse(source,identity={}){
    const session=createSession(identity,source),chunks=[];let currentType=null,currentLines=[],pendingRounds=null,writtenTotal=null,notes=[];
    const flush=()=>{if(!currentType)return;let blockLines=currentLines;if(pendingRounds)blockLines=[`${pendingRounds} Rounds:`,...blockLines];chunks.push({type:currentType,lines:blockLines});currentLines=[];pendingRounds=null};
    for(const raw of lines(source)){
      const t=text(raw),total=t.match(/^TOTAL\s*[:=]?\s*([\d,]+)\s*m?$/i)||t.match(/^([\d,]{3,6})\s*m$/i);if(total){writtenTotal=Number(total[1].replace(/,/g,''));continue}
      const h=heading(t);if(h){flush();currentType=h.type;pendingRounds=h.rounds||null;if(h.tail)currentLines.push(h.tail);continue}
      if(!currentType){if(t)notes.push(t);continue}currentLines.push(raw);
    }
    flush();
    session.blocks=chunks.map((c,i)=>({id:stable('block',session.id,c.type,i),type:c.type,title:BLOCK_TITLES[c.type]||'Block',order:i+1,items:parseBlock(session.id,c.type,c.lines)}));
    session.metadata.sessionNotes=notes;session.metadata.writtenTotal=writtenTotal;session.metadata.parsedTotal=totalDistance(session);session.metadata.totalMatches=writtenTotal==null||Math.abs(writtenTotal-session.metadata.parsedTotal)<=1;
    if(writtenTotal!=null&&!session.metadata.totalMatches)session.metadata.warnings.push(`Written total ${writtenTotal}m does not match parsed total ${session.metadata.parsedTotal}m`);
    return session;
  }
  function validate(session){const errors=[];if(!session?.id)errors.push('Missing session id');if(!Array.isArray(session?.blocks))errors.push('Missing blocks');const total=totalDistance(session);if(!Number.isFinite(total)||total<0)errors.push('Invalid distance');if(session?.metadata?.writtenTotal!=null&&!session.metadata.totalMatches)errors.push('Written total mismatch');return{ok:errors.length===0,errors,total}}
  return{VERSION,parse,validate,totalDistance,blockDistance,nodeDistance,internals:{heading,roundLine,explicitRepeat,singleDistance,foldChildren,zoneName,strokeName,restSeconds,cycleSeconds}};
});