'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines?.Evidence;if(!M||!E?.t400Rows||E.__msosT400Compat)return;
  const base=E.t400Rows.bind(E),text=v=>String(v??'').trim();
  function sec(v){if(v==null||v==='')return NaN;if(Number.isFinite(Number(v))&&Number(v)>120)return Number(v);const s=text(v);let m=s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);if(m)return Number(m[1])*60+Number(m[2]);m=s.match(/^(\d+(?:\.\d+)?)$/);return m?Number(m[1]):NaN;}
  function legacy(ath,wanted='Freestyle'){
    const stroke=E.stroke?.(wanted)||wanted;if(stroke!=='Freestyle')return null;
    const p=ath?.legacy_pace||ath?.legacyPace||{},seconds=sec(p.t400_seconds??p.t400Seconds??p.t400??ath?.t400_seconds??ath?.t400Seconds??ath?.t400);if(!Number.isFinite(seconds)||seconds<=120)return null;
    const course=text(p.course||p.t400_course||p.t400Course||ath?.t400_course||ath?.t400Course||'SCM').toUpperCase()||'SCM';
    return{id:`legacy-t400-${ath?.id||E.key?.(ath?.full_name)||'athlete'}`,athlete_id:ath?.id,test_type_id:'legacy-t400-freestyle',test_key:'T400 Freestyle',result_seconds:seconds,distance:400,stroke:'Freestyle',course,valid_for_anchor:true,source:'legacy_athlete_pace',source_type:'training_test',source_label:'Saved swimmer T400 anchor · migrated evidence',legacy_compat:true};
  }
  E.t400Rows=function(ath,state,wantedStroke='Freestyle'){const rows=base(ath,state,wantedStroke);if(rows?.length)return rows;const row=legacy(ath,wantedStroke);return row?[row]:[];};
  E.__msosT400Compat=true;M.t400Compat={build:'v4-t400-compat-20260825a',legacy};
})(globalThis);
