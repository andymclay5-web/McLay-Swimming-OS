'use strict';
const assert=require('node:assert/strict');

const modalHost={innerHTML:'',querySelector:()=>null};
const body={dataset:{}};
global.window={scrollY:0,scrollTo:()=>{}};
global.requestAnimationFrame=fn=>fn();
global.history={state:null,replaceState(s){this.state=s},pushState(s){this.state=s},back(){}};
global.addEventListener=()=>{};
global.document={
  visibilityState:'visible',body,
  querySelectorAll:()=>[],
  querySelector:s=>s==='#modalHost'?modalHost:null,
  addEventListener:()=>{}
};
const slotNat={id:'slot-nat',date:'2026-09-07',dayPart:'AM',start:'05:20',end:'07:20',squad:'National',venue:'AquaGym',course:'SCM',label:'AM · 05:20-07:20 · National · AquaGym'};
const slotDev={id:'slot-dev',date:'2026-09-07',dayPart:'PM',start:'18:30',end:'20:00',squad:'Development',venue:'AquaGym',course:'SCM',label:'PM · 18:30-20:00 · Development · AquaGym'};
const state={settings:{view:'meet',selectedSessionId:'old'},canonicalSessions:{},athletes:[]};
global.MSOS4={
  state,util:{escape:String},
  nav:{views:['board','tv','hub','swimmer','meet','athletes','roll','times','connection','guardian'],state:(view,extra={})=>({msos:true,msosView:view,...extra})},
  ui:{renderCurrent:()=>{},renderHeader:()=>{},modal:()=>({querySelector:()=>({innerHTML:''}),querySelectorAll:()=>[]})},
  access:{role:()=> 'owner',sessionAllowed:()=>true,can:()=>true},
  storageEngine:{saveUi:()=>{}},boardStateEngine:{cancelWork:()=>{}},
  calendar:{slots:d=>d==='2026-09-07'?[slotNat,slotDev]:[],matches:(s,slot)=>s?.identity?.date===slot.date&&s?.identity?.dayPart===slot.dayPart&&(s.identity.squads||[]).includes(slot.squad)&&s.identity.venue===slot.venue,load:async()=>true},
  actions:{closeModal:()=>{},openNewSession:async()=>{}},
  currentSession:()=>null,selectSession:()=>{},toast:()=>{}
};
require('../engines/navigation.js');
const V=global.MSOS4.navigationEngine;
assert.ok(V,'navigation authority must install');

global.MSOS4.nav.init();
assert.equal(state.settings.view,'board','owner launch must land on Board');
assert.equal(state.settings.surfaceMode,'training');
global.MSOS4.nav.show('meet',{push:false,restore:false});
assert.equal(state.settings.view,'meet','explicit Meet navigation must still work');

state.canonicalSessions={};
let entries=V.sessionEntriesForDate('2026-09-07',[]);
assert.deepEqual(entries.map(x=>[x.kind,x.id]),[['slot','slot-nat'],['slot','slot-dev']]);

const saved={id:'session-nat',identity:{date:'2026-09-07',dayPart:'AM',squads:['National'],venue:'AquaGym',course:'SCM'}};
entries=V.sessionEntriesForDate('2026-09-07',[saved]);
assert.equal(entries.filter(x=>x.kind==='session').length,1);
assert.equal(entries.filter(x=>x.kind==='slot').length,1);
assert.equal(entries.find(x=>x.kind==='slot').id,'slot-dev');

let selectedDate='',selectedSlot='',focused=false;
const dateInput={value:'',onchange:async()=>{selectedDate=dateInput.value;}};
const slotInput={value:'',options:[{value:'slot-nat'}],onchange:()=>{selectedSlot=slotInput.value;}};
const sourceInput={focus:()=>{focused=true;}};
const fakeHost={querySelector:s=>s==='#newDate'?dateInput:s==='#newSlot'?slotInput:s==='#newSource'?sourceInput:null};
global.document.querySelector=s=>s==='#modalHost'?fakeHost:null;
global.MSOS4.actions.openNewSession=async()=>{};
(async()=>{
  await V.openPublishedSlot(slotNat);
  assert.equal(selectedDate,'2026-09-07');
  assert.equal(selectedSlot,'slot-nat');
  assert.equal(focused,true);
  console.log('NAVIGATION_CALENDAR_BOARD_20260907_PASS');
})().catch(e=>{console.error(e);process.exit(1)});
