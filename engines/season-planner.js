'use strict';
// 4 Oct 2026 (Andy, verbatim, on why the season plan loaded in MSOS stops dead after Nationals): "I think
// the weekly plan just needs to be a standard that can be adjusted as suits within the app... the current
// format stays as is, unless something's specifically changed, edited within the app." And on the season
// plan: "that's generally just based off nationals... winter plan is based off short course nationals,
// summer plan is based off age groups and opens, and we just kind of count back through cycling through the
// energy systems... I feel like there's got to be a better way to actually have it already in the app, but
// editable and changeable and evolvable."
//
// Two real, separable things were tangled together in "the weekly plan" before this file existed, both only
// ever present as one hand-written, now-expired snapshot (engines/plan-reference-2026.js's Winter 2026 seed,
// never editable in-app, never regenerable):
//  1. A squad's STANDING day pattern (Monday AM = kick/aerobic capacity, Tuesday PM = anaerobic power, etc.)
//     -- this almost never changes week to week, so it is lifted out here as its own editable default
//     (M.state.weeklyTemplates, one row set per squad) that keeps applying automatically every week unless a
//     coach specifically edits it -- exactly Andy's "stays as is unless changed" instruction.
//  2. The SEASON-LONG ARC (base -> underwater -> turns -> finish & breath control -> taper), counted backward
//     from a target meet -- this is what actually changes each season. Lifted out as M.state.seasonPhaseTemplate
//     (the same five phases and technical/mental text already in plan-reference-2026.js's `phase` object,
//     seeded here as the editable default) plus generateSeason() below, which does the literal "count back
//     through the energy systems from nationals" Andy described.
//
// Deliberately does NOT invent a third storage authority: generateSeason() returns plain rows shaped exactly
// like engines/data-registry.js's normalizeRow() output for season_plan/weekly_plan (same field names), so the
// UI commits them through that engine's existing D.preview()/D.commit() pipeline -- same versioning, same
// history, same invalidation every other import already gets, nothing duplicated.
//
// Honest, stated limitation, not silently papered over: engines/session-methodology.js's existing Board
// "does this session match the plan" banner only recognises dosageEngine's own system vocabulary
// (Regeneration/Development/Overload/Threshold/Clearance/Race pace/Speed-Max/Skill-Technical -- the Rushton/
// Cone taxonomy), never Andy's classic energy-system wording used here and throughout his real season plans
// (Aerobic Capacity/Power, Anaerobic Capacity/Power). A plan generated with this file's real vocabulary will
// NOT trip that banner's plan-vs-session check -- it will keep silently reporting "nothing to check," same
// as it does today with no plan loaded at all, just for a different reason. Deliberately left unmapped here
// rather than guessing a translation between two different, both legitimate, physiology models -- that is a
// real coaching-model decision for Andy to make, not a default to invent.
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.util)return;
  const U=M.util;
  const P=M.seasonPlanner={build:'v4-season-planner-20261004'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();

  // ---------------------------------------------------------------------------
  // Seeds -- identical bootstrap-once precedent as engines/wa-base-times-2026.js and
  // engines/plan-reference-2026.js: merges into state only while nothing real has been saved yet, then steps
  // aside permanently. A coach editing these in-app is what "real" means here (there is no file-import path
  // for either of these two types -- they are edited directly, same as the existing roster-edit rows in
  // engines/data-admin-ui.js), not a dataRegistry activation flag.
  // ---------------------------------------------------------------------------
  const DAY_ROW=([day,dayPart,session_focus,technical_focus,primary_system])=>({day,dayPart,session_focus,technical_focus,primary_system});
  const SEED_TEMPLATES=[
    {squad:'National',days:[
      ['Monday','AM','Aerobic Capacity · Kick / Skills','Kick strength · posture · body line · skills set up the week','Aerobic Capacity'],
      ['Monday','PM','Aerobic Power · Pull / Swim Flex','Pull/swim options · finish skills · posture under load','Aerobic Power'],
      ['Tuesday','AM','Aerobic + Anaerobic Capacity · #1 stroke','Targeted stroke work · capacity with stroke detail','Aerobic + Anaerobic Capacity'],
      ['Tuesday','PM','Anaerobic Power · Race-specific speed','Turns · transitions · breakout quality under pressure','Anaerobic Power'],
      ['Wednesday','PM','Aerobic Capacity · Stroke length / Underwater','Efficiency · distance per stroke · underwater work','Aerobic Capacity'],
      ['Thursday','AM','Aerobic Power · Skills under load','Long-course pacing · skills · execution · composure under fatigue','Aerobic Power'],
      ['Friday','AM','Anaerobic Capacity · Overspeed / Starts','High-end speed · starts · breakouts · first strokes','Anaerobic Capacity'],
      ['Saturday','AM','Rainbow Set · All energy zones','Individual focus · main event · racing direction','Rainbow Set'],
    ].map(DAY_ROW)},
    {squad:'Development',days:[
      ['Monday','PM','Aerobic Power · Pull / Swim Flex','Pull/swim options · finish skills · posture under load','Aerobic Power'],
      ['Tuesday','AM','Aerobic Capacity / Stroke Focus','Body line · kick connection · technical rhythm','Aerobic Capacity'],
      ['Tuesday','PM','Anaerobic Power','Race-specific speed · turns · transitions · breakout quality','Anaerobic Power'],
      ['Wednesday','PM','Aerobic Capacity','Stroke length · underwater skills · efficiency','Aerobic Capacity'],
      ['Thursday','AM','Aerobic Power / Skills under load','Long-course pacing · skills · execution · composure','Aerobic Power'],
      ['Friday','PM','Race Quality · Speed / Overspeed','Starts · breakouts · race-quality speed','Anaerobic Capacity'],
      ['Saturday','AM','Rainbow Set','All energy zones · individual focus · main event direction','Rainbow Set'],
    ].map(DAY_ROW)},
    {squad:'Intermediate',days:[
      ['Monday','PM','Stroke Introduction','Weekly stroke theme · simple skill language · body line','Stroke Development'],
      ['Tuesday','PM','Stroke Development','Drill into swim transfer · coach check-ins · swimmer feedback','Stroke Development'],
      ['Thursday','PM','Skills + Endurance','Underwaters · turns · body position · aerobic skill control','Aerobic Skills'],
      ['Friday','PM','Speed + Stroke Reinforcement','Short speed · starts · breakouts · fast first strokes','Speed'],
      ['Saturday','AM','Rainbow Set / Competitive Performance','All energy zones · race habits · event skills · ownership','Rainbow Set'],
    ].map(DAY_ROW)},
    {squad:'Junior',days:[
      ['Monday','PM','Stroke Introduction','Weekly stroke theme · simple body line and kick cues','Stroke Development'],
      ['Tuesday','PM','Stroke Development','Drill into swim transfer · simple repeatable cues','Stroke Development'],
      ['Thursday','PM','Skills + Endurance','Underwaters · turns · body position · aerobic skill control','Aerobic Skills'],
      ['Friday','PM','Speed + Race Quality','Short sharp swimming · starts · breakouts · race habits','Speed'],
    ].map(DAY_ROW)},
  ];
  const SEED_PHASES=[
    {key:'base',label:'Base Skills',technical:'Streamline · Body position · Efficiency · Distance per stroke · Rhythm & timing',mental:'Posture + discipline · Body line control · Aerobic base · Consistent habits',primary_system:'Aerobic Capacity',weeks:4},
    {key:'underwater',label:'Under Water',technical:'Dolphin kick · Breakouts · Speed off walls · Underwater pull · Breath control',mental:'Hypoxic confidence · CO2 tolerance · Explosive push-offs · Courage under water',primary_system:'Aerobic Power',weeks:4},
    {key:'turns',label:'Dives & Turns',technical:'Starts · Reaction time · Turn speed · Race transitions · Walls under pressure',mental:'Power + focus · Reaction speed · Power output · Execute details',primary_system:'Anaerobic Capacity',weeks:4},
    {key:'finish',label:'Finish & Breath Control',technical:'Race finishes · Stroke count · Pressure skills · Breath control · Race execution',mental:'Lactate resilience · Hold form late · Stay strong under pressure · Control breathing',primary_system:'Anaerobic Power',weeks:4},
    // `weeks` on taper is a MINIMUM, not a target -- generateSeason() below always gives taper whatever weeks
    // are left over after the four phases above, never fewer than this.
    {key:'taper',label:'Taper & Race',technical:'Taper & recovery · Race preparation · Speed maintenance · Performance execution · Peak on race day',mental:'Freshness + self-belief · Recover and sharpen · Trust the training · Perform when it matters',primary_system:'Individual',weeks:2},
  ];
  function seedIfEmpty(key,seed){if(!Array.isArray(M.state[key])||!M.state[key].length)M.state[key]=JSON.parse(JSON.stringify(seed));}
  function ensureSeeds(){seedIfEmpty('weeklyTemplates',SEED_TEMPLATES);seedIfEmpty('seasonPhaseTemplate',SEED_PHASES);}

  // ---------------------------------------------------------------------------
  // Pure date/allocation math -- no state reads, safe to unit test directly against real historical dates.
  // ---------------------------------------------------------------------------
  function daysBetween(aISO,bISO){return Math.round((Date.parse(`${bISO}T12:00:00Z`)-Date.parse(`${aISO}T12:00:00Z`))/86400000);}
  function addDays(iso,n){return new Date(Date.parse(`${iso}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);}
  // One entry per week from seasonStart, +7 days each -- except the LAST entry, which is always the real
  // target meet date exactly (matching how Andy's own historical data is built: the meet date itself is a
  // week_start row, even when the gap to it isn't a clean 7 days).
  function weekStarts(seasonStart,targetMeetDate){
    const span=daysBetween(seasonStart,targetMeetDate);
    const totalWeeks=Math.max(1,Math.round(span/7)+1);
    const out=[];
    for(let i=0;i<totalWeeks-1;i++)out.push(addDays(seasonStart,i*7));
    out.push(targetMeetDate);
    return out;
  }
  // Allocates totalWeeks across phases in order. Each non-taper phase gets its own declared `weeks` when
  // there is room; taper always gets at least its own `weeks` (a minimum here, not a target) and absorbs
  // whatever is left over -- so a normal-length season gives taper the real remainder (the historical Winter
  // 2026 data: 21 weeks total, 4 each for the first four phases, taper absorbs the remaining 5), while a
  // short season compresses the EARLIER phases first rather than ever cutting into taper's minimum.
  function allocatePhases(totalWeeks,phases){
    const nonTaper=phases.filter(p=>p.key!=='taper');
    const taper=phases.find(p=>p.key==='taper')||{key:'taper',weeks:2};
    const taperMin=Math.max(1,Number(taper.weeks)||2);
    const availableForNonTaper=Math.max(0,totalWeeks-taperMin);
    const desired=nonTaper.map(p=>Math.max(1,Number(p.weeks)||4));
    const sumDesired=desired.reduce((a,b)=>a+b,0);
    let weeksPerPhase;
    if(sumDesired<=availableForNonTaper){
      weeksPerPhase=desired.slice();
    }else{
      // Compress proportionally, floor, then hand out any leftover weeks (from flooring) one at a time to
      // the phases with the largest remainder, then guarantee every phase keeps at least 1 week if any are
      // available at all -- a phase silently vanishing from a short season would look like a bug, not a
      // deliberate compression.
      const raw=desired.map(d=>sumDesired>0?(d*availableForNonTaper)/sumDesired:0);
      weeksPerPhase=raw.map(Math.floor);
      let used=weeksPerPhase.reduce((a,b)=>a+b,0);
      const remainders=raw.map((v,i)=>({i,frac:v-Math.floor(v)})).sort((a,b)=>b.frac-a.frac);
      let ri=0;
      while(used<availableForNonTaper&&ri<remainders.length*4){weeksPerPhase[remainders[ri%remainders.length].i]++;used++;ri++;}
      if(availableForNonTaper>0){
        for(let i=0;i<weeksPerPhase.length;i++){
          if(weeksPerPhase[i]===0){
            const maxIdx=weeksPerPhase.reduce((best,v,j)=>v>weeksPerPhase[best]?j:best,0);
            if(weeksPerPhase[maxIdx]>1){weeksPerPhase[maxIdx]--;weeksPerPhase[i]++;}
          }
        }
      }
    }
    const taperWeeks=totalWeeks-weeksPerPhase.reduce((a,b)=>a+b,0);
    const allocation=nonTaper.map((p,i)=>({key:p.key,weeks:weeksPerPhase[i]}));
    allocation.push({key:taper.key,weeks:Math.max(taperMin,taperWeeks)});
    return allocation;
  }
  function phaseKeyPerWeek(allocation){
    const out=[];
    for(const a of allocation)for(let i=0;i<a.weeks;i++)out.push(a.key);
    return out;
  }

  const STROKE_ROTATION=['Freestyle','Backstroke','Breaststroke','Butterfly'];

  // ---------------------------------------------------------------------------
  // generateSeason -- the actual "count back through the energy systems from nationals" Andy described.
  // Returns plain rows shaped for engines/data-registry.js's season_plan/weekly_plan normalizeRow() (same
  // field names it reads via alias()), never writes to M.state directly and never calls D.preview/D.commit
  // itself -- the caller (engines/data-admin-ui.js) owns that so a generated plan goes through the exact
  // same preview/validate/commit/version-history path a manual CSV import already does.
  // ---------------------------------------------------------------------------
  function generateSeason(opts={}){
    ensureSeeds();
    const name=text(opts.name)||'New season plan';
    const course=text(opts.course)||'SCM';
    const seasonStart=text(opts.seasonStart);
    const targetMeetDate=text(opts.targetMeetDate);
    const targetMeetName=text(opts.targetMeetName)||'Target meet';
    const squads=(Array.isArray(opts.squads)?opts.squads:[]).map(text).filter(Boolean);
    if(!seasonStart||!targetMeetDate)throw new Error('Season start and target meet date are both required.');
    if(Date.parse(targetMeetDate)<=Date.parse(seasonStart))throw new Error('Target meet date must be after the season start date.');
    if(!squads.length)throw new Error('Choose at least one squad.');

    const phases=(M.state.seasonPhaseTemplate||SEED_PHASES).map(p=>({...p,weeks:Number(opts.phaseWeeks?.[p.key])||p.weeks}));
    const starts=weekStarts(seasonStart,targetMeetDate);
    const allocation=allocatePhases(starts.length,phases);
    const phaseKeys=phaseKeyPerWeek(allocation);

    const seasonId=U.stableId?.('season-plan',name,seasonStart,targetMeetDate)||`season-plan-${seasonStart}-${targetMeetDate}`;
    const warnings=[];
    const weeklyRows=[];
    for(const squad of squads){
      const template=(M.state.weeklyTemplates||[]).find(t=>t.squad===squad);
      if(!template){warnings.push(`No standing weekly template for "${squad}" yet -- add one before generating, or this squad's weeks will have no sessions.`);}
      let phaseStartIdx=0,lastPhaseKey=null;
      starts.forEach((weekStart,i)=>{
        const phaseKey=phaseKeys[i];
        if(phaseKey!==lastPhaseKey){phaseStartIdx=i;lastPhaseKey=phaseKey;}
        const phase=phases.find(p=>p.key===phaseKey)||phases[phases.length-1];
        const withinPhase=i-phaseStartIdx;
        const isMeetWeek=weekStart===targetMeetDate;
        let stroke,primarySystem,objectiveParts;
        if(phaseKey==='taper'){
          stroke=isMeetWeek?'Race':'Taper';
          primarySystem=isMeetWeek?'Race':'Individual';
          objectiveParts=[stroke,isMeetWeek?'Race':'#1 Individual'];
        }else{
          stroke=STROKE_ROTATION[withinPhase%STROKE_ROTATION.length];
          primarySystem=phase.primary_system;
          objectiveParts=[stroke,phase.label,primarySystem];
        }
        const meetName=isMeetWeek?targetMeetName:'';
        weeklyRows.push({
          id:U.stableId?.('weekly-plan',squad,weekStart)||`weekly-plan-${squad}-${weekStart}`,
          week_start:weekStart,
          squad,
          programme:squad,
          season_plan_id:seasonId,
          objective:objectiveParts.concat(meetName).filter(Boolean).join(' · '),
          focus:phase.label,
          phase:phase.label,
          technical_focus:phase.technical,
          primary_system:primarySystem,
          physiological_focus:primarySystem,
          psychological_focus:phase.mental,
          carry_forward:'',
          meet:meetName,
          event:meetName,
          stroke,
          sessions:(template?.days||[]).map(d=>({...d})),
          source:'MSOS season planner · generated',
        });
      });
    }
    const seasonRow={
      id:seasonId,
      name,
      start_date:seasonStart,
      end_date:targetMeetDate,
      squads,
      overarching_goal:phases.map(p=>p.label).join(' → '),
      psychological_focus:[...new Set(phases.flatMap(p=>String(p.mental||'').split(' · ')))].filter(Boolean).join(' · '),
      meets:[{date:targetMeetDate,name:targetMeetName,course}],
      version:opts.version||name,
      effective_from:seasonStart,
      source:'MSOS season planner · generated',
    };
    return{seasonRow,weeklyRows,allocation,totalWeeks:starts.length,warnings};
  }

  ensureSeeds();
  P.SEED_TEMPLATES=SEED_TEMPLATES;P.SEED_PHASES=SEED_PHASES;P.ensureSeeds=ensureSeeds;
  P.daysBetween=daysBetween;P.addDays=addDays;P.weekStarts=weekStarts;P.allocatePhases=allocatePhases;P.phaseKeyPerWeek=phaseKeyPerWeek;
  P.generateSeason=generateSeason;
})(globalThis);
