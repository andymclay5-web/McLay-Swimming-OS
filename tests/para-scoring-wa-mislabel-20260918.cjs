'use strict';
// Real coaching failure this fixes (Andy, 18 Sept 2026, live): "This morning I noticed Charlotte is matching
// against world aquatics points not world para points" -- with two screenshots of Charlotte Murphy's real "My
// Swimming" Performance tab (SCM · PERFORMANCE ORDER, 10 events) showing point values labelled "WPS":
// 110, 105, 102, 97, 86, 84, 80, 0 WPS.
//
// Checked directly against production Supabase (project cwoqjxiniuwmslltsfgi, 18 Sept 2026): Charlotte Murphy
// IS a real, genuinely classified para swimmer (current_s_class S6, current_sb_class SB6, current_sm_class SM6).
// EVERY row in coach_results has world_para_points:null -- no classified point system has ever been loaded for
// ANY para swimmer in this system (confirmed system-wide: 0 of the ~170 coach_results rows for the 6 classified
// athletes carry a world_para_points value). But several of Charlotte's SCM results DO carry a stored wa_points
// value -- and those values are EXACTLY 110, 105, 102, 97, 86, 84, 80: an exact match for what her screen showed
// under "WPS".
//
// Root cause (engines/swimmer-instant-open-cn.js's quickRanked(), the function that feeds the live Performance
// tab): its "quick" per-row scoring pulled the number straight off Evidence.points(r) -- engines/evidence.js's
// generic extractor, which checks row.wa_points BEFORE row.world_para_points -- then stamped the display label
// purely from M.pathway.isPara(a), completely independent of which system the number actually came from. So a
// classified swimmer with a stored WA number but no World Para number got that WA number relabelled "WPS".
// engines/performance.js's P.scoreForRow() already gets this exactly right (per-row, source-aware, never
// relabels a WA number as WPS -- proved by the pre-existing tests/performance-wps-regression.cjs) and is what
// the slower, correct P.rankedEvents() path already uses; quickRanked() just never called it.
//
// The identical bug shape existed a second time in engines/swimmer-training-bd.js's performance() (feeds the
// Training tab's "Performance <-> Training" panel): `e?.points?.value ?? e?.points?.points ?? pb.world_para_points
// ?? pb.wa_points` fell through to the same raw wa_points the instant M.pathway.points() correctly returned
// {value:null} for a para swimmer with no real World Para points.
//
// This test proves: (1) quickRanked()+performanceHtml() no longer show a WA number under "WPS" for Charlotte,
// and correctly show "-- " (not a spurious "0 WPS") where no real point value exists; (2) a non-classified
// swimmer's ordinary WA scoring is unaffected (no regression); (3) swimmer-training-bd.js's performance() has
// the same fix; (4) fail-before/pass-after on the exact source changes in both files, using Charlotte's real
// numbers, proving this test would have caught the exact bug Andy hit live.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const cnPath=path.join(root,'engines','swimmer-instant-open-cn.js');
const bdPath=path.join(root,'engines','swimmer-training-bd.js');
const cnSrc=fs.readFileSync(cnPath,'utf8');
const bdSrc=fs.readFileSync(bdPath,'utf8');

// Charlotte Murphy's real production shape (athletes + coach_results, pulled live 18 Sept 2026). Every row's
// world_para_points is null -- exactly as in production -- and the wa_points values below are her real stored
// numbers, an exact match for what her live screen showed mislabelled "WPS".
const charlotte={id:'athlete-charlotte-murphy',full_name:'Charlotte Murphy',sex:'F',date_of_birth:'2008-03-19',current_s_class:'S6',current_sb_class:'SB6',current_sm_class:'SM6'};
const charlotteRows=[
  {id:'cr-im200',athlete_id:charlotte.id,distance:200,stroke:'IM',course:'SCM',result_seconds:253.30,wa_points:110,world_para_points:null},
  {id:'cr-bk100',athlete_id:charlotte.id,distance:100,stroke:'Backstroke',course:'SCM',result_seconds:114.16,wa_points:105,world_para_points:null},
  {id:'cr-bk200',athlete_id:charlotte.id,distance:200,stroke:'Backstroke',course:'SCM',result_seconds:252.41,wa_points:102,world_para_points:null},
  {id:'cr-im100',athlete_id:charlotte.id,distance:100,stroke:'IM',course:'SCM',result_seconds:119.71,wa_points:97,world_para_points:null},
  {id:'cr-br50',athlete_id:charlotte.id,distance:50,stroke:'Breaststroke',course:'SCM',result_seconds:64.19,wa_points:86,world_para_points:null},
  {id:'cr-br100',athlete_id:charlotte.id,distance:100,stroke:'Breaststroke',course:'SCM',result_seconds:142.22,wa_points:84,world_para_points:null},
  {id:'cr-fly100',athlete_id:charlotte.id,distance:100,stroke:'Butterfly',course:'SCM',result_seconds:120.78,wa_points:80,world_para_points:null},
  {id:'cr-fly50',athlete_id:charlotte.id,distance:50,stroke:'Butterfly',course:'SCM',result_seconds:53.39,wa_points:null,world_para_points:null},
];
const able={id:'athlete-able-swimmer',full_name:'Able Swimmer',sex:'M',date_of_birth:'2010-01-01'};
const ableRows=[{id:'ab-100fr',athlete_id:able.id,distance:100,stroke:'Freestyle',course:'SCM',result_seconds:60.0,wa_points:600,world_para_points:null}];

function makeEvidence(rows){
  return{
    course:r=>String(r?.course||'').toUpperCase(),distance:r=>Number(r?.distance),rowStroke:r=>String(r?.stroke||''),
    stroke:v=>String(v||''),seconds:r=>Number(r?.result_seconds),
    points:r=>Number(r?.wa_points??r?.world_aquatics_points??r?.world_para_points??r?.para_points??r?.fina_points??r?.points??r?.point_score),
    pbRows:ath=>rows.filter(r=>r.athlete_id===ath.id),key:v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,''),
  };
}
// Faithful to the REAL, corrected production M.pathway.points() (engines/wa-points.js's installPathway(),
// which overwrites app.js's earlier, buggier ordering at boot): a para athlete's own classification is checked
// BEFORE any WA fallback, so a para swimmer with no real world_para_points correctly gets {value:null}, never a
// silently-borrowed WA number.
function makePathway(rows){
  const isPara=a=>!!(a.current_s_class||a.current_sb_class||a.current_sm_class);
  const points=(ath,pb)=>{
    const para=Number(pb.world_para_points||pb.para_points);
    if(para>0)return{value:Math.trunc(para),label:'World Para',source:'result'};
    if(isPara(ath))return{value:null,label:'World Para',source:'classification-specific point model required'};
    const explicit=Number(pb.wa_points||pb.world_aquatics_points||pb.fina_points);
    return explicit>0?{value:Math.trunc(explicit),label:'WA',source:'result'}:{value:null,label:'WA',source:'base time not loaded'};
  };
  const event=(ath,pb)=>({pb,points:points(ath,pb),pointSteps:[],qualifying:[],deeper:[],nextNational:null});
  return{
    isPara,points,event,
    paraClass:(a,st)=>st==='Breaststroke'?a.current_sb_class:st==='IM'?a.current_sm_class:a.current_s_class,
    profile:(ath,course)=>{const pbs=rows.filter(r=>r.athlete_id===ath.id&&(!course||String(r.course).toUpperCase()===course));const events=pbs.map(pb=>event(ath,pb));return{athlete:ath,course,pbs,events,closest:null,classificationNeeded:false};},
  };
}

function bootDom(){
  global.document={readyState:'complete',querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({style:{}}),head:{appendChild(){}},addEventListener(){}};
  global.requestAnimationFrame=()=>{};
  global.addEventListener=()=>{};
}
function bootArchitecture(){
  global.MSOSArchitecture={
    AthleteSession:require(path.join(root,'architecture','athlete-session-core.js')),
    TrainingHistory:require(path.join(root,'architecture','training-history-core.js')),
    AthleteObservation:require(path.join(root,'architecture','athlete-observation-core.js')),
    AthleteReport:require(path.join(root,'architecture','athlete-report-core.js')),
  };
}

function bootFixtures(allRows,{cnFrom=cnPath,bdFrom=bdPath}={}){
  bootDom();bootArchitecture();
  const Evidence=makeEvidence(allRows);
  global.MSOSEngines={Evidence,RacePace:{rankedEvents:ath=>allRows.filter(r=>r.athlete_id===ath.id&&r.wa_points>0).map(r=>({row:r,distance:r.distance,stroke:r.stroke,course:r.course,seconds:r.result_seconds,score:r.wa_points,pointSource:'WA'}))}};
  global.MSOS4={
    state:{settings:{selectedAthleteId:charlotte.id},adaptationOverrides:[],coachResults:allRows,athletes:[charlotte,able],canonicalSessions:{},attendance:[],attendanceSnapshots:{},athleteSessionBoundaries:[],squadSessionBoundaries:[],captures:[]},
    ui:{},pathway:makePathway(allRows),
    waPointsEngine:{tableInfo:()=>({}),equivalentTime:()=>null},
    currentSession:()=>null,
  };
  delete require.cache[require.resolve(path.join(root,'engines','performance.js'))];
  require(path.join(root,'engines','performance.js'));
  delete require.cache[require.resolve(bdFrom)];
  require(bdFrom);
  delete require.cache[require.resolve(cnFrom)];
  require(cnFrom);
  return{P:global.MSOS4.performanceEngine,T:global.MSOS4.swimmerTrainingBG,X:global.MSOS4.swimmerInstantOpenCN};
}

function run(){
  const{X,T}=bootFixtures([...charlotteRows,...ableRows]);

  // --- swimmer-instant-open-cn.js: the live Performance tab (Andy's actual screenshot) ---
  const rowsC=X.quickRanked(charlotte,'SCM');
  assert.ok(rowsC.length>=7,'sanity: Charlotte\'s SCM rows must load');
  for(const r of rowsC){
    assert.equal(r.points,null,`Charlotte has no real World Para points loaded -- ${r.distance} ${r.stroke} must not show a borrowed WA number (got ${r.points})`);
  }
  const html=X.performanceHtml(charlotte,'SCM',rowsC);
  assert.doesNotMatch(html,/110 WPS|105 WPS|102 WPS|97 WPS|86 WPS|84 WPS|80 WPS/,'the exact WA numbers from Andy\'s live screenshot must never render under a WPS label');
  assert.doesNotMatch(html,/0 WPS/,'a genuinely missing point value must render as a dash, not a spurious "0 WPS"');
  assert.match(html,/<em>—<\/em>/,'events with no real point value must show the "no data" dash');

  // Control: an ordinary (non-para) swimmer's WA scoring must be completely unaffected by this fix.
  const rowsA=X.quickRanked(able,'SCM');
  assert.equal(rowsA[0].points,600,'a non-classified swimmer\'s real WA points must still show correctly');
  assert.equal(rowsA[0].pointSystem,'WA');
  const htmlA=X.performanceHtml(able,'SCM',rowsA);
  assert.match(htmlA,/600 WA/,'a non-classified swimmer must still see their real WA score');

  // --- swimmer-training-bd.js: the Training tab's "Performance <-> Training" panel (same root cause) ---
  const perf=T.performance(charlotte,'SCM');
  for(const e of perf.bestEvents){
    assert.equal(e.points,null,`swimmer-training-bd.js performance() must not borrow a WA number for Charlotte's ${e.distance} ${e.stroke} either (got ${e.points})`);
  }
  const perfA=T.performance(able,'SCM');
  assert.equal(perfA.bestEvents.find(e=>e.stroke==='Freestyle')?.points,600,'non-classified swimmer\'s training-linked WA points must be unaffected');

  console.log('PARA_SCORING_WA_MISLABEL_PASS');
}

function runFailBefore(){
  // Fail-before A: revert quickRanked()'s per-row scoring to the exact old Evidence.points(r)-first extraction,
  // and the display template's null-check, and confirm Charlotte's real WA numbers reappear under "WPS" --
  // exactly what Andy's live screenshot showed.
  const fixedScoring=`      let score=null;try{score=P.scoreForRow?.(a,r,M.state)||null}catch{}\n      const pts=Number(score?.points),k=\`\${d}|\${st}\`,old=map.get(k),row={raw:r,distance:d,stroke:st,course:cr||c,seconds:sec,points:Number.isFinite(pts)&&pts>0?Math.floor(pts):null,pointSystem:score?.label||(M.pathway?.isPara?.(a)?'WPS':'WA')};`;
  const buggyScoring=`      const k=\`\${d}|\${st}\`,pts=Number(E.points(r)),old=map.get(k),row={raw:r,distance:d,stroke:st,course:cr||c,seconds:sec,points:Number.isFinite(pts)&&pts>0?Math.floor(pts):null,pointSystem:M.pathway?.isPara?.(a)?'WPS':'WA'};`;
  assert.ok(cnSrc.includes(fixedScoring),'test setup error: could not locate the fixed quickRanked() scoring line');
  const fixedTemplate=`<em>${'${e.points!=null&&Number.isFinite(Number(e.points))?`'}${'${Math.floor(Number(e.points))} ${esc(e.pointSystem||\'WA\')}`:\'—\'}'}</em>`;
  assert.ok(cnSrc.includes(fixedTemplate),'test setup error: could not locate the fixed performanceHtml() null-check');
  let buggyCn=cnSrc.replace(fixedScoring,buggyScoring);
  assert.notEqual(buggyCn,cnSrc,'test setup error: could not revert quickRanked() scoring');
  buggyCn=buggyCn.replace(fixedTemplate,fixedTemplate.replace('e.points!=null&&Number.isFinite','Number.isFinite'));
  assert.ok(buggyCn.includes('Number.isFinite(Number(e.points))?`${Math.floor(Number(e.points))}')&&!buggyCn.includes('e.points!=null'),'test setup error: could not revert performanceHtml() null-check');

  const cnTmp=cnPath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(cnTmp,buggyCn);
  try{
    const{X}=bootFixtures([...charlotteRows,...ableRows],{cnFrom:cnTmp});
    const rowsC=X.quickRanked(charlotte,'SCM');
    const im200=rowsC.find(r=>r.distance===200&&r.stroke==='IM');
    assert.equal(im200.points,110,'test setup: the buggy pre-fix source must reproduce Charlotte\'s exact borrowed WA number (110) for 200 IM');
    assert.equal(im200.pointSystem,'WPS','test setup: the buggy pre-fix source must still label it WPS');
    const html=X.performanceHtml(charlotte,'SCM',rowsC);
    assert.match(html,/110 WPS/,'the buggy pre-fix source must reproduce the exact wrong live display Andy saw: a WA number under a WPS label');
    const fly50=rowsC.find(r=>r.distance===50&&r.stroke==='Butterfly');
    assert.equal(fly50.points,null);
    assert.match(html,/0 WPS/,'the buggy pre-fix source must also reproduce the spurious "0 WPS" for a genuinely missing point value');
  }finally{
    fs.unlinkSync(cnTmp);
  }
  console.log('PARA_SCORING_WA_MISLABEL_CN_FAILBEFORE_PASS');

  // Fail-before B: revert swimmer-training-bd.js's performance() points derivation and confirm the same
  // borrowed-WA-number bug reproduces in the Training tab's Performance<->Training panel.
  const fixedBd=`points=Number(e?.points?.value),next=realSteps(e).find`;
  const buggyBd=`points=Number(e?.points?.value??e?.points?.points??pb.world_para_points??pb.wa_points),next=realSteps(e).find`;
  assert.ok(bdSrc.includes(fixedBd),'test setup error: could not locate the fixed performance() points line');
  const buggyBdSrc=bdSrc.replace(fixedBd,buggyBd);
  assert.notEqual(buggyBdSrc,bdSrc,'test setup error: could not revert performance() points derivation');

  const bdTmp=bdPath.replace(/\.js$/,'.failbefore.tmp.js');
  fs.writeFileSync(bdTmp,buggyBdSrc);
  try{
    const{T}=bootFixtures([...charlotteRows,...ableRows],{bdFrom:bdTmp});
    const perf=T.performance(charlotte,'SCM');
    const im200=perf.bestEvents.find(e=>e.distance===200&&e.stroke==='IM');
    assert.equal(im200.points,110,'test setup: the buggy pre-fix training-panel source must also reproduce the borrowed WA number (110) for 200 IM');
  }finally{
    fs.unlinkSync(bdTmp);
  }
  console.log('PARA_SCORING_WA_MISLABEL_BD_FAILBEFORE_PASS');
}

run();
runFailBefore();
require('node:child_process').execFileSync(process.execPath,['--check',cnPath],{stdio:'pipe'});
require('node:child_process').execFileSync(process.execPath,['--check',bdPath],{stdio:'pipe'});
