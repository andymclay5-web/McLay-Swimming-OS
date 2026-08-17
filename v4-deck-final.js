'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M) throw new Error('MSOS4 missing');
  const U=M.util,S=M.session,R=M.deckRecovery=M.deckRecovery||{};
  const BUILD='v4-deck-final-20260817d';
  M.BUILD=BUILD; M.CORE='20260817-v4-deck-final-d'; R.FINAL=BUILD;
  const DRAFT_KEY='mclay_swimming_os_v4_add_session_draft_d';
  const txt=v=>U.text(v), esc=v=>U.escape(v);
  const nzToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
  const safeJson=(s,f={})=>{try{return JSON.parse(s||'')||f}catch{return f}};

  function headingRound(line){
    const m=String(line||'').trim().match(/^(warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down)\s*(?:[-—–:·]\s*)?(\d{1,2})\s*rounds?\s*:?(.*)$/i);
    if(!m) return null;
    return {heading:m[1],rounds:Number(m[2]),tail:String(m[3]||'').trim()};
  }
  function normaliseCycle(line){
    return String(line||'')
      .replace(/\bon\s+(\d{2,3})\s*$/i,(_,n)=>{n=Number(n);return n>=20&&n<=599?`@ ${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`:_})
      .replace(/\bon\s+(\d{1,2})[.:]([0-5]\d)\s*$/i,'@ $1:$2');
  }
  function normaliseText(source){
    const inLines=String(source??'').replace(/\r/g,'').split('\n');
    const stage=[];
    for(let line of inLines){
      line=line.replace(/\b(\d{1,2})\s*x\s*10p\s+i[’']?m\b/gi,'$1 x 100 IM');
      const hr=headingRound(line);
      if(hr){
        stage.push(hr.heading);
        stage.push(`${hr.rounds} Rounds:`);
        if(hr.tail) stage.push(hr.tail);
        continue;
      }
      stage.push(normaliseCycle(line));
    }
    const out=[];
    for(let i=0;i<stage.length;i++){
      const line=stage[i], p=String(line).trim().match(/^(\d{1,3})\s*[x×]\s*(\d{2,4})\b/i);
      out.push(line);
      if(!p) continue;
      const parentDistance=Number(p[2]), parts=[]; let sum=0,j=i+1;
      while(j<stage.length && parts.length<8){
        const s=String(stage[j]).trim();
        if(!s) break;
        if(headingRound(s)||/^(?:warm\s*up|pre\s*set|main\s*set|post\s*set|warm\s*down|cool\s*down|\d{1,2}\s+rounds?\b)/i.test(s)) break;
        const m=s.match(/^(\d+(?:\.5)?)\s+(.+)$/);
        if(!m) break;
        const d=Number(m[1]);
        if(!(d>0 && d<parentDistance)) break;
        parts.push({d,text:s});sum+=d;j++;
        if(sum>=parentDistance) break;
      }
      if(parts.length>=2 && Math.abs(sum-parentDistance)<0.001){
        out.push(`Makeup: ${parts.map(x=>x.text).join(' / ')}`);
        i=j-1;
      }
    }
    for(let i=out.length-1;i>=0;i--){
      if(!String(out[i]).trim()) continue;
      const m=String(out[i]).trim().match(/^([\d,]{3,6})\s*m$/i);
      if(m) out[i]=`TOTAL ${m[1]}m`;
      break;
    }
    return out.join('\n');
  }
  R.finalNormalise=normaliseText;

  async function refreshAuth(){
    const c=M.store.config(), old=M.store.auth()||safeJson(localStorage.getItem(M.AUTH_KEY),{});
    if(!c?.supabaseUrl||!c?.supabaseAnonKey) throw new Error('Supabase connection is not configured');
    if(!old?.refresh_token) throw new Error('Transcription sign-in expired — open Connection and sign in once');
    const r=await fetch(`${c.supabaseUrl.replace(/\/$/,'')}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:c.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:old.refresh_token})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.access_token) throw new Error(data.error_description||data.msg||data.error||`Auth refresh failed (${r.status})`);
    localStorage.setItem(M.AUTH_KEY,JSON.stringify({...old,...data}));
  }
  async function transcribe(blob,type){
    try{return await M.intake.transcribe(blob,type)}
    catch(e){
      if(!/\b401\b|jwt|unauthori[sz]ed|access.?token/i.test(String(e?.message||e))) throw e;
      await refreshAuth();
      return await M.intake.transcribe(blob,type);
    }
  }

  function modalHtml(){return `<div class="modal-backdrop"><section class="modal wide"><header><h2>Add session</h2><button data-final-close>×</button></header><div class="modal-body">
    <label>Published session<select id="finalSlot"></select></label><div id="finalTruth" class="check-card"></div>
    <div class="intake-tabs"><button data-final-tab="text" class="active">Paste / Type</button><button data-final-tab="voice">Voice</button><button data-final-tab="photo">Photo</button></div>
    <div id="finalText"><label>Session<textarea id="finalRaw" class="session-editor"></textarea></label></div>
    <div id="finalVoice" hidden><button id="finalStart">Start full session dictation</button><button id="finalStop" disabled>Stop & transcribe</button><audio id="finalAudio" controls hidden></audio></div>
    <div id="finalPhoto" hidden><label class="buttonlike">Take / choose session photo<input id="finalFile" type="file" accept="image/*" capture="environment" hidden></label></div>
    <div id="finalStatus" class="muted">Type, paste, dictate or photograph the session. Draft saves locally.</div><div id="finalPreview" class="check-card"></div>
    </div><footer><button id="finalCreate" disabled>Create & use now</button></footer></section></div>`}

  const slotId=(slot,id)=>U.stableId('session',id.date,id.dayPart,id.start,id.end,(id.squads||[]).join('+'),id.venue);
  const loadDraft=()=>safeJson(localStorage.getItem(DRAFT_KEY),null);
  const saveDraft=(raw,slot)=>localStorage.setItem(DRAFT_KEY,JSON.stringify({date:nzToday(),text:String(raw?.value||''),slotId:String(slot?.value||''),at:new Date().toISOString()}));
  const clearDraft=()=>localStorage.removeItem(DRAFT_KEY);

  M.actions.openNewSession=async()=>{
    M.access?.assert?.('session.create');
    await M.calendar.load();
    const host=document.querySelector('#modalHost'), today=nzToday(), slots=M.calendar.slots(today), hour=Number(new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',hour:'2-digit',hour12:false}).format(new Date()));
    host.innerHTML=modalHtml(); M.nav.openLayer('modal');
    const q=s=>host.querySelector(s), slot=q('#finalSlot'), truth=q('#finalTruth'), raw=q('#finalRaw'), status=q('#finalStatus'), preview=q('#finalPreview'), create=q('#finalCreate');
    slot.innerHTML=slots.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
    const part=hour>=12?'PM':'AM', preferred=slots.find(x=>x.dayPart===part&&(x.squads||[]).some(s=>/National/i.test(s))&&(x.squads||[]).some(s=>/Development/i.test(s)))||slots.find(x=>x.dayPart===part)||slots[0];
    if(preferred) slot.value=preferred.id;
    const draft=loadDraft(); if(draft?.date===today&&draft.text){raw.value=draft.text;if(draft.slotId&&[...slot.options].some(o=>o.value===draft.slotId))slot.value=draft.slotId;status.textContent='Draft restored locally';}

    let candidate=null,lastTranscript=null,mediaId=null,sourceType='text';
    const selected=()=>slots.find(x=>x.id===slot.value)||null;
    const identity=()=>{const x=selected();return x?M.calendar.identityFromSlot(x,`${x.dayPart} · ${(x.squads?.length?x.squads:[x.squad]).join(' + ')}`):{date:today,dayPart:part,title:`${part} session`,squads:['National','Development'],venue:'AquaGym',course:'SCM',start:'',end:''}};
    const build=()=>{try{
      const id=identity(),sid=slotId(selected()||{},id);
      if(lastTranscript?.structuredBlocks?.length&&R.fromStructured){candidate=R.fromStructured(lastTranscript,{...id,id:sid});}
      else {candidate=M.parser.parse(normaliseText(raw.value),{...id,id:sid});candidate.identity={...candidate.identity,...id};}
      const v=S.validate(candidate), total=S.total(candidate), written=Number(candidate.metadata?.explicitTotal)||null, match=!written||Math.abs(written-total)<=1, ok=v.ok&&total>0&&match;
      preview.className=`check-card ${ok?'ok':'bad'}`;
      preview.textContent=match?`${total.toLocaleString()}m${written?` · written ${written.toLocaleString()}m ✓`:''}`:`CALCULATED ${total.toLocaleString()}m · WRITTEN ${written.toLocaleString()}m — fix required`;
      create.disabled=!ok; return ok;
    }catch(e){candidate=null;create.disabled=true;preview.className='check-card bad';preview.textContent=e.message||String(e);return false}};
    const paint=()=>{const x=selected();truth.className=`check-card ${x?'ok':'bad'}`;truth.textContent=x?`${x.date} ${x.dayPart} · ${(x.squads?.length?x.squads:[x.squad]).join(' + ')} · ${x.start}-${x.end} · ${x.venue}`:'No published session';build()};
    const persistBuild=()=>{lastTranscript=null;sourceType='text';saveDraft(raw,slot);build()};
    raw.addEventListener('input',persistBuild); raw.addEventListener('change',persistBuild); raw.addEventListener('paste',()=>setTimeout(persistBuild,0)); slot.addEventListener('change',()=>{saveDraft(raw,slot);paint()});
    q('[data-final-close]').onclick=()=>{saveDraft(raw,slot);host.innerHTML='';M.nav.clearTransient?.();};
    host.querySelectorAll('[data-final-tab]').forEach(b=>b.onclick=()=>{host.querySelectorAll('[data-final-tab]').forEach(x=>x.classList.toggle('active',x===b));for(const t of ['text','voice','photo'])q(`#final${t[0].toUpperCase()+t.slice(1)}`).hidden=t!==b.dataset.finalTab});

    let rec=null,chunks=[];
    q('#finalStart').onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(stream);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});mediaId=await M.media.save(blob,{type:'planned_session_voice'});sourceType='voice';q('#finalAudio').src=URL.createObjectURL(blob);q('#finalAudio').hidden=false;status.textContent='Recording saved locally · transcribing…';try{lastTranscript=await transcribe(blob,'voice');raw.value=lastTranscript.verbatimText||lastTranscript.rawText||'';saveDraft(raw,slot);build();status.textContent=`Transcribed · ${candidate?S.total(candidate).toLocaleString()+'m':'check session'} · review then Create & use now`}catch(e){status.textContent=`${e.message||e} · recording is still saved locally`}};rec.start(1000);q('#finalStart').disabled=true;q('#finalStop').disabled=false;status.textContent='Recording full session…'}catch(e){status.textContent=e.message||String(e)}};
    q('#finalStop').onclick=()=>{if(rec&&rec.state!=='inactive')rec.stop();q('#finalStart').disabled=false;q('#finalStop').disabled=true};
    q('#finalFile').onchange=async e=>{const blob=e.target.files?.[0];if(!blob)return;mediaId=await M.media.save(blob,{type:'planned_session_photo'});sourceType='photo';status.textContent='Photo saved locally · transcribing…';try{lastTranscript=await transcribe(blob,'photo');raw.value=lastTranscript.verbatimText||lastTranscript.rawText||'';saveDraft(raw,slot);build();status.textContent=`Photo structured · ${candidate?S.total(candidate).toLocaleString()+'m':'check session'} · review then Create & use now`}catch(err){status.textContent=`${err.message||err} · photo is still saved locally`}};
    create.onclick=()=>{if(!candidate||!build())return;const saved=M.store.putSession(M.state,candidate);saved.metadata={...saved.metadata,intakeSource:sourceType,intakeMediaId:mediaId||null};M.state.settings.selectedSessionId=saved.id;M.state.settings.view='board';M.state.settings.boardFocusMode=false;M.store.save(M.state);clearDraft();host.innerHTML='';M.nav.clearTransient?.();M.nav.activateView?.('board');history.replaceState(M.nav.state('board'),'','#board');M.ui.renderCurrent();scrollTo(0,0);M.toast(`Session ready · ${S.total(saved).toLocaleString()}m`)};
    paint();
  };

  R.finalSelfTest=()=>{
    const src=`Warm up\n200 fr\n200 IM\n4x50 hbs\n10sr\n\nPre set\n5x50#1 build on 60\n5x10p I'm desc 1-5 on 1.45\n\nMain set 3 rounds\n5x100 free threshold 10 sr\n400 easy\n\nPost set\n8x75\n25 Easy\n25 Build\n25 Fast\n\nFocus: race-quality finish.\nAttack the final 15m and finish through the wall.\n\n4650m`;
    const normalized=normaliseText(src), parsed=M.parser.parse(normalized,{id:'final-selftest',date:'2026-08-17',dayPart:'PM',squads:['National','Development'],venue:'AquaGym',course:'SCM'}), total=S.total(parsed),written=Number(parsed.metadata?.explicitTotal)||null;
    return {ok:total===4650&&written===4650,total,written,normalized};
  };
  const t=R.finalSelfTest(); if(!t.ok)console.error('[MSOS v4 deck final] FAILED',t); else console.info('[MSOS v4 deck final] PASS 4650',t);
})(globalThis);
