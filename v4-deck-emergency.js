'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M) throw new Error('MSOS4 missing');
  const U=M.util,S=M.session,R=M.deckRecovery=M.deckRecovery||{};
  R.EMERGENCY='v4-deck-emergency-20260817c';
  M.BUILD=R.EMERGENCY;
  M.CORE='20260817-v4-deck-emergency-c';

  const DRAFT_KEY='mclay_swimming_os_v4_deck_intake_draft';
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const safeJson=(s,fallback=null)=>{try{return JSON.parse(s)}catch{return fallback}};

  // Read the shorthand Andy actually types on deck. Keep this intentionally narrow.
  R.normaliseDeckText=source=>{
    let x=String(source??'').replace(/\r/g,'');
    x=x.replace(/^\s*(warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down)\s+(\d{1,2})\s*rounds?\s*:?[ \t]*$/gim,(_,h,n)=>`${h}\n${n} Rounds:`);
    // Android keyboard/autocorrect seen live: "5x10p I'm" when 5x100 IM was intended.
    x=x.replace(/\b(\d{1,2})\s*x\s*10p\s+i[’']?m\b/gi,'$1 x 100 IM');
    // Coach shorthand: on 60 / on 90 / on 1.45. Base parser expects m:ss.
    x=x.replace(/\bon\s+(\d{2,3})\s*$/gim,(_,sec)=>{const n=Number(sec);if(!Number.isFinite(n)||n<20||n>599)return _;return `@ ${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`});
    x=x.replace(/\bon\s+(\d{1,2})[.]([0-5]\d)\s*$/gim,'@ $1:$2');
    return x;
  };

  if(M.parser?.parse&&!M.parser._deckEmergencyParse){
    const baseParse=M.parser.parse.bind(M.parser);
    M.parser.parse=(source,identity={})=>baseParse(R.normaliseDeckText(source),identity);
    M.parser._deckEmergencyParse=true;
    R._baseParse=baseParse;
  }

  async function refreshAuth(){
    const c=M.store?.config?.()||{},old=M.store?.auth?.()||safeJson(localStorage.getItem(M.AUTH_KEY||'mclay_swimming_v1_auth'),'{}')||{};
    if(!c.supabaseUrl||!c.supabaseAnonKey)throw new Error('Supabase connection is not configured');
    if(!old.refresh_token)throw new Error('Transcription sign-in expired — sign in once in Connection');
    const r=await fetch(`${String(c.supabaseUrl).replace(/\/$/,'')}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',headers:{apikey:c.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:old.refresh_token})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.access_token)throw new Error(data.error_description||data.msg||data.error||`Auth refresh failed (${r.status})`);
    const next={...old,...data};
    localStorage.setItem(M.AUTH_KEY||'mclay_swimming_v1_auth',JSON.stringify(next));
    return next;
  }
  R.refreshTranscriptionAuth=refreshAuth;

  if(M.intake?.transcribe&&!M.intake._deckEmergencyAuth){
    const baseTranscribe=M.intake.transcribe.bind(M.intake);
    M.intake.transcribe=async(blob,sourceType='voice')=>{
      try{return await baseTranscribe(blob,sourceType)}
      catch(e){
        if(!/\b401\b|jwt|unauthori[sz]ed|access.?token/i.test(String(e?.message||e)))throw e;
        await refreshAuth();
        return await baseTranscribe(blob,sourceType);
      }
    };
    M.intake._deckEmergencyAuth=true;
  }

  const loadDraft=()=>safeJson(localStorage.getItem(DRAFT_KEY),null);
  const clearDraft=()=>localStorage.removeItem(DRAFT_KEY);
  const saveDraft=(raw,slot)=>{
    const text=String(raw?.value??'');
    const data={date:nzToday(),slotId:String(slot?.value||''),text,updatedAt:new Date().toISOString()};
    localStorage.setItem(DRAFT_KEY,JSON.stringify(data));
    return data;
  };
  R.loadIntakeDraft=loadDraft;R.clearIntakeDraft=clearDraft;

  if(M.actions?.openNewSession&&!M.actions._deckEmergencyDraft){
    const baseOpen=M.actions.openNewSession.bind(M.actions);
    M.actions.openNewSession=async()=>{
      await baseOpen();
      const host=document.querySelector('#modalHost'),raw=host?.querySelector('#hfRaw'),slot=host?.querySelector('#hfSlot'),status=host?.querySelector('#hfStatus'),create=host?.querySelector('#hfCreate'),close=host?.querySelector('[data-close]');
      if(!raw)return;
      const persist=()=>saveDraft(raw,slot);
      const draft=loadDraft();
      if(draft?.date===nzToday()&&draft.text){
        if(slot&&draft.slotId&&[...slot.options].some(o=>o.value===draft.slotId))slot.value=draft.slotId;
        raw.value=draft.text;
        raw.dispatchEvent(new Event('input',{bubbles:true}));
        if(status)status.textContent=`Draft restored locally · ${new Date(draft.updatedAt||Date.now()).toLocaleTimeString('en-NZ',{hour:'2-digit',minute:'2-digit'})}`;
      }
      raw.addEventListener('input',persist);
      raw.addEventListener('change',persist);
      raw.addEventListener('paste',()=>setTimeout(()=>{raw.dispatchEvent(new Event('input',{bubbles:true}));persist()},0));
      slot?.addEventListener('change',persist);
      close?.addEventListener('click',persist,{capture:true});
      const timer=setInterval(()=>{
        if(!document.body.contains(raw)){clearInterval(timer);return}
        persist(); // catches programmatic voice/photo transcript insertion too
      },400);
      create?.addEventListener('click',()=>setTimeout(()=>{
        if(!host.querySelector('#hfRaw'))clearDraft();
      },50));
    };
    M.actions._deckEmergencyDraft=true;
  }

  R.emergencySelfTest=()=>{
    const src=`Warm up
200 fr
200 IM
4x50 hbs
10sr

Pre set
5x50#1 build on 60
5x10p I'm desc 1-5 on 1.45

Main set 3 rounds
5x100 free threshold 10 sr
400 easy

Post set
8x75`;
    const parsed=(R._baseParse||M.parser.parse)(R.normaliseDeckText(src),{id:'emergency-live-screen',date:'2026-08-17',dayPart:'PM',squads:['National','Development'],venue:'AquaGym',course:'SCM'});
    const total=S.total(parsed);
    return{ok:total===4650,total,normalised:R.normaliseDeckText(src)};
  };
  const test=R.emergencySelfTest();
  if(!test.ok)console.error('[MSOS deck emergency] LIVE SCREEN REGRESSION FAILED',test);
  else console.info('[MSOS deck emergency] PASS · exact live screen = 4650m',test);
})(globalThis);
