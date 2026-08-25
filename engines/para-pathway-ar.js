'use strict';
(function(g){
  const M=g.MSOS4,P=M?.pathway,UI=M?.ui,U=M?.util;if(!M||!P||!UI||!U)return;
  const BUILD='v4-para-mqs-pathway-20260821ar';
  const Q=M.paraPathwayAR={build:BUILD};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const sex=a=>P.sex?.(a?.sex)||text(a?.sex).toUpperCase();
  const klass=(a,stroke)=>text(P.paraClass?.(a,stroke)).toUpperCase().replace(/\s/g,'');
  const eventKey=(distance,stroke)=>`${Number(distance)}|${P.stroke?.(stroke)||text(stroke)}`;
  const refKey=(sx,cl,d,st)=>`${sx}|${cl}|${eventKey(d,st)}`;

  // Cameron Leslie tracking pack / WPS Singapore 2025 Appendix A.
  // MQS and MET are official LCM standards. The +5% bands below are derived coaching markers only.
  const OFFICIAL={
    'F|S6|50|Freestyle':[36.71,38.00],'F|S6|100|Freestyle':[82.80,85.15],'F|S6|400|Freestyle':[366.71,383.66],'F|S6|100|Backstroke':[94.96,101.27],'F|S6|50|Butterfly':[42.29,45.06],'F|SB6|100|Breaststroke':[109.23,112.71],'F|SM6|200|IM':[209.79,223.17],
    'F|S7|50|Freestyle':[36.12,36.72],'F|S7|100|Freestyle':[77.77,79.95],'F|S7|400|Freestyle':[357.16,367.33],'F|S7|100|Backstroke':[99.16,103.23],'F|S7|50|Butterfly':[41.01,42.18],'F|SB7|100|Breaststroke':[106.97,111.36],'F|SM7|200|IM':[207.21,215.65],
    'F|S8|50|Freestyle':[33.97,35.17],'F|S8|100|Freestyle':[76.13,77.37],'F|S8|400|Freestyle':[339.39,348.00],'F|S8|100|Backstroke':[87.31,89.84],'F|S8|100|Butterfly':[85.03,87.55],'F|SB8|100|Breaststroke':[91.44,95.24],'F|SM8|200|IM':[184.85,193.05],
    'F|S13|50|Freestyle':[29.51,30.47],'F|S13|100|Freestyle':[66.27,68.45],'F|S13|400|Freestyle':[357.06,360.93],'F|S13|100|Backstroke':[78.32,87.40],'F|S13|100|Butterfly':[87.25,87.25],'F|SB13|100|Breaststroke':[106.28,113.31],'F|SM13|200|IM':[172.13,185.19],
    'M|S6|50|Freestyle':[32.65,33.09],'M|S6|100|Freestyle':[71.31,72.38],'M|S6|400|Freestyle':[340.99,346.64],'M|S6|100|Backstroke':[83.58,85.93],'M|S6|50|Butterfly':[34.05,35.04],'M|SB6|100|Breaststroke':[90.21,92.18],'M|SM6|200|IM':[176.55,187.43],
    'M|S7|50|Freestyle':[30.83,31.88],'M|S7|100|Freestyle':[68.70,70.44],'M|S7|400|Freestyle':[316.74,323.87],'M|S7|100|Backstroke':[80.23,84.39],'M|S7|50|Butterfly':[33.53,34.11],'M|SB7|100|Breaststroke':[92.76,95.71],'M|SM7|200|IM':[179.53,183.76],
    'M|S8|50|Freestyle':[28.63,28.94],'M|S8|100|Freestyle':[61.61,62.60],'M|S8|400|Freestyle':[283.42,294.80],'M|S8|100|Backstroke':[72.97,74.94],'M|S8|100|Butterfly':[67.17,68.68],'M|SB8|100|Breaststroke':[78.25,80.91],'M|SM8|200|IM':[156.61,159.61],
    'M|S13|50|Freestyle':[25.45,25.75],'M|S13|100|Freestyle':[56.23,56.87],'M|S13|400|Freestyle':[277.86,288.16],'M|S13|100|Backstroke':[66.37,69.53],'M|S13|100|Butterfly':[62.25,63.99],'M|SB13|100|Breaststroke':[74.54,77.73],'M|SM13|200|IM':[142.26,148.99]
  };

  // Curated international performance benchmarks from Cameron Leslie's Aquagym tracking workbook.
  // [Manchester podium, Manchester final, Paris podium, Paris final]
  const CAM={
    'amber proudfoot':{'50|Freestyle':[31.07,33.24,30.79,32.97],'400|Freestyle':[308.94,329.99,300.13,315.65],'100|Backstroke':[80.35,86.01,78.36,82.89],'100|Breaststroke':[null,null,91.58,105.80],'100|Butterfly':[76.26,93.04,73.60,77.22],'200|IM':[169.94,186.37,161.29,173.10]},
    'mckenzie drage':{'100|Freestyle':[74.74,82.29,70.43,73.97],'400|Freestyle':[331.17,377.26,312.61,336.91],'100|Backstroke':[83.52,91.83,null,null],'100|Breaststroke':[76.73,81.00,84.50,88.15],'50|Butterfly':[36.86,38.06,35.40,37.74],'200|IM':[185.93,206.82,181.27,190.43]},
    'charlotte murphy':{'50|Freestyle':[34.34,37.88,33.01,35.95],'400|Freestyle':[319.69,375.35,321.36,361.73],'100|Backstroke':[82.00,95.39,82.24,95.02],'100|Breaststroke':[99.46,114.88,94.15,110.45],'50|Butterfly':[36.80,38.89,37.51,39.74],'200|IM':[182.96,197.48,183.60,208.28]},
    'ruby stace':{'50|Freestyle':[28.03,29.41,27.60,28.22],'100|Freestyle':[60.12,66.45,null,null],'400|Freestyle':[279.79,301.60,276.17,295.95],'100|Backstroke':[66.98,84.34,68.08,73.35],'100|Breaststroke':[78.45,83.08,78.52,83.82],'100|Butterfly':[66.18,71.27,65.43,67.53],'200|IM':[148.84,161.35,147.47,155.37]}
  };

  function official(ath,pb){
    if(!P.isPara?.(ath)||!pb)return null;const sx=sex(ath),cl=klass(ath,pb.stroke);if(!sx||!cl)return null;const row=OFFICIAL[refKey(sx,cl,pb.distance,pb.stroke)];
    return row?{mqs:Number(row[0]),met:Number(row[1]),class:cl,sex:sx,course:'LCM',source:'WPS Singapore 2025 Appendix A · Cameron Leslie tracking pack'}:null;
  }
  function bandPercents(pbSeconds,mqs){
    const gap=(Number(pbSeconds)/Number(mqs)-1)*100;if(!Number.isFinite(gap)||gap<=0)return[];
    if(gap<=20.0001)return[20,15,10,5].filter(x=>x<gap-.001);
    const start=Math.max(5,(Math.ceil(gap/5)*5)-5),out=[];for(let p=start;p>=5&&out.length<5;p-=5)out.push(p);return out;
  }
  function derivedRows(pbSeconds,ref){return bandPercents(pbSeconds,ref.mqs).map((pct,i)=>({id:`para-mqs-band-${pct}`,_seconds:ref.mqs*(1+pct/100),_kind:'development',_label:`MQS +${pct}% development`,standard_kind:'performance',programme:`MQS +${pct}% development`,progression_order:200+i,para_class:ref.class,course:'LCM',source_status:'DERIVED_COACHING_MARKER',notes:'Derived from official Singapore 2025 MQS. Coaching progression marker only; not an official qualifying standard.'}));}
  function officialRows(pbSeconds,ref){const out=[];if(pbSeconds>ref.met+.001)out.push({id:'para-met',_seconds:ref.met,_kind:'qualifying',_label:'International MET · Singapore 2025',standard_kind:'qualifying',programme:'International MET · Singapore 2025',progression_order:160,para_class:ref.class,course:'LCM',source_status:'OFFICIAL_WPS'});out.push({id:'para-mqs',_seconds:ref.mqs,_kind:'qualifying',_label:'International MQS · Singapore 2025',standard_kind:'qualifying',programme:'International MQS · Singapore 2025',progression_order:170,para_class:ref.class,course:'LCM',source_status:'OFFICIAL_WPS'});return out;}
  function camRows(ath,pb){const a=CAM[norm(ath?.full_name)],row=a?.[eventKey(pb.distance,pb.stroke)];if(!row)return[];const labels=['Manchester podium benchmark','Manchester final benchmark','Paris podium benchmark','Paris final benchmark'];return row.map((sec,i)=>Number(sec)>0?{id:`cam-${i}`,_seconds:Number(sec),_kind:i%2===0?'medal':'finalist',_label:labels[i],standard_kind:'performance',programme:labels[i],progression_order:300+i,source_status:'CAMERON_LESLIE_TRACKING'}:null).filter(Boolean);}
  function dedupe(rows){const seen=new Set();return(rows||[]).filter(r=>{const s=Number(r?._seconds);if(!Number.isFinite(s)||s<=0)return false;const k=`${norm(r?._label)}|${s.toFixed(2)}`;if(seen.has(k))return false;seen.add(k);return true});}

  const baseEvent=P.event.bind(P);
  P.event=(ath,pb)=>{
    const base=baseEvent(ath,pb);if(!P.isPara?.(ath))return base;const ref=official(ath,pb);if(!ref)return{...base,paraInternational:{status:'missing',class:klass(ath,pb.stroke),event:eventKey(pb.distance,pb.stroke)}};
    const pbSec=Number(pb.result_seconds),oldQual=[...(base.qualifying||[])],unachievedDomestic=oldQual.filter(r=>pbSec>Number(r._seconds)+.001),officialQ=officialRows(pbSec,ref),derived=derivedRows(pbSec,ref),historic=camRows(ath,pb);
    const qualifying=dedupe([...unachievedDomestic,...officialQ]),deeper=dedupe([...(base.deeper||[]),...derived,...historic]);
    const allAhead=[...qualifying,...deeper].filter(r=>pbSec>Number(r._seconds)+.001).sort((a,b)=>((pbSec-a._seconds)/a._seconds)-((pbSec-b._seconds)/b._seconds)),next=allAhead[0]||null;
    return{...base,qualifying,deeper,nextNational:next?{row:next,gap:P.gap(pbSec,next._seconds)}:base.nextNational,paraInternational:{status:'loaded',...ref,pbCourse:pb.course,crossCourseTracking:pb.course!=='LCM',derivedBands:derived.map(x=>x._label),next:next?next._label:null}};
  };

  const baseProfile=P.profile.bind(P);
  P.profile=(ath,course='')=>{const profile=baseProfile(ath,course);if(!P.isPara?.(ath))return profile;const events=profile.events||[],closest=events.filter(e=>e.nextNational).sort((a,b)=>a.nextNational.gap.percentage-b.nextNational.gap.percentage)[0]||null;return{...profile,events,closest,paraInternational:true};};

  function decorate(){
    const ath=(M.state?.athletes||[]).find(a=>a.id===M.state?.settings?.selectedAthleteId);if(!ath||!P.isPara?.(ath))return;const panel=document.querySelector('#athletesView [data-msos-ath-panel="pathway"]');if(!panel)return;const head=panel.querySelector('.msos-pathway-head');if(!head||head.dataset.paraAr)return;head.dataset.paraAr='1';const p=head.querySelector('p.muted');if(p)p.innerHTML='<b>Para pathway:</b> official International MET/MQS, then 5% MQS development bands and loaded international final/podium benchmarks in actual performance order. Derived bands are coaching markers, not qualifying standards. MQS/MET are LCM; an SCM PB comparison is tracking context only.';const h=head.querySelector('h2');if(h)h.textContent='International performance pathway';
  }
  M.surfaceBridge?.register?.('athletes','para-pathway-ar',()=>{queueMicrotask(decorate);requestAnimationFrame(decorate);});
  const host=document.querySelector('#athletesView');if(host)new MutationObserver(()=>requestAnimationFrame(decorate)).observe(host,{childList:true,subtree:true});

  Q.OFFICIAL=OFFICIAL;Q.CAM=CAM;Q.official=official;Q.bandPercents=bandPercents;Q.derivedRows=derivedRows;Q.camRows=camRows;
  Q.summary=(ath,pb)=>{const ref=official(ath,pb);if(!ref)return null;const gap=(Number(pb.result_seconds)/ref.mqs-1)*100;return{class:ref.class,event:eventKey(pb.distance,pb.stroke),mqs:ref.mqs,met:ref.met,gapPct:gap,bands:bandPercents(pb.result_seconds,ref.mqs),crossCourse:pb.course!=='LCM'};};
})(globalThis);
