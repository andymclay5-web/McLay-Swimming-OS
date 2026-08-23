'use strict';
(function(g){
  if(typeof Storage==='undefined'||!g.localStorage)return;
  const LIVE='mclay_swimming_os_v4';
  const mode=/tv/i.test(g.location?.pathname||'')?'tv':'portal';
  const PILOT=`mclay_swimming_os_v4_pilot_${mode}`;
  const p=Storage.prototype,get=p.getItem,set=p.setItem,remove=p.removeItem;
  try{
    if(!get.call(g.localStorage,PILOT)){
      const live=get.call(g.localStorage,LIVE);
      if(live)set.call(g.localStorage,PILOT,live);
    }
  }catch{}
  p.getItem=function(k){return get.call(this,k===LIVE?PILOT:k)};
  p.setItem=function(k,v){return set.call(this,k===LIVE?PILOT:k,v)};
  p.removeItem=function(k){return remove.call(this,k===LIVE?PILOT:k)};
  g.MSOSPilotStorage={mode,liveKey:LIVE,pilotKey:PILOT,reset(){try{remove.call(g.localStorage,PILOT)}catch{}}};
})(globalThis);
