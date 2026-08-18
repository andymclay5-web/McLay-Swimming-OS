'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.EntityRegistry=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1';
  const SCHEMA='msos.entities.v1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const key=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const lower=v=>text(v).toLowerCase();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  const TRUST={unknown:0,fallback:1,legacy:2,verified:3,current:3,official:4};
  const trustRank=v=>TRUST[lower(v)]??0;
  const sourceRows=(source,...names)=>{for(const n of names){const rows=source?.data?.[n]??source?.[n];if(Array.isArray(rows))return rows}return[]};
  const active=row=>row?.active!==false&&!['inactive','archived','superseded','removed'].includes(lower(row?.status||row?.version_status));
  const inRange=(d,start,end)=>!d||((!start||d>=start)&&(!end||d<=end));
  const ageAt=(dob,asOf)=>{const d=date(dob),a=date(asOf);if(!d||!a)return null;const birth=new Date(`${d}T00:00:00Z`),at=new Date(`${a}T00:00:00Z`);let years=at.getUTCFullYear()-birth.getUTCFullYear();if(at.getUTCMonth()<birth.getUTCMonth()||(at.getUTCMonth()===birth.getUTCMonth()&&at.getUTCDate()<birth.getUTCDate()))years--;return years};
  const sourceMeta=(s,i)=>({id:text(s?.id)||`source-${i+1}`,priority:Number(s?.priority)||0,trust:text(s?.trust)||'unknown'});
  function stronger(a,b){if(!a)return b;if(!b)return a;const ap=Number(a?._entity?.priority)||0,bp=Number(b?._entity?.priority)||0;if(ap!==bp)return bp>ap?b:a;const at=trustRank(a?._entity?.trust),bt=trustRank(b?._entity?.trust);return bt>at?b:a}
  function mergeWinner(winner,other){if(!winner)return clone(other);const out=clone(winner);if(other)for(const [k,v] of Object.entries(other))if((out[k]===undefined||out[k]===null||out[k]==='')&&v!==undefined)out[k]=clone(v);const sources=new Set([...(winner?._entity?.sources||[]),...(other?._entity?.sources||[])]);out._entity={...(out._entity||{}),sources:[...sources]};return out}
  function withMeta(row,source,canonicalId){const m=sourceMeta(source,0);return{...clone(row),id:canonicalId||text(row?.id),_entity:{source:m.id,sources:[m.id],priority:m.priority,trust:m.trust}}}
  function buildAliasIndex(aliases=[]){const nameToCanonical=new Map(),idToCanonical=new Map();for(const row of aliases||[]){const canonicalName=text(row?.canonicalName||row?.canonical_name||row?.name),nk=key(canonicalName);if(nk){nameToCanonical.set(nk,nk);for(const a of row?.aliases||[])if(key(a))nameToCanonical.set(key(a),nk)}const cid=text(row?.canonicalId||row?.canonical_id);if(cid){idToCanonical.set(cid,cid);for(const a of row?.ids||row?.sourceIds||row?.source_ids||[])if(text(a))idToCanonical.set(text(a),cid)}}return{nameToCanonical,idToCanonical}}
  function simpleIndex(rows=[],prefix){const byId=new Map(),byName=new Map();for(const raw of rows||[]){const id=text(raw?.id)||`${prefix}-${key(raw?.name||raw?.full_name)}`;if(!id)continue;const row={...clone(raw),id};byId.set(id,row);const nk=key(raw?.name||raw?.full_name);if(nk&&!byName.has(nk))byName.set(nk,id)}return{rows:[...byId.values()],byId,byName}}

  class EntityRegistry{
    constructor({sources=[],aliases=[],clubs=[],coaches=[],squads=[],memberships=[]}={}){
      this.sources=(sources||[]).map((s,i)=>({...clone(s),...sourceMeta(s,i)})).sort((a,b)=>b.priority-a.priority||trustRank(b.trust)-trustRank(a.trust));
      this.aliases=clone(aliases||[]);this.explicit={clubs:clone(clubs||[]),coaches:clone(coaches||[]),squads:clone(squads||[]),memberships:clone(memberships||[])};this._build();
    }
    _build(){
      const aliases=buildAliasIndex(this.aliases),groups=new Map(),nameGroup=new Map(),idGroup=new Map(),sourceIdGroup=new Map();
      const canonicalName=k=>aliases.nameToCanonical.get(k)||k;
      for(const s of this.sources){for(const raw of sourceRows(s,'athletes','swimmers')){if(!raw)continue;const rid=text(raw.id),nk=canonicalName(key(raw.full_name||raw.name)),explicitId=aliases.idToCanonical.get(rid);let gid=explicitId||(rid&&idGroup.get(rid))||(nk&&nameGroup.get(nk));if(!gid)gid=rid||`athlete-${nk}`;const row=withMeta(raw,s,gid),existing=groups.get(gid),winner=stronger(existing,row),merged=mergeWinner(winner,winner===row?existing:row);merged.id=gid;groups.set(gid,merged);if(rid){idGroup.set(rid,gid);sourceIdGroup.set(`${s.id}|${rid}`,gid)}if(nk)nameGroup.set(nk,gid);for(const a of raw.aliases||[]){const ak=canonicalName(key(a));if(ak)nameGroup.set(ak,gid)}}}
      for(const a of this.aliases){const cid=text(a.canonicalId||a.canonical_id),nk=canonicalName(key(a.canonicalName||a.canonical_name));let gid=cid||nameGroup.get(nk);if(!gid)continue;if(cid&&groups.has(gid)){for(const id of a.ids||a.sourceIds||a.source_ids||[]){idGroup.set(text(id),gid)}}for(const name of a.aliases||[]){if(key(name))nameGroup.set(canonicalName(key(name)),gid)}}
      this.athletes=[...groups.values()].sort((a,b)=>text(a.full_name||a.name).localeCompare(text(b.full_name||b.name)));this._athleteById=new Map(this.athletes.map(x=>[x.id,x]));this._athleteIdGroup=idGroup;this._athleteNameGroup=nameGroup;this._sourceAthleteId=sourceIdGroup;this._canonicalName=canonicalName;
      const clubRows=[...this.explicit.clubs],coachRows=[...this.explicit.coaches],squadRows=[...this.explicit.squads];
      for(const s of this.sources){clubRows.push(...sourceRows(s,'clubs'));coachRows.push(...sourceRows(s,'coaches'));squadRows.push(...sourceRows(s,'squads'))}
      for(const ath of this.athletes){if(text(ath.squad)&&!squadRows.some(x=>key(x.name)===key(ath.squad)))squadRows.push({id:`squad-${key(ath.squad)}`,name:text(ath.squad),active:true,synthetic:true})}
      this._clubs=simpleIndex(clubRows,'club');this._coaches=simpleIndex(coachRows,'coach');this._squads=simpleIndex(squadRows,'squad');
      const memberships=[...this.explicit.memberships];for(const s of this.sources)memberships.push(...sourceRows(s,'squad_memberships','squadMemberships'));
      for(const s of this.sources){for(const raw of sourceRows(s,'athletes','swimmers'))if(raw&&text(raw.squad)){const aid=this.sourceAthleteId(s.id,raw.id)||this.athleteId(raw.full_name||raw.name),sq=this.resolveSquad(raw.squad);if(aid&&sq)memberships.push({id:`membership-${aid}-${sq.id}-${date(raw.squad_start||raw.start_date)||'current'}`,athlete_id:aid,squad_id:sq.id,start_date:date(raw.squad_start||raw.start_date),end_date:date(raw.squad_end||raw.end_date),active:true,source:s.id})}}
      const seen=new Map();for(const raw of memberships){const athleteId=this.athleteId(raw.athlete_id||raw.athleteId||raw.athlete||raw.swimmer),sq=this.resolveSquad(raw.squad_id||raw.squadId||raw.squad);if(!athleteId||!sq)continue;const row={...clone(raw),id:text(raw.id)||`membership-${athleteId}-${sq.id}-${date(raw.start_date||raw.start)||'open'}`,athlete_id:athleteId,squad_id:sq.id,start_date:date(raw.start_date||raw.start),end_date:date(raw.end_date||raw.end)};const k=`${athleteId}|${sq.id}|${row.start_date}|${row.end_date}`;if(!seen.has(k)||active(row))seen.set(k,row)}this.memberships=[...seen.values()];
    }
    resolveAthlete(ref){if(ref&&typeof ref==='object'&&ref.id)return this.resolveAthlete(ref.id);const raw=text(ref);if(!raw)return null;if(this._athleteById.has(raw))return clone(this._athleteById.get(raw));const gid=this._athleteIdGroup.get(raw)||this._athleteNameGroup.get(this._canonicalName(key(raw)));return gid?clone(this._athleteById.get(gid)||null):null}
    athleteId(ref){return this.resolveAthlete(ref)?.id||null}
    sourceAthleteId(sourceId,sourceAthleteRef){const sid=text(sourceId),rid=text(sourceAthleteRef);return this._sourceAthleteId.get(`${sid}|${rid}`)||this._athleteIdGroup.get(rid)||null}
    listAthletes({includeInactive=true}={}){return clone(this.athletes.filter(x=>includeInactive||active(x)))}
    resolveClub(ref){return this._resolveSimple(this._clubs,ref)}
    resolveCoach(ref){return this._resolveSimple(this._coaches,ref)}
    resolveSquad(ref){return this._resolveSimple(this._squads,ref)}
    _resolveSimple(index,ref){if(ref&&typeof ref==='object'&&ref.id)return this._resolveSimple(index,ref.id);const raw=text(ref);if(!raw)return null;const id=index.byId.has(raw)?raw:index.byName.get(key(raw));return id?clone(index.byId.get(id)||null):null}
    listClubs(){return clone(this._clubs.rows)}listCoaches(){return clone(this._coaches.rows)}listSquads(){return clone(this._squads.rows)}
    membershipsForAthlete(athleteRef,{asOfDate='',activeOnly=false}={}){const aid=this.athleteId(athleteRef),d=date(asOfDate);if(!aid)return[];return clone(this.memberships.filter(x=>x.athlete_id===aid).filter(x=>!activeOnly||active(x)).filter(x=>!d||inRange(d,x.start_date,x.end_date))) }
    athleteSquads(athleteRef,{asOfDate=''}={}){return this.membershipsForAthlete(athleteRef,{asOfDate,activeOnly:true}).map(m=>this.resolveSquad(m.squad_id)).filter(Boolean)}
    roster(squadRef,{asOfDate='',includeInactive=false}={}){const sq=this.resolveSquad(squadRef);if(!sq)return[];const d=date(asOfDate),ids=new Set(this.memberships.filter(active).filter(m=>m.squad_id===sq.id).filter(m=>!d||inRange(d,m.start_date,m.end_date)).map(m=>m.athlete_id));return this.listAthletes({includeInactive:true}).filter(a=>ids.has(a.id)).filter(a=>includeInactive||active(a))}
    dimensions(athleteRef,{asOfDate=''}={}){const ath=this.resolveAthlete(athleteRef);if(!ath)return null;return{athleteId:ath.id,clubId:text(ath.club_id||ath.clubId)||null,squadIds:this.athleteSquads(ath.id,{asOfDate}).map(x=>x.id),sex:text(ath.sex||ath.gender)||null,dateOfBirth:date(ath.date_of_birth||ath.dob)||null,age:ageAt(ath.date_of_birth||ath.dob,asOfDate),classification:{s:text(ath.current_s_class)||null,sb:text(ath.current_sb_class)||null,sm:text(ath.current_sm_class)||null},active:active(ath)}}
    snapshot(){return{schema:SCHEMA,version:VERSION,athletes:this.listAthletes(),clubs:this.listClubs(),coaches:this.listCoaches(),squads:this.listSquads(),memberships:clone(this.memberships)}}
  }
  const create=options=>new EntityRegistry(options);
  return{VERSION,SCHEMA,create,EntityRegistry,key,text,date,active,inRange,ageAt,trustRank,buildAliasIndex};
});
