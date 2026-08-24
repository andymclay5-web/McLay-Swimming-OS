'use strict';
(function(g){
  const M=g.MSOS4;if(!M?.ui||!M?.state)return;
  const U=M.util||{},S=M.swimmerTabsUI={build:'v4-swimmer-deck-only-20260824cp'};
  const text=v=>U.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U.escape?U.escape(String(v??'')):String(v??'');
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const currentSession=()=>M.currentSession?.()||null;
  function attending(session=currentSession()){
    const ids=new Set((M.state.attendance||[]).filter(x=>(x.session_id||x.sessionId)===session?.id&&['present','modified','late'].includes(norm(x.status))).map(x=>x.athlete_id||x.athleteId));
    if(ids.size)return (M.state.athletes||[]).filter(a=>a.active!==false&&ids.has(a.id));
    return (M.ui.presentAthletes?.()||[]).filter(a=>a?.active!==false);
  }
  function boardName(a,pool){return M.boardEngine?.name?.(a,pool)||text(a?.preferred_name||a?.nickname||a?.full_name).split(' ')[0]||'Swimmer';}
  function openAthlete(ath){
    if(!ath)return;
    M.state.settings.selectedAthleteId=ath.id;
    M.state.settings.loopAthleteTab='performance';
    try{M.storageEngine?.saveUi?.(M.state);}catch{}
    if(M.state.settings.view==='athletes')M.ui.renderAthletes?.();
    else if(M.navigationEngine?.go)M.navigationEngine.go('athletes',{restore:false});
    else M.nav?.show?.('athletes',{restoreScroll:false});
  }
  function installDeckPills(){
    document.querySelector('[data-msos-deck-athletes]')?.remove();
    const s=currentSession(),header=document.querySelector('.app-header');if(!s||!header)return;
    const rows=attending(s);if(!rows.length)return;
    const box=document.createElement('section');box.dataset.msosDeckAthletes='1';box.className='msos-deck-athletes';
    box.innerHTML=`<div class="msos-deck-label"><b>Here</b></div><div class="msos-deck-scroll">${rows.map(a=>`<button data-msos-deck-ath="${esc(a.id)}"><span>${esc(boardName(a,rows))}</span></button>`).join('')}</div>`;
    const anchor=header.querySelector('.squad-row');if(anchor)anchor.insertAdjacentElement('afterend',box);else header.append(box);
    box.querySelectorAll('[data-msos-deck-ath]').forEach(b=>b.onclick=()=>openAthlete(rows.find(a=>a.id===b.dataset.msosDeckAth)));
  }
  function install(){installDeckPills();g.addEventListener?.('msos:attendance-updated',installDeckPills);g.addEventListener?.('msos:session-changed',installDeckPills);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  S.installDeckPills=installDeckPills;S.openAthlete=openAthlete;
})(globalThis);
