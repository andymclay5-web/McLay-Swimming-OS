'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});

    const result=await page.evaluate(()=>{
      const M=MSOS4;
      const identity={id:'round-scope-regression',date:'2026-08-25',dayPart:'PM',title:'Parser regression',squads:['National'],venue:'AquaGym',course:'SCM'};
      const source=`MAIN SET\n3 x (5 x 100 Threshold 10sr, 200 easy)\nTOTAL 2100m`;
      const session=M.parser.parse(source,identity);
      const block=session.blocks[0];
      const group=block?.items?.[0];
      const dose=M.dosageEngine.session(session,M.state,{delivered:false});
      return {
        total:M.session.total(session),
        written:session.metadata?.explicitTotal,
        blockTotal:M.session.blockDistance(block),
        groupKind:group?.kind,
        rounds:group?.rounds,
        children:(group?.items||[]).map(x=>({kind:x.kind,reps:x.reps,distance:x.distance,stroke:x.stroke,zone:x.zone,rest:x.restSeconds,raw:x.raw||x.text})),
        threshold:dose.systems?.Threshold?.metres||0,
        regeneration:dose.systems?.Regeneration?.metres||0,
        free:dose.strokes?.Freestyle?.metres||0,
        choice:dose.strokes?.['Choice / unspecified']?.metres||0,
        prepared:M.parserSemantics?.prepare?.(source)||''
      };
    });

    assert.equal(result.total,2100,'3 x (5x100 + 200) must total 2,100m');
    assert.equal(result.written,2100);
    assert.equal(result.blockTotal,2100);
    assert.equal(result.groupKind,'group','outer repeated bracket must become one canonical group');
    assert.equal(result.rounds,3);
    assert.equal(result.children.length,2);
    assert.deepEqual(result.children.map(x=>[x.reps,x.distance]),[[5,100],[1,200]]);
    assert.equal(result.children[0].zone,'Threshold');
    assert.equal(result.children[0].rest,10);
    assert.equal(result.threshold,1500,'5x100 threshold repeated 3 times must contribute 1,500m');
    assert.equal(result.regeneration,600,'200 easy repeated 3 times must contribute 600m regeneration');
    assert.equal(result.free,1500,'unspecified Threshold aerobic work defaults to Freestyle');
    assert.equal(result.choice,600,'easy regeneration stays Choice / unspecified unless explicitly changed');

    const variants=await page.evaluate(()=>{
      const M=MSOS4,id={id:'variant',date:'2026-08-25',dayPart:'PM',title:'Variants',squads:['National'],venue:'AquaGym',course:'SCM'};
      const inputs=[
        `MAIN SET\n3x(5x100 Threshold 10sr,200 easy)`,
        `MAIN SET\n3 x (\n5 x 100 Threshold 10sr\n200 easy\n)`,
        `MAIN SET\n3 Rounds:\n  5 x 100 Threshold 10sr\n  200 easy`
      ];
      const totals=inputs.map((s,i)=>M.session.total(M.parser.parse(s,{...id,id:`variant-${i}`})));
      const composition=M.parser.parse(`MAIN SET\n4 x 50 (25 Drill / 25 Swim)`,{...id,id:'composition'});
      return {totals,compositionTotal:M.session.total(composition),compositionKind:composition.blocks[0]?.items[0]?.kind};
    });
    assert.deepEqual(variants.totals,[2100,2100,2100]);
    assert.equal(variants.compositionTotal,200,'ordinary within-repeat composition must not be promoted to outer rounds');
    assert.equal(variants.compositionKind,'set');

    const override=await page.evaluate(()=>{
      const M=MSOS4,E=MSOSEngines;
      const identity={id:'stroke-override-regression',date:'2026-08-25',dayPart:'PM',title:'Stroke override',squads:['National'],venue:'AquaGym',course:'SCM'};
      const session=M.parser.parse(`MAIN SET\n3 x (5 x 100 Threshold 10sr, 200 easy)`,identity);
      const group=session.blocks[0].items[0],item=group.items[0];
      const athlete={id:'stroke-ath',full_name:'Stroke Athlete',squad:'National',active:true};
      const state={...M.state,athletes:[athlete],adaptationProfiles:[],adaptationOverrides:[{sessionId:session.id,itemId:item.id,athleteId:athlete.id,active:true,patch:{stroke:'Backstroke'}}],attendance:[],trainingTestTypes:[],trainingTestResults:[],coachResults:[],resultsPbBoard:[],resultsEventHistory:[]};
      const prescription=E.Coordinator.prescription(session,item,athlete,state);
      return {stroke:prescription.item.stroke};
    });
    assert.equal(override.stroke,'Backstroke','poolside individual stroke override must outrank the aerobic Freestyle default');

    console.log('PARSER_ROUND_SCOPE_STROKE_DOSAGE_PASS');
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error(err);process.exit(1)});
