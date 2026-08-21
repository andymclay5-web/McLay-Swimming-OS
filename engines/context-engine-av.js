'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M)return;
  const BUILD='v4-context-voice-foundation-20260822av';
  const C=M.contextEngineAV={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const nzDate=d=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Auckland',year:'numeric',month:'2-digit',day:'2-digit'}).format(d||new Date());}catch{return new Date(d||Date.now()).toISOString().slice(0,10);}};
  const clock=s=>M.util?.clock?M.util.clock(Number(s)):String(s??'—');
  const current=()=>M.currentSession?.()||null;
  const itemText=i=>text([i?.raw,i?.text,...(i?.cues||[])].filter(Boolean).join(' '));
  const ordered=(session)=>{const out=[];for(const b of session?.blocks||[]){const walk=(items,rounds=1)=>{for(const x of items||[]){if(x?.kind==='group')walk(x.items||[],rounds*Math.max(1,Number(x.rounds)||1));else if(x?.kind==='set')out.push({block:b,item:x,rounds});}};walk(b.items||[]);}return out;};
  function swimEstimate(item,rounds=1){
    const reps=Math.max(1,Number(item?.reps)||1)*Math.max(1,Number(rounds)||1),d=Math.max(0,Number(item?.distance)||0),cycle=Number(item?.cycleSeconds),rest=Number(item?.restSeconds);
    if(cycle>0)return Math.max(cycle,15)*reps;
    if(rest>=0&&d>0){const pace=/\b(?:max|sprint|race|pace|fast)\b/i.test(itemText(item))?1.0:/\b(?:easy|regen|recovery|warm)\b/i.test(itemText(item))?1.7:1.35;return Math.max(10,d*pace)+Math.max(0,reps-1)*(Math.max(10,d*pace)+rest);}
    if(d>0){const pace=/\b(?:max|sprint|race|pace|fast)\b/i.test(itemText(item))?1.0:/\b(?:easy|regen|recovery|warm)\b/i.test(itemText(item))?1.7:1.35;return Math.max(15,reps*d*pace);}
    return 20;
  }
  function transitionSeconds(item,next){const a=itemText(item),b=itemText(next);let x=18;if(/\b(?:fins?|paddles?|pull|bands?|parachute|cords?)\b/i.test(a+b))x+=12;if(/\b(?:dive|start|video|test|t400)\b/i.test(a+b))x+=20;return x;}
  function sessionStart(session){
    const date=session?.identity?.date||session?.session_date||nzDate(),raw=text(session?.identity?.time||session?.start_time||session?.identity?.startTime||'');const m=raw.match(/(\d{1,2}):(\d{2})/);if(!m)return null;const d=new Date(`${date}T${String(m[1]).padStart(2,'0')}:${m[2]}:00`);return Number.isFinite(d.getTime())?d:null;
  }
  function plannedTimeline(session,{startAt=null,coachingBufferSeconds=420}={}){
    const rows=ordered(session),start=startAt instanceof Date?startAt:sessionStart(session)||new Date(),base=start.getTime();let elapsed=0;const line=[];
    const perItemBuffer=rows.length?Math.max(0,Number(coachingBufferSeconds)||0)/rows.length:0;
    for(let i=0;i<rows.length;i++){const r=rows[i],duration=swimEstimate(r.item,r.rounds),from=new Date(base+elapsed*1000);elapsed+=duration+perItemBuffer+(i<rows.length-1?transitionSeconds(r.item,rows[i+1].item):0);line.push({index:i,blockId:r.block.id,itemId:r.item.id,blockLabel:r.block.title||r.block.label||r.block.type||'Set',itemLabel:itemText(r.item),plannedStart:from.toISOString(),plannedEnd:new Date(base+elapsed*1000).toISOString(),durationSeconds:Math.round(duration)});}
    return{sessionId:session?.id||'',start:start.toISOString(),end:new Date(base+elapsed*1000).toISOString(),durationSeconds:Math.round(elapsed),rows:line,method:'authored cycles/rest + practical swim estimate + transition/coaching allowance'};
  }
  const anchorStore=()=>{M.state.contextAnchors=M.state.contextAnchors||[];return M.state.contextAnchors;};
  function addAnchor({session=current(),itemId='',blockId='',rep=null,label='',source='coach',at=new Date()}={}){
    if(!session)return null;const a={id:M.util?.uid?.('ctx')||`ctx-${Date.now()}`,sessionId:session.id,itemId:itemId||'',blockId:blockId||'',rep:Number(rep)||null,label:text(label),source:text(source)||'coach',at:(at instanceof Date?at:new Date(at)).toISOString(),createdAt:new Date().toISOString()};anchorStore().push(a);if(anchorStore().length>300)M.state.contextAnchors=anchorStore().slice(-300);M.store?.save?.(M.state);return a;
  }
  function latestAnchor(session=current()){if(!session)return null;return[...anchorStore()].reverse().find(a=>a.sessionId===session.id)||null;}
  function indexFromAnchor(timeline,anchor){if(!anchor)return-1;if(anchor.itemId){const i=timeline.rows.findIndex(r=>r.itemId===anchor.itemId);if(i>=0)return i;}if(anchor.blockId){const i=timeline.rows.findIndex(r=>r.blockId===anchor.blockId);if(i>=0)return i;}return-1;}
  function nowContext(session=current(),now=new Date()){
    if(!session)return{status:'none',confidence:0};const timeline=plannedTimeline(session),anchor=latestAnchor(session),nowMs=(now instanceof Date?now:new Date(now)).getTime();let idx=-1,confidence=.48,source='estimated timeline',driftSeconds=0;
    if(anchor){const ai=indexFromAnchor(timeline,anchor);if(ai>=0){idx=ai;const planned=Date.parse(timeline.rows[ai].plannedStart),actual=Date.parse(anchor.at);driftSeconds=Math.round((actual-planned)/1000);const adjusted=timeline.rows.map(r=>({...r,adjustedStart:new Date(Date.parse(r.plannedStart)+driftSeconds*1000).toISOString(),adjustedEnd:new Date(Date.parse(r.plannedEnd)+driftSeconds*1000).toISOString()}));let found=adjusted.findIndex(r=>nowMs>=Date.parse(r.adjustedStart)&&nowMs<Date.parse(r.adjustedEnd));if(found>=0)idx=found;confidence=.9;source=`${anchor.source||'coach'} anchor`;}}
    if(idx<0){idx=timeline.rows.findIndex(r=>nowMs>=Date.parse(r.plannedStart)&&nowMs<Date.parse(r.plannedEnd));if(idx<0&&timeline.rows.length)idx=nowMs<Date.parse(timeline.rows[0].plannedStart)?0:timeline.rows.length-1;}
    const row=timeline.rows[idx]||null,block=session.blocks?.find(b=>b.id===row?.blockId)||null,item=row?ordered(session).find(x=>x.item.id===row.itemId)?.item:null;return{status:row?'active':'none',sessionId:session.id,blockId:row?.blockId||'',itemId:row?.itemId||'',blockLabel:row?.blockLabel||'',itemLabel:row?.itemLabel||'',rep:anchor&&anchor.itemId===row?.itemId?anchor.rep:null,confidence,source,driftSeconds,planned:row,timeline,anchor,item,block};
  }
  function resolveAthlete(name,state=M.state){const q=text(name).toLowerCase();if(!q)return null;const here=M.ui?.presentAthletes?.()||[],pool=here.length?here:(state?.athletes||[]),exact=pool.find(a=>text(a.full_name).toLowerCase()===q);if(exact)return exact;const first=pool.filter(a=>text(a.full_name).toLowerCase().split(' ')[0]===q);if(first.length===1)return first[0];const incl=pool.filter(a=>text(a.full_name).toLowerCase().includes(q));return incl.length===1?incl[0]:null;}
  function parseVoice(input,{session=current(),state=M.state}={}){
    const raw=text(input),ctx=nowContext(session),lower=raw.toLowerCase(),athletes=state?.athletes||[];let athlete=null;for(const a of athletes){const full=text(a.full_name),first=full.split(' ')[0];if(new RegExp(`\\b${full.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'i').test(raw)||new RegExp(`^${first.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'i').test(raw)){athlete=a;break;}}
    let m=lower.match(/(?:starting|start|on)\s+(?:the\s+)?(.+)/i);if(m&&/\b(?:set|main|warm|pre|post|round|x|×|\d)\b/i.test(m[1]))return{intent:'context_anchor',athlete:null,query:null,payload:{label:text(m[1])},context:ctx,raw};
    m=lower.match(/\b(?:rep|number|#)\s*(\d+)\b/);const rep=m?Number(m[1]):null;
    if(/\b(?:pb|personal best)\b/.test(lower))return{intent:'query_pb',athlete,query:raw,payload:{},context:ctx,raw};
    if(/\b(?:target|targets|times? for this set|what.*hit|supposed to hit)\b/.test(lower))return{intent:'query_targets',athlete,query:raw,payload:{},context:ctx,raw};
    if(/\b(?:tv|board)\b/.test(lower)&&/\b(?:video|photo|show|display)\b/.test(lower))return{intent:'display_evidence',athlete,query:raw,payload:{destination:'tv'},context:ctx,raw};
    if(/\b(?:conversation|record conversation)\b/.test(lower))return{intent:'conversation',athlete,query:null,payload:{},context:ctx,raw};
    if(/\bvideo\b/.test(lower))return{intent:'video',athlete,query:null,payload:{},context:ctx,raw};
    const nums=[...raw.matchAll(/(?<!\d)(\d{1,3}(?:\.\d)?)(?!\d)/g)].map(x=>Number(x[1]));const sr=raw.match(/stroke\s*rate\s*(\d{1,3}(?:\.\d)?)/i),rpe=raw.match(/\brpe\s*(\d{1,2}(?:\.\d)?)/i),hr=raw.match(/(?:heart\s*rate|\bhr)\s*(\d{2,3})/i);return{intent:'capture_note',athlete,query:null,payload:{rep,strokeRate:sr?Number(sr[1]):null,rpe:rpe?Number(rpe[1]):null,heartRate:hr?Number(hr[1]):null,numbers:nums,note:raw},context:ctx,raw};
  }
  function compactContext(ctx=nowContext()){if(!ctx||ctx.status!=='active')return'No live session context';const bits=[ctx.blockLabel,ctx.itemLabel,ctx.rep?`rep ${ctx.rep}`:'',ctx.driftSeconds?`${ctx.driftSeconds>0?'+':''}${Math.round(ctx.driftSeconds/60)} min drift`:'',`${Math.round(ctx.confidence*100)}% context`].filter(Boolean);return bits.join(' · ');}
  C.plannedTimeline=plannedTimeline;C.addAnchor=addAnchor;C.latestAnchor=latestAnchor;C.now=nowContext;C.resolveAthlete=resolveAthlete;C.parseVoice=parseVoice;C.compact=compactContext;C.ordered=ordered;C.swimEstimate=swimEstimate;
})(globalThis);
