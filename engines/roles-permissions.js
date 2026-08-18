'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.RolesPermissions=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const BASE={
    owner:['*'],
    assistant:['board','roll','timing','capture','meet'],
    swimmer:['swimmer_self','meet_self','evidence_self','pathway_self'],
    display:['board_display','meet_display']
  };
  const SENSITIVE=new Set(['author_session','edit_session','finish_session','release_session','admin','cloud_repair','private_notes','manage_roles','manage_permissions']);
  function principal(raw={}){if(typeof raw==='string')return{id:text(raw),role:'unknown',athlete_id:''};return{id:text(raw.id||raw.principal_id||raw.email),role:norm(raw.role||'unknown'),athlete_id:text(raw.athlete_id||raw.athleteId),active:raw.active!==false}}
  function assignment(raw={}){return{id:text(raw.id),principal_id:text(raw.principal_id||raw.principalId),role:norm(raw.role),squad_ids:[...(raw.squad_ids||raw.squadIds||[])].map(text).filter(Boolean),session_ids:[...(raw.session_ids||raw.sessionIds||[])].map(text).filter(Boolean),meet_ids:[...(raw.meet_ids||raw.meetIds||[])].map(text).filter(Boolean),athlete_ids:[...(raw.athlete_ids||raw.athleteIds||[])].map(text).filter(Boolean),grants:[...(raw.grants||[])].map(norm).filter(Boolean),denies:[...(raw.denies||[])].map(norm).filter(Boolean),active:raw.active!==false,starts_at:text(raw.starts_at),ends_at:text(raw.ends_at)}}
  function context(raw={}){return{session_id:text(raw.session_id||raw.sessionId),squad_id:text(raw.squad_id||raw.squadId),meet_id:text(raw.meet_id||raw.meetId),athlete_id:text(raw.athlete_id||raw.athleteId)}}
  function inTime(a,at){const t=text(at);if(a.starts_at&&t&&t<a.starts_at)return false;if(a.ends_at&&t&&t>a.ends_at)return false;return true}
  function scopeMatch(a,c){if(a.session_ids.length&&(!c.session_id||!a.session_ids.includes(c.session_id)))return false;if(a.squad_ids.length&&(!c.squad_id||!a.squad_ids.includes(c.squad_id)))return false;if(a.meet_ids.length&&(!c.meet_id||!a.meet_ids.includes(c.meet_id)))return false;if(a.athlete_ids.length&&(!c.athlete_id||!a.athlete_ids.includes(c.athlete_id)))return false;return true}
  class RolesPermissions{
    constructor({principals=[],assignments=[],clock=()=>new Date().toISOString()}={}){this.clock=clock;this.principals=(principals||[]).map(principal);this.assignments=(assignments||[]).map(assignment)}
    getPrincipal(ref){const id=typeof ref==='string'?ref:ref?.id||ref?.principal_id;return clone(this.principals.find(x=>x.id===text(id))||principal(ref||{}))}
    assignmentsFor(ref,{at=''}={}){const p=this.getPrincipal(ref),when=at||this.clock();return clone(this.assignments.filter(x=>x.active&&x.principal_id===p.id&&inTime(x,when)))}
    decision(ref,capability,ctx={},opts={}){
      const p=this.getPrincipal(ref),cap=norm(capability),c=context(ctx),at=opts.at||this.clock();if(!p.id||p.active===false)return{allowed:false,reason:'inactive_or_missing_principal',principal:p,capability:cap,context:c};
      if(p.role==='owner')return{allowed:true,reason:'owner',principal:p,capability:cap,context:c};
      if(p.role==='swimmer'){
        const self=p.athlete_id&&c.athlete_id===p.athlete_id,base=(BASE.swimmer||[]).includes(cap);return{allowed:!!(base&&self),reason:base?(self?'self_scope':'not_self'):'role_default_denied',principal:p,capability:cap,context:c};
      }
      const rows=this.assignments.filter(x=>x.active&&x.principal_id===p.id&&inTime(x,at)&&scopeMatch(x,c));if(!rows.length)return{allowed:false,reason:'no_matching_assignment',principal:p,capability:cap,context:c};
      if(rows.some(x=>x.denies.includes(cap)||x.denies.includes('*')))return{allowed:false,reason:'explicit_deny',principal:p,capability:cap,context:c};
      if(rows.some(x=>x.grants.includes(cap)||x.grants.includes('*')))return{allowed:true,reason:SENSITIVE.has(cap)?'explicit_sensitive_grant':'explicit_grant',principal:p,capability:cap,context:c};
      if(SENSITIVE.has(cap))return{allowed:false,reason:'sensitive_requires_explicit_grant',principal:p,capability:cap,context:c};
      const role=rows.find(x=>x.role)?.role||p.role,base=BASE[role]||BASE[p.role]||[];return{allowed:base.includes('*')||base.includes(cap),reason:base.includes(cap)?'role_default':'role_default_denied',principal:p,capability:cap,context:c};
    }
    can(ref,capability,ctx={},opts={}){return this.decision(ref,capability,ctx,opts).allowed}
    capabilities(ref,ctx={},opts={}){const known=new Set(Object.values(BASE).flat().filter(x=>x!=='*'));for(const x of SENSITIVE)known.add(x);for(const a of this.assignmentsFor(ref,opts)){for(const x of a.grants)known.add(x);for(const x of a.denies)known.add(x)}return[...known].sort().map(capability=>({capability,...this.decision(ref,capability,ctx,opts)}))}
    filterAthletes(ref,athletes=[],ctx={},opts={}){const p=this.getPrincipal(ref);if(p.role==='owner')return clone(athletes);if(p.role==='swimmer')return clone(athletes.filter(a=>text(a.id||a.athlete_id)===p.athlete_id));const rows=this.assignmentsFor(ref,opts).filter(a=>scopeMatch(a,context(ctx)));const scoped=new Set(rows.flatMap(x=>x.athlete_ids));return scoped.size?clone(athletes.filter(a=>scoped.has(text(a.id||a.athlete_id)))):clone(athletes)}
    surface(ref,surfaceName,ctx={},opts={}){const surface=norm(surfaceName),map={assistant_coach:['board','roll','timing','capture','meet'],swimmer_device:['swimmer_self','meet_self','evidence_self','pathway_self'],tv_board:['board_display'],meet_deck:['meet'],coach_authoring:['author_session','edit_session','finish_session']},needed=map[surface]||[];return{surface,allowed:needed.length>0&&needed.some(x=>this.can(ref,x,ctx,opts)),capabilities:needed.map(x=>this.decision(ref,x,ctx,opts))}}
    snapshot(){return{version:VERSION,principals:clone(this.principals),assignments:clone(this.assignments)}}
  }
  const create=options=>new RolesPermissions(options);
  return{VERSION,BASE:clone(BASE),SENSITIVE:[...SENSITIVE],create,RolesPermissions,principal,assignment,context,inTime,scopeMatch};
});
