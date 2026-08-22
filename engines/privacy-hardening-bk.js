'use strict';
(function(g){
  const M=g.MSOS4,A=M?.access,D=M?.meet,U=M?.util;
  if(!M||!A||!D)return;
  const BUILD='v4-guardian-privacy-20260822bk';
  const P=M.privacyHardeningBK={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const ownId=()=>String(M.state?.settings?.activeUserAthleteId||'');
  const role=()=>A.role?.()||'owner';
  const ownAudience=a=>['shared','swimmer'].includes(String(a||''));

  // Swimmer evidence is deny-by-default. Legacy evidence without an explicit v4
  // audience is coach-private, even when it already carries the swimmer id.
  const priorCaptureVisible=typeof A.captureVisible==='function'?A.captureVisible.bind(A):null;
  A.captureVisible=cap=>{
    const r=role();
    if(r!=='swimmer')return priorCaptureVisible?priorCaptureVisible(cap):r==='owner';
    const aid=ownId();
    if(!aid)return false;
    const ids=new Set([cap?.athlete_id,cap?.athleteId,...(cap?.athlete_ids||[]),...(cap?.athleteIds||[])].filter(Boolean).map(String));
    return ids.has(aid)&&ownAudience(cap?.audience);
  };

  // Meet projections are privacy filtered from canonical meet truth.
  D.visibleEntries=meetId=>{
    D.ensureState?.();
    const r=role(),aid=ownId();
    return (M.state.meetEntries||[]).filter(x=>{
      if(x.meet_id!==meetId)return false;
      if(r==='swimmer')return !!aid&&String(x.athlete_id)===aid;
      if(r==='assistant'){
        const ath=(M.state.athletes||[]).find(a=>a.id===x.athlete_id);
        return !!ath&&A.athleteAllowed?.(ath)===true;
      }
      return r==='owner';
    }).sort((a,b)=>(Number(a.event_number)||9999)-(Number(b.event_number)||9999)||(Number(a.heat)||9999)-(Number(b.heat)||9999));
  };
  D.visibleEvidence=entryId=>{
    D.ensureState?.();
    const r=role(),aid=ownId();
    return (M.state.meetEvidence||[]).filter(x=>{
      if(x.entry_id!==entryId)return false;
      if(r==='swimmer')return !!aid&&String(x.athlete_id)===aid&&ownAudience(x.audience);
      if(r==='assistant'){
        if(x.audience==='owner_only')return false;
        const ath=(M.state.athletes||[]).find(a=>a.id===x.athlete_id);
        return !!ath&&A.athleteAllowed?.(ath)===true;
      }
      return r==='owner';
    });
  };

  // app.js historically defined addEvidence twice; the later loose definition won.
  // Own this action here so a swimmer can never write evidence to another athlete.
  D.addEvidence=({meetId,entryId,raceId=null,athleteId=null,type='note',text:body='',audience='coach'}={})=>{
    D.ensureState?.();
    const r=role(),aid=ownId();
    const entry=(M.state.meetEntries||[]).find(x=>x.id===entryId)||null;
    let target=String(athleteId||entry?.athlete_id||'');
    if(r==='swimmer'){
      if(!aid||!entry||String(entry.athlete_id)!==aid||target!==aid)throw new Error('This is not your race');
      if(!A.can?.('capture.write_own'))throw new Error('Meet evidence is not permitted on this swimmer device');
      audience='shared';target=aid;
    }else if(r==='assistant'){
      if(!A.can?.('capture.write'))throw new Error('Meet evidence is not permitted');
      const ath=(M.state.athletes||[]).find(a=>String(a.id)===target);
      if(!ath||A.athleteAllowed?.(ath)!==true)throw new Error('This swimmer is not assigned to this assistant');
      if(audience==='owner_only')audience='coach';
    }else if(r==='owner'){
      if(A.can&&!A.can('capture.write')&&!A.can('meet.manage'))throw new Error('Meet evidence is not permitted');
    }else throw new Error('Meet evidence is not permitted');
    if(!entry&&entryId)throw new Error('Meet entry not found');
    const row={id:U?.uid?.('meet-evidence')||`meet-evidence-${Date.now()}`,meet_id:meetId||entry?.meet_id||D.current?.()?.id||'',entry_id:entryId||null,race_id:raceId,athlete_id:target||null,evidence_type:text(type)||'note',type:text(type)||'note',audience,text:text(body),created_at:U?.now?.()||new Date().toISOString(),updated_at:U?.now?.()||new Date().toISOString()};
    M.state.meetEvidence=M.state.meetEvidence||[];M.state.meetEvidence.push(row);M.store?.save?.(M.state);return row;
  };

  P.captureVisible=A.captureVisible;P.visibleEntries=D.visibleEntries;P.visibleEvidence=D.visibleEvidence;P.addEvidence=D.addEvidence;
})(globalThis);
