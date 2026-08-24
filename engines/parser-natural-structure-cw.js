'use strict';
(function(g){
  const M=g.MSOS4,U=M?.util,S=M?.session,P=M?.parser;
  if(!M||!U||!S||!P?.parse)return;

  const baseParse=P.parse.bind(P);
  const X=M.parserNaturalCW={build:'v4-parser-natural-structure-20260824cw'};

  const text=v=>String(v??'').replace(/\r/g,'');
  const clean=v=>U.text(v);
  const headingType=line=>{
    const t=clean(line).replace(/^\d+[.)]\s*/,'');
    if(/^(?:warm.?up)\b/i.test(t))return'warm_up';
    if(/^(?:pre.?set)\b/i.test(t))return'pre_set';
    if(/^(?:main(?:\s+set)?)\b/i.test(t))return'main_set';
    if(/^(?:post.?set|reinforcement)\b/i.test(t))return'post_set';
    if(/^(?:warm.?down|cool.?down)\b/i.test(t))return'warm_down';
    if(/^test\b/i.test(t))return'test';
    return'';
  };
  const headingLabel=type=>({warm_up:'WARM-UP',pre_set:'PRE-SET',main_set:'MAIN SET',post_set:'POST-SET',warm_down:'WARM-DOWN',test:'TEST'})[type]||'MAIN SET';
  const runnable=line=>/^\s*(?:(?:\d{1,2})\s*(?:x|×|✕)\s*\d{1,4}(?:\.5)?\b|\d{2,4}(?:\.5)?\b|\d{1,2}\s+Rounds?\b)/i.test(String(line||''));
  const paragraphDistance=para=>{
    let total=0;
    for(const raw of String(para||'').split('\n')){
      const line=clean(raw);
      let m=line.match(/^(\d{1,2})\s*(?:x|×|✕)\s*(\d{1,4}(?:\.5)?)\b/i);
      if(m){total+=Number(m[1])*Number(m[2]);continue;}
      m=line.match(/^(\d{2,4}(?:\.5)?)\b/);
      if(m)total+=Number(m[1]);
    }
    return total;
  };
  const looksRecovery=para=>/\b(?:warm.?down|cool.?down|easy|loosen|recovery|regeneration|regen)\b/i.test(String(para||''))&&paragraphDistance(para)<=800;
  const splitParagraphs=source=>text(source).split(/\n\s*\n+/).map(x=>x.replace(/^\n+|\n+$/g,'')).filter(x=>clean(x));

  function inferWithoutHeadings(source){
    const paras=splitParagraphs(source);
    if(!paras.length)return String(source||'');
    const workoutIdx=paras.map((p,i)=>({p,i,work:runnable(p.split('\n').find(x=>clean(x))||'')||p.split('\n').some(runnable)})).filter(x=>x.work).map(x=>x.i);
    if(!workoutIdx.length)return String(source||'');
    const first=workoutIdx[0],last=workoutIdx.at(-1),prefix=paras.slice(0,first),work=paras.slice(first,last+1),suffix=paras.slice(last+1);
    if(work.length===1)return [...prefix,'WARM-UP',work[0],...suffix].join('\n\n');
    let main=1;
    let score=-1;
    for(let i=1;i<work.length;i++){
      if(i===work.length-1&&looksRecovery(work[i]))continue;
      const d=paragraphDistance(work[i]);
      const quality=/\b(?:main|threshold|overload|race|pace|max|kick|quality|anaerobic|aerobic)\b/i.test(work[i])?500:0;
      if(d+quality>score){score=d+quality;main=i;}
    }
    const finalIsWD=work.length>=3&&looksRecovery(work.at(-1));
    const out=[...prefix,'WARM-UP',work[0]];
    if(main>1){out.push('PRE-SET',...work.slice(1,main));}
    out.push('MAIN SET',work[main]);
    const after=work.slice(main+1,finalIsWD?-1:undefined);
    if(after.length)out.push('POST-SET',...after);
    if(finalIsWD)out.push('WARM-DOWN',work.at(-1));
    if(suffix.length)out.push(...suffix);
    return out.join('\n\n');
  }

  function inferMissingOpening(source){
    const lines=text(source).split('\n');
    const firstHeading=lines.findIndex(x=>headingType(x));
    if(firstHeading<0)return inferWithoutHeadings(source);
    if(firstHeading===0)return String(source||'');
    const before=lines.slice(0,firstHeading),firstRunnable=before.findIndex(runnable);
    if(firstRunnable<0)return String(source||'');
    return [...before.slice(0,firstRunnable),'WARM-UP',...before.slice(firstRunnable),...lines.slice(firstHeading)].join('\n');
  }

  function parseCycleAnywhere(value){
    const s=clean(value);
    let m=s.match(/(?:@|\bon\b)\s*(\d+):(\d{1,2}(?:\.\d+)?)\b/i);
    if(m)return Number(m[1])*60+Number(m[2]);
    m=s.match(/(?:@|\bon\b)\s*(\d{1,2})[.:](\d{2})\b/i);
    if(m&&Number(m[2])<60)return Number(m[1])*60+Number(m[2]);
    m=s.match(/(?:@|\bon\b)\s*(\d{2,3})\b(?!\s*(?:m|metres?|pace)\b)/i);
    if(m){const n=Number(m[1]);if(n>=20&&n<=300)return n;}
    return null;
  }
  function parseRestAnywhere(value){
    const s=clean(value);
    let m=s.match(/\b(\d{1,3})\s*(?:s|sec|seconds?)\s*(?:r|rest)\b/i);if(m)return Number(m[1]);
    m=s.match(/\b(?:r|rest)\b\s*(?:[·:=-]\s*)?(\d{1,3})\s*(?:s|sec|seconds?)?\b/i);if(m)return Number(m[1]);
    return null;
  }
  function cueText(item){return [item?.raw,item?.text,...(item?.cues||[])].map(clean).filter(Boolean).join(' · ')}
  function repairSet(item){
    if(!item||item.kind!=='set')return;
    const all=cueText(item);
    if(!Number.isFinite(Number(item.cycleSeconds))){const c=parseCycleAnywhere(all);if(c!=null)item.cycleSeconds=c;}
    if(!Number.isFinite(Number(item.restSeconds))){const r=parseRestAnywhere(all);if(r!=null)item.restSeconds=r;}
    const dm=all.match(/\bDesc(?:end(?:ing)?)?\s*1\s*[-–—]\s*(\d{1,2})\b/i);
    if(dm){const cue=`Desc 1-${Number(dm[1])}`;item.cues=item.cues||[];if(!item.cues.some(x=>new RegExp(`Desc(?:end(?:ing)?)?\\s*1\\s*[-–—]\\s*${Number(dm[1])}`,'i').test(clean(x))))item.cues.push(cue);item.descent={from:1,to:Number(dm[1]),repeat:Number(item.reps)>Number(dm[1])};}
    item.pattern=item.pattern||[];
    for(const cue of item.cues||[]){const pm=clean(cue).match(/^(\d{1,2})\s*[-:]\s*(.+)$/);if(pm&&!/\b(?:rest|sec|seconds?)\b/i.test(pm[2])){const count=Number(pm[1]),label=clean(pm[2]);if(count>0&&!item.pattern.some(x=>Number(x.count)===count&&clean(x.text)===label))item.pattern.push({kind:'pattern',count,text:label});}}
    if(!(item.composition||[]).length){
      for(const cue of item.cues||[]){
        const hits=[...String(cue).matchAll(/(?:^|[:/·,+])\s*(\d{1,4}(?:\.5)?)\s*([^/·,+]*)/g)].map(m=>({distance:Number(m[1]),text:clean(m[2]).replace(/\b(?:rest|r)\b.*$/i,'').trim()})).filter(x=>x.distance>0&&x.distance<Number(item.distance));
        if(hits.length>=2&&Math.abs(hits.reduce((n,x)=>n+x.distance,0)-Number(item.distance))<.001){item.composition=hits;break;}
      }
    }
  }
  function repairItems(items){for(const item of items||[]){if(item.kind==='set')repairSet(item);else if(item.kind==='group')repairItems(item.items);}}
  function retitleNaturalBlocks(session,prepared){
    const labels=[...String(prepared||'').matchAll(/^(WARM-UP|PRE-SET|MAIN SET|POST-SET|WARM-DOWN|TEST)\s*$/gim)].map(m=>clean(m[1]));
    (session.blocks||[]).forEach((b,i)=>{if(labels[i])b.title=labels[i].replace(/\b\w/g,x=>x.toUpperCase()).replace('Warm-Up','Warm-up').replace('Pre-Set','Pre-set').replace('Main Set','Main set').replace('Post-Set','Post-set').replace('Warm-Down','Warm-down');});
  }

  P.parse=function naturalParse(source,identity={}){
    const original=String(source??'');
    const prepared=inferMissingOpening(original);
    const session=baseParse(prepared,identity);
    for(const block of session.blocks||[])repairItems(block.items);
    retitleNaturalBlocks(session,prepared);
    const src=original.trim();
    session.originalPlan=U.deepFreeze({text:src,hash:U.hash(src),capturedAt:session.originalPlan?.capturedAt||U.now()});
    session.currentSource={text:src,hash:U.hash(src),updatedAt:U.now()};
    session.metadata=session.metadata||{};
    session.metadata.parserStructure=prepared===original?'explicit':'natural';
    session.metadata.parserPreparedHash=U.hash(prepared);
    session.metadata.parsedTotal=S.total(session);
    session.metadata.totalMatches=session.metadata.explicitTotal==null?true:Math.abs(session.metadata.parsedTotal-session.metadata.explicitTotal)<=1;
    return session;
  };

  X.infer=inferMissingOpening;
  X.parseCycle=parseCycleAnywhere;
  X.parseRest=parseRestAnywhere;
  X.repairSet=repairSet;
})(globalThis);
