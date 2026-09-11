'use strict';
// Task #65 (11 Sept 2026) -- Andy's own long-standing "season plan and weekly plan still not loaded into
// the system" complaint (logged 7 Sept, see /areas/mclay-swimming-os.md and [[msos-known-issues]]).
//
// This is a real, load-bearing replacement for the dead engines/plan-reference-ch.js, which contained this
// exact same real season/weekly plan data (Andy's own AquaGym Winter 2026 structure for National,
// Development, Intermediate and Junior) but was never actually loaded by index.html -- it only ever ran via
// engines/contract-fixes-al.js, itself a retired runtime overlay explicitly forbidden from index.html/the
// service-worker precache by tests/release-package.test.js, and otherwise only reachable from the separate
// pilot/portal.html prototype page. The data was real; the wiring to the live app was 100% absent.
//
// Asked Andy directly (AskUserQuestion) whether to also load this real data now, on top of fixing the
// generic importer (engines/data-registry.js's season_plan/weekly_plan types, which previously produced a
// shape far too thin for engines/coach-loop-ui.js's planContext()/session-methodology.js to use -- see that
// commit for the schema fix). He chose to load it now rather than start from empty.
//
// Follows the EXACT bootstrap-once precedent already established and trusted in this codebase by
// engines/wa-base-times-2026.js: seed data merges into live state only while no real coach-driven import has
// ever been activated for that type (M.state.dataRegistry.active.season_plan / .weekly_plan) -- the moment
// Andy imports his own season/weekly plan document through the Data & References screen, this seed steps
// aside permanently and never overwrites it. Deliberately bypasses dataRegistry versioning, same as the WA
// base-times seed -- this is a default, not a tracked import.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const P=M.planReference2026={build:'v4-plan-reference-20260911a'};
  const ND_SEASON='season-aquagym-winter-2026-national-development';
  const JI_SEASON='season-aquagym-winter-2026-junior-intermediate';
  const phase={
    base:{technical:'Streamline · Body position · Efficiency · Distance per stroke · Rhythm & timing',mental:'Posture + discipline · Body line control · Aerobic base · Consistent habits'},
    underwater:{technical:'Dolphin kick · Breakouts · Speed off walls · Underwater pull · Breath control',mental:'Hypoxic confidence · CO2 tolerance · Explosive push-offs · Courage under water'},
    turns:{technical:'Starts · Reaction time · Turn speed · Race transitions · Walls under pressure',mental:'Power + focus · Reaction speed · Power output · Execute details'},
    finish:{technical:'Race finishes · Stroke count · Pressure skills · Breath control · Race execution',mental:'Lactate resilience · Hold form late · Stay strong under pressure · Control breathing'},
    taper:{technical:'Taper & recovery · Race preparation · Speed maintenance · Performance execution · Peak on race day',mental:'Freshness + self-belief · Recover and sharpen · Trust the training · Perform when it matters'}
  };
  const seasons=[
    {id:ND_SEASON,name:'Winter 2026 · National / Development',start_date:'2026-05-11',end_date:'2026-09-28',squads:['National','Development'],overarching_goal:'Base Skills → Underwater Skills → Dives & Turns → Finish & Breath Control → Taper & Race',psychological_focus:'Confidence · Resilience · Accountability · Race preparation · Self-belief · Performance under pressure',meets:[{date:'2026-08-28',name:'South Island SC Champs',course:'SCM'},{date:'2026-09-07',name:'Selwyn Meet'},{date:'2026-09-28',name:'NZSC Champs',course:'SCM'}],source:'AquaGym Winter 2026 Season Plan'},
    {id:JI_SEASON,name:'Winter 2026 · Junior / Intermediate',start_date:'2026-05-11',end_date:'2026-09-28',squads:['Junior','Intermediate'],overarching_goal:'Base Skills → Underwater Skills → Dives & Turns → Finish & Breath Control → AquaGym Signature / race preparation',psychological_focus:'Confidence · ownership · skill quality · race preparation',meets:[{date:'2026-09-07',name:'Selwyn Meet'}],source:'AquaGym Junior / Intermediate Winter 2026 Season Plan'}
  ];
  const national=[
    ['Monday','AM','Aerobic Capacity · Kick / Skills','Kick strength · posture · body line · skills set up the week','Aerobic Capacity'],
    ['Monday','PM','Aerobic Power · Pull / Swim Flex','Pull/swim options · finish skills · posture under load','Aerobic Power'],
    ['Tuesday','AM','Aerobic + Anaerobic Capacity · #1 stroke','Targeted stroke work · capacity with stroke detail','Aerobic + Anaerobic Capacity'],
    ['Tuesday','PM','Anaerobic Power · Race-specific speed','Turns · transitions · breakout quality under pressure','Anaerobic Power'],
    ['Wednesday','PM','Aerobic Capacity · Stroke length / Underwater','Efficiency · distance per stroke · underwater work','Aerobic Capacity'],
    ['Thursday','AM','Aerobic Power · Skills under load','Long-course pacing · skills · execution · composure under fatigue','Aerobic Power'],
    ['Friday','AM','Anaerobic Capacity · Overspeed / Starts','High-end speed · starts · breakouts · first strokes','Anaerobic Capacity'],
    ['Saturday','AM','Rainbow Set · All energy zones','Individual focus · main event · racing direction','Rainbow Set']
  ];
  const development=[
    ['Monday','PM','Aerobic Power · Pull / Swim Flex','Pull/swim options · finish skills · posture under load','Aerobic Power'],
    ['Tuesday','AM','Aerobic Capacity / Stroke Focus','Body line · kick connection · technical rhythm','Aerobic Capacity'],
    ['Tuesday','PM','Anaerobic Power','Race-specific speed · turns · transitions · breakout quality','Anaerobic Power'],
    ['Wednesday','PM','Aerobic Capacity','Stroke length · underwater skills · efficiency','Aerobic Capacity'],
    ['Thursday','AM','Aerobic Power / Skills under load','Long-course pacing · skills · execution · composure','Aerobic Power'],
    ['Friday','PM','Race Quality · Speed / Overspeed','Starts · breakouts · race-quality speed','Anaerobic Capacity'],
    ['Saturday','AM','Rainbow Set','All energy zones · individual focus · main event direction','Rainbow Set']
  ];
  const intermediate=[
    ['Monday','PM','Stroke Introduction','Weekly stroke theme · simple skill language · body line','Stroke Development'],
    ['Tuesday','PM','Stroke Development','Drill into swim transfer · coach check-ins · swimmer feedback','Stroke Development'],
    ['Thursday','PM','Skills + Endurance','Underwaters · turns · body position · aerobic skill control','Aerobic Skills'],
    ['Friday','PM','Speed + Stroke Reinforcement','Short speed · starts · breakouts · fast first strokes','Speed'],
    ['Saturday','AM','Rainbow Set / Competitive Performance','All energy zones · race habits · event skills · ownership','Rainbow Set']
  ];
  const junior=[
    ['Monday','PM','Stroke Introduction','Weekly stroke theme · simple body line and kick cues','Stroke Development'],
    ['Tuesday','PM','Stroke Development','Drill into swim transfer · simple repeatable cues','Stroke Development'],
    ['Thursday','PM','Skills + Endurance','Underwaters · turns · body position · aerobic skill control','Aerobic Skills'],
    ['Friday','PM','Speed + Race Quality','Short sharp swimming · starts · breakouts · race habits','Speed']
  ];
  // Keep the season/week direction separate from the normal role of a session.
  // Coach Hub uses the week for THIS WEEK and the matched row only for TODAY.
  // Day-level field is named `technical_focus` (not `session_technical_focus`) because
  // engines/coach-loop-ui.js's planContext() reads weekSession?.technical_focus verbatim when scoring
  // today's matched day row -- matching that reader exactly is what lets a day carry its own technical
  // focus text distinct from the week's, rather than silently always falling back to the week-level value.
  const sessionRows=rows=>rows.map(([day,dayPart,session_focus,technical_focus,primary_system])=>({day,dayPart,session_focus,technical_focus,primary_system}));
  const nd=[
    ['2026-05-11','Ruth Woolley Meet','Free','Base Skills','Aerobic Capacity','base'],['2026-05-18','Ruth Woolley Meet','Back','Base Skills','Aerobic Capacity','base'],['2026-05-25','','Fly','Base Skills','Aerobic Capacity','base'],['2026-06-01','','Breast','Base Skills','Aerobic Capacity','base'],
    ['2026-06-08','Vikings Meet','Free','Under Water','Aerobic Power','underwater'],['2026-06-15','','Back','Under Water','Aerobic Power','underwater'],['2026-06-22','','Breast','Under Water','Aerobic Power','underwater'],['2026-06-29','Canterbury SC Champs','Fly','Under Water','Aerobic Power','underwater'],
    ['2026-07-06','Dragon Meet','Free','Dives & Turns','Anaerobic Capacity','turns'],['2026-07-13','','Back','Dives & Turns','Anaerobic Capacity','turns'],['2026-07-20','','Breast','Dives & Turns','Anaerobic Capacity','turns'],['2026-07-27','NZ Secondary School Champs','Fly','Dives & Turns','Anaerobic Capacity','turns'],
    ['2026-08-03','Timaru Meet','Free','Finish & Breath Control','Anaerobic Power','finish'],['2026-08-10','','Back','Finish & Breath Control','Anaerobic Power','finish'],['2026-08-17','North Canterbury Meet','Breast','Finish & Breath Control','Anaerobic Power','finish'],['2026-08-24','South Island SC Champs','Fly','Finish & Breath Control','Anaerobic Power','finish'],
    ['2026-08-31','','All #1','Individual','Individual','taper'],['2026-09-07','Selwyn Meet','All #1','Individual','Individual','taper'],['2026-09-14','','Taper','#1 Individual','Individual','taper'],['2026-09-21','','Taper','#1 Individual','Individual','taper'],['2026-09-28','New Zealand SC Champs','Race','#1 Race','Race','taper']
  ];
  const ji=[
    ['2026-05-11','','Free','Base Skills','Aerobic Capacity','base'],['2026-05-18','','Back','Base Skills','Aerobic Capacity','base'],['2026-05-25','Ruth Woolley','Breast','Base Skills','Aerobic Capacity','base'],['2026-06-01','','Fly','Base Skills','Aerobic Capacity','base'],
    ['2026-06-08','Vikings','Free','Underwater','Aerobic Capacity','underwater'],['2026-06-15','','Back','Underwater','Aerobic Capacity','underwater'],['2026-06-22','','Breast','Underwater','Aerobic Capacity','underwater'],['2026-06-29','Canterbury SC','Fly','Underwater','Aerobic Capacity','underwater'],
    ['2026-07-06','Dragon','Free','Dives & Turns','Aerobic Capacity','turns'],['2026-07-13','','Back','Dives & Turns','Aerobic Capacity','turns'],['2026-07-20','','Breast','Dives & Turns','Aerobic Capacity','turns'],['2026-07-27','','Fly','Dives & Turns','Aerobic Capacity','turns'],
    ['2026-08-03','Timaru','Free','Finish & Breath','Anaerobic Capacity','finish'],['2026-08-10','','Back','Finish & Breath','Anaerobic Capacity','finish'],['2026-08-17','North Canty','Breast','Finish','Anaerobic Power','finish'],['2026-08-24','','Fly','Finish & Breath','Anaerobic Power','finish'],
    ['2026-08-31','','#1','AquaGym Signature','Aerobic Capacity','taper'],['2026-09-07','Selwyn','#1','Signature','Aerobic Capacity','taper'],['2026-09-14','','#1','AquaGym Signature','Aerobic Capacity','taper'],['2026-09-21','','#1','AquaGym Signature','Aerobic Capacity','taper'],['2026-09-28','','#1','AquaGym Signature','Aerobic Capacity','taper']
  ];
  function weeklyRows(table,squad,seasonId,sessions){return table.map((w,i)=>{const [week_start,meet,stroke,focus,energy,phaseKey]=w,p=phase[phaseKey]||phase.finish;return{id:`week-aquagym-${squad.toLowerCase()}-${week_start}`,week_start,squad,programme:squad,season_plan_id:seasonId,objective:[stroke,focus,energy,meet].filter(Boolean).join(' · '),focus,phase:focus,technical_focus:p.technical,primary_system:energy,physiological_focus:energy,psychological_focus:p.mental,carry_forward:'',meet,event:meet,stroke,sessions:sessionRows(sessions),source:`AquaGym ${squad} weekly structure + Winter 2026 week ${i+1}`};});}
  const weeks=[...weeklyRows(nd,'National',ND_SEASON,national),...weeklyRows(nd,'Development',ND_SEASON,development),...weeklyRows(ji,'Intermediate',JI_SEASON,intermediate),...weeklyRows(ji,'Junior',JI_SEASON,junior)];
  function seedIfNoRealImport(key, type, rows) {
    if (!(M.state.dataRegistry?.active?.[type])) {
      const current = Array.isArray(M.state[key]) ? M.state[key] : [];
      const ids = new Set(current.map(x => x?.id).filter(Boolean));
      M.state[key] = current.concat(rows.filter(x => !ids.has(x.id)));
    }
  }
  seedIfNoRealImport('seasonPlans', 'season_plan', seasons);
  seedIfNoRealImport('weeklyPlans', 'weekly_plan', weeks);
  P.seasons = seasons; P.weeks = weeks;
})(globalThis);
