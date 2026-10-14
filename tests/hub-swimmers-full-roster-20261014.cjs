'use strict';
// 14 Oct 2026. Andy: "now we've got the profiles showing, but it only shows the ones who have the app. But I still
// need to see all the sort of information like I used to." The Coach Hub Swimmers screen led with "Swimmers with
// the app" and left everyone else as a bare name list with a small Profile button. It now leads with the whole
// roster, by squad, each row carrying the swimmer's key numbers and opening their full profile on tap; app access
// is a tag on the row plus its own section underneath.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','engines','hub-panels.js'),'utf8');

function load({role='owner'}={}){
  const navs=[],panels=[];
  const state={settings:{},athletes:[
      {id:'a1',full_name:'Matthew Robertson',squad:'National',active:true},
      {id:'a2',full_name:'Charlotte Murphy',squad:'National',active:true},
      {id:'a3',full_name:'Ruby Stace',squad:'Development',active:true},
      {id:'a4',full_name:'Sophie Newlove',squad:'National',active:false}],
    trainingTestTypes:[{id:'t',test_key:'t400_free',name:'T400 Freestyle'}],
    trainingTestResults:[{athlete_id:'a2',test_type_id:'t',result_seconds:290.4,result_date:'2026-10-01'},{athlete_id:'a2',test_type_id:'t',result_seconds:295,result_date:'2026-09-01'}],
    coachResults:[{athlete_id:'a3',distance:100,stroke:'Backstroke',result_seconds:70.12,result_date:'2026-09-20'}],
    canonicalSessions:{s1:{id:'s1',identity:{date:new Date().toISOString().slice(0,10)}}},
    attendance:[{athlete_id:'a2',session_id:'s1',status:'present'}]};
  const M={state,util:{clock:s=>`T${Number(s).toFixed(1)}`},access:{role:()=>role,visibleAthletes:()=>state.athletes.filter(a=>a.squad==='National')},
    nav:{show:(v)=>navs.push(v)},storageEngine:{saveUi(){}},coachLoopUI:{openHubPanel:p=>panels.push(p)},
    swimmerInviteBN:{rpc:async()=>[{athlete_id:'a1',devices:1,has_account:false,last_seen_at:null,last_published_at:null,open_invites:0}]}};
  const g={MSOS4:M,MSOSEngines:{},Date,Promise,console};
  vm.runInNewContext(src,{globalThis:g,...g});
  return{M,navs,panels};
}
function host(){const h={isConnected:true,html:'',handlers:{},set innerHTML(v){this.html=v},get innerHTML(){return this.html},
  querySelectorAll(sel){const m=sel.match(/^\[data-hp-card\]$/);if(!m)return[];return[...this.html.matchAll(/data-hp-card="([^"]+)"/g)].map(x=>({dataset:{hpCard:x[1]},set onclick(f){h.handlers[x[1]]=f}}));},
  querySelector(){return null}};return h;}

(async()=>{
  // Owner: every active swimmer is listed, not just the one with the app.
  {const {M,navs}=load();const h=host();M.hubPanels.renderSwimmers(h);await new Promise(r=>setTimeout(r,10));
    for(const n of['Matthew Robertson','Charlotte Murphy','Ruby Stace'])assert.ok(h.html.includes(n),`${n} missing from the roster`);
    assert.ok(!/Sophie Newlove/.test(h.html.split('App access')[0]),'inactive swimmer must stay off the roster');
    assert.ok(/All swimmers · 3/.test(h.html),'roster header counts every active swimmer');
    assert.ok(/National · 2/.test(h.html)&&/Development · 1/.test(h.html),'grouped by squad');
    // The information is on the row.
    assert.ok(h.html.includes('T290.4'),'latest T400 shown on the row');
    assert.ok(/1 session \/ 4 wks/.test(h.html),'recent sessions shown on the row');
    assert.ok(h.html.includes('100 Backstroke T70.1'),'latest race shown on the row');
    // App access is a tag and its own section, not the gate for being listed.
    const roster=h.html.split('App access')[0];
    assert.ok(/Matthew Robertson <small class="good-text">· app<\/small>/.test(roster),'app tag on the swimmer who has it');
    assert.ok(/App access/.test(h.html)&&/1 QR device/.test(h.html.split('App access')[1]),'app-access detail kept underneath');
    // One tap on any swimmer (with or without the app) opens the full profile.
    h.handlers.a3();assert.deepStrictEqual(navs,['athletes']);assert.strictEqual(M.state.settings.selectedAthleteId,'a3');}
  // Assistant: only their squads, and a tap opens that swimmer's report (no owner profile screen).
  {const {M,navs,panels}=load({role:'assistant'});const h=host();M.hubPanels.renderSwimmers(h);
    assert.ok(h.html.includes('Charlotte Murphy')&&!h.html.includes('Ruby Stace'),'assistant sees assigned squads only');
    assert.ok(!/App access/.test(h.html),'assistant does not see app-access management');
    h.handlers.a2();assert.deepStrictEqual(panels,['reports']);assert.deepStrictEqual(navs,[]);}
  console.log('hub-swimmers-full-roster-20261014: all passed');
})().catch(e=>{console.error(e);process.exit(1);});
