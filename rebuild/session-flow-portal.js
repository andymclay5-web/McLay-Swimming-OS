'use strict';
(function(root,factory){
  if(typeof module==='object'&&module.exports){module.exports=factory({
    Portal:require('./engine-portal.js'),
    EntityRegistry:require('../engines/entity-registry.js'),
    SessionSchedule:require('../engines/session-schedule.js'),
    SessionTruth:require('../engines/session-truth.js'),
    SessionLifecycle:require('../engines/session-lifecycle.js')
  });}else root.MSOSSessionFlowPortal=factory({Portal:root.MSOSEnginePortal,...(root.MSOSEngines||{})});
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  const VERSION='1.0.0';
  const required=['Portal','EntityRegistry','SessionSchedule','SessionTruth','SessionLifecycle'];
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function assertModules(){const missing=required.filter(k=>!E[k]);if(missing.length)throw new Error(`Session Flow Portal missing modules: ${missing.join(', ')}`)}
  function call(instance,method,input){if(!instance||typeof instance[method]!=='function')throw new Error(`${method} is unavailable`);return instance[method](...(input?.args||[]))}
  function proxy(client,target,methods){const out={};for(const name of methods)out[name]=(...args)=>client.query(target,name,{args});return Object.freeze(out)}
  class IntakeFlow{
    constructor({portal}={}){this.portal=portal;this.client=portal.client('session-intake-flow')}
    beginFromSlots(slotIds,{inputMode='text',title='',note=''}={}){
      const ids=[...new Set((slotIds||[]).map(text).filter(Boolean))];if(!ids.length)throw new Error('Session intake requires at least one selected schedule slot');
      const occurrence=this.client.command('session-schedule','linkSlots',{args:[ids,{note}]});
      try{
        const identity=this.client.query('session-schedule','identityForOccurrence',{args:[occurrence.id,{title}]});
        const draft=this.client.command('session-lifecycle','createDraft',{args:[{identity,source:'',slotKey:occurrence.id,inputMode}]});
        return{occurrence,identity,draft};
      }catch(error){
        this.client.command('session-schedule','retireOccurrence',{args:[occurrence.id,{note:`Intake begin rollback: ${text(error.message)}`} ]});throw error;
      }
    }
    beginFromOccurrence(occurrenceId,{inputMode='text',title=''}={}){
      const occurrence=this.client.query('session-schedule','occurrence',{args:[occurrenceId]});if(!occurrence||!occurrence.active)throw new Error(`Active schedule occurrence not found: ${occurrenceId}`);if(occurrence.sessionId)throw new Error(`Schedule occurrence already has session: ${occurrence.sessionId}`);
      const identity=this.client.query('session-schedule','identityForOccurrence',{args:[occurrence.id,{title}]}),draft=this.client.command('session-lifecycle','createDraft',{args:[{identity,source:'',slotKey:occurrence.id,inputMode}]});return{occurrence,identity,draft};
    }
    updateDraft(draftId,patch={}){return this.client.command('session-lifecycle','updateDraft',{args:[draftId,patch]})}
    discardDraft(draftId,{retireOccurrence=false,note=''}={}){
      const draft=this.client.query('session-lifecycle','getDraft',{args:[draftId]});if(!draft)return false;const removed=this.client.command('session-lifecycle','discardDraft',{args:[draftId]});if(retireOccurrence&&draft.slotKey)this.client.command('session-schedule','retireOccurrence',{args:[draft.slotKey,{note}]});return removed;
    }
    previewDraft(draftId){
      const draft=this.client.query('session-lifecycle','getDraft',{args:[draftId]});if(!draft)throw new Error(`Draft not found: ${draftId}`);const session=this.client.query('session-truth','parse',{source:draft.source,identity:draft.identity}),validation=this.client.query('session-truth','validate',{session});return{draft,session,validation};
    }
    acceptDraft(draftId,{select=true}={}){
      const preview=this.previewDraft(draftId);if(!preview.validation?.ok)throw new Error(`Session Truth rejected intake: ${(preview.validation?.errors||[]).join('; ')}`);
      const occurrence=this.client.query('session-schedule','occurrence',{args:[preview.draft.slotKey]});if(!occurrence||!occurrence.active)throw new Error(`Draft schedule occurrence is no longer active: ${preview.draft.slotKey}`);if(occurrence.sessionId)throw new Error(`Draft schedule occurrence already bound: ${occurrence.sessionId}`);
      const record=this.client.command('session-lifecycle','createFromDraft',{args:[draftId,preview.session,{select}]},{sessionId:preview.session.id});
      try{const bound=this.client.command('session-schedule','bindSession',{args:[occurrence.id,record.id,{note:'Accepted canonical session'}]},{sessionId:record.id});return{record,bound,session:clone(record.current)}}
      catch(error){this.client.command('session-lifecycle','markSuperseded',{args:[record.id,{note:`Schedule bind failed: ${text(error.message)}`} ]},{sessionId:record.id});throw error}
    }
    occurrenceForSession(sessionId){return this.client.query('session-schedule','occurrenceForSession',{args:[sessionId]},{sessionId})}
  }
  function create({scheduleStorage,lifecycleStorage,calendarSources=[],evidenceSources=[],evidenceAliases=[],clubs=[],coaches=[],squads=[],memberships=[],clock=()=>new Date().toISOString()}={}){
    assertModules();if(!scheduleStorage)throw new Error('Session Flow Portal requires Schedule storage');if(!lifecycleStorage)throw new Error('Session Flow Portal requires Lifecycle storage');const portal=E.Portal.create({clock}),I={};
    portal.register({id:'entity-registry',version:E.EntityRegistry.VERSION,purpose:'Canonical programme identity',owner:'programme identity',queries:{resolveSquad:input=>call(I.entities,'resolveSquad',input)}});
    portal.register({id:'session-schedule',version:E.SessionSchedule.VERSION,purpose:'Calendar slots and shared session occurrence truth',owner:'session schedule',calls:{query:{'entity-registry':['resolveSquad']}},queries:{dateInfo:input=>call(I.schedule,'dateInfo',input),slotsForDate:input=>call(I.schedule,'slotsForDate',input),getSlot:input=>call(I.schedule,'getSlot',input),occurrence:input=>call(I.schedule,'occurrence',input),occurrenceForSession:input=>call(I.schedule,'occurrenceForSession',input),identityForOccurrence:input=>call(I.schedule,'identityForOccurrence',input),day:input=>call(I.schedule,'day',input)},commands:{linkSlots:input=>call(I.schedule,'linkSlots',input),bindSession:input=>call(I.schedule,'bindSession',input),retireOccurrence:input=>call(I.schedule,'retireOccurrence',input)}});
    portal.register({id:'session-truth',version:E.SessionTruth.VERSION,purpose:'Natural coaching language to canonical session only',owner:'session semantics',queries:{parse:input=>E.SessionTruth.parse(input.source,input.identity||{}),validate:input=>E.SessionTruth.validate(input.session)}});
    portal.register({id:'session-lifecycle',version:E.SessionLifecycle.VERSION,purpose:'Draft accepted session selection and revision persistence',owner:'session lifecycle',queries:{getDraft:input=>call(I.lifecycle,'getDraft',input),getSession:input=>call(I.lifecycle,'getSession',input),selected:input=>call(I.lifecycle,'selected',input),listSessions:input=>call(I.lifecycle,'listSessions',input),listDrafts:input=>call(I.lifecycle,'listDrafts',input),snapshot:input=>call(I.lifecycle,'snapshot',input)},commands:{createDraft:input=>call(I.lifecycle,'createDraft',input),updateDraft:input=>call(I.lifecycle,'updateDraft',input),discardDraft:input=>call(I.lifecycle,'discardDraft',input),createFromDraft:input=>call(I.lifecycle,'createFromDraft',input),selectSession:input=>call(I.lifecycle,'selectSession',input),markSuperseded:input=>call(I.lifecycle,'markSuperseded',input)}});
    portal.register({id:'session-intake-flow',version:VERSION,kind:'application',purpose:'Explicit transaction coordinator for schedule occurrence -> draft -> canonical accepted session -> schedule binding',owner:'session intake workflow',calls:{query:{'session-schedule':['occurrence','occurrenceForSession','identityForOccurrence'],'session-lifecycle':['getDraft'],'session-truth':['parse','validate']},command:{'session-schedule':['linkSlots','bindSession','retireOccurrence'],'session-lifecycle':['createDraft','updateDraft','discardDraft','createFromDraft','markSuperseded']}}});
    portal.register({id:'calendar-surface',version:'1.0.0',kind:'surface',purpose:'Calendar and session intake presentation only',owner:'presentation',calls:{query:{'session-schedule':['dateInfo','slotsForDate','occurrence','occurrenceForSession','day'],'session-lifecycle':['getDraft','getSession','listDrafts','listSessions','selected']},command:{'session-intake-flow':['beginFromSlots','beginFromOccurrence','updateDraft','discardDraft','acceptDraft']}}});
    portal.register({id:'app-shell',version:'1.0.0',kind:'shell',purpose:'Navigation mounting adapters only; no direct schedule/session truth writes',owner:'application shell'});
    I.entities=E.EntityRegistry.create({sources:evidenceSources,aliases:evidenceAliases,clubs,coaches,squads,memberships});I.schedule=E.SessionSchedule.create({storage:scheduleStorage,entities:proxy(portal.client('session-schedule'),'entity-registry',['resolveSquad']),calendarSources,clock});I.lifecycle=E.SessionLifecycle.create({storage:lifecycleStorage,clock});I.intake=new IntakeFlow({portal});
    const intakeHandler=(method)=>(input)=>call(I.intake,method,input);const service=portal.services.get('session-intake-flow');service.commands.beginFromSlots=intakeHandler('beginFromSlots');service.commands.beginFromOccurrence=intakeHandler('beginFromOccurrence');service.commands.updateDraft=intakeHandler('updateDraft');service.commands.discardDraft=intakeHandler('discardDraft');service.commands.acceptDraft=intakeHandler('acceptDraft');
    const graph=portal.seal(),surface=portal.client('calendar-surface');
    return Object.freeze({version:VERSION,portal,graph,
      day:d=>surface.query('session-schedule','day',{args:[d]}),slotsForDate:d=>surface.query('session-schedule','slotsForDate',{args:[d]}),occurrence:id=>surface.query('session-schedule','occurrence',{args:[id]}),occurrenceForSession:id=>surface.query('session-schedule','occurrenceForSession',{args:[id]},{sessionId:id}),
      beginFromSlots:(ids,opts={})=>surface.command('session-intake-flow','beginFromSlots',{args:[ids,opts]}),beginFromOccurrence:(id,opts={})=>surface.command('session-intake-flow','beginFromOccurrence',{args:[id,opts]}),updateDraft:(id,patch={})=>surface.command('session-intake-flow','updateDraft',{args:[id,patch]}),discardDraft:(id,opts={})=>surface.command('session-intake-flow','discardDraft',{args:[id,opts]}),acceptDraft:(id,opts={})=>surface.command('session-intake-flow','acceptDraft',{args:[id,opts]}),
      draft:id=>surface.query('session-lifecycle','getDraft',{args:[id]}),session:id=>surface.query('session-lifecycle','getSession',{args:[id]},{sessionId:id}),sessions:()=>surface.query('session-lifecycle','listSessions',{args:[]}),selectedSession:()=>surface.query('session-lifecycle','selected',{args:[]}),diagnostics:()=>portal.snapshot()
    });
  }
  return{VERSION,create,IntakeFlow,proxy};
});
