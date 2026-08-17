'use strict';
(function(g){
  const M=g.MSOS4;
  if(!M) throw new Error('MSOS4 missing');
  const U=M.util,S=M.session,R=M.deckRecovery=M.deckRecovery||{};
  R.HOTFIX='v4-deck-hotfix-20260817b';
  M.BUILD=R.HOTFIX;
  M.CORE='20260817-v4-deck-hotfix-b';
  const txt=v=>U.text(v);
  const esc=v=>U.escape(v);
  const blockType=t=>({warmup:'warm_up',preset:'pre_set',skill:'pre_set',main:'main_set',pull:'main_set',kick:'main_set',test:'test',starts_turns:'pre_set',postset:'post_set',warmdown:'warm_down',other:'other'})[txt(t).toLowerCase()]||'other';
  const zone=z=>{const x=txt(z).toLowerCase();if(!x)return'';if(/^reg/.test(x))return'Regeneration';if(/^dev/.test(x))return'Development';if(/^(ol|over)/.test(x))return'Overload';if(/^thr/.test(x))return'Threshold';if(/^(cl|clear)/.test(x))return'Clearance';return txt(z)};
  const cycleSeconds=v=>{const s=txt(v).replace(/^@\s*/,'');return U.seconds(s)};
  function setFromStructured(sessionId,bType,order,x,commonRest){
    const raw=txt(x.raw||x.text||x.instruction)||`${Number(x.reps)||1} x ${Number(x.distance)||0}`;
    return {id:U.stableId('item',sessionId,bType,order,raw),kind:'set',order,reps:Math.max(1,Number(x.reps)||1),distance:Math.max(0,Number(x.distance)||0),stroke:txt(x.stroke),zone:zone(x.zone),restSeconds:Number(x.rest_seconds??commonRest)||null,cycleSeconds:cycleSeconds(x.cycle),equipment:Array.isArray(x.equipment)?x.equipment.map(txt).filter(Boolean):[],raw,text:raw,composition:[],pattern:[],repPattern:(x.rep_pattern||[]).map(p=>({rep:Math.max(1,Number(p.rep)||1),zone:zone(p.zone),instruction:txt(p.instruction)})),cues:[],repInstructions:[],raceIntent:M.parser?.raceIntent?.(raw)||null,targetSeconds:null,unclassifiedTerms:[]};
  }
  function attachCue(parent,raw){
    raw=txt(raw);if(!parent||!raw)return false;
    let m=raw.match(/^(\d+(?:\.5)?)\s+(.+)$/);
    if(m){const n=Number(m[1]),tail=txt(m[2]);if(n>=12.5&&n<Number(parent.distance||0)){parent.composition.push({distance:n,text:tail});return true}if(n>=1&&n<=Math.max(12,Number(parent.reps)||1)){parent.pattern.push({count:n,text:tail});return true}}
    parent.cues.push(raw);return true;
  }
  R.fromStructured=(tr,identity)=>{
    const verbatim=txt(tr?.verbatimText||tr?.rawText||''),blocks=Array.isArray(tr?.structuredBlocks)?tr.structuredBlocks:[];
    if(!blocks.length)return null;
    const s=S.empty(identity,verbatim);s.blocks=[];
    blocks.forEach((b,bi)=>{
      const type=blockType(b.block_type||b.type),title=txt(b.title)||U.blockTitle(type),children=[],commonRest=Number(b.common_rest_seconds)||null;let lastSet=null,order=0;
      for(const x of b.items||[]){
        const raw=txt(x.raw||x.text||x.instruction||x.cue),counted=x.counts_distance!==false&&txt(x.kind).toLowerCase()!=='cue'&&Number(x.distance)>0;
        if(counted){lastSet=setFromStructured(s.id,type,++order,x,commonRest);children.push(lastSet);continue}
        if(raw&&lastSet){attachCue(lastSet,raw);continue}
        if(raw)children.push({id:U.stableId('cue',s.id,type,++order,raw),kind:'cue',order,text:raw,raw});
      }
      if(txt(b.notes)&&lastSet)attachCue(lastSet,b.notes);
      const rounds=Math.max(1,Number(b.repeat_count)||1),items=rounds>1?[{id:U.stableId('group',s.id,type,bi,rounds),kind:'group',order:1,rounds,text:txt(b.notes),raw:`${rounds} Rounds`,items:children}]:children;
      s.blocks.push({id:U.stableId('block',s.id,type,bi),type,title,order:bi+1,items});
    });
    const d=tr.structuredData||{};s.metadata={...s.metadata,primarySystem:txt(d.primary_system),technicalFocus:txt(d.technical_focus),transcriptWarnings:Array.isArray(d.warnings)?d.warnings:[],transcriptDeclaredDistance:Number(d.planned_distance)||null,sourceAuthority:'structured_transcript'};
    s.currentSource={text:S.serialize(s),hash:U.hash(S.serialize(s)),updatedAt:U.now()};s.updatedAt=U.now();return s;
  };
  function slotId(slot,id){return U.stableId('session',id.date,id.dayPart,id.start,id.end,(id.squads||[]).join('+'),id.venue)}
  function modalHtml(){return `<div class="modal-backdrop"><section class="modal wide"><header><h2>Add session</h2><button data-close>×</button></header><div class="modal-body"><label>Published session<select id="hfSlot"></select></label><div id="hfTruth" class="check-card"></div><div class="intake-tabs"><button data-hf-tab="text" class="active">Paste / Type</button><button data-hf-tab="voice">Voice</button><button data-hf-tab="photo">Photo</button></div><div id="hfText"><label>Session<textarea id="hfRaw" class="session-editor"></textarea></label></div><div id="hfVoice" hidden><button id="hfStart">Start full session dictation</button><button id="hfStop" disabled>Stop & transcribe</button><audio id="hfAudio" controls hidden></audio></div><div id="hfPhoto" hidden><label class="buttonlike">Take / choose session photo<input id="hfFile" type="file" accept="image/*" capture="environment" hidden></label></div><div id="hfStatus" class="muted">Choose the session, then dictate, paste or photograph it.</div><div id="hfPreview" class="check-card"></div></div><footer><button id="hfCreate" disabled>Create & use now</button></footer></section></div>`}
  M.actions.openNewSession=async()=>{
    M.access?.assert?.('session.create');await M.calendar.load();
    const host=document.querySelector('#modalHost'),today=new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'}),slots=M.calendar.slots(today),hour=Number(new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',hour:'2-digit',hour12:false}).format(new Date()));host.innerHTML=modalHtml();M.nav.openLayer('modal');
    const q=s=>host.querySelector(s),slot=q('#hfSlot'),truth=q('#hfTruth'),raw=q('#hfRaw'),status=q('#hfStatus'),preview=q('#hfPreview'),create=q('#hfCreate');
    slot.innerHTML=slots.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');const part=hour>=12?'PM':'AM',preferred=slots.find(x=>x.dayPart===part&&(x.squads||[]).some(s=>/National/i.test(s))&&(x.squads||[]).some(s=>/Development/i.test(s)))||slots.find(x=>x.dayPart===part)||slots[0];if(preferred)slot.value=preferred.id;
    let candidate=null,lastTranscript=null,mediaId=null,sourceType='text';const selected=()=>slots.find(x=>x.id===slot.value)||null;const identity=()=>{const x=selected();return x?M.calendar.identityFromSlot(x,`${x.dayPart} · ${(x.squads?.length?x.squads:[x.squad]).join(' + ')}`):{date:today,dayPart:part,title:`${part} session`,squads:['National','Development'],venue:'AquaGym',course:'SCM',start:'',end:''}};
    const build=()=>{try{const id=identity(),sid=slotId(selected()||{},id);if(lastTranscript?.structuredBlocks?.length){candidate=R.fromStructured(lastTranscript,{...id,id:sid})}else{candidate=M.parser.parse(raw.value,{...id,id:sid});candidate.identity={...candidate.identity,...id}}const v=S.validate(candidate),total=S.total(candidate),ok=v.ok&&total>0;const declared=Number(lastTranscript?.structuredData?.planned_distance)||null;preview.className=`check-card ${ok?'ok':'bad'}`;preview.textContent=`${total.toLocaleString()}m${declared&&Math.abs(declared-total)>1?` · transcript said ${declared.toLocaleString()}m — ignored` : ''}`;create.disabled=!ok;return ok}catch(e){candidate=null;create.disabled=true;preview.className='check-card bad';preview.textContent=e.message||String(e);return false}};
    const paint=()=>{const x=selected();truth.className=`check-card ${x?'ok':'bad'}`;truth.textContent=x?`${x.date} ${x.dayPart} · ${(x.squads?.length?x.squads:[x.squad]).join(' + ')} · ${x.start}-${x.end} · ${x.venue}`:'No published session';build()};slot.onchange=paint;raw.oninput=()=>{lastTranscript=null;sourceType='text';build()};q('[data-close]').onclick=()=>M.actions.closeModal();
    host.querySelectorAll('[data-hf-tab]').forEach(b=>b.onclick=()=>{host.querySelectorAll('[data-hf-tab]').forEach(x=>x.classList.toggle('active',x===b));for(const t of ['text','voice','photo'])q(`#hf${t[0].toUpperCase()+t.slice(1)}`).hidden=t!==b.dataset.hfTab});
    let rec=null,chunks=[];q('#hfStart').onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(stream);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});mediaId=await M.media.save(blob,{type:'planned_session_voice'});sourceType='voice';q('#hfAudio').src=URL.createObjectURL(blob);q('#hfAudio').hidden=false;status.textContent='Recording saved locally · transcribing…';try{lastTranscript=await M.intake.transcribe(blob,'voice');raw.value=lastTranscript.verbatimText||lastTranscript.rawText||'';build();status.textContent=`Transcribed · ${candidate?S.total(candidate).toLocaleString()+'m':'check session'} · review then Create & use now`}catch(e){status.textContent=`${e.message||e} · recording is still saved locally`}};rec.start(1000);q('#hfStart').disabled=true;q('#hfStop').disabled=false;status.textContent='Recording full session…'}catch(e){status.textContent=e.message||String(e)}};q('#hfStop').onclick=()=>{if(rec&&rec.state!=='inactive')rec.stop();q('#hfStart').disabled=false;q('#hfStop').disabled=true};
    q('#hfFile').onchange=async e=>{const blob=e.target.files?.[0];if(!blob)return;mediaId=await M.media.save(blob,{type:'planned_session_photo'});sourceType='photo';status.textContent='Photo saved locally · transcribing…';try{lastTranscript=await M.intake.transcribe(blob,'photo');raw.value=lastTranscript.verbatimText||lastTranscript.rawText||'';build();status.textContent=`Photo structured · ${candidate?S.total(candidate).toLocaleString()+'m':'check session'} · review then Create & use now`}catch(err){status.textContent=`${err.message||err} · photo is still saved locally`}};
    create.onclick=()=>{if(!candidate||!build())return;const saved=M.store.putSession(M.state,candidate);saved.metadata={...saved.metadata,intakeSource:sourceType,intakeMediaId:mediaId||null};M.state.settings.selectedSessionId=saved.id;M.state.settings.view='board';M.state.settings.boardFocusMode=false;M.store.save(M.state);host.innerHTML='';M.nav.clearTransient?.();M.nav.activateView?.('board');history.replaceState(M.nav.state('board'),'','#board');M.ui.renderCurrent();scrollTo(0,0);M.toast(`Session ready · ${S.total(saved).toLocaleString()}m`)};paint();
  };
  R.hotfixSelfTest=()=>{const tr={rawText:'spoken',structuredBlocks:[{block_type:'main',repeat_count:3,items:[{raw:'5 x 100 Freestyle Threshold 30s Rest',kind:'work',counts_distance:true,reps:5,distance:100,rest_seconds:30,stroke:'Freestyle',zone:'Threshold',equipment:[],rep_pattern:[]},{raw:'400 Easy Choice',kind:'work',counts_distance:true,reps:1,distance:400,stroke:'Choice',equipment:[],rep_pattern:[]}]}],structuredData:{planned_distance:2700}};const x=R.fromStructured(tr,{id:'hf-test',date:'2026-08-17',dayPart:'PM',squads:['National','Development']});return{ok:S.total(x)===2700,total:S.total(x)}};
  const t=R.hotfixSelfTest();if(!t.ok)console.error('[MSOS deck hotfix] self-test failed',t);else console.info('[MSOS deck hotfix] PASS',t);
})(globalThis);
