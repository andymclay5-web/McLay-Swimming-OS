'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Delivery=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-aw';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const PUBLIC_DESTINATIONS=new Set(['tv','public_board']);
  function preferences(athlete={}){const p=athlete.delivery_preferences||athlete.deliveryPreferences||{};return{audioFirst:!!p.audio_first||!!p.audioFirst,textEnabled:p.text_enabled!==false&&p.textEnabled!==false,largeText:!!p.large_text||!!p.largeText,simplifiedView:!!p.simplified_view||!!p.simplifiedView,haptic:!!p.haptic_enabled||!!p.haptic};}
  function authorizeDestination(action,{explicitPublic=false,role='coach'}={}){
    const dest=action?.destination||'private_earbud';
    if(PUBLIC_DESTINATIONS.has(dest)&&!explicitPublic)return{ok:false,destination:'private_phone',reason:'public output requires explicit TV/Board intent'};
    if(PUBLIC_DESTINATIONS.has(dest)&&!['coach','owner','assistant'].includes(role))return{ok:false,destination:'private_phone',reason:'role cannot publish to public board'};
    return{ok:true,destination:dest,reason:''};
  }
  function message(input={}){return{id:input.id||`msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,createdAt:Number(input.createdAt)||Date.now(),authorId:input.authorId||'coach',athleteIds:[...new Set(input.athleteIds||[])],groupIds:[...new Set(input.groupIds||[])],text:String(input.text||''),audioEvidenceId:input.audioEvidenceId||null,audience:clone(input.audience||{}),deliveryPreferenceSnapshot:clone(input.deliveryPreferenceSnapshot||{}),expiresAt:input.expiresAt||null,deliveredAt:null,acknowledgedAt:null};}
  function projectMessage(msg,athlete){const p=preferences(athlete);return{messageId:msg.id,athleteId:athlete?.id||null,primary:p.audioFirst&&msg.audioEvidenceId?'audio':'text',text:p.textEnabled?msg.text:'',audioEvidenceId:msg.audioEvidenceId||null,largeText:p.largeText,simplifiedView:p.simplifiedView,haptic:p.haptic};}
  return{VERSION,PUBLIC_DESTINATIONS,preferences,authorizeDestination,message,projectMessage};
});
