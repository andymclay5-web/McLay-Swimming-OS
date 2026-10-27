'use strict';
// Set library (19 Oct 2026). Andy, after the first pool TV night: the session-writing suggestions were "poor and
// similar" and one made no sense; "pick out the sessions ... come up with versions that are similar ... identify if
// it's my session or your session, my set or your set, or one that Jordan's written or one that Caleb's written. I think
// the author of the set should be shown"; he reviews them in "a sheet or an editable form"; suggestions should be
// varied; "hundreds" of sets.
//
// Owner of one thing: the team's set library -- which sets exist, who wrote each one, and the head coach's verdict on it.
//   * Andy's sets: his methodology components and his reference library (session-methodology.js LIB/REFLIB, from his
//     own sessions), and the sets in sessions he writes (SM.mySets, mined from his real sessions).
//   * ChatGPT's "examples in your style" from the earlier reference library (REFLIB origin N).
//   * Claude's variations (engines/set-library-data.js): one of his sets with one thing changed, waiting for review.
//   * Sets a coach adds, and the head coach's decisions and edits -- in the team cloud (msos_set_library).
// A sense check marks sets that read wrong for a #1-stroke swimmer (e.g. 200 #1 Hands by Side) so they wait for the
// head coach instead of being suggested. The suggestions (session-methodology.js) take their options from here.
(function(g){
  const M=g.MSOS4;if(!M?.state)return;
  const SL=M.setLibrary={build:'v4-set-library-20261019'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const now=()=>new Date().toISOString();
  const store=()=>M.state.setLibrary||(M.state.setLibrary={rows:{},pulledAt:0});
  const SM=()=>M.sessionMethodology;
  const role=()=>M.access?.role?.()||'owner';
  function me(){if(role()==='owner')return'Andy';const e=String(M.store?.auth?.()?.user?.email||'').split('@')[0].replace(/[^a-z]/gi,'');return e?e[0].toUpperCase()+e.slice(1).toLowerCase():'Coach';}
  // ---------- sense check: things that don't make sense for the swimmer they're written for ----------
  // Hands-by-side or bands-only for a whole 100+ of #1 stroke (fly/breast swimmers can't), kick MAX longer than 25,
  // and "MAX" over a long continuous swim with no target. A flagged set waits for the head coach.
  function senseCheck(t){const issues=[];const lines=String(t||'').split('\n');
    for(const l of lines){const L=l.toLowerCase();const reps=l.match(/^\s*(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\b/i);const dist=reps?Number(reps[2]):0;
      if(/hands\s*by\s*side|\bhbs\b/i.test(l)&&dist>=100&&/#\s*1|stroke/i.test(l)&&!/\/\s*\d+\s*(swim|drill|scull)/i.test(l))issues.push(`${dist} hands-by-side on #1 stroke — fly and breast swimmers can't hold that`);
      else if(/bands?\s*only/i.test(l)&&dist>100)issues.push(`${dist} bands only in one go is too long`);
      if(/\bkick\b/i.test(l)&&/\bmax\b/i.test(l)&&dist>25&&!/\b(15|20|25)\s*m\b/i.test(l)&&!/\/\s*\d/.test(l))issues.push(`kick MAX over ${dist}`);}
    return issues;}
  SL.senseCheck=senseCheck;
  // ---------- who wrote it ----------
  function builtinAuthor(x){if(x.mine)return x.author||'Andy';if(x.ref)return x.origin==='N'?'ChatGPT':'Andy';return'Andy';}
  SL.AUTHOR_NOTE={Andy:'your set',ChatGPT:'example in your style (ChatGPT)',Claude:'Claude variation',Jordan:"Jordan's set",Kaleb:"Kaleb's set"};
  // ---------- the whole library ----------
  let cache={key:'',list:[]};
  SL.all=()=>{try{if(M.cloud?.ready?.())SL.freshen();}catch{}const lib=SM()?.LIB||[],vars=M.setLibraryData?.variations||[],rows=store().rows||{};let mine=[];try{mine=SM()?.mySets?.()||[];}catch{}
    const key=`${lib.length}|${vars.length}|${mine.length}|${M.state.settings?.storageRevision||0}|${Object.keys(rows).length}|${store().rev||0}`;if(cache.key===key)return cache.list;
    const out=[],byId=new Map();
    const put=(x,extra)=>{const r=rows[x.id];const merged={...x,...extra};if(r){if(r.text)merged.text=r.text;if(r.label)merged.label=r.label;if(r.use_note)merged.use=r.use_note;merged.status=r.status||merged.status;merged.reviewedBy=r.reviewed_by_name||'';}
      merged.issues=senseCheck(merged.text);if(merged.issues.length&&merged.status==='approved'&&!(r&&r.status==='approved'))merged.status='check';out.push(merged);byId.set(merged.id,merged);};
    for(const x of lib)put(x,{author:builtinAuthor(x),origin:x.ref?(x.origin==='N'?'example':'library'):'methodology',status:'approved'});
    for(const v of vars)put({...v,ref:true,code:v.id.toUpperCase()},{author:'Claude',origin:'variation',status:'proposed'});
    for(const x of mine)put(x,{author:x.author||'Andy',origin:'session',status:'approved'});
    // sets coaches added (not built in)
    for(const r of Object.values(rows)){if(byId.has(r.id)||!r.text||!r.section)continue;put({id:r.id,section:r.section,label:r.label||text(r.text).split('/')[0],text:r.text,use:r.use_note||'',focus:r.focus||null,for:r.focus||['all'],fits:r.fits||[],ref:true,phases:['any']},{author:r.author||'Coach',origin:'coach',status:r.status||'proposed'});}
    cache={key,list:out};return out;};
  SL.byId=id=>SL.all().find(x=>x.id===id)||null;
  SL.usable=()=>SL.all().filter(x=>x.status==='approved');
  SL.waiting=()=>SL.all().filter(x=>x.status==='proposed'||x.status==='check');
  SL.counts=()=>{const c={approved:0,proposed:0,check:0,rejected:0,total:0};for(const x of SL.all()){c[x.status]=(c[x.status]||0)+1;c.total++;}return c;};
  // ---------- decisions and new sets: this phone first, then the team ----------
  function save(row){const s=store();s.rows=s.rows||{};s.rows[row.id]={...(s.rows[row.id]||{}),...row};s.rev=(s.rev||0)+1;M.store?.save?.(M.state);
    try{const org=M.cloud?.org?.();if(org)M.cloud.queue('msos_set_library',{organisation_id:org,...s.rows[row.id]});}catch{}cache.key='';return s.rows[row.id];}
  SL.review=(id,status,edit={})=>{if(role()!=='owner')throw new Error('Only the head coach approves sets');if(!['approved','rejected','proposed'].includes(status))throw new Error('Unknown decision');
    const x=SL.byId(id);if(!x)throw new Error('Set not found');const row={id,section:x.section,author:x.author,status,reviewed_by_name:me(),updated_at:now()};
    if(edit.text&&text(edit.text)!==text(x.text))row.text=String(edit.text).trim();if(edit.label&&text(edit.label)!==text(x.label))row.label=text(edit.label);return save(row);};
  SL.add=({section,text:t,label,use,focus})=>{const body=String(t||'').trim();if(!body)throw new Error('Write the set first');if(!['WARM UP','PRE SET','MAIN SET','POST SET','WARM DOWN'].includes(section))throw new Error('Choose where it goes');
    const id=`coach-${(M.util?.uid?M.util.uid('set'):Date.now().toString(36))}`;return save({id,section,text:body,label:text(label)||text(body.split('\n')[0]),use_note:text(use)||null,focus:Array.isArray(focus)?focus:null,author:me(),status:role()==='owner'?'approved':'proposed',updated_at:now()});};
  SL.pull=async()=>{const c=M.cloud;if(!c?.ready?.()||!c.org?.())return 0;let rows=[];try{rows=await c.fetch(`/rest/v1/msos_set_library?select=*&organisation_id=eq.${encodeURIComponent(c.org())}`)||[];}catch{return 0;}
    const pending=new Set((M.state.pending||[]).filter(p=>p.table==='msos_set_library').map(p=>p.record?.id));const s=store();s.rows=s.rows||{};let n=0;
    for(const r of Array.isArray(rows)?rows:[]){if(pending.has(r.id))continue;const cur=s.rows[r.id];if(cur&&Date.parse(cur.updated_at||0)>=Date.parse(r.updated_at||0))continue;s.rows[r.id]=r;n++;}
    s.pulledAt=Date.now();if(n){s.rev=(s.rev||0)+1;cache.key='';M.store?.save?.(M.state);}return n;};
  // ---------- variety: 5-6 different options, not five versions of the same thing ----------
  // The ranked list from the suggestions is thinned so no two options share a starting line or a base set, at most two
  // come from one author, at most one is waiting for review, and the order turns over day to day.
  function dayHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  /* 27 Oct 2026 (Andy: "no need to have a different session that's three instead of four ... we want complete variations
     and different sessions"): two sets that differ only in their numbers (3 rounds vs 4, 6 x 100 vs 12 x 50, 10s vs 20s
     rest) are the same set -- only one of them is offered. */
  const shape=t=>text(t).toLowerCase().replace(/\b\d+\s*rounds?\b/g,'# rounds').replace(/\b\d+\s*x\s*(?=\d)/g,'# x ').replace(/#\s*\d+(?:\s*[-–—]\s*\d+)?/g,'#n').replace(/\b\d+\s*s(?:ec(?:onds?)?)?\s*r(?:est)?\b/g,'#sr').replace(/@\s*\d+[:.]\d+/g,'@#').replace(/\bdesc(?:end)?\s+(?:stroke\s+count\s+|sc\s+)?\d+\s*[-–—]\s*\d+/g,'desc #').replace(/\s+/g,' ').trim();
  SL.shape=shape;
  SL.varied=(ranked,{limit=6,date='',score=null,taken=[]}={})=>{const out=[],firsts=new Set(),bases=new Set(),shapes=new Set(),authors={};let waiting=0;for(const x of taken){firsts.add(text(x.text.split('\n')[0]).toLowerCase());bases.add(x.base||x.id);shapes.add(shape(x.text));authors[x.author||'Andy']=(authors[x.author||'Andy']||0)+1;}
    const list=ranked.map((x,i)=>({x,i,s:(score?score(x):0)-i*0.01+((dayHash(`${date}|${x.id}`)%1000)/1000)*1.6})).sort((a,b)=>b.s-a.s).map(o=>o.x);
    for(const x of list){if(out.length>=limit)break;const first=text(x.text.split('\n')[0]).toLowerCase(),base=x.base||x.id;if(firsts.has(first)||bases.has(base)||shapes.has(shape(x.text)))continue;
      const a=x.author||'Andy';if((authors[a]||0)>=(a==='Andy'?4:2))continue;const w=x.status!=='approved';if(w&&waiting>=1)continue;
      out.push(x);firsts.add(first);bases.add(base);shapes.add(shape(x.text));authors[a]=(authors[a]||0)+1;if(w)waiting++;}
    return out;};
  // the team's decisions are fetched when the library is used (at most every 5 minutes), never in the background
  SL.freshen=()=>{const s=store();if(Date.now()-(s.pulledAt||0)<300000||SL._pulling)return;SL._pulling=true;SL.pull().catch(()=>0).finally(()=>{SL._pulling=false;});};
})(globalThis);
