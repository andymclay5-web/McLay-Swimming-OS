'use strict';
const assert=require('node:assert/strict');

const fakeHead={appendChild(){}};
global.document={
  readyState:'loading',
  head:fakeHead,
  getElementById(){return null},
  createElement(){return{style:{},dataset:{},appendChild(){},querySelector(){return null},querySelectorAll(){return[]}}},
  querySelector(){return null},
  addEventListener(){}
};

global.MSOS4={
  util:{
    text:v=>String(v??'').replace(/\s+/g,' ').trim(),
    escape:v=>String(v??''),
    now:()=> '2026-08-27T08:00:00.000Z'
  },
  ui:{renderMeet(){}},
  nav:{openLayer(){},dismissLayer(){}},
  toast(){},
  storageEngine:{saveUi(){}},
  store:{save(){}},
  state:{
    settings:{view:'meet',currentMeetId:'test-a'},
    meets:[
      {id:'test-a',title:'Meet A',createdAt:'2026-08-01T00:00:00Z'},
      {id:'test-b',title:'Meet B',createdAt:'2026-08-01T00:00:01Z'}
    ],
    meetFieldDeck:{
      source_id:'north-s1',meet_id:'test-a',title:'2026 NCSC Best Time Ribbon Carnival',session:'Session 1',date_range:'21/08/2026 to 22/08/2026',
      races:[{event_number:1,heat:1,lane:4,athlete_id:'a1',athlete_name:'North One'}],swimmers:['North One']
    },
    meetImports:[{id:'north-s1',meet_id:'test-a',text:'North source'}],
    meetProgramBA:{
      sources:Array.from({length:6},(_,i)=>({source_id:`north-s${i+1}`,raw:`North Session ${i+1}`})),
      commentaries:[{id:'north-comment'}],nowKey:'north-now',selectedSourceId:'north-s1',selectedEventNumber:1
    },
    meetOps:{races:{northRace:{race_key:'northRace',notes:'north note',status:'draft'}},evidence:[{id:'north-evidence'}],selectedRaceKey:'northRace',selectedAthleteId:'a1'}
  }
};

const M=global.MSOS4;
let serial=0;
M.meet={
  ensureState(){M.state.meets=M.state.meets||[];M.state.settings=M.state.settings||{}},
  current(){this.ensureState();return M.state.meets.find(x=>x.id===M.state.settings.currentMeetId)||M.state.meets[0]||null},
  create({title,date='',venue='',course='',sessions=[]}={}){this.ensureState();const row={id:`meet-${++serial}`,title,date,venue,course,sessions,createdAt:`2026-08-27T08:00:0${serial}Z`};M.state.meets.push(row);M.state.settings.currentMeetId=row.id;return row},
  setCurrent(id){this.ensureState();if(!M.state.meets.some(x=>x.id===id))throw new Error('Meet not found');M.state.settings.currentMeetId=id;return this.current()}
};

require('../engines/meet-workspace-cy.js');
const W=M.meetWorkspaceEngine;
assert.ok(W,'meet workspace engine must load');

const north=W.adoptLoadedProgramme();
assert.ok(north,'loaded programme must be adopted into a canonical meet');
assert.equal(north.title,'2026 NCSC Best Time Ribbon Carnival');
assert.notEqual(north.id,'test-a','loaded real programme must not inherit old Meet A test container');
assert.equal(M.state.meetFieldDeck.meet_id,north.id);
assert.equal(M.state.meetImports[0].meet_id,north.id);
assert.equal(M.state.meetProgramBA.sources.every(s=>s.meet_id===north.id),true);
assert.equal(W.managedRows().length,1,'only real programme workspaces should appear as Meet tabs');
assert.equal(W.managedRows()[0].title,'2026 NCSC Best Time Ribbon Carnival');

W.snapshotCurrent();
const northId=north.id;
const south={id:'south-2026',title:'2026 South Island Championships',date:'2026-08-28',course:'SCM',createdAt:'2026-08-27T09:00:00Z'};
M.state.meets.push(south);
M.state.meetProgramBA.meetWorkspaces[south.id]={
  meet_id:south.id,title:south.title,saved_at:'2026-08-27T09:00:00Z',
  deck:{source_id:'south-s1',meet_id:south.id,title:south.title,session:'Session 1',races:[{event_number:2,heat:1,lane:3,athlete_id:'a2',athlete_name:'South One'}],swimmers:['South One']},
  program:{sources:Array.from({length:6},(_,i)=>({source_id:`south-s${i+1}`,meet_id:south.id,raw:`South Session ${i+1}`})),commentaries:[{id:'south-comment'}],nowKey:'south-now',selectedSourceId:'south-s1',selectedEventNumber:2},
  ops:{races:{southRace:{race_key:'southRace',notes:'south note',status:'draft'}},evidence:[{id:'south-evidence'}],selectedRaceKey:'southRace',selectedAthleteId:'a2'}
};

W.restoreMeet(south.id);
assert.equal(M.state.settings.currentMeetId,south.id);
assert.equal(M.state.meetFieldDeck.title,south.title);
assert.equal(M.state.meetProgramBA.sources.length,6);
assert.equal(M.state.meetProgramBA.sources.every(s=>s.meet_id===south.id),true);
assert.equal(M.state.meetOps.races.southRace.notes,'south note');
assert.equal(M.state.meetOps.races.northRace,undefined,'North race ops must not bleed into South Islands');

M.state.meetOps.races.southRace.notes='south updated';
W.restoreMeet(northId);
assert.equal(M.state.settings.currentMeetId,northId);
assert.equal(M.state.meetFieldDeck.title,'2026 NCSC Best Time Ribbon Carnival');
assert.equal(M.state.meetProgramBA.sources.length,6);
assert.equal(M.state.meetOps.races.northRace.notes,'north note');
assert.equal(M.state.meetOps.races.southRace,undefined,'South race ops must not bleed into North Canterbury');

W.restoreMeet(south.id);
assert.equal(M.state.meetOps.races.southRace.notes,'south updated','South workspace changes must survive leaving and returning');
const visible=W.managedRows().map(x=>x.title);
assert.deepEqual(visible,['2026 NCSC Best Time Ribbon Carnival','2026 South Island Championships']);
assert.equal(visible.includes('Meet A'),false);
assert.equal(visible.includes('Meet B'),false);

console.log('MEET_MULTI_WORKSPACE_PASS meets=2 northSessions=6 southSessions=6 isolated=true');
