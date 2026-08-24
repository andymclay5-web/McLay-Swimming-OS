'use strict';
(function(g){
  const M=g.MSOS4,P=M?.performanceEngine;if(!P?.pathwayLadderForEvent)return;
  const X=M.swimmerPathwayRouteCV={build:'v4-swimmer-pathway-route-20260824cv'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase();
  const base=P.pathwayLadderForEvent.bind(P);
  function route(step){
    const s=norm(step?.displayLabel||step?.label);
    if(/\bnags\b|new zealand age|national lc age|nz championships|nz champs|nz open|national lc open|world.*long|world lc|olymp/.test(s))return'LCM';
    if(/\bnzsc\b|short course|national sc|division ii|division 2|canterbury sc|south island sc|secondary.*school.*sc|nzss.*sc|world.*short|world sc/.test(s))return'SCM';
    const c=text(step?.officialCourse||step?.course).toUpperCase();return c==='LCM'?'LCM':c==='SCM'?'SCM':'';
  }
  const strength=(a,b)=>{const as=Number(a?.seconds),bs=Number(b?.seconds);if(Number.isFinite(as)&&Number.isFinite(bs)&&as!==bs)return bs-as;return text(a?.label).localeCompare(text(b?.label));};
  function fix(lad,course){
    if(!lad)return lad;const seen=new Set(),all=[];
    for(const s of [...(lad.steps||[]),...(lad.tracks?.SCM||[]),...(lad.tracks?.LCM||[])]){
      if(!s)continue;const k=[s.label,s.kind,Number(s.seconds).toFixed(2),s.targetSeason||'',s.sourceSeason||''].join('|');if(seen.has(k))continue;seen.add(k);all.push({...s});
    }
    const tracks={SCM:[],LCM:[]};for(const s of all){const r=route(s);if(r)tracks[r].push({...s,course:r});}
    tracks.SCM.sort(strength);tracks.LCM.sort(strength);
    const c=String(course||lad.course||'SCM').toUpperCase()==='LCM'?'LCM':'SCM',main=tracks[c];
    return{...lad,steps:[...tracks[c],...tracks[c==='SCM'?'LCM':'SCM']],tracks,next:main.find(s=>!s.achieved)||null,nextQualifying:main.find(s=>s.kind==='qualifying'&&!s.achieved)||null,nextFinal:main.find(s=>s.kind==='finalist'&&!s.achieved)||null,nextMedal:main.find(s=>s.kind==='medal'&&!s.achieved)||null};
  }
  P.pathwayLadderForEvent=function(ath,event,opts={}){return fix(base(ath,event,opts),opts.course||event?.course||'SCM');};
  X.route=route;X.fix=fix;
})(globalThis);
