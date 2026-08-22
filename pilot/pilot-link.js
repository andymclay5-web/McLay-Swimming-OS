'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSPilotLink=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-bm';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  const PILOTS=Object.freeze([
    {slug:'matthew-robertson',name:'Matthew Robertson',cohort:'club-pilot',remote:false,confirmed:true},
    {slug:'molly-mckernan',name:'Molly McKernan',cohort:'club-and-remote-pilot',remote:true,confirmed:true},
    {slug:'erin-mcbain',name:'Erin McBain',cohort:'ashburton-candidate',remote:true,confirmed:false},
    {slug:'isabelle-morten',name:'Isabelle Morten',cohort:'ashburton-candidate',remote:true,confirmed:false},
    {slug:'elliot-watson',name:'Elliot Watson',cohort:'ashburton-candidate',remote:true,confirmed:false},
    {slug:'william-summerfield',name:'William Summerfield',cohort:'ashburton-candidate',remote:true,confirmed:false}
  ]);

  function pilot(slug){return PILOTS.find(x=>x.slug===norm(slug))||null;}
  function findAthlete(state,entry){
    if(!entry)return null;
    const wanted=text(entry.name).toLowerCase();
    return (state?.athletes||[]).find(a=>a?.active!==false&&text(a.full_name||a.name).toLowerCase()===wanted)||null;
  }
  function matchingSessions(state,athlete){
    if(!athlete)return[];
    const squad=text(athlete.squad).toLowerCase();
    return Object.values(state?.canonicalSessions||{}).filter(s=>{
      const squads=(s?.identity?.squads||[]).map(x=>text(x).toLowerCase());
      return !squads.length||squads.includes(squad);
    }).sort((a,b)=>`${b?.identity?.date||''}|${b?.identity?.dayPart||''}`.localeCompare(`${a?.identity?.date||''}|${a?.identity?.dayPart||''}`));
  }
  function attended(state,sessionId,athleteId){
    const row=(state?.attendance||[]).find(x=>x.session_id===sessionId&&x.athlete_id===athleteId);
    return ['present','modified','late'].includes(text(row?.status).toLowerCase());
  }
  function chooseSession(state,athlete,{preferSelected=true,allowRemote=true}={}){
    const rows=matchingSessions(state,athlete);
    const selected=state?.settings?.selectedSessionId;
    if(preferSelected&&selected){
      const hit=rows.find(s=>s.id===selected);
      if(hit&&(attended(state,hit.id,athlete.id)||allowRemote))return hit;
    }
    const attendedHit=rows.find(s=>attended(state,s.id,athlete.id));
    return attendedHit||((allowRemote&&rows[0])||null);
  }
  function resolve(state,slug,options={}){
    const entry=pilot(slug),athlete=findAthlete(state,entry),session=athlete?chooseSession(state,athlete,{allowRemote:entry?.remote!==false,...options}):null;
    return{
      entry,athlete,session,
      status:!entry?'unknown-pilot':!athlete?'roster-match-needed':!entry.confirmed?'candidate-needs-confirmation':session?'ready':'no-session',
      remote:!!entry?.remote,
      attended:!!(athlete&&session&&attended(state,session.id,athlete.id))
    };
  }
  return{VERSION,text,norm,PILOTS,pilot,findAthlete,matchingSessions,attended,chooseSession,resolve};
});
