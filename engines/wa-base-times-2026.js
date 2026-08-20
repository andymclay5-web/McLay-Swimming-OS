'use strict';
(function(g){
  const M=g.MSOS4;if(!M)return;
  const VERSION='WA active 2026 · SCM 2025 / LCM 2026';
  const SOURCE='World Aquatics Points - Base Times · published 27 Jan 2026 / points page updated 25 Feb 2026';
  const rows=[];
  const add=(course,validFrom,validTo,data)=>{for(const [distance,stroke,men,women] of data){for(const [sex,base] of [['M',men],['F',women]])rows.push({id:`wa-${course}-${sex}-${distance}-${String(stroke).toLowerCase().replace(/[^a-z]+/g,'-')}`,course,distance,stroke,sex,base_seconds:base,table_version:VERSION,source_table:course==='SCM'?'SCM 2025':'LCM 2026',effective_from:validFrom,effective_to:validTo,source:SOURCE,active:true});}};
  add('SCM','2025-09-01','2026-08-31',[
    [50,'Freestyle',19.90,22.83],[100,'Freestyle',44.84,50.25],[200,'Freestyle',98.61,110.31],[400,'Freestyle',212.25,230.25],[800,'Freestyle',440.46,477.42],[1500,'Freestyle',846.88,908.24],
    [50,'Backstroke',22.11,25.23],[100,'Backstroke',48.33,54.02],[200,'Backstroke',105.63,118.04],
    [50,'Breaststroke',24.95,28.37],[100,'Breaststroke',55.28,62.36],[200,'Breaststroke',120.16,132.50],
    [50,'Butterfly',21.32,23.94],[100,'Butterfly',47.71,52.71],[200,'Butterfly',106.85,119.32],
    [100,'IM',49.28,55.11],[200,'IM',108.88,121.63],[400,'IM',234.81,255.48]
  ]);
  add('LCM','2026-01-01','2026-12-31',[
    [50,'Freestyle',20.91,23.61],[100,'Freestyle',46.40,51.71],[200,'Freestyle',102.00,112.23],[400,'Freestyle',219.96,234.18],[800,'Freestyle',452.12,484.12],[1500,'Freestyle',870.67,920.48],
    [50,'Backstroke',23.55,26.86],[100,'Backstroke',51.60,57.13],[200,'Backstroke',111.92,123.14],
    [50,'Breaststroke',25.95,29.16],[100,'Breaststroke',56.88,64.13],[200,'Breaststroke',125.48,137.55],
    [50,'Butterfly',22.27,24.43],[100,'Butterfly',49.45,54.60],[200,'Butterfly',110.34,121.81],
    [200,'IM',112.69,125.70],[400,'IM',242.50,263.65]
  ]);
  const existing=M.state?.worldAquaticsBaseTimes||[];
  if(M.state&&!M.state?.dataRegistry?.active?.wa_points){const map=new Map();for(const r of [...rows,...existing])map.set(r.id||`${r.course}|${r.sex}|${r.distance}|${r.stroke}`,r);M.state.worldAquaticsBaseTimes=[...map.values()];M.state._refs=M.state._refs||{};if(!(M.state._refs.world_aquatics_base_times||[]).length)M.state._refs.world_aquatics_base_times=rows;}
  M.waBaseTimesSeed={build:'v4-wa-base-times-20260820u',version:VERSION,source:SOURCE,rows};
})(globalThis);
