'use strict';
(function(g){
 const M=g.MSOS4;if(!M)return;
 const key=a=>String(a?.full_name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const historical=a=>key(a)==='sophienewlove';
 const fixture=a=>/^meet[ab]$/.test(key(a))&&!a?.date_of_birth&&!a?.dob;
 const P=M.rosterPolicy={build:'v4-roster-policy-20260826'};
 P.visible=a=>!!a&&a.active!==false&&!historical(a)&&!fixture(a);
 P.apply=(state=M.state)=>{if(!state)return false;let changed=false;const blocked=new Set();for(const a of state.athletes||[]){if(historical(a)||fixture(a)){blocked.add(a.id);if(a.active!==false){a.active=false;changed=true}}}const q=state.settings||{};if(Array.isArray(q.timingRoster)){const n=q.timingRoster.filter(id=>!blocked.has(id));if(n.length!==q.timingRoster.length){q.timingRoster=n;changed=true}}if(blocked.has(q.selectedAthleteId)){q.selectedAthleteId='';changed=true}if(blocked.has(q.selectedSwimmerId)){q.selectedSwimmerId='';changed=true}return changed};
 P.isHistorical=historical;P.isFixture=fixture;P.apply(M.state);
})(globalThis);
