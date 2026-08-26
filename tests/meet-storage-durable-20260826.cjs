'use strict';
const assert=require('node:assert/strict');

global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn()};
global.window={scrollTo:()=>{}};
global.indexedDB={open(){throw new Error('test-no-indexeddb')}};

global.MSOS4={
  BUILD:'test-build',
  STORAGE_KEY:'test-storage-key',
  util:{now:()=>new Date(0).toISOString()},
  store:{save:s=>s},
  state:{
    settings:{selectedSessionId:'session-1',storageRevision:7},
    canonicalSessions:{'session-1':{id:'session-1',source:{text:'training truth'}}},
    athletes:[{id:'a1',full_name:'Aqua One'}],
    attendance:[],
    trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],adaptationOverrides:[],
    meetFieldDeck:{source_id:'meet-source-1',title:'South Island Champs',races:[{event_number:1,heat:1,lane:3,athlete_id:'a1'}]},
    meetImports:[{id:'meet-source-1',name:'Session 1',size:1234,text:'SESSION ONE RAW',parsed:{large:'derived-copy'}}],
    meetOps:{races:{'meet-source-1|1|1|3|a1':{status:'draft',draft_time_seconds:32.1}},evidence:[{id:'ev1',text_content:'clean turn'}]},
    meetProgramBA:{
      sources:[
        {source_id:'meet-source-1',added_at:'2026-08-26T00:00:00Z',raw:'SESSION ONE RAW',parsed:{events:[1]}},
        {source_id:'meet-source-2',added_at:'2026-08-26T01:00:00Z',raw:'SESSION TWO RAW',parsed:{events:[2]}}
      ],
      nowKey:'meet-source-2|8|3',selectedSourceId:'meet-source-2',selectedEventNumber:8,selectedKey:'race-x',selectedAthleteId:'a1',expandedKey:'row-x',commentaries:[]
    },
    meets:[{id:'m1'}],meetEntries:[{id:'entry1'}],meetRaces:[{id:'race1'}],meetEvidence:[{id:'me1'}]
  }
};

require('../engines/storage.js');
const S=global.MSOS4.storageEngine;
assert.ok(S,'storage engine must initialise');
const compact=S.compact(global.MSOS4.state);
assert.equal(compact.meetFieldDeck.source_id,'meet-source-1');
assert.equal(compact.meetFieldDeck.races.length,1);
assert.equal(compact.meetImports.length,1);
assert.equal(compact.meetImports[0].text,'SESSION ONE RAW');
assert.equal(Object.hasOwn(compact.meetImports[0],'parsed'),false,'derived parsed import copy should not bloat compact recovery');
assert.equal(compact.meetOps.races['meet-source-1|1|1|3|a1'].draft_time_seconds,32.1);
assert.equal(compact.meetOps.evidence[0].text_content,'clean turn');
assert.equal(compact.meetProgramBA.sources.length,2);
assert.deepEqual(compact.meetProgramBA.sources.map(x=>x.raw),['SESSION ONE RAW','SESSION TWO RAW']);
assert.equal(Object.hasOwn(compact.meetProgramBA.sources[0],'parsed'),false,'programme can be reparsed from retained raw source');
assert.equal(compact.meetProgramBA.nowKey,'meet-source-2|8|3');
assert.equal(compact.meetProgramBA.selectedSourceId,'meet-source-2');
assert.equal(compact.meetProgramBA.selectedEventNumber,8);
assert.equal(compact.meets[0].id,'m1');
assert.equal(compact.meetEntries[0].id,'entry1');
assert.equal(compact.meetRaces[0].id,'race1');
assert.equal(compact.meetEvidence[0].id,'me1');

const sig1=S.meetDurableSignature(global.MSOS4.state);
global.MSOS4.state.meetProgramBA.sources.push({source_id:'meet-source-3',raw:'FINALS RAW'});
const sig2=S.meetDurableSignature(global.MSOS4.state);
assert.notEqual(sig1,sig2,'adding a programme source must trigger a new durable Meet signature');

global.MSOS4.state.meetFieldDeck=null;
const sig3=S.meetDurableSignature(global.MSOS4.state);
assert.notEqual(sig2,sig3,'clearing the active field deck must trigger a durable recovery checkpoint');

console.log('MEET_STORAGE_DURABLE_PASS sources=2 selected=E8 ops=retained');
