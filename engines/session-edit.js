'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.SessionEdit=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const nowDefault=()=>new Date().toISOString();
  function nodeDistance(n){if(!n)return 0;if(n.kind==='set')return(Math.max(1,num(n.reps)||1))*(num(n.distance)||0);if(n.kind==='group')return Math.max(1,num(n.rounds)||1)*(n.items||[]).reduce((s,x)=>s+nodeDistance(x),0);return 0}
  const totalDistance=s=>(s?.blocks||[]).reduce((n,b)=>n+(b.items||[]).reduce((q,x)=>q+nodeDistance(x),0),0);
  function locate(session,id){
    for(let bi=0;bi<(session?.blocks||[]).length;bi++){const block=session.blocks[bi];if(block.id===id)return{kind:'block',node:block,block,blockIndex:bi,parent:null,index:bi};const stack=(block.items||[]).map((n,i)=>({node:n,parent:block.items,index:i,block,blockIndex:bi}));while(stack.length){const cur=stack.shift();if(cur.node?.id===id)return{kind:cur.node.kind||'item',...cur};if(cur.node?.kind==='group')for(let i=0;i<(cur.node.items||[]).length;i++)stack.unshift({node:cur.node.items[i],parent:cur.node.items,index:i,block,blockIndex:bi})}}
    return null;
  }
  function recalc(session){session.metadata=session.metadata||{};session.metadata.parsedTotal=totalDistance(session);if(session.metadata.writtenTotal!=null)session.metadata.totalMatches=Math.abs(Number(session.metadata.writtenTotal)-session.metadata.parsedTotal)<=1;return session}
  function patchSet(set,patch={}){
    const allowed=['reps','distance','stroke','zone','restSeconds','cycleSeconds','cycleOptions','equipment','composition','pattern','patternRounds','phases','repPattern','repInstructions','cues','raceIntent','targetSeconds','raw'];const out=clone(set);
    if(Object.prototype.hasOwnProperty.call(patch,'id')&&patch.id!==set.id)throw new Error('Existing canonical node id cannot change');
    for(const k of allowed)if(Object.prototype.hasOwnProperty.call(patch,k))out[k]=clone(patch[k]);
    if(num(out.reps)===null||Number(out.reps)<1)throw new Error('Set reps must be at least 1');if(num(out.distance)===null||Number(out.distance)<0)throw new Error('Set distance must be non-negative');out.reps=Math.max(1,Number(out.reps));out.distance=Number(out.distance);return out;
  }
  function patchGroup(group,patch={}){const out=clone(group);if(Object.prototype.hasOwnProperty.call(patch,'id')&&patch.id!==group.id)throw new Error('Existing canonical node id cannot change');if(Object.prototype.hasOwnProperty.call(patch,'rounds')){const r=num(patch.rounds);if(r===null||r<1)throw new Error('Group rounds must be at least 1');out.rounds=Math.max(1,Number(r))}if(Object.prototype.hasOwnProperty.call(patch,'label'))out.label=text(patch.label);return out}
  function validateNewNode(node){if(!node||!text(node.id))throw new Error('Added canonical node requires id');if(!['set','group','cue'].includes(node.kind))throw new Error('Added canonical node kind must be set, group or cue');if(node.kind==='set'){if((num(node.reps)||0)<1)throw new Error('Added set requires reps');if(num(node.distance)===null||num(node.distance)<0)throw new Error('Added set requires distance')}if(node.kind==='group'){if((num(node.rounds)||0)<1||!Array.isArray(node.items))throw new Error('Added group requires rounds and items')}return clone(node)}

  class SessionEdit{
    constructor({clock=nowDefault}={}){this.clock=clock}
    update(session,nodeId,patch,{note=''}={}){
      const next=clone(session),found=locate(next,nodeId);if(!found)throw new Error(`Session node not found: ${nodeId}`);if(found.kind==='block')throw new Error('Use block-specific operation for block changes');const before=clone(found.node),after=found.kind==='set'?patchSet(found.node,patch):found.kind==='group'?patchGroup(found.node,patch):{...clone(found.node),...clone(patch),id:found.node.id};found.parent[found.index]=after;recalc(next);return{session:next,change:{type:'update',nodeId,before,after:clone(after),note:text(note),at:this.clock()}};
    }
    remove(session,nodeId,{note=''}={}){
      const next=clone(session),found=locate(next,nodeId);if(!found)throw new Error(`Session node not found: ${nodeId}`);if(found.kind==='block')throw new Error('Removing a whole block requires explicit block operation');const [removed]=found.parent.splice(found.index,1);recalc(next);return{session:next,change:{type:'remove',nodeId,before:clone(removed),after:null,note:text(note),at:this.clock()}};
    }
    addAfter(session,anchorId,newNode,{note=''}={}){
      const next=clone(session),found=locate(next,anchorId);if(!found||found.kind==='block')throw new Error(`Anchor node not found: ${anchorId}`);const node=validateNewNode(newNode);if(locate(next,node.id))throw new Error(`Canonical node id already exists: ${node.id}`);found.parent.splice(found.index+1,0,node);recalc(next);return{session:next,change:{type:'add_after',anchorId,nodeId:node.id,before:null,after:clone(node),note:text(note),at:this.clock()}};
    }
    addToBlock(session,blockId,newNode,{note=''}={}){
      const next=clone(session),found=locate(next,blockId);if(!found||found.kind!=='block')throw new Error(`Block not found: ${blockId}`);const node=validateNewNode(newNode);if(locate(next,node.id))throw new Error(`Canonical node id already exists: ${node.id}`);found.node.items=found.node.items||[];found.node.items.push(node);recalc(next);return{session:next,change:{type:'add_to_block',blockId,nodeId:node.id,before:null,after:clone(node),note:text(note),at:this.clock()}};
    }
    updateBlock(session,blockId,patch,{note=''}={}){
      const next=clone(session),found=locate(next,blockId);if(!found||found.kind!=='block')throw new Error(`Block not found: ${blockId}`);const before=clone(found.node);if(Object.prototype.hasOwnProperty.call(patch,'id')&&patch.id!==before.id)throw new Error('Existing canonical block id cannot change');for(const k of ['title','authoredTitle','type'])if(Object.prototype.hasOwnProperty.call(patch,k))found.node[k]=text(patch[k]);recalc(next);return{session:next,change:{type:'update_block',blockId,before,after:clone(found.node),note:text(note),at:this.clock()}};
    }
  }
  const create=options=>new SessionEdit(options);
  return{VERSION,create,SessionEdit,nodeDistance,totalDistance,locate,recalc,patchSet,patchGroup,validateNewNode};
});
