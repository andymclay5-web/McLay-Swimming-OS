'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOS_ASSEMBLY_PROGRAMME=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  return Object.freeze({
    club:{id:'club-aquagym',name:'AquaGym'},
    squads:Object.freeze([
      Object.freeze({id:'squad-national',name:'National',active:true}),
      Object.freeze({id:'squad-development',name:'Development',active:true}),
      Object.freeze({id:'squad-fitness',name:'Fitness',active:true}),
      Object.freeze({id:'squad-intermediate',name:'Intermediate',active:true}),
      Object.freeze({id:'squad-junior',name:'Junior',active:true})
    ])
  });
});
