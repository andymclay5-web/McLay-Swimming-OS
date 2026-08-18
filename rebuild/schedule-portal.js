'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports){module.exports=factory({Portal:require('./engine-portal.js'),EntityRegistry:require('../engines/entity-registry.js'),SessionSchedule:require('../engines/session-schedule.js')});}
  else root.MSOSSchedulePortal=factory({Portal:root.MSOSEnginePortal,EntityRegistry:root.MSOSEngines?.EntityRegistry,SessionSchedule:root.MSOSEngines?.SessionSchedule});
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  const VERSION='1.0.0';
  const required=['Portal','EntityRegistry','SessionSchedule'];
  function assertModules(){const missing=required.filter(k=>!E[k]);if(missing.length)throw new Error(`Schedule Portal missing modules: ${missing.join(', ')}`)}
  function call(instance,method,input){if(!instance||typeof instance[method]!=='function')throw new Error(`${method} is unavailable`);return instance[method](...(input?.args||[]))}
  function proxy(client,target,methods){const out={};for(const name of methods)out[name]=(...args)=>client.query(target,name,{args});return Object.freeze(out)}
  function create({scheduleStorage,calendarSources=[],evidenceSources=[],evidenceAliases=[],clubs=[],coaches=[],squads=[],memberships=[],clock=()=>new Date().toISOString()}={}){
    assertModules();if(!scheduleStorage)throw new Error('Schedule Portal requires Session Schedule storage');const portal=E.Portal.create({clock}),I={};
    portal.register({id:'entity-registry',version:E.EntityRegistry.VERSION,purpose:'Canonical club coach squad swimmer identity and memberships',owner:'programme identity',queries:{resolveSquad:input=>call(I.entities,'resolveSquad',input),listSquads:input=>call(I.entities,'listSquads',input),roster:input=>call(I.entities,'roster',input)}});
    portal.register({id:'session-schedule',version:E.SessionSchedule.VERSION,purpose:'Published and coach-authored calendar slots, shared session occurrences and squad entry timing',owner:'session schedule and calendar occurrence truth',calls:{query:{'entity-registry':['resolveSquad']}},queries:{dateInfo:input=>call(I.schedule,'dateInfo',input),slotsForDate:input=>call(I.schedule,'slotsForDate',input),getSlot:input=>call(I.schedule,'getSlot',input),occurrence:input=>call(I.schedule,'occurrence',input),occurrenceForSession:input=>call(I.schedule,'occurrenceForSession',input),entryContext:input=>call(I.schedule,'entryContext',input),identityForOccurrence:input=>call(I.schedule,'identityForOccurrence',input),day:input=>call(I.schedule,'day',input),listOccurrences:input=>call(I.schedule,'listOccurrences',input),history:input=>call(I.schedule,'history',input),snapshot:input=>call(I.schedule,'snapshot',input)},commands:{createCustomSlot:input=>call(I.schedule,'createCustomSlot',input),retireCustomSlot:input=>call(I.schedule,'retireCustomSlot',input),linkSlots:input=>call(I.schedule,'linkSlots',input),bindSession:input=>call(I.schedule,'bindSession',input),unbindSession:input=>call(I.schedule,'unbindSession',input),retireOccurrence:input=>call(I.schedule,'retireOccurrence',input)}});
    portal.register({id:'calendar-surface',version:'1.0.0',kind:'surface',purpose:'Calendar day and session occurrence navigation; no workout interpretation',owner:'presentation',calls:{query:{'session-schedule':['dateInfo','slotsForDate','getSlot','occurrence','occurrenceForSession','entryContext','identityForOccurrence','day','listOccurrences','history']},command:{'session-schedule':['createCustomSlot','retireCustomSlot','linkSlots','bindSession','unbindSession','retireOccurrence']}}});
    portal.register({id:'app-shell',version:'1.0.0',kind:'shell',purpose:'Navigation mounting offline adapters only; no direct schedule mutation',owner:'application shell'});
    I.entities=E.EntityRegistry.create({sources:evidenceSources,aliases:evidenceAliases,clubs,coaches,squads,memberships});
    const entityProxy=proxy(portal.client('session-schedule'),'entity-registry',['resolveSquad']);
    I.schedule=E.SessionSchedule.create({storage:scheduleStorage,entities:entityProxy,calendarSources,clock});
    const graph=portal.seal();const surface=portal.client('calendar-surface');
    return Object.freeze({
      version:VERSION,portal,graph,
      dateInfo:d=>surface.query('session-schedule','dateInfo',{args:[d]}),
      day:d=>surface.query('session-schedule','day',{args:[d]}),
      slotsForDate:(d,opts={})=>surface.query('session-schedule','slotsForDate',{args:[d,opts]}),
      occurrence:id=>surface.query('session-schedule','occurrence',{args:[id]}),
      occurrenceForSession:id=>surface.query('session-schedule','occurrenceForSession',{args:[id]}),
      entryContext:(occurrenceId,squadRef)=>surface.query('session-schedule','entryContext',{args:[occurrenceId,squadRef]}),
      identityForOccurrence:(occurrenceId,opts={})=>surface.query('session-schedule','identityForOccurrence',{args:[occurrenceId,opts]}),
      linkSlots:(slotIds,opts={})=>surface.command('session-schedule','linkSlots',{args:[slotIds,opts]}),
      bindSession:(occurrenceId,sessionId,opts={})=>surface.command('session-schedule','bindSession',{args:[occurrenceId,sessionId,opts]}),
      unbindSession:(occurrenceId,opts={})=>surface.command('session-schedule','unbindSession',{args:[occurrenceId,opts]}),
      createCustomSlot:(spec,opts={})=>surface.command('session-schedule','createCustomSlot',{args:[spec,opts]}),
      retireCustomSlot:(id,opts={})=>surface.command('session-schedule','retireCustomSlot',{args:[id,opts]}),
      retireOccurrence:(id,opts={})=>surface.command('session-schedule','retireOccurrence',{args:[id,opts]}),
      diagnostics:()=>portal.snapshot()
    });
  }
  return{VERSION,create,proxy};
});
