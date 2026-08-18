'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports){
    module.exports=factory({
      Portal:require('./engine-portal.js'),
      EntityRegistry:require('../engines/entity-registry.js'),
      Methodology:require('../engines/methodology.js'),
      PlanContext:require('../engines/plan-context.js'),
      SessionTruth:require('../engines/session-truth.js'),
      EvidenceRetrieval:require('../engines/evidence-retrieval.js'),
      ResultsPathway:require('../engines/results-pathway.js'),
      Targets:require('../engines/targets.js'),
      Adaptation:require('../engines/adaptation.js'),
      Attendance:require('../engines/attendance.js'),
      CaptureEvidence:require('../engines/capture-evidence.js'),
      BoardProjection:require('../engines/board-projection.js')
    });
  }else root.MSOSPortalCore=factory({Portal:root.MSOSEnginePortal,...(root.MSOSEngines||{})});
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  const VERSION='2.0.0';
  const required=['Portal','EntityRegistry','Methodology','PlanContext','SessionTruth','EvidenceRetrieval','ResultsPathway','Targets','Adaptation','Attendance','CaptureEvidence','BoardProjection'];
  function assertModules(){const missing=required.filter(k=>!E[k]);if(missing.length)throw new Error(`Portal Core missing modules: ${missing.join(', ')}`)}
  function proxy(client,target,methods){const out={};for(const name of methods)out[name]=(...args)=>client.query(target,name,{args});return Object.freeze(out)}
  function call(instance,method,input){if(!instance||typeof instance[method]!=='function')throw new Error(`${method} is unavailable`);return instance[method](...(input?.args||[]))}

  function create({attendanceStorage,captureStorage,planStorage=null,evidenceSources=[],evidenceAliases=[],clubs=[],coaches=[],squads=[],memberships=[],profiles=[],overrides=[],standards=[],baseTimes=[],methodologyModels=[],plan={},clock=()=>new Date().toISOString()}={}){
    assertModules();if(!attendanceStorage)throw new Error('Portal Core requires Attendance storage');if(!captureStorage)throw new Error('Portal Core requires Capture storage');
    const portal=E.Portal.create({clock}),I={};

    portal.register({id:'entity-registry',version:E.EntityRegistry.VERSION,purpose:'Canonical club coach squad swimmer identity and memberships',owner:'programme identity',queries:{
      resolveAthlete:input=>call(I.entities,'resolveAthlete',input),athleteId:input=>call(I.entities,'athleteId',input),sourceAthleteId:input=>call(I.entities,'sourceAthleteId',input),listAthletes:input=>call(I.entities,'listAthletes',input),
      resolveClub:input=>call(I.entities,'resolveClub',input),resolveCoach:input=>call(I.entities,'resolveCoach',input),resolveSquad:input=>call(I.entities,'resolveSquad',input),listClubs:input=>call(I.entities,'listClubs',input),listCoaches:input=>call(I.entities,'listCoaches',input),listSquads:input=>call(I.entities,'listSquads',input),membershipsForAthlete:input=>call(I.entities,'membershipsForAthlete',input),athleteSquads:input=>call(I.entities,'athleteSquads',input),roster:input=>call(I.entities,'roster',input),dimensions:input=>call(I.entities,'dimensions',input),snapshot:input=>call(I.entities,'snapshot',input)
    }});

    portal.register({id:'methodology',version:E.Methodology.VERSION,purpose:'Configurable coaching philosophy and interpretation rules',owner:'coaching methodology',calls:{query:{'entity-registry':['dimensions']}},queries:{
      resolve:input=>call(I.methodology,'resolve',input),zone:input=>call(I.methodology,'zone',input),doseRules:input=>call(I.methodology,'doseRules',input),adaptationPrinciples:input=>call(I.methodology,'adaptationPrinciples',input),raceModelPreferences:input=>call(I.methodology,'raceModelPreferences',input),sessionDesignPrinciples:input=>call(I.methodology,'sessionDesignPrinciples',input),snapshot:input=>call(I.methodology,'snapshot',input)
    }});

    portal.register({id:'programme-plan',version:E.PlanContext.VERSION,purpose:'Season phase cycle week session intent and programme objectives',owner:'programme planning',calls:{query:{'entity-registry':['resolveSquad','athleteId']}},queries:{
      resolve:input=>call(I.plan,'resolve',input),weeklyPlan:input=>call(I.plan,'weeklyPlan',input),athleteObjectivesFor:input=>call(I.plan,'athleteObjectivesFor',input),squadObjectivesFor:input=>call(I.plan,'squadObjectivesFor',input),snapshot:input=>call(I.plan,'snapshot',input)
    },commands:{upsert:input=>call(I.plan,'upsert',input),retire:input=>call(I.plan,'retire',input)}});

    portal.register({id:'session-truth',version:E.SessionTruth.VERSION,purpose:'Canonical workout semantics and distance',owner:'session semantics',queries:{
      parse:{handler:input=>E.SessionTruth.parse(input.source,input.identity||{}),validateInput:x=>typeof x?.source==='string'?'':'source required'},validate:input=>E.SessionTruth.validate(input.session),nodeDistance:input=>E.SessionTruth.nodeDistance(input.node),blockDistance:input=>E.SessionTruth.blockDistance(input.block),totalDistance:input=>E.SessionTruth.totalDistance(input.session)
    }});

    portal.register({id:'evidence-retrieval',version:E.EvidenceRetrieval.VERSION,purpose:'Single verified read doorway for athlete test result evidence',owner:'evidence retrieval',calls:{query:{'entity-registry':['resolveAthlete','athleteId','sourceAthleteId','listAthletes']}},queries:{
      resolveAthlete:input=>call(I.evidence,'resolveAthlete',input),athleteId:input=>call(I.evidence,'athleteId',input),listAthletes:input=>call(I.evidence,'listAthletes',input),provenance:input=>call(I.evidence,'provenance',input),trainingTests:input=>call(I.evidence,'trainingTests',input),latestTrainingTest:input=>call(I.evidence,'latestTrainingTest',input),fastestTrainingTest:input=>call(I.evidence,'fastestTrainingTest',input),latestTrainingTestEvidence:input=>call(I.evidence,'latestTrainingTestEvidence',input),results:input=>call(I.evidence,'results',input),personalBest:input=>call(I.evidence,'personalBest',input),personalBestEvidence:input=>call(I.evidence,'personalBestEvidence',input),conversion:input=>call(I.evidence,'conversion',input),stats:input=>call(I.evidence,'stats',input)
    }});

    portal.register({id:'results-pathway',version:E.ResultsPathway.VERSION,purpose:'Performance PB and pathway answers from verified evidence',owner:'performance pathway',calls:{query:{'evidence-retrieval':['resolveAthlete','results']}},queries:{profile:input=>call(I.pathway,'profile',input),eventAnswer:input=>call(I.pathway,'eventAnswer',input),pbRows:input=>call(I.pathway,'pbRows',input)}});
    portal.register({id:'targets',version:E.Targets.VERSION,purpose:'Canonical set plus athlete evidence to target prescription',owner:'training targets',calls:{query:{'evidence-retrieval':['resolveAthlete','latestTrainingTestEvidence','personalBestEvidence','conversion']}},queries:{forItem:input=>call(I.targets,'forItem',input),forPhase:input=>call(I.targets,'forPhase',input),t400:input=>call(I.targets,'t400',input),convertedPb:input=>call(I.targets,'convertedPb',input)}});
    portal.register({id:'adaptation',version:E.Adaptation.VERSION,purpose:'Athlete-specific prescription without mutating squad work',owner:'adaptation prescription',calls:{query:{'entity-registry':['resolveAthlete']}},queries:{forItem:input=>call(I.adaptation,'forItem',input),forAthletes:input=>call(I.adaptation,'forAthletes',input),profile:input=>call(I.adaptation,'profile',input),listOverrides:input=>call(I.adaptation,'listOverrides',input)},commands:{setOverride:input=>call(I.adaptation,'setOverride',input),clearOverride:input=>call(I.adaptation,'clearOverride',input)}});
    portal.register({id:'attendance',version:E.Attendance.VERSION,purpose:'Exact session attendance truth',owner:'attendance records',calls:{query:{'entity-registry':['resolveAthlete','listAthletes']}},queries:{eligibleRoster:input=>call(I.attendance,'eligibleRoster',input),get:input=>call(I.attendance,'get',input),status:input=>call(I.attendance,'status',input),isHere:input=>call(I.attendance,'isHere',input),recordsForSession:input=>call(I.attendance,'recordsForSession',input),here:input=>call(I.attendance,'here',input),hereAthletes:input=>call(I.attendance,'hereAthletes',input),notMarked:input=>call(I.attendance,'notMarked',input),summary:input=>call(I.attendance,'summary',input),history:input=>call(I.attendance,'history',input),snapshot:input=>call(I.attendance,'snapshot',input)},commands:{mark:input=>call(I.attendance,'mark',input),clearMark:input=>call(I.attendance,'clearMark',input)}});
    portal.register({id:'capture-evidence',version:E.CaptureEvidence.VERSION,purpose:'Exact session block set athlete evidence capture',owner:'capture evidence records',calls:{query:{'entity-registry':['resolveAthlete']}},queries:{atBoardPoint:input=>call(I.capture,'atBoardPoint',input),query:input=>call(I.capture,'query',input),get:input=>call(I.capture,'get',input),history:input=>call(I.capture,'history',input),snapshot:input=>call(I.capture,'snapshot',input)},commands:{create:input=>call(I.capture,'create',input),amend:input=>call(I.capture,'amend',input),retire:input=>call(I.capture,'retire',input)}});
    portal.register({id:'board-projection',version:E.BoardProjection.VERSION,purpose:'Compact coach Board projection only',owner:'coach board projection',calls:{query:{'session-truth':['nodeDistance','blockDistance','totalDistance'],'attendance':['here','hereAthletes','summary'],'adaptation':['forItem'],'targets':['forItem','forPhase'],'capture-evidence':['atBoardPoint']}},queries:{project:input=>call(I.board,'project',input)}});

    portal.register({id:'coach-board-surface',version:'2.0.0',kind:'surface',purpose:'Poolside coach surface; no swimming calculations',owner:'presentation',calls:{query:{'session-truth':['parse','validate'],'board-projection':['project'],'attendance':['eligibleRoster','summary'],'evidence-retrieval':['trainingTests','latestTrainingTestEvidence'],'results-pathway':['profile'],'adaptation':['listOverrides'],'capture-evidence':['atBoardPoint','query'],'entity-registry':['resolveAthlete','roster'],'methodology':['resolve'],'programme-plan':['resolve']},command:{'attendance':['mark','clearMark'],'adaptation':['setOverride','clearOverride'],'capture-evidence':['create','amend','retire']}}});
    portal.register({id:'planning-surface',version:'1.0.0',kind:'surface',purpose:'Coach season weekly plan authoring surface',owner:'presentation',calls:{query:{'entity-registry':['resolveAthlete','resolveSquad','roster'],'methodology':['resolve','zone','sessionDesignPrinciples'],'programme-plan':['resolve','weeklyPlan','athleteObjectivesFor','squadObjectivesFor','snapshot']},command:{'programme-plan':['upsert','retire']}}});
    portal.register({id:'app-shell',version:'1.0.0',kind:'shell',purpose:'Navigation offline composition only',owner:'application shell'});

    I.entities=E.EntityRegistry.create({sources:evidenceSources,aliases:evidenceAliases,clubs,coaches,squads,memberships});
    const identityFor=caller=>proxy(portal.client(caller),'entity-registry',['resolveAthlete','athleteId','sourceAthleteId','listAthletes','resolveClub','resolveCoach','resolveSquad','listClubs','listCoaches','listSquads','membershipsForAthlete','athleteSquads','roster','dimensions','snapshot']);
    I.evidence=E.EvidenceRetrieval.create({sources:evidenceSources,entities:identityFor('evidence-retrieval')});
    const evidenceFor=caller=>proxy(portal.client(caller),'evidence-retrieval',['resolveAthlete','athleteId','listAthletes','provenance','trainingTests','latestTrainingTest','fastestTrainingTest','latestTrainingTestEvidence','results','personalBest','personalBestEvidence','conversion','stats']);
    I.pathway=E.ResultsPathway.create({evidence:evidenceFor('results-pathway'),standards,baseTimes});
    I.targets=E.Targets.create({evidence:evidenceFor('targets')});
    I.adaptation=E.Adaptation.create({evidence:identityFor('adaptation'),profiles,overrides,clock});
    I.attendance=E.Attendance.create({storage:attendanceStorage,evidence:identityFor('attendance'),clock});
    I.capture=E.CaptureEvidence.create({storage:captureStorage,evidence:identityFor('capture-evidence'),clock});
    I.methodology=E.Methodology.create({models:methodologyModels,entities:identityFor('methodology')});
    I.plan=E.PlanContext.create({storage:planStorage,entities:identityFor('programme-plan'),clock,...plan});

    const truthForBoard={nodeDistance:node=>portal.client('board-projection').query('session-truth','nodeDistance',{node}),blockDistance:block=>portal.client('board-projection').query('session-truth','blockDistance',{block}),totalDistance:session=>portal.client('board-projection').query('session-truth','totalDistance',{session})};
    I.board=E.BoardProjection.create({truth:truthForBoard,attendance:proxy(portal.client('board-projection'),'attendance',['here','hereAthletes','summary']),adaptation:proxy(portal.client('board-projection'),'adaptation',['forItem']),targets:proxy(portal.client('board-projection'),'targets',['forItem','forPhase']),captures:proxy(portal.client('board-projection'),'capture-evidence',['atBoardPoint'])});

    portal.seal();const surface=portal.client('coach-board-surface'),planning=portal.client('planning-surface'),shell=portal.client('app-shell');
    return Object.freeze({version:VERSION,portal,shell,surface,planning,
      parse:(source,identity={})=>surface.query('session-truth','parse',{source,identity}),validate:session=>surface.query('session-truth','validate',{session}),board:session=>surface.query('board-projection','project',{args:[session]},{sessionId:session?.id||''}),
      mark:(session,athleteRef,status,opts={})=>surface.command('attendance','mark',{args:[session,athleteRef,status,opts]},{sessionId:session?.id||'',athleteId:typeof athleteRef==='string'?athleteRef:''}),setAdaptation:(session,item,athleteRef,prescription,opts={})=>surface.command('adaptation','setOverride',{args:[session,item,athleteRef,prescription,opts]},{sessionId:session?.id||'',athleteId:typeof athleteRef==='string'?athleteRef:''}),capture:(session,spec={})=>surface.command('capture-evidence','create',{args:[session,spec]},{sessionId:session?.id||'',athleteId:spec.athleteIds?.[0]||''}),
      entity:ref=>surface.query('entity-registry','resolveAthlete',{args:[ref]}),roster:(squadRef,opts={})=>surface.query('entity-registry','roster',{args:[squadRef,opts]}),pathway:(athleteRef,opts={})=>surface.query('results-pathway','profile',{args:[athleteRef,opts]},{athleteId:typeof athleteRef==='string'?athleteRef:''}),t400:(athleteRef,opts={})=>surface.query('evidence-retrieval','latestTrainingTestEvidence',{args:[athleteRef,{testKey:'t400_freestyle',...opts}]},{athleteId:typeof athleteRef==='string'?athleteRef:''}),methodology:ctx=>surface.query('methodology','resolve',{args:[ctx||{}]}),planContext:session=>surface.query('programme-plan','resolve',{args:[session]},{sessionId:session?.id||''}),weeklyPlan:query=>planning.query('programme-plan','weeklyPlan',{args:[query||{}]}),updatePlan:(collection,row,opts={})=>planning.command('programme-plan','upsert',{args:[collection,row,opts]}),retirePlan:(collection,id,opts={})=>planning.command('programme-plan','retire',{args:[collection,id,opts]}),diagnostics:()=>portal.snapshot()
    });
  }
  return{VERSION,create,proxy};
});
