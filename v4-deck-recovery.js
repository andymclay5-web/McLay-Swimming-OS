'use strict';
/* McLay Swimming OS Version 4 — poolside recovery gate, 2026-08-17.
   Scope: Board truth, structured session transcription, target/attendance chain,
   grouped published session roster. No cloud cutover changes. */
(function(g){
  const M=g.MSOS4;
  if(!M) throw new Error('MSOS v4 base app must load before v4-deck-recovery.js');
  const U=M.util,S=M.session;
  const R=M.deckRecovery=M.deckRecovery||{};
  R.BUILD='v4-deck-recovery-20260817-poolside';
  M.BUILD=R.BUILD;
  M.CORE='20260817-v4-poolside-recovery';

  const txt=v=>U?.text?U.text(v):String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>U?.escape?U.escape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const blockHeading=t=>({warmup:'WARM-UP',preset:'PRE-SET',skill:'PRE-SET',main:'MAIN SET',pull:'MAIN SET',kick:'MAIN SET',test:'TEST',starts_turns:'PRE-SET',postset:'POST-SET',warmdown:'WARM-DOWN',other:'MAIN SET'})[String(t||'').toLowerCase()]||String(t||'MAIN SET').toUpperCase();

  function itemSource(item){
    const raw=txt(item?.raw);
    if(raw) return raw;
    if(item?.kind==='cue'||item?.counts_distance===false) return txt(item?.text||item?.instruction||item?.cue||'');
    const reps=Math.max(1,Number(item?.reps)||1),distance=Number(item?.distance)||0;
    if(!distance) return txt(item?.text||'');
    const bits=[`${reps} x ${distance}`];
    if(item.stroke)bits.push(item.stroke);
    for(const e of item.equipment||[])if(e)bits.push(e);
    if(item.zone)bits.push(item.zone);
    if(item.start_type)bits.push(item.start_type);
    if(item.race_distance)bits.push(`@ ${item.race_distance}${item.race_stroke?` ${item.race_stroke}`:''} pace`);
    if(item.cycle)bits.push(`@ ${item.cycle}`);
    else if(Number(item.rest_seconds)>0)bits.push(`${Number(item.rest_seconds)}s Rest`);
    return bits.join(' ');
  }

  R.structuredToSource=(blocks,data={})=>{
    if(!Array.isArray(blocks)||!blocks.length)return'';
    const out=[];
    for(const b of blocks){
      out.push(blockHeading(b.block_type||b.type));
      const rounds=Math.max(1,Number(b.repeat_count)||1),indent=rounds>1?'  ':'';
      if(rounds>1)out.push(`${rounds} Rounds:`);
      for(const item of b.items||[]){
        const line=itemSource(item);if(!line)continue;
        out.push(indent+line);
        if(item.counts_distance!==false){
          for(const rp of item.rep_pattern||[]){
            const rep=Number(rp.rep)||1,zone=txt(rp.zone||rp.instruction);if(zone)out.push(`${indent}${rep}-${zone}`);
          }
          for(const cue of item.cues||[]){const c=txt(cue);if(c&&!line.includes(c))out.push(indent+c)}
        }
      }
      if(txt(b.notes))out.push(txt(b.notes));
      out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  };

  // The Edge function already returns structured_blocks. Use them. Do not throw the
  // structure away and ask the local parser to guess from one long speech transcript.
  if(M.intake?.transcribe&&!M.intake._deckRecoveryWrapped){
    const base=M.intake.transcribe.bind(M.intake);
    M.intake.transcribe=async(blob,sourceType='voice')=>{
      const tr=await base(blob,sourceType);
      const canonical=R.structuredToSource(tr.structuredBlocks||[],tr.structuredData||{});
      return {...tr,verbatimText:tr.rawText,rawText:canonical||tr.rawText,canonicalText:canonical||''};
    };
    M.intake._deckRecoveryWrapped=true;
  }

  // Published sessions that share the same time/venue/course are one coaching session
  // with multiple squads, not separate roster islands.
  if(M.calendar&&!M.calendar._deckRecoveryGrouped){
    const baseSlots=M.calendar.slots.bind(M.calendar);
    M.calendar.slots=date=>{
      const raw=baseSlots(date)||[],map=new Map(),events=[];
      for(const x of raw){
        if(x.source==='authorable_event'){events.push({...x,squads:[x.squad].filter(Boolean)});continue}
        const key=[x.date,x.dayPart,x.start,x.end,x.venue,x.course,x.source].join('|');
        let row=map.get(key);
        if(!row){row={...x,squads:[]};map.set(key,row)}
        if(x.squad&&!row.squads.includes(x.squad))row.squads.push(x.squad);
      }
      return [...map.values()].map(x=>({...x,squad:x.squads.join(' + '),label:`${x.dayPart} · ${x.start}-${x.end} · ${x.squads.join(' + ')} · ${x.venue}`})).concat(events);
    };
    M.calendar.identityFromSlot=(slot,title='')=>({
      date:slot.date,dayPart:slot.dayPart,title:title||slot.eventName||`${slot.dayPart} session`,
      squads:(slot.squads?.length?slot.squads:[slot.squad]).filter(Boolean),venue:slot.venue,course:slot.course||'',
      start:slot.start,end:slot.end,calendarSlotId:slot.id,calendarSource:slot.source,eventName:slot.eventName||''
    });
    M.calendar._deckRecoveryGrouped=true;
  }

  function safeSourceRepair(){
    const legacy=M.store?.legacy?.();if(!legacy||!M.state?.canonicalSessions)return 0;
    let repaired=0;
    for(const old of legacy.sessions||[]){
      const current=M.state.canonicalSessions[old.id];if(!current)continue;
      const meaningful=(current.changes||[]).filter(x=>!['legacy_import','session_import'].includes(x.type));
      if(meaningful.length)continue; // never overwrite real deck edits
      const source=txt(old.workout)?old.workout:((current.identity?.date==='2026-08-15'&&(current.identity?.squads||[]).includes('National'))?M.guardian?.SATURDAY_SOURCE:'');
      if(!txt(source))continue;
      try{
        const parsed=M.parser.parse(source,{...current.identity,id:current.id,legacySessionId:old.id});
        const pv=M.session.validate(parsed),pt=M.session.total(parsed),ct=M.session.total(current),declared=Number(old.planned_distance)||Number(parsed.metadata?.explicitTotal)||null;
        const credible=pv.ok&&(!declared||Math.abs(pt-declared)<=1);
        if(!credible||Math.abs(pt-ct)<=1)continue;
        parsed.identity={...current.identity,...parsed.identity,id:current.id};
        parsed.metadata={...current.metadata,...parsed.metadata,sourceAuthority:'legacy_workout_reparsed_by_v4_deck_recovery'};
        parsed.changes=[...(current.changes||[])];
        parsed.finish=current.finish||null;
        M.state.canonicalSessions[current.id]=parsed;repaired++;
      }catch(e){console.warn('[MSOS v4 deck recovery] source repair skipped',old.id,e)}
    }
    if(repaired)M.store.save(M.state);
    return repaired;
  }
  R.repairCanonical=safeSourceRepair;

  function samePrescription(item,adapted){
    if(!item||!adapted)return false;
    const eq=a=>(a||[]).map(txt).filter(Boolean).sort().join('|').toLowerCase();
    const same=Number(item.reps||1)===Number(adapted.reps||1)&&Number(item.distance||0)===Number(adapted.distance||0)&&
      txt(item.stroke).toLowerCase()===txt(adapted.stroke).toLowerCase()&&Number(item.cycleSeconds||0)===Number(adapted.cycleSeconds||0)&&
      Number(item.restSeconds||0)===Number(adapted.restSeconds||0)&&eq(item.equipment)===eq(adapted.equipment);
    if(!same)return false;
    if(/^Same team exposure\b/i.test(txt(adapted.adaptationReason)))return true;
    return txt(item.raw||item.text).toLowerCase()===txt(adapted.raw||adapted.text).toLowerCase();
  }

  function cleanBoardDom(){
    const host=document.querySelector('#boardView'),session=M.currentSession?.();if(!host||!session)return;
    // Whole-session Board is always the default coaching truth.
    host.querySelectorAll('.block-card.v4-block-hidden').forEach(x=>x.classList.remove('v4-block-hidden'));
    host.querySelector('.finish-card')?.classList.remove('v4-finish-hidden');
    host.querySelectorAll('[data-v4-block]').forEach(b=>{
      b.classList.remove('active');
      b.onclick=()=>{
        M.state.settings.boardFocusMode=false;M.store.save(M.state);
        const target=host.querySelector(`.block-card[data-block-id="${CSS.escape(b.dataset.v4Block)}"]`);
        target?.scrollIntoView({block:'start',behavior:'smooth'});
      };
    });
    const whole=host.querySelector('[data-v4-all]');if(whole){whole.classList.add('active');whole.onclick=()=>{M.state.settings.boardFocusMode=false;M.store.save(M.state);host.querySelector('.session-summary')?.scrollIntoView({block:'start',behavior:'smooth'})}}

    // Do not waste a separate swimmer row when their prescription is identical.
    host.querySelectorAll('.mod-chip[data-edit-mod]').forEach(chip=>{
      const [athleteId,itemId]=String(chip.dataset.editMod||'').split(':'),ath=M.state.athletes?.find(a=>a.id===athleteId),found=M.session.findItem(session,itemId);
      if(!ath||!found)return;
      const adapted=M.adapt.item(found.item,ath,M.state,session);
      if(samePrescription(found.item,adapted))chip.remove();
    });
    host.querySelectorAll('.mod-rail').forEach(rail=>{if(!rail.querySelector('.mod-chip'))rail.remove()});
  }

  if(M.ui?.renderBoard&&!M.ui._deckRecoveryBoardWrapped){
    const base=M.ui.renderBoard.bind(M.ui);
    M.ui.renderBoard=()=>{
      const s=M.currentSession?.();
      if(s&&M.state?.settings){
        M.state.settings.boardFocusMode=false;
        M.state.settings.boardBlockBySession=M.state.settings.boardBlockBySession||{};
        if(!M.state.settings.boardBlockBySession[s.id]&&s.blocks?.[0])M.state.settings.boardBlockBySession[s.id]=s.blocks[0].id;
      }
      base();cleanBoardDom();
    };
    M.ui._deckRecoveryBoardWrapped=true;
  }

  function slotId(slot){return U.stableId('session',slot.date,slot.dayPart,slot.start,slot.end,(slot.squads||[slot.squad]).join('+'),slot.venue)}
  function newSessionModal(){
    return `<div class="modal-backdrop"><section class="modal wide"><header><h2>Add session</h2><button data-close-modal>×</button></header><div class="modal-body">
      <label>Published session<select id="deckNewSlot"></select></label><div id="deckSlotTruth" class="check-card"></div>
      <div class="intake-tabs"><button data-deck-tab="text" class="active">Paste / Type</button><button data-deck-tab="voice">Voice</button><button data-deck-tab="photo">Photo</button></div>
      <div id="deckTextPane"><label>Session<textarea id="deckRaw" class="session-editor" placeholder="WARM-UP\n...\nMAIN SET\n..."></textarea></label></div>
      <div id="deckVoicePane" hidden><button id="deckVoiceStart">Start full session dictation</button><button id="deckVoiceStop" disabled>Stop & transcribe</button><audio id="deckVoicePreview" controls hidden></audio></div>
      <div id="deckPhotoPane" hidden><label class="buttonlike">Take / choose session photo<input id="deckPhoto" type="file" accept="image/*" capture="environment" hidden></label></div>
      <div id="deckStatus" class="muted">Choose the real session, then dictate, paste or photograph the programme.</div><div id="deckPreview" class="check-card"></div>
      </div><footer><button id="deckCreate" disabled>Create & use now</button></footer></section></div>`;
  }

  // One-touch poolside intake: the + button now reaches the same transcription path as Session Intake.
  if(M.actions&&!M.actions._deckRecoveryNewSession){
    M.actions.openNewSession=async()=>{
      M.access?.assert?.('session.create');
      await M.calendar.load();
      const host=document.querySelector('#modalHost'),today=new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'}),slots=M.calendar.slots(today);
      host.innerHTML=newSessionModal();M.nav?.openLayer?.('modal');
      const m=host.querySelector('.modal'),slot=m.querySelector('#deckNewSlot'),truth=m.querySelector('#deckSlotTruth'),raw=m.querySelector('#deckRaw'),status=m.querySelector('#deckStatus'),preview=m.querySelector('#deckPreview'),create=m.querySelector('#deckCreate');
      m.querySelector('[data-close-modal]').onclick=M.actions.closeModal;
      slot.innerHTML=slots.map((x,i)=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
      const hour=Number(new Intl.DateTimeFormat('en-NZ',{timeZone:'Pacific/Auckland',hour:'2-digit',hour12:false}).format(new Date()));
      const preferred=slots.find(x=>x.dayPart===(hour>=12?'PM':'AM')&&(x.squads||[]).some(s=>/National/i.test(s))&&(x.squads||[]).some(s=>/Development/i.test(s)))||slots.find(x=>x.dayPart===(hour>=12?'PM':'AM'))||slots[0];
      if(preferred)slot.value=preferred.id;
      let candidate=null,mediaId=null,sourceType='text',lastTranscript=null;
      const selected=()=>slots.find(x=>x.id===slot.value)||null;
      const identity=()=>{const x=selected();return x?M.calendar.identityFromSlot(x,`${x.dayPart} · ${(x.squads||[x.squad]).join(' + ')}`):{date:today,dayPart:hour>=12?'PM':'AM',title:'Session',squads:['National'],venue:'AquaGym',course:'SCM',start:'',end:''}};
      const paintSlot=()=>{const x=selected();truth.className=`check-card ${x?'ok':'bad'}`;truth.textContent=x?`LOCKED · ${x.date} ${x.dayPart} · ${(x.squads||[x.squad]).join(' + ')} · ${x.start}-${x.end} · ${x.venue} · ${x.course||'course unset'}`:'No published session found';check()};
      const check=()=>{try{const id=identity();candidate=M.parser.parse(raw.value,{...id,id:slotId({...selected(),...id,squads:id.squads})});candidate.identity={...candidate.identity,...id};if(lastTranscript?.structuredData){candidate.metadata={...candidate.metadata,primarySystem:txt(lastTranscript.structuredData.primary_system),technicalFocus:txt(lastTranscript.structuredData.technical_focus),transcriptWarnings:lastTranscript.structuredData.warnings||[],verbatimTranscript:lastTranscript.verbatimText||''}}const v=M.session.validate(candidate),exp=candidate.metadata.explicitTotal,match=exp==null||Math.abs(v.total-exp)<=1,dur=M.duration.estimate(candidate);const ok=v.ok&&match&&v.total>0;preview.className=`check-card ${ok?'ok':'bad'}`;preview.textContent=`${v.total.toLocaleString()}m${exp!=null?` · written ${exp.toLocaleString()}m${match?' ✓':' ✕'}`:''} · ~${M.duration.label(dur.seconds)}${dur.bookedSeconds?` / booked ${M.duration.label(dur.bookedSeconds)}`:''}${!ok&&v.errors.length?` · ${v.errors.join('; ')}`:''}`;create.disabled=!ok;return ok}catch(e){candidate=null;create.disabled=true;preview.className='check-card bad';preview.textContent=e.message||String(e);return false}};
      slot.onchange=paintSlot;raw.oninput=()=>{lastTranscript=null;check()};
      m.querySelectorAll('[data-deck-tab]').forEach(b=>b.onclick=()=>{m.querySelectorAll('[data-deck-tab]').forEach(x=>x.classList.toggle('active',x===b));for(const t of ['text','voice','photo'])m.querySelector(`#deck${t[0].toUpperCase()+t.slice(1)}Pane`).hidden=t!==b.dataset.deckTab});
      let rec=null,chunks=[];
      m.querySelector('#deckVoiceStart').onclick=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];rec=new MediaRecorder(stream);rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});mediaId=await M.media.save(blob,{type:'planned_session_voice'});sourceType='voice';const audio=m.querySelector('#deckVoicePreview');audio.src=URL.createObjectURL(blob);audio.hidden=false;status.textContent='Audio saved locally · transcribing and structuring…';try{lastTranscript=await M.intake.transcribe(blob,'voice');raw.value=lastTranscript.rawText;check();status.textContent=`Transcript structured · ${candidate?M.session.total(candidate).toLocaleString()+'m':'check session'} · review then Create & use now`}catch(e){status.textContent=`${e.message||e} · recording is still saved locally`}};rec.start(1000);m.querySelector('#deckVoiceStart').disabled=true;m.querySelector('#deckVoiceStop').disabled=false;status.textContent='Recording full session…'}catch(e){status.textContent=e.message||String(e)}};
      m.querySelector('#deckVoiceStop').onclick=()=>{if(rec?.state!=='inactive')rec.stop();m.querySelector('#deckVoiceStart').disabled=false;m.querySelector('#deckVoiceStop').disabled=true};
      m.querySelector('#deckPhoto').onchange=async e=>{const blob=e.target.files?.[0];if(!blob)return;mediaId=await M.media.save(blob,{type:'planned_session_photo'});sourceType='photo';status.textContent='Photo saved locally · transcribing and structuring…';try{lastTranscript=await M.intake.transcribe(blob,'photo');raw.value=lastTranscript.rawText;check();status.textContent=`Photo structured · ${candidate?M.session.total(candidate).toLocaleString()+'m':'check session'} · review then Create & use now`}catch(err){status.textContent=`${err.message||err} · photo is still saved locally`}};
      create.onclick=()=>{if(!candidate||!check())return M.toast('Session needs correction before creation');candidate.originalPlan=Object.freeze({text:raw.value,hash:U.hash(raw.value),capturedAt:U.now()});candidate.metadata={...candidate.metadata,intakeSource:sourceType,intakeMediaId:mediaId||null};M.store.putSession(M.state,candidate);M.state.settings.view='board';M.state.settings.boardFocusMode=false;M.store.save(M.state);M.actions.closeModal();M.nav?.show?.('board',{restoreScroll:false});M.ui.renderCurrent();M.toast(`Session ready · ${M.session.total(candidate).toLocaleString()}m · Roll next`)};
      paintSlot();
    };
    M.actions._deckRecoveryNewSession=true;
  }

  // Run source-authority repair after state exists; then keep the Board whole.
  try{safeSourceRepair()}catch(e){console.warn('[MSOS v4 deck recovery] boot repair deferred',e)}
  if(M.state?.settings)M.state.settings.boardFocusMode=false;

  // Small deterministic release checks that run without touching user data.
  R.selfTest=()=>{
    const out=[];const test=(name,fn)=>{try{fn();out.push({name,ok:true})}catch(e){out.push({name,ok:false,error:e.message||String(e)})}};
    test('Saturday protected source = 5450m',()=>{const x=M.parser.parse(M.guardian.SATURDAY_SOURCE,{id:'deck-test',date:'2026-08-15',dayPart:'AM',course:'SCM'});if(M.session.total(x)!==5450)throw new Error(`got ${M.session.total(x)}`)});
    test('12x50 keeps child pattern non-distance',()=>{const x=M.parser.parse('WARM-UP\n12 x 50 #1 @ 1:10\n1 Scull\n1 Drill\n1 Swim Perfect Technique',{id:'pattern'});if(M.session.total(x)!==600)throw new Error(`got ${M.session.total(x)}`);const i=x.blocks[0].items[0];if((i.pattern||[]).length!==3)throw new Error(`pattern rows ${(i.pattern||[]).length}`)});
    test('structured transcript parent/cue round-trip',()=>{const src=R.structuredToSource([{block_type:'warmup',repeat_count:1,items:[{raw:'12 x 50 #1 @ 1:10',kind:'work',counts_distance:true,reps:12,distance:50},{raw:'1 Scull',kind:'cue',counts_distance:false},{raw:'1 Drill',kind:'cue',counts_distance:false},{raw:'1 Swim Perfect Technique',kind:'cue',counts_distance:false}]}]);const x=M.parser.parse(src,{id:'structured'});if(M.session.total(x)!==600)throw new Error(`${src} => ${M.session.total(x)}`)});
    test('grouped calendar slot keeps multiple squads',()=>{const old=M.calendar.data;M.calendar.data={dates:[{date:'2099-01-01',sessions:[{day_part:'PM',start_time:'18:30',end_time:'20:00',squads:['National','Development'],venue:'AquaGym',pool_course:'SCM'}],events:[]}]};const slots=M.calendar.slots('2099-01-01'),id=M.calendar.identityFromSlot(slots[0]);M.calendar.data=old;if(id.squads.join('|')!=='National|Development')throw new Error(id.squads.join('|'))});
    return{ok:out.every(x=>x.ok),tests:out};
  };
  const result=R.selfTest();
  if(!result.ok)console.error('[MSOS v4 deck recovery] SELF TEST FAILED',result);else console.info('[MSOS v4 deck recovery] self test PASS',result);
})(globalThis);
