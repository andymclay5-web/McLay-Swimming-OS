'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.Consent=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-ax';
  const TYPES=Object.freeze({VOICE:'voice',CONVERSATION:'conversation',VIDEO:'video',PHOTO:'photo'});
  function profile(input={}){return{recordingAllowed:input.recordingAllowed!==false,audioAllowed:input.audioAllowed!==false,videoAllowed:input.videoAllowed!==false,athletePlayback:input.athletePlayback!==false,teamDisplay:!!input.teamDisplay,externalProcessing:!!input.externalProcessing,updatedAt:input.updatedAt||null,source:input.source||'club_policy'};}
  function canCapture(p,type){p=profile(p);if(!p.recordingAllowed)return{ok:false,reason:'recording_not_allowed'};if([TYPES.VOICE,TYPES.CONVERSATION].includes(type)&&!p.audioAllowed)return{ok:false,reason:'audio_not_allowed'};if(type===TYPES.VIDEO&&!p.videoAllowed)return{ok:false,reason:'video_not_allowed'};return{ok:true,reason:''};}
  function canRoute(p,destination){p=profile(p);if(destination==='tv'&&!p.teamDisplay)return{ok:false,reason:'team_display_not_allowed'};if(destination==='cloud_ai'&&!p.externalProcessing)return{ok:false,reason:'external_processing_not_allowed'};return{ok:true,reason:''};}
  return{VERSION,TYPES,profile,canCapture,canRoute};
});
