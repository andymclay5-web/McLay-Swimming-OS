'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.SessionTruth=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='3.0.1';

  const BLOCK_ALIASES={
    'warm up':'warm_up','warm-up':'warm_up','warmup':'warm_up',
    'pre set':'pre_set','pre-set':'pre_set','preset':'pre_set',
    'main set':'main_set','main-set':'main_set','main':'main_set',
    'post set':'post_set','post-set':'post_set','postset':'post_set',
    'post main set':'post_set','post-main set':'post_set','postmain set':'post_set','post main':'post_set','post-main':'post_set',
    'sharpness':'sharpness','sharpness set':'sharpness',
    'kick':'kick','kick set':'kick',
    'skill':'skill','skills':'skill','skill set':'skill',
    'speed':'speed','speed set':'speed',
    'aerobic reset':'aerobic_reset','reset':'aerobic_reset',
    'test':'test','testing':'test',
    'warm down':'warm_down','warm-down':'warm_down','warmdown':'warm_down',
    'cool down':'warm_down','cool-down':'warm_down','cooldown':'warm_down'
  };
  const BLOCK_TITLES={
    warm_up:'Warm-up',pre_set:'Pre-set',main_set:'Main set',post_set:'Post-set',
    sharpness:'Sharpness',kick:'Kick',skill:'Skill',speed:'Speed',aerobic_reset:'Aerobic reset',
    test:'Test',warm_down:'Warm-down',other:'Other'
  };
  const WORD_NUMBERS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
  const NUMBER_WORD='one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
  const HEADING_WORD='warm\\s*[- ]?up|pre\\s*[- ]?set|main\\s*[- ]?set|post\\s*[- ]?(?:main\\s*)?set|sharpness(?:\\s+set)?|kick(?:\\s+set)?|skills?(?:\\s+set)?|speed(?:\\s+set)?|aerobic\\s+reset|reset|test(?:ing)?|warm\\s*[- ]?down|cool\\s*[- ]?down';

  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const lines=v=>String(v??'').replace(/\r/g,'').split('\n');
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const hash=s=>{let h=2166136261;for(const ch of String(s??'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const stable=(prefix,...parts)=>`${prefix}-${hash(parts.map(text).join('|').toLowerCase())}`;
  const wordNumber=v=>WORD_NUMBERS[text(v).toLowerCase()]||Number(v)||null;

  function blockType(v){return BLOCK_ALIASES[text(v).toLowerCase().replace(/\s+/g,' ')]||'other'}

  function spokenWork(fragment){
    let x=text(fragment)
      .replace(/^(?:and\s+)?then\s+/i,'')
      .replace(/^and\s+/i,'')
      .replace(/\bwith\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+seconds?\s+rest\b/ig,(_,w)=>`${wordNumber(w)}s rest`)
      .replace(/\b(on|at)\s+a\s+minute\b/ig,'on 60');
    let m=x.match(new RegExp(`^(${NUMBER_WORD}|\\d{1,3})\\s+times?\\s+(12\\.5|15|25|35|50|65|75|100|150|200|300|400|800|1500)\\b\\s*(.*)$`,'i'));
    if(m)return`${wordNumber(m[1])} x ${m[2]}${text(m[3])?' '+text(m[3]):''}`;
    m=x.match(new RegExp(`^(${NUMBER_WORD})\\s+(twenty[- ]?fives|fifties|seventy[- ]?fives|hundreds|two\\s+hundreds|four\\s+hundreds)\\b\\s*(.*)$`,'i'));
    if(m){const reps=wordNumber(m[1]),dw=m[2].toLowerCase().replace(/\s+/g,''),distance=/twenty/.test(dw)?25:/fift/.test(dw)?50:/seventy/.test(dw)?75:/twohundred/.test(dw)?200:/fourhundred/.test(dw)?400:100;return`${reps} x ${distance}${text(m[3])?' '+text(m[3]):''}`}
    m=x.match(new RegExp(`^(${NUMBER_WORD}|\\d{1,2})\\s+(.+)$`,'i'));
    if(m&&!/^\d+(?:\.\d+)?\s*(?:m|metres?|meters?)\b/i.test(x)){const n=wordNumber(m[1]);if(Number.isFinite(n))return`${n} ${text(m[2])}`}
    return x;
  }

  function speechToLines(source){
    const raw=String(source??'');
    if(/\n/.test(raw))return raw;
    if(!new RegExp(`\\b(?:${HEADING_WORD})\\b`,'i').test(raw))return raw;
    const sentences=raw.split(/(?<=[.!?])\s+/).map(x=>text(x.replace(/[.!?]+$/,''))).filter(Boolean),out=[];
    for(let sentence of sentences){
      sentence=sentence.replace(/^after\s+that\s+/i,'');
      const hm=sentence.match(new RegExp(`^(${HEADING_WORD})\\b\\s*(?:will\\s+be|is|:|,)?\\s*(.*)$`,'i'));
      if(!hm){out.push(sentence);continue}
      out.push(hm[1]);let body=text(hm[2]);if(!body)continue;
      body=body.replace(new RegExp(`,?\\s+and\\s+repeat\\s+that\\s+(${NUMBER_WORD}|\\d+)\\s+times?\\b`,'i'),(_,n)=>`, Repeat x${wordNumber(n)}`);
      const parts=body.split(/\s*,\s*(?:and\s+)?(?:then\s+)?|\s+(?:and\s+)?then\s+/i).map(text).filter(Boolean);
      for(const part of parts){const p=text(part).replace(/^and$/i,'');if(!p)continue;const rm=p.match(new RegExp(`^(?:and\\s+)?repeat\\s+(?:that\\s+)?(?:x\\s*)?(${NUMBER_WORD}|\\d+)(?:\\s+times?)?$`,'i'));out.push(rm?`Repeat x${wordNumber(rm[1])}`:spokenWork(p))}
    }
    return out.join('\n');
  }

  function normaliseNaturalLine(line){
    let x=String(line??'').trim();if(!x)return'';
    x=x.replace(/[×✕]/g,'x').replace(/[–—]/g,'—').replace(/\bon\s+a\s+minute\b/ig,'on 60');
    x=x.replace(/\b(\d{1,2})\s*x\s*10p\s+i[’']?m\b/gi,'$1 x 100 IM');
    x=x.replace(/^([1-9]\d?)(25|50|75|100|200|400)s\b/i,(_,r,d)=>`${r} x ${d}`);
    x=x.replace(new RegExp(`^(${NUMBER_WORD})\\s+times?\\s+(12\\.5|15|25|35|50|65|75|100|150|200|300|400|800|1500)\\b\\s*(.*)$`,'i'),(_,w,d,tail)=>`${wordNumber(w)} x ${d}${text(tail)?' '+text(tail):''}`);
    x=x.replace(/^(\d{1,3})\s+times?\s+(12\.5|15|25|35|50|65|75|100|150|200|300|400|800|1500)\b\s*(.*)$/i,(_,r,d,tail)=>`${r} x ${d}${text(tail)?' '+text(tail):''}`);
    x=x.replace(new RegExp(`^(${NUMBER_WORD})\\s+(25|50|75|100|200|400)s?\\b`,'i'),(_,w,d)=>`${wordNumber(w)} x ${d}`);
    x=x.replace(/^(\d{1,2})\s+(25|50|75|100|200|400)s\b/i,'$1 x $2');
    x=x.replace(new RegExp(`^(${NUMBER_WORD})\\s+(.+)$`,'i'),(_,w,tail)=>`${wordNumber(w)} ${tail}`);
    const wd=x.match(/^(warm\s*[- ]?down|cool\s*[- ]?down)\s+(?:of\s+)?(\d{2,4})\s*(?:m|metres?|meters?)?\s*$/i);if(wd)return`${wd[1]}\n${wd[2]}`;
    return x;
  }

  function normaliseSource(source){return lines(speechToLines(source)).flatMap(line=>normaliseNaturalLine(line).split('\n')).filter(x=>!/^and$/i.test(text(x))).join('\n')}

  function heading(line){
    const t=text(line).replace(/[:]+$/,'');
    const m=t.match(new RegExp(`^(${HEADING_WORD})\\s*(?:[-—:·]\\s*)?(\\d{1,2})\\s*rounds?\\b\\s*(.*)$`,'i'));
    if(m)return{type:blockType(m[1]),rounds:Number(m[2]),tail:text(m[3]),authoredTitle:text(m[1])};
    const exact=t.match(new RegExp(`^(${HEADING_WORD})$`,'i'));return exact?{type:blockType(exact[1]),rounds:null,tail:'',authoredTitle:text(exact[1])}:null;
  }

  const roundLine=line=>{const m=text(line).match(/^(\d{1,2})\s+rounds?\s*:?\s*(.*)$/i);return m?{rounds:Number(m[1]),tail:text(m[2])}:null};
  function repeatMarker(line){let m=text(line).match(/^(?:repeat\s+(?:that\s+)?)?x\s*(\d{1,2})\s*$/i);if(m)return Number(m[1]);m=text(line).match(new RegExp(`^repeat\\s+(?:that\\s+)?(${NUMBER_WORD}|\\d+)\\s+times?$`,'i'));return m?wordNumber(m[1]):null}
  const explicitRepeat=line=>{const m=text(line).match(/^(\d{1,3})\s*[x×]\s*(\d{1,4}(?:\.5)?)(?:\s*m\b)?\s*(.*)$/i);return m?{reps:Number(m[1]),distance:Number(m[2]),tail:text(m[3])}:null};
  const singleDistance=line=>{const m=text(line).match(/^(\d{1,4}(?:\.5)?)(m\b)?\s*(.*)$/i);return m?{distance:Number(m[1]),hasUnit:!!m[2],tail:text(m[3])}:null};
  const summaryRepeat=line=>{const r=explicitRepeat(line);return r&&/\b(?:total|altogether|overall)\b/i.test(r.tail||'')?r:null};

  function countInstruction(line){const t=text(line);if(!t||/^(?:\d{1,3})\s*(?:sr|s\s*r|s\s*rest|sec(?:onds?)?\s*rest|seconds?\s*rest|rest)$/i.test(t))return null;const m=t.match(/^(\d{1,2})\s+(.+)$/);if(!m)return null;const body=text(m[2]).replace(/^[-—:]\s*/,'');if(!body||/^(?:m|metres?|meters?)\b/i.test(body))return null;return{count:Number(m[1]),text:body}}

  function zoneName(v){const t=text(v);if(/\b(?:regeneration|regen|reg)\b/i.test(t))return'Regeneration';if(/\b(?:development|dev)\b/i.test(t))return'Development';if(/\b(?:overload|ol)\b/i.test(t))return'Overload';if(/\b(?:threshold|thr|css)\b/i.test(t))return'Threshold';if(/\b(?:clearance|cl)\b/i.test(t))return'Clearance';return''}
  function strokeName(v){const t=text(v);if(/\b(?:freestyle|free|fr)\b/i.test(t))return'Freestyle';if(/\b(?:backstroke|back|bk)\b/i.test(t))return'Backstroke';if(/\b(?:breaststroke|breast|br)\b/i.test(t))return'Breaststroke';if(/\b(?:butterfly|fly)\b/i.test(t))return'Butterfly';if(/\bIM\b/i.test(t))return'IM';if(/\bchoice\b/i.test(t))return'Choice';return''}
  const equipment=v=>{const t=text(v),out=[];for(const x of ['Fins','Paddles','Pull','Bands','Snorkel'])if(new RegExp(`\\b${x}\\b`,'i').test(t))out.push(x);return out};
  const restSeconds=v=>{const m=text(v).match(/\b(\d{1,3})\s*(?:sr|s\s*r|sec(?:onds?)?\s*rest|seconds?\s*rest|s\s*rest|rest)\b/i);return m?Number(m[1]):null};

  function cycleOptions(v){const t=text(v);if(!/(?:@|\bon\b)/i.test(t))return[];const out=[];for(const m of t.matchAll(/(\d{1,2})[:.]([0-5]\d)\b/g))out.push(Number(m[1])*60+Number(m[2]));if(!out.length){const m=t.match(/\bon\s+(\d{2,3})\b/i);if(m){const n=Number(m[1]);if(n>=20&&n<=599)out.push(n)}}return[...new Set(out)]}
  const cycleSeconds=v=>cycleOptions(v)[0]??null;

  function raceIntent(v){const t=text(v);let m=t.match(/\b(50|100|200|400|800|1500)\s*(IM|Free(?:style)?|Back(?:stroke)?|Breast(?:stroke)?|Fly|Butterfly)?\s*(?:race\s*)?pace\b/i);if(m)return{distance:Number(m[1]),eventStroke:m[2]?strokeName(m[2]):null,workingStroke:strokeName(t)||null};m=t.match(/(?:^|\s)(?:@|at|race\s*pace)\s*(50|100|200|400|800|1500)\b/i);return m?{distance:Number(m[1]),eventStroke:null,workingStroke:strokeName(t)||null}:null}

  function explicitRepInstructions(raw,reps){const src=String(raw??''),max=Math.max(1,Number(reps)||1),refs=[...src.matchAll(/#\s*(\d{1,3})/g)].map(m=>Number(m[1])).filter(n=>n>=1&&n<=max);if(!refs.length)return[];const multiple=refs.length>1&&/\+/.test(src),single=refs.length===1&&/#\s*\d{1,3}\s*(?:@|at\b|pace\b|fast\b|max\b|easy\b|build\b|descend\b|race\b)/i.test(src);if(!multiple&&!single)return[];const ri=raceIntent(src),label=text(src);return[...new Set(refs)].map(rep=>({rep,label,raceIntent:ri,source:'explicit_rep'}))}
  function oddEvenInstructions(raw,reps){if(!/\bodd\b/i.test(raw)||!/\beven\b/i.test(raw))return[];const odd=text(String(raw).match(/\bOdd\b\s*([^/]*)/i)?.[1]||''),even=text(String(raw).match(/\bEven\b\s*(.*)$/i)?.[1]||'');return Array.from({length:Math.max(1,Number(reps)||1)},(_,i)=>{const label=(i+1)%2?odd:even;return{rep:i+1,label,raceIntent:raceIntent(label),drill:/\b(?:drill|scull|technique)\b/i.test(label),source:'odd_even'}})}
  function dedupeRepInstructions(rows){const map=new Map();for(const r of rows||[]){if(r&&Number(r.rep))map.set(`${r.rep}|${text(r.label)}`,r)}return[...map.values()].sort((a,b)=>a.rep-b.rep)}

  function instructionCompositionInfo(body,parentDistance){
    const t=text(body);if(!t.includes('/'))return{parts:[],span:0,repeats:0};
    const rawParts=t.split('/').map(text).filter(Boolean),parts=[];let span=0;
    for(const p of rawParts){const m=p.match(/^(\d{1,3}(?:\.5)?)\s*(?:m\b)?\s*(.*)$/i);if(!m)return{parts:[],span:0,repeats:0};const distance=Number(m[1]);span+=distance;parts.push({distance,text:text(m[2]),raw:p,stroke:strokeName(m[2]),equipment:equipment(m[2]),cycleSeconds:cycleSeconds(p),cycleOptions:cycleOptions(p),cues:[]})}
    const parent=Number(parentDistance)||0;if(!(span>0&&parent>=span&&Math.abs(parent/span-Math.round(parent/span))<1e-9))return{parts:[],span:0,repeats:0};
    return{parts,span,repeats:Math.round(parent/span)};
  }
  const instructionComposition=(body,parentDistance)=>instructionCompositionInfo(body,parentDistance).parts;

  function makePatternSegment(count,body,parentDistance=0,composition=null){
    const ci=composition?{parts:clone(composition),span:(composition||[]).reduce((n,x)=>n+Number(x.distance||0),0),repeats:1}:instructionCompositionInfo(body,parentDistance);
    if(composition&&ci.span>0&&parentDistance>=ci.span&&Math.abs(parentDistance/ci.span-Math.round(parentDistance/ci.span))<1e-9)ci.repeats=Math.round(parentDistance/ci.span);
    return{count:Number(count)||1,text:text(body),zone:zoneName(body),stroke:strokeName(body),equipment:equipment(body),raceIntent:raceIntent(body),drill:/\b(?:drill|scull|technique)\b/i.test(body),composition:ci.parts,compositionRepeats:ci.repeats||0,cycleSeconds:cycleSeconds(body),cycleOptions:cycleOptions(body),cues:[],repInstructions:[]};
  }

  function expandPattern(set){const segs=set.pattern||[],span=segs.reduce((n,x)=>n+(Number(x.count)||0),0),reps=Math.max(1,Number(set.reps)||1);if(!span||reps%span!==0)return;const generated=[];let rep=1;while(rep<=reps){for(const seg of segs){for(let i=0;i<(Number(seg.count)||1)&&rep<=reps;i++,rep++)generated.push({rep,label:seg.text,zone:seg.zone||'',raceIntent:seg.raceIntent||null,drill:!!seg.drill,source:'pattern'})}}const retained=(set.repInstructions||[]).filter(x=>x.source!=='pattern');set.repInstructions=dedupeRepInstructions([...retained,...generated]);const zones=generated.filter(x=>x.zone);set.repPattern=zones.length===generated.length?zones.map(x=>({rep:x.rep,zone:x.zone,text:x.label})):[]}

  function parentheticalComposition(raw,distance){const m=String(raw??'').match(/\(([^)]+)\)/);return m?instructionComposition(m[1],distance):[]}
  function makeSet(sessionId,blockTypeName,order,raw,reps,distance){const r=text(raw),opts=cycleOptions(r),n=Math.max(1,Number(reps)||1);return{id:stable('set',sessionId,blockTypeName,order,r),kind:'set',order,reps:n,distance:Math.max(0,Number(distance)||0),stroke:strokeName(r),zone:zoneName(r),restSeconds:restSeconds(r),cycleSeconds:opts[0]??null,cycleOptions:opts,equipment:equipment(r),raw:r,composition:parentheticalComposition(r,distance),compositionRepeats:1,pattern:[],patternRounds:null,phases:[],repPattern:[],cues:[],raceIntent:raceIntent(r),repInstructions:dedupeRepInstructions([...oddEvenInstructions(r,n),...explicitRepInstructions(r,n)]),targetSeconds:null}}

  const setDistance=set=>(Number(set?.reps)||1)*(Number(set?.distance)||0);
  const nodeDistance=node=>!node?0:node.kind==='set'?setDistance(node):node.kind==='group'?Math.max(1,Number(node.rounds)||1)*(node.items||[]).reduce((n,x)=>n+nodeDistance(x),0):0;
  const blockDistance=block=>(block?.items||[]).reduce((n,x)=>n+nodeDistance(x),0);
  const totalDistance=session=>(session?.blocks||[]).reduce((n,b)=>n+blockDistance(b),0);

  function countPattern(line,parentDistance=0){const t=text(line);if(!t.includes('/'))return null;const parts=t.split('/').map(text).filter(Boolean);if(parts.length<2)return null;const out=[];for(const p of parts){const m=p.match(/^(\d{1,2})\s+(.+)$/);if(!m)return null;out.push(makePatternSegment(Number(m[1]),m[2],parentDistance))}return out}
  function hyphenAllocation(line,parentDistance=0){const m=text(line).match(/^(\d{1,2})-(.+)$/);if(!m)return null;const body=m[2].replace(/-(?=\d)/g,' / '),ci=instructionCompositionInfo(body,parentDistance);return ci.parts.length&&ci.repeats===1?makePatternSegment(Number(m[1]),m[2],parentDistance,ci.parts):null}

  function childDescriptor(c){return{count:Number(c.reps)||1,reps:Number(c.reps)||1,distance:Number(c.distance)||0,text:text(c.raw).replace(/^\d{1,3}\s*[x×]\s*\d{1,4}(?:\.5)?(?:\s*m\b)?\s*/i,''),raw:c.raw,stroke:c.stroke||'',zone:c.zone||'',equipment:clone(c.equipment||[]),restSeconds:c.restSeconds??null,cycleSeconds:c.cycleSeconds??null,cycleOptions:clone(c.cycleOptions||[]),raceIntent:clone(c.raceIntent),composition:clone(c.composition||[]),compositionRepeats:c.compositionRepeats||1,pattern:clone(c.pattern||[]),repInstructions:clone(c.repInstructions||[]),cues:clone(c.cues||[])}}
  function bareParent(set){const r=explicitRepeat(set?.raw);if(r)return!text(r.tail);const s=singleDistance(set?.raw);return!!s&&!text(s.tail)}
  function adoptComposition(parent,parts){parent.composition=parts.map(c=>({distance:setDistance(c),text:text(c.raw),raw:c.raw,stroke:c.stroke||'',equipment:clone(c.equipment||[]),cycleSeconds:c.cycleSeconds??null,cycleOptions:clone(c.cycleOptions||[]),cues:clone(c.cues||[])}));parent.compositionRepeats=1;if(!parent.cycleSeconds){const cycles=[...new Set(parts.map(c=>c.cycleSeconds).filter(Number.isFinite))];if(cycles.length===1){parent.cycleSeconds=cycles[0];parent.cycleOptions=[cycles[0]]}}}

  function foldChildren(items){
    const a=clone(items||[]);
    for(let i=0;i<a.length;i++){
      const parent=a[i];if(parent?.kind==='group'){parent.items=foldChildren(parent.items||[]);continue}if(parent?.kind!=='set')continue;
      if(Number(parent.reps)>=2){
        let j=i+1,kids=[],count=0;
        while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.distance)!==Number(parent.distance)||Number(c.reps)>=Number(parent.reps))break;kids.push(c);count+=Number(c.reps)||1;j++}
        if(kids.length>=2&&count>0&&Number(parent.reps)%count===0){if(count===Number(parent.reps))parent.phases=kids.map(childDescriptor);else{parent.pattern=kids.map(c=>{const seg=makePatternSegment(Number(c.reps)||1,text(c.raw).replace(/^\d{1,3}\s*[x×]\s*\d{1,4}(?:\.5)?(?:\s*m\b)?\s*/i,''),parent.distance);seg.cues=clone(c.cues||[]);seg.raceIntent=clone(c.raceIntent);seg.repInstructions=clone(c.repInstructions||[]);return seg});expandPattern(parent)}a.splice(i+1,kids.length);continue}
        j=i+1;let parts=[],sum=0;
        while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.reps)!==1||Number(c.distance)<=0||Number(c.distance)>=Number(parent.distance))break;parts.push(c);sum+=Number(c.distance);j++;if(sum>=Number(parent.distance))break}
        if(parts.length>=2&&Math.abs(sum-Number(parent.distance))<.001){adoptComposition(parent,parts);a.splice(i+1,parts.length);continue}
      }
      if(bareParent(parent)&&!(parent.composition||[]).length){let j=i+1,parts=[],sum=0;while(j<a.length){const c=a[j];if(c?.kind!=='set'||Number(c.distance)<=0)break;const metres=setDistance(c);if(metres<=0||sum+metres>Number(parent.distance))break;parts.push(c);sum+=metres;j++;if(sum>=Number(parent.distance))break}if(parts.length>=1&&Math.abs(sum-Number(parent.distance))<.001){adoptComposition(parent,parts);a.splice(i+1,parts.length)}}
    }
    return a;
  }

  function appendCue(set,line){const t=text(line);set.cues.push(t);const refs=explicitRepInstructions(t,set.reps);if(refs.length)set.repInstructions=dedupeRepInstructions([...(set.repInstructions||[]),...refs])}
  const walkSets=(nodes,fn)=>{for(const n of nodes||[]){if(n?.kind==='set')fn(n);else if(n?.kind==='group')walkSets(n.items,fn)}};
  const applyRest=(nodes,seconds)=>walkSets(nodes,s=>{s.restSeconds=seconds});
  function diveStartSet(sessionId,type,order,line){const t=text(line),m=t.match(/^(\d{1,2})\s*[x×]\s*(?:dive\s+)?start(?:s)?\b.*?\b(\d{1,3}(?:\.5)?)\s*m\b/i);return m?makeSet(sessionId,type,order,line,Number(m[1]),Number(m[2])):null}

  function parseBlock(sessionId,type,rawLines,blockRounds=null){
    const root=[];let order=0,currentSet=null,lastRepeatGroup=null,segmentStart=0;const groups=[];
    const list=()=>groups.length?groups.at(-1).items:root;
    const push=n=>{list().push(n);if(n.kind==='set')currentSet=n};
    for(const rawLine of rawLines){
      const line=text(rawLine);
      if(!line){currentSet=null;groups.length=0;segmentStart=root.length;lastRepeatGroup=null;continue}
      const rl=roundLine(line);
      if(rl){if(currentSet&&Number(currentSet.reps)>1&&rl.rounds>1&&Number(currentSet.reps)%rl.rounds===0&&rl.rounds<Number(currentSet.reps)){currentSet.patternRounds=rl.rounds;continue}const g={id:stable('group',sessionId,type,++order,line),kind:'group',order,rounds:rl.rounds,label:rl.tail||'',items:[]};list().push(g);groups.push(g);currentSet=null;continue}
      const repeat=repeatMarker(line);
      if(repeat&&repeat>1){const target=list(),start=groups.length?0:segmentStart,items=target.splice(start);if(items.length){const g={id:stable('group',sessionId,type,++order,`repeat-${repeat}-${items.map(x=>x.id).join('|')}`),kind:'group',order,rounds:repeat,label:'Repeat',items};target.push(g);lastRepeatGroup=g;currentSet=null}continue}
      const restOnly=line.match(/^(\d{1,3})\s*(?:sr|s\s*r|s\s*rest|sec(?:onds?)?\s*rest|seconds?\s*rest|rest)$/i);
      if(restOnly){const n=Number(restOnly[1]);if(currentSet)currentSet.restSeconds=n;else if(lastRepeatGroup)applyRest(lastRepeatGroup.items,n);continue}
      const allRest=line.match(/^all\s+(?:with\s+)?(\d{1,3})\s*(?:sr|s\s*r|s\s*rest|sec(?:onds?)?\s*rest|seconds?\s*rest|rest)(?:\s+period)?$/i);
      if(allRest){applyRest(list().slice(groups.length?0:segmentStart),Number(allRest[1]));continue}
      if(/^(?:@|on)\s*/i.test(line)&&cycleOptions(line).length&&currentSet){const opts=cycleOptions(line);currentSet.cycleOptions=opts;currentSet.cycleSeconds=opts[0]??null;continue}
      const summary=summaryRepeat(line);
      if(summary){root.push({id:stable('summary',sessionId,type,++order,line),kind:'cue',role:'summary',order,text:line,raw:line,summaryMetres:summary.reps*summary.distance});currentSet=null;groups.length=0;segmentStart=root.length;lastRepeatGroup=null;continue}

      if(currentSet&&line.includes('/')){
        const ci=instructionCompositionInfo(line,currentSet.distance);
        if(ci.parts.length){if(currentSet.patternRounds){currentSet.pattern.push(makePatternSegment(1,line,currentSet.distance,ci.parts));expandPattern(currentSet)}else if(!(currentSet.composition||[]).length){currentSet.composition=ci.parts;currentSet.compositionRepeats=ci.repeats}else appendCue(currentSet,line);continue}
        const counts=countPattern(line,currentSet.distance);
        if(counts&&counts.reduce((n,x)=>n+x.count,0)<=Math.max(1,Number(currentSet.reps)||1)){currentSet.pattern.push(...counts);expandPattern(currentSet);continue}
      }

      if(currentSet){const hy=hyphenAllocation(line,currentSet.distance);if(hy&&hy.count<=Math.max(1,Number(currentSet.reps)||1)){currentSet.pattern.push(hy);expandPattern(currentSet);continue}}
      const counted=countInstruction(line);
      if(currentSet&&counted&&counted.count<=Math.max(1,Number(currentSet.reps)||1)){currentSet.pattern.push(makePatternSegment(counted.count,counted.text,currentSet.distance));expandPattern(currentSet);continue}

      const dive=diveStartSet(sessionId,type,++order,line);if(dive){push(dive);lastRepeatGroup=null;continue}else order--;
      const rep=explicitRepeat(line);if(rep){push(makeSet(sessionId,type,++order,line,rep.reps,rep.distance));lastRepeatGroup=null;continue}
      const one=singleDistance(line);
      if(one&&Number(one.distance)>=10){if(one.hasUnit&&Number(one.distance)<25){if(currentSet)appendCue(currentSet,line);else list().push({id:stable('cue',sessionId,type,++order,line),kind:'cue',order,text:line,raw:line});continue}push(makeSet(sessionId,type,++order,line,1,one.distance));lastRepeatGroup=null;continue}
      if(currentSet){appendCue(currentSet,line);continue}
      list().push({id:stable('cue',sessionId,type,++order,line),kind:'cue',order,text:line,raw:line});
    }
    let out=foldChildren(root);if(blockRounds&&blockRounds>1)out=[{id:stable('group',sessionId,type,'block-rounds',blockRounds),kind:'group',order:1,rounds:blockRounds,label:'',scope:'block',items:out}];return out;
  }

  function createSession(identity,source){const id=identity?.id||stable('session',identity?.date||'',identity?.dayPart||'',identity?.title||'',source);return{schema:'msos.session.v3',engineVersion:VERSION,id,identity:{date:identity?.date||'',dayPart:identity?.dayPart||'',title:identity?.title||'',squads:[...(identity?.squads||[])],venue:identity?.venue||'',course:identity?.course||'',start:identity?.start||'',end:identity?.end||''},originalSource:{text:String(source??''),hash:hash(source)},blocks:[],metadata:{writtenTotal:null,parsedTotal:0,totalMatches:true,warnings:[]}}}

  function parse(source,identity={}){
    const normalized=normaliseSource(source),session=createSession(identity,source),chunks=[];let currentType=null,currentLines=[],blockRounds=null,writtenTotal=null,currentTitle='';const notes=[];
    const flush=()=>{if(!currentType)return;chunks.push({type:currentType,lines:currentLines,authoredTitle:currentTitle,blockRounds});currentLines=[];blockRounds=null;currentTitle=''};
    for(const raw of lines(normalized)){const t=text(raw),total=t.match(/^TOTAL\s*[:=]?\s*([\d,]+)\s*m?$/i)||t.match(/^([\d,]{3,6})\s*m$/i);if(total){writtenTotal=Number(total[1].replace(/,/g,''));continue}const h=heading(t);if(h){flush();currentType=h.type;blockRounds=h.rounds||null;currentTitle=h.authoredTitle||BLOCK_TITLES[h.type]||'';if(h.tail)currentLines.push(h.tail);continue}if(!currentType){if(t)notes.push(t);continue}currentLines.push(raw)}
    flush();
    session.blocks=chunks.map((c,i)=>({id:stable('block',session.id,c.type,i,c.authoredTitle),type:c.type,title:/post\s*[- ]?main/i.test(c.authoredTitle)?'Post-main set':BLOCK_TITLES[c.type]||c.authoredTitle||'Block',authoredTitle:c.authoredTitle||'',sourceOrder:i+1,order:i+1,items:parseBlock(session.id,c.type,c.lines,c.blockRounds)}));
    session.metadata.normalizedSource=normalized;session.metadata.sessionNotes=notes;session.metadata.writtenTotal=writtenTotal;session.metadata.parsedTotal=totalDistance(session);session.metadata.totalMatches=writtenTotal==null||Math.abs(writtenTotal-session.metadata.parsedTotal)<=1;if(writtenTotal!=null&&!session.metadata.totalMatches)session.metadata.warnings.push(`Written total ${writtenTotal}m does not match parsed total ${session.metadata.parsedTotal}m`);return session;
  }

  function validate(session){const errors=[];if(!session?.id)errors.push('Missing session id');if(!Array.isArray(session?.blocks))errors.push('Missing blocks');const total=totalDistance(session);if(!Number.isFinite(total)||total<0)errors.push('Invalid distance');if(!(total>0))errors.push('No runnable distance');if(session?.metadata?.writtenTotal!=null&&!session.metadata.totalMatches)errors.push('Written total mismatch');return{ok:errors.length===0,errors,total}}

  return{VERSION,parse,validate,totalDistance,blockDistance,nodeDistance,internals:{blockType,speechToLines,spokenWork,normaliseSource,normaliseNaturalLine,heading,roundLine,repeatMarker,explicitRepeat,singleDistance,summaryRepeat,countInstruction,foldChildren,zoneName,strokeName,restSeconds,cycleSeconds,cycleOptions,raceIntent,explicitRepInstructions,oddEvenInstructions,parentheticalComposition,instructionComposition,instructionCompositionInfo,hyphenAllocation}};
});
