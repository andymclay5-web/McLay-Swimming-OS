'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.V4Adapter=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-ax';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function create({M={},E={},Performance=null,SwimmerDeck=null}={}){
    const state=()=>M.state||{};
    const currentSession=()=>M.currentSession?.()||null;
    const athletes=()=>state().athletes||[];
    const pbRows=ath=>E.Evidence?.pbRows?.(ath,state())||[];
    const dedupedPBs=ath=>Performance?.dedupePBs?.(pbRows(ath))||[];
    function queryPB({athlete,event,session=currentSession()}){if(!athlete)return null;const course=text(event?.course||session?.identity?.course||state().settings?.pathwayCourse||'SCM').toUpperCase();const pb=Performance?.findPB?.(dedupedPBs(athlete),{...event,course});if(!pb)return null;return{speak:`${athlete.full_name}. ${pb.distance} ${pb.stroke}, ${M.util?.clock?.(pb.seconds)||pb.seconds}, ${pb.course}.`,pb};}
    function queryTargets({athlete,context,session=currentSession()}){if(!athlete||!session||!context?.itemId)return null;const find=items=>{for(const x of items||[]){if(x.id===context.itemId)return x;if(x.kind==='group'){const h=find(x.items);if(h)return h;}}return null;};let item=null;for(const b of session.blocks||[]){item=find(b.items);if(item)break;}if(!item)return null;const p=E.Coordinator?.prescription?.(session,item,athlete,state());if(!p)return null;return{prescription:p,speak:targetSpeech(athlete,p,M)};}
    function targetSpeech(ath,p,M0=M){const t=p.target||{},work=text(p.item?.raw||p.item?.text||'current set'),name=ath.full_name||'Swimmer',clock=x=>M0.util?.clock?.(Number(x))||String(x);if(t.status==='ok')return`${name}. ${work}. Target ${clock(t.seconds)}${t.sendOff?`, leave on ${clock(t.sendOff)}`:''}.`;if(t.status==='pattern')return`${name}. ${work}. ${(t.rows||[]).map(r=>`${r.zone} ${clock(r.seconds)}`).join(', ')}.`;if(t.status==='rep_race')return`${name}. ${(t.rows||[]).filter(r=>r.status==='ok').map(r=>`rep ${r.rep}, ${clock(r.seconds)}`).join(', ')}.`;if(t.kind==='hr_sr')return`${name}. ${work}. Heart rate ${t.hr}${t.sr?`, stroke rate ${t.sr}`:''}.`;return t.message||`No precise target for ${name}.`;}
    function buildDeck(athlete,{milestones=[],pointsFor=null,course='',opportunities=[]}={}){if(!SwimmerDeck)return null;return SwimmerDeck.quickView({athlete,resultRows:pbRows(athlete),milestones,pointsFor,course,opportunities});}
    function currentPrescriptions(session=currentSession(),item,roster=[]){if(!session||!item)return[];return roster.map(ath=>{const p=E.Coordinator?.prescription?.(session,item,ath,state())||{item,target:{status:'none'}};return{athlete:ath,item:p.item||item,target:p.target||{status:'none'},prescription:p};});}
    function resolveContextLabel(label,{session=currentSession()}={}){const q=text(label).toLowerCase();if(!session)return null;for(const b of session.blocks||[]){const bn=text(b.title||b.label||b.type).toLowerCase();if(bn&&q.includes(bn))return{blockId:b.id,itemId:null};const stack=[...(b.items||[])];while(stack.length){const x=stack.shift();if(x?.kind==='group')stack.unshift(...(x.items||[]));else if(x?.id){const lead=text(x.raw||x.text).toLowerCase();if(lead&&q.includes(lead.slice(0,Math.min(28,lead.length))))return{blockId:b.id,itemId:x.id};}}}return null;}
    function nextContext(ctx,{session=currentSession()}={}){if(!session)return null;const rows=[];const walk=(items,b)=>{for(const x of items||[]){if(x.kind==='group')walk(x.items||[],b);else if(x.kind==='set')rows.push({blockId:b.id,itemId:x.id});}};for(const b of session.blocks||[])walk(b.items||[],b);const i=rows.findIndex(x=>x.itemId===ctx?.itemId);return rows[i+1]||null;}
    function openVideo({athlete,context}){if(!M.actions?.openCapture)return null;M.actions.openCapture({athleteId:athlete?.id||'',blockId:context?.blockId||'',itemId:context?.itemId||'',mode:'video'});return{opened:true,athleteId:athlete?.id||null};}
    return{VERSION,state,currentSession,athletes,pbRows,dedupedPBs,queryPB,queryTargets,targetSpeech,buildDeck,currentPrescriptions,resolveContextLabel,nextContext,openVideo};
  }
  return{VERSION,create};
});
