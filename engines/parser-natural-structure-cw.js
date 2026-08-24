'use strict';
(function(g){
  const M=g.MSOS4,U=M?.util,S=M?.session,P=M?.parser;
  if(!M||!U||!S||!P?.parse)return;

  const baseParse=P.parse.bind(P);
  const X=M.parserNaturalCW={build:'v4-parser-natural-structure-20260824cw4'};

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
  const runnable=line=>/^\s*(?:(?:\d{1,2})\s*(?:x|×|✕)\s*\d{1,4}(?:\.5)?\b|\d{2,4}(?:\.5)?\b|\d{1,2}\s+Rounds?\b)/i.test(String(line||''));
  const paragraphDistance=para=>{
    let total=0;
    for(const raw of String(para||'').split('\n')){
      const line=clean(raw);
      let m=line.match(/^(\d{1,2})\s*(?:x|×|✕)\s*(\d{1,4}(?:\.5)?)\b/i);
      if(m){total+=Number(m[1])*Number(m[2]);continue;}
      m=line.match(/^(\d{2,4}(?:\.5)?)\b/);
      if(m&&!/\b(?:underwater|breakout|streamline)\b/i.test(line))total+=Number(m[1]);
    }
    return total;
  };
  const looksRecovery=para=>/\b(?:warm.?down|cool.?down|easy|loosen|recovery|regeneration|regen)\b/i.test(String(para||''))&&paragraphDistance(para)<=800;
  const splitParagraphs=source=>text(source).split(/\n\s*\n+/).map(x=>x.replace(/^\n+|\n+$/g,'')).filter(x=>clean(x));

  function inferWithoutHeadings(source){
    const paras=splitParagraphs(source);
    if(!paras.length)return String(source||'');
    const workoutIdx=paras.map((p,i)=>({i,work:p.split('\n').some(runnable)})).filter(x=>x.work).map(x=>x.i);
    if(!workoutIdx.length)return String(source||'');
    const first=workoutIdx[0],last=workoutIdx.at(-1),prefix=paras.slice(0,first),work=paras.slice(first,last+1),suffix=paras.slice(last+1);
    if(work.length===1)return [...prefix,'WARM-UP',work[0],...suffix].join('\n\n');
    let main=1,score=-1;
    for(let i=1;i<work.length;i++){
      if(i===work.length-1&&looksRecovery(work[i]))continue;
      const d=paragraphDistance(work[i]),quality=/\b(?:main|threshold|overload|race|pace|max|kick|quality|anaerobic|aerobic)\b/i.test(work[i])?500:0;
      if(d+quality>score){score=d+quality;main=i;}
    }
    const finalIsWD=work.length>=3&&looksRecovery(work.at(-1));
    const out=[...prefix,'WARM-UP',work[0]];
    if(main>1)out.push('PRE-SET',...work.slice(1,main));
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
    const s=clean(value),lead='(?:@|\\bon(?=\\s*\\d))';
    let m=s.match(new RegExp(`${lead}\\s*(\\d+):(\\d{1,2}(?:\\.\\d+)?)\\b`,'i'));
    if(m)return Number(m[1])*60+Number(m[2]);
    m=s.match(new RegExp(`${lead}\\s*(\\d{1,2})[.](\\d{2})\\b`,'i'));
    if(m&&Number(m[2])<60)return Number(m[1])*60+Number(m[2]);
    m=s.match(new RegExp(`${lead}\\s*(\\d{2,3})\\b(?!\\s*(?:m|metres?|pace)\\b)`,'i'));
    if(m){const n=Number(m[1]);if(n>=20&&n<=300)return n;}
    return null;
  }
  function parseRestAnywhere(value){
    const s=clean(value);
    let m=s.match(/\b(\d{1,3})\s*(?:s|sec|seconds?)\s*(?:r|rest)\b/i);if(m)return Number(m[1]);
    m=s.match(/\b(?:r|rest)\b\s*(?:[·:=-]\s*)?(\d{1,3})\s*(?:s|sec|seconds?)?\b/i);if(m)return Number(m[1]);
    return null;
  }
  const missingTime=v=>v==null||v===''||!Number.isFinite(Number(v))||Number(v)<=0;
  const cueText=item=>[item?.raw,item?.text,...(item?.cues||[])].map(clean).filter(Boolean).join(' · ');
  const skillSubdistance=item=>item?.kind==='set'&&Number(item.reps)===1&&Number(item.distance)>0&&Number(item.distance)<=25&&/\b(?:underwater|breakout|streamline|dolphin|skills?)\b/i.test(clean(item.raw||item.text));

  function absorbSkillCue(items){
    for(let i=1;i<(items||[]).length;i++){
      const prev=items[i-1],cur=items[i];
      if(prev?.kind==='group'){absorbSkillCue(prev.items);continue;}
      if(cur?.kind==='group'){absorbSkillCue(cur.items);continue;}
      if(prev?.kind!=='set'||!skillSubdistance(cur)||Number(prev.distance)<=Number(cur.distance)||Number(prev.reps)<2)continue;
      prev.cues=prev.cues||[];
      const wording=clean(cur.raw||cur.text);
      if(wording&&!prev.cues.includes(wording))prev.cues.push(wording);
      const c=parseCycleAnywhere(wording);if(c!=null&&missingTime(prev.cycleSeconds))prev.cycleSeconds=c;
      items.splice(i,1);i--;
    }
  }

  function repairSet(item){
    if(!item||item.kind!=='set')return;
    const all=cueText(item);
    if(missingTime(item.cycleSeconds)){const c=parseCycleAnywhere(all);if(c!=null)item.cycleSeconds=c;}
    if(missingTime(item.restSeconds)){const r=parseRestAnywhere(all);if(r!=null)item.restSeconds=r;}
    const dm=all.match(/\bDesc(?:end(?:ing)?)?\s*1\s*[-–—]\s*(\d{1,2})\b/i);
    if(dm){const to=Number(dm[1]),cue=`Desc 1-${to}`;item.cues=item.cues||[];if(!item.cues.some(x=>new RegExp(`Desc(?:end(?:ing)?)?\\s*1\\s*[-–—]\\s*${to}`,'i').test(clean(x))))item.cues.push(cue);item.descent={from:1,to,repeat:Number(item.reps)>to};}
    item.pattern=item.pattern||[];
    for(const cue of item.cues||[]){
      const pm=clean(cue).match(/^(\d{1,2})\s*[-:]\s*(.+)$/);
      if(pm&&!/\b(?:rest|sec|seconds?)\b/i.test(pm[2])){const count=Number(pm[1]),label=clean(pm[2]);if(count>0&&!item.pattern.some(x=>Number(x.count)===count&&clean(x.text)===label))item.pattern.push({kind:'pattern',count,text:label});}
    }
    if(!(item.composition||[]).length){
      for(const cue of item.cues||[]){
        const hits=[...String(cue).matchAll(/(?:^|[:/·,+])\s*(\d{1,4}(?:\.5)?)\s*([^/·,+]*)/g)].map(m=>({distance:Number(m[1]),text:clean(m[2]).replace(/\b(?:rest|r)\b.*$/i,'').trim()})).filter(x=>x.distance>0&&x.distance<Number(item.distance));
        if(hits.length>=2&&Math.abs(hits.reduce((n,x)=>n+x.distance,0)-Number(item.distance))<.001){item.composition=hits;break;}
      }
    }
  }
  function repairItems(items){absorbSkillCue(items);for(const item of items||[]){if(item.kind==='set')repairSet(item);else if(item.kind==='group')repairItems(item.items);}}

  P.parse=function naturalParse(source,identity={}){
    const original=String(source??''),prepared=inferMissingOpening(original),session=baseParse(prepared,identity);
    for(const block of session.blocks||[])repairItems(block.items);
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

  X.infer=inferMissingOpening;X.parseCycle=parseCycleAnywhere;X.parseRest=parseRestAnywhere;X.repairSet=repairSet;X.absorbSkillCue=absorbSkillCue;
})(globalThis);
