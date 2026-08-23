'use strict';
(function(root,factory){const api=factory(root.MSOSEngines?.Evidence);if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.Aerobic=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  const VERSION='2.2.2-cc';
  const AEROBIC={50:{10:{Regeneration:1.062,Development:1.033,Overload:1.002,Threshold:.969,Clearance:.941},30:{Regeneration:1.02,Development:.989,Overload:.961,Threshold:.931,Clearance:.91},divisor:8},100:{10:{Regeneration:1.1165,Development:1.08,Overload:1.05,Threshold:1.024,Clearance:1},30:{Regeneration:1.093,Development:1.048,Overload:1.024,Threshold:.995,Clearance:.972},divisor:4},200:{10:{Regeneration:1.1405,Development:1.0945,Overload:1.0687,Threshold:1.0474,Clearance:1.0225},30:{Regeneration:1.1261,Development:1.081,Overload:1.055,Threshold:1.02518,Clearance:1.0087},divisor:2},400:{10:{Regeneration:1.156,Development:1.1142,Overload:1.091,Threshold:1.0686,Clearance:1.04759},30:{Regeneration:1.1515,Development:1.103,Overload:1.0731,Threshold:1.0554,Clearance:1.036},divisor:1}};
  const RUSHTON={Regeneration:{hr:'<140',sr:'<30'},Development:{hr:'<140',sr:'~30'},Overload:{hr:'~150',sr:'31–33'},Threshold:{hr:'160–165',sr:'33–35'},Clearance:{hr:'165–185',sr:'35–45'}};
  const clock=s=>{s=Number(s);if(!Number.isFinite(s))return'—';const m=Math.floor(s/60),x=s-m*60,t=x.toFixed(Math.abs(x-Math.round(x))>.001?1:0);return m?`${m}:${t.padStart(t.includes('.')?4:2,'0')}`:t};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function t400(ath,state,stroke='Freestyle'){const rows=E?.t400Rows?.(ath,state,stroke)||[];return rows[0]||null}
  function hasAthleteEvidence(ath,state){if(!ath)return false;for(const st of ['Freestyle','Backstroke','Breaststroke','Butterfly','IM'])if((E?.t400Rows?.(ath,state,st)||[]).length)return true;try{if((E?.pbRows?.(ath,state)||[]).length)return true}catch{}return false;}
  function authoredRest(item,fallback=10){
    const rawDirect=item?.restSeconds;if(rawDirect!==null&&rawDirect!==undefined&&rawDirect!==''){const direct=Number(rawDirect);if(Number.isFinite(direct)&&direct>=0)return direct;}
    const lines=[item?.raw,item?.text,...(item?.cues||[])].map(text).filter(Boolean);
    for(const line of lines){
      let m=line.match(/\bRest\s*(?:·|:|-)?\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i);
      if(!m)m=line.match(/\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\s*(?:·|-)?\s*Rest\b/i);
      if(m)return Number(m[1]);
    }
    return Math.max(0,Number(fallback)||0);
  }
  function sendOff(target,rest){if(!Number.isFinite(Number(target)))return null;return Math.ceil((Math.floor(Number(target))+Math.max(0,Number(rest)||0))/5)*5}
  function target(anchor,distance,zone,rest=10){const d=Number(distance),base=[50,100,200,400].includes(d)?d:d<50?50:d<100?100:d<200?200:400,t=AEROBIC[base];if(!t||!zone||d<=0||d>400)return null;const authored=Math.max(0,Number(rest)||0),model=authored>=20?30:10,c=t[model]?.[zone];if(!c)return null;const seconds=(Number(anchor)/t.divisor)*c*(d/base);return{seconds,sendOff:sendOff(seconds,authored),authoredRest:authored,modelRest:model,source:`T400 ${base}m ${zone}`}}
  function fallback(zone,stroke='Freestyle'){const z=RUSHTON[zone];if(!z)return null;const st=E?.stroke?.(stroke)||stroke;return{status:'fallback',kind:'hr_sr',hr:z.hr,sr:st==='Freestyle'?z.sr:'',stroke:st,source:'Rushton Cone'}}
  function forItem(session,item,ath,state,strokeOverride=''){
    if(!item?.zone&&!item?.repPattern?.length)return{status:'none'};
    const st=E?.stroke?.(strokeOverride||item?.stroke||'Freestyle')||'Freestyle',rest=authoredRest(item,10);
    if(st==='Choice')return{status:'none',reason:'Choice aerobic work'};
    const a=t400(ath,state,st);
    if(!a){
      if(item?.repPattern?.length)return{status:'pattern_fallback',rows:item.repPattern.map(p=>({rep:p.rep,zone:p.zone,...fallback(p.zone,st)})),source:'Rushton Cone',stroke:st,message:`No ${st} T400 loaded · HR/SR guide`};
      const guide=fallback(item.zone,st);return guide?{...guide,message:`No ${st} T400 loaded · HR/SR guide`}:{status:'missing',message:`No aerobic guide for ${item.zone||'this work'}`,stroke:st};
    }
    const sec=E.seconds(a);
    if(item?.repPattern?.length)return{status:'pattern',rows:item.repPattern.map(p=>({rep:p.rep,zone:p.zone,...target(sec,item.distance,p.zone,rest)})),source:`${st} T400 ${clock(sec)}`,stroke:st};
    const r=target(sec,item.distance,item.zone,rest);return r?{status:'ok',...r,source:`${st} T400 ${clock(sec)}`,stroke:st}:{status:'missing',message:'No valid T400 coefficient'}
  }
  return{VERSION,t400,hasAthleteEvidence,target,fallback,forItem,clock,RUSHTON,authoredRest};
});