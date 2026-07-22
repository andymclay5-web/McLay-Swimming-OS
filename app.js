
"use strict";

const CONFIG_KEY = "mclay_swimming_v1_cloud_config";
const STATE_KEY = "mclay_swimming_os_v1";
const TOKEN_KEY = "mclay_swimming_v1_auth";
const DB_NAME = "mclay_swimming_v1_media";
const MEDIA_STORE = "media";
const CLOUD_TABLES = ["athletes","sessions","attendance","captures","timed_sets","session_reviews"];

const $ = id => document.getElementById(id);
const clone = obj => JSON.parse(JSON.stringify(obj));
const nowIso = () => new Date().toISOString();
const uid = prefix => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(16).slice(2)}`;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const byUpdated = (a,b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));

function loadState(){
  try{
    const raw = localStorage.getItem(STATE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(error){ console.warn(error); }
  const seeded = clone(window.MCLAY_SEED);
  saveState(seeded);
  return seeded;
}
function saveState(next){
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
  window.appState = next;
}
window.appState = loadState();

function getConfig(){
  const base = window.MCLAY_CONFIG || {};
  let saved = {};
  try{ saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); }catch{}
  return {
    supabaseUrl: saved.supabaseUrl || base.supabaseUrl || "",
    supabaseAnonKey: saved.supabaseAnonKey || base.supabaseAnonKey || "",
    mediaBucket: base.mediaBucket || "swimming-media"
  };
}
function saveConfig(config){
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
function getAuth(){
  try{return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null")}catch{return null}
}
function saveAuth(auth){
  if(auth) localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
  else localStorage.removeItem(TOKEN_KEY);
}

function formatDate(dateString){
  const [y,m,d] = dateString.split("-").map(Number);
  return `${d}/${m}/${String(y).slice(-2)}`;
}
function weekday(dateString){
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("en-NZ",{weekday:"long"}).format(date);
}
function sessionLabel(session){
  return `${weekday(session.session_date)} ${session.day_part} ${formatDate(session.session_date)}`;
}
function selectedSession(){
  const id = appState.settings.selected_session_id;
  return appState.sessions.find(s => s.id === id) || appState.sessions.slice().sort((a,b)=>b.session_date.localeCompare(a.session_date))[0];
}
function selectedRoster(){
  const session = selectedSession();
  if(!session) return [];
  return appState.athletes.filter(a => a.active && session.squads.includes(a.squad)).sort((a,b)=>a.squad.localeCompare(b.squad)||a.full_name.localeCompare(b.full_name));
}
function setSelectedSession(id){
  appState.settings.selected_session_id = id;
  saveState(appState);
  renderAll();
}
function currentSessionFromClock(){
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const part = today.getHours() < 12 ? "AM" : "PM";
  return appState.sessions.find(s => s.session_date === localDate && s.day_part === part)
      || appState.sessions.find(s => s.session_date === localDate)
      || selectedSession();
}

function showView(id){
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.view === id));
  window.scrollTo({top:0,behavior:"smooth"});
  renderAll();
}
document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if(nav) showView(nav.dataset.view);
  const jump = event.target.closest("[data-view-jump]");
  if(jump) showView(jump.dataset.viewJump);
});

function updateStatus(text, mode="normal"){
  $("syncBadge").textContent = text;
  $("syncBadge").className = `badge ${mode === "good" ? "good" : mode === "error" ? "error" : ""}`;
}
function cloudReady(){
  const config = getConfig();
  const auth = getAuth();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && auth?.access_token && appState.settings.organisation_id);
}
function renderMode(){
  const configured = Boolean(getConfig().supabaseUrl && getConfig().supabaseAnonKey);
  const signedIn = Boolean(getAuth()?.access_token);
  $("dataModeBadge").textContent = cloudReady() ? "Cloud connected" : configured && signedIn ? "Cloud setup incomplete" : "Local only";
  $("dataModeBadge").className = `badge ${cloudReady() ? "good" : "warning"}`;
}

function renderSessionPicker(){
  const sessions = appState.sessions.slice().sort((a,b)=>b.session_date.localeCompare(a.session_date)||b.day_part.localeCompare(a.day_part));
  $("sessionPicker").innerHTML = sessions.map(s => `<option value="${escapeHtml(s.id)}" ${s.id===selectedSession()?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");
  $("sessionPicker").onchange = () => setSelectedSession($("sessionPicker").value);
}

function renderOverview(){
  const session = selectedSession();
  if(!session){$("sessionLabel").textContent="Sign in to load sessions";$("sessionTitle").textContent="Your swimming data is protected in Supabase";$("sessionChips").innerHTML="";$("sessionPurpose").textContent="Open Connection, create an account, and sign in.";$("workoutBoard").textContent="No public roster or session data is bundled into this site.";return;}
  $("sessionLabel").textContent = sessionLabel(session);
  $("sessionTitle").textContent = session.title;
  $("sessionChips").innerHTML = [
    `<span class="chip">${escapeHtml(session.venue)}</span>`,
    ...session.squads.map(s=>`<span class="chip">${escapeHtml(s)}</span>`),
    `<span class="chip">${Number(session.planned_distance||0).toLocaleString()}m</span>`,
    `<span class="chip">${escapeHtml(session.primary_system||"")}</span>`
  ].join("");
  $("sessionPurpose").innerHTML = `<strong>Technical:</strong> ${escapeHtml(session.technical_focus || "—")}`;
  $("workoutBoard").textContent = session.workout || "No workout entered.";

  const previous = appState.sessions.find(s=>s.id===session.previous_session_id);
  $("progressionCard").innerHTML = previous
    ? `<div class="list-item"><strong>Step ${previous.step_number||1}: ${escapeHtml(sessionLabel(previous))}</strong><div>${escapeHtml(previous.title)}</div><div class="list-meta">${escapeHtml(previous.primary_system||"")}</div></div>
       <div style="text-align:center;font-size:24px;color:var(--aqua)">↓</div>
       <div class="list-item"><strong>Step ${session.step_number||2}: ${escapeHtml(sessionLabel(session))}</strong><div>${escapeHtml(session.title)}</div><div class="list-meta">${escapeHtml(session.primary_system||"")}</div></div>`
    : `<div class="list-item"><strong>${escapeHtml(sessionLabel(session))}</strong><div>${escapeHtml(session.title)}</div></div>`;

  const roster = selectedRoster();
  const attendance = appState.attendance.filter(a=>a.session_id===session.id);
  const here = attendance.filter(a=>a.status==="present"||a.status==="modified").length;
  $("kpiAttendance").textContent = `${here}/${roster.length}`;
  $("kpiCaptures").textContent = appState.captures.filter(c=>c.session_id===session.id).length;
  $("kpiTimed").textContent = appState.timed_sets.filter(t=>t.session_id===session.id).length;
  $("kpiDistance").textContent = `${Number(session.planned_distance||0).toLocaleString()}m`;
}

$("copyWorkoutBtn").addEventListener("click", async () => {
  try{
    await navigator.clipboard.writeText(selectedSession()?.workout || "");
    updateStatus("Workout copied","good");
  }catch{
    updateStatus("Copy not available","error");
  }
});

function attendanceId(sessionId, athleteId){ return `attendance-${sessionId}-${athleteId}`; }
function attendanceFor(sessionId, athleteId){
  return appState.attendance.find(a=>a.session_id===sessionId && a.athlete_id===athleteId);
}

function renderAttendance(){
  const session = selectedSession();
  if(!session) return;
  $("attendanceHeading").textContent = `${sessionLabel(session)} · ${session.venue} · ${session.squads.join(" + ")}`;
  const roster = selectedRoster();
  const groups = [...new Set(roster.map(a=>a.squad))];

  $("attendanceList").innerHTML = groups.map(group => {
    const rows = roster.filter(a=>a.squad===group).map(a=>{
      const value = attendanceFor(session.id,a.id)?.status || "";
      return `<div class="attendance-row" data-athlete-id="${escapeHtml(a.id)}">
        <strong>${escapeHtml(a.full_name)}</strong>
        <div class="attendance-buttons" role="group" aria-label="Attendance for ${escapeHtml(a.full_name)}">
          <button type="button" class="attendance-choice ${value==="present"?"active":""}" data-status="present">Here</button>
          <button type="button" class="attendance-choice ${value==="modified"?"active":""}" data-status="modified">Modified</button>
          <button type="button" class="attendance-choice ${value==="absent"?"active":""}" data-status="absent">Absent</button>
        </div>
      </div>`;
    }).join("");
    return `<div class="attendance-group"><h3>${escapeHtml(group)}</h3>${rows}</div>`;
  }).join("");

  document.querySelectorAll(".attendance-choice").forEach(button=>{
    button.addEventListener("click",()=>{
      const group = button.closest(".attendance-buttons");
      const alreadyActive = button.classList.contains("active");
      group.querySelectorAll(".attendance-choice").forEach(b=>b.classList.remove("active"));
      if(!alreadyActive) button.classList.add("active");
    });
  });
}

$("markAllPresentBtn").addEventListener("click",()=>{
  document.querySelectorAll(".attendance-buttons").forEach(group=>{
    group.querySelectorAll(".attendance-choice").forEach(b=>b.classList.toggle("active",b.dataset.status==="present"));
  });
});
$("clearAttendanceBtn").addEventListener("click",()=>{
  document.querySelectorAll(".attendance-choice").forEach(b=>b.classList.remove("active"));
});
$("saveAttendanceBtn").addEventListener("click",async()=>{
  const session = selectedSession();
  const updatedAt = nowIso();

  document.querySelectorAll(".attendance-row[data-athlete-id]").forEach(row=>{
    const athleteId = row.dataset.athleteId;
    const active = row.querySelector(".attendance-choice.active");
    const status = active?.dataset.status || "";
    const existing = attendanceFor(session.id,athleteId);

    if(!status){
      if(existing){
        appState.attendance = appState.attendance.filter(a=>a.id!==existing.id);
        if(typeof queueDelete === "function") queueDelete("attendance",existing.id);
      }
      return;
    }

    upsertLocal("attendance",{
      id:existing?.id || attendanceId(session.id,athleteId),
      session_id:session.id,
      athlete_id:athleteId,
      status,
      note:existing?.note || "",
      updated_at:updatedAt
    });
  });

  saveState(appState);
  queueWholeTable("attendance");
  updateStatus(cloudReady() ? "Waiting to sync" : "Attendance saved","good");
  await syncIfPossible();
  renderAll();
});

function upsertLocal(collection,record){
  const index = appState[collection].findIndex(x=>x.id===record.id);
  if(index>=0) appState[collection][index] = {...appState[collection][index],...record};
  else appState[collection].push(record);
}
function queueRecord(table,id){
  const existing=appState.pending.find(p=>p.table===table&&p.id===id);
  if(existing) existing.action="upsert";
  else appState.pending.push({table,id,action:"upsert"});
  saveState(appState);
}
function queueDelete(table,id){
  const existing=appState.pending.find(p=>p.table===table&&p.id===id);
  if(existing) existing.action="delete";
  else appState.pending.push({table,id,action:"delete"});
  saveState(appState);
}
function queueWholeTable(table){
  appState[table].forEach(r=>queueRecord(table,r.id));
}

function populateAthleteSelect(selectId, includeGroup=false){
  const sessionAthletes = selectedRoster();
  $(selectId).innerHTML = (includeGroup ? `<option value="">Whole session / group</option>` : "") +
    sessionAthletes.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.full_name)}</option>`).join("");
}
$("saveTextCaptureBtn").addEventListener("click",async()=>{
  const text = $("captureText").value.trim();
  if(!text){ alert("Add a note first."); return; }
  const record = {
    id:uid("capture"),
    session_id:selectedSession().id,
    athlete_id:$("captureAthlete").value || null,
    capture_type:"text",
    text_content:`[${$("captureCategory").value}] ${text}`,
    media_path:null,
    media_local_id:null,
    mime_type:null,
    created_at:nowIso(),
    updated_at:nowIso()
  };
  upsertLocal("captures",record);
  queueRecord("captures",record.id);
  saveState(appState);
  $("captureText").value="";
  await syncIfPossible();
  renderCaptures();
  renderOverview();
});


$("pasteClipboardBtn").addEventListener("click",async()=>{
  try{
    const text = await navigator.clipboard.readText();
    if(!text) throw new Error("Clipboard is empty.");
    $("captureText").value = [$("captureText").value.trim(),text.trim()].filter(Boolean).join("\n");
    $("captureText").focus();
    updateStatus("Text pasted from chat","good");
  }catch(error){
    const pasted = window.prompt("Paste the chat text here:");
    if(pasted) $("captureText").value = [$("captureText").value.trim(),pasted.trim()].filter(Boolean).join("\n");
  }
});
$("clearCaptureBtn").addEventListener("click",()=>{
  $("captureText").value="";
  $("voicePreview").hidden=true;
  $("voicePreview").removeAttribute("src");
});
function readSharedText(){
  const params = new URLSearchParams(location.search);
  const parts = [params.get("share-title"),params.get("share-text"),params.get("share-url")].filter(Boolean);
  if(!parts.length) return false;
  $("captureText").value = parts.join("\n");
  history.replaceState({},document.title,location.pathname);
  showView("capture");
  updateStatus("Shared text ready to save","good");
  return true;
}

function openMediaDb(){
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => request.result.createObjectStore(MEDIA_STORE,{keyPath:"id"});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveMediaBlob(blob,kind,name){
  const id = uid("media");
  const db = await openMediaDb();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(MEDIA_STORE,"readwrite");
    tx.objectStore(MEDIA_STORE).put({id,blob,kind,name:name||`${kind}-${Date.now()}`,created_at:nowIso()});
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
  return id;
}
async function getMediaBlob(id){
  if(!id) return null;
  const db = await openMediaDb();
  return await new Promise((resolve,reject)=>{
    const req = db.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(id);
    req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error);
  });
}
let mediaRecorder = null;
let mediaChunks = [];
$("startVoiceBtn").addEventListener("click",async()=>{
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    mediaChunks=[];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if(e.data.size) mediaChunks.push(e.data); };
    mediaRecorder.onstop = async()=>{
      const blob = new Blob(mediaChunks,{type:mediaRecorder.mimeType||"audio/webm"});
      const localId = await saveMediaBlob(blob,"voice","voice-note.webm");
      const record = {
        id:uid("capture"),session_id:selectedSession().id,
        athlete_id:$("captureAthlete").value||null,capture_type:"voice",
        text_content:"Voice note",media_path:null,media_local_id:localId,
        mime_type:blob.type,created_at:nowIso(),updated_at:nowIso()
      };
      upsertLocal("captures",record);queueRecord("captures",record.id);saveState(appState);
      const url=URL.createObjectURL(blob);$("voicePreview").src=url;$("voicePreview").hidden=false;
      stream.getTracks().forEach(t=>t.stop());
      await syncIfPossible();renderCaptures();renderOverview();
    };
    mediaRecorder.start();
    $("startVoiceBtn").disabled=true;$("stopVoiceBtn").disabled=false;
    updateStatus("Recording voice note");
  }catch(error){
    alert("Voice recording needs the hosted HTTPS version and microphone permission.");
    updateStatus("Voice unavailable","error");
  }
});
$("stopVoiceBtn").addEventListener("click",()=>{
  if(mediaRecorder && mediaRecorder.state!=="inactive") mediaRecorder.stop();
  $("startVoiceBtn").disabled=false;$("stopVoiceBtn").disabled=true;
  updateStatus("Voice note saved","good");
});
async function saveFileCapture(file,kind){
  if(!file) return;
  const localId = await saveMediaBlob(file,kind,file.name);
  const record = {
    id:uid("capture"),session_id:selectedSession().id,
    athlete_id:$("captureAthlete").value||null,capture_type:kind,
    text_content:kind==="photo"?"Poolside photo":"Poolside video",
    media_path:null,media_local_id:localId,mime_type:file.type,
    created_at:nowIso(),updated_at:nowIso()
  };
  upsertLocal("captures",record);queueRecord("captures",record.id);saveState(appState);
  await syncIfPossible();renderCaptures();renderOverview();
}
$("photoInput").addEventListener("change",async e=>{await saveFileCapture(e.target.files?.[0],"photo");e.target.value=""});
$("videoInput").addEventListener("change",async e=>{await saveFileCapture(e.target.files?.[0],"video");e.target.value=""});

$("saveReviewBtn").addEventListener("click",async()=>{
  const session = selectedSession();
  const existing = appState.session_reviews.find(r=>r.session_id===session.id);
  const record = {
    id:existing?.id||`review-${session.id}`,session_id:session.id,
    went_well:$("reviewWentWell").value.trim(),
    reinforce:$("reviewReinforce").value.trim(),
    athlete_notes:$("reviewAthletes").value.trim(),
    carry_forward:$("reviewCarry").value.trim(),
    updated_at:nowIso()
  };
  upsertLocal("session_reviews",record);queueRecord("session_reviews",record.id);saveState(appState);
  await syncIfPossible();updateStatus("Session review saved","good");
});
function renderReview(){
  const review = appState.session_reviews.find(r=>r.session_id===selectedSession()?.id)||{};
  $("reviewWentWell").value=review.went_well||"";
  $("reviewReinforce").value=review.reinforce||"";
  $("reviewAthletes").value=review.athlete_notes||"";
  $("reviewCarry").value=review.carry_forward||"";
}

async function mediaHtml(capture){
  if(capture.media_local_id){
    try{
      const item = await getMediaBlob(capture.media_local_id);
      if(item?.blob){
        const url=URL.createObjectURL(item.blob);
        if(capture.capture_type==="voice") return `<audio controls src="${url}"></audio>`;
        if(capture.capture_type==="video") return `<video controls playsinline src="${url}"></video>`;
        if(capture.capture_type==="photo") return `<img src="${url}" alt="Poolside capture">`;
      }
    }catch{}
  }
  if(capture.media_path && cloudReady()){
    try{
      const url=await cloudSignedUrl(capture.media_path);
      if(capture.capture_type==="voice") return `<audio controls src="${escapeHtml(url)}"></audio>`;
      if(capture.capture_type==="video") return `<video controls playsinline src="${escapeHtml(url)}"></video>`;
      if(capture.capture_type==="photo") return `<img src="${escapeHtml(url)}" alt="Poolside capture">`;
    }catch{}
  }
  return `<div class="help">Media is waiting to sync or is unavailable on this device.</div>`;
}
async function renderCaptures(){
  const session = selectedSession();
  const items = appState.captures.filter(c=>c.session_id===session?.id).sort(byUpdated);
  if(!items.length){$("captureList").innerHTML=`<div class="help">No captures for this session yet.</div>`;return}
  const blocks=[];
  for(const item of items){
    const athlete=appState.athletes.find(a=>a.id===item.athlete_id);
    const media = item.capture_type==="text" ? "" : `<div class="media-preview">${await mediaHtml(item)}</div>`;
    blocks.push(`<div class="list-item"><strong>${escapeHtml(athlete?.full_name||"Whole session / group")}</strong><p>${escapeHtml(item.text_content||item.capture_type)}</p>${media}<div class="list-meta">${new Date(item.created_at).toLocaleString("en-NZ")}</div></div>`);
  }
  $("captureList").innerHTML=blocks.join("");
}


function parseTime(token){
  const clean=String(token).trim().replace(/[^\d:.]/g,"");
  if(!clean) return null;
  const parts=clean.split(":").map(Number);
  if(parts.some(Number.isNaN)) return null;
  if(parts.length===1) return parts[0];
  if(parts.length===2) return parts[0]*60+parts[1];
  return parts[parts.length-3]*3600+parts[parts.length-2]*60+parts[parts.length-1];
}
function formatSeconds(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return "—";
  const minutes=Math.floor(n/60);
  const seconds=n-minutes*60;
  return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4,"0")}` : seconds.toFixed(1);
}

let manualTimes=[];
let stopwatchLaps=[];
let stopwatchRunning=false;
let stopwatchStartedAt=0;
let stopwatchAccumulated=0;
let stopwatchAnimation=null;
let wakeLock=null;

function currentStopwatchElapsed(){
  return stopwatchAccumulated + (stopwatchRunning ? performance.now()-stopwatchStartedAt : 0);
}
function renderStopwatch(){
  $("stopwatchDisplay").textContent=formatSeconds(currentStopwatchElapsed()/1000);
  if(stopwatchRunning) stopwatchAnimation=requestAnimationFrame(renderStopwatch);
}
async function keepScreenAwake(){
  try{
    if("wakeLock" in navigator && !wakeLock) wakeLock=await navigator.wakeLock.request("screen");
  }catch{}
}
async function releaseWakeLock(){
  try{await wakeLock?.release()}catch{}
  wakeLock=null;
}
function renderStopwatchLaps(){
  $("stopwatchLapList").innerHTML=stopwatchLaps.length
    ? stopwatchLaps.map((time,index)=>`<span class="time-chip"><small>${index+1}</small>${formatSeconds(time)}</span>`).join("")
    : `<span class="help">No laps yet.</span>`;
  $("saveStopwatchSetBtn").disabled=!stopwatchLaps.length;
}
function renderManualTimes(){
  $("manualTimeList").innerHTML=manualTimes.length
    ? manualTimes.map((time,index)=>`<span class="time-chip"><small>${index+1}</small>${formatSeconds(time)}</span>`).join("")
    : `<span class="help">No times entered yet.</span>`;
  $("saveManualSetBtn").disabled=!manualTimes.length;
}
function resetStopwatch(){
  stopwatchRunning=false;
  stopwatchStartedAt=0;
  stopwatchAccumulated=0;
  stopwatchLaps=[];
  if(stopwatchAnimation) cancelAnimationFrame(stopwatchAnimation);
  $("stopwatchDisplay").textContent="0:00.0";
  $("stopwatchStartBtn").disabled=false;
  $("stopwatchPauseBtn").disabled=true;
  $("stopwatchPauseBtn").textContent="Pause";
  $("stopwatchLapBtn").disabled=true;
  releaseWakeLock();
  renderStopwatchLaps();
}
$("stopwatchStartBtn").addEventListener("click",async()=>{
  if(stopwatchRunning) return;
  stopwatchRunning=true;
  stopwatchStartedAt=performance.now();
  $("stopwatchStartBtn").disabled=true;
  $("stopwatchPauseBtn").disabled=false;
  $("stopwatchPauseBtn").textContent="Pause";
  $("stopwatchLapBtn").disabled=false;
  await keepScreenAwake();
  renderStopwatch();
});
$("stopwatchPauseBtn").addEventListener("click",async()=>{
  if(stopwatchRunning){
    stopwatchAccumulated += performance.now()-stopwatchStartedAt;
    stopwatchRunning=false;
    if(stopwatchAnimation) cancelAnimationFrame(stopwatchAnimation);
    $("stopwatchPauseBtn").textContent="Resume";
    $("stopwatchLapBtn").disabled=true;
    await releaseWakeLock();
  }else{
    stopwatchRunning=true;
    stopwatchStartedAt=performance.now();
    $("stopwatchPauseBtn").textContent="Pause";
    $("stopwatchLapBtn").disabled=false;
    await keepScreenAwake();
    renderStopwatch();
  }
});
$("stopwatchLapBtn").addEventListener("click",()=>{
  if(!stopwatchRunning) return;
  const total=currentStopwatchElapsed()/1000;
  const previousTotal=stopwatchLaps.reduce((sum,value)=>sum+value,0);
  const split=total-previousTotal;
  if(split>0) stopwatchLaps.push(split);
  renderStopwatchLaps();
});
$("stopwatchResetBtn").addEventListener("click",resetStopwatch);

function addManualTime(raw){
  const parsed=parseTime(raw);
  if(!parsed||parsed<=0) return false;
  manualTimes.push(parsed);
  renderManualTimes();
  return true;
}
$("addManualTimeBtn").addEventListener("click",()=>{
  if(!addManualTime($("manualTimeInput").value)){
    $("manualTimeInput").focus();
    return;
  }
  $("manualTimeInput").value="";
  $("manualTimeInput").focus();
});
$("manualTimeInput").addEventListener("keydown",event=>{
  if(event.key==="Enter"){
    event.preventDefault();
    $("addManualTimeBtn").click();
  }
});
$("pasteTimesBtn").addEventListener("click",async()=>{
  let text="";
  try{text=await navigator.clipboard.readText()}catch{}
  if(!text) text=window.prompt("Paste the times here:")||"";
  const parsed=text.split(/[\s,;]+/).map(parseTime).filter(value=>value&&value>0);
  if(parsed.length){
    manualTimes.push(...parsed);
    renderManualTimes();
    updateStatus(`${parsed.length} times loaded`,"good");
  }
});
$("undoManualTimeBtn").addEventListener("click",()=>{manualTimes.pop();renderManualTimes()});
$("clearManualTimesBtn").addEventListener("click",()=>{manualTimes=[];renderManualTimes()});

async function saveTimedSetFrom(times,source){
  if(!times.length){alert("Add at least one time.");return}
  const athleteId=$("timeAthlete").value;
  if(!athleteId){alert("Choose an athlete.");return}
  const record={
    id:uid("timed"),
    session_id:selectedSession().id,
    athlete_id:athleteId,
    distance:Number($("timeDistance").value),
    stroke:$("timeStroke").value,
    set_label:$("timeLabel").value.trim() || (source==="stopwatch" ? "Stopwatch set" : "Manual set"),
    send_off:$("timeSendoff").value.trim(),
    times:[...times],
    average:times.reduce((a,b)=>a+b,0)/times.length,
    best:Math.min(...times),
    spread:Math.max(...times)-Math.min(...times),
    created_at:nowIso(),
    updated_at:nowIso()
  };
  const previous=appState.timed_sets
    .filter(t=>t.athlete_id===record.athlete_id&&t.distance===record.distance&&t.stroke===record.stroke)
    .sort(byUpdated)[0];

  upsertLocal("timed_sets",record);
  queueRecord("timed_sets",record.id);
  saveState(appState);

  const change=previous?record.average-previous.average:null;
  $("timedSetResult").innerHTML=`<div class="result">
    <strong>Average ${formatSeconds(record.average)}</strong><br>
    Best ${formatSeconds(record.best)} · Spread ${record.spread.toFixed(1)} sec<br>
    ${previous?`${change<=0?"Improved":"Slower"} by ${Math.abs(change).toFixed(1)} sec versus the last comparable set.`:"This is the first comparable baseline."}
  </div>`;

  await syncIfPossible();
  renderTimedSets();
  renderOverview();
  renderReports();
}
$("saveStopwatchSetBtn").addEventListener("click",async()=>{
  await saveTimedSetFrom(stopwatchLaps,"stopwatch");
  resetStopwatch();
});
$("saveManualSetBtn").addEventListener("click",async()=>{
  await saveTimedSetFrom(manualTimes,"manual");
  manualTimes=[];
  renderManualTimes();
});

function renderPaceReference(){
  const athlete=appState.athletes.find(a=>a.id===$("timeAthlete").value);
  const p=athlete?.legacy_pace;
  $("paceReference").innerHTML=p
    ? `<div class="result"><strong>${escapeHtml(athlete.full_name)}</strong><br>T400 ${escapeHtml(p.t400)}<br>100 AT (+10 rest): ${escapeHtml(p.at_100_10)}<br>100 AT (+30 rest): ${escapeHtml(p.at_100_30)}</div><p class="help">Legacy reference only. Confirm test date, pool length and athlete match before treating it as current.</p>`
    : `<div class="warning-box">No confirmed legacy pace match for this athlete.</div>`;
}
$("timeAthlete").addEventListener("change",renderPaceReference);
function renderTimedSets(){
  const session=selectedSession();
  const items=appState.timed_sets.filter(t=>t.session_id===session?.id).sort(byUpdated);
  $("timedSetList").innerHTML=items.length?items.map(t=>{
    const athlete=appState.athletes.find(a=>a.id===t.athlete_id);
    return `<div class="list-item"><strong>${escapeHtml(athlete?.full_name||"Unknown")} · ${t.distance} ${escapeHtml(t.stroke)}</strong><div>${escapeHtml(t.set_label||"Timed set")} · avg ${formatSeconds(t.average)} · best ${formatSeconds(t.best)} · spread ${Number(t.spread||0).toFixed(1)}</div><div class="list-meta">${escapeHtml(t.send_off||"No send-off")} · ${new Date(t.created_at).toLocaleString("en-NZ")}</div></div>`;
  }).join(""):`<div class="help">No timed sets for this session yet.</div>`;
}

function renderSessions(){
  const sorted=appState.sessions.slice().sort((a,b)=>b.session_date.localeCompare(a.session_date)||b.day_part.localeCompare(a.day_part));
  $("sessionList").innerHTML=sorted.map(s=>`<div class="session-list-item ${s.id===selectedSession()?.id?"active":""}" data-edit-session="${escapeHtml(s.id)}"><strong>${escapeHtml(sessionLabel(s))}</strong><div>${escapeHtml(s.title)}</div><div class="list-meta">${escapeHtml(s.venue)} · ${s.squads.map(escapeHtml).join(" + ")} · ${Number(s.planned_distance||0).toLocaleString()}m</div></div>`).join("");
  document.querySelectorAll("[data-edit-session]").forEach(el=>el.addEventListener("click",()=>{
    setSelectedSession(el.dataset.editSession);fillSessionEditor(selectedSession());showView("sessions");
  }));
}
function fillSessionEditor(session){
  $("sessionEditorTitle").textContent=session?"Edit session":"New session";
  $("editSessionId").value=session?.id||"";
  $("editSessionDate").value=session?.session_date||"";
  $("editSessionPart").value=session?.day_part||"AM";
  $("editSessionVenue").value=session?.venue||"";
  $("editSessionDistance").value=session?.planned_distance||"";
  $("editSessionTitle").value=session?.title||"";
  $("editSessionSquads").value=(session?.squads||[]).join(", ");
  $("editSessionSystem").value=session?.primary_system||"";
  $("editSessionTechnical").value=session?.technical_focus||"";
  $("editSessionWorkout").value=session?.workout||"";
}
$("newSessionBtn").addEventListener("click",()=>fillSessionEditor(null));
$("saveSessionBtn").addEventListener("click",async()=>{
  const existing=appState.sessions.find(s=>s.id===$("editSessionId").value);
  const record={
    id:existing?.id||uid("session"),session_date:$("editSessionDate").value,day_part:$("editSessionPart").value,
    venue:$("editSessionVenue").value.trim(),title:$("editSessionTitle").value.trim(),
    squads:$("editSessionSquads").value.split(",").map(x=>x.trim()).filter(Boolean),
    planned_distance:Number($("editSessionDistance").value||0),primary_system:$("editSessionSystem").value.trim(),
    technical_focus:$("editSessionTechnical").value.trim(),workout:$("editSessionWorkout").value,
    step_number:existing?.step_number||null,previous_session_id:existing?.previous_session_id||null,
    status:existing?.status||"planned",updated_at:nowIso()
  };
  if(!record.session_date||!record.title){alert("Date and title are required.");return}
  upsertLocal("sessions",record);appState.settings.selected_session_id=record.id;queueRecord("sessions",record.id);saveState(appState);
  await syncIfPossible();fillSessionEditor(record);renderAll();
});

function attendanceStats(athleteId){
  const records=appState.attendance.filter(a=>a.athlete_id===athleteId);
  return {marked:records.length,here:records.filter(a=>a.status==="present"||a.status==="modified").length};
}
function renderAthletes(){
  const squads=[...new Set(appState.athletes.map(a=>a.squad))].sort();
  const current=$("athleteSquadFilter").value;
  $("athleteSquadFilter").innerHTML=`<option value="">All squads</option>`+squads.map(s=>`<option ${s===current?"selected":""}>${escapeHtml(s)}</option>`).join("");
  const filter=$("athleteSquadFilter").value;
  const rows=appState.athletes.filter(a=>!filter||a.squad===filter).sort((a,b)=>a.squad.localeCompare(b.squad)||a.full_name.localeCompare(b.full_name));
  $("athleteTableBody").innerHTML=rows.map(a=>{
    const stats=attendanceStats(a.id);
    const timed=appState.timed_sets.filter(t=>t.athlete_id===a.id).length;
    const notes=appState.captures.filter(c=>c.athlete_id===a.id).length;
    const pace=a.legacy_pace?`T400 ${escapeHtml(a.legacy_pace.t400)}<br>AT ${escapeHtml(a.legacy_pace.at_100_10)}`:"Needs current test";
    return `<tr><td><strong>${escapeHtml(a.full_name)}</strong></td><td>${escapeHtml(a.squad)}</td><td>${stats.marked?`${stats.here}/${stats.marked}`:"—"}</td><td>${pace}</td><td>${timed}</td><td>${notes}</td></tr>`;
  }).join("");
}
$("athleteSquadFilter").addEventListener("change",renderAthletes);

function renderReports(){
  const current=$("reportAthlete").value||selectedRoster()[0]?.id||appState.athletes[0]?.id;
  $("reportAthlete").innerHTML=appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===current?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("");
  const athlete=appState.athletes.find(a=>a.id===$("reportAthlete").value);
  if(!athlete){$("athleteReport").innerHTML="";return}
  const attendance=appState.attendance.filter(a=>a.athlete_id===athlete.id);
  const attended=attendance.filter(a=>a.status==="present"||a.status==="modified");
  const sessionIds=new Set(attended.map(a=>a.session_id));
  const distance=appState.sessions.filter(s=>sessionIds.has(s.id)).reduce((sum,s)=>sum+Number(s.planned_distance||0),0);
  const timed=appState.timed_sets.filter(t=>t.athlete_id===athlete.id).sort(byUpdated);
  const notes=appState.captures.filter(c=>c.athlete_id===athlete.id).sort(byUpdated);
  $("athleteReport").innerHTML=`<h3>${escapeHtml(athlete.full_name)}</h3>
    <div class="report-grid">
      <div><strong>${attended.length}</strong><span>sessions attended</span></div>
      <div><strong>${distance.toLocaleString()}m</strong><span>planned volume attended</span></div>
      <div><strong>${timed.length}</strong><span>timed sets</span></div>
      <div><strong>${notes.length}</strong><span>athlete notes</span></div>
    </div>
    <h3>Latest timed work</h3>
    ${timed.length?timed.slice(0,5).map(t=>`<div class="list-item">${t.distance} ${escapeHtml(t.stroke)} · avg ${formatSeconds(t.average)} · best ${formatSeconds(t.best)}</div>`).join(""):`<p class="help">No timed work yet.</p>`}
    <h3>Latest notes</h3>
    ${notes.length?notes.slice(0,5).map(n=>`<div class="list-item"><p>${escapeHtml(n.text_content)}</p><div class="list-meta">${new Date(n.created_at).toLocaleString("en-NZ")}</div></div>`).join(""):`<p class="help">No athlete notes yet.</p>`}`;
}
$("reportAthlete").addEventListener("change",renderReports);

function loadSettings(){
  const config=getConfig();
  $("supabaseUrlInput").value=config.supabaseUrl;
  $("supabaseKeyInput").value=config.supabaseAnonKey;
}
$("saveCloudConfigBtn").addEventListener("click",()=>{
  saveConfig({supabaseUrl:$("supabaseUrlInput").value.trim().replace(/\/$/,""),supabaseAnonKey:$("supabaseKeyInput").value.trim()});
  $("connectionResult").innerHTML=`<div class="result">Connection details saved on this device.</div>`;
  renderMode();
});
async function authRequest(path,body){
  const config=getConfig();
  if(!config.supabaseUrl||!config.supabaseAnonKey) throw new Error("Add the Supabase URL and anon key first.");
  const response=await fetch(`${config.supabaseUrl}/auth/v1/${path}`,{
    method:"POST",headers:{"apikey":config.supabaseAnonKey,"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.msg||data.error_description||data.message||"Authentication failed");
  return data;
}
$("signInBtn").addEventListener("click",async()=>{
  try{
    const data=await authRequest("token?grant_type=password",{email:$("authEmail").value.trim(),password:$("authPassword").value});
    saveAuth(data);appState.settings.user_id=data.user.id;saveState(appState);
    await ensureOrganisation();await syncNow();
    $("connectionResult").innerHTML=`<div class="result">Signed in and synced.</div>`;
  }catch(error){$("connectionResult").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}</div>`}
  renderMode();
});
$("signUpBtn").addEventListener("click",async()=>{
  try{
    const data=await authRequest("signup",{email:$("authEmail").value.trim(),password:$("authPassword").value});
    if(data.access_token){saveAuth(data);appState.settings.user_id=data.user.id;saveState(appState);await ensureOrganisation();await syncNow()}
    $("connectionResult").innerHTML=`<div class="result">${data.access_token?"Account created and connected.":"Account created. Check email if confirmation is enabled, then sign in."}</div>`;
  }catch(error){$("connectionResult").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}</div>`}
  renderMode();
});
$("signOutBtn").addEventListener("click",()=>{saveAuth(null);appState.settings.user_id="";appState.settings.organisation_id="";saveState(appState);renderMode();updateStatus("Signed out")});
$("syncNowBtn").addEventListener("click",async()=>{try{await syncNow();$("connectionResult").innerHTML=`<div class="result">Sync complete.</div>`}catch(error){$("connectionResult").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}</div>`}});

async function cloudFetch(path,options={}){
  const config=getConfig(),auth=getAuth();
  if(!config.supabaseUrl||!config.supabaseAnonKey||!auth?.access_token) throw new Error("Cloud is not signed in.");
  const response=await fetch(`${config.supabaseUrl}${path}`,{
    ...options,
    headers:{
      "apikey":config.supabaseAnonKey,
      "Authorization":`Bearer ${auth.access_token}`,
      "Content-Type":"application/json",
      ...(options.headers||{})
    }
  });
  const text=await response.text();
  const data=text?JSON.parse(text):null;
  if(!response.ok) throw new Error(data?.message||data?.error||`Cloud request failed (${response.status})`);
  return data;
}

async function bootstrapOrganisationData(orgId){
  await cloudFetch("/rest/v1/rpc/bootstrap_mclay_swimming",{
    method:"POST",
    body:JSON.stringify({target_org:orgId})
  });
}

async function ensureOrganisation(){
  const auth=getAuth();
  if(!auth?.user?.id) throw new Error("Sign in first.");
  let memberships=await cloudFetch(`/rest/v1/organisation_members?select=organisation_id,role&user_id=eq.${encodeURIComponent(auth.user.id)}&limit=1`);
  if(memberships.length){
    const orgId=memberships[0].organisation_id;
    appState.settings.organisation_id=orgId;
    saveState(appState);
    await bootstrapOrganisationData(orgId);
    return orgId;
  }
  const organisation=await cloudFetch("/rest/v1/organisations",{
    method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({name:"McLay Swimming OS",owner_id:auth.user.id})
  });
  const orgId=organisation[0].id;
  await cloudFetch("/rest/v1/organisation_members",{method:"POST",headers:{"Prefer":"return=minimal"},body:JSON.stringify({organisation_id:orgId,user_id:auth.user.id,role:"owner"})});
  appState.settings.organisation_id=orgId;
  saveState(appState);
  await bootstrapOrganisationData(orgId);
  return orgId;
}
function cloudRow(table,record){
  const org=appState.settings.organisation_id,user=getAuth()?.user?.id;
  const base={...record,organisation_id:org,created_by:user};
  if(table==="athletes") return {id:base.id,organisation_id:org,full_name:base.full_name,squad:base.squad,active:base.active,legacy_pace:base.legacy_pace,updated_at:base.updated_at,created_by:user};
  if(table==="sessions") return {id:base.id,organisation_id:org,session_date:base.session_date,day_part:base.day_part,venue:base.venue,title:base.title,squads:base.squads,planned_distance:base.planned_distance,primary_system:base.primary_system,technical_focus:base.technical_focus,workout:base.workout,step_number:base.step_number,previous_session_id:base.previous_session_id,status:base.status,updated_at:base.updated_at,created_by:user};
  if(table==="attendance") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,status:base.status,note:base.note,updated_at:base.updated_at,created_by:user};
  if(table==="captures") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,capture_type:base.capture_type,text_content:base.text_content,media_path:base.media_path,mime_type:base.mime_type,created_at:base.created_at,updated_at:base.updated_at,created_by:user};
  if(table==="timed_sets") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,distance:base.distance,stroke:base.stroke,set_label:base.set_label,send_off:base.send_off,times:base.times,average:base.average,best:base.best,spread:base.spread,created_at:base.created_at,updated_at:base.updated_at,created_by:user};
  if(table==="session_reviews") return {id:base.id,organisation_id:org,session_id:base.session_id,went_well:base.went_well,reinforce:base.reinforce,athlete_notes:base.athlete_notes,carry_forward:base.carry_forward,updated_at:base.updated_at,created_by:user};
  return base;
}
async function uploadCaptureMedia(capture){
  if(!capture.media_local_id||capture.media_path) return capture;
  const item=await getMediaBlob(capture.media_local_id);
  if(!item?.blob) return capture;
  const config=getConfig(),auth=getAuth(),org=appState.settings.organisation_id;
  const safeName=(item.name||"media").replace(/[^a-zA-Z0-9._-]+/g,"-");
  const path=`${org}/${capture.session_id}/${capture.id}-${safeName}`;
  const response=await fetch(`${config.supabaseUrl}/storage/v1/object/${config.mediaBucket}/${encodeURI(path)}`,{
    method:"POST",
    headers:{"apikey":config.supabaseAnonKey,"Authorization":`Bearer ${auth.access_token}`,"Content-Type":item.blob.type||"application/octet-stream","x-upsert":"true"},
    body:item.blob
  });
  if(!response.ok){const text=await response.text();throw new Error(`Media upload failed: ${text}`)}
  capture.media_path=path;capture.updated_at=nowIso();upsertLocal("captures",capture);saveState(appState);
  return capture;
}
async function cloudSignedUrl(path){
  const config=getConfig();
  const result=await cloudFetch(`/storage/v1/object/sign/${config.mediaBucket}/${encodeURI(path)}`,{method:"POST",body:JSON.stringify({expiresIn:3600})});
  return `${config.supabaseUrl}/storage/v1${result.signedURL}`;
}
async function pushPending(){
  if(!cloudReady()) return;
  const priority={athletes:1,sessions:2,attendance:3,captures:4,timed_sets:5,session_reviews:6};
  const pending=[...appState.pending].sort((a,b)=>(priority[a.table]||99)-(priority[b.table]||99));
  for(const item of pending){
    if(item.action==="delete"){
      await cloudFetch(`/rest/v1/${item.table}?id=eq.${encodeURIComponent(item.id)}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
      appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);
      continue;
    }
    const record=appState[item.table]?.find(r=>r.id===item.id);
    if(!record){appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));continue}
    if(item.table==="captures") await uploadCaptureMedia(record);
    const row=cloudRow(item.table,record);
    await cloudFetch(`/rest/v1/${item.table}?on_conflict=id`,{
      method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row)
    });
    appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);
  }
}
function stripCloudFields(row){
  const copy={...row};delete copy.organisation_id;delete copy.created_by;return copy;
}
function mergeCollection(local,remote){
  const map=new Map(local.map(x=>[x.id,x]));
  for(const r of remote){
    const clean=stripCloudFields(r),existing=map.get(clean.id);
    const existingTime=String(existing?.updated_at||existing?.created_at||"");
    const incomingTime=String(clean.updated_at||clean.created_at||"");
    if(!existing||incomingTime>=existingTime) map.set(clean.id,clean);
  }
  return [...map.values()];
}
async function pullCloud(){
  if(!cloudReady()) return;
  const org=appState.settings.organisation_id;
  for(const table of CLOUD_TABLES){
    const rows=await cloudFetch(`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);
    appState[table]=mergeCollection(appState[table],rows);
  }
  saveState(appState);
}
async function syncNow(){
  if(!getAuth()?.access_token) throw new Error("Sign in first.");
  if(!appState.settings.organisation_id) await ensureOrganisation();
  updateStatus("Syncing…");
  queueWholeTable("athletes");queueWholeTable("sessions");
  await pushPending();await pullCloud();
  updateStatus("Cloud synced","good");renderAll();
}
async function syncIfPossible(){
  if(!cloudReady()){renderMode();return}
  try{await pushPending();await pullCloud();updateStatus("Cloud synced","good")}catch(error){console.error(error);updateStatus("Waiting to sync","error")}
}
window.addEventListener("online",syncIfPossible);

function renderAll(){
  renderMode();renderSessionPicker();renderOverview();renderAttendance();
  populateAthleteSelect("captureAthlete",true);populateAthleteSelect("timeAthlete",false);
  renderReview();renderCaptures();renderPaceReference();renderTimedSets();renderStopwatchLaps();renderManualTimes();renderSessions();
  renderAthletes();renderReports();loadSettings();fillSessionEditor(selectedSession());
}
const clockSession=currentSessionFromClock();
if(clockSession){appState.settings.selected_session_id=clockSession.id;saveState(appState)}
renderAll();
readSharedText();
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
if(cloudReady()) syncIfPossible();
