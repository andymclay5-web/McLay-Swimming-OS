'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOSArchitecture=root.MSOSArchitecture||{};root.MSOSArchitecture.VoiceState=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0-ax';
  const STATES=Object.freeze({OFF:'off',ARMED:'armed',LISTENING:'listening',TRANSCRIBING:'transcribing',ROUTING:'routing',CONFIRMING:'confirming',LONG_RECORDING:'long_recording',ERROR:'error'});
  const EVENTS=Object.freeze({ARM:'arm',DISARM:'disarm',PRESS:'press',AUDIO_ENDED:'audio_ended',TRANSCRIPT:'transcript',ROUTED:'routed',CONFIRMED:'confirmed',START_LONG:'start_long',STOP_LONG:'stop_long',FAIL:'fail',RECOVER:'recover'});
  function initial(){return{state:STATES.OFF,armedSessionId:null,longRecording:null,lastError:null,lastTranscript:null,lastAction:null,updatedAt:Date.now()};}
  function transition(s,event,payload={}){const x={...s,updatedAt:Number(payload.at)||Date.now()};switch(event){
    case EVENTS.ARM: if(x.state!==STATES.OFF&&x.state!==STATES.ERROR)return x;return{...x,state:STATES.ARMED,armedSessionId:payload.sessionId||x.armedSessionId,lastError:null};
    case EVENTS.DISARM: return{...initial(),updatedAt:x.updatedAt};
    case EVENTS.PRESS: if(x.state===STATES.ARMED)return{...x,state:STATES.LISTENING};if(x.state===STATES.LISTENING)return{...x,state:STATES.TRANSCRIBING};if(x.state===STATES.LONG_RECORDING)return transition(x,EVENTS.STOP_LONG,payload);return x;
    case EVENTS.AUDIO_ENDED: if(x.state===STATES.LISTENING)return{...x,state:STATES.TRANSCRIBING};return x;
    case EVENTS.TRANSCRIPT: if(x.state!==STATES.TRANSCRIBING&&x.state!==STATES.LISTENING)return x;return{...x,state:STATES.ROUTING,lastTranscript:String(payload.transcript||'')};
    case EVENTS.ROUTED: if(x.state!==STATES.ROUTING)return x;return{...x,state:payload.needsConfirmation?STATES.CONFIRMING:STATES.ARMED,lastAction:payload.action||null};
    case EVENTS.CONFIRMED: if(x.state!==STATES.CONFIRMING)return x;return{...x,state:STATES.ARMED,lastAction:payload.action||x.lastAction};
    case EVENTS.START_LONG: if(![STATES.ARMED,STATES.CONFIRMING].includes(x.state))return x;return{...x,state:STATES.LONG_RECORDING,longRecording:{id:payload.id||null,athleteId:payload.athleteId||null,startedAt:Number(payload.at)||Date.now(),kind:payload.kind||'conversation'}};
    case EVENTS.STOP_LONG: if(x.state!==STATES.LONG_RECORDING)return x;return{...x,state:STATES.ARMED,longRecording:null,lastAction:{type:'long_recording_saved',id:payload.id||x.longRecording?.id||null}};
    case EVENTS.FAIL: return{...x,state:STATES.ERROR,lastError:{code:payload.code||'unknown',message:String(payload.message||'Voice error'),recoverable:payload.recoverable!==false}};
    case EVENTS.RECOVER: if(x.state!==STATES.ERROR)return x;return{...x,state:x.armedSessionId?STATES.ARMED:STATES.OFF,lastError:null};
    default:return x;
  }}
  function canListen(s){return s?.state===STATES.ARMED;}
  function isRecording(s){return s?.state===STATES.LISTENING||s?.state===STATES.LONG_RECORDING;}
  return{VERSION,STATES,EVENTS,initial,transition,canListen,isRecording};
});
