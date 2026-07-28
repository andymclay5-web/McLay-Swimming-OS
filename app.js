
"use strict";

const CONFIG_KEY = "mclay_swimming_v1_cloud_config";
const STATE_KEY = "mclay_swimming_os_v1";
const TOKEN_KEY = "mclay_swimming_v1_auth";
const DB_NAME = "mclay_swimming_v1_media";
const MEDIA_STORE = "media";
const CLOUD_TABLES = ["athletes","sessions","attendance","captures","timed_sets","session_reviews","season_plans","weekly_plans","session_lane_assignments","session_blocks","session_transcriptions","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases","race_goals"];
const REFERENCE_TABLES = ["world_aquatics_base_times","world_para_point_parameters"];
const RESULT_VIEWS = [
  "results_athlete_overview",
  "results_pb_board",
  "results_event_history",
  "nzsc_2026_gap_matrix",
  "scwc_target_gap_matrix",
  "results_record_gaps"
];

// v3.7.4 performance boundary: large read-only result/reference collections are
// cached separately. Ordinary poolside taps only persist the lightweight coach state.
const V374_HEAVY_STATE_KEYS = new Set([
  "coach_results","pathway_standards","pathway_meets",
  "world_aquatics_base_times","world_para_point_parameters",
  ...RESULT_VIEWS
]);
let v374StateWriteTimer = null;
let v374PendingPersist = null;

function v374PersistableState(next){
  const persisted={...next,settings:{...(next.settings||{})}};
  const pendingIds=new Set((next.pending||[]).filter(item=>item.table==="coach_results"&&item.action==="upsert").map(item=>item.id));
  for(const key of V374_HEAVY_STATE_KEYS){
    if(key==="coach_results") persisted[key]=(next[key]||[]).filter(row=>pendingIds.has(row.id));
    else persisted[key]=[];
  }
  return persisted;
}

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
  window.appState = next;
  v374PendingPersist = v374PersistableState(next);
  if(v374StateWriteTimer===null){
    const writeSnapshot=()=>{
      const snapshot=v374PendingPersist;
      v374PendingPersist=null;
      v374StateWriteTimer=null;
      if(snapshot){try{localStorage.setItem(STATE_KEY,JSON.stringify(snapshot))}catch(error){console.warn("Lightweight local save unavailable",error)}}
    };
    v374StateWriteTimer=typeof requestIdleCallback==="function"
      ? requestIdleCallback(writeSnapshot,{timeout:450})
      : setTimeout(writeSnapshot,80);
  }
  if(typeof window.v374ScheduleHeavyCache==="function") window.v374ScheduleHeavyCache(next);
}
window.appState = loadState();
for(const key of ["athletes","sessions","attendance","captures","timed_sets","session_reviews","season_plans","weekly_plans","session_lane_assignments","session_blocks","session_transcriptions","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases","race_goals","pathway_standards","pathway_meets",...REFERENCE_TABLES,"pending",...RESULT_VIEWS]){
  if(!Array.isArray(window.appState[key])) window.appState[key]=[];
}
if(!window.appState.settings) window.appState.settings={selected_session_id:"",organisation_id:"",user_id:""};
for(const [key,value] of Object.entries({selected_session_id:"",selected_squad:"",selected_athlete_id:"",selected_season_plan_id:"",selected_weekly_plan_id:"",selected_test_set_id:"",organisation_id:"",user_id:""})){
  if(window.appState.settings[key]===undefined) window.appState.settings[key]=value;
}
saveState(window.appState);

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
function squadKey(value){
  let key=String(value||"").toLowerCase().replace(/&/g," and ").replace(/\bsquad\b/g,"").replace(/[^a-z0-9]+/g," ").trim();
  const aliases={nat:"national",national:"national",dev:"development",development:"development",int:"intermediate",intermediate:"intermediate",fit:"fitness",fitness:"fitness",jnr:"junior",junior:"junior",sen:"senior",senior:"senior","novice para":"novice para",para:"novice para"};
  return aliases[key]||key;
}
function resolveSquadName(value){
  const raw=String(value||"").trim();if(!raw)return "";
  const known=[...new Set(appState.athletes.map(a=>a.squad).filter(Boolean))];
  return known.find(s=>s.toLowerCase()===raw.toLowerCase())||known.find(s=>squadKey(s)===squadKey(raw))||raw;
}
function sessionSquads(session){
  const raw=Array.isArray(session?.squads)?session.squads:[session?.squads];
  const known=[...new Set(appState.athletes.map(a=>a.squad).filter(Boolean))];
  const result=[];
  for(const item of raw.map(String).map(s=>s.trim()).filter(Boolean)){
    const exact=known.find(s=>s.toLowerCase()===item.toLowerCase());
    const parts=exact?[exact]:item.split(/\s*(?:\/|\+|&|,|\band\b)\s*/i).filter(Boolean);
    for(const part of parts){const resolved=resolveSquadName(part);if(resolved&&!result.some(x=>squadKey(x)===squadKey(resolved)))result.push(resolved)}
  }
  return result;
}
function selectedSession(){
  const id=appState.settings.selected_session_id;
  const exact=appState.sessions.find(s=>s.id===id);
  if(exact)return exact;
  return appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0]||null;
}
function activeSquad(){
  const session=selectedSession();
  const squads=sessionSquads(session);
  if(!squads.length)return "";
  const saved=appState.settings.selected_squad;
  return squads.find(s=>squadKey(s)===squadKey(saved))||squads[0];
}
function rosterSort(a,b){
  const laneA=String(a.training_lane||"").padStart(4,"0"),laneB=String(b.training_lane||"").padStart(4,"0");
  return laneA.localeCompare(laneB)||Number(a.timing_order||999)-Number(b.timing_order||999)||a.full_name.localeCompare(b.full_name);
}
function allSessionRoster(){
  const session=selectedSession();if(!session)return [];
  const squads=sessionSquads(session);
  return appState.athletes.filter(a=>a.active&&squads.some(s=>squadKey(s)===squadKey(a.squad))).sort(rosterSort);
}
function selectedRoster(){
  const squad=activeSquad();
  return allSessionRoster().filter(a=>!squad||squadKey(a.squad)===squadKey(squad)).sort(rosterSort);
}
function setActiveSquad(squad){
  const session=selectedSession();
  const resolved=sessionSquads(session).find(s=>squadKey(s)===squadKey(squad));if(!resolved)return;squad=resolved;
  appState.settings.selected_squad=squad;
  const roster=selectedRoster();
  if(!roster.some(a=>a.id===appState.settings.selected_athlete_id))appState.settings.selected_athlete_id=roster[0]?.id||"";
  saveState(appState);resetLiveRoster();renderAll();
}
function setSelectedSession(id){
  const session=appState.sessions.find(s=>s.id===id);if(!session)return;
  appState.settings.selected_session_id=id;
  const squads=sessionSquads(session);
  if(!squads.some(s=>squadKey(s)===squadKey(appState.settings.selected_squad)))appState.settings.selected_squad=squads[0]||"";
  appState.settings.selected_athlete_id=selectedRoster()[0]?.id||"";
  saveState(appState);resetLiveRoster();renderAll();
}
function currentSessionFromClock(){
  const today=new Date();
  const localDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const part=today.getHours()<12?"AM":"PM";
  return appState.sessions.find(s=>s.session_date===localDate&&s.day_part===part)||appState.sessions.find(s=>s.session_date===localDate)||selectedSession();
}
function renderActiveContext(){
  const session=selectedSession();
  const picker=$("contextSessionPicker");
  if(picker){const sessions=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`));picker.innerHTML=sessions.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===session?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");picker.onchange=()=>setSelectedSession(picker.value)}
  const buttons=$("contextSquadButtons");
  if(buttons){buttons.innerHTML=sessionSquads(session).map(s=>`<button type="button" class="${s===activeSquad()?"active":""}" data-context-squad="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")||'<span class="help">No squad on session</span>';buttons.querySelectorAll("[data-context-squad]").forEach(b=>b.onclick=()=>setActiveSquad(b.dataset.contextSquad))}
}


let importedSessionDraft = null;
function localIsoDate(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function datePlusDays(days){
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return localIsoDate(d);
}
function parseClockValue(value){
  const raw=String(value||"").trim();
  if(!raw) return "";
  if(raw.includes(":")){
    const [m,sec]=raw.split(":").map(Number);
    if(Number.isFinite(m)&&Number.isFinite(sec)) return `${m}:${String(Math.round(sec)).padStart(2,"0")}`;
  }
  const total=Number(raw);
  if(!Number.isFinite(total)) return "";
  return `${Math.floor(total/60)}:${String(Math.round(total%60)).padStart(2,"0")}`;
}
function parseImportDate(text){
  let m=text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if(m) return `${m[1]}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[3])).padStart(2,"0")}`;
  m=text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
  if(m){const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]);return `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`}
  if(/\btomorrow\b/i.test(text)) return datePlusDays(1);
  if(/\btoday\b/i.test(text)) return datePlusDays(0);
  const names=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const target=names.findIndex(name=>new RegExp(`\\b${name}\\b`,"i").test(text));
  if(target>=0){const d=new Date();d.setHours(12,0,0,0);let add=(target-d.getDay()+7)%7;if(add===0)add=7;d.setDate(d.getDate()+add);return localIsoDate(d)}
  return datePlusDays(1);
}
function labelledValue(text,labels){
  const pattern=new RegExp(`(?:^|\\n)\\s*(?:${labels.join("|")})\\s*[:\\-–—]\\s*([^\\n]+)`,`i`);
  return text.match(pattern)?.[1]?.trim()||"";
}
function estimateDistance(text){
  const explicit=text.match(/(?:total|planned\s*distance|distance)\s*[:=\-–—]?\s*([0-9][0-9,]{2,5})\s*m?\b/i);
  if(explicit) return Number(explicit[1].replace(/,/g,""));
  let total=0;
  for(const line of text.split(/\n/)){
    const repeats=[...line.matchAll(/\b(\d{1,2})\s*[x×]\s*(\d{2,4})\s*m?\b/gi)];
    if(repeats.length){for(const m of repeats) total+=Number(m[1])*Number(m[2]);continue}
    const single=line.match(/^\s*(\d{2,4})\s*m?\b/i);
    if(single) total+=Number(single[1]);
  }
  return total;
}
function inferSystem(text){
  const explicit=labelledValue(text,["primary system","system","energy system"]);
  if(explicit) return explicit;
  const systems=["race pace","threshold","aerobic","anaerobic","lactate","vo2","speed","recovery","skills","technique"];
  return systems.find(x=>new RegExp(`\\b${x}\\b`,"i").test(text))||"";
}
function inferTitle(text){
  const explicit=labelledValue(text,["session title","title","session"]);
  if(explicit) return explicit;
  const line=text.split(/\n/).map(x=>x.trim()).find(x=>x && !/^((today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|date\s*:|venue\s*:|squads?\s*:|focus\s*:|technical\s*:|system\s*:|total\s*:)/i.test(x));
  return (line||"Imported session").replace(/^#+\s*/,"").slice(0,100);
}
function inferSquads(text){
  const explicit=labelledValue(text,["squads?","group"]);
  if(explicit) return explicit.split(/[,/&+]|\band\b/i).map(x=>x.trim()).filter(Boolean);
  const known=[...new Set(appState.athletes.map(a=>a.squad).filter(Boolean))];
  const found=known.filter(s=>text.toLowerCase().includes(s.toLowerCase()));
  return found.length?found:(selectedSession()?.squads||[]);
}
function inferLiveSet(text){
  const m=text.match(/\b(\d{1,2})\s*[x×]\s*(\d{2,4})\s*m?[^\n]{0,80}?(?:on|@|cycle|off)\s*(\d{1,2}:\d{2}|\d{2,3})\b/i);
  if(!m) return null;
  return {reps:Number(m[1]),distance:Number(m[2]),cycle:parseClockValue(m[3]),label:m[0].trim()};
}

function inferStrokeFromLine(line){
  const t=String(line||"").toLowerCase();
  if(/\b(back|bk)\b/.test(t)) return "Backstroke";
  if(/\b(breast|br)\b/.test(t)) return "Breaststroke";
  if(/\b(fly|butterfly)\b/.test(t)) return "Butterfly";
  if(/\b(im|medley)\b/.test(t)) return "IM";
  if(/\bkick\b/.test(t)) return "Kick";
  if(/\bpull\b/.test(t)) return "Pull";
  return "Freestyle";
}
function extractStructuredSets(text){
  const sets=[];
  String(text||"").split(/\n/).forEach((raw,index)=>{
    const line=raw.replace(/^\s*[-•*#]+\s*/,"").trim();
    if(!line)return;
    const matches=[...line.matchAll(/\b(\d{1,3})\s*[x×]\s*(\d{2,4})\s*m?\b(?:[^\n]{0,100}?(?:on|@|cycle|off|every)\s*(\d{1,2}:\d{2}|\d{2,3}))?/gi)];
    matches.forEach((m,part)=>{
      sets.push({
        id:`set-${index+1}-${part+1}`,
        label:line.slice(0,160),
        reps:Number(m[1]),distance:Number(m[2]),
        cycle:parseClockValue(m[3]||""),stroke:inferStrokeFromLine(line)
      });
    });
  });
  return sets.slice(0,30);
}
function parseSessionFromChat(raw){
  const text=String(raw||"").replace(/\r/g,"").trim();
  if(!text) throw new Error("Paste a session first.");
  const part=/\b(pm|afternoon|evening)\b/i.test(text)?"PM":"AM";
  const venue=labelledValue(text,["venue","pool","location"]);
  const technical=labelledValue(text,["technical focus","technical","focus","key cue","cue"]);
  return {
    id:uid("session"),session_date:parseImportDate(text),day_part:part,
    venue:venue||selectedSession()?.venue||"",title:inferTitle(text),squads:inferSquads(text),
    planned_distance:estimateDistance(text),primary_system:inferSystem(text),technical_focus:technical,
    workout:text,sets:extractStructuredSets(text),plan_cue:labelledValue(text,["plan cue","weekly cue","season cue","purpose"]),
    next_session_cue:labelledValue(text,["next session","tomorrow","carry forward","lead-in"]),
    step_number:null,previous_session_id:selectedSession()?.id||null,status:"planned",updated_at:nowIso(),
    live_set:inferLiveSet(text)
  };
}
function renderSessionImportPreview(){
  const box=$("sessionImportPreview");
  if(!box) return;
  const d=importedSessionDraft;
  if(!d){box.className="session-import-preview help";box.textContent="Nothing parsed yet.";return}
  const live=d.live_set?`${d.live_set.reps} × ${d.live_set.distance} on ${d.live_set.cycle}`:"No repeating interval detected";
  box.className="session-import-preview";
  box.innerHTML=`<div class="import-preview-grid">
    <div><span>Date</span><strong>${escapeHtml(sessionLabel(d))}</strong></div>
    <div><span>Title</span><strong>${escapeHtml(d.title)}</strong></div>
    <div><span>Squads</span><strong>${escapeHtml(d.squads.join(" + ")||"Check squad")}</strong></div>
    <div><span>Venue</span><strong>${escapeHtml(d.venue||"Not found")}</strong></div>
    <div><span>Distance</span><strong>${d.planned_distance?`${Number(d.planned_distance).toLocaleString()}m`:"Not calculated"}</strong></div>
    <div><span>System</span><strong>${escapeHtml(d.primary_system||"Not found")}</strong></div>
    <div><span>Technical cue</span><strong>${escapeHtml(d.technical_focus||"Not found")}</strong></div>
    <div><span>Detected sets</span><strong>${(d.sets||[]).length}</strong></div>
    <div><span>Live timing</span><strong>${escapeHtml(live)}</strong></div>
  </div><details><summary>Check full workout</summary><pre class="import-workout-preview">${escapeHtml(d.workout)}</pre></details>`;
}
async function saveImportedSession(openLive){
  if(!importedSessionDraft) return;
  const d=clone(importedSessionDraft);delete d.live_set;
  upsertLocal("sessions",d);appState.settings.selected_session_id=d.id;queueRecord("sessions",d.id);saveState(appState);
  await syncIfPossible();renderAll();
  updateStatus("Session saved","good");
  if(openLive && importedSessionDraft.live_set){
    showView("times");
    $("liveReps").value=importedSessionDraft.live_set.reps;
    $("liveDistance").value=String(importedSessionDraft.live_set.distance);
    $("liveCycle").value=importedSessionDraft.live_set.cycle;
    $("timeLabel").value=importedSessionDraft.live_set.label;
    $("timeSendoff").value=importedSessionDraft.live_set.cycle;
    renderLiveBoard();
  }else showView("deck");
}

function renderView(id){
  renderMode();renderActiveContext();
  if(id==="deck"){renderDeck();renderSessionImportPreview();populateAthleteSelect("deckAthlete",false);renderDeckAthleteBrief();return}
  if(id==="overview"){renderSessionPicker();renderOverview();return}
  if(id==="attendance"){renderAttendance();return}
  if(id==="capture"){populateAthleteSelect("captureAthlete",true);renderCaptures();return}
  if(id==="finish"){renderReview();return}
  if(id==="times"){populateAthleteSelect("timeAthlete",false);renderPaceReference();renderTimedSets();renderStopwatchLaps();renderManualTimes();renderLiveBoard();return}
  if(id==="sessions"){renderSessions();v3PopulatePlanSelects();return}
  if(id==="planning"){renderPlanning();return}
  if(id==="testsets"){renderTestSets();return}
  if(id==="athletes"){renderAthletes();return}
  if(id==="results"){renderResults();return}
  if(id==="resultsupdate"){renderResultsUpdate();return}
  if(id==="reports"){renderReports();return}
  if(id==="settings"){loadSettings();return}
}
function showView(id){
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === id));
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.view === id));
  window.scrollTo({top:0,behavior:"smooth"});
  renderView(id);
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
  const sessions=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`));
  for(const id of ["sessionPicker","deckSessionPicker"]){const picker=$(id);if(!picker)continue;picker.innerHTML=sessions.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===selectedSession()?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");picker.onchange=()=>setSelectedSession(picker.value)}
  renderActiveContext();
}

function renderOverview(){
  const session = selectedSession();
  if(!session){$("sessionLabel").textContent="Sign in to load sessions";$("sessionTitle").textContent="Your swimming data is protected in Supabase";$("sessionChips").innerHTML="";$("sessionPurpose").textContent="Open Connection, create an account, and sign in.";$("workoutBoard").textContent="No public roster or session data is bundled into this site.";return;}
  $("sessionLabel").textContent = sessionLabel(session);
  $("sessionTitle").textContent = session.title;
  $("sessionChips").innerHTML = [
    `<span class="chip">${escapeHtml(session.venue)}</span>`,
    ...sessionSquads(session).map(s=>`<span class="chip">${escapeHtml(s)}</span>`),
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
  const rosterIds=new Set(roster.map(a=>a.id));
  const attendance = appState.attendance.filter(a=>a.session_id===session.id&&rosterIds.has(a.athlete_id));
  const here = attendance.filter(a=>a.status==="present"||a.status==="modified").length;
  $("kpiAttendance").textContent = `${here}/${roster.length}`;
  $("kpiCaptures").textContent = appState.captures.filter(c=>c.session_id===session.id).length;
  $("kpiTimed").textContent = appState.timed_sets.filter(t=>t.session_id===session.id).length;
  $("kpiDistance").textContent = `${Number(session.planned_distance||0).toLocaleString()}m`;
}


function nextPlannedSession(session){
  if(!session) return null;
  return appState.sessions
    .filter(s=>`${s.session_date}-${s.day_part}` > `${session.session_date}-${session.day_part}`)
    .sort((a,b)=>a.session_date.localeCompare(b.session_date)||a.day_part.localeCompare(b.day_part))[0] || null;
}
function sessionReview(sessionId){return appState.session_reviews.find(r=>r.session_id===sessionId)||null}
function renderDeck(){
  const session=selectedSession();
  const deckPicker=$("deckSessionPicker");
  if(deckPicker){
    const sessions=appState.sessions.slice().sort((a,b)=>b.session_date.localeCompare(a.session_date)||b.day_part.localeCompare(a.day_part));
    deckPicker.innerHTML=sessions.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===session?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");
    deckPicker.onchange=()=>setSelectedSession(deckPicker.value);
  }
  if(!session){
    $("deckSessionLabel").textContent="Sign in to load sessions";
    $("deckSessionTitle").textContent="Your deck brief is protected in Supabase";
    $("deckSystem").textContent="—";$("deckTechnical").textContent="—";
    $("deckCueChips").innerHTML="";$("deckWorkout").textContent="No session loaded.";
    $("deckNextSession").innerHTML=`<div class="help">Sign in, then select a session.</div>`;
    $("deckSetList").innerHTML=`<div class="help">No session loaded.</div>`;
    $("deckPlanThread").innerHTML="";
    return;
  }
  $("deckSessionLabel").textContent=sessionLabel(session);
  $("deckSessionTitle").textContent=session.title;
  $("deckSystem").textContent=session.primary_system||"—";
  $("deckTechnical").textContent=session.technical_focus||"—";
  $("deckCueChips").innerHTML=[
    `<span class="chip">${escapeHtml(session.venue||"")}</span>`,
    ...sessionSquads(session).map(s=>`<span class="chip">${escapeHtml(s)}</span>`),
    `<span class="chip">${Number(session.planned_distance||0).toLocaleString()}m</span>`,
    `<span class="chip">${session.status==="completed"?"Completed":"Planned"}</span>`
  ].join("");
  $("deckWorkout").textContent=session.workout||"No workout entered.";
  const sets=(session.sets&&session.sets.length?session.sets:extractStructuredSets(session.workout));
  $("deckSetList").innerHTML=sets.length?sets.map((set,index)=>`<div class="deck-set-row">
    <div><strong>${escapeHtml(set.label||`${set.reps} × ${set.distance}`)}</strong><small>${set.reps} × ${set.distance} · ${escapeHtml(set.stroke||"")}${set.cycle?` · on ${escapeHtml(set.cycle)}`:""}</small></div>
    <button type="button" data-run-set="${index}">Run live</button>
  </div>`).join(""):`<div class="help">No repeating sets detected. The full board is still shown above.</div>`;
  document.querySelectorAll('[data-run-set]').forEach(btn=>btn.onclick=()=>runStructuredSet(sets[Number(btn.dataset.runSet)]));
  const previous=appState.sessions.find(s=>s.id===session.previous_session_id)||appState.sessions.filter(s=>`${s.session_date}-${s.day_part}`<`${session.session_date}-${session.day_part}`).sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];
  const previousReview=previous?sessionReview(previous.id):null;
  const next=nextPlannedSession(session);
  $("deckPlanThread").innerHTML=`
    <div class="plan-chain">
      <div class="plan-chain-row"><span>Season</span><strong>${escapeHtml(session.season_name||"Season not linked yet")}</strong></div>
      <div class="plan-chain-row"><span>Week${session.week_start?` · ${escapeHtml(formatDate(session.week_start))}`:""}</span><strong>${escapeHtml(session.week_phase||session.week_objective||"Weekly plan not linked yet")}</strong></div>
      ${session.week_carry_forward?`<div class="plan-chain-row"><span>Carry from last week</span><strong>${escapeHtml(session.week_carry_forward)}</strong></div>`:""}
    </div>
    <div class="plan-thread-row"><span>Carry from last session</span><strong>${escapeHtml(previousReview?.carry_forward||session.plan_cue||"No carry-forward logged yet.")}</strong></div>
    <div class="plan-thread-row"><span>Today’s purpose</span><strong>${escapeHtml(session.primary_system||"—")} · ${escapeHtml(session.technical_focus||"—")}</strong></div>
    <div class="plan-thread-row"><span>Lead into next session</span><strong>${escapeHtml(session.next_session_cue||next?.technical_focus||next?.title||"Next-session cue not entered yet.")}</strong></div>`;
  $("deckNextSession").innerHTML=next
    ? `<strong>${escapeHtml(sessionLabel(next))} — ${escapeHtml(next.title)}</strong><div>${escapeHtml(next.primary_system||"")}</div><div class="help">${escapeHtml(next.technical_focus||"")}</div>`
    : `<div class="warning-box">No later session is entered yet. Add tomorrow's plan on desktop when ready.</div>`;
}
function profileLines(value){
  if(Array.isArray(value)) return value.map(v=>typeof v==="string"?v:(v.label||v.event||JSON.stringify(v))).filter(Boolean).join("\n");
  if(value&&typeof value==="object") return Object.entries(value).map(([k,v])=>`${k}: ${v}`).join("\n");
  return String(value||"");
}
function athleteResultOverview(athleteId){
  return appState.results_athlete_overview.find(row=>row.athlete_id===athleteId)||null;
}
function athleteOfficialPbs(athleteId){
  return appState.results_pb_board
    .filter(row=>row.athlete_id===athleteId)
    .sort((a,b)=>String(a.course).localeCompare(String(b.course))||Number(a.distance)-Number(b.distance)||String(a.stroke).localeCompare(String(b.stroke)));
}
function athleteNzscRows(athlete){
  const rows=appState.nzsc_2026_gap_matrix.filter(row=>row.athlete_id===athlete.id);
  const currentClasses=[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean);
  const paraRows=rows.filter(row=>row.para_class&&currentClasses.includes(row.para_class));
  if(paraRows.length) return paraRows;
  if(!athlete.date_of_birth) return rows;
  const dob=new Date(`${athlete.date_of_birth}T12:00:00`);
  if(Number.isNaN(dob.getTime())) return rows;
  const now=new Date();
  let age=now.getFullYear()-dob.getFullYear();
  const birthdayPassed=(now.getMonth()>dob.getMonth())||(now.getMonth()===dob.getMonth()&&now.getDate()>=dob.getDate());
  if(!birthdayPassed) age--;
  const group=age>=17?"17 & Over":String(age);
  return rows.filter(row=>row.age_group===group);
}
function athleteTargetRows(athlete){
  const rows=appState.scwc_target_gap_matrix.filter(row=>row.athlete_id===athlete.id);
  if(!athlete.date_of_birth) return rows;
  const dob=new Date(`${athlete.date_of_birth}T12:00:00`);
  if(Number.isNaN(dob.getTime())) return rows;
  const now=new Date();
  let age=now.getFullYear()-dob.getFullYear();
  const birthdayPassed=(now.getMonth()>dob.getMonth())||(now.getMonth()===dob.getMonth()&&now.getDate()>=dob.getDate());
  if(!birthdayPassed) age--;
  return rows.filter(row=>{
    if(row.programme==="SCWC Target 2032") return row.age_group===String(Math.min(Math.max(age,13),16));
    if(age<=16) return row.age_group==="16 & Under";
    if(age===17) return row.age_group==="17";
    if(age<=20) return row.age_group==="18-20";
    return row.age_group==="Open";
  });
}
function formatGap(row,label){
  const gap=Number(row.gap_seconds);
  const status=gap<=0?"met":`needs ${gap.toFixed(2)}s`;
  return `${label} ${row.distance} ${row.stroke} — ${row.pb_time} / ${row.qualifying_time_text||row.target_time_text} (${status})`;
}

function athleteHistory(athleteId){return appState.results_event_history.filter(r=>r.athlete_id===athleteId).sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||"")))}
function athleteCwscHistory(athleteId){return athleteHistory(athleteId).filter(r=>/SCWC|Canterbury West Coast|Canterbury SC/i.test(String(r.meet_name||"")))}
function athleteNationalHistory(athleteId){return athleteHistory(athleteId).filter(r=>/New Zealand|NZSC|NZ Opens|NAGS|Division II|Secondary School/i.test(String(r.meet_name||"")))}
function athleteRecordRows(athlete){
  const rows=(appState.results_record_gaps||[]).filter(r=>r.athlete_id===athlete.id);
  if(rows.length)return rows.sort((a,b)=>Number(a.gap_seconds??999999)-Number(b.gap_seconds??999999));
  return [];
}
function compactRaceRows(rows,empty){return rows.length?rows.slice(0,8).map(r=>`<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.result_time_text||r.pb_time||"—")}</strong><span>${escapeHtml(r.meet_name||r.programme||"")}${r.result_date?` · ${escapeHtml(resultDateLabel(r.result_date))}`:""}${r.official_place?` · place ${escapeHtml(r.official_place)}`:""}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`}
function compactGapRows(rows,empty){return rows.length?rows.slice(0,8).map(r=>`<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.pb_time||"—")}</strong><span>${escapeHtml(r.programme||r.age_group||r.para_class||"")} · ${Number(r.gap_seconds)<=0?`met by ${Math.abs(Number(r.gap_seconds)).toFixed(2)}s`:`needs ${Number(r.gap_seconds).toFixed(2)}s`}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`}
function compactRecordRows(athlete){
  const rows=athleteRecordRows(athlete);
  if(rows.length)return rows.slice(0,10).map(r=>`<div class="mini-result"><strong>${escapeHtml(r.record_scope||r.programme||"Record")} · ${escapeHtml(r.distance)} ${escapeHtml(r.stroke)}</strong><span>PB ${escapeHtml(r.pb_time||"—")} · record ${escapeHtml(r.record_time_text||r.record_time||"—")}${r.gap_seconds!==undefined?` · ${Number(r.gap_seconds)<=0?"record matched/better":`${Number(r.gap_seconds).toFixed(2)}s away`}`:""}</span></div>`).join("");
  const manual=profileLines(athlete.records_summary);return manual?`<div class="mini-result"><strong>Coach record notes</strong><span>${escapeHtml(manual)}</span></div>`:'<div class="help">No matching record rows loaded yet.</div>';
}
function renderAthleteResultsHub(athlete){
  const hub=$("athleteResultsHub");if(!hub||!athlete)return;
  $("athleteResultsHubTitle").textContent=`${athlete.full_name} · results, pathway and records`;
  const pbs=athleteOfficialPbs(athlete.id),cwsc=athleteCwscHistory(athlete.id),nationals=athleteNationalHistory(athlete.id),nzsc=athleteNzscRows(athlete).sort((a,b)=>Number(a.gap_seconds)-Number(b.gap_seconds)),targets=athleteTargetRows(athlete).sort((a,b)=>Number(a.gap_seconds)-Number(b.gap_seconds));
  hub.innerHTML=`<div class="athlete-hub-grid">
    <section class="athlete-hub-section"><h4>Official PBs</h4>${compactRaceRows(pbs.map(r=>({...r,result_time_text:r.pb_time,result_date:r.pb_date})),"No official PBs loaded.")}</section>
    <section class="athlete-hub-section"><h4>CWSC</h4>${compactRaceRows(cwsc,"No CWSC championship results loaded.")}${compactGapRows(targets,"No SCWC target rows.")}</section>
    <section class="athlete-hub-section"><h4>Nationals</h4>${compactRaceRows(nationals,"No national-meet results loaded.")}${compactGapRows(nzsc,"No NZSC qualifying rows.")}</section>
    <section class="athlete-hub-section"><h4>Records</h4>${compactRecordRows(athlete)}</section>
  </div>`;
}

function athleteQuickHtml(athlete){
  if(!athlete)return `<div class="help">Choose a swimmer.</div>`;
  const recentSet=appState.timed_sets.filter(t=>t.athlete_id===athlete.id).sort(byUpdated)[0];
  const recentCapture=appState.captures.filter(c=>c.athlete_id===athlete.id&&c.text_content).sort(byUpdated)[0];
  const pace=athlete.legacy_pace;
  const overview=athleteResultOverview(athlete.id);
  const pbs=athleteOfficialPbs(athlete.id);
  const nzsc=athleteNzscRows(athlete).sort((a,b)=>Number(a.gap_seconds)-Number(b.gap_seconds));
  const targets=athleteTargetRows(athlete).sort((a,b)=>Number(a.gap_seconds)-Number(b.gap_seconds));
  const nextMeet=athlete.next_meet_name?`${athlete.next_meet_name}${athlete.next_meet_date?` · ${formatDate(athlete.next_meet_date)}`:""}`:"Not loaded";
  const pbText=pbs.length
    ? pbs.slice(0,10).map(row=>`${row.course} ${row.distance} ${row.stroke} — ${row.pb_time}`).join("\n")
    : profileLines(athlete.pb_summary)||"Not loaded";
  const gapLines=[
    ...nzsc.slice(0,5).map(row=>formatGap(row,`NZSC${row.para_class?` ${row.para_class}`:row.age_group?` ${row.age_group}`:""}`)),
    ...targets.slice(0,3).map(row=>formatGap(row,`${row.programme.replace("SCWC ","")} ${row.age_group||""}`.trim()))
  ];
  const gapText=gapLines.length?gapLines.join("\n"):profileLines(athlete.qualifying_summary)||"Not loaded";
  const classification=[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean).join(" / ");
  return `
    <div class="deck-answer-row"><span>Squad / primary events</span><strong>${escapeHtml(athlete.squad||"—")}${(athlete.primary_events||[]).length?` · ${escapeHtml(athlete.primary_events.join(", "))}`:""}</strong></div>
    ${classification?`<div class="deck-answer-row"><span>Current classification</span><strong>${escapeHtml(classification)}</strong></div>`:""}
    <div class="deck-answer-row"><span>Official results</span><strong>${overview?`${overview.official_result_count||0} races · ${overview.personal_best_count||0} PBs${overview.latest_meet?` · latest ${escapeHtml(overview.latest_meet)}`:""}`:"Not loaded"}</strong></div>
    <div class="deck-answer-row"><span>Current plan focus</span><strong>${escapeHtml(athlete.current_focus||athlete.technical_focus||"Not entered yet.")}</strong></div>
    <div class="deck-answer-row"><span>Next meet</span><strong>${escapeHtml(nextMeet)}</strong></div>
    <div class="deck-answer-row"><span>Official PBs</span><strong class="profile-lines">${escapeHtml(pbText)}</strong></div>
    <div class="deck-answer-row"><span>Standards / gaps</span><strong class="profile-lines">${escapeHtml(gapText)}</strong></div>
    <div class="deck-answer-row"><span>Relevant records</span><strong class="profile-lines">${escapeHtml(athleteRecordRows(athlete).slice(0,4).map(r=>`${r.record_scope||r.programme||"Record"} ${r.distance} ${r.stroke}: ${r.record_time_text||r.record_time||"—"}`).join("\n")||profileLines(athlete.records_summary)||"Not loaded")}</strong></div>
    <div class="deck-answer-row"><span>Planned adaptations</span><strong>${escapeHtml(athlete.modifications||"None entered")}</strong></div>
    <div class="deck-answer-row"><span>Latest timed set</span><strong>${recentSet?`${escapeHtml(recentSet.set_label||"Timed set")} · best ${formatSeconds(recentSet.best)} · avg ${formatSeconds(recentSet.average)}`:"No timed set saved yet."}</strong></div>
    <div class="deck-answer-row"><span>Legacy pace reference</span><strong>${pace?`T400 ${escapeHtml(pace.t400)} · AT100 ${escapeHtml(pace.at_100_10)}`:"No confirmed pace reference."}</strong></div>
    <div class="deck-answer-row"><span>Latest note</span><strong>${recentCapture?escapeHtml(recentCapture.text_content):"No athlete note saved yet."}</strong></div>`;
}
function renderDeckAthleteBrief(){
  const roster=selectedRoster();
  let id=appState.settings.selected_athlete_id;
  if(!roster.some(a=>a.id===id))id=roster[0]?.id||"";
  appState.settings.selected_athlete_id=id;
  const select=$("deckAthlete");if(select){select.innerHTML=roster.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===id?"selected":""}>${escapeHtml(a.full_name)}</option>`).join("");select.value=id}
  const buttons=$("deckAthleteButtons");if(buttons){buttons.innerHTML=roster.map(a=>`<button type="button" class="${a.id===id?"active":""}" data-deck-athlete="${escapeHtml(a.id)}">${escapeHtml(a.full_name)}</button>`).join("")||'<span class="help">No swimmers in active squad.</span>';buttons.querySelectorAll("[data-deck-athlete]").forEach(b=>b.onclick=()=>selectAthleteEverywhere(b.dataset.deckAthlete))}
  const athlete=appState.athletes.find(a=>a.id===id);
  $("deckAthleteBrief").innerHTML=athleteQuickHtml(athlete);
}
function runStructuredSet(set){
  if(!set)return;
  showView("times");
  $("liveSetLabel").value=set.label||`${set.reps} x ${set.distance}`;
  $("liveReps").value=set.reps||1;
  $("liveDistance").value=String(set.distance||50);
  $("liveStroke").value=[...$("liveStroke").options].some(o=>o.value===set.stroke)?set.stroke:"Freestyle";
  if(set.cycle)$("liveCycle").value=set.cycle;
  $("timeLabel").value=$("liveSetLabel").value;
  $("timeSendoff").value=set.cycle||"";
  resetLiveSet();renderLiveBoard();
}


$("pasteSessionBtn").addEventListener("click",async()=>{
  try{$("sessionPasteInput").value=await navigator.clipboard.readText();updateStatus("Session pasted","good")}
  catch{updateStatus("Clipboard blocked — press and hold to paste","error")}
});
$("parseSessionBtn").addEventListener("click",()=>{
  try{
    importedSessionDraft=parseSessionFromChat($("sessionPasteInput").value);
    renderSessionImportPreview();
    $("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;
    updateStatus("Session picked up — check preview","good");
  }catch(error){updateStatus(error.message,"error")}
});
$("saveImportedSessionBtn").addEventListener("click",()=>saveImportedSession(false));
$("runImportedSessionBtn").addEventListener("click",()=>saveImportedSession(true));

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

let fastSyncTimer=null;
function scheduleFastSync(){clearTimeout(fastSyncTimer);fastSyncTimer=setTimeout(()=>syncIfPossible(),700)}
function attendanceRecord(session,athleteId,status){
  const existing=attendanceFor(session.id,athleteId);const record={id:existing?.id||attendanceId(session.id,athleteId),session_id:session.id,athlete_id:athleteId,status,note:existing?.note||"",updated_at:nowIso()};upsertLocal("attendance",record);queueRecord("attendance",record.id);saveState(appState);scheduleFastSync();return record;
}
function renderAttendance(){
  const session=selectedSession();if(!session)return;
  $("attendanceHeading").textContent=`${sessionLabel(session)} · ${session.venue} · ${activeSquad()||sessionSquads(session).join(" + ")}`;
  const roster=selectedRoster();
  $("attendanceList").innerHTML=roster.map(a=>{const value=attendanceFor(session.id,a.id)?.status||"";return `<div class="attendance-row ${value==="present"||value==="modified"?"":"unmarked"}" data-athlete-id="${escapeHtml(a.id)}"><strong>${escapeHtml(a.full_name)}</strong><div class="attendance-buttons"><button type="button" class="attendance-choice ${value==="present"?"active":""}" data-status="present">Here</button><button type="button" class="attendance-choice ${value==="modified"?"active":""}" data-status="modified">Modified</button><span class="attendance-default">${value==="present"||value==="modified"?"":"Absent"}</span></div></div>`}).join("")||'<div class="help">No swimmers in the active squad.</div>';
  document.querySelectorAll(".attendance-choice").forEach(button=>button.onclick=()=>{const row=button.closest(".attendance-row"),group=button.closest(".attendance-buttons"),already=button.classList.contains("active"),status=already?"absent":button.dataset.status;group.querySelectorAll(".attendance-choice").forEach(b=>b.classList.toggle("active",!already&&b===button));row.classList.toggle("unmarked",status==="absent");const label=group.querySelector(".attendance-default");if(label)label.textContent=status==="absent"?"Absent":"";attendanceRecord(session,row.dataset.athleteId,status)});
}
function setActiveRosterAttendance(status){const session=selectedSession();if(!session)return;for(const athlete of selectedRoster())attendanceRecord(session,athlete.id,status);renderAttendance();updateStatus(status==="present"?"Active squad marked here":"Active squad cleared","good")}
if($("markAllPresentBtn"))$("markAllPresentBtn").addEventListener("click",()=>setActiveRosterAttendance("present"));
if($("clearAttendanceBtn"))$("clearAttendanceBtn").addEventListener("click",()=>setActiveRosterAttendance("absent"));

$("saveAttendanceBtn").addEventListener("click",async()=>{
  const session = selectedSession();
  const updatedAt = nowIso();

  document.querySelectorAll(".attendance-row[data-athlete-id]").forEach(row=>{
    const athleteId = row.dataset.athleteId;
    const active = row.querySelector(".attendance-choice.active");
    const status = active?.dataset.status || "absent";
    const existing = attendanceFor(session.id,athleteId);

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

function populateAthleteSelect(selectId,includeGroup=false){const select=$(selectId);if(!select)return;const roster=selectedRoster(),current=select.value||appState.settings.selected_athlete_id;select.innerHTML=(includeGroup?'<option value="">Whole active squad</option>':'')+roster.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===current?"selected":""}>${escapeHtml(a.full_name)}</option>`).join("");if(!includeGroup&&roster.length&&!select.value)select.value=roster[0].id}
$("saveTextCaptureBtn").addEventListener("click",async()=>{
  const text = $("captureText").value.trim();
  if(!text){ alert("Add a note first."); return; }
  const record = {
    id:uid("capture"),
    session_id:selectedSession().id,
    athlete_id:$("captureAthlete").value || null,
    capture_type:"text",
    text_content:`[${$("captureCategory").value}]${v33CaptureBlockPrefix()} ${text}`,
    session_block_id:$("captureBlock")?.value||null,
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
        text_content:`Voice note${v33CaptureBlockPrefix()}`,session_block_id:$("captureBlock")?.value||null,
        media_path:null,media_local_id:localId,mime_type:blob.type,created_at:nowIso(),updated_at:nowIso()
      };
      upsertLocal("captures",record);queueRecord("captures",record.id);saveState(appState);
      const url=URL.createObjectURL(blob);$("voicePreview").src=url;$("voicePreview").hidden=false;
      stream.getTracks().forEach(t=>t.stop());
      updateStatus("Voice note saved · preparing transcription");
      await syncIfPossible();renderCaptures();renderOverview();
      await v34CreateVoiceTranscription(record,true);
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
  updateStatus("Voice note saved · transcribing…");
});
async function saveFileCapture(file,kind){
  if(!file) return;
  const localId = await saveMediaBlob(file,kind,file.name);
  const record = {
    id:uid("capture"),session_id:selectedSession().id,
    athlete_id:$("captureAthlete").value||null,capture_type:kind,
    text_content:`${kind==="photo"?"Poolside photo":"Poolside video"}${v33CaptureBlockPrefix()}`,
    session_block_id:$("captureBlock")?.value||null,
    media_path:null,media_local_id:localId,mime_type:file.type,
    created_at:nowIso(),updated_at:nowIso()
  };
  upsertLocal("captures",record);queueRecord("captures",record.id);saveState(appState);
  await syncIfPossible();renderCaptures();renderOverview();
}
$("photoInput").addEventListener("change",async e=>{await saveFileCapture(e.target.files?.[0],"photo");e.target.value=""});
$("videoInput").addEventListener("change",async e=>{await saveFileCapture(e.target.files?.[0],"video");e.target.value=""});


function parseEvidenceMap(text){
  const out={};String(text||"").split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).forEach(part=>{
    const m=part.match(/^(.+?)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*(%|m|min)?$/i);
    if(m)out[m[1].trim()]={value:Number(m[2]),unit:m[3]||""};else out[part]={value:null,unit:""};
  });return out;
}
function evidenceMapText(map){
  if(!map||typeof map!=="object")return "";
  return Object.entries(map).map(([k,v])=>`${k} ${v&&typeof v==="object"&&v.value!==null?v.value:""}${v?.unit||""}`.trim()).join(", ");
}
function renderReview(){
  const session=selectedSession();const review=sessionReview(session?.id)||{};
  if($("finishSessionHeading"))$("finishSessionHeading").innerHTML=session?`<strong>${escapeHtml(sessionLabel(session))} — ${escapeHtml(session.title)}</strong><div class="help">Planned ${Number(session.planned_distance||0).toLocaleString()}m · ${escapeHtml(session.primary_system||"")}</div>`:"";
  const values={reviewWentWell:review.went_well,reviewReinforce:review.reinforce,reviewAthletes:review.athlete_notes,reviewCarry:review.carry_forward,finishActualDistance:review.actual_distance,finishActualDuration:review.actual_duration,finishEnergySystems:evidenceMapText(review.energy_systems),finishTrainingModes:evidenceMapText(review.training_modes),finishStrokeExposure:evidenceMapText(review.stroke_exposure),finishAthleteResponse:review.athlete_response,finishModifications:review.modifications,finishRaceEvidence:review.race_split_evidence};
  Object.entries(values).forEach(([id,val])=>{if($(id))$(id).value=val||""});
  if($("finishResult"))$("finishResult").textContent=review.completed_at?`Completed ${new Date(review.completed_at).toLocaleString("en-NZ")}`:"Not completed yet.";
}
async function saveFinishSession(){
  const session=selectedSession();if(!session)return;
  const existing=sessionReview(session.id);
  const record={
    id:existing?.id||`review-${session.id}`,session_id:session.id,
    went_well:$("reviewWentWell").value.trim(),reinforce:$("reviewReinforce").value.trim(),athlete_notes:$("reviewAthletes").value.trim(),carry_forward:$("reviewCarry").value.trim(),
    actual_distance:Number($("finishActualDistance").value||0),actual_duration:Number($("finishActualDuration").value||0),
    energy_systems:parseEvidenceMap($("finishEnergySystems").value),training_modes:parseEvidenceMap($("finishTrainingModes").value),stroke_exposure:parseEvidenceMap($("finishStrokeExposure").value),
    athlete_response:$("finishAthleteResponse").value.trim(),modifications:$("finishModifications").value.trim(),race_split_evidence:$("finishRaceEvidence").value.trim(),
    completed_at:nowIso(),updated_at:nowIso()
  };
  upsertLocal("session_reviews",record);queueRecord("session_reviews",record.id);
  session.status="completed";session.updated_at=nowIso();queueRecord("sessions",session.id);saveState(appState);
  await syncIfPossible();renderAll();showView("deck");updateStatus("Session completed and synced","good");
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

const LIVE_CHANNEL_COUNT=0;
let liveRunning=false;
let liveStartedAt=0;
let liveAccumulated=0;
let liveAnimation=null;
let liveChannels=[];
function v31TimingSeed(athlete){
  const test=typeof selectedTestSet==="function"?selectedTestSet():null;
  if(test){const attempts=(appState.test_set_attempts||[]).filter(a=>a.athlete_id===athlete.id&&a.test_set_id===test.id);const attemptTimes=attempts.flatMap(a=>Array.isArray(a.times)?a.times:[]).map(Number).filter(Number.isFinite);if(attemptTimes.length)return Math.min(...attemptTimes);const course=v3Course(selectedSession()?.pool_course||"SCM");const pb=athleteOfficialPbs(athlete.id).find(r=>r.course===course&&Number(r.distance)===Number(test.distance)&&v3Stroke(r.stroke)===v3Stroke(test.stroke));if(pb?.result_seconds)return Number(pb.result_seconds)}
  const pace=Number(athlete.legacy_pace);return Number.isFinite(pace)&&pace>0?pace:null;
}
function timingRoster(){const session=selectedSession(),roster=selectedRoster();const marked=appState.attendance.filter(a=>a.session_id===session?.id&&roster.some(r=>r.id===a.athlete_id));const here=new Set(marked.filter(a=>a.status==="present"||a.status==="modified").map(a=>a.athlete_id));const active=here.size?roster.filter(a=>here.has(a.id)):roster;return active.sort((a,b)=>{const lane=v3LaneAssignment(session?.id,a)-v3LaneAssignment(session?.id,b);if(lane)return lane;const sa=v31TimingSeed(a),sb=v31TimingSeed(b);if(sa!==null&&sb!==null&&sa!==sb)return sa-sb;if(sa!==null&&sb===null)return -1;if(sa===null&&sb!==null)return 1;return Number(a.timing_order||999)-Number(b.timing_order||999)||a.full_name.localeCompare(b.full_name)})}
function resetLiveRoster(){if(liveRunning)return;liveChannels=[];const grid=$("liveChannelGrid");if(grid){grid.innerHTML="";grid.dataset.rosterKey=""}}
function timingLaneLabel(athlete){return String(athlete?.training_lane||"Unassigned").trim()||"Unassigned"}
function applyLaneOffsets(gap=Number($("liveWaveGap")?.value)||0){const lanes=[];for(const channel of liveChannels){const athlete=appState.athletes.find(a=>a.id===channel.athlete_id),lane=timingLaneLabel(athlete);if(!lanes.includes(lane))lanes.push(lane);channel.offset=lanes.indexOf(lane)*gap}}
function ensureLiveChannels(){const roster=timingRoster();const previous=new Map(liveChannels.map(c=>[c.athlete_id,c]));liveChannels=roster.map((a,index)=>{const old=previous.get(a.id);return old?{...old,index}:{index,athlete_id:a.id,offset:0,cycle:"",finishes:[],splits:{},lastRep:0}});if(!liveChannels.some(c=>c.finishes.length||Number(c.offset)>0))applyLaneOffsets();const lanes=[...new Set(roster.map(timingLaneLabel))];const summary=$("timingRosterSummary");if(summary)summary.textContent=`${activeSquad()||"Session"}: ${roster.length} swimmers · ${lanes.length} lane/group${lanes.length===1?"":"s"}`;return roster}
function liveElapsedMs(){return liveAccumulated+(liveRunning?performance.now()-liveStartedAt:0)}
function liveMasterCycle(){return parseTime($("liveCycle")?.value||"")||60}
function liveReps(){return Math.max(1,Number($("liveReps")?.value)||1)}
function liveChannelCycle(channel){return parseTime(channel.cycle)||liveMasterCycle()}
function liveChannelState(channel){
  const elapsed=liveElapsedMs()/1000;
  const cycle=liveChannelCycle(channel);
  const since=elapsed-channel.offset;
  if(since<0) return {started:false,rep:1,time:since,next:-since,cycle};
  const rep=Math.floor(since/cycle)+1;
  const time=since-(rep-1)*cycle;
  return {started:true,rep,time,next:cycle-time,cycle};
}
function renderLiveChannels(){
  const grid=$("liveChannelGrid");if(!grid)return;const roster=ensureLiveChannels();
  const rosterKey=roster.map(a=>`${a.id}:${timingLaneLabel(a)}`).join("|");
  const needsBuild=grid.dataset.rosterKey!==rosterKey||grid.querySelectorAll("[data-live-channel]").length!==liveChannels.length;
  if(needsBuild){
    const grouped=new Map();
    liveChannels.forEach((channel,index)=>{const athlete=appState.athletes.find(a=>a.id===channel.athlete_id),lane=timingLaneLabel(athlete);if(!grouped.has(lane))grouped.set(lane,[]);grouped.get(lane).push({channel,index,athlete})});
    grid.innerHTML=[...grouped.entries()].sort((a,b)=>v3LaneNumberFromLabel(a[0])-v3LaneNumberFromLabel(b[0])).map(([lane,items])=>`<section class="timing-lane-group" data-offset="${items[0]?.channel?.offset?`Start +${items[0].channel.offset}s`:"Start 0s"}"><div class="timing-lane-head"><strong>${lane==="Unassigned"?"Unassigned":escapeHtml(lane)}</strong><span>${items.length} swimmer${items.length===1?"":"s"}</span></div><div class="timing-lane-swimmers">${items.map(({channel,index,athlete})=>`<article class="live-channel" data-live-channel="${index}"><div class="live-channel-head"><div><div class="live-athlete-name">${escapeHtml(athlete?.full_name||`Swimmer ${index+1}`)}</div><div class="live-athlete-sub">${escapeHtml(athlete?.timing_order?`Order ${athlete.timing_order}`:activeSquad())}</div></div><span class="chip live-rep-chip">Rep 1/${liveReps()}</span></div><div class="live-channel-meta"><div><label>Cycle</label><input class="large-input live-cycle" data-field="cycle" inputmode="decimal" placeholder="Master" value="${escapeHtml(channel.cycle)}"></div><div><label>Wave offset</label><input class="large-input live-offset" data-field="offset" type="number" min="0" max="120" value="${channel.offset}"></div></div><div class="live-channel-clock">0.0</div><div class="live-channel-actions"><button class="secondary live-split" disabled>Split</button><button class="live-finish" disabled>Finish</button></div><div class="live-channel-log"><span>No times yet.</span></div></article>`).join("")}</div></section>`).join("")||'<div class="warning-box">No swimmers are loaded for this active squad. Check the session squad and attendance.</div>';
    grid.dataset.rosterKey=rosterKey;
    liveChannels.forEach((channel,index)=>{const card=grid.querySelector(`[data-live-channel="${index}"]`);if(!card)return;const cycle=card.querySelector('[data-field="cycle"]');cycle.onchange=()=>{channel.cycle=cycle.value.trim();renderLiveBoard()};const offset=card.querySelector('[data-field="offset"]');offset.onchange=()=>{channel.offset=Math.max(0,Number(offset.value)||0);renderLiveBoard()};card.querySelector('.live-split').onclick=()=>recordLiveSplit(index);card.querySelector('.live-finish').onclick=()=>recordLiveFinish(index)});
  }
  liveChannels.forEach((channel,index)=>{const state=liveChannelState(channel),card=grid.querySelector(`[data-live-channel="${index}"]`);if(!card)return;card.classList.toggle("active",state.started&&state.rep<=liveReps());card.querySelector('.live-rep-chip').textContent=`Rep ${Math.min(state.rep,liveReps())}/${liveReps()}`;card.querySelector('.live-channel-clock').textContent=state.started?formatSeconds(state.time):`-${formatSeconds(-state.time)}`;card.querySelector('.live-split').disabled=!liveRunning||!state.started||state.rep>liveReps();card.querySelector('.live-finish').disabled=!liveRunning||!state.started||state.rep>liveReps();const log=channel.finishes.map(f=>`<div><strong>R${f.rep}</strong> ${formatSeconds(f.time)}${(channel.splits[f.rep]||[]).length?` · splits ${(channel.splits[f.rep]||[]).map(formatSeconds).join(', ')}`:''}</div>`).join('');card.querySelector('.live-channel-log').innerHTML=log||'<span>No times yet.</span>';const cycle=card.querySelector('[data-field="cycle"]');if(document.activeElement!==cycle&&cycle.value!==channel.cycle)cycle.value=channel.cycle;const offset=card.querySelector('[data-field="offset"]');if(document.activeElement!==offset&&Number(offset.value)!==channel.offset)offset.value=channel.offset});
}
function renderLiveBoard(){
  const elapsed=liveElapsedMs()/1000;
  const cycle=liveMasterCycle();
  const reps=liveReps();
  const rep=Math.floor(elapsed/cycle)+1;
  const inRep=elapsed-(rep-1)*cycle;
  if($("liveElapsed")) $("liveElapsed").textContent=formatSeconds(elapsed);
  if($("liveRep")) $("liveRep").textContent=`${Math.min(rep,reps)} / ${reps}`;
  if($("liveCountdown")) $("liveCountdown").textContent=rep>reps?"Complete":formatSeconds(Math.max(0,cycle-inRep));
  if($("liveSetStatus")) $("liveSetStatus").textContent=liveRunning?"Running":elapsed>0?"Paused":"Ready";
  renderLiveChannels();
  if(liveRunning) liveAnimation=requestAnimationFrame(renderLiveBoard);
}
function recordLiveSplit(index){
  const channel=liveChannels[index],state=liveChannelState(channel);
  if(!state.started||state.rep>liveReps())return;
  channel.splits[state.rep]=channel.splits[state.rep]||[];
  channel.splits[state.rep].push(state.time);
  renderLiveBoard();
}
function recordLiveFinish(index){
  const channel=liveChannels[index],state=liveChannelState(channel);
  if(!state.started||state.rep>liveReps())return;
  const existing=channel.finishes.find(f=>f.rep===state.rep);
  if(existing) existing.time=state.time; else channel.finishes.push({rep:state.rep,time:state.time});
  channel.lastRep=state.rep;
  $("liveSaveBtn").disabled=!liveChannels.some(c=>c.finishes.length&&c.athlete_id);
  renderLiveBoard();
}
function resetLiveSet(){
  liveRunning=false;liveStartedAt=0;liveAccumulated=0;
  if(liveAnimation)cancelAnimationFrame(liveAnimation);
  liveChannels.forEach(c=>{c.finishes=[];c.splits={};c.lastRep=0});
  $("liveStartBtn").disabled=false;$("livePauseBtn").disabled=true;$("livePauseBtn").textContent="Pause";$("liveSaveBtn").disabled=true;
  releaseWakeLock();renderLiveBoard();
}
async function saveLiveResults(){
  const session=selectedSession();if(!session)return;
  let saved=0;
  const label=$("liveSetLabel").value.trim()||`${liveReps()} x ${$("liveDistance").value}`;
  for(const channel of liveChannels){
    if(!channel.athlete_id||!channel.finishes.length)continue;
    const times=channel.finishes.slice().sort((a,b)=>a.rep-b.rep).map(f=>f.time);
    const cycle=liveChannelCycle(channel);
    const athlete=appState.athletes.find(a=>a.id===channel.athlete_id);
    const testSetId=$("liveTestSet")?.value||null;
    const attemptId=testSetId?uid("attempt"):null;
    const timed={
      id:uid("timed"),session_id:session.id,athlete_id:channel.athlete_id,
      distance:Number($("liveDistance").value),stroke:$("liveStroke").value,
      set_label:`${label} · ${timingLaneLabel(athlete)}`,
      send_off:formatSeconds(cycle),times,average:times.reduce((a,b)=>a+b,0)/times.length,
      best:Math.min(...times),spread:Math.max(...times)-Math.min(...times),
      lane_number:v3LaneAssignment(session.id,athlete),test_set_id:testSetId,test_set_attempt_id:attemptId,
      created_at:nowIso(),updated_at:nowIso()
    };
    upsertLocal("timed_sets",timed);queueRecord("timed_sets",timed.id);
    if(testSetId){
      const attempt={id:attemptId,test_set_id:testSetId,session_id:session.id,athlete_id:channel.athlete_id,lane_number:timed.lane_number,times,metrics:{average:timed.average,best:timed.best,spread:timed.spread},notes:"",created_at:nowIso(),updated_at:nowIso()};
      upsertLocal("test_set_attempts",attempt);queueRecord("test_set_attempts",attempt.id);
    }
    const detail=channel.finishes.slice().sort((a,b)=>a.rep-b.rep).map(f=>{
      const splits=(channel.splits[f.rep]||[]).map(formatSeconds).join(", ");
      return `Rep ${f.rep}: ${formatSeconds(f.time)}${splits?` | splits ${splits}`:""}`;
    }).join("\n");
    const capture={id:uid("capture"),session_id:session.id,athlete_id:channel.athlete_id,capture_type:"text",text_content:`${label} · ${timingLaneLabel(appState.athletes.find(a=>a.id===channel.athlete_id))}\nCycle ${formatSeconds(cycle)} · offset ${channel.offset}s\n${detail}`,media_path:"",mime_type:"",created_at:nowIso(),updated_at:nowIso()};
    upsertLocal("captures",capture);queueRecord("captures",capture.id);saved++;
  }
  if(!saved){updateStatus("No finish times recorded yet","error");return}
  saveState(appState);await syncIfPossible();updateStatus(`${saved} swimmer result${saved===1?"":"s"} saved`,"good");renderAll();
}
function bindLiveSet(){
  if(!$("liveStartBtn"))return;
  $("liveStartBtn").onclick=async()=>{if(liveRunning)return;liveRunning=true;liveStartedAt=performance.now();$("liveStartBtn").disabled=true;$("livePauseBtn").disabled=false;await keepScreenAwake();renderLiveBoard()};
  $("livePauseBtn").onclick=async()=>{if(liveRunning){liveAccumulated+=performance.now()-liveStartedAt;liveRunning=false;if(liveAnimation)cancelAnimationFrame(liveAnimation);$("livePauseBtn").textContent="Resume";await releaseWakeLock();renderLiveBoard()}else{liveRunning=true;liveStartedAt=performance.now();$("livePauseBtn").textContent="Pause";await keepScreenAwake();renderLiveBoard()}};
  $("liveResetBtn").onclick=resetLiveSet;
  $("liveSaveBtn").onclick=saveLiveResults;
  $("applyWaveGapBtn").onclick=()=>{applyLaneOffsets(Number($("liveWaveGap").value)||0);if($("liveChannelGrid"))$("liveChannelGrid").dataset.rosterKey="";renderLiveBoard()};if($("reloadTimingRosterBtn"))$("reloadTimingRosterBtn").onclick=()=>{resetLiveRoster();renderLiveBoard()};
  ["liveCycle","liveReps"].forEach(id=>$(id).addEventListener("change",renderLiveBoard));
  renderLiveBoard();
}

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
  const sorted=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`));
  $("sessionList").innerHTML=sorted.map(s=>`<div class="session-list-item ${s.id===selectedSession()?.id?"active":""}"><strong>${escapeHtml(sessionLabel(s))}</strong><div>${escapeHtml(s.title)}</div><div class="list-meta">${escapeHtml(s.venue)} · ${sessionSquads(s).map(escapeHtml).join(" + ")} · ${Number(s.planned_distance||0).toLocaleString()}m${s.season_name?` · ${escapeHtml(s.season_name)}`:""}${s.week_phase?` · ${escapeHtml(s.week_phase)}`:""}</div><div class="session-list-actions"><button type="button" data-use-session="${escapeHtml(s.id)}">Use</button><button type="button" class="secondary" data-edit-session="${escapeHtml(s.id)}">Edit</button><button type="button" class="danger-button" data-delete-session="${escapeHtml(s.id)}">Delete</button></div></div>`).join("");
  document.querySelectorAll("[data-use-session]").forEach(el=>el.onclick=()=>setSelectedSession(el.dataset.useSession));
  document.querySelectorAll("[data-edit-session]").forEach(el=>el.onclick=()=>{const session=appState.sessions.find(s=>s.id===el.dataset.editSession);showView("sessions");fillSessionEditor(session)});
  document.querySelectorAll("[data-delete-session]").forEach(el=>el.onclick=()=>deleteSession(el.dataset.deleteSession));
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
  $("editSessionSeason").value=session?.season_name||"";$("editSessionWeekStart").value=session?.week_start||"";$("editSessionWeekPhase").value=session?.week_phase||"";$("editSessionWeekObjective").value=session?.week_objective||"";$("editSessionWeekCarry").value=session?.week_carry_forward||"";
  $("editSessionPlanCue").value=session?.plan_cue||"";$("editSessionNextCue").value=session?.next_session_cue||"";
  $("editSessionWorkout").value=session?.workout||"";
}
async function deleteSession(id){const session=appState.sessions.find(s=>s.id===id);if(!session||!confirm(`Delete ${sessionLabel(session)} — ${session.title}?`))return;appState.sessions=appState.sessions.filter(s=>s.id!==id);for(const table of ["attendance","captures","timed_sets","session_reviews","session_lane_assignments","test_set_attempts"])appState[table]=appState[table].filter(r=>r.session_id!==id);queueDelete("sessions",id);if(appState.settings.selected_session_id===id){const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];appState.settings.selected_session_id=next?.id||"";appState.settings.selected_squad=sessionSquads(next)[0]||""}saveState(appState);await syncIfPossible();fillSessionEditor(selectedSession());renderAll();updateStatus("Session deleted","good")}
$("newSessionBtn").addEventListener("click",()=>{if(window.matchMedia("(max-width: 980px)").matches)v33OpenSessionComposer();else fillSessionEditor(null)});
if($("deleteSessionBtn"))$("deleteSessionBtn").addEventListener("click",()=>{const id=$("editSessionId").value;if(id)deleteSession(id)});
$("saveSessionBtn").addEventListener("click",async()=>{
  const existing=appState.sessions.find(s=>s.id===$("editSessionId").value);
  const linkedSeason=appState.season_plans.find(s=>s.id===$("editSessionSeasonPlan")?.value);
  const linkedWeek=appState.weekly_plans.find(w=>w.id===$("editSessionWeeklyPlan")?.value);
  const record={
    id:existing?.id||uid("session"),session_date:$("editSessionDate").value,day_part:$("editSessionPart").value,
    venue:$("editSessionVenue").value.trim(),title:$("editSessionTitle").value.trim(),
    squads:$("editSessionSquads").value.split(",").map(x=>x.trim()).filter(Boolean),
    planned_distance:Number($("editSessionDistance").value||0),primary_system:$("editSessionSystem").value.trim(),
    technical_focus:$("editSessionTechnical").value.trim(),season_plan_id:$("editSessionSeasonPlan")?.value||null,weekly_plan_id:$("editSessionWeeklyPlan")?.value||null,lane_count:Math.max(1,Math.min(12,Number($("editSessionLaneCount")?.value||1))),pool_course:$("editSessionPoolCourse")?.value||"SCM",season_name:linkedSeason?.name||$("editSessionSeason").value.trim(),
    week_start:linkedWeek?.week_start||$("editSessionWeekStart").value||null,week_phase:linkedWeek?.phase||$("editSessionWeekPhase").value.trim(),
    week_objective:linkedWeek?.objective||$("editSessionWeekObjective").value.trim(),week_carry_forward:linkedWeek?.carry_forward||$("editSessionWeekCarry").value.trim(),
    plan_cue:$("editSessionPlanCue").value.trim(),next_session_cue:$("editSessionNextCue").value.trim(),
    workout:$("editSessionWorkout").value,sets:extractStructuredSets($("editSessionWorkout").value),
    step_number:existing?.step_number||null,previous_session_id:existing?.previous_session_id||null,
    status:existing?.status||"planned",updated_at:nowIso()
  };
  if(!record.session_date||!record.title){alert("Date and title are required.");return}
  upsertLocal("sessions",record);appState.settings.selected_session_id=record.id;appState.settings.selected_squad=sessionSquads(record)[0]||"";queueRecord("sessions",record.id);saveState(appState);
  await syncIfPossible();fillSessionEditor(record);renderAll();updateStatus("Session saved","good");
});

function attendanceStats(athleteId){
  const records=appState.attendance.filter(a=>a.athlete_id===athleteId);
  return {marked:records.length,here:records.filter(a=>a.status==="present"||a.status==="modified").length};
}
function populateAllAthleteSelect(selectId){
  const select=$(selectId);if(!select)return;
  const current=select.value;
  select.innerHTML=appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===current?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("");
}
function fillAthleteProfile(athlete){
  if(!athlete)return;
  $("profileAthleteId").value=athlete.id;$("profileDob").value=athlete.date_of_birth||"";$("profileEvents").value=(athlete.primary_events||[]).join(", ");$("profileTrainingLane").value=athlete.training_lane||"";$("profileTimingOrder").value=athlete.timing_order||"";$("profileSex").value=athlete.sex||"";
  $("profileCurrentFocus").value=athlete.current_focus||"";$("profileTechnicalFocus").value=athlete.technical_focus||"";$("profileModifications").value=athlete.modifications||"";
  $("profileNextMeetName").value=athlete.next_meet_name||"";$("profileNextMeetDate").value=athlete.next_meet_date||"";$("profileNextMeetVenue").value=athlete.next_meet_venue||"";
  $("profilePbs").value=profileLines(athlete.pb_summary);$("profileQualifying").value=profileLines(athlete.qualifying_summary);$("profileRecords").value=profileLines(athlete.records_summary);$("profileCoachNotes").value=athlete.coach_notes||"";
}
function textLines(value){return String(value||"").split(/\n/).map(x=>x.trim()).filter(Boolean)}
async function saveAthleteProfile(){
  const athlete=appState.athletes.find(a=>a.id===$("profileAthleteId").value);if(!athlete)return;
  Object.assign(athlete,{date_of_birth:$("profileDob").value||null,primary_events:$("profileEvents").value.split(",").map(x=>x.trim()).filter(Boolean),training_lane:$("profileTrainingLane").value.trim(),timing_order:Number($("profileTimingOrder").value)||null,sex:$("profileSex").value||null,current_focus:$("profileCurrentFocus").value.trim(),technical_focus:$("profileTechnicalFocus").value.trim(),modifications:$("profileModifications").value.trim(),next_meet_name:$("profileNextMeetName").value.trim(),next_meet_date:$("profileNextMeetDate").value||null,next_meet_venue:$("profileNextMeetVenue").value.trim(),pb_summary:textLines($("profilePbs").value),qualifying_summary:textLines($("profileQualifying").value),records_summary:textLines($("profileRecords").value),coach_notes:$("profileCoachNotes").value.trim(),updated_at:nowIso()});
  queueRecord("athletes",athlete.id);saveState(appState);await syncIfPossible();renderAll();updateStatus("Athlete profile saved","good");
}
function selectAthleteEverywhere(id){const athlete=appState.athletes.find(a=>a.id===id);if(!athlete)return;appState.settings.selected_athlete_id=id;saveState(appState);for(const selectId of ["athleteQuickSelect","resultsAthlete","deckAthlete"]){const select=$(selectId);if(select)select.value=id}fillAthleteProfile(athlete);$("athleteQuickProfile").innerHTML=athleteQuickHtml(athlete);renderAthleteResultsHub(athlete);renderDeckAthleteBrief()}
function renderAthletes(){const squads=[...new Set(appState.athletes.map(a=>a.squad))].sort(),requested=$("athleteSquadFilter").value,filter=requested==="__all__"?"":requested||activeSquad();$("athleteSquadFilter").innerHTML=`<option value="__all__">All squads</option>`+squads.map(s=>`<option value="${escapeHtml(s)}" ${squadKey(s)===squadKey(filter)?"selected":""}>${escapeHtml(s)}</option>`).join("");$("athleteSquadFilter").value=filter||"__all__";const roster=appState.athletes.filter(a=>!filter||squadKey(a.squad)===squadKey(filter)).sort(rosterSort);const currentId=appState.settings.selected_athlete_id||roster[0]?.id||appState.athletes[0]?.id;const quickSelect=$("athleteQuickSelect");quickSelect.innerHTML=roster.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===currentId?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("");const quick=appState.athletes.find(a=>a.id===currentId)||roster[0];if(quick){quickSelect.value=quick.id;$("athleteQuickProfile").innerHTML=athleteQuickHtml(quick);renderAthleteResultsHub(quick)}$("athleteTableBody").innerHTML=roster.map(a=>{const stats=attendanceStats(a.id),timed=appState.timed_sets.filter(t=>t.athlete_id===a.id).length,overview=athleteResultOverview(a.id),latest=overview?.latest_result_date?`${formatDate(overview.latest_result_date)}${overview.latest_meet?` · ${overview.latest_meet}`:""}`:"—";return `<tr><td><button class="link-button" data-edit-athlete="${escapeHtml(a.id)}"><strong>${escapeHtml(a.full_name)}</strong></button></td><td>${escapeHtml(a.squad)}${a.training_lane?` · Lane ${escapeHtml(a.training_lane)}`:""}</td><td>${stats.marked?`${stats.here}/${stats.marked}`:"—"}</td><td>${overview?.personal_best_count??"—"}</td><td>${escapeHtml(latest)}</td><td>${escapeHtml(a.current_focus||"Not entered")}</td><td>${timed}</td></tr>`}).join("");document.querySelectorAll('[data-edit-athlete]').forEach(el=>el.onclick=()=>selectAthleteEverywhere(el.dataset.editAthlete));const editor=appState.athletes.find(a=>a.id===$("profileAthleteId").value)||quick;if(editor)fillAthleteProfile(editor)}

function resultDateLabel(value){
  if(!value)return "—";
  try{return formatDate(value)}catch{return value}
}
function selectedResultsAthlete(){const id=$("resultsAthlete")?.value||appState.settings.selected_athlete_id;return appState.athletes.find(a=>a.id===id)||selectedRoster()[0]||appState.athletes[0]||null}
function resultRowsHtml(rows,emptyText){
  return rows.length?rows.map(row=>`<div class="list-item"><strong>${escapeHtml(row.title)}</strong>${row.meta?`<div class="list-meta">${escapeHtml(row.meta)}</div>`:""}</div>`).join(""):`<div class="help">${escapeHtml(emptyText)}</div>`;
}
function renderResults(){
  if(!$("resultsAthlete"))return;
  const current=$("resultsAthlete").value||appState.settings.selected_athlete_id;
  const athletes=appState.athletes.slice().sort(rosterSort);
  $("resultsAthlete").innerHTML=athletes.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===current?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad||"Unassigned")}</option>`).join("");
  const athlete=selectedResultsAthlete();
  if(!athlete){
    $("resultsAthleteSummary").innerHTML='<div class="help">No athlete loaded.</div>';
    return;
  }
  $("resultsAthlete").value=athlete.id;appState.settings.selected_athlete_id=athlete.id;
  const overview=athleteResultOverview(athlete.id);
  const pbs=athleteOfficialPbs(athlete.id);
  const course=$("resultsCourseFilter")?.value||"";
  const shownPbs=pbs.filter(row=>!course||row.course===course);
  const nzsc=athleteNzscRows(athlete).sort((a,b)=>Number(a.gap_seconds)-Number(b.gap_seconds));
  const targets=athleteTargetRows(athlete).sort((a,b)=>Number(a.gap_seconds)-Number(b.gap_seconds));
  const history=appState.results_event_history
    .filter(row=>row.athlete_id===athlete.id)
    .sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||""))||String(b.result_id||"").localeCompare(String(a.result_id||"")));

  $("resultsKpiAthletes").textContent=appState.results_athlete_overview.filter(row=>Number(row.official_result_count)>0).length;
  $("resultsKpiPbs").textContent=appState.results_pb_board.length;
  $("resultsKpiQualified").textContent=appState.nzsc_2026_gap_matrix.filter(row=>row.qualification_status==="QUALIFIED").length;
  $("resultsKpiTargets").textContent=appState.scwc_target_gap_matrix.filter(row=>row.target_status==="TARGET MET").length;

  const classes=[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean).join(" / ");
  $("resultsAthleteSummary").innerHTML=`
    <div class="deck-answer-row"><span>Squad</span><strong>${escapeHtml(athlete.squad||"Unassigned")}</strong></div>
    ${classes?`<div class="deck-answer-row"><span>Classification</span><strong>${escapeHtml(classes)}</strong></div>`:""}
    <div class="deck-answer-row"><span>Official races</span><strong>${overview?.official_result_count||0}</strong></div>
    <div class="deck-answer-row"><span>Official PBs</span><strong>${overview?.personal_best_count||pbs.length}</strong></div>
    <div class="deck-answer-row"><span>Latest meet</span><strong>${escapeHtml(overview?.latest_meet||"No result loaded")}${overview?.latest_result_date?` · ${resultDateLabel(overview.latest_result_date)}`:""}</strong></div>`;

  $("resultsPbBody").innerHTML=shownPbs.length?shownPbs.map(row=>`<tr>
    <td>${escapeHtml(row.course)}</td><td>${row.distance}</td><td>${escapeHtml(row.stroke)}</td>
    <td><strong>${escapeHtml(row.pb_time)}</strong></td><td>${resultDateLabel(row.pb_date)}</td>
    <td>${escapeHtml(row.meet_name||"—")}</td><td>${row.club_rank??"—"}</td>
  </tr>`).join(""):`<tr><td colspan="7">No official PBs for this filter.</td></tr>`;

  $("resultsNzscGaps").innerHTML=resultRowsHtml(nzsc.slice(0,20).map(row=>({
    title:`${row.distance} ${row.stroke} · PB ${row.pb_time} · QT ${row.qualifying_time_text}`,
    meta:`${row.para_class||row.age_group||"Standard"} · ${Number(row.gap_seconds)<=0?`qualified by ${Math.abs(Number(row.gap_seconds)).toFixed(2)}s`:`needs ${Number(row.gap_seconds).toFixed(2)}s`}`
  })),"No matching NZSC standard rows.");

  $("resultsTargetGaps").innerHTML=resultRowsHtml(targets.slice(0,20).map(row=>({
    title:`${row.programme.replace("SCWC ","")} · ${row.distance} ${row.stroke}`,
    meta:`${row.age_group||"Standard"} · PB ${row.pb_time} · target ${row.target_time_text} · ${Number(row.gap_seconds)<=0?`met by ${Math.abs(Number(row.gap_seconds)).toFixed(2)}s`:`needs ${Number(row.gap_seconds).toFixed(2)}s`}`
  })),"No matching SCWC target rows.");

  if($("resultsCwscSummary"))$("resultsCwscSummary").innerHTML=compactRaceRows(athleteCwscHistory(athlete.id),"No CWSC results loaded yet.")+compactGapRows(targets,"No SCWC target rows.");
  if($("resultsNationalsSummary"))$("resultsNationalsSummary").innerHTML=compactRaceRows(athleteNationalHistory(athlete.id),"No national-meet results loaded yet.")+compactGapRows(nzsc,"No NZSC qualifying rows.");
  if($("resultsRecordsSummary"))$("resultsRecordsSummary").innerHTML=compactRecordRows(athlete);
  renderAthleteResultsHub(athlete);
  $("resultsHistoryBody").innerHTML=history.length?history.slice(0,40).map(row=>`<tr>
    <td>${resultDateLabel(row.result_date)}</td><td>${escapeHtml(row.meet_name||"—")}</td>
    <td>${escapeHtml(row.course||"—")}</td><td>${row.distance} ${escapeHtml(row.stroke)}</td>
    <td>${escapeHtml(row.round||"—")}</td><td><strong>${escapeHtml(row.result_time_text)}</strong></td>
    <td>${row.official_place??"—"}</td>
  </tr>`).join(""):`<tr><td colspan="7">No official race history loaded.</td></tr>`;
}

function weekBounds(dateString){
  const d=new Date(`${dateString}T12:00:00`);const day=(d.getDay()+6)%7;const start=new Date(d);start.setDate(d.getDate()-day);const end=new Date(start);end.setDate(start.getDate()+6);return {start:localIsoDate(start),end:localIsoDate(end)};
}
function renderWeeklyEvidence(){
  const session=selectedSession();if(!session||!$("weeklyEvidence"))return;
  const bounds=weekBounds(session.session_date);const sessions=appState.sessions.filter(s=>s.session_date>=bounds.start&&s.session_date<=bounds.end).sort((a,b)=>`${a.session_date}-${a.day_part}`.localeCompare(`${b.session_date}-${b.day_part}`));
  const reviews=sessions.map(s=>sessionReview(s.id)).filter(Boolean);const planned=sessions.reduce((n,s)=>n+Number(s.planned_distance||0),0);const actual=reviews.reduce((n,r)=>n+Number(r.actual_distance||0),0);
  const completed=sessions.filter(s=>s.status==="completed"||sessionReview(s.id)?.completed_at).length;
  const attendance=appState.attendance.filter(a=>sessions.some(s=>s.id===a.session_id));const here=attendance.filter(a=>a.status==="present"||a.status==="modified").length;
  $("weeklyEvidenceHeading").textContent=`${formatDate(bounds.start)}–${formatDate(bounds.end)}`;
  $("weeklyEvidence").innerHTML=`<div class="weekly-kpis">
    <div><strong>${sessions.length}</strong><span>planned sessions</span></div><div><strong>${completed}</strong><span>completed</span></div><div><strong>${planned.toLocaleString()}m</strong><span>planned distance</span></div><div><strong>${actual.toLocaleString()}m</strong><span>actual distance</span></div><div><strong>${here}/${attendance.length||0}</strong><span>marked here</span></div>
  </div>${sessions.map(s=>{const r=sessionReview(s.id);const gaps=[];if(!r?.actual_distance)gaps.push("actual distance");if(!r?.energy_systems||!Object.keys(r.energy_systems).length)gaps.push("system split");if(!r?.training_modes||!Object.keys(r.training_modes).length)gaps.push("kick/pull/swim");if(!r?.stroke_exposure||!Object.keys(r.stroke_exposure).length)gaps.push("stroke exposure");if(!appState.attendance.some(a=>a.session_id===s.id))gaps.push("attendance");return `<div class="weekly-session-row"><strong>${escapeHtml(sessionLabel(s))} · ${escapeHtml(s.title)}</strong><span>${Number(s.planned_distance||0).toLocaleString()}m plan</span><span>${Number(r?.actual_distance||0).toLocaleString()}m actual</span><span class="${gaps.length?"evidence-gap":"evidence-good"}">${gaps.length?`Missing: ${escapeHtml(gaps.join(", "))}`:"Evidence complete"}</span></div>`}).join("")}`;
}
function renderReports(){
  renderWeeklyEvidence();
  const current=$("reportAthlete").value||selectedRoster()[0]?.id||appState.athletes[0]?.id;
  $("reportAthlete").innerHTML=appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===current?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("");
  const athlete=appState.athletes.find(a=>a.id===$("reportAthlete").value);if(!athlete){$("athleteReport").innerHTML="";return}
  const attendance=appState.attendance.filter(a=>a.athlete_id===athlete.id);const attended=attendance.filter(a=>a.status==="present"||a.status==="modified");const sessionIds=new Set(attended.map(a=>a.session_id));
  const distance=appState.sessions.filter(s=>sessionIds.has(s.id)).reduce((sum,s)=>sum+Number(sessionReview(s.id)?.actual_distance||s.planned_distance||0),0);const timed=appState.timed_sets.filter(t=>t.athlete_id===athlete.id).sort(byUpdated);const notes=appState.captures.filter(c=>c.athlete_id===athlete.id).sort(byUpdated);
  $("athleteReport").innerHTML=`<h3>${escapeHtml(athlete.full_name)}</h3>${athleteQuickHtml(athlete)}<div class="report-grid"><div><strong>${attended.length}</strong><span>sessions attended</span></div><div><strong>${distance.toLocaleString()}m</strong><span>recorded volume attended</span></div><div><strong>${timed.length}</strong><span>timed sets</span></div><div><strong>${notes.length}</strong><span>athlete notes</span></div></div><h3>Latest timed work</h3>${timed.length?timed.slice(0,5).map(t=>`<div class="list-item">${t.distance} ${escapeHtml(t.stroke)} · avg ${formatSeconds(t.average)} · best ${formatSeconds(t.best)}</div>`).join(""):`<p class="help">No timed work yet.</p>`}<h3>Latest notes</h3>${notes.length?notes.slice(0,5).map(n=>`<div class="list-item"><p>${escapeHtml(n.text_content)}</p><div class="list-meta">${new Date(n.created_at).toLocaleString("en-NZ")}</div></div>`).join(""):`<p class="help">No athlete notes yet.</p>`}`;
}
$("athleteSquadFilter").addEventListener("change",()=>{const value=$("athleteSquadFilter").value;if(value!=="__all__"&&sessionSquads(selectedSession()).some(s=>squadKey(s)===squadKey(value)))setActiveSquad(value);else renderAthletes()});
$("athleteQuickSelect").addEventListener("change",()=>selectAthleteEverywhere($("athleteQuickSelect").value));if($("openFullResultsBtn"))$("openFullResultsBtn").addEventListener("click",()=>{const id=$("profileAthleteId").value||appState.settings.selected_athlete_id;appState.settings.selected_athlete_id=id;saveState(appState);showView("results");renderResults()});
$("saveAthleteProfileBtn").addEventListener("click",saveAthleteProfile);
$("reportAthlete").addEventListener("change",renderReports);
if($("resultsAthlete"))$("resultsAthlete").addEventListener("change",()=>{appState.settings.selected_athlete_id=$("resultsAthlete").value;saveState(appState);renderResults()});
if($("resultsCourseFilter"))$("resultsCourseFilter").addEventListener("change",renderResults);
if($("refreshResultsBtn"))$("refreshResultsBtn").addEventListener("click",async()=>{
  try{await pullCloud();renderAll();updateStatus("Results refreshed","good")}
  catch(error){console.error(error);updateStatus("Results refresh failed","error")}
});

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
  if(table==="athletes") return {id:base.id,organisation_id:org,full_name:base.full_name,squad:base.squad,active:base.active,legacy_pace:base.legacy_pace,date_of_birth:base.date_of_birth,primary_events:base.primary_events||[],current_focus:base.current_focus,technical_focus:base.technical_focus,modifications:base.modifications,coach_notes:base.coach_notes,next_meet_name:base.next_meet_name,next_meet_date:base.next_meet_date,next_meet_venue:base.next_meet_venue,pb_summary:base.pb_summary||[],qualifying_summary:base.qualifying_summary||[],records_summary:base.records_summary||[],training_lane:base.training_lane||null,timing_order:base.timing_order||null,sex:base.sex||null,current_s_class:base.current_s_class||null,current_sb_class:base.current_sb_class||null,current_sm_class:base.current_sm_class||null,updated_at:base.updated_at,created_by:user};
  if(table==="sessions") return {id:base.id,organisation_id:org,session_date:base.session_date,day_part:base.day_part,venue:base.venue,title:base.title,squads:base.squads,planned_distance:base.planned_distance,primary_system:base.primary_system,technical_focus:base.technical_focus,plan_cue:base.plan_cue,next_session_cue:base.next_session_cue,season_name:base.season_name||null,week_start:base.week_start||null,week_phase:base.week_phase||null,week_objective:base.week_objective||null,week_carry_forward:base.week_carry_forward||null,workout:base.workout,sets:base.sets||[],step_number:base.step_number,previous_session_id:base.previous_session_id,status:base.status,updated_at:base.updated_at,created_by:user};
  if(table==="attendance") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,status:base.status,note:base.note,updated_at:base.updated_at,created_by:user};
  if(table==="captures") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,capture_type:base.capture_type,text_content:base.text_content,media_path:base.media_path,mime_type:base.mime_type,session_block_id:base.session_block_id||null,created_at:base.created_at,updated_at:base.updated_at,created_by:user};
  if(table==="timed_sets") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,distance:base.distance,stroke:base.stroke,set_label:base.set_label,send_off:base.send_off,times:base.times,average:base.average,best:base.best,spread:base.spread,created_at:base.created_at,updated_at:base.updated_at,created_by:user};
  if(table==="session_reviews") return {id:base.id,organisation_id:org,session_id:base.session_id,went_well:base.went_well,reinforce:base.reinforce,athlete_notes:base.athlete_notes,carry_forward:base.carry_forward,actual_distance:base.actual_distance||0,actual_duration:base.actual_duration||0,energy_systems:base.energy_systems||{},training_modes:base.training_modes||{},stroke_exposure:base.stroke_exposure||{},athlete_response:base.athlete_response,modifications:base.modifications,race_split_evidence:base.race_split_evidence,completed_at:base.completed_at,updated_at:base.updated_at,created_by:user};
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
  const priority={athletes:1,season_plans:2,weekly_plans:3,sessions:4,session_lane_assignments:5,test_sets:6,attendance:7,captures:8,timed_sets:9,test_set_attempts:10,coach_result_imports:11,coach_results:12,coach_result_aliases:13,session_reviews:14};
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
  for(const view of RESULT_VIEWS){try{const rows=await cloudFetch(`/rest/v1/${view}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);appState[view]=rows.map(stripCloudFields)}catch(error){console.warn(`Optional result source ${view} not available`,error);if(!Array.isArray(appState[view]))appState[view]=[]}}

  saveState(appState);
}
async function syncNow(){
  if(!getAuth()?.access_token) throw new Error("Sign in first.");
  if(!appState.settings.organisation_id) await ensureOrganisation();
  updateStatus("Syncing…");
  // Only push records explicitly changed on this device. Re-uploading every local row
  // could resurrect a session that was already deleted on another device.
  await pushPending();await pullCloud();
  updateStatus("Cloud synced","good");renderAll();
}
async function syncIfPossible(){
  if(!cloudReady()){renderMode();return}
  try{await pushPending();await pullCloud();updateStatus("Cloud synced","good")}catch(error){console.error(error);updateStatus("Waiting to sync","error")}
}
window.addEventListener("online",syncIfPossible);

function renderAll(){
  renderMode();renderSessionPicker();renderActiveContext();renderOverview();renderDeck();renderSessionImportPreview();renderAttendance();
  populateAthleteSelect("captureAthlete",true);populateAthleteSelect("timeAthlete",false);populateAthleteSelect("deckAthlete",false);
  if($("deckAthlete")){ $("deckAthlete").onchange=renderDeckAthleteBrief; renderDeckAthleteBrief(); }
  renderReview();renderCaptures();renderPaceReference();renderTimedSets();renderStopwatchLaps();renderManualTimes();renderSessions();
  renderAthletes();renderResults();renderReports();loadSettings();renderLiveBoard();
}

// =============================================================================
// McLay Swimming OS v3.1 — pathway, mobile PB and cross-device sync repair
// =============================================================================
let resultImportPreview=[];
let resultImportFileName="";

function v3Course(value){const s=String(value||"").toLowerCase();if(/short|scm|25m/.test(s))return "SCM";if(/long|lcm|50m/.test(s))return "LCM";if(/both/.test(s))return "BOTH";return String(value||"").toUpperCase()}
function v3Stroke(value){const s=String(value||"").toLowerCase();if(/medley|(^|\s)im($|\s)/.test(s))return "IM";if(/breast/.test(s))return "Breaststroke";if(/back/.test(s))return "Backstroke";if(/butter|fly/.test(s))return "Butterfly";if(/free/.test(s))return "Freestyle";return String(value||"")}
function v3Seconds(value){if(value===null||value===undefined)return null;let s=String(value).trim().replace(/,/g,".");if(!s||/^(NT|DQ|DNS|DNF|-)$/i.test(s))return null;if(/^\d+\.\d{2}\.\d{1,2}$/.test(s)){const p=s.split(".");s=`${p[0]}:${p[1]}.${p[2]}`}if(/^\d+:\d{2}:\d{1,2}$/.test(s)){const p=s.split(":");s=`${p[0]}:${p[1]}.${p[2]}`}s=s.replace(/[^0-9:.]/g,"");const p=s.split(":").map(Number);if(p.some(Number.isNaN))return null;if(p.length===1)return p[0];if(p.length===2)return p[0]*60+p[1];if(p.length===3)return p[0]*3600+p[1]*60+p[2];return null}
function v3Time(seconds){if(seconds===null||seconds===undefined||!Number.isFinite(Number(seconds)))return "—";const n=Number(seconds),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=(n%60).toFixed(2).padStart(5,"0");return h?`${h}:${String(m).padStart(2,"0")}:${s}`:m?`${m}:${s}`:s}
function v3Points(row){return Number(row?.world_para_points??row?.para_points??row?.wa_points??row?.world_aquatics_points??row?.points??0)||0}
function v3Age(athlete,dateValue){if(!athlete?.date_of_birth)return null;const d=new Date(`${athlete.date_of_birth}T12:00:00`),at=dateValue?new Date(`${dateValue}T12:00:00`):new Date();if(Number.isNaN(d.getTime())||Number.isNaN(at.getTime()))return null;let age=at.getFullYear()-d.getFullYear();if(at.getMonth()<d.getMonth()||(at.getMonth()===d.getMonth()&&at.getDate()<d.getDate()))age--;return age}
function v3EventKey(distance,stroke){return `${Number(distance)||0}|${v3Stroke(stroke)}`}
function v3ResultDate(row){return row.result_date||row.pb_date||row.date||""}
function v3ResultTime(row){return row.result_time_text||row.pb_time||row.time_text||row.time||""}
function v3ResultSeconds(row){return Number(row.result_seconds??row.pb_seconds??row.time_seconds??v3Seconds(v3ResultTime(row)))||null}
function v3MeetName(row){return row.meet_name||row.meet||row.source_meet||""}
function v3RaceRow(row,source="official"){return {...row,source_type:row.source_type||source,course:v3Course(row.course||row.pool_course),distance:Number(row.distance||row.event_distance||0),stroke:v3Stroke(row.stroke||row.event_stroke||row.event),result_time_text:v3ResultTime(row),result_seconds:v3ResultSeconds(row),result_date:v3ResultDate(row),meet_name:v3MeetName(row)}}
function athleteHistory(athleteId){const official=(appState.results_event_history||[]).filter(r=>r.athlete_id===athleteId).map(r=>v3RaceRow(r,"official"));const coach=(appState.coach_results||[]).filter(r=>r.athlete_id===athleteId).map(r=>v3RaceRow(r,r.source_type||"coach"));const seen=new Set();return [...official,...coach].filter(r=>{const k=[r.athlete_id,r.result_date,r.meet_name,r.course,r.distance,r.stroke,r.result_time_text,r.round].join("|").toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||""))||v3Points(b)-v3Points(a))}
function athleteCwscHistory(athleteId){return athleteHistory(athleteId).filter(r=>/(scwc|cwsc|canterbury\s*(west\s*coast)?|canterbury.*champ|division\s*a)/i.test(String(r.meet_name||"")))}
function athleteSouthIslandHistory(athleteId){return athleteHistory(athleteId).filter(r=>/(south\s*island|si\s*(long|short|lc|sc)?\s*course)/i.test(String(r.meet_name||"")))}
function athleteNationalHistory(athleteId){return athleteHistory(athleteId).filter(r=>/(new\s*zealand|nzsc|nz\s*short\s*course|nz\s*champ|nags|age\s*group|division\s*ii|div\s*2|secondary\s*school)/i.test(String(r.meet_name||"")))}
function athleteOfficialPbs(athleteId){
  const all=[];
  for(const row of (appState.results_pb_board||[]).filter(r=>r.athlete_id===athleteId))all.push(v3RaceRow(row,"official-pb"));
  for(const row of (appState.coach_results||[]).filter(r=>r.athlete_id===athleteId))all.push(v3RaceRow(row,row.source_type||"coach"));
  const history=athleteHistory(athleteId);
  for(const row of all){if(!row.result_seconds)continue;const match=history.find(h=>h.course===row.course&&h.distance===row.distance&&h.stroke===row.stroke&&Math.abs(Number(h.result_seconds)-Number(row.result_seconds))<0.02);if(match){row.wa_points=row.wa_points??match.wa_points;row.world_para_points=row.world_para_points??match.world_para_points;row.meet_name=row.meet_name||match.meet_name;row.result_date=row.result_date||match.result_date}}
  const best=new Map();for(const row of all){if(!row.distance||!row.stroke||!row.course||!row.result_seconds)continue;const k=`${row.course}|${v3EventKey(row.distance,row.stroke)}`;const old=best.get(k);if(!old||row.result_seconds<old.result_seconds||(row.result_seconds===old.result_seconds&&v3Points(row)>v3Points(old)))best.set(k,row)}
  return [...best.values()].sort((a,b)=>v3Points(b)-v3Points(a)||a.distance-b.distance||a.stroke.localeCompare(b.stroke)||a.course.localeCompare(b.course));
}
function groupedAthletePbs(athlete){const flat=athleteOfficialPbs(athlete.id),map=new Map();for(const row of flat){const k=v3EventKey(row.distance,row.stroke);if(!map.has(k))map.set(k,{distance:row.distance,stroke:row.stroke,LCM:null,SCM:null,bestPoints:0});const g=map.get(k);g[row.course]=row;g.bestPoints=Math.max(g.bestPoints,v3Points(row))}return [...map.values()].sort((a,b)=>b.bestPoints-a.bestPoints||a.distance-b.distance||a.stroke.localeCompare(b.stroke))}
function v3ParaClassForEvent(athlete,stroke){if(stroke==="Breaststroke")return String(athlete.current_sb_class||"").toUpperCase();if(stroke==="IM")return String(athlete.current_sm_class||"").toUpperCase();return String(athlete.current_s_class||"").toUpperCase()}
function v3StandardMatches(row,athlete,course,distance,stroke){if(!row.active)return false;if(Number(row.distance)!==Number(distance)||v3Stroke(row.stroke)!==v3Stroke(stroke))return false;const rc=v3Course(row.course);if(rc!=="BOTH"&&rc!==course)return false;const sex=String(athlete.sex||"").toUpperCase();if(row.sex&&(!sex||String(row.sex).toUpperCase()!==sex))return false;const hasAgeRule=row.age_min!==null&&row.age_min!==undefined||row.age_max!==null&&row.age_max!==undefined;const age=v3Age(athlete,row.age_date||row.meet_date);if(hasAgeRule&&age===null)return false;if(age!==null&&((row.age_min!==null&&row.age_min!==undefined&&age<Number(row.age_min))||(row.age_max!==null&&row.age_max!==undefined&&age>Number(row.age_max))))return false;const pc=v3ParaClassForEvent(athlete,v3Stroke(stroke));if(row.para_class)return pc&&String(row.para_class).toUpperCase()===pc;return !pc}
function v3TargetStages(athlete,pb){const stages=[];for(const row of (appState.pathway_standards||[])){if(v3StandardMatches(row,athlete,pb.course,pb.distance,pb.stroke))stages.push({order:Number(row.progression_order),name:row.programme,target:row.qualifying_time_text,targetSeconds:Number(row.qualifying_seconds),ceilingSeconds:Number(row.ceiling_seconds)||null,source:row})}
  const targetRows=athleteTargetRows(athlete).filter(r=>v3Course(r.course||"LCM")===pb.course&&Number(r.distance)===pb.distance&&v3Stroke(r.stroke)===pb.stroke);for(const r of targetRows)stages.push({order:7,name:"Canterbury squad",target:r.target_time_text,targetSeconds:Number(r.target_seconds??v3Seconds(r.target_time_text)),source:r});
  const records=athleteRecordRows(athlete).filter(r=>v3Course(r.course)===pb.course&&Number(r.distance)===pb.distance&&v3Stroke(r.stroke)===pb.stroke);for(const r of records){const scope=String(r.record_scope||r.programme||"");const nz=/new zealand|(^|\s)nz(\s|$)|national/i.test(scope),cant=/canterbury|scwc|cwsc|regional/i.test(scope);if(!nz&&!cant)continue;stages.push({order:nz?9:8,name:nz?"NZ record":"Canterbury record",target:r.record_time_text||r.record_time,targetSeconds:Number(r.record_seconds??v3Seconds(r.record_time_text||r.record_time)),source:r})}
  const uniq=new Map();for(const s of stages.sort((a,b)=>a.order-b.order||a.targetSeconds-b.targetSeconds)){const k=`${s.order}|${s.name}`;if(!uniq.has(k))uniq.set(k,s)}return [...uniq.values()]}
function v3Pathway(athlete,pb){if(!pb)return {achieved:[],next:null,stages:[]};const achieved=[];let next=null;const stages=v3TargetStages(athlete,pb);for(const stage of stages){if(!stage.targetSeconds)continue;const met=Number(pb.result_seconds)<=stage.targetSeconds;let label=stage.name;if(stage.name==="Division II"&&stage.ceilingSeconds&&Number(pb.result_seconds)<=stage.ceilingSeconds)label="Div II outgrown";if(met)achieved.push(label);else if(!next)next={...stage,gap:Number(pb.result_seconds)-stage.targetSeconds}}return {achieved:[...new Set(achieved)],next,stages}}
function v3PathwayHtml(athlete,pb){if(!pb)return '<span class="pathway-missing">No PB</span>';const p=v3Pathway(athlete,pb),lastDone=p.achieved.slice(-2);const done=lastDone.map(x=>`<span class="pathway-achieved">${escapeHtml(x)} ✓</span>`).join("");let next;if(p.next)next=`<span class="pathway-next">Next <strong>${escapeHtml(p.next.name)}</strong> ${escapeHtml(p.next.target)} · ${p.next.gap.toFixed(2)}s</span>`;else if(!p.stages.length)next='<span class="pathway-missing">No matching pathway row - check DOB/sex/course</span>';else next=`<span class="pathway-next"><strong>Highest loaded stage achieved</strong> · ${escapeHtml(p.achieved.at(-1)||"standard met")}</span>`;return `<div class="pathway-compact">${done}${next}</div>`}
function v3PbCell(athlete,pb){if(!pb)return '<span class="pathway-missing">—</span>';const points=v3Points(pb);return `<div class="pb-course-block"><div class="pb-time-line"><strong>${escapeHtml(pb.result_time_text||v3Time(pb.result_seconds))}</strong>${points?`<span class="points-badge">${points} pts</span>`:""}</div><div class="pb-meta">${escapeHtml(pb.meet_name||"PB")}${pb.result_date?` · ${escapeHtml(resultDateLabel(pb.result_date))}`:""}</div>${v3PathwayHtml(athlete,pb)}</div>`}
function v3GroupedPbRows(athlete){const groups=groupedAthletePbs(athlete);return groups.length?groups.map(g=>`<tr><td class="pb-event-cell"><strong>${g.distance} ${escapeHtml(g.stroke.replace("stroke",""))}</strong></td><td>${v3PbCell(athlete,g.LCM)}</td><td>${v3PbCell(athlete,g.SCM)}</td><td>${g.bestPoints?`<span class="points-badge">${g.bestPoints}</span>`:"—"}</td></tr>`).join(""):'<tr><td colspan="4">No PBs loaded for this swimmer.</td></tr>'}
function v31GroupedPbCards(athlete){const groups=groupedAthletePbs(athlete);return groups.length?groups.map(g=>`<article class="pb-mobile-card"><div class="pb-mobile-event"><strong>${g.distance} ${escapeHtml(g.stroke.replace("stroke",""))}</strong>${g.bestPoints?`<span class="points-badge">${g.bestPoints} pts</span>`:""}</div><div class="pb-mobile-course"><span class="pb-course-label">LC</span>${v3PbCell(athlete,g.LCM)}</div><div class="pb-mobile-course"><span class="pb-course-label">SC</span>${v3PbCell(athlete,g.SCM)}</div></article>`).join(""):'<div class="help">No PBs loaded for this swimmer.</div>'}
function compactRaceRows(rows,empty){return rows.length?rows.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.result_time_text||r.pb_time||"—")}</strong><span>${escapeHtml(r.meet_name||r.programme||"")}${r.result_date?` · ${escapeHtml(resultDateLabel(r.result_date))}`:""}${r.official_place?` · place ${escapeHtml(r.official_place)}`:""}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`}
function compactGapRows(rows,empty){return rows.length?rows.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.pb_time||"—")}</strong><span>${escapeHtml(r.programme||r.age_group||r.para_class||"")} · ${Number(r.gap_seconds)<=0?`met by ${Math.abs(Number(r.gap_seconds)).toFixed(2)}s`:`needs ${Number(r.gap_seconds).toFixed(2)}s`}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`}
function v31DerivedPathwayRows(athlete,matcher){const rows=[];for(const pb of athleteOfficialPbs(athlete.id)){for(const stage of v3TargetStages(athlete,pb).filter(matcher)){rows.push({programme:stage.name,course:pb.course,distance:pb.distance,stroke:pb.stroke,pb_time:pb.result_time_text,target_time_text:stage.target,gap_seconds:Number(pb.result_seconds)-Number(stage.targetSeconds),progression_order:stage.order})}}const uniq=new Map();for(const r of rows.sort((a,b)=>a.progression_order-b.progression_order||a.gap_seconds-b.gap_seconds)){const k=`${r.programme}|${r.course}|${r.distance}|${r.stroke}`;if(!uniq.has(k))uniq.set(k,r)}return [...uniq.values()]}
function compactRecordRows(athlete){const loaded=athleteRecordRows(athlete);if(loaded.length)return loaded.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.record_scope||r.programme||"Record")} · ${escapeHtml(r.distance)} ${escapeHtml(r.stroke)}</strong><span>PB ${escapeHtml(r.pb_time||"—")} · record ${escapeHtml(r.record_time_text||r.record_time||"—")}${r.gap_seconds!==undefined?` · ${Number(r.gap_seconds)<=0?"record matched/better":`${Number(r.gap_seconds).toFixed(2)}s away`}`:""}</span></div>`).join("");const rows=v31DerivedPathwayRows(athlete,s=>s.source?.standard_kind==="record"||/record/i.test(s.name));return rows.length?rows.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.programme)} · ${escapeHtml(r.course)} ${escapeHtml(r.distance)} ${escapeHtml(r.stroke)}</strong><span>PB ${escapeHtml(r.pb_time||"—")} · record ${escapeHtml(r.target_time_text||"—")} · ${Number(r.gap_seconds)<=0?"matched/better":`${Number(r.gap_seconds).toFixed(2)}s away`}</span></div>`).join(""):'<div class="help">No matching record rows loaded yet.</div>'}
function renderAthleteResultsHub(athlete){const hub=$("athleteResultsHub");if(!hub||!athlete)return;$("athleteResultsHubTitle").textContent=`${athlete.full_name} · complete PBs and progression`;const cant=athleteCwscHistory(athlete.id),si=athleteSouthIslandHistory(athlete.id),nationals=athleteNationalHistory(athlete.id);hub.innerHTML=`<div class="athlete-hub-grid"><section class="athlete-hub-section complete-pbs"><h4>All PBs · LC and SC grouped</h4><div class="complete-results-note">Ordered by World Para points or WA points where available. Every PB remains visible.</div><div class="table-wrap pb-desktop-table"><table class="pb-complete-table"><thead><tr><th>Event</th><th>Long course PB + progression</th><th>Short course PB + progression</th><th>Points</th></tr></thead><tbody>${v3GroupedPbRows(athlete)}</tbody></table></div><div class="pb-mobile-list">${v31GroupedPbCards(athlete)}</div></section><section class="athlete-hub-section"><h4>Canterbury championships</h4>${compactRaceRows(cant,"No Canterbury championship results loaded.")}</section><section class="athlete-hub-section"><h4>South Island championships</h4>${compactRaceRows(si,"No South Island championship results loaded.")}</section><section class="athlete-hub-section"><h4>National championships</h4>${compactRaceRows(nationals,"No national championship results loaded.")}</section><section class="athlete-hub-section"><h4>Records</h4>${compactRecordRows(athlete)}</section></div>`}
function renderResults(){const athletes=appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name));const selectedId=$("resultsAthlete")?.value||appState.settings.selected_athlete_id||athletes[0]?.id;const athlete=athletes.find(a=>a.id===selectedId)||athletes[0];if(!athlete)return;appState.settings.selected_athlete_id=athlete.id;saveState(appState);$("resultsAthlete").innerHTML=athletes.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===athlete.id?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("");const pbs=athleteOfficialPbs(athlete.id),history=athleteHistory(athlete.id),overview=athleteResultOverview(athlete.id);$("resultsKpiAthletes").textContent=new Set([...(appState.results_pb_board||[]),...(appState.coach_results||[])].map(r=>r.athlete_id).filter(Boolean)).size;$("resultsKpiPbs").textContent=appState.athletes.reduce((n,a)=>n+athleteOfficialPbs(a.id).length,0);$("resultsKpiQualified").textContent=(appState.pathway_standards||[]).length;$("resultsKpiTargets").textContent=(appState.results_record_gaps||[]).length||(appState.pathway_standards||[]).filter(r=>r.standard_kind==="record").length;const classes=[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean).join(" / "),demographicWarning=!athlete.sex||!athlete.date_of_birth?'<div class="source-warning">Set sex and date of birth in the coach profile to calculate age-group qualifying progressions accurately.</div>':"";$("resultsAthleteSummary").innerHTML=`${demographicWarning}<div class="deck-answer-row"><span>Squad</span><strong>${escapeHtml(athlete.squad||"Unassigned")}</strong></div>${classes?`<div class="deck-answer-row"><span>Classification</span><strong>${escapeHtml(classes)}</strong></div>`:""}<div class="deck-answer-row"><span>PB course-events</span><strong>${pbs.length}</strong></div><div class="deck-answer-row"><span>Complete race rows</span><strong>${history.length}</strong></div><div class="deck-answer-row"><span>Latest meet</span><strong>${escapeHtml(overview?.latest_meet||history[0]?.meet_name||"No result loaded")}</strong></div>`;$("resultsPbBody").innerHTML=v3GroupedPbRows(athlete);if($("resultsPbMobile"))$("resultsPbMobile").innerHTML=v31GroupedPbCards(athlete);const grouped=groupedAthletePbs(athlete);const nextRows=[];for(const g of grouped){for(const pb of [g.LCM,g.SCM].filter(Boolean)){const p=v3Pathway(athlete,pb);if(p.next)nextRows.push({title:`${pb.course} ${g.distance} ${g.stroke} · PB ${pb.result_time_text}`,meta:`Next ${p.next.name} ${p.next.target} · ${p.next.gap.toFixed(2)}s`})}}$("resultsNzscGaps").innerHTML=resultRowsHtml(nextRows,"No next standards available.");const loadedTargetRows=athleteTargetRows(athlete),targetRows=loadedTargetRows.length?loadedTargetRows:v31DerivedPathwayRows(athlete,s=>s.source?.standard_kind==="target_squad"||/Target 20/i.test(s.name));$("resultsTargetGaps").innerHTML=compactGapRows(targetRows,"No Canterbury squad target rows.");$("resultsCwscSummary").innerHTML=compactRaceRows([...athleteCwscHistory(athlete.id),...athleteSouthIslandHistory(athlete.id)],"No regional championship results loaded.");$("resultsNationalsSummary").innerHTML=compactRaceRows(athleteNationalHistory(athlete.id),"No national-meet results loaded.");$("resultsRecordsSummary").innerHTML=compactRecordRows(athlete);renderAthleteResultsHub(athlete);$("resultsHistoryBody").innerHTML=history.length?history.map(row=>`<tr><td>${resultDateLabel(row.result_date)}</td><td>${escapeHtml(row.meet_name||"—")}</td><td>${escapeHtml(row.course||"—")}</td><td>${row.distance} ${escapeHtml(row.stroke)}</td><td>${escapeHtml(row.round||"—")}</td><td><strong>${escapeHtml(row.result_time_text)}</strong></td><td>${row.official_place??"—"}</td></tr>`).join(""):'<tr><td colspan="7">No race history loaded.</td></tr>';const wrap=$("resultsHistoryBody")?.closest(".table-wrap");if(wrap)wrap.classList.add("full-history-table")}

// Planning
function selectedSeasonPlan(){return appState.season_plans.find(x=>x.id===appState.settings.selected_season_plan_id)||appState.season_plans.find(x=>x.status==="active")||appState.season_plans[0]||null}
function selectedWeeklyPlan(){return appState.weekly_plans.find(x=>x.id===appState.settings.selected_weekly_plan_id)||appState.weekly_plans.find(x=>x.season_plan_id===selectedSeasonPlan()?.id)||appState.weekly_plans[0]||null}
function v3LineMap(text){const out={};for(const line of String(text||"").split(/\n/)){const m=line.match(/^\s*([^:]+):\s*(.+)$/);if(m)out[m[1].trim()]=m[2].trim()}return out}
function v3MapLines(obj){return Object.entries(obj||{}).map(([k,v])=>`${k}: ${v}`).join("\n")}
function fillSeasonEditor(s){$("seasonEditorHeading").textContent=s?"Edit season plan":"New season plan";$("seasonPlanId").value=s?.id||"";$("seasonPlanName").value=s?.name||"";$("seasonPlanStart").value=s?.start_date||"";$("seasonPlanEnd").value=s?.end_date||"";$("seasonPlanGoal").value=s?.overarching_goal||"";$("seasonPlanStatus").value=s?.status||"active"}
function fillWeekEditor(w){$("weekEditorHeading").textContent=w?"Edit weekly plan":"New weekly plan";$("weeklyPlanId").value=w?.id||"";v3PopulatePlanSelects();$("weeklyPlanSeason").value=w?.season_plan_id||selectedSeasonPlan()?.id||"";$("weeklyPlanStart").value=w?.week_start||"";$("weeklyPlanNumber").value=w?.week_number||"";$("weeklyPlanPhase").value=w?.phase||"";$("weeklyPlanObjective").value=w?.objective||"";$("weeklyPlanCarry").value=w?.carry_forward||"";$("weeklyPlanNotes").value=w?.notes||""}
function v3PopulatePlanSelects(){
  const seasons=appState.season_plans.slice().sort((a,b)=>String(b.start_date||"").localeCompare(String(a.start_date||"")));
  const weeks=appState.weekly_plans.slice().sort((a,b)=>String(b.week_start||"").localeCompare(String(a.week_start||"")));
  const editingSession=appState.sessions.find(s=>s.id===$("editSessionId")?.value);
  const editingWeek=appState.weekly_plans.find(w=>w.id===$("weeklyPlanId")?.value);
  for(const id of ["weeklyPlanSeason","editSessionSeasonPlan"]){
    const el=$(id);if(!el)continue;
    const current=el.value||(id==="weeklyPlanSeason"?editingWeek?.season_plan_id:editingSession?.season_plan_id)||"";
    el.innerHTML='<option value="">Not linked</option>'+seasons.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("");
    if([...el.options].some(o=>o.value===current))el.value=current;
  }
  const weekSel=$("editSessionWeeklyPlan");
  if(weekSel){
    const current=weekSel.value||editingSession?.weekly_plan_id||"";
    const seasonId=$("editSessionSeasonPlan")?.value||editingSession?.season_plan_id||"";
    weekSel.innerHTML='<option value="">Not linked</option>'+weeks.filter(w=>!seasonId||w.season_plan_id===seasonId).map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.week_start)} · ${escapeHtml(w.phase||w.objective||"Weekly plan")}</option>`).join("");
    if([...weekSel.options].some(o=>o.value===current))weekSel.value=current;
  }
}
function v3ApplySessionSeasonLink(){
  const season=appState.season_plans.find(s=>s.id===$("editSessionSeasonPlan")?.value);
  if(season&&$("editSessionSeason"))$("editSessionSeason").value=season.name||"";
  v3PopulatePlanSelects();
}
function v3ApplySessionWeekLink(){
  const week=appState.weekly_plans.find(w=>w.id===$("editSessionWeeklyPlan")?.value);if(!week)return;
  if(week.season_plan_id&&$("editSessionSeasonPlan"))$("editSessionSeasonPlan").value=week.season_plan_id;
  const season=appState.season_plans.find(s=>s.id===week.season_plan_id);
  if($("editSessionSeason"))$("editSessionSeason").value=season?.name||$("editSessionSeason").value;
  if($("editSessionWeekStart"))$("editSessionWeekStart").value=week.week_start||"";
  if($("editSessionWeekPhase"))$("editSessionWeekPhase").value=week.phase||"";
  if($("editSessionWeekObjective"))$("editSessionWeekObjective").value=week.objective||"";
  if($("editSessionWeekCarry"))$("editSessionWeekCarry").value=week.carry_forward||"";
  v3PopulatePlanSelects();
}
function renderPlanning(){if(!$("seasonPlanList"))return;const ss=selectedSeasonPlan(),sw=selectedWeeklyPlan();$("seasonPlanList").innerHTML=appState.season_plans.length?appState.season_plans.slice().sort(byUpdated).map(s=>`<div class="planning-list-item ${s.id===ss?.id?"active":""}"><strong>${escapeHtml(s.name)}</strong><div class="list-meta">${escapeHtml(s.start_date||"—")} → ${escapeHtml(s.end_date||"—")} · ${escapeHtml(s.status||"active")}</div><div>${escapeHtml(s.overarching_goal||"")}</div><div class="planning-list-actions"><button data-season-use="${escapeHtml(s.id)}">Use</button><button class="secondary" data-season-edit="${escapeHtml(s.id)}">Edit</button></div></div>`).join(""):'<div class="help">No season plan yet.</div>';$("weeklyPlanList").innerHTML=appState.weekly_plans.length?appState.weekly_plans.slice().sort((a,b)=>String(b.week_start).localeCompare(String(a.week_start))).map(w=>`<div class="planning-list-item ${w.id===sw?.id?"active":""}"><strong>${escapeHtml(w.week_start)} · ${escapeHtml(w.phase||"Weekly plan")}</strong><div>${escapeHtml(w.objective||"")}</div><div class="list-meta">${escapeHtml(appState.season_plans.find(s=>s.id===w.season_plan_id)?.name||"Unlinked season")}</div><div class="planning-list-actions"><button data-week-use="${escapeHtml(w.id)}">Use</button><button class="secondary" data-week-edit="${escapeHtml(w.id)}">Edit</button></div></div>`).join(""):'<div class="help">No weekly plan yet.</div>';document.querySelectorAll("[data-season-use]").forEach(b=>b.onclick=()=>{appState.settings.selected_season_plan_id=b.dataset.seasonUse;saveState(appState);renderPlanning()});document.querySelectorAll("[data-season-edit]").forEach(b=>b.onclick=()=>fillSeasonEditor(appState.season_plans.find(s=>s.id===b.dataset.seasonEdit)));document.querySelectorAll("[data-week-use]").forEach(b=>b.onclick=()=>{appState.settings.selected_weekly_plan_id=b.dataset.weekUse;saveState(appState);renderPlanning()});document.querySelectorAll("[data-week-edit]").forEach(b=>b.onclick=()=>fillWeekEditor(appState.weekly_plans.find(w=>w.id===b.dataset.weekEdit)));v3PopulatePlanSelects();if(!$("seasonPlanId").value&&ss)fillSeasonEditor(ss);if(!$("weeklyPlanId").value&&sw)fillWeekEditor(sw)}
async function v3SaveSeason(){const old=appState.season_plans.find(s=>s.id===$("seasonPlanId").value),r={id:old?.id||uid("season"),name:$("seasonPlanName").value.trim(),start_date:$("seasonPlanStart").value||null,end_date:$("seasonPlanEnd").value||null,overarching_goal:$("seasonPlanGoal").value.trim(),status:$("seasonPlanStatus").value,updated_at:nowIso()};if(!r.name)return alert("Season name is required.");upsertLocal("season_plans",r);appState.settings.selected_season_plan_id=r.id;queueRecord("season_plans",r.id);saveState(appState);await syncIfPossible();fillSeasonEditor(r);renderAll()}
async function v3SaveWeek(){const old=appState.weekly_plans.find(w=>w.id===$("weeklyPlanId").value),r={id:old?.id||uid("week"),season_plan_id:$("weeklyPlanSeason").value||null,week_start:$("weeklyPlanStart").value,week_number:Number($("weeklyPlanNumber").value)||null,phase:$("weeklyPlanPhase").value.trim(),objective:$("weeklyPlanObjective").value.trim(),carry_forward:$("weeklyPlanCarry").value.trim(),notes:$("weeklyPlanNotes").value.trim(),updated_at:nowIso()};if(!r.week_start)return alert("Week starting date is required.");upsertLocal("weekly_plans",r);appState.settings.selected_weekly_plan_id=r.id;queueRecord("weekly_plans",r.id);saveState(appState);await syncIfPossible();fillWeekEditor(r);renderAll()}
async function v3DeletePlan(table,id){if(!id||!confirm("Delete this plan? Sessions will remain but become unlinked."))return;appState[table]=appState[table].filter(x=>x.id!==id);if(table==="season_plans")for(const w of appState.weekly_plans.filter(w=>w.season_plan_id===id)){w.season_plan_id=null;queueRecord("weekly_plans",w.id)}for(const s of appState.sessions){if((table==="season_plans"&&s.season_plan_id===id)||(table==="weekly_plans"&&s.weekly_plan_id===id)){if(table==="season_plans")s.season_plan_id=null;else s.weekly_plan_id=null;queueRecord("sessions",s.id)}}queueDelete(table,id);saveState(appState);await syncIfPossible();if(table==="season_plans")fillSeasonEditor(null);else fillWeekEditor(null);renderAll()}

// Session links and lanes
function fillSessionEditor(session){$("sessionEditorTitle").textContent=session?"Edit session":"New session";$("editSessionId").value=session?.id||"";$("editSessionDate").value=session?.session_date||"";$("editSessionPart").value=session?.day_part||"AM";$("editSessionVenue").value=session?.venue||"";$("editSessionDistance").value=session?.planned_distance||"";$("editSessionLaneCount").value=session?.lane_count||1;$("editSessionPoolCourse").value=session?.pool_course||"SCM";$("editSessionTitle").value=session?.title||"";$("editSessionSquads").value=(session?.squads||[]).join(", ");$("editSessionSystem").value=session?.primary_system||"";$("editSessionTechnical").value=session?.technical_focus||"";v3PopulatePlanSelects();$("editSessionSeasonPlan").value=session?.season_plan_id||"";v3PopulatePlanSelects();$("editSessionWeeklyPlan").value=session?.weekly_plan_id||"";$("editSessionSeason").value=session?.season_name||"";$("editSessionWeekStart").value=session?.week_start||"";$("editSessionWeekPhase").value=session?.week_phase||"";$("editSessionWeekObjective").value=session?.week_objective||"";$("editSessionWeekCarry").value=session?.week_carry_forward||"";$("editSessionPlanCue").value=session?.plan_cue||"";$("editSessionNextCue").value=session?.next_session_cue||"";$("editSessionWorkout").value=session?.workout||""}
function v3SessionPlan(session){const season=appState.season_plans.find(s=>s.id===session?.season_plan_id),week=appState.weekly_plans.find(w=>w.id===session?.weekly_plan_id);return {season,week}}
function v3LaneAssignment(sessionId,athlete){const a=appState.session_lane_assignments.find(x=>x.session_id===sessionId&&x.athlete_id===athlete.id);const count=Math.max(1,Number(selectedSession()?.lane_count||1));let lane=Number(a?.lane_number||athlete.training_lane||1);if(!Number.isFinite(lane)||lane<1)lane=1;return Math.min(count,lane)}
function timingLaneLabel(athlete){return `Lane ${v3LaneAssignment(selectedSession()?.id,athlete)}`}
function renderLaneAssignmentEditor(){const host=$("laneAssignmentEditor"),session=selectedSession();if(!host||!session)return;const count=Math.max(1,Math.min(12,Number($("liveLaneCount")?.value||session.lane_count||1)));host.innerHTML=`<div class="card-heading"><div><strong>${count} lane${count===1?"":"s"} in use</strong><div class="help">Change a swimmer once here; timing updates immediately.</div></div><button id="saveLaneAssignmentsBtn" class="secondary" type="button">Save lanes</button></div><div class="lane-editor-grid">${selectedRoster().map(a=>`<label class="lane-editor-athlete"><strong>${escapeHtml(a.full_name)}</strong><select data-lane-athlete="${escapeHtml(a.id)}">${Array.from({length:count},(_,i)=>`<option value="${i+1}" ${v3LaneAssignment(session.id,a)===i+1?"selected":""}>Lane ${i+1}</option>`).join("")}</select></label>`).join("")}</div>`;host.querySelectorAll("[data-lane-athlete]").forEach(el=>el.onchange=()=>{const athlete=appState.athletes.find(a=>a.id===el.dataset.laneAthlete);const existing=appState.session_lane_assignments.find(x=>x.session_id===session.id&&x.athlete_id===athlete.id);const r={id:existing?.id||uid("lane"),session_id:session.id,athlete_id:athlete.id,lane_number:Number(el.value),lane_order:athlete.timing_order||null,updated_at:nowIso()};upsertLocal("session_lane_assignments",r);queueRecord("session_lane_assignments",r.id);saveState(appState);resetLiveRoster();renderLiveBoard()});$("saveLaneAssignmentsBtn").onclick=async()=>{await syncIfPossible();updateStatus("Lane assignments saved","good")}}
const v3BaseRenderLiveBoard=renderLiveBoard;
function v3LaneNumberFromLabel(label){const match=String(label||"").match(/\d+/);return match?Number(match[0]):99}
function applyLaneOffsets(gap=Number($("liveWaveGap")?.value)||0){
  for(const channel of liveChannels){
    const athlete=appState.athletes.find(a=>a.id===channel.athlete_id);
    const lane=v3LaneAssignment(selectedSession()?.id,athlete);
    channel.offset=Math.max(0,(lane-1)*Math.max(0,Number(gap)||0));
  }
}
renderLiveBoard=function(){
  v3BaseRenderLiveBoard();
  const session=selectedSession();
  if($("liveLaneCount")&&session&&document.activeElement!==$("liveLaneCount")) $("liveLaneCount").value=session.lane_count||1;
  renderLaneAssignmentEditor();
};

// Test sets
function selectedTestSet(){return appState.test_sets.find(t=>t.id===appState.settings.selected_test_set_id)||appState.test_sets.find(t=>t.active)||appState.test_sets[0]||null}
function fillTestSetEditor(t){$("testSetEditorHeading").textContent=t?"Edit test set":"New test set";$("testSetId").value=t?.id||"";$("testSetName").value=t?.name||"";$("testSetCategory").value=t?.category||"";$("testSetStroke").value=t?.stroke||"Freestyle";$("testSetDistance").value=t?.distance||"";$("testSetReps").value=t?.reps||"";$("testSetInterval").value=t?.interval_text||"";$("testSetRecovery").value=t?.recovery_text||"";$("testSetDescription").value=t?.description||"";$("testSetEquipment").value=(t?.equipment||[]).join(", ");$("testSetMeasurements").value=(t?.measurement_types||[]).join(", ");$("testSetSquadVersions").value=v3MapLines(t?.squad_versions);$("testSetAdaptedVersions").value=v3MapLines(t?.adapted_versions);$("testSetActive").checked=t?.active!==false}
function v3PopulateTestSetSelect(){const el=$("liveTestSet");if(!el)return;const current=el.value||appState.settings.selected_test_set_id||"";el.innerHTML='<option value="">Normal timed set</option>'+appState.test_sets.filter(t=>t.active).map(t=>`<option value="${escapeHtml(t.id)}" ${t.id===current?"selected":""}>${escapeHtml(t.name)}</option>`).join("")}
function renderTestSets(){if(!$("testSetList"))return;const chosen=selectedTestSet();$("testSetList").innerHTML=appState.test_sets.length?appState.test_sets.slice().sort((a,b)=>Number(b.active)-Number(a.active)||String(a.name).localeCompare(String(b.name))).map(t=>`<div class="testset-list-item ${t.id===chosen?.id?"active":""}"><strong>${escapeHtml(t.name)}</strong><div>${t.reps||"?"} × ${t.distance||"?"} ${escapeHtml(t.stroke||"")} ${t.interval_text?`on ${escapeHtml(t.interval_text)}`:""}</div><div class="list-meta">${escapeHtml(t.category||"Test set")} · ${t.active?"Active":"Archived"}</div><div class="testset-list-actions"><button data-test-use="${escapeHtml(t.id)}">Use</button><button class="secondary" data-test-edit="${escapeHtml(t.id)}">Edit</button></div></div>`).join(""):'<div class="help">No test sets yet.</div>';document.querySelectorAll("[data-test-use]").forEach(b=>b.onclick=()=>{appState.settings.selected_test_set_id=b.dataset.testUse;saveState(appState);renderTestSets()});document.querySelectorAll("[data-test-edit]").forEach(b=>b.onclick=()=>fillTestSetEditor(appState.test_sets.find(t=>t.id===b.dataset.testEdit)));if(!$("testSetId").value&&chosen)fillTestSetEditor(chosen);const attempts=(appState.test_set_attempts||[]).filter(a=>a.test_set_id===chosen?.id).sort(byUpdated);$("testSetAttemptHistory").innerHTML=attempts.length?attempts.map(a=>{const athlete=appState.athletes.find(x=>x.id===a.athlete_id),times=Array.isArray(a.times)?a.times:[],best=times.length?Math.min(...times.map(Number)):null,avg=times.length?times.reduce((x,y)=>x+Number(y),0)/times.length:null;return `<div class="test-attempt-row"><strong>${escapeHtml(athlete?.full_name||"Unknown")}</strong><span>${escapeHtml(resultDateLabel(String(a.created_at||"").slice(0,10)))}</span><span>Best ${v3Time(best)}</span><span>Avg ${v3Time(avg)}</span></div>`}).join(""):'<div class="help">No attempts saved yet.</div>';v3PopulateTestSetSelect()}
async function v3SaveTestSet(){const old=appState.test_sets.find(t=>t.id===$("testSetId").value),r={id:old?.id||uid("test"),name:$("testSetName").value.trim(),category:$("testSetCategory").value.trim(),description:$("testSetDescription").value.trim(),distance:Number($("testSetDistance").value)||null,stroke:$("testSetStroke").value,reps:Number($("testSetReps").value)||null,interval_text:$("testSetInterval").value.trim(),recovery_text:$("testSetRecovery").value.trim(),equipment:$("testSetEquipment").value.split(",").map(x=>x.trim()).filter(Boolean),measurement_types:$("testSetMeasurements").value.split(",").map(x=>x.trim()).filter(Boolean),squad_versions:v3LineMap($("testSetSquadVersions").value),adapted_versions:v3LineMap($("testSetAdaptedVersions").value),active:$("testSetActive").checked,updated_at:nowIso()};if(!r.name)return alert("Test set name is required.");upsertLocal("test_sets",r);appState.settings.selected_test_set_id=r.id;queueRecord("test_sets",r.id);saveState(appState);await syncIfPossible();fillTestSetEditor(r);renderAll()}
async function v3DuplicateTestSet(){const t=appState.test_sets.find(x=>x.id===$("testSetId").value)||selectedTestSet();if(!t)return;const r={...clone(t),id:uid("test"),name:`${t.name} copy`,active:true,updated_at:nowIso()};upsertLocal("test_sets",r);appState.settings.selected_test_set_id=r.id;queueRecord("test_sets",r.id);saveState(appState);await syncIfPossible();fillTestSetEditor(r);renderAll();updateStatus("Test set duplicated","good")}
function v3LoadTestSet(t=selectedTestSet()){if(!t)return;appState.settings.selected_test_set_id=t.id;$("liveTestSet").value=t.id;$("liveSetLabel").value=t.name;$("liveReps").value=t.reps||1;$("liveDistance").value=String(t.distance||50);$("liveStroke").value=t.stroke||"Freestyle";$("liveCycle").value=t.interval_text||"1:00";saveState(appState);resetLiveRoster();showView("times");renderLiveBoard()}

// Results update portal
function v3PopulateResultAthletes(){for(const id of ["manualResultAthlete"]){const el=$(id);if(el)el.innerHTML=appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("")}}
function v3NameKey(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function v3MatchAthlete(name){const key=v3NameKey(name);if(!key)return null;const alias=(appState.coach_result_aliases||[]).find(a=>a.alias_key===key);if(alias){const matched=appState.athletes.find(a=>a.id===alias.athlete_id);if(matched)return matched}let exact=appState.athletes.find(a=>v3NameKey(a.full_name)===key);if(exact)return exact;const parts=key.split(" ");return appState.athletes.find(a=>{const ak=v3NameKey(a.full_name),ap=ak.split(" ");return parts.length>1&&ap.length>1&&parts[0]===ap[0]&&parts.at(-1)===ap.at(-1)})||null}
function v3DuplicateKey(r){return [r.athlete_id||v3NameKey(r.swimmer_name),r.result_date,r.meet_name,v3Course(r.course),Number(r.distance),v3Stroke(r.stroke),Number(r.result_seconds).toFixed(2),r.round||""].join("|").toLowerCase()}
function v3ExistingDuplicate(key){return (appState.coach_results||[]).some(r=>r.duplicate_key===key)||athleteHistory(resultImportPreview.find(x=>x.duplicate_key===key)?.athlete_id||"").some(r=>v3DuplicateKey(r)===key)}
function v3RefreshImportStatuses(){const seen=new Set();for(const r of resultImportPreview){const manuallyOff=r.status==="READY"&&r.use===false;r.duplicate_key=v3DuplicateKey(r);if(!r.athlete_id){r.status="UNMATCHED";r.use=false;continue}if(!r.result_seconds||!r.distance||!r.stroke){r.status="CHECK";r.use=false;continue}if(v3ExistingDuplicate(r.duplicate_key)||seen.has(r.duplicate_key)){r.status="DUPLICATE";r.use=false;continue}seen.add(r.duplicate_key);r.status="READY";if(!manuallyOff)r.use=true}}
function v3Delimited(text){const first=(text.split(/\r?\n/).find(Boolean)||"");const delim=first.includes("\t")?"\t":first.includes(",")?",":first.includes(";")?";":null;if(!delim)return [];const lines=text.split(/\r?\n/).filter(Boolean);const parse=line=>{const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===delim&&!q){out.push(cur);cur=""}else cur+=c}out.push(cur);return out};const headers=parse(lines[0]).map(h=>v3NameKey(h).replace(/ /g,"_"));return lines.slice(1).map(line=>Object.fromEntries(headers.map((h,i)=>[h,parse(line)[i]||""])))}
function v3Field(row,names){for(const n of names){const k=v3NameKey(n).replace(/ /g,"_");if(row[k]!==undefined&&String(row[k]).trim()!=="")return row[k]}return ""}
function v3ParseEvent(value){const s=String(value||"");const m=s.match(/(\d{2,4})\s*m?\s*(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual medley|im)/i);return m?{distance:Number(m[1]),stroke:v3Stroke(m[2])}:{distance:null,stroke:""}}
function v3ParseFixed(text){const rows=[];let meet="",date="";for(const line of text.split(/\r?\n/)){if(/^B1/.test(line)){meet=line.slice(2,50).trim()||meet;const dm=line.match(/(\d{2})(\d{2})(\d{4})/);if(dm)date=`${dm[3]}-${dm[1]}-${dm[2]}`;continue}if(!/^(D0|D1|E0|RESULT)/i.test(line))continue;const tm=line.match(/(?:^|\s)(\d{1,2}:\d{2}\.\d{1,2}|\d{2,3}\.\d{1,2})(?:\s|$)/);const ev=line.match(/(\d{2,4})\s*(FR|FREE|BK|BACK|BR|BREAST|FL|FLY|IM)/i);const nm=line.match(/([A-Za-z][A-Za-z' -]+),\s*([A-Za-z][A-Za-z' -]+)/);if(tm&&ev&&nm)rows.push({swimmer_name:`${nm[2].trim()} ${nm[1].trim()}`,result_time:tm[1],event:`${ev[1]} ${ev[2]}`,meet_name:meet,result_date:date})}return rows}
function v3NormaliseImportRow(raw,fallbackMeet,fallbackCourse){const event=v3ParseEvent(v3Field(raw,["event","event_name","race","event_description"]));const name=v3Field(raw,["name","swimmer","swimmer_name","athlete","full_name"])||raw.swimmer_name||"";const athlete=v3MatchAthlete(name);const time=v3Field(raw,["result_time","result","time","result_time_text","final_time"])||raw.result_time||"";const distance=Number(v3Field(raw,["distance","event_distance"])||event.distance||0),stroke=v3Stroke(v3Field(raw,["stroke","event_stroke"])||event.stroke);const course=v3Course(v3Field(raw,["course","pool_course","pool_length"])||fallbackCourse||"");const result={id:uid("preview"),athlete_id:athlete?.id||"",swimmer_name:name,result_date:v3Field(raw,["date","result_date","meet_date"])||raw.result_date||"",meet_name:v3Field(raw,["meet","meet_name","competition"])||raw.meet_name||fallbackMeet||"",course,distance,stroke,round:v3Field(raw,["round","stage","heat_or_final"]),result_time_text:time,result_seconds:v3Seconds(time),wa_points:Number(v3Field(raw,["wa_points","world_aquatics_points","fina_points","points"]))||null,world_para_points:Number(v3Field(raw,["world_para_points","para_points"]))||null,official_place:v3Field(raw,["place","official_place","rank"]),source_type:"file",raw_row:raw,use:true};result.duplicate_key=v3DuplicateKey(result);result.status=!result.athlete_id?"UNMATCHED":!result.result_seconds||!result.distance||!result.stroke?"CHECK":v3ExistingDuplicate(result.duplicate_key)?"DUPLICATE":"READY";if(result.status==="DUPLICATE")result.use=false;return result}
async function v3InflateRaw(bytes){
  if(typeof DecompressionStream!=="function")throw new Error("This browser cannot unpack compressed ZIP files.");
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function v3ReadResultsZip(file){
  const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder("utf-8");
  let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-66000);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error("ZIP directory was not found.");
  const count=view.getUint16(eocd+10,true),centralOffset=view.getUint32(eocd+16,true),entries=[];let pos=centralOffset;
  for(let i=0;i<count;i++){
    if(view.getUint32(pos,true)!==0x02014b50)break;
    const method=view.getUint16(pos+10,true),compressedSize=view.getUint32(pos+20,true),nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true),localOffset=view.getUint32(pos+42,true),name=decoder.decode(bytes.slice(pos+46,pos+46+nameLen));
    if(/\.(csv|tsv|txt|sd3|hy3)$/i.test(name)&&!name.endsWith("/"))entries.push({name,method,compressedSize,localOffset});
    pos+=46+nameLen+extraLen+commentLen;
  }
  if(!entries.length)throw new Error("No CSV, TSV, TXT, SD3 or HY3 result file was found inside the ZIP.");
  entries.sort((a,b)=>({csv:0,tsv:1,sd3:2,hy3:3,txt:4}[a.name.split(".").pop().toLowerCase()]??9)-({csv:0,tsv:1,sd3:2,hy3:3,txt:4}[b.name.split(".").pop().toLowerCase()]??9));
  const entry=entries[0],off=entry.localOffset;if(view.getUint32(off,true)!==0x04034b50)throw new Error("ZIP result entry is damaged.");
  const nameLen=view.getUint16(off+26,true),extraLen=view.getUint16(off+28,true),start=off+30+nameLen+extraLen,compressed=bytes.slice(start,start+entry.compressedSize);
  const raw=entry.method===0?compressed:entry.method===8?await v3InflateRaw(compressed):null;
  if(!raw)throw new Error(`ZIP compression method ${entry.method} is not supported.`);
  return {name:entry.name,text:new TextDecoder("utf-8").decode(raw)};
}
async function v3ParseResultsFile(){const file=$("resultsFileInput").files[0];if(!file)return alert("Choose a file first.");resultImportFileName=file.name;let text="";try{if(file.name.toLowerCase().endsWith(".zip")){const unpacked=await v3ReadResultsZip(file);text=unpacked.text;resultImportFileName=`${file.name} :: ${unpacked.name}`}else text=await file.text()}catch(error){$("resultImportSummary").innerHTML=`<div class="source-warning">${escapeHtml(error.message)}</div>`;return}let raw=v3Delimited(text);if(!raw.length)raw=v3ParseFixed(text);resultImportPreview=raw.map(r=>v3NormaliseImportRow(r,$("importMeetName").value.trim(),$("importCourse").value));v3RefreshImportStatuses();renderResultImportPreview()}
function renderResultImportPreview(){if(!$("resultsImportBody"))return;const counts=resultImportPreview.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{});$("resultImportSummary").textContent=`${resultImportFileName||"Preview"}: ${resultImportPreview.length} rows · ${counts.READY||0} ready · ${counts.UNMATCHED||0} unmatched · ${counts.DUPLICATE||0} duplicates · ${counts.CHECK||0} check`;$("commitResultsImportBtn").disabled=!resultImportPreview.some(r=>r.use&&r.athlete_id&&r.status!=="DUPLICATE"&&r.result_seconds);$("resultsImportBody").innerHTML=resultImportPreview.map((r,i)=>`<tr><td><input type="checkbox" data-import-use="${i}" ${r.use?"checked":""}></td><td>${escapeHtml(r.swimmer_name||"—")}</td><td><select class="import-match-select" data-import-athlete="${i}"><option value="">Hold unmatched</option>${appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===r.athlete_id?"selected":""}>${escapeHtml(a.full_name)}</option>`).join("")}</select></td><td>${escapeHtml(r.result_date||"—")}</td><td>${escapeHtml(r.meet_name||"—")}</td><td>${escapeHtml(r.course||"—")}</td><td>${r.distance||"?"} ${escapeHtml(r.stroke||"?")}</td><td>${escapeHtml(r.result_time_text||"—")}</td><td>${r.world_para_points||r.wa_points||"—"}</td><td class="${r.status==="READY"?"match-good":r.status==="DUPLICATE"?"match-duplicate":"match-hold"}">${r.status}</td></tr>`).join("");document.querySelectorAll("[data-import-use]").forEach(el=>el.onchange=()=>{resultImportPreview[Number(el.dataset.importUse)].use=el.checked;renderResultImportPreview()});document.querySelectorAll("[data-import-athlete]").forEach(el=>el.onchange=()=>{const r=resultImportPreview[Number(el.dataset.importAthlete)];r.athlete_id=el.value;v3RefreshImportStatuses();renderResultImportPreview()});const held=resultImportPreview.filter(r=>!r.use||!r.athlete_id||r.status!=="READY");$("heldResultsList").innerHTML=held.length?held.map(r=>`<div class="list-item"><strong>${escapeHtml(r.swimmer_name||"Unknown")} · ${r.distance||"?"} ${escapeHtml(r.stroke||"")}</strong><div>${escapeHtml(r.status)} · ${escapeHtml(r.result_time_text||"No time")}</div></div>`).join(""):'<div class="help">Nothing held.</div>'}
async function v3CommitImport(){const accepted=resultImportPreview.filter(r=>r.use&&r.athlete_id&&r.status==="READY"&&r.result_seconds);if(!accepted.length)return;const batch={id:uid("import"),file_name:resultImportFileName,source_type:"file",meet_name:$("importMeetName").value.trim(),imported_rows:accepted.length,held_rows:resultImportPreview.length-accepted.length,created_at:nowIso(),updated_at:nowIso()};upsertLocal("coach_result_imports",batch);queueRecord("coach_result_imports",batch.id);for(const r of accepted){const row={...r,id:uid("result"),import_batch_id:batch.id,source_file:resultImportFileName,reviewed:true,created_at:nowIso(),updated_at:nowIso()};delete row.use;delete row.status;upsertLocal("coach_results",row);queueRecord("coach_results",row.id);const athlete=appState.athletes.find(a=>a.id===r.athlete_id),aliasKey=v3NameKey(r.swimmer_name);if(athlete&&aliasKey&&aliasKey!==v3NameKey(athlete.full_name)){const oldAlias=(appState.coach_result_aliases||[]).find(a=>a.alias_key===aliasKey);const alias={id:oldAlias?.id||uid("alias"),alias_name:r.swimmer_name,alias_key:aliasKey,athlete_id:athlete.id,updated_at:nowIso()};upsertLocal("coach_result_aliases",alias);queueRecord("coach_result_aliases",alias.id)}}saveState(appState);await syncIfPossible();resultImportPreview=[];renderResultImportPreview();renderAll();updateStatus(`${accepted.length} results saved and PBs refreshed`,"good")}
async function v3SaveManualResult(){const athlete=appState.athletes.find(a=>a.id===$("manualResultAthlete").value),time=$("manualResultTime").value.trim(),r={id:uid("result"),athlete_id:athlete?.id||null,swimmer_name:athlete?.full_name||"",result_date:$("manualResultDate").value||null,meet_name:$("manualResultMeet").value.trim(),course:$("manualResultCourse").value,distance:Number($("manualResultDistance").value),stroke:$("manualResultStroke").value,round:$("manualResultRound").value.trim(),result_time_text:time,result_seconds:v3Seconds(time),wa_points:Number($("manualResultWa").value)||null,world_para_points:Number($("manualResultPara").value)||null,source_type:"manual",reviewed:true,created_at:nowIso(),updated_at:nowIso()};r.duplicate_key=v3DuplicateKey(r);if(!r.athlete_id||!r.result_date||!r.meet_name||!r.distance||!r.result_seconds)return alert("Swimmer, date, meet, event and valid time are required.");if((appState.coach_results||[]).some(x=>x.duplicate_key===r.duplicate_key))return alert("That result is already saved.");upsertLocal("coach_results",r);queueRecord("coach_results",r.id);saveState(appState);await syncIfPossible();$("manualResultMessage").textContent=`Saved ${r.distance} ${r.stroke} ${r.result_time_text}. PBs updated.`;renderAll()}
function renderResultsUpdate(){if(!$("manualResultAthlete"))return;v3PopulateResultAthletes();if(!$("manualResultDate").value)$("manualResultDate").value=localIsoDate(new Date());renderResultImportPreview()}

// Cloud schema mapping and pulls
function cloudRow(table,record){const org=appState.settings.organisation_id,user=getAuth()?.user?.id,base={...record,organisation_id:org,created_by:user};if(table==="athletes")return {id:base.id,organisation_id:org,full_name:base.full_name,squad:base.squad,active:base.active,legacy_pace:base.legacy_pace,date_of_birth:base.date_of_birth,primary_events:base.primary_events||[],current_focus:base.current_focus,technical_focus:base.technical_focus,modifications:base.modifications,coach_notes:base.coach_notes,next_meet_name:base.next_meet_name,next_meet_date:base.next_meet_date,next_meet_venue:base.next_meet_venue,pb_summary:base.pb_summary||[],qualifying_summary:base.qualifying_summary||[],records_summary:base.records_summary||[],training_lane:base.training_lane||null,timing_order:base.timing_order||null,sex:base.sex||null,current_s_class:base.current_s_class||null,current_sb_class:base.current_sb_class||null,current_sm_class:base.current_sm_class||null,updated_at:base.updated_at,created_by:user};if(table==="sessions")return {id:base.id,organisation_id:org,session_date:base.session_date,day_part:base.day_part,venue:base.venue,title:base.title,squads:base.squads,planned_distance:base.planned_distance,primary_system:base.primary_system,technical_focus:base.technical_focus,plan_cue:base.plan_cue,next_session_cue:base.next_session_cue,season_name:base.season_name||null,week_start:base.week_start||null,week_phase:base.week_phase||null,week_objective:base.week_objective||null,week_carry_forward:base.week_carry_forward||null,season_plan_id:base.season_plan_id||null,weekly_plan_id:base.weekly_plan_id||null,lane_count:base.lane_count||1,pool_course:base.pool_course||"SCM",workout:base.workout,sets:base.sets||[],step_number:base.step_number,previous_session_id:base.previous_session_id,status:base.status,updated_at:base.updated_at,created_by:user};if(table==="attendance")return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,status:base.status,note:base.note,updated_at:base.updated_at,created_by:user};if(table==="captures")return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,capture_type:base.capture_type,text_content:base.text_content,media_path:base.media_path,mime_type:base.mime_type,session_block_id:base.session_block_id||null,created_at:base.created_at,updated_at:base.updated_at,created_by:user};if(table==="timed_sets")return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,distance:base.distance,stroke:base.stroke,set_label:base.set_label,send_off:base.send_off,times:base.times,average:base.average,best:base.best,spread:base.spread,lane_number:base.lane_number||null,test_set_id:base.test_set_id||null,test_set_attempt_id:base.test_set_attempt_id||null,created_at:base.created_at,updated_at:base.updated_at,created_by:user};if(table==="session_reviews")return {id:base.id,organisation_id:org,session_id:base.session_id,went_well:base.went_well,reinforce:base.reinforce,athlete_notes:base.athlete_notes,carry_forward:base.carry_forward,actual_distance:base.actual_distance||0,actual_duration:base.actual_duration||0,energy_systems:base.energy_systems||{},training_modes:base.training_modes||{},stroke_exposure:base.stroke_exposure||{},athlete_response:base.athlete_response,modifications:base.modifications,race_split_evidence:base.race_split_evidence,completed_at:base.completed_at,updated_at:base.updated_at,created_by:user};if(["season_plans","weekly_plans","session_lane_assignments","session_blocks","session_transcriptions","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases","race_goals"].includes(table)){const clean={...base};delete clean.use;delete clean.status;return clean}return base}
async function pullCloud(){if(!cloudReady())return;const org=appState.settings.organisation_id;for(const table of CLOUD_TABLES){try{const rows=await cloudFetch(`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`),remote=rows.map(stripCloudFields),pendingIds=new Set((appState.pending||[]).filter(p=>p.table===table&&p.action==="upsert").map(p=>p.id)),unsynced=(appState[table]||[]).filter(r=>pendingIds.has(r.id));appState[table]=mergeCollection(remote,unsynced)}catch(error){console.warn(`Optional v3 table ${table} not available`,error);if(!Array.isArray(appState[table]))appState[table]=[]}}for(const view of RESULT_VIEWS){try{const rows=await cloudFetch(`/rest/v1/${view}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);appState[view]=rows.map(stripCloudFields)}catch(error){console.warn(`Optional result source ${view} not available`,error);if(!Array.isArray(appState[view]))appState[view]=[]}}for(const table of ["pathway_standards","pathway_meets"]){try{appState[table]=await cloudFetch(`/rest/v1/${table}?select=*&${table==="pathway_standards"?"active=eq.true&":""}order=progression_order.asc`)}catch(error){console.warn(`Pathway source ${table} unavailable`,error);if(!Array.isArray(appState[table]))appState[table]=[]}}if(!appState.sessions.some(s=>s.id===appState.settings.selected_session_id)){const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];appState.settings.selected_session_id=next?.id||"";appState.settings.selected_squad=sessionSquads(next)[0]||"";resetLiveRoster()}saveState(appState)}

function renderDeck(){const session=selectedSession();const deckPicker=$("deckSessionPicker");if(deckPicker){const sessions=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`));deckPicker.innerHTML=sessions.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===session?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");deckPicker.onchange=()=>setSelectedSession(deckPicker.value)}if(!session){$("deckSessionLabel").textContent="No session selected";$("deckSessionTitle").textContent="Choose or create the actual session";$("deckWorkout").textContent="No session loaded.";return}$("deckSessionLabel").textContent=sessionLabel(session);$("deckSessionTitle").textContent=session.title;$("deckSystem").textContent=session.primary_system||"—";$("deckTechnical").textContent=session.technical_focus||"—";$("deckCueChips").innerHTML=[`<span class="chip">${escapeHtml(session.venue||"")}</span>`,...sessionSquads(session).map(s=>`<span class="chip">${escapeHtml(s)}</span>`),`<span class="chip">${Number(session.planned_distance||0).toLocaleString()}m</span>`,`<span class="chip">${Number(session.lane_count||1)} lane${Number(session.lane_count||1)===1?"":"s"}</span>`].join("");$("deckWorkout").textContent=session.workout||"No workout entered.";const sets=session.sets?.length?session.sets:extractStructuredSets(session.workout);$("deckSetList").innerHTML=sets.length?sets.map((set,index)=>`<div class="deck-set-row"><div><strong>${escapeHtml(set.label||`${set.reps} × ${set.distance}`)}</strong><small>${set.reps} × ${set.distance} · ${escapeHtml(set.stroke||"")}${set.cycle?` · on ${escapeHtml(set.cycle)}`:""}</small></div><button type="button" data-run-set="${index}">Run live</button></div>`).join(""):'<div class="help">No repeating sets detected.</div>';document.querySelectorAll("[data-run-set]").forEach(btn=>btn.onclick=()=>runStructuredSet(sets[Number(btn.dataset.runSet)]));const {season,week}=v3SessionPlan(session),previous=appState.sessions.find(s=>s.id===session.previous_session_id)||appState.sessions.filter(s=>`${s.session_date}-${s.day_part}`<`${session.session_date}-${session.day_part}`).sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0],previousReview=previous?sessionReview(previous.id):null,next=nextPlannedSession(session);$("deckPlanThread").innerHTML=`<div class="plan-chain"><div class="plan-chain-row"><span>Season</span><strong>${escapeHtml(season?.name||session.season_name||"Season not linked")}</strong></div><div class="plan-chain-row"><span>Week${week?.week_start?` · ${escapeHtml(formatDate(week.week_start))}`:session.week_start?` · ${escapeHtml(formatDate(session.week_start))}`:""}</span><strong>${escapeHtml(week?.phase||session.week_phase||"Weekly plan not linked")}</strong></div><div class="plan-chain-row"><span>Weekly objective</span><strong>${escapeHtml(week?.objective||session.week_objective||"Not entered")}</strong></div>${week?.carry_forward||session.week_carry_forward?`<div class="plan-chain-row"><span>Carry from last week</span><strong>${escapeHtml(week?.carry_forward||session.week_carry_forward)}</strong></div>`:""}</div><div class="plan-thread-row"><span>Carry from last session</span><strong>${escapeHtml(previousReview?.carry_forward||session.plan_cue||"No carry-forward logged yet.")}</strong></div><div class="plan-thread-row"><span>Today’s purpose</span><strong>${escapeHtml(session.primary_system||"—")} · ${escapeHtml(session.technical_focus||"—")}</strong></div><div class="plan-thread-row"><span>Lead into next session</span><strong>${escapeHtml(session.next_session_cue||next?.technical_focus||next?.title||"Next-session cue not entered yet.")}</strong></div>`;$("deckNextSession").innerHTML=next?`<strong>${escapeHtml(sessionLabel(next))} — ${escapeHtml(next.title)}</strong><div>${escapeHtml(next.primary_system||"")}</div>`:'<div class="warning-box">No later session entered yet.</div>'}

function renderAll(){
  const active=document.querySelector(".view.active")?.id||"deck";
  renderView(active);
  if(active==="times"&&typeof v3PopulateTestSetSelect==="function")v3PopulateTestSetSelect();
}

// =============================================================================
// McLay Swimming OS v3.2 base — complete phone management, whole session blocks,
// target-meet results, points, splits, goals and session-photo transcription.
// =============================================================================
const V32_BLOCK_ORDER={warm_up:10,pre_set:20,skill:30,main_set:40,post_set:50,warm_down:60,other:70};
const V32_BLOCK_LABELS={warm_up:"Warm-up",pre_set:"Pre-set",skill:"Skill block",main_set:"Main set",post_set:"Post-set / reinforcement",warm_down:"Warm-down",other:"Other"};
let v32LiveBlockState=null;
let v32CurrentTranscriptionId="";
let v32GoalDraftSplits=[];

function v32Array(value){if(Array.isArray(value))return value;if(value===null||value===undefined||value==="")return [];try{const p=JSON.parse(value);return Array.isArray(p)?p:[]}catch{return []}}
function v32Object(value){if(value&&typeof value==="object"&&!Array.isArray(value))return value;try{const p=JSON.parse(value);return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}catch{return {}}}
function v32NormaliseBlockType(value){const s=String(value||"").toLowerCase().replace(/[^a-z]+/g," ").trim();if(/warm.?up/.test(s))return "warm_up";if(/pre.?set|activation|primer/.test(s))return "pre_set";if(/skill|school work|alignment|technical/.test(s))return "skill";if(/main/.test(s))return "main_set";if(/post|reinforce|reset/.test(s))return "post_set";if(/warm.?down|cool.?down/.test(s))return "warm_down";return "other"}
function v32BlockLabel(type){return V32_BLOCK_LABELS[type]||V32_BLOCK_LABELS.other}
function v32ParseSetLine(line,index=0){
  const raw=String(line||"").trim();if(!raw)return null;
  const parts=raw.split("|").map(x=>x.trim());
  const core=parts[0]||raw;
  const m=core.match(/(\d+)\s*[x×]\s*(\d+)\s*m?/i);
  const cycle=(parts[1]||core.match(/(?:on|@)\s*(\d{0,2}:?\d{1,2}(?:\.\d+)?)/i)?.[1]||"").trim();
  let stroke=(parts[2]||"").trim();
  if(!stroke){const sm=core.match(/\b(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|IM|medley|kick|pull|choice)\b/i);stroke=sm?v3Stroke(sm[1]):""}
  const instruction=(parts.slice(3).join(" | ")||(!m?raw:core.replace(m[0],"").replace(/(?:on|@)\s*\S+/i,"").trim())).trim();
  return {id:uid("block-line"),sort_order:index+1,raw,label:core,reps:m?Number(m[1]):1,distance:m?Number(m[2]):null,cycle,stroke:stroke||"Choice",instruction};
}
function v32BlockItemsFromText(text){return String(text||"").split(/\r?\n/).map((line,i)=>v32ParseSetLine(line,i)).filter(Boolean)}
function v32BlockItemsText(items){return v32Array(items).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)).map(item=>item.raw||[`${item.reps||1} x ${item.distance||"?"}`,item.cycle,item.stroke,item.instruction].filter(Boolean).join(" | ")).join("\n")}
function v32SessionBlocks(sessionId){return (appState.session_blocks||[]).filter(b=>b.session_id===sessionId).sort((a,b)=>Number(a.sort_order||V32_BLOCK_ORDER[a.block_type]||99)-Number(b.sort_order||V32_BLOCK_ORDER[b.block_type]||99)||String(a.title||"").localeCompare(String(b.title||"")))}
function v32BlockSummary(block){const items=v32Array(block.items);return `${items.length} line${items.length===1?"":"s"}${items.reduce((n,i)=>n+Number(i.reps||0)*Number(i.distance||0),0)?` · ${items.reduce((n,i)=>n+Number(i.reps||0)*Number(i.distance||0),0).toLocaleString()}m`:""}`}
function v32ParseWorkoutBlocks(text){
  const blocks=[];let current={block_type:"other",title:"Session work",lines:[]};
  const flush=()=>{if(current.lines.length){blocks.push({...current,items:v32BlockItemsFromText(current.lines.join("\n"))});current={block_type:"other",title:"Other",lines:[]}}};
  for(const raw of String(text||"").split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    const heading=line.replace(/[:\-–—]+$/g,"").trim();const type=v32NormaliseBlockType(heading);
    const looksHeading=type!=="other"&&heading.length<45&&!/\d+\s*[x×]\s*\d+/.test(heading);
    if(looksHeading){flush();current={block_type:type,title:v32BlockLabel(type),lines:[]};continue}
    current.lines.push(line);
  }
  flush();
  if(!blocks.length&&String(text||"").trim())blocks.push({block_type:"main_set",title:"Main set",items:v32BlockItemsFromText(text)});
  return blocks;
}
async function v32ImportWorkoutBlocks(session){
  if(!session)return;const existing=v32SessionBlocks(session.id);if(existing.length&&!confirm("Replace the current structured blocks with blocks rebuilt from the workout text?"))return;
  for(const b of existing){appState.session_blocks=appState.session_blocks.filter(x=>x.id!==b.id);queueDelete("session_blocks",b.id)}
  const parsed=v32ParseWorkoutBlocks(v33WorkoutForBlocks(session.workout||""));
  parsed.forEach((b,i)=>{const record={id:uid("block"),session_id:session.id,block_type:b.block_type,title:b.title,sort_order:V32_BLOCK_ORDER[b.block_type]||70+i,items:b.items,notes:"Built from workout text",status:"planned",updated_at:nowIso()};upsertLocal("session_blocks",record);queueRecord("session_blocks",record.id)});
  saveState(appState);renderAll();scheduleFastSync();updateStatus(`${parsed.length} session blocks built`,"good")
}
function v32FillBlockEditor(block=null){
  const editor=$("sessionBlockEditor");if(!editor)return;editor.hidden=false;
  $("sessionBlockId").value=block?.id||"";$("sessionBlockType").value=block?.block_type||"main_set";$("sessionBlockTitle").value=block?.title||v32BlockLabel(block?.block_type||"main_set");$("sessionBlockItems").value=v32BlockItemsText(block?.items||[]);$("sessionBlockNotes").value=block?.notes||"";
  editor.scrollIntoView({block:"nearest",behavior:"smooth"});
}
async function v32SaveSessionBlock(){
  const session=appState.sessions.find(s=>s.id===($("editSessionId")?.value||selectedSession()?.id));if(!session)return alert("Choose or save the session first.");
  const old=appState.session_blocks.find(b=>b.id===$("sessionBlockId").value),type=$("sessionBlockType").value;
  const items=v32BlockItemsFromText($("sessionBlockItems").value);if(!items.length)return alert("Add at least one set line.");
  const sameType=v32SessionBlocks(session.id).filter(b=>b.block_type===type&&b.id!==old?.id);
  const r={id:old?.id||uid("block"),session_id:session.id,block_type:type,title:$("sessionBlockTitle").value.trim()||v32BlockLabel(type),sort_order:old?.sort_order??(V32_BLOCK_ORDER[type]+sameType.length),items,notes:$("sessionBlockNotes").value.trim(),status:old?.status||"planned",updated_at:nowIso()};
  upsertLocal("session_blocks",r);queueRecord("session_blocks",r.id);saveState(appState);v32FillBlockEditor(r);renderAll();scheduleFastSync();updateStatus("Session block saved","good")
}
async function v32DeleteSessionBlock(id=$("sessionBlockId")?.value){const b=appState.session_blocks.find(x=>x.id===id);if(!b||!confirm(`Delete ${b.title||v32BlockLabel(b.block_type)}?`))return;appState.session_blocks=appState.session_blocks.filter(x=>x.id!==id);queueDelete("session_blocks",id);saveState(appState);scheduleFastSync();if($("sessionBlockEditor"))$("sessionBlockEditor").hidden=true;renderAll();updateStatus("Session block deleted","good")}
async function v32DuplicateSessionBlock(id=$("sessionBlockId")?.value){const b=appState.session_blocks.find(x=>x.id===id);if(!b)return;const r={...clone(b),id:uid("block"),title:`${b.title} copy`,sort_order:Number(b.sort_order||0)+0.1,updated_at:nowIso()};upsertLocal("session_blocks",r);queueRecord("session_blocks",r.id);saveState(appState);v32FillBlockEditor(r);renderAll();scheduleFastSync()}
async function v32MoveBlock(id,direction){const blocks=v32SessionBlocks(appState.session_blocks.find(b=>b.id===id)?.session_id);const i=blocks.findIndex(b=>b.id===id),j=i+direction;if(i<0||j<0||j>=blocks.length)return;const a=blocks[i],b=blocks[j],tmp=Number(a.sort_order||i);a.sort_order=Number(b.sort_order||j);b.sort_order=tmp;a.updated_at=b.updated_at=nowIso();queueRecord("session_blocks",a.id);queueRecord("session_blocks",b.id);saveState(appState);renderAll();scheduleFastSync()}
function v32RenderSessionBlocks(){
  const host=$("sessionBlockList");if(!host)return;const session=appState.sessions.find(s=>s.id===($("editSessionId")?.value||selectedSession()?.id))||selectedSession();const blocks=v32SessionBlocks(session?.id);
  if(!session){host.innerHTML='<div class="help">Save or select a session first.</div>';return}
  host.innerHTML=blocks.length?blocks.map((b,bi)=>`<div class="session-block-card"><div class="session-block-head"><div><div class="eyebrow">${escapeHtml(v32BlockLabel(b.block_type))}</div><strong>${escapeHtml(b.title||v32BlockLabel(b.block_type))}</strong><div class="list-meta">${escapeHtml(v32BlockSummary(b))}</div></div><span class="badge">${bi+1}</span></div><div class="session-block-items">${v32Array(b.items).map((item,i)=>`<div class="session-block-item"><span class="order">${i+1}</span><div><strong>${escapeHtml(item.raw||item.label||"Set line")}</strong>${item.instruction?`<div class="list-meta">${escapeHtml(item.instruction)}</div>`:""}</div></div>`).join("")}</div><div class="session-block-actions"><button data-block-run="${escapeHtml(b.id)}">Coach on Deck</button><button class="secondary" data-block-edit="${escapeHtml(b.id)}">Edit</button><button class="secondary" data-block-up="${escapeHtml(b.id)}">↑</button><button class="secondary" data-block-down="${escapeHtml(b.id)}">↓</button><button class="secondary" data-block-copy="${escapeHtml(b.id)}">Duplicate</button><button class="danger-button" data-block-delete="${escapeHtml(b.id)}">Delete</button></div></div>`).join(""):`<div class="warning-box">No complete blocks saved yet.</div><div class="button-row"><button id="buildBlocksFromWorkoutBtn" type="button">Build blocks from current workout</button></div>`;
  host.querySelectorAll("[data-block-run]").forEach(button=>button.onclick=()=>{
    const block=appState.session_blocks.find(x=>x.id===button.dataset.blockRun);if(!block)return;
    const session=appState.sessions.find(x=>x.id===block.session_id);if(session){appState.settings.selected_session_id=session.id;appState.settings.selected_squad=sessionSquads(session)[0]||appState.settings.selected_squad||""}
    v35SetActiveBlock(block.session_id,block.id);saveState(appState);showView("deck");requestAnimationFrame(()=>v374RenderDeckBlocks());
  });host.querySelectorAll("[data-block-edit]").forEach(b=>b.onclick=()=>v32FillBlockEditor(appState.session_blocks.find(x=>x.id===b.dataset.blockEdit)));host.querySelectorAll("[data-block-up]").forEach(b=>b.onclick=()=>v32MoveBlock(b.dataset.blockUp,-1));host.querySelectorAll("[data-block-down]").forEach(b=>b.onclick=()=>v32MoveBlock(b.dataset.blockDown,1));host.querySelectorAll("[data-block-copy]").forEach(b=>b.onclick=()=>v32DuplicateSessionBlock(b.dataset.blockCopy));host.querySelectorAll("[data-block-delete]").forEach(b=>b.onclick=()=>v32DeleteSessionBlock(b.dataset.blockDelete));if($("buildBlocksFromWorkoutBtn"))$("buildBlocksFromWorkoutBtn").onclick=()=>v32ImportWorkoutBlocks(session);
}
function v32LoadLiveLine(item){if(!item)return;$("liveSetLabel").value=item.raw||item.label||"Session line";$("liveReps").value=item.reps||1;if(item.distance&&[...$("liveDistance").options].some(o=>Number(o.value)===Number(item.distance)))$("liveDistance").value=String(item.distance);const stroke=v3Stroke(item.stroke||"Freestyle");if([...$("liveStroke").options].some(o=>o.value===stroke))$("liveStroke").value=stroke;if(item.cycle)$("liveCycle").value=item.cycle;resetLiveSet();resetLiveRoster();renderLiveBoard();v32RenderLiveBlockRunner()}
function v32RunBlock(blockId){const block=appState.session_blocks.find(b=>b.id===blockId);if(!block)return;const items=v32Array(block.items);if(!items.length)return alert("This block has no set lines.");v32LiveBlockState={source:"session",id:block.id,title:block.title||v32BlockLabel(block.block_type),items,index:0};showView("times");v32LoadLiveLine(items[0])}
function v32RunTestSetSegments(test){const items=v32Array(test.segments);if(!items.length){v3LoadTestSet(test);return}v32LiveBlockState={source:"test",id:test.id,title:test.name,items,index:0};showView("times");if($("liveTestSet"))$("liveTestSet").value=test.id;v32LoadLiveLine(items[0])}
function v32RenderLiveBlockRunner(){const card=$("liveBlockRunnerCard");if(!card)return;if(!v32LiveBlockState){card.hidden=true;return}card.hidden=false;const s=v32LiveBlockState;$("liveBlockRunnerTitle").textContent=s.title;$("liveBlockRunnerCounter").textContent=`${s.index+1} / ${s.items.length}`;$("liveBlockRunnerSteps").innerHTML=s.items.map((item,i)=>`<div class="block-runner-step ${i===s.index?"active":""}"><strong>${i+1}. ${escapeHtml(item.raw||item.label||"Set line")}</strong>${item.instruction?`<div>${escapeHtml(item.instruction)}</div>`:""}</div>`).join("");$("liveBlockPrevBtn").disabled=s.index===0;$("liveBlockNextBtn").disabled=s.index>=s.items.length-1}
function v32StepLiveBlock(direction){if(!v32LiveBlockState)return;const next=v32LiveBlockState.index+direction;if(next<0||next>=v32LiveBlockState.items.length)return;v32LiveBlockState.index=next;v32LoadLiveLine(v32LiveBlockState.items[next])}

// ----- Season-plan meet source of truth -----
function v32ParseSeasonMeets(text){
  return String(text||"").split(/\r?\n/).map((line,index)=>{
    const p=line.split("|").map(x=>x.trim());if(!p.some(Boolean))return null;
    return {id:`meet-${index+1}`,date:p[0]||"",name:p[1]||p[0]||"Meet",course:v3Course(p[2]||""),status:(p[3]||"planned").toLowerCase(),venue:p[4]||"",entry_deadline:p[5]||"",notes:p.slice(6).join(" | ")};
  }).filter(Boolean)
}
function v32SeasonMeetsText(meets){return v32Array(meets).map(m=>[m.date,m.name,m.course,m.status,m.venue,m.entry_deadline,m.notes].filter((x,i)=>x||i<4).join(" | ")).join("\n")}
const v32BaseFillSeasonEditor=fillSeasonEditor;
fillSeasonEditor=function(s){v32BaseFillSeasonEditor(s);if($("seasonPlanMeets"))$("seasonPlanMeets").value=v32SeasonMeetsText(s?.meet_plan)};
async function v32SaveSeason(){
  const old=appState.season_plans.find(s=>s.id===$("seasonPlanId").value),r={id:old?.id||uid("season"),name:$("seasonPlanName").value.trim(),start_date:$("seasonPlanStart").value||null,end_date:$("seasonPlanEnd").value||null,overarching_goal:$("seasonPlanGoal").value.trim(),status:$("seasonPlanStatus").value,meet_plan:v32ParseSeasonMeets($("seasonPlanMeets")?.value),plan_document_text:old?.plan_document_text||"",updated_at:nowIso()};
  if(!r.name)return alert("Season name is required.");upsertLocal("season_plans",r);appState.settings.selected_season_plan_id=r.id;queueRecord("season_plans",r.id);saveState(appState);await syncIfPossible();fillSeasonEditor(r);renderAll();updateStatus("Season plan and meets saved","good")
}
v3SaveSeason=v32SaveSeason;
function v32SelectedSeason(){return appState.season_plans.find(s=>s.id===appState.settings.selected_season_plan_id)||appState.season_plans.find(s=>s.id===selectedSession()?.season_plan_id)||appState.season_plans.find(s=>s.status==="active")||appState.season_plans[0]||null}
function v32AllSeasonMeets(){return v32Array(v32SelectedSeason()?.meet_plan).slice().sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")))}
function v32UpcomingMeets(){const today=localIsoDate(new Date());return v32AllSeasonMeets().filter(m=>!m.date||m.date>=today).slice(0,6)}
function v32LatestTargetMeet(){const today=localIsoDate(new Date()),targets=v32AllSeasonMeets().filter(m=>/target|champ|priority/i.test(`${m.status} ${m.name}`));return targets.filter(m=>!m.date||m.date<=today).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))[0]||targets.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")))[0]||null}
function v32RenderUpcomingMeets(){const host=$("seasonUpcomingMeets");if(!host)return;const meets=v32UpcomingMeets();host.innerHTML=meets.length?meets.map(m=>`<div class="meet-plan-row"><div><strong>${escapeHtml(m.name)}</strong><div class="list-meta">${escapeHtml(m.date?formatDate(m.date):"Date not entered")} · ${escapeHtml(m.course||"Course not set")}${m.venue?` · ${escapeHtml(m.venue)}`:""}</div></div><span class="badge">${escapeHtml(m.status||"planned")}</span></div>`).join(""):'<div class="help">No upcoming meets in the selected season plan.</div>'}

// ----- Official 2026 WA / WPS points and race splits -----
function v32Sex(value){const s=String(value||"").toLowerCase();return /female|woman|women|girl|^f$/.test(s)?"F":/male|man|men|boy|^m$/.test(s)?"M":""}
function v32WaBase(row,athlete){const course=v3Course(row.course),sex=v32Sex(athlete?.sex||row.sex),distance=Number(row.distance),stroke=v3Stroke(row.stroke);return (appState.world_aquatics_base_times||[]).find(x=>v3Course(x.course)===course&&v32Sex(x.sex)===sex&&Number(x.distance)===distance&&v3Stroke(x.stroke)===stroke)?.base_seconds||null}
function v32WaPoints(row,athlete){const t=Number(row.result_seconds||v3Seconds(row.result_time_text)),b=Number(v32WaBase(row,athlete));return t>0&&b>0?Math.floor(1000*Math.pow(b/t,3)):null}
function v32ParaParameter(row,athlete){const classification=v3ParaClassForEvent(athlete,v3Stroke(row.stroke));if(!classification||v3Course(row.course)!=="LCM")return null;return (appState.world_para_point_parameters||[]).find(x=>Number(x.distance)===Number(row.distance)&&v3Stroke(x.stroke)===v3Stroke(row.stroke)&&String(x.classification||"").toUpperCase()===classification&&v32Sex(x.sex)===v32Sex(athlete.sex))||null}
function v32ParaPoints(row,athlete){const p=v32ParaParameter(row,athlete),t=Number(row.result_seconds||v3Seconds(row.result_time_text));if(!p||!t)return null;const q=Number(p.a||1200)*Math.exp(-Math.exp(Number(p.b)-Number(p.c)/t));return Number.isFinite(q)?Math.max(0,Math.floor(q)):null}
function v32PointsFor(row,athlete){const para=Number(row.world_para_points||row.para_points)||v32ParaPoints(row,athlete);if(para)return {value:para,label:"World Para"};const wa=Number(row.wa_points||row.world_aquatics_points)||v32WaPoints(row,athlete);return wa?{value:wa,label:"WA"}:{value:null,label:""}}
v3Points=function(row){const athlete=appState.athletes.find(a=>a.id===row?.athlete_id)||null;return Number(v32PointsFor(row,athlete).value)||0};
function v32ParseSplits(value){const arr=v32Array(value);if(arr.length)return arr.map((x,i)=>typeof x==="object"?{distance:Number(x.distance)||null,time_text:x.time_text||x.time||v3Time(Number(x.seconds)),seconds:Number(x.seconds??v3Seconds(x.time_text||x.time))||null}:{distance:null,time_text:String(x),seconds:v3Seconds(x)}).filter(x=>x.seconds);return String(value||"").split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).map((x,i)=>({distance:null,time_text:x,seconds:v3Seconds(x)})).filter(x=>x.seconds)}
function v32SplitsWithDistance(value,step){return v32ParseSplits(value).map((s,i)=>({...s,distance:s.distance||Number(step||50)*(i+1)}))}
function v32SplitsText(value){return v32ParseSplits(value).map(s=>s.time_text||v3Time(s.seconds)).join(", ")}
function v32SplitChips(row){const splits=v32SplitsWithDistance(row.splits,row.split_distance);return splits.length?`<div class="split-chips">${splits.map(s=>`<span>${s.distance}m <strong>${escapeHtml(s.time_text||v3Time(s.seconds))}</strong></span>`).join("")}</div>`:'<span class="help">No splits loaded</span>'}
function v32PlaceText(row){return row.medal||row.official_place||row.place||""}
function v32TargetMeetMatch(row,meet){if(!meet)return false;const a=String(row.meet_name||"").toLowerCase(),b=String(meet.name||"").toLowerCase();if(/canterbury.*short|scwc.*short|canterbury sc/.test(b))return /(canterbury.*(short|sc)|scwc|cwsc|division a)/.test(a);const words=b.replace(/championships?|course|2026|long|short/g,"").split(/\W+/).filter(w=>w.length>3);return words.length?words.filter(w=>a.includes(w)).length>=Math.min(2,words.length):false}
function v32RaceCard(row,athlete,{actions=false}={}){const pts=v32PointsFor(row,athlete),place=v32PlaceText(row);return `<article class="race-result-card"><div class="race-result-head"><div><strong>${row.distance} ${escapeHtml(v3Stroke(row.stroke).replace("stroke",""))}</strong><div class="list-meta">${escapeHtml(row.course||"—")} · ${escapeHtml(row.round||"Race")} · ${escapeHtml(row.result_date?resultDateLabel(row.result_date):"")}</div></div><div class="result-time-stack"><strong>${escapeHtml(row.result_time_text||v3Time(row.result_seconds))}</strong>${pts.value?`<span class="points-badge">${pts.value} ${pts.label}</span>`:""}</div></div>${place?`<div class="result-place">${escapeHtml(String(place))}</div>`:""}${v32SplitChips(row)}${actions?`<div class="button-row"><button class="secondary" data-result-edit="${escapeHtml(row.id)}">Edit</button><button class="danger-button" data-result-delete="${escapeHtml(row.id)}">Delete</button></div>`:""}</article>`}

// ----- Complete target-meet and result management -----
function v32RenderLastTargetMeet(athlete){const meet=v32LatestTargetMeet(),host=$("lastTargetMeetResults");if(!host)return;if(!meet){$("lastTargetMeetTitle").textContent="No target meet in season plan";host.innerHTML='<div class="help">Add target meets to the season plan.</div>';return}$("lastTargetMeetTitle").textContent=`${meet.name}${meet.date?` · ${resultDateLabel(meet.date)}`:""}`;$("lastTargetMeetBadge").textContent=meet.course||"Target meet";const rows=athleteHistory(athlete.id).filter(r=>v32TargetMeetMatch(r,meet));host.innerHTML=rows.length?rows.map(r=>v32RaceCard(r,athlete)).join(""):'<div class="warning-box">No matching results loaded for this swimmer. Import or manually add the meet results and use the same meet name.</div>'}
function v32BindResultActions(host=document){host.querySelectorAll?.("[data-result-edit]").forEach(b=>b.onclick=()=>v32EditResult(b.dataset.resultEdit));host.querySelectorAll?.("[data-result-delete]").forEach(b=>b.onclick=()=>v32DeleteResult(b.dataset.resultDelete))}
function v32ClearManualResult(){for(const id of ["manualResultId","manualResultMeet","manualResultDistance","manualResultTime","manualResultRound","manualResultWa","manualResultPara","manualResultPlace","manualResultSplits"]){if($(id))$(id).value=""}if($("manualResultTargetMeet"))$("manualResultTargetMeet").checked=false;if($("manualResultDate"))$("manualResultDate").value=localIsoDate(new Date())}
function v32EditResult(id){const r=appState.coach_results.find(x=>x.id===id);if(!r)return alert("Official source rows are read-only. Add a corrected manual result instead.");showView("resultsupdate");$("manualResultId").value=r.id;$("manualResultAthlete").value=r.athlete_id||"";$("manualResultDate").value=r.result_date||"";$("manualResultMeet").value=r.meet_name||"";$("manualResultCourse").value=v3Course(r.course);$("manualResultDistance").value=r.distance||"";$("manualResultStroke").value=v3Stroke(r.stroke);$("manualResultTime").value=r.result_time_text||"";$("manualResultRound").value=r.round||"";$("manualResultWa").value=r.wa_points||"";$("manualResultPara").value=r.world_para_points||"";$("manualResultPlace").value=r.medal||r.official_place||"";$("manualResultSplitDistance").value=r.split_distance||50;$("manualResultSplits").value=v32SplitsText(r.splits);$("manualResultTargetMeet").checked=Boolean(r.is_target_meet);window.scrollTo({top:0,behavior:"smooth"})}
async function v32DeleteResult(id){const r=appState.coach_results.find(x=>x.id===id);if(!r||!confirm(`Delete ${r.distance} ${r.stroke} ${r.result_time_text}?`))return;appState.coach_results=appState.coach_results.filter(x=>x.id!==id);queueDelete("coach_results",id);saveState(appState);await syncIfPossible();renderAll();updateStatus("Result deleted and PBs refreshed","good")}
async function v32SaveManualResult(){const athlete=appState.athletes.find(a=>a.id===$("manualResultAthlete").value),time=$("manualResultTime").value.trim(),old=appState.coach_results.find(r=>r.id===$("manualResultId").value),splitDistance=Number($("manualResultSplitDistance").value)||50;const r={...old,id:old?.id||uid("result"),athlete_id:athlete?.id||null,swimmer_name:athlete?.full_name||"",result_date:$("manualResultDate").value||null,meet_name:$("manualResultMeet").value.trim(),course:$("manualResultCourse").value,distance:Number($("manualResultDistance").value),stroke:$("manualResultStroke").value,round:$("manualResultRound").value.trim(),result_time_text:time,result_seconds:v3Seconds(time),wa_points:Number($("manualResultWa").value)||null,world_para_points:Number($("manualResultPara").value)||null,official_place:$("manualResultPlace").value.trim(),medal:/gold|silver|bronze/i.test($("manualResultPlace").value)?$("manualResultPlace").value.trim():old?.medal||null,split_distance:splitDistance,splits:v32SplitsWithDistance($("manualResultSplits").value,splitDistance),is_target_meet:$("manualResultTargetMeet").checked,source_type:old?.source_type||"manual",reviewed:true,created_at:old?.created_at||nowIso(),updated_at:nowIso()};if(!r.athlete_id||!r.result_date||!r.meet_name||!r.distance||!r.result_seconds)return alert("Swimmer, date, meet, event and valid time are required.");const auto=v32PointsFor(r,athlete);if(auto.label==="World Para"&&!r.world_para_points)r.world_para_points=auto.value;if(auto.label==="WA"&&!r.wa_points)r.wa_points=auto.value;r.duplicate_key=v3DuplicateKey(r);if((appState.coach_results||[]).some(x=>x.id!==r.id&&x.duplicate_key===r.duplicate_key))return alert("That result is already saved.");upsertLocal("coach_results",r);queueRecord("coach_results",r.id);saveState(appState);await syncIfPossible();$("manualResultMessage").textContent=`Saved ${r.distance} ${r.stroke} ${r.result_time_text}${auto.value?` · ${auto.value} ${auto.label} points`:""}.`;$("manualResultId").value=r.id;renderAll()}
v3SaveManualResult=v32SaveManualResult;

// ----- Whole-set Test Sets -----
const v32BaseFillTestSetEditor=fillTestSetEditor;
fillTestSetEditor=function(t){v32BaseFillTestSetEditor(t);if($("testSetSegments"))$("testSetSegments").value=v32BlockItemsText(t?.segments||[])};
async function v32SaveTestSet(){const old=appState.test_sets.find(t=>t.id===$("testSetId").value),segments=v32BlockItemsFromText($("testSetSegments")?.value),first=segments[0];const r={...old,id:old?.id||uid("test"),name:$("testSetName").value.trim(),category:$("testSetCategory").value.trim(),description:$("testSetDescription").value.trim(),distance:Number($("testSetDistance").value)||first?.distance||null,stroke:$("testSetStroke").value||first?.stroke||"Choice",reps:Number($("testSetReps").value)||first?.reps||null,interval_text:$("testSetInterval").value.trim()||first?.cycle||"",recovery_text:$("testSetRecovery").value.trim(),equipment:$("testSetEquipment").value.split(",").map(x=>x.trim()).filter(Boolean),measurement_types:$("testSetMeasurements").value.split(",").map(x=>x.trim()).filter(Boolean),squad_versions:v3LineMap($("testSetSquadVersions").value),adapted_versions:v3LineMap($("testSetAdaptedVersions").value),segments,active:$("testSetActive").checked,updated_at:nowIso()};if(!r.name)return alert("Test set name is required.");if(!segments.length&&(!r.reps||!r.distance))return alert("Add at least one complete set line.");upsertLocal("test_sets",r);appState.settings.selected_test_set_id=r.id;queueRecord("test_sets",r.id);saveState(appState);await syncIfPossible();fillTestSetEditor(r);renderAll();updateStatus("Complete test set saved","good")}
v3SaveTestSet=v32SaveTestSet;
async function v32DeleteTestSet(id=$("testSetId")?.value){const t=appState.test_sets.find(x=>x.id===id);if(!t||!confirm(`Delete test set ${t.name}? Attempts remain available until separately deleted.`))return;appState.test_sets=appState.test_sets.filter(x=>x.id!==id);queueDelete("test_sets",id);if(appState.settings.selected_test_set_id===id)appState.settings.selected_test_set_id=appState.test_sets[0]?.id||"";saveState(appState);await syncIfPossible();fillTestSetEditor(null);renderAll();updateStatus("Test set deleted","good")}
const v32BaseRenderTestSets=renderTestSets;
renderTestSets=function(){v32BaseRenderTestSets();const chosen=selectedTestSet(),list=$("testSetList");if(list){list.querySelectorAll(".testset-list-item").forEach((card,i)=>{const t=appState.test_sets.slice().sort((a,b)=>Number(b.active)-Number(a.active)||String(a.name).localeCompare(String(b.name)))[i];if(!t)return;const actions=card.querySelector(".testset-list-actions");if(actions){actions.insertAdjacentHTML("beforeend",`<button class="secondary" data-test-run-block="${escapeHtml(t.id)}">Run full set</button><button class="danger-button" data-test-delete-v32="${escapeHtml(t.id)}">Delete</button>`);const summary=v32Array(t.segments).length?`${v32Array(t.segments).length} linked stages · ${v32BlockItemsText(t.segments).replace(/\n/g," · ")}`:"Single line";card.querySelector(".list-meta")?.insertAdjacentHTML("afterend",`<div class="complete-set-summary">${escapeHtml(summary)}</div>`)}});list.querySelectorAll("[data-test-run-block]").forEach(b=>b.onclick=()=>v32RunTestSetSegments(appState.test_sets.find(t=>t.id===b.dataset.testRunBlock)));list.querySelectorAll("[data-test-delete-v32]").forEach(b=>b.onclick=()=>v32DeleteTestSet(b.dataset.testDeleteV32))}const attempts=$("testSetAttemptHistory");if(attempts){attempts.querySelectorAll(".test-attempt-row").forEach((row,i)=>{const arr=(appState.test_set_attempts||[]).filter(a=>a.test_set_id===chosen?.id).sort(byUpdated),a=arr[i];if(a)row.insertAdjacentHTML("beforeend",`<span class="inline-actions"><button class="secondary" data-attempt-edit="${a.id}">Edit</button><button class="danger-button" data-attempt-delete="${a.id}">Delete</button></span>`) });attempts.querySelectorAll("[data-attempt-edit]").forEach(b=>b.onclick=()=>v32EditAttempt(b.dataset.attemptEdit));attempts.querySelectorAll("[data-attempt-delete]").forEach(b=>b.onclick=()=>v32DeleteAttempt(b.dataset.attemptDelete))}}
function v32EditAttempt(id){const a=appState.test_set_attempts.find(x=>x.id===id);if(!a)return;const next=prompt("Edit times, comma separated",v32Array(a.times).map(v3Time).join(", "));if(next===null)return;const times=String(next).split(/[,;\n]+/).map(v3Seconds).filter(Number.isFinite);if(!times.length)return alert("No valid times entered.");a.times=times;a.updated_at=nowIso();queueRecord("test_set_attempts",a.id);saveState(appState);syncIfPossible().then(renderAll)}
async function v32DeleteAttempt(id){const a=appState.test_set_attempts.find(x=>x.id===id);if(!a||!confirm("Delete this test-set attempt?"))return;appState.test_set_attempts=appState.test_set_attempts.filter(x=>x.id!==id);queueDelete("test_set_attempts",id);saveState(appState);await syncIfPossible();renderAll()}

// ----- Race goals and automatically generated target splits -----
function v32GoalSplits(targetSeconds,distance,step,method,athlete,course,stroke){const count=Math.max(1,Math.round(distance/step));let ratios=Array(count).fill(1/count);if(method==="pb_pattern"){const races=athleteHistory(athlete?.id).filter(r=>r.course===course&&Number(r.distance)===distance&&v3Stroke(r.stroke)===v3Stroke(stroke)&&v32ParseSplits(r.splits).length===count).sort((a,b)=>Number(a.result_seconds)-Number(b.result_seconds));if(races[0]){const cum=v32ParseSplits(races[0].splits).map(s=>s.seconds),legs=cum.map((v,i)=>v-(cum[i-1]||0)),total=legs.reduce((a,b)=>a+b,0);if(total>0)ratios=legs.map(v=>v/total)}}else if(method==="coach_default"&&count>=4){const weights=Array(count).fill(1);weights[0]=0.97;weights[count-1]=1.03;const total=weights.reduce((a,b)=>a+b,0);ratios=weights.map(w=>w/total)}let cumulative=0;return ratios.map((r,i)=>{cumulative+=targetSeconds*r;return {distance:(i+1)*step,seconds:Number(cumulative.toFixed(2)),time_text:v3Time(cumulative)}})}
function v32PopulateGoalEditor(){const select=$("goalAthlete");if(!select)return;const current=select.value||appState.settings.selected_athlete_id;select.innerHTML=appState.athletes.filter(a=>a.active).sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(a=>`<option value="${a.id}" ${a.id===current?"selected":""}>${escapeHtml(a.full_name)}</option>`).join("")}
function v32RenderGoalDraft(){const host=$("goalSplitEditor");if(!host)return;host.innerHTML=v32GoalDraftSplits.length?v32GoalDraftSplits.map((s,i)=>`<label class="goal-split-row"><span>${s.distance}m</span><input data-goal-split="${i}" value="${escapeHtml(s.time_text)}"></label>`).join(""):'<div class="help">Generate a target to see splits.</div>';host.querySelectorAll("[data-goal-split]").forEach(el=>el.onchange=()=>{const i=Number(el.dataset.goalSplit),sec=v3Seconds(el.value);if(sec){v32GoalDraftSplits[i].seconds=sec;v32GoalDraftSplits[i].time_text=v3Time(sec)}})}
function v32GenerateGoal(){const athlete=appState.athletes.find(a=>a.id===$("goalAthlete").value),target=v3Seconds($("goalTargetTime").value),distance=Number($("goalDistance").value),step=Number($("goalSplitDistance").value);if(!athlete||!target||!distance||!step)return alert("Choose swimmer, event and target time.");v32GoalDraftSplits=v32GoalSplits(target,distance,step,$("goalPaceMethod").value,athlete,$("goalCourse").value,$("goalStroke").value);v32RenderGoalDraft()}
function v32ClearGoal(){for(const id of ["raceGoalId","goalTargetTime","goalBasis"]){if($(id))$(id).value=""}v32GoalDraftSplits=[];v32RenderGoalDraft()}
function v32EditGoal(id){const g=appState.race_goals.find(x=>x.id===id);if(!g)return;$("raceGoalId").value=g.id;$("goalAthlete").value=g.athlete_id;$("goalCourse").value=g.course;$("goalDistance").value=g.distance;$("goalStroke").value=g.stroke;$("goalTargetTime").value=g.target_time_text;$("goalSplitDistance").value=g.split_distance;$("goalPaceMethod").value=g.pacing_method;$("goalBasis").value=g.basis||"";v32GoalDraftSplits=v32Array(g.target_splits);v32RenderGoalDraft()}
async function v32SaveGoal(){const old=appState.race_goals.find(x=>x.id===$("raceGoalId").value),athlete=appState.athletes.find(a=>a.id===$("goalAthlete").value),target=$("goalTargetTime").value.trim();if(!athlete||!v3Seconds(target))return alert("Choose swimmer and valid target time.");if(!v32GoalDraftSplits.length)v32GenerateGoal();const r={id:old?.id||uid("goal"),athlete_id:athlete.id,course:$("goalCourse").value,distance:Number($("goalDistance").value),stroke:$("goalStroke").value,target_time_text:target,target_seconds:v3Seconds(target),split_distance:Number($("goalSplitDistance").value),pacing_method:$("goalPaceMethod").value,basis:$("goalBasis").value.trim(),target_splits:v32GoalDraftSplits,status:old?.status||"active",updated_at:nowIso()};upsertLocal("race_goals",r);queueRecord("race_goals",r.id);saveState(appState);await syncIfPossible();$("raceGoalId").value=r.id;renderAll();updateStatus("Race goal and target splits saved","good")}
async function v32DeleteGoal(id=$("raceGoalId")?.value){const g=appState.race_goals.find(x=>x.id===id);if(!g||!confirm("Delete this race goal?"))return;appState.race_goals=appState.race_goals.filter(x=>x.id!==id);queueDelete("race_goals",id);saveState(appState);await syncIfPossible();v32ClearGoal();renderAll()}
function v32RenderGoals(athlete){const host=$("raceGoalList");if(!host)return;const rows=(appState.race_goals||[]).filter(g=>!athlete||g.athlete_id===athlete.id).sort(byUpdated);host.innerHTML=rows.length?rows.map(g=>`<article class="goal-card"><div><strong>${g.distance} ${escapeHtml(g.stroke)} · ${escapeHtml(g.target_time_text)}</strong><div class="list-meta">${escapeHtml(g.course)} · ${escapeHtml(g.basis||g.pacing_method)}</div></div><div class="split-chips">${v32Array(g.target_splits).map(s=>`<span>${s.distance}m <strong>${escapeHtml(s.time_text||v3Time(s.seconds))}</strong></span>`).join("")}</div><div class="button-row"><button class="secondary" data-goal-edit="${g.id}">Edit</button><button class="danger-button" data-goal-delete="${g.id}">Delete</button></div></article>`).join(""):'<div class="help">No race goals saved for this swimmer.</div>';host.querySelectorAll("[data-goal-edit]").forEach(b=>b.onclick=()=>v32EditGoal(b.dataset.goalEdit));host.querySelectorAll("[data-goal-delete]").forEach(b=>b.onclick=()=>v32DeleteGoal(b.dataset.goalDelete))}

// ----- Training-session photo capture and transcription -----
async function v32SaveSessionPhoto(file){const session=selectedSession();if(!file||!session)return;const localId=await saveMediaBlob(file,"photo",file.name||"session-board.jpg"),capture={id:uid("capture"),session_id:session.id,athlete_id:null,capture_type:"photo",text_content:`Session board photo · ${$("sessionPhotoPurpose").value}`,session_block_id:null,media_path:null,media_local_id:localId,mime_type:file.type||"image/jpeg",created_at:nowIso(),updated_at:nowIso()};upsertLocal("captures",capture);queueRecord("captures",capture.id);const tr={id:uid("transcript"),session_id:session.id,capture_id:capture.id,purpose:$("sessionPhotoPurpose").value,source_type:"photo",athlete_id:null,session_block_id:null,status:"photo_saved",raw_text:"",structured_blocks:[],structured_data:{},created_at:nowIso(),updated_at:nowIso()};upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);v32CurrentTranscriptionId=tr.id;saveState(appState);await syncIfPossible();renderAll();updateStatus("Session photo saved · ready to transcribe","good")}
async function v32AutomaticTranscribe(){
  const tr=appState.session_transcriptions.find(x=>x.id===v32CurrentTranscriptionId)||(appState.session_transcriptions||[]).filter(x=>x.session_id===selectedSession()?.id&&(x.source_type||"photo")==="photo").sort(byUpdated)[0];
  if(!tr)return alert("Take or choose a session photo first.");
  const capture=appState.captures.find(c=>c.id===tr.capture_id);
  if(!capture)return alert("The linked photo capture could not be found.");
  try{
    await v34TranscribeCapture(tr,capture);
    $("sessionPhotoTranscript").value=tr.raw_text||"";
    renderAll();
    updateStatus("Photo transcribed · check and build the session blocks","good");
  }catch(error){
    alert(`${error.message}

The photo remains attached. You can retry or paste/type the session text.`);
    updateStatus("Photo transcription needs retry","error");
  }
}
async function v32StructureTranscript(){const session=selectedSession(),text=$("sessionPhotoTranscript").value.trim();if(!session||!text)return alert("Choose a session and add transcript text first.");let tr=appState.session_transcriptions.find(x=>x.id===v32CurrentTranscriptionId);if(!tr){tr={id:uid("transcript"),session_id:session.id,capture_id:null,purpose:$("sessionPhotoPurpose").value,source_type:"photo",athlete_id:null,session_block_id:null,status:"review",structured_data:{},created_at:nowIso()}}v32CurrentTranscriptionId=tr.id;tr.raw_text=text;tr.structured_blocks=v32ParseWorkoutBlocks(text);tr.status="structured";tr.updated_at=nowIso();upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);const previous=(appState.session_blocks||[]).filter(b=>b.source_transcription_id===tr.id);for(const block of previous){appState.session_blocks=appState.session_blocks.filter(b=>b.id!==block.id);queueDelete("session_blocks",block.id)}tr.structured_blocks.forEach((block,index)=>{const r={id:uid("block"),session_id:session.id,block_type:block.block_type,title:block.title,sort_order:(V32_BLOCK_ORDER[block.block_type]||70)+(index/100),items:block.items,notes:`From ${tr.purpose||"session"} photo transcription`,status:tr.purpose==="actual"?"actual":"planned",source_transcription_id:tr.id,updated_at:nowIso()};upsertLocal("session_blocks",r);queueRecord("session_blocks",r.id)});saveState(appState);await syncIfPossible();showView("sessions");fillSessionEditor(session);renderAll();updateStatus(`${tr.structured_blocks.length} complete blocks added to session`,`good`)}
async function v32RenderPhotoInbox(){const host=$("sessionPhotoInbox");if(!host)return;const rows=(appState.session_transcriptions||[]).filter(t=>t.session_id===selectedSession()?.id&&(t.source_type||"photo")==="photo").sort(byUpdated);const html=[];for(const tr of rows){const c=appState.captures.find(x=>x.id===tr.capture_id);html.push(`<article class="photo-transcription-card"><div class="card-heading"><div><strong>${escapeHtml(tr.purpose==="actual"?"Actual session photo":"Planned session photo")}</strong><div class="list-meta">${escapeHtml(tr.status||"saved")} · ${new Date(tr.updated_at||tr.created_at).toLocaleString("en-NZ")}</div></div><div class="button-row"><button class="secondary" data-transcript-use="${tr.id}">Use</button><button class="danger-button" data-transcript-delete="${tr.id}">Delete</button></div></div>${c?`<div class="media-preview">${await mediaHtml(c)}</div>`:""}${tr.raw_text?`<pre class="transcript-preview">${escapeHtml(tr.raw_text)}</pre>`:""}</article>`)}host.innerHTML=html.join("")||'<div class="help">No session-board photos for this session yet.</div>';host.querySelectorAll("[data-transcript-use]").forEach(b=>b.onclick=()=>{const tr=appState.session_transcriptions.find(x=>x.id===b.dataset.transcriptUse);v32CurrentTranscriptionId=tr.id;$("sessionPhotoTranscript").value=tr.raw_text||""});host.querySelectorAll("[data-transcript-delete]").forEach(b=>b.onclick=()=>v32DeleteTranscription(b.dataset.transcriptDelete))}
async function v32DeleteTranscription(id){const tr=appState.session_transcriptions.find(x=>x.id===id);if(!tr||!confirm("Delete this photo transcription and its linked photo?"))return;appState.session_transcriptions=appState.session_transcriptions.filter(x=>x.id!==id);queueDelete("session_transcriptions",id);if(tr.capture_id){appState.captures=appState.captures.filter(x=>x.id!==tr.capture_id);queueDelete("captures",tr.capture_id)}saveState(appState);await syncIfPossible();renderAll()}

// ----- Mobile Manage portal -----
function v32ActionCard(title,meta,actions){return `<div class="manage-item"><div><strong>${escapeHtml(title)}</strong><div class="list-meta">${escapeHtml(meta||"")}</div></div><div class="manage-actions">${actions}</div></div>`}
function v32RenderManage(){
  if(!$("manageSessionsList"))return;
  $("manageSessionsList").innerHTML=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`)).map(s=>v32ActionCard(`${sessionLabel(s)} — ${s.title}`,`${(s.squads||[]).join(", ")} · ${s.lane_count||1} lanes`,`<button data-manage-session-use="${s.id}">Use</button><button class="secondary" data-manage-session-edit="${s.id}">Edit</button><button class="secondary" data-manage-session-copy="${s.id}">Duplicate</button><button class="danger-button" data-manage-session-delete="${s.id}">Delete</button>`)).join("")||'<div class="help">No sessions.</div>';
  $("manageBlocksList").innerHTML=(appState.session_blocks||[]).slice().sort(byUpdated).map(b=>{const s=appState.sessions.find(x=>x.id===b.session_id);return v32ActionCard(b.title||v32BlockLabel(b.block_type),`${s?.session_date||"No session"} · ${v32BlockSummary(b)}`,`<button data-manage-block-run="${b.id}">Run</button><button class="secondary" data-manage-block-edit="${b.id}">Edit</button><button class="secondary" data-manage-block-copy="${b.id}">Duplicate</button><button class="danger-button" data-manage-block-delete="${b.id}">Delete</button>`) }).join("")||'<div class="help">No session blocks.</div>';
  $("manageTestSetsList").innerHTML=(appState.test_sets||[]).slice().sort(byUpdated).map(t=>v32ActionCard(t.name,`${v32Array(t.segments).length||1} stage(s) · ${t.active!==false?"Active":"Archived"}`,`<button data-manage-test-run="${t.id}">Run</button><button class="secondary" data-manage-test-edit="${t.id}">Edit</button><button class="secondary" data-manage-test-copy="${t.id}">Duplicate</button><button class="danger-button" data-manage-test-delete="${t.id}">Delete</button>`)).join("")||'<div class="help">No test sets.</div>';
  const data=[...(appState.test_set_attempts||[]).map(x=>({...x,_type:"attempt"})),...(appState.timed_sets||[]).map(x=>({...x,_type:"timed"}))].sort(byUpdated);$("manageTestDataList").innerHTML=data.map(d=>{const a=appState.athletes.find(x=>x.id===d.athlete_id);return v32ActionCard(`${a?.full_name||"Unknown"} — ${d.set_label||appState.test_sets.find(t=>t.id===d.test_set_id)?.name||"Timed set"}`,`${new Date(d.created_at||d.updated_at).toLocaleString("en-NZ")} · ${v32Array(d.times).length} times`,`<button class="secondary" data-manage-data-edit="${d._type}|${d.id}">Edit</button><button class="danger-button" data-manage-data-delete="${d._type}|${d.id}">Delete</button>`) }).join("")||'<div class="help">No test/timing data.</div>';
  $("manageResultsList").innerHTML=(appState.coach_results||[]).slice().sort(byUpdated).map(r=>{const a=appState.athletes.find(x=>x.id===r.athlete_id),p=v32PointsFor(r,a);return v32ActionCard(`${a?.full_name||r.swimmer_name} — ${r.distance} ${r.stroke}`,`${r.result_date} · ${r.result_time_text}${p.value?` · ${p.value} ${p.label}`:""}`,`<button class="secondary" data-result-edit="${r.id}">Edit</button><button class="danger-button" data-result-delete="${r.id}">Delete</button>`) }).join("")||'<div class="help">No manual/imported results.</div>';
  $("managePhotosList").innerHTML=(appState.session_transcriptions||[]).slice().sort(byUpdated).map(t=>{const s=appState.sessions.find(x=>x.id===t.session_id);return v32ActionCard(`${s?.title||"Session"} — ${(t.source_type||"photo")==="voice"?"voice":"photo"} · ${t.purpose||"note"}`,`${t.status||"saved"} · ${new Date(t.updated_at||t.created_at).toLocaleString("en-NZ")}`,`<button class="secondary" data-manage-photo-use="${t.id}">Open</button><button class="danger-button" data-manage-photo-delete="${t.id}">Delete</button>`) }).join("")||'<div class="help">No session photos/transcripts.</div>';
  document.querySelectorAll("[data-manage-session-use]").forEach(b=>b.onclick=()=>{setSelectedSession(b.dataset.manageSessionUse);showView("deck")});document.querySelectorAll("[data-manage-session-edit]").forEach(b=>b.onclick=()=>{const s=appState.sessions.find(x=>x.id===b.dataset.manageSessionEdit);setSelectedSession(s.id);showView("sessions");fillSessionEditor(s);v32RenderSessionBlocks()});document.querySelectorAll("[data-manage-session-copy]").forEach(b=>b.onclick=()=>v32DuplicateSession(b.dataset.manageSessionCopy));document.querySelectorAll("[data-manage-session-delete]").forEach(b=>b.onclick=()=>deleteSession(b.dataset.manageSessionDelete));document.querySelectorAll("[data-manage-block-run]").forEach(b=>b.onclick=()=>v32RunBlock(b.dataset.manageBlockRun));document.querySelectorAll("[data-manage-block-edit]").forEach(b=>b.onclick=()=>{const block=appState.session_blocks.find(x=>x.id===b.dataset.manageBlockEdit);setSelectedSession(block.session_id);showView("sessions");v32FillBlockEditor(block)});document.querySelectorAll("[data-manage-block-copy]").forEach(b=>b.onclick=()=>v32DuplicateSessionBlock(b.dataset.manageBlockCopy));document.querySelectorAll("[data-manage-block-delete]").forEach(b=>b.onclick=()=>v32DeleteSessionBlock(b.dataset.manageBlockDelete));document.querySelectorAll("[data-manage-test-run]").forEach(b=>b.onclick=()=>v32RunTestSetSegments(appState.test_sets.find(x=>x.id===b.dataset.manageTestRun)));document.querySelectorAll("[data-manage-test-edit]").forEach(b=>b.onclick=()=>{showView("testsets");fillTestSetEditor(appState.test_sets.find(x=>x.id===b.dataset.manageTestEdit))});document.querySelectorAll("[data-manage-test-copy]").forEach(b=>b.onclick=()=>{appState.settings.selected_test_set_id=b.dataset.manageTestCopy;v3DuplicateTestSet()});document.querySelectorAll("[data-manage-test-delete]").forEach(b=>b.onclick=()=>v32DeleteTestSet(b.dataset.manageTestDelete));document.querySelectorAll("[data-manage-data-edit]").forEach(b=>b.onclick=()=>{const [type,id]=b.dataset.manageDataEdit.split("|");type==="attempt"?v32EditAttempt(id):v32EditTimedSet(id)});document.querySelectorAll("[data-manage-data-delete]").forEach(b=>b.onclick=()=>{const [type,id]=b.dataset.manageDataDelete.split("|");type==="attempt"?v32DeleteAttempt(id):v32DeleteTimedSet(id)});v32BindResultActions(document);document.querySelectorAll("[data-manage-photo-use]").forEach(b=>b.onclick=()=>{const tr=appState.session_transcriptions.find(x=>x.id===b.dataset.managePhotoUse);setSelectedSession(tr.session_id);showView("capture");v32CurrentTranscriptionId=tr.id;$("sessionPhotoTranscript").value=tr.raw_text||""});document.querySelectorAll("[data-manage-photo-delete]").forEach(b=>b.onclick=()=>v32DeleteTranscription(b.dataset.managePhotoDelete))
}
async function v32DuplicateSession(id){const s=appState.sessions.find(x=>x.id===id);if(!s)return;const r={...clone(s),id:uid("session"),title:`${s.title} copy`,status:"planned",updated_at:nowIso()};upsertLocal("sessions",r);queueRecord("sessions",r.id);for(const b of v32SessionBlocks(s.id)){const c={...clone(b),id:uid("block"),session_id:r.id,updated_at:nowIso()};upsertLocal("session_blocks",c);queueRecord("session_blocks",c.id)}saveState(appState);await syncIfPossible();setSelectedSession(r.id);showView("sessions");fillSessionEditor(r);renderAll()}
function v32EditTimedSet(id){const r=appState.timed_sets.find(x=>x.id===id);if(!r)return;const next=prompt("Edit times, comma separated",v32Array(r.times).map(v3Time).join(", "));if(next===null)return;const times=String(next).split(/[,;\n]+/).map(v3Seconds).filter(Number.isFinite);if(!times.length)return alert("No valid times.");r.times=times;r.best=Math.min(...times);r.average=times.reduce((a,b)=>a+b,0)/times.length;r.spread=Math.max(...times)-Math.min(...times);r.updated_at=nowIso();queueRecord("timed_sets",r.id);saveState(appState);syncIfPossible().then(renderAll)}
async function v32DeleteTimedSet(id){const r=appState.timed_sets.find(x=>x.id===id);if(!r||!confirm("Delete this timed-set data?"))return;appState.timed_sets=appState.timed_sets.filter(x=>x.id!==id);queueDelete("timed_sets",id);saveState(appState);await syncIfPossible();renderAll()}
const v32OriginalDeleteSession=deleteSession;
deleteSession=async function(id){const blocks=(appState.session_blocks||[]).filter(x=>x.session_id===id),trs=(appState.session_transcriptions||[]).filter(x=>x.session_id===id);if(!appState.sessions.find(s=>s.id===id))return;const session=appState.sessions.find(s=>s.id===id);if(!confirm(`Delete ${sessionLabel(session)} — ${session.title}? This also deletes its blocks, photos/transcripts and session data.`))return;for(const b of blocks){appState.session_blocks=appState.session_blocks.filter(x=>x.id!==b.id);queueDelete("session_blocks",b.id)}for(const t of trs){appState.session_transcriptions=appState.session_transcriptions.filter(x=>x.id!==t.id);queueDelete("session_transcriptions",t.id)}appState.sessions=appState.sessions.filter(s=>s.id!==id);for(const table of ["attendance","captures","timed_sets","session_reviews","session_lane_assignments","test_set_attempts"])appState[table]=appState[table].filter(r=>r.session_id!==id);queueDelete("sessions",id);if(appState.settings.selected_session_id===id){const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];appState.settings.selected_session_id=next?.id||"";appState.settings.selected_squad=sessionSquads(next)[0]||""}saveState(appState);await syncIfPossible();fillSessionEditor(selectedSession());renderAll();updateStatus("Session and linked data deleted","good")};

// Preserve status and all v3.2 JSON fields when syncing generic coach tables.
const v32BaseCloudRow=cloudRow;
cloudRow=function(table,record){
  if(["season_plans","weekly_plans","session_lane_assignments","session_blocks","session_transcriptions","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases","race_goals"].includes(table)){
    const clean={...record,organisation_id:appState.settings.organisation_id,created_by:getAuth()?.user?.id};delete clean.use;return clean;
  }
  return v32BaseCloudRow(table,record);
};

// ----- Render overrides -----
const v32BaseRenderPlanning=renderPlanning;
renderPlanning=function(){v32BaseRenderPlanning();v32RenderUpcomingMeets()};
const v32BaseRenderSessions=renderSessions;
renderSessions=function(){v32BaseRenderSessions();v32RenderSessionBlocks()};
const v32BaseRenderResults=renderResults;
renderResults=function(){v32BaseRenderResults();const athlete=appState.athletes.find(a=>a.id===$("resultsAthlete")?.value)||appState.athletes.find(a=>a.id===appState.settings.selected_athlete_id)||appState.athletes[0];if(!athlete)return;v32RenderLastTargetMeet(athlete);v32PopulateGoalEditor();v32RenderGoals(athlete);const history=athleteHistory(athlete.id),body=$("resultsHistoryBody");if(body)body.innerHTML=history.length?history.map(r=>{const p=v32PointsFor(r,athlete);return `<tr><td>${resultDateLabel(r.result_date)}</td><td>${escapeHtml(r.meet_name||"—")}</td><td>${escapeHtml(r.course||"—")}</td><td>${r.distance} ${escapeHtml(r.stroke)}</td><td>${escapeHtml(r.round||"—")}</td><td><strong>${escapeHtml(r.result_time_text)}</strong></td><td>${p.value?`${p.value} ${p.label}`:"—"}</td><td>${v32SplitChips(r)}</td><td>${escapeHtml(v32PlaceText(r)||"—")}</td></tr>`}).join(""):'<tr><td colspan="9">No race history loaded.</td></tr>';const cw=$("resultsCwscSummary");if(cw)cw.innerHTML=athleteCwscHistory(athlete.id).length?athleteCwscHistory(athlete.id).map(r=>v32RaceCard(r,athlete)).join(""):'<div class="help">No Canterbury championship results matched.</div>'}
const v32BaseRenderResultsUpdate=renderResultsUpdate;
renderResultsUpdate=function(){v32BaseRenderResultsUpdate();v32PopulateGoalEditor();const host=$("coachResultManagementList");if(host){host.innerHTML=(appState.coach_results||[]).slice().sort(byUpdated).map(r=>{const a=appState.athletes.find(x=>x.id===r.athlete_id);return v32RaceCard(r,a,{actions:true})}).join("")||'<div class="help">No editable manual/imported results.</div>';v32BindResultActions(host)}};
const v32BaseRenderLiveBoard=renderLiveBoard;
renderLiveBoard=function(){v32BaseRenderLiveBoard();v32RenderLiveBlockRunner()};
const v32BaseRenderView=renderView;
renderView=function(id){if(id==="manage"){renderMode();renderActiveContext();v32RenderManage();return}v32BaseRenderView(id);if(id==="capture")v32RenderPhotoInbox();if(id==="sessions")v32RenderSessionBlocks()};
const v32BaseRenderAll=renderAll;
renderAll=function(){v32BaseRenderAll();v32RenderSessionBlocks();v32RenderUpcomingMeets();v32RenderLiveBlockRunner();v32PopulateGoalEditor();v32RenderPhotoInbox();v32RenderManage()};
const v32BasePullCloud=pullCloud;
pullCloud=async function(){await v32BasePullCloud();if(!cloudReady())return;for(const table of REFERENCE_TABLES){try{appState[table]=await cloudFetch(`/rest/v1/${table}?select=*`)}catch(error){console.warn(`Reference table ${table} unavailable`,error);if(!Array.isArray(appState[table]))appState[table]=[]}}saveState(appState)};

// Event bindings owned by v3.2
if($("newSessionBlockBtn"))$("newSessionBlockBtn").addEventListener("click",()=>v32FillBlockEditor(null));if($("saveSessionBlockBtn"))$("saveSessionBlockBtn").addEventListener("click",v32SaveSessionBlock);if($("duplicateSessionBlockBtn"))$("duplicateSessionBlockBtn").addEventListener("click",()=>v32DuplicateSessionBlock());if($("deleteSessionBlockBtn"))$("deleteSessionBlockBtn").addEventListener("click",()=>v32DeleteSessionBlock());if($("cancelSessionBlockBtn"))$("cancelSessionBlockBtn").addEventListener("click",()=>{$("sessionBlockEditor").hidden=true});if($("liveBlockPrevBtn"))$("liveBlockPrevBtn").addEventListener("click",()=>v32StepLiveBlock(-1));if($("liveBlockNextBtn"))$("liveBlockNextBtn").addEventListener("click",()=>v32StepLiveBlock(1));if($("liveBlockCloseBtn"))$("liveBlockCloseBtn").addEventListener("click",()=>{v32LiveBlockState=null;v32RenderLiveBlockRunner()});
if($("deleteTestSetBtn"))$("deleteTestSetBtn").addEventListener("click",()=>v32DeleteTestSet());
if($("newRaceGoalBtn"))$("newRaceGoalBtn").addEventListener("click",v32ClearGoal);if($("generateGoalSplitsBtn"))$("generateGoalSplitsBtn").addEventListener("click",v32GenerateGoal);if($("saveRaceGoalBtn"))$("saveRaceGoalBtn").addEventListener("click",v32SaveGoal);if($("deleteRaceGoalBtn"))$("deleteRaceGoalBtn").addEventListener("click",()=>v32DeleteGoal());if($("cancelManualResultBtn"))$("cancelManualResultBtn").addEventListener("click",v32ClearManualResult);
if($("sessionPhotoInput"))$("sessionPhotoInput").addEventListener("change",async e=>{await v32SaveSessionPhoto(e.target.files?.[0]);e.target.value=""});if($("transcribeLatestPhotoBtn"))$("transcribeLatestPhotoBtn").addEventListener("click",v32AutomaticTranscribe);if($("structurePhotoTranscriptBtn"))$("structurePhotoTranscriptBtn").addEventListener("click",v32StructureTranscript);


// v3 UI bindings
if($("newSeasonBtn"))$("newSeasonBtn").addEventListener("click",()=>fillSeasonEditor(null));if($("saveSeasonBtn"))$("saveSeasonBtn").addEventListener("click",v3SaveSeason);if($("deleteSeasonBtn"))$("deleteSeasonBtn").addEventListener("click",()=>v3DeletePlan("season_plans",$("seasonPlanId").value));if($("newWeekBtn"))$("newWeekBtn").addEventListener("click",()=>fillWeekEditor(null));if($("saveWeekBtn"))$("saveWeekBtn").addEventListener("click",v3SaveWeek);if($("deleteWeekBtn"))$("deleteWeekBtn").addEventListener("click",()=>v3DeletePlan("weekly_plans",$("weeklyPlanId").value));if($("editSessionSeasonPlan"))$("editSessionSeasonPlan").addEventListener("change",v3ApplySessionSeasonLink);if($("editSessionWeeklyPlan"))$("editSessionWeeklyPlan").addEventListener("change",v3ApplySessionWeekLink);
if($("liveLaneCount"))$("liveLaneCount").addEventListener("change",()=>{const s=selectedSession();if(!s)return;s.lane_count=Math.max(1,Math.min(12,Number($("liveLaneCount").value)||1));queueRecord("sessions",s.id);saveState(appState);resetLiveRoster();renderLiveBoard()});if($("liveWaveGap"))$("liveWaveGap").addEventListener("change",()=>{applyLaneOffsets(Number($("liveWaveGap").value)||0);if($("liveChannelGrid"))$("liveChannelGrid").dataset.rosterKey="";renderLiveBoard()});
if($("newTestSetBtn"))$("newTestSetBtn").addEventListener("click",()=>fillTestSetEditor(null));if($("saveTestSetBtn"))$("saveTestSetBtn").addEventListener("click",v3SaveTestSet);if($("duplicateTestSetBtn"))$("duplicateTestSetBtn").addEventListener("click",v3DuplicateTestSet);if($("archiveTestSetBtn"))$("archiveTestSetBtn").addEventListener("click",async()=>{const t=appState.test_sets.find(x=>x.id===$("testSetId").value);if(!t)return;t.active=false;t.updated_at=nowIso();queueRecord("test_sets",t.id);saveState(appState);await syncIfPossible();renderAll()});if($("loadTestSetTimingBtn"))$("loadTestSetTimingBtn").addEventListener("click",()=>v3LoadTestSet());if($("liveTestSet"))$("liveTestSet").addEventListener("change",()=>{const t=appState.test_sets.find(x=>x.id===$("liveTestSet").value);if(t)v3LoadTestSet(t)});
if($("saveManualResultBtn"))$("saveManualResultBtn").addEventListener("click",v3SaveManualResult);if($("parseResultsFileBtn"))$("parseResultsFileBtn").addEventListener("click",v3ParseResultsFile);if($("clearResultsPreviewBtn"))$("clearResultsPreviewBtn").addEventListener("click",()=>{resultImportPreview=[];resultImportFileName="";renderResultImportPreview()});if($("commitResultsImportBtn"))$("commitResultsImportBtn").addEventListener("click",v3CommitImport);


// =============================================================================
// McLay Swimming OS v3.3 — phone-first session entry and reliable session use.
// Keeps the v3.2 tables, Supabase sync, planning, athletes, results and test sets.
// =============================================================================
let v33PendingSessionPhoto=null;
let v33PendingPhotoSaved=false;
let v33QuickPhotoUrl="";
let v33PhotoPreviousSessionId="";
let v33PhotoPreviousSquad="";
if(!Array.isArray(appState.settings.deleted_session_ids))appState.settings.deleted_session_ids=[];

function v33DeletedSet(){return new Set(appState.settings.deleted_session_ids||[])}
function v33FilterDeletedSessions(){
  const deleted=v33DeletedSet();
  for(const p of (appState.pending||[]))if(p.table==="sessions"&&p.action==="delete")deleted.add(p.id);
  if(!deleted.size)return;
  appState.sessions=(appState.sessions||[]).filter(s=>!deleted.has(s.id));
  for(const table of ["attendance","captures","timed_sets","session_reviews","session_lane_assignments","session_blocks","session_transcriptions","test_set_attempts"]){
    if(Array.isArray(appState[table]))appState[table]=appState[table].filter(r=>!deleted.has(r.session_id));
  }
  if(deleted.has(appState.settings.selected_session_id)){
    const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];
    appState.settings.selected_session_id=next?.id||"";
    appState.settings.selected_squad=sessionSquads(next)[0]||"";
  }
}
v33FilterDeletedSessions();
saveState(appState);

function v33LooksLikeSessionText(text){
  const t=String(text||"");
  const setCount=(t.match(/\b\d{1,3}\s*[x×]\s*\d{2,4}\b/gi)||[]).length;
  return setCount>=2||/\b(warm.?up|pre.?set|main set|warm.?down|skill block)\b/i.test(t);
}
function v33PartNow(){return new Date().getHours()<12?"AM":"PM"}
function v33DefaultSquads(){
  const session=selectedSession();
  const squads=sessionSquads(session);
  return squads.length?squads.join(", "):(activeSquad()||"");
}
function v33SetImportMessage(text,mode=""){
  const box=$("sessionImportResult");if(!box)return;
  box.textContent=text;box.className=`session-import-result ${mode}`.trim();
}
function v33ResetSessionImport({keepText=false}={}){
  importedSessionDraft=null;
  if(!keepText)$("sessionPasteInput").value="";
  $("quickSessionDate").value=localIsoDate(new Date());
  $("quickSessionPart").value=v33PartNow();
  $("quickSessionTitle").value="";
  $("quickSessionSquads").value=v33DefaultSquads();
  $("quickSessionLanes").value=selectedSession()?.lane_count||6;
  $("quickSessionCourse").value=selectedSession()?.pool_course||"SCM";
  $("saveImportedSessionBtn").disabled=true;
  $("runImportedSessionBtn").disabled=true;
  $("sessionImportPreview").className="session-import-preview help";
  $("sessionImportPreview").textContent="Nothing previewed yet.";
  v33PendingSessionPhoto=null;v33PendingPhotoSaved=false;
  if(v33QuickPhotoUrl)URL.revokeObjectURL(v33QuickPhotoUrl);
  v33QuickPhotoUrl="";
  $("quickSessionPhotoInput").value="";
  $("quickSessionPhotoPreview").hidden=true;
  $("quickSessionPhotoPreview").removeAttribute("src");
  $("quickSessionPhotoTranscribeBtn").disabled=true;
  v33SetImportMessage("Set the date and squad, paste or type the session, then preview it.");
}
function v33OpenSessionComposer({text="",reset=true}={}){
  showView("deck");
  const details=$("sessionImportDetails");if(details)details.open=true;
  if(reset)v33ResetSessionImport({keepText:false});
  if(text){
    $("sessionPasteInput").value=text;
    try{
      importedSessionDraft=parseSessionFromChat(text);
      renderSessionImportPreview();
      $("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;
      v33SetImportMessage("Shared session picked up. Check the editable details, then Save & Use Now.","good");
    }catch(error){v33SetImportMessage(error.message||"Check the shared session text.","warning")}
  }
  setTimeout(()=>details?.scrollIntoView({block:"start",behavior:"smooth"}),50);
}
function v33QuickSquads(){
  return $("quickSessionSquads").value.split(/[,/+&]|\band\b/i).map(x=>x.trim()).filter(Boolean).map(resolveSquadName);
}
function v33PlanForDate(date){
  const seasons=(appState.season_plans||[]).filter(s=>(!s.start_date||s.start_date<=date)&&(!s.end_date||s.end_date>=date));
  const season=seasons.find(s=>s.status==="active")||appState.season_plans.find(s=>s.id===appState.settings.selected_season_plan_id)||seasons[0]||null;
  const weeks=(appState.weekly_plans||[]).filter(w=>{
    if(!w.week_start)return false;
    const start=new Date(`${w.week_start}T12:00:00`),end=new Date(start);end.setDate(end.getDate()+6);
    const d=new Date(`${date}T12:00:00`);
    return d>=start&&d<=end&&(!season||!w.season_plan_id||w.season_plan_id===season.id);
  });
  const week=weeks[0]||null;
  return {season,week};
}

function v33WorkoutForBlocks(text){
  const lines=String(text||"").split(/\r?\n/);
  const firstHeading=lines.findIndex(raw=>{
    const heading=raw.trim().replace(/[:\-–—]+$/g,"").trim();
    const type=v32NormaliseBlockType(heading);
    return type!=="other"&&heading.length<45&&!/\d+\s*[x×]\s*\d+/.test(heading);
  });
  if(firstHeading<=0)return String(text||"");
  const usefulPrefix=lines.slice(0,firstHeading).filter(raw=>{
    const line=raw.trim();
    return /\b\d{1,3}\s*[x×]\s*\d{2,4}\b/i.test(line)||/^\d{2,4}\s*m?\b/i.test(line);
  });
  return [...usefulPrefix,...lines.slice(firstHeading)].join("\n");
}

function v33ApplyQuickFields(draft){
  const d={...draft};
  d.session_date=$("quickSessionDate").value||d.session_date||localIsoDate(new Date());
  d.day_part=$("quickSessionPart").value||d.day_part||v33PartNow();
  d.title=$("quickSessionTitle").value.trim()||d.title||"Imported session";
  d.squads=v33QuickSquads().length?v33QuickSquads():(d.squads||[]);
  d.lane_count=Math.max(1,Math.min(12,Number($("quickSessionLanes").value)||selectedSession()?.lane_count||6));
  d.pool_course=$("quickSessionCourse").value||"SCM";
  d.workout=$("sessionPasteInput").value.trim()||d.workout||"";
  d.planned_distance=estimateDistance(d.workout)||Number(d.planned_distance||0);
  d.sets=extractStructuredSets(d.workout);
  const {season,week}=v33PlanForDate(d.session_date);
  if(season){
    d.season_plan_id=season.id;d.season_name=season.name;
  }
  if(week){
    d.weekly_plan_id=week.id;d.week_start=week.week_start||null;d.week_phase=week.phase||"";
    d.week_objective=week.objective||"";d.week_carry_forward=week.carry_forward||"";
  }
  d.updated_at=nowIso();
  return d;
}
const v33BaseParseSessionFromChat=parseSessionFromChat;
parseSessionFromChat=function(raw){
  const d=v33BaseParseSessionFromChat(raw);
  return v33ApplyQuickFields(d);
};
renderSessionImportPreview=function(){
  const box=$("sessionImportPreview");if(!box)return;
  if(!importedSessionDraft){box.className="session-import-preview help";box.textContent="Nothing previewed yet.";return}
  importedSessionDraft=v33ApplyQuickFields(importedSessionDraft);
  const d=importedSessionDraft,blocks=v32ParseWorkoutBlocks(v33WorkoutForBlocks(d.workout||""));
  $("quickSessionDate").value=d.session_date||localIsoDate(new Date());
  $("quickSessionPart").value=d.day_part||v33PartNow();
  $("quickSessionTitle").value=d.title||"";
  $("quickSessionSquads").value=(d.squads||[]).join(", ");
  $("quickSessionLanes").value=d.lane_count||6;
  $("quickSessionCourse").value=d.pool_course||"SCM";
  box.className="session-import-preview";
  box.innerHTML=`<div class="import-preview-grid">
    <div><span>Date</span><strong>${escapeHtml(sessionLabel(d))}</strong></div>
    <div><span>Title</span><strong>${escapeHtml(d.title)}</strong></div>
    <div><span>Squads</span><strong>${escapeHtml((d.squads||[]).join(" + ")||"Check squad")}</strong></div>
    <div><span>Distance</span><strong>${d.planned_distance?`${Number(d.planned_distance).toLocaleString()}m`:"Check total"}</strong></div>
    <div><span>Lanes / pool</span><strong>${d.lane_count} · ${escapeHtml(d.pool_course)}</strong></div>
    <div><span>Complete blocks</span><strong>${blocks.length}</strong></div>
  </div>
  <div class="deck-block-list">${blocks.map((b,i)=>`<div class="deck-block-card"><div class="block-title-row"><strong>${i+1}. ${escapeHtml(b.title)}</strong><span class="badge">${escapeHtml(v32BlockSummary(b))}</span></div><div class="deck-block-lines">${escapeHtml(v32BlockItemsText(b.items))}</div></div>`).join("")||'<div class="warning-box">No block headings found. The complete workout will still be saved.</div>'}</div>
  <details><summary>Check complete original workout</summary><pre class="import-workout-preview">${escapeHtml(d.workout)}</pre></details>`;
};
async function v33AttachPendingPhoto(session){
  if(!v33PendingSessionPhoto||v33PendingPhotoSaved)return null;
  const file=v33PendingSessionPhoto;
  const localId=await saveMediaBlob(file,"photo",file.name||"session-board.jpg");
  const capture={id:uid("capture"),session_id:session.id,athlete_id:null,capture_type:"photo",text_content:"Planned session source photo",session_block_id:null,media_path:null,media_local_id:localId,mime_type:file.type||"image/jpeg",created_at:nowIso(),updated_at:nowIso()};
  upsertLocal("captures",capture);queueRecord("captures",capture.id);
  const tr={id:uid("transcript"),session_id:session.id,capture_id:capture.id,purpose:"planned",source_type:"photo",athlete_id:null,session_block_id:null,status:"photo_saved",raw_text:session.workout||"",structured_blocks:v32ParseWorkoutBlocks(session.workout||""),structured_data:{},created_at:nowIso(),updated_at:nowIso()};
  upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);
  v32CurrentTranscriptionId=tr.id;v33PendingPhotoSaved=true;
  return tr;
}
function v33ReplaceImportedBlocks(session){
  const existing=(appState.session_blocks||[]).filter(b=>b.session_id===session.id&&b.source_import==="phone_v33");
  for(const b of existing){appState.session_blocks=appState.session_blocks.filter(x=>x.id!==b.id);queueDelete("session_blocks",b.id)}
  const parsed=v32ParseWorkoutBlocks(v33WorkoutForBlocks(session.workout||""));
  parsed.forEach((b,i)=>{
    const r={id:uid("block"),session_id:session.id,block_type:b.block_type,title:b.title,sort_order:(V32_BLOCK_ORDER[b.block_type]||70)+(i/100),items:b.items,notes:"Built from phone session import",status:"planned",source_import:"phone_v33",updated_at:nowIso()};
    upsertLocal("session_blocks",r);queueRecord("session_blocks",r.id);
  });
  return parsed.length;
}
saveImportedSession=async function(openNow){
  try{
    if(!importedSessionDraft)importedSessionDraft=parseSessionFromChat($("sessionPasteInput").value);
    const d=v33ApplyQuickFields(clone(importedSessionDraft));
    if(!d.session_date||!d.title)throw new Error("Date and title are required.");
    if(!d.workout)throw new Error("Paste, type or transcribe the session first.");
    delete d.live_set;
    const previousSelectedId=appState.settings.selected_session_id;
    const previousSelectedSquad=appState.settings.selected_squad;
    upsertLocal("sessions",d);queueRecord("sessions",d.id);
    if(openNow){
      appState.settings.selected_session_id=d.id;
      appState.settings.selected_squad=sessionSquads(d)[0]||"";
    }else if(previousSelectedId&&appState.sessions.some(s=>s.id===previousSelectedId)){
      appState.settings.selected_session_id=previousSelectedId;
      appState.settings.selected_squad=previousSelectedSquad||sessionSquads(appState.sessions.find(s=>s.id===previousSelectedId))[0]||"";
    }
    const blockCount=v33ReplaceImportedBlocks(d);
    await v33AttachPendingPhoto(d);
    saveState(appState);
    importedSessionDraft=d;
    renderAll();
    v33SetImportMessage(`Saved ${sessionLabel(d)} — ${d.title}. ${blockCount} complete block${blockCount===1?"":"s"} ready on Deck.`,"good");
    scheduleFastSync();
    if(openNow){
      $("sessionImportDetails").open=false;
      showView("deck");
      window.scrollTo({top:0,behavior:"smooth"});
      updateStatus("Session saved, selected and open on Deck","good");
    }else{
      showView("sessions");fillSessionEditor(d);updateStatus("Session saved for later","good");
    }
  }catch(error){
    console.error(error);v33SetImportMessage(error.message||"Could not save the session.","warning");updateStatus("Session needs checking","error");
  }
};
async function v33QuickPhotoTranscribe(){
  const file=v33PendingSessionPhoto;if(!file)return;
  try{
    let draft=importedSessionDraft;
    if(!draft){
      const seed=$("sessionPasteInput").value.trim()||`Session title: ${$("quickSessionTitle").value.trim()||"Session photo import"}\nDate: ${$("quickSessionDate").value}\nSquads: ${$("quickSessionSquads").value}`;
      draft=parseSessionFromChat(seed);
    }
    draft=v33ApplyQuickFields(draft);
    if(!draft.title)draft.title="Session photo import";
    if(!draft.workout)draft.workout="Session photo attached — transcription pending";
    importedSessionDraft=draft;
    v33PhotoPreviousSessionId=appState.settings.selected_session_id||"";
    v33PhotoPreviousSquad=appState.settings.selected_squad||"";
    upsertLocal("sessions",draft);queueRecord("sessions",draft.id);
    // The existing transcription function works from the selected session, so select
    // the draft only while the photo is saved/transcribed, then restore the session
    // the coach was using until Save & Use Now is pressed.
    appState.settings.selected_session_id=draft.id;appState.settings.selected_squad=sessionSquads(draft)[0]||"";
    saveState(appState);
    await v33AttachPendingPhoto(draft);
    await syncIfPossible();
    if(!cloudReady()){
      if(v33PhotoPreviousSessionId&&appState.sessions.some(s=>s.id===v33PhotoPreviousSessionId)){
        appState.settings.selected_session_id=v33PhotoPreviousSessionId;
        appState.settings.selected_squad=v33PhotoPreviousSquad||sessionSquads(appState.sessions.find(s=>s.id===v33PhotoPreviousSessionId))[0]||"";
        saveState(appState);
      }
      renderAll();$("sessionImportDetails").open=true;
      v33SetImportMessage("Photo is attached to the draft. Connect Supabase to transcribe automatically, or type/paste the session here now.","warning");
      return;
    }
    await v32AutomaticTranscribe();
    const tr=appState.session_transcriptions.find(x=>x.id===v32CurrentTranscriptionId);
    if(v33PhotoPreviousSessionId&&appState.sessions.some(s=>s.id===v33PhotoPreviousSessionId)){
      appState.settings.selected_session_id=v33PhotoPreviousSessionId;
      appState.settings.selected_squad=v33PhotoPreviousSquad||sessionSquads(appState.sessions.find(s=>s.id===v33PhotoPreviousSessionId))[0]||"";
      saveState(appState);
    }
    if(tr?.raw_text){
      $("sessionPasteInput").value=tr.raw_text;
      importedSessionDraft={...draft,...parseSessionFromChat(tr.raw_text),id:draft.id};
      renderSessionImportPreview();
      $("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;
      $("sessionImportDetails").open=true;
      v33SetImportMessage("Photo transcribed. Correct anything needed, then Save & Use Now.","good");
    }
  }catch(error){
    console.error(error);$("sessionImportDetails").open=true;
    v33SetImportMessage(`${error.message||"Automatic transcription was unavailable."} The photo remains attached; type or paste the session instead.`,"warning");
  }
}
function v33RenderDeckBlocks(){
  const host=$("deckBlockList");if(!host)return;
  const session=selectedSession();
  if(!session){host.innerHTML='<div class="help">Choose or create a session first.</div>';return}
  let blocks=v32SessionBlocks(session.id);
  if(!blocks.length&&session.workout)blocks=v32ParseWorkoutBlocks(session.workout).map((b,i)=>({...b,id:"",sort_order:i}));
  host.innerHTML=blocks.length?blocks.map((b,i)=>`<article class="deck-block-card">
    <div class="block-title-row"><div><div class="eyebrow">${escapeHtml(v32BlockLabel(b.block_type))}</div><strong>${escapeHtml(b.title||v32BlockLabel(b.block_type))}</strong></div><span class="badge">${i+1}</span></div>
    <div class="deck-block-lines">${escapeHtml(v32BlockItemsText(b.items)||"No set lines entered.")}</div>
    ${b.notes?`<div class="help"><strong>Coach note:</strong> ${escapeHtml(b.notes)}</div>`:""}
    <div class="button-row">${b.id?`<button type="button" data-deck-run-block="${escapeHtml(b.id)}">Run entire block</button>`:""}<button type="button" class="secondary" data-deck-edit-current>View / edit</button></div>
  </article>`).join(""):'<div class="warning-box">The full workout is shown above, but no blocks have been built yet.</div>';
  host.querySelectorAll("[data-deck-run-block]").forEach(b=>b.onclick=()=>v32RunBlock(b.dataset.deckRunBlock));
  host.querySelectorAll("[data-deck-edit-current]").forEach(b=>b.onclick=v33EditCurrentSession);
}
function v33EditCurrentSession(){
  const s=selectedSession();if(!s)return v33OpenSessionComposer();
  showView("sessions");fillSessionEditor(s);v32RenderSessionBlocks();setTimeout(()=>$("sessionEditorTitle")?.scrollIntoView({block:"start",behavior:"smooth"}),40);
}
const v33BaseRenderDeck=renderDeck;
renderDeck=function(){v33BaseRenderDeck();v33RenderDeckBlocks()};
function v33CaptureBlockPrefix(){
  const id=$("captureBlock")?.value;if(!id)return "";
  const block=appState.session_blocks.find(b=>b.id===id);
  return block?` [Block: ${block.title||v32BlockLabel(block.block_type)}]`:"";
}
function v33PopulateCaptureBlocks(){
  const select=$("captureBlock");if(!select)return;
  const current=select.value,blocks=v32SessionBlocks(selectedSession()?.id);
  select.innerHTML='<option value="">Whole session</option>'+blocks.map(b=>`<option value="${escapeHtml(b.id)}" ${b.id===current?"selected":""}>${escapeHtml(b.title||v32BlockLabel(b.block_type))}</option>`).join("");
}
async function v33DeleteMediaLocal(id){
  if(!id)return;
  try{const db=await openMediaDb();await new Promise((resolve,reject)=>{const tx=db.transaction(MEDIA_STORE,"readwrite");tx.objectStore(MEDIA_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch(error){console.warn(error)}
}
async function v33DeleteCapture(id){
  const c=appState.captures.find(x=>x.id===id);if(!c||!confirm("Delete this session capture?"))return;
  if(c.media_local_id)await v33DeleteMediaLocal(c.media_local_id);
  appState.captures=appState.captures.filter(x=>x.id!==id);queueDelete("captures",id);saveState(appState);await syncIfPossible();renderAll();updateStatus("Capture deleted","good");
}
async function v33EditCapture(id){
  const c=appState.captures.find(x=>x.id===id);if(!c)return;
  const next=prompt("Edit the capture note",c.text_content||"");if(next===null)return;
  c.text_content=next.trim();c.updated_at=nowIso();queueRecord("captures",c.id);saveState(appState);await syncIfPossible();renderAll();updateStatus("Capture updated","good");
}
renderCaptures=async function(){
  const session=selectedSession(),host=$("captureList");if(!host)return;
  const items=(appState.captures||[]).filter(c=>c.session_id===session?.id).sort(byUpdated);
  if(!items.length){host.innerHTML='<div class="help">No captures for this session yet.</div>';return}
  const rows=[];
  for(const item of items){
    const athlete=appState.athletes.find(a=>a.id===item.athlete_id);
    const media=item.capture_type==="text"?"":`<div class="media-preview">${await mediaHtml(item)}</div>`;
    rows.push(`<div class="list-item"><strong>${escapeHtml(athlete?.full_name||"Whole session / group")}</strong><p>${escapeHtml(item.text_content||item.capture_type)}</p>${media}<div class="list-meta">${new Date(item.created_at).toLocaleString("en-NZ")}</div><div class="capture-manage-actions"><button type="button" class="secondary" data-capture-edit="${escapeHtml(item.id)}">Edit note</button><button type="button" class="danger-button" data-capture-delete="${escapeHtml(item.id)}">Delete</button></div></div>`);
  }
  host.innerHTML=rows.join("");
  host.querySelectorAll("[data-capture-edit]").forEach(b=>b.onclick=()=>v33EditCapture(b.dataset.captureEdit));
  host.querySelectorAll("[data-capture-delete]").forEach(b=>b.onclick=()=>v33DeleteCapture(b.dataset.captureDelete));
};
async function v33SaveEditorAndUse(){
  const existing=appState.sessions.find(s=>s.id===$("editSessionId").value);
  const linkedSeason=appState.season_plans.find(s=>s.id===$("editSessionSeasonPlan")?.value);
  const linkedWeek=appState.weekly_plans.find(w=>w.id===$("editSessionWeeklyPlan")?.value);
  const record={
    id:existing?.id||uid("session"),session_date:$("editSessionDate").value,day_part:$("editSessionPart").value,
    venue:$("editSessionVenue").value.trim(),title:$("editSessionTitle").value.trim(),
    squads:$("editSessionSquads").value.split(",").map(x=>x.trim()).filter(Boolean),
    planned_distance:Number($("editSessionDistance").value||0),primary_system:$("editSessionSystem").value.trim(),
    technical_focus:$("editSessionTechnical").value.trim(),season_plan_id:$("editSessionSeasonPlan")?.value||null,weekly_plan_id:$("editSessionWeeklyPlan")?.value||null,
    lane_count:Math.max(1,Math.min(12,Number($("editSessionLaneCount")?.value||1))),pool_course:$("editSessionPoolCourse")?.value||"SCM",
    season_name:linkedSeason?.name||$("editSessionSeason").value.trim(),week_start:linkedWeek?.week_start||$("editSessionWeekStart").value||null,
    week_phase:linkedWeek?.phase||$("editSessionWeekPhase").value.trim(),week_objective:linkedWeek?.objective||$("editSessionWeekObjective").value.trim(),
    week_carry_forward:linkedWeek?.carry_forward||$("editSessionWeekCarry").value.trim(),plan_cue:$("editSessionPlanCue").value.trim(),
    next_session_cue:$("editSessionNextCue").value.trim(),workout:$("editSessionWorkout").value,sets:extractStructuredSets($("editSessionWorkout").value),
    step_number:existing?.step_number||null,previous_session_id:existing?.previous_session_id||null,status:existing?.status||"planned",updated_at:nowIso()
  };
  if(!record.session_date||!record.title)return alert("Date and title are required.");
  upsertLocal("sessions",record);queueRecord("sessions",record.id);appState.settings.selected_session_id=record.id;appState.settings.selected_squad=sessionSquads(record)[0]||"";
  if(!v32SessionBlocks(record.id).length&&record.workout)v33ReplaceImportedBlocks(record);
  saveState(appState);await syncIfPossible();renderAll();showView("deck");window.scrollTo({top:0,behavior:"smooth"});updateStatus("Session saved and open on Deck","good");
}
deleteSession=async function(id){
  const session=appState.sessions.find(s=>s.id===id);if(!session)return;
  if(!confirm(`Delete ${sessionLabel(session)} — ${session.title}? This also deletes its blocks, photos/transcripts and session data.`))return;
  if(!appState.settings.deleted_session_ids.includes(id))appState.settings.deleted_session_ids.push(id);
  const linkedTables=["session_blocks","session_transcriptions","attendance","captures","timed_sets","session_reviews","session_lane_assignments","test_set_attempts"];
  for(const table of linkedTables){
    for(const r of (appState[table]||[]).filter(x=>x.session_id===id))queueDelete(table,r.id);
    appState[table]=(appState[table]||[]).filter(x=>x.session_id!==id);
  }
  appState.sessions=appState.sessions.filter(s=>s.id!==id);queueDelete("sessions",id);
  if(appState.settings.selected_session_id===id){
    const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];
    appState.settings.selected_session_id=next?.id||"";appState.settings.selected_squad=sessionSquads(next)[0]||"";
  }
  saveState(appState);renderAll();await syncIfPossible();v33FilterDeletedSessions();saveState(appState);fillSessionEditor(selectedSession());renderAll();updateStatus("Session deleted and blocked from returning","good");
};
const v33BasePullCloud=pullCloud;
pullCloud=async function(){await v33BasePullCloud();v33FilterDeletedSessions();saveState(appState)};
readSharedText=function(){
  const params=new URLSearchParams(location.search);
  const parts=[params.get("share-title"),params.get("share-text"),params.get("share-url")].filter(Boolean);
  if(!parts.length)return false;
  const text=parts.join("\n");history.replaceState({},document.title,location.pathname);
  if(v33LooksLikeSessionText(text)){v33OpenSessionComposer({text});updateStatus("Shared session ready to check","good")}
  else{$("captureText").value=text;showView("capture");updateStatus("Shared text ready to save","good")}
  return true;
};

if($("contextAddSessionBtn"))$("contextAddSessionBtn").addEventListener("click",()=>v33OpenSessionComposer());
if($("deckAddSessionBtn"))$("deckAddSessionBtn").addEventListener("click",()=>v33OpenSessionComposer());
if($("deckEditSessionBtn"))$("deckEditSessionBtn").addEventListener("click",v33EditCurrentSession);
if($("manageAddSessionBtn"))$("manageAddSessionBtn").addEventListener("click",()=>v33OpenSessionComposer());
if($("resetSessionImportBtn"))$("resetSessionImportBtn").addEventListener("click",()=>v33ResetSessionImport());
if($("openChatGptBtn"))$("openChatGptBtn").addEventListener("click",()=>window.open("https://chatgpt.com/","_blank","noopener"));
if($("quickSessionPhotoInput"))$("quickSessionPhotoInput").addEventListener("change",e=>{
  v33PendingSessionPhoto=e.target.files?.[0]||null;v33PendingPhotoSaved=false;
  if(v33QuickPhotoUrl)URL.revokeObjectURL(v33QuickPhotoUrl);
  if(v33PendingSessionPhoto){
    v33QuickPhotoUrl=URL.createObjectURL(v33PendingSessionPhoto);
    $("quickSessionPhotoPreview").src=v33QuickPhotoUrl;$("quickSessionPhotoPreview").hidden=false;
    $("quickSessionPhotoTranscribeBtn").disabled=false;
    v33SetImportMessage("Photo selected. Paste/type the session, or create a draft and try automatic transcription.","good");
  }
});
if($("quickSessionPhotoTranscribeBtn"))$("quickSessionPhotoTranscribeBtn").addEventListener("click",v33QuickPhotoTranscribe);
if($("saveSessionAndUseBtn"))$("saveSessionAndUseBtn").addEventListener("click",v33SaveEditorAndUse);
for(const id of ["quickSessionDate","quickSessionPart","quickSessionTitle","quickSessionSquads","quickSessionLanes","quickSessionCourse"]){
  if($(id))$(id).addEventListener("change",()=>{if(importedSessionDraft){importedSessionDraft=v33ApplyQuickFields(importedSessionDraft);renderSessionImportPreview()}});
}
const v33BaseRenderView=renderView;
renderView=function(id){v33BaseRenderView(id);if(id==="capture")v33PopulateCaptureBlocks();if(id==="deck")v33RenderDeckBlocks()};
const v33BaseRenderAll=renderAll;
renderAll=function(){v33BaseRenderAll();v33PopulateCaptureBlocks();v33RenderDeckBlocks()};
v33ResetSessionImport();

const savedSession=appState.sessions.find(s=>s.id===appState.settings.selected_session_id);if(!savedSession&&appState.sessions.length){const today=localIsoDate(new Date()),fallback=appState.sessions.slice().sort((a,b)=>Math.abs(new Date(`${a.session_date}T12:00:00`)-new Date(`${today}T12:00:00`))-Math.abs(new Date(`${b.session_date}T12:00:00`)-new Date(`${today}T12:00:00`))||String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0];appState.settings.selected_session_id=fallback.id;appState.settings.selected_squad=sessionSquads(fallback)[0]||"";saveState(appState)}else if(savedSession&&!sessionSquads(savedSession).some(s=>squadKey(s)===squadKey(appState.settings.selected_squad))){appState.settings.selected_squad=sessionSquads(savedSession)[0]||"";saveState(appState)}
bindLiveSet();
if($("finishSessionBtn"))$("finishSessionBtn").addEventListener("click",saveFinishSession);
renderAll();
fillSessionEditor(selectedSession());
if(window.matchMedia("(max-width: 980px)").matches) showView("deck");
readSharedText();
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",async()=>{try{const registration=await navigator.serviceWorker.register("./sw.js?v=20260728-phone3104",{updateViaCache:"none"});await registration.update();registration.waiting?.postMessage("SKIP_WAITING")}catch(error){console.warn("Service worker update",error)}});
}
/* v3.10.2: startup cloud pull deferred; local UI opens first. */

// =============================================================================
// McLay Swimming OS v3.3.1 base — non-blocking optional-table sync repair.
// session_transcriptions was added after the original cloud schema. A missing
// optional table must not stop sessions, attendance, captures, timing, plans,
// results or reviews from syncing.
// =============================================================================
const V331_OPTIONAL_CLOUD_TABLES = new Set(["session_transcriptions"]);
const v331LegacySyncIfPossible=syncIfPossible;
window.removeEventListener("online",v331LegacySyncIfPossible);
if(!Array.isArray(appState.settings.unavailable_cloud_tables))appState.settings.unavailable_cloud_tables=[];

function v331MissingRelationTable(error){
  const message=String(error?.message||error||"");
  const quoted=message.match(/table\s+'public\.([^']+)'\s+in the schema cache/i);
  if(quoted)return quoted[1];
  const relation=message.match(/relation\s+"(?:public\.)?([^"]+)"\s+does not exist/i);
  return relation?.[1]||"";
}
function v331UnavailableTables(){return new Set(appState.settings.unavailable_cloud_tables||[])}
function v331MarkTableUnavailable(table,error){
  if(!V331_OPTIONAL_CLOUD_TABLES.has(table))return false;
  if(!appState.settings.unavailable_cloud_tables.includes(table))appState.settings.unavailable_cloud_tables.push(table);
  saveState(appState);
  console.warn(`Optional cloud table ${table} is unavailable; its records will remain local.`,error);
  return true;
}
function v331ClearOptionalTableWarnings(){
  appState.settings.unavailable_cloud_tables=(appState.settings.unavailable_cloud_tables||[]).filter(t=>!V331_OPTIONAL_CLOUD_TABLES.has(t));
  saveState(appState);
}
function v331SyncStatusText(){
  return v331UnavailableTables().has("session_transcriptions")
    ? "Cloud synced · photo transcripts stay on this device"
    : "Cloud synced";
}

pushPending=async function(){
  if(!cloudReady())return;
  const priority={athletes:1,season_plans:2,weekly_plans:3,sessions:4,session_lane_assignments:5,session_blocks:6,test_sets:7,attendance:8,captures:9,timed_sets:10,test_set_attempts:11,coach_result_imports:12,coach_results:13,coach_result_aliases:14,session_reviews:15,session_transcriptions:16};
  const pending=[...appState.pending].sort((a,b)=>(priority[a.table]||99)-(priority[b.table]||99));
  for(const item of pending){
    if(V331_OPTIONAL_CLOUD_TABLES.has(item.table)&&v331UnavailableTables().has(item.table))continue;
    try{
      if(item.action==="delete"){
        await cloudFetch(`/rest/v1/${item.table}?id=eq.${encodeURIComponent(item.id)}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
        appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);
        continue;
      }
      const record=appState[item.table]?.find(r=>r.id===item.id);
      if(!record){appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));continue}
      if(item.table==="captures")await uploadCaptureMedia(record);
      const row=cloudRow(item.table,record);
      await cloudFetch(`/rest/v1/${item.table}?on_conflict=id`,{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row)});
      appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);
    }catch(error){
      const missing=v331MissingRelationTable(error);
      if(missing===item.table&&v331MarkTableUnavailable(item.table,error))continue;
      throw error;
    }
  }
};

pullCloud=async function(){
  if(!cloudReady())return;
  const org=appState.settings.organisation_id;
  for(const table of CLOUD_TABLES){
    if(V331_OPTIONAL_CLOUD_TABLES.has(table)&&v331UnavailableTables().has(table))continue;
    try{
      const rows=await cloudFetch(`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);
      appState[table]=mergeCollection(appState[table],rows);
    }catch(error){
      const missing=v331MissingRelationTable(error);
      if(missing===table&&v331MarkTableUnavailable(table,error))continue;
      throw error;
    }
  }
  for(const view of RESULT_VIEWS){
    try{const rows=await cloudFetch(`/rest/v1/${view}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);appState[view]=rows.map(stripCloudFields)}
    catch(error){console.warn(`Optional result source ${view} not available`,error);if(!Array.isArray(appState[view]))appState[view]=[]}
  }
  for(const table of REFERENCE_TABLES){
    try{appState[table]=await cloudFetch(`/rest/v1/${table}?select=*`)}
    catch(error){console.warn(`Reference table ${table} unavailable`,error);if(!Array.isArray(appState[table]))appState[table]=[]}
  }
  v33FilterDeletedSessions();
  saveState(appState);
};

syncNow=async function(){
  if(!getAuth()?.access_token)throw new Error("Sign in first.");
  if(!appState.settings.organisation_id)await ensureOrganisation();
  // Manual Sync retries optional tables, so running a later migration requires
  // only pressing Sync now; no local-data reset is needed.
  v331ClearOptionalTableWarnings();
  updateStatus("Syncing…");
  await pushPending();
  await pullCloud();
  updateStatus(v331SyncStatusText(),v331UnavailableTables().size?"normal":"good");
  renderAll();
};

syncIfPossible=async function(){
  if(!cloudReady()){renderMode();return}
  try{
    await pushPending();
    await pullCloud();
    updateStatus(v331SyncStatusText(),v331UnavailableTables().size?"normal":"good");
  }catch(error){
    console.error(error);
    updateStatus("Waiting to sync","error");
  }
};

// The original Sync button and sign-in handlers resolve syncNow at click time,
// so they automatically use this repaired implementation.
window.addEventListener("online",()=>syncIfPossible());

// Retry immediately with the safe sync path. This clears the stuck "Syncing…"
// state shown by v3.3 without requiring the user to sign out or clear the app.
/* v3.10.2: duplicate startup cloud pull removed. */


// =============================================================================
// McLay Swimming OS v3.4 — photo + voice transcription and approved application.
// One transcription table handles both source types; nothing is applied silently.
// =============================================================================
let v34CurrentVoiceTranscriptionId="";

function v34Array(value){return Array.isArray(value)?value:[]}
function v34AppendText(existing,addition){
  const parts=[String(existing||"").trim(),String(addition||"").trim()].filter(Boolean);
  return [...new Set(parts)].join("\n");
}
function v34NormalizeName(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function v34FindAthlete(name,fallbackId=""){
  if(fallbackId){const exact=appState.athletes.find(a=>a.id===fallbackId);if(exact)return exact}
  const key=v34NormalizeName(name);if(!key)return null;
  return appState.athletes.find(a=>v34NormalizeName(a.full_name)===key)||appState.athletes.find(a=>v34NormalizeName(a.full_name).includes(key)||key.includes(v34NormalizeName(a.full_name)))||null;
}
function v34VoiceRows(){return (appState.session_transcriptions||[]).filter(t=>t.session_id===selectedSession()?.id&&(t.source_type||"photo")==="voice").sort(byUpdated)}
function v34CurrentVoiceTranscript(){return appState.session_transcriptions.find(t=>t.id===v34CurrentVoiceTranscriptionId)||null}
function v34SetVoiceStatus(text,mode=""){
  const el=$("voiceTranscriptStatus");if(!el)return;el.textContent=text;el.className=`badge ${mode}`.trim();
}
async function v34TranscribeCapture(tr,capture,{rawTextOverride=""}={}){
  if(!tr||!capture)throw new Error("The transcription or linked capture is missing.");
  if(!cloudReady())throw new Error("Cloud connection is required for AI transcription.");
  if(typeof v331ClearOptionalTableWarnings==="function")v331ClearOptionalTableWarnings();
  if(!capture.media_path&&!rawTextOverride){
    await v3102FlushPendingNow();
  }
  if(!capture.media_path&&!rawTextOverride)throw new Error("The media is still waiting to upload. Press Sync and retry.");
  tr.source_type=tr.source_type||capture.capture_type||"photo";
  tr.athlete_id=tr.athlete_id||capture.athlete_id||null;
  tr.session_block_id=tr.session_block_id||capture.session_block_id||null;
  tr.status="transcribing";tr.error_message="";tr.updated_at=nowIso();
  upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);
  await v3102FlushPendingNow();
  const config=getConfig(),auth=getAuth();
  const res=await fetch(`${config.supabaseUrl}/functions/v1/transcribe-capture`,{
    method:"POST",headers:{apikey:config.supabaseAnonKey,Authorization:`Bearer ${auth.access_token}`,"Content-Type":"application/json"},
    body:JSON.stringify({transcription_id:tr.id,capture_id:capture.id,session_id:tr.session_id,media_path:capture.media_path,source_type:tr.source_type,purpose:tr.purpose,athlete_id:tr.athlete_id,session_block_id:tr.session_block_id,raw_text_override:rawTextOverride||null})
  });
  const data=await res.json();
  if(!res.ok){tr.status="error";tr.error_message=data.error||"Transcription failed";tr.updated_at=nowIso();upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);await v3102FlushPendingNow();throw new Error(tr.error_message)}
  tr.raw_text=data.raw_text||rawTextOverride||"";
  tr.structured_blocks=data.structured_blocks||[];
  tr.structured_data=data.structured_data||{};
  tr.status="review";tr.error_message="";tr.updated_at=nowIso();
  upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);await v3102FlushPendingNow();
  return tr;
}

async function v34CreateVoiceTranscription(capture,autoTranscribe=false){
  if(!capture)return;
  const existing=(appState.session_transcriptions||[]).find(t=>t.capture_id===capture.id&&(t.source_type||"")==="voice");
  const tr=existing||{id:uid("transcript"),session_id:capture.session_id,capture_id:capture.id,athlete_id:capture.athlete_id||null,session_block_id:capture.session_block_id||null,source_type:"voice",purpose:$("voiceNoteMode")?.value||"quick_note",status:"audio_saved",raw_text:"",structured_blocks:[],structured_data:{},error_message:"",created_at:nowIso(),updated_at:nowIso()};
  upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);v34CurrentVoiceTranscriptionId=tr.id;saveState(appState);renderAll();
  if(autoTranscribe){
    try{v34SetVoiceStatus("Transcribing…");await v34TranscribeCapture(tr,capture);renderAll();updateStatus("Voice note transcribed · check before applying","good")}
    catch(error){renderAll();updateStatus("Voice note saved · transcription can be retried","error")}
  }else await syncIfPossible();
}
function v34StructuredList(title,items){
  const values=v34Array(items).map(String).filter(Boolean);if(!values.length)return "";
  return `<div class="voice-structured-section"><strong>${escapeHtml(title)}</strong><ul>${values.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`;
}
function v34VoicePreviewHtml(tr){
  if(!tr)return '<div class="help">Choose a voice note.</div>';
  if(tr.status==="error")return `<div class="transcript-error"><strong>Transcription needs retry</strong><div>${escapeHtml(tr.error_message||"Unknown error")}</div></div>`;
  const d=tr.structured_data||{};
  const times=v34Array(d.detected_times);
  return `${d.summary?`<div class="voice-structured-section"><strong>Summary</strong><div>${escapeHtml(d.summary)}</div></div>`:""}
    ${d.category?`<div class="voice-structured-section"><strong>Type</strong><div>${escapeHtml(d.category)}</div></div>`:""}
    ${v34StructuredList("Session changes",d.session_changes)}
    ${v34StructuredList("Athlete response",d.athlete_response)}
    ${v34StructuredList("Coaching cues",d.coaching_cues)}
    ${v34StructuredList("Follow-ups",d.follow_ups)}
    ${times.length?`<div class="voice-structured-section"><strong>Detected times — check before saving</strong>${times.map(t=>`<div><span class="voice-time-chip">${escapeHtml(t.athlete_name||"Selected swimmer")} · ${escapeHtml(t.distance||"?")}m ${escapeHtml(t.stroke||"")}</span>${v34Array(t.times_seconds).map(v=>`<span class="voice-time-chip">${escapeHtml(v3Time(Number(v)))}</span>`).join("")}${t.send_off?`<span class="voice-time-chip">on ${escapeHtml(t.send_off)}</span>`:""}</div>`).join("")}</div>`:""}
    ${!d.summary&&!times.length?'<div class="help">Transcribe or re-analyse this voice note to produce structured coaching information.</div>':""}`;
}
function v34UseVoiceTranscription(id){
  const tr=appState.session_transcriptions.find(t=>t.id===id);if(!tr)return;
  v34CurrentVoiceTranscriptionId=id;
  $("voiceTranscriptText").value=tr.raw_text||"";
  $("voiceStructuredPreview").innerHTML=v34VoicePreviewHtml(tr);
  v34SetVoiceStatus(tr.status||"saved",tr.status==="review"?"good":tr.status==="error"?"error":"");
  for(const id of ["saveVoiceTranscriptBtn","reanalyzeVoiceTranscriptBtn","retryVoiceTranscriptBtn","applyVoiceTranscriptBtn","deleteVoiceTranscriptBtn"])if($(id))$(id).disabled=false;
  const mode=tr.purpose||"quick_note";
  if($("voiceApplyFinish"))$("voiceApplyFinish").checked=mode==="session_debrief";
  if($("voiceApplyAthlete"))$("voiceApplyAthlete").checked=Boolean(tr.athlete_id);
  if($("voiceApplyTimes"))$("voiceApplyTimes").checked=false;
  v34RenderVoiceInboxOnly();
}
function v34RenderVoiceInboxOnly(){
  const host=$("voiceTranscriptionInbox");if(!host)return;
  const rows=v34VoiceRows();
  host.innerHTML=rows.length?rows.map(tr=>{
    const a=appState.athletes.find(x=>x.id===tr.athlete_id),c=appState.captures.find(x=>x.id===tr.capture_id),block=appState.session_blocks.find(x=>x.id===tr.session_block_id);
    return `<div class="voice-transcript-row ${tr.id===v34CurrentVoiceTranscriptionId?"active":""}"><div><strong>${escapeHtml(a?.full_name||"Whole session / group")}</strong><div class="list-meta">${escapeHtml(tr.purpose==="session_debrief"?"Session debrief":"Quick note")}${block?` · ${escapeHtml(block.title)}`:""} · ${escapeHtml(tr.status||"saved")} · ${new Date(tr.updated_at||tr.created_at).toLocaleString("en-NZ")}</div></div><div class="voice-transcript-actions"><button type="button" class="secondary" data-voice-use="${escapeHtml(tr.id)}">Open</button>${c?`<button type="button" data-voice-retry="${escapeHtml(tr.id)}">${tr.raw_text?"Re-transcribe":"Transcribe"}</button>`:""}</div></div>`;
  }).join(""):'<div class="help">No voice transcripts for this session yet.</div>';
  host.querySelectorAll("[data-voice-use]").forEach(b=>b.onclick=()=>v34UseVoiceTranscription(b.dataset.voiceUse));
  host.querySelectorAll("[data-voice-retry]").forEach(b=>b.onclick=async()=>{v34UseVoiceTranscription(b.dataset.voiceRetry);await v34RetryVoiceTranscription()});
}
function v34RenderVoiceTranscriptions(){
  if(!$("voiceTranscriptionPanel"))return;
  const rows=v34VoiceRows();
  if(v34CurrentVoiceTranscriptionId&&!rows.some(t=>t.id===v34CurrentVoiceTranscriptionId))v34CurrentVoiceTranscriptionId="";
  if(!v34CurrentVoiceTranscriptionId&&rows.length)v34CurrentVoiceTranscriptionId=rows[0].id;
  v34RenderVoiceInboxOnly();
  const tr=v34CurrentVoiceTranscript();
  if(tr){
    $("voiceTranscriptText").value=tr.raw_text||"";
    $("voiceStructuredPreview").innerHTML=v34VoicePreviewHtml(tr);
    v34SetVoiceStatus(tr.status||"saved",tr.status==="review"?"good":tr.status==="error"?"error":"");
    for(const id of ["saveVoiceTranscriptBtn","reanalyzeVoiceTranscriptBtn","retryVoiceTranscriptBtn","applyVoiceTranscriptBtn","deleteVoiceTranscriptBtn"])if($(id))$(id).disabled=false;
    if($("voiceApplyFinish"))$("voiceApplyFinish").checked=(tr.purpose||"quick_note")==="session_debrief";
    if($("voiceApplyAthlete"))$("voiceApplyAthlete").checked=Boolean(tr.athlete_id);
  }else{
    $("voiceTranscriptText").value="";$("voiceStructuredPreview").innerHTML='<div class="help">The app will pull out session changes, athlete response, cues, follow-ups and any spoken times.</div>';v34SetVoiceStatus("No voice note selected");
    for(const id of ["saveVoiceTranscriptBtn","reanalyzeVoiceTranscriptBtn","retryVoiceTranscriptBtn","applyVoiceTranscriptBtn","deleteVoiceTranscriptBtn"])if($(id))$(id).disabled=true;
  }
}
async function v34SaveEditedVoiceTranscript(reanalyse=false){
  const tr=v34CurrentVoiceTranscript();if(!tr)return;
  const text=$("voiceTranscriptText").value.trim();if(!text)return alert("Add transcript text first.");
  tr.raw_text=text;tr.status="review";tr.updated_at=nowIso();upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);await syncIfPossible();
  if(reanalyse){const capture=appState.captures.find(c=>c.id===tr.capture_id);if(!capture)return alert("The linked audio capture is missing.");try{v34SetVoiceStatus("Re-analysing…");await v34TranscribeCapture(tr,capture,{rawTextOverride:text});updateStatus("Edited transcript analysed","good")}catch(error){alert(error.message)}}
  renderAll();
}
async function v34RetryVoiceTranscription(){
  const tr=v34CurrentVoiceTranscript();if(!tr)return;
  const capture=appState.captures.find(c=>c.id===tr.capture_id);if(!capture)return alert("The linked voice recording is missing.");
  try{v34SetVoiceStatus("Transcribing…");await v34TranscribeCapture(tr,capture);renderAll();updateStatus("Voice note transcribed · check before applying","good")}catch(error){renderAll();alert(error.message)}
}
async function v34DeleteVoiceTranscription(){
  const tr=v34CurrentVoiceTranscript();if(!tr||!confirm("Delete this transcript? The original voice recording will stay in Session captures."))return;
  appState.session_transcriptions=appState.session_transcriptions.filter(t=>t.id!==tr.id);queueDelete("session_transcriptions",tr.id);v34CurrentVoiceTranscriptionId="";saveState(appState);await syncIfPossible();renderAll();updateStatus("Voice transcript deleted","good");
}
async function v34ApplyVoiceTranscript(){
  const tr=v34CurrentVoiceTranscript();if(!tr)return;
  tr.raw_text=$("voiceTranscriptText").value.trim()||tr.raw_text||"";
  const d=tr.structured_data||{},capture=appState.captures.find(c=>c.id===tr.capture_id),athlete=v34FindAthlete(d.athlete_name,tr.athlete_id),session=appState.sessions.find(s=>s.id===tr.session_id);
  const summary=d.summary||tr.raw_text;
  if($("voiceApplyCapture")?.checked&&capture){capture.text_content=`Voice note${capture.session_block_id?` [Block: ${appState.session_blocks.find(b=>b.id===capture.session_block_id)?.title||"session block"}]`:""}: ${summary}`;capture.updated_at=nowIso();queueRecord("captures",capture.id)}
  if($("voiceApplyFinish")?.checked&&session){
    let review=appState.session_reviews.find(r=>r.session_id===session.id);
    if(!review){review={id:uid("review"),session_id:session.id,went_well:"",reinforce:"",athlete_notes:"",carry_forward:"",actual_distance:0,actual_duration:0,energy_systems:{},training_modes:{},stroke_exposure:{},athlete_response:"",modifications:"",race_split_evidence:"",completed_at:null,updated_at:nowIso()}}
    const f=d.finish_session||{};
    review.went_well=v34AppendText(review.went_well,f.went_well);
    review.reinforce=v34AppendText(review.reinforce,f.reinforce||v34Array(d.coaching_cues).join("; "));
    review.athlete_notes=v34AppendText(review.athlete_notes,f.athlete_notes||(athlete?`${athlete.full_name}: ${summary}`:""));
    review.carry_forward=v34AppendText(review.carry_forward,f.carry_forward||v34Array(d.follow_ups).join("; "));
    review.athlete_response=v34AppendText(review.athlete_response,f.athlete_response||v34Array(d.athlete_response).join("; "));
    review.modifications=v34AppendText(review.modifications,f.modifications||v34Array(d.session_changes).join("; "));
    review.race_split_evidence=v34AppendText(review.race_split_evidence,f.race_split_evidence);
    review.updated_at=nowIso();upsertLocal("session_reviews",review);queueRecord("session_reviews",review.id);
  }
  if($("voiceApplyAthlete")?.checked&&athlete){athlete.coach_notes=v34AppendText(athlete.coach_notes,`${new Date().toLocaleDateString("en-NZ")} · ${summary}`);athlete.updated_at=nowIso();queueRecord("athletes",athlete.id)}
  let savedTimes=0;
  if($("voiceApplyTimes")?.checked){
    for(const t of v34Array(d.detected_times)){
      const a=v34FindAthlete(t.athlete_name,tr.athlete_id),times=v34Array(t.times_seconds).map(Number).filter(x=>Number.isFinite(x)&&x>0),distance=Number(t.distance);
      if(!a||!times.length||!distance)continue;
      const r={id:uid("timed"),session_id:tr.session_id,athlete_id:a.id,distance,stroke:t.stroke||"Freestyle",set_label:t.set_label||"Voice-note times",send_off:t.send_off||"",times,average:times.reduce((x,y)=>x+y,0)/times.length,best:Math.min(...times),spread:Math.max(...times)-Math.min(...times),created_at:nowIso(),updated_at:nowIso()};
      upsertLocal("timed_sets",r);queueRecord("timed_sets",r.id);savedTimes++;
    }
  }
  tr.status="applied";tr.updated_at=nowIso();upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);await syncIfPossible();renderAll();updateStatus(`Voice note applied${savedTimes?` · ${savedTimes} timed set${savedTimes===1?"":"s"} saved`:""}`,"good");
}

// Delete linked transcript jobs when a capture is deliberately deleted.
v33DeleteCapture=async function(id){
  const c=appState.captures.find(x=>x.id===id);if(!c||!confirm("Delete this session capture and its linked transcript?"))return;
  const linked=(appState.session_transcriptions||[]).filter(t=>t.capture_id===id);
  for(const tr of linked){appState.session_transcriptions=appState.session_transcriptions.filter(t=>t.id!==tr.id);queueDelete("session_transcriptions",tr.id)}
  if(c.media_local_id)await v33DeleteMediaLocal(c.media_local_id);
  appState.captures=appState.captures.filter(x=>x.id!==id);queueDelete("captures",id);saveState(appState);await syncIfPossible();renderAll();updateStatus("Capture and transcript deleted","good");
};

// Richer capture list: voice notes show transcript status and can jump straight to review.
renderCaptures=async function(){
  const session=selectedSession(),host=$("captureList");if(!host)return;
  const items=(appState.captures||[]).filter(c=>c.session_id===session?.id).sort(byUpdated);
  if(!items.length){host.innerHTML='<div class="help">No captures for this session yet.</div>';return}
  const rows=[];
  for(const item of items){
    const athlete=appState.athletes.find(a=>a.id===item.athlete_id),block=appState.session_blocks.find(b=>b.id===item.session_block_id),tr=(appState.session_transcriptions||[]).find(t=>t.capture_id===item.id);
    const media=item.capture_type==="text"?"":`<div class="media-preview">${await mediaHtml(item)}</div>`;
    rows.push(`<div class="list-item"><strong>${escapeHtml(athlete?.full_name||"Whole session / group")}</strong>${block?`<span class="badge">${escapeHtml(block.title)}</span>`:""}<p>${escapeHtml(item.text_content||item.capture_type)}</p>${media}<div class="list-meta">${new Date(item.created_at).toLocaleString("en-NZ")}${tr?` · transcript ${escapeHtml(tr.status||"saved")}`:""}</div><div class="capture-manage-actions">${tr&&(tr.source_type||item.capture_type)==="voice"?`<button type="button" data-capture-transcript="${escapeHtml(tr.id)}">Review transcript</button>`:""}<button type="button" class="secondary" data-capture-edit="${escapeHtml(item.id)}">Edit note</button><button type="button" class="danger-button" data-capture-delete="${escapeHtml(item.id)}">Delete</button></div></div>`);
  }
  host.innerHTML=rows.join("");
  host.querySelectorAll("[data-capture-transcript]").forEach(b=>b.onclick=()=>{v34UseVoiceTranscription(b.dataset.captureTranscript);$("voiceTranscriptionPanel")?.scrollIntoView({block:"start",behavior:"smooth"})});
  host.querySelectorAll("[data-capture-edit]").forEach(b=>b.onclick=()=>v33EditCapture(b.dataset.captureEdit));
  host.querySelectorAll("[data-capture-delete]").forEach(b=>b.onclick=()=>v33DeleteCapture(b.dataset.captureDelete));
};

const v34BaseRenderView=renderView;
renderView=function(id){v34BaseRenderView(id);if(id==="capture")v34RenderVoiceTranscriptions()};
const v34BaseRenderAll=renderAll;
renderAll=function(){v34BaseRenderAll();v34RenderVoiceTranscriptions()};

if($("saveVoiceTranscriptBtn"))$("saveVoiceTranscriptBtn").addEventListener("click",()=>v34SaveEditedVoiceTranscript(false));
if($("reanalyzeVoiceTranscriptBtn"))$("reanalyzeVoiceTranscriptBtn").addEventListener("click",()=>v34SaveEditedVoiceTranscript(true));
if($("retryVoiceTranscriptBtn"))$("retryVoiceTranscriptBtn").addEventListener("click",v34RetryVoiceTranscription);
if($("applyVoiceTranscriptBtn"))$("applyVoiceTranscriptBtn").addEventListener("click",v34ApplyVoiceTranscript);
if($("deleteVoiceTranscriptBtn"))$("deleteVoiceTranscriptBtn").addEventListener("click",v34DeleteVoiceTranscription);

// The migration is now part of the v3.4 package. Manual Sync will retry the table
// immediately after it has been run, without clearing the phone's local records.
if(typeof v331ClearOptionalTableWarnings==="function")v331ClearOptionalTableWarnings();
renderAll();

// =============================================================================
// McLay Swimming OS v3.5 — stabilised phone coaching loop.
// Compact Deck, reliable block grouping, automatic lanes, plan-thread memory,
// finish-session voice prompts, and approved para/adapted session generation.
// =============================================================================
const V35_VERSION="3.5";
const V35_ADAPTATION_PROFILES={
  "charlotte murphy":{ratio:.5,label:"½ session",cycleMultiplier:1.3},
  "conor fischer":{ratio:.5,label:"½ session",cycleMultiplier:1.3},
  "mckenzie drage":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.25},
  "amber proudfoot":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.15},
  "matthew kofoed":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.15},
  "ruby stace":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.15}
};
let v35DraftBlocks=[];
let v35AdaptationAthleteId="";
let v35FinishRecorder=null;
let v35FinishChunks=[];
let v35FinishTarget="session_debrief";

function v35NameKey(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
function v35ProfileForAthlete(athlete){return V35_ADAPTATION_PROFILES[v35NameKey(athlete?.full_name)]||null}
function v35Text(value){return String(value||"").trim()}
function v35Clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function v35CycleSeconds(value){return typeof v3Seconds==="function"?v3Seconds(value):0}
function v35CycleText(seconds){return seconds?formatSeconds(Math.round(seconds)):""}
function v35BlockDistance(block){return v34Array(block?.items).reduce((sum,item)=>sum+Number(item.reps||1)*Number(item.distance||0),0)}
function v35HasSetLine(text){return /(?:\b\d{1,3}\s*[x×]\s*\d{2,4}\b|^\s*\d{2,4}\s*m?\b)/im.test(String(text||""))}
function v35HeadingType(line){
  const clean=String(line||"").trim().replace(/[:\-–—]+$/g,"").trim();
  const mapped=v32NormaliseBlockType(clean);
  if(mapped!=="other"&&clean.length<55&&!/\d+\s*[x×]\s*\d+/.test(clean))return mapped;
  return "";
}
function v35InferBlockType(text,index,total){
  const t=String(text||"").toLowerCase();
  if(/warm\s*[- ]?down|cool\s*[- ]?down|easy finish|loosen/.test(t))return "warm_down";
  if(/warm\s*[- ]?up|activation|build into/.test(t))return "warm_up";
  if(/skill|drill|alignment|body line|scull|underwater|turn|start/.test(t))return "skill";
  if(/pre\s*[- ]?set|prime|sharpen|neural|anc|cp/.test(t))return "pre_set";
  if(/kick/.test(t)&&!/main/.test(t))return "kick";
  if(/pull/.test(t)&&!/main/.test(t))return "pull";
  if(/reinforc|post\s*[- ]?set|quality finish|race skill/.test(t))return "post_set";
  if(/main\s*[- ]?set|threshold|race pace|vo2|critical|aerobic capacity|lactate/.test(t))return "main_set";
  if(index===0)return "warm_up";
  if(index===total-1)return "warm_down";
  return "main_set";
}
function v35TitleFromParagraph(lines,type){
  const first=String(lines[0]||"").trim().replace(/[:\-–—]+$/g,"").trim();
  const heading=v35HeadingType(first);
  if(heading)return first;
  const label=v32BlockLabel(type);
  const cue=lines.find(line=>!v35HasSetLine(line)&&String(line).length<60);
  return cue?`${label} — ${cue.replace(/^[-•*]\s*/,"")}`:label;
}
function v35ParseWorkoutBlocks(text){
  const rawLines=String(text||"").replace(/\r/g,"").split("\n");
  const groups=[];let group=[];let explicitType="";let explicitTitle="";
  const flush=()=>{
    const clean=group.map(x=>String(x).trim()).filter(Boolean);
    if(clean.length){groups.push({lines:clean,explicitType,explicitTitle});}
    group=[];explicitType="";explicitTitle="";
  };
  for(const raw of rawLines){
    const line=String(raw||"").trim();
    if(!line){flush();continue}
    const heading=v35HeadingType(line);
    if(heading){flush();explicitType=heading;explicitTitle=line.replace(/[:\-–—]+$/g,"").trim();continue}
    const isMeta=/^(date|time|venue|pool|location|squads?|group|title|session title|focus|technical|system|energy system|total|planned distance|purpose)\s*[:\-–—]/i.test(line);
    if(isMeta&&!group.length)continue;
    group.push(line);
  }
  flush();
  const useful=groups.filter(g=>g.lines.some(v35HasSetLine)||g.explicitType||g.lines.length>1);
  const blocks=useful.map((g,index)=>{
    const type=g.explicitType||v35InferBlockType(g.lines.join("\n"),index,useful.length);
    return {block_type:type,title:g.explicitTitle||v35TitleFromParagraph(g.lines,type),items:v32BlockItemsFromText(g.lines.join("\n")),raw_text:g.lines.join("\n")};
  });
  // Instruction-only paragraphs belong to the block above unless they clearly name a new block.
  const merged=[];
  for(const block of blocks){
    if(!v35HasSetLine(block.raw_text)&&merged.length&&!block.explicitType){
      const prior=merged[merged.length-1];prior.raw_text=`${prior.raw_text}\n${block.raw_text}`;prior.items=v32BlockItemsFromText(prior.raw_text);continue;
    }
    merged.push(block);
  }
  if(!merged.length&&String(text||"").trim())return [{block_type:"main_set",title:"Main set",items:v32BlockItemsFromText(text),raw_text:String(text).trim()}];
  return merged;
}

// Replace the older heading-only parser. Blank lines now create useful provisional blocks.
v32ParseWorkoutBlocks=v35ParseWorkoutBlocks;

function v35RenderEditableDraftBlocks(){
  const host=$("sessionImportPreview");if(!host||!importedSessionDraft)return;
  const d=importedSessionDraft;
  host.className="session-import-preview";
  host.innerHTML=`<div class="import-preview-grid">
    <div><span>Date</span><strong>${escapeHtml(sessionLabel(d))}</strong></div>
    <div><span>Title</span><strong>${escapeHtml(d.title||"Imported session")}</strong></div>
    <div><span>Squads</span><strong>${escapeHtml((d.squads||[]).join(" + ")||"Check squad")}</strong></div>
    <div><span>Distance</span><strong>${Number(d.planned_distance||0).toLocaleString()}m</strong></div>
    <div><span>Lanes / pool</span><strong>${Number(d.lane_count||1)} · ${escapeHtml(d.pool_course||"SCM")}</strong></div>
    <div><span>Blocks</span><strong>${v35DraftBlocks.length}</strong></div>
  </div>
  <div class="v35-block-review">${v35DraftBlocks.map((b,i)=>`<article class="v35-block-review-card" data-v35-draft-block="${i}">
    <div class="v35-block-review-head"><strong>Block ${i+1}</strong><select data-v35-block-type>${Object.keys(V32_BLOCK_ORDER).map(type=>`<option value="${type}" ${type===b.block_type?"selected":""}>${escapeHtml(v32BlockLabel(type))}</option>`).join("")}</select></div>
    <input data-v35-block-title value="${escapeHtml(b.title||v32BlockLabel(b.block_type))}" aria-label="Block title">
    <textarea data-v35-block-text class="large-textarea" aria-label="Complete block text">${escapeHtml(b.raw_text||v32BlockItemsText(b.items))}</textarea>
    <div class="button-row"><button type="button" class="secondary" data-v35-merge-previous ${i===0?"disabled":""}>Merge with previous</button><button type="button" class="secondary" data-v35-split-blanks>Split at blank lines</button></div>
  </article>`).join("")}</div>
  <details class="v35-original-session"><summary>Original pasted session</summary><pre class="import-workout-preview">${escapeHtml(d.workout||"")}</pre></details>`;
  host.querySelectorAll("[data-v35-draft-block]").forEach(card=>{
    const index=Number(card.dataset.v35DraftBlock),block=v35DraftBlocks[index];
    card.querySelector("[data-v35-block-type]").onchange=e=>{block.block_type=e.target.value;if(!block.title)block.title=v32BlockLabel(block.block_type)};
    card.querySelector("[data-v35-block-title]").oninput=e=>block.title=e.target.value;
    card.querySelector("[data-v35-block-text]").oninput=e=>{block.raw_text=e.target.value;block.items=v32BlockItemsFromText(e.target.value)};
    card.querySelector("[data-v35-merge-previous]").onclick=()=>{const prior=v35DraftBlocks[index-1];prior.raw_text=[prior.raw_text,v35DraftBlocks[index].raw_text].filter(Boolean).join("\n");prior.items=v32BlockItemsFromText(prior.raw_text);v35DraftBlocks.splice(index,1);v35RenderEditableDraftBlocks()};
    card.querySelector("[data-v35-split-blanks]").onclick=()=>{const parts=card.querySelector("[data-v35-block-text]").value.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);if(parts.length<2){v33SetImportMessage("Add a blank line where this block should split, then press Split at blank lines.","warning");return}const replacements=parts.map((part,n)=>({block_type:n?"main_set":block.block_type,title:n?`${block.title} ${n+1}`:block.title,raw_text:part,items:v32BlockItemsFromText(part)}));v35DraftBlocks.splice(index,1,...replacements);v35RenderEditableDraftBlocks()};
  });
}
const v35OldImportPreview=renderSessionImportPreview;
renderSessionImportPreview=function(){
  if(!importedSessionDraft)return v35OldImportPreview();
  importedSessionDraft=v33ApplyQuickFields(importedSessionDraft);
  v35DraftBlocks=v35ParseWorkoutBlocks(v33WorkoutForBlocks(importedSessionDraft.workout||""));
  $("quickSessionDate").value=importedSessionDraft.session_date||localIsoDate(new Date());
  $("quickSessionPart").value=importedSessionDraft.day_part||v33PartNow();
  $("quickSessionTitle").value=importedSessionDraft.title||"";
  $("quickSessionSquads").value=(importedSessionDraft.squads||[]).join(", ");
  $("quickSessionLanes").value=importedSessionDraft.lane_count||6;
  $("quickSessionCourse").value=importedSessionDraft.pool_course||"SCM";
  v35RenderEditableDraftBlocks();
};
const v35OldReplaceImportedBlocks=v33ReplaceImportedBlocks;
v33ReplaceImportedBlocks=function(session){
  const existing=(appState.session_blocks||[]).filter(b=>b.session_id===session.id&&["phone_v33","phone_v35"].includes(b.source_import));
  for(const b of existing){appState.session_blocks=appState.session_blocks.filter(x=>x.id!==b.id);queueDelete("session_blocks",b.id)}
  const parsed=v35DraftBlocks.length?v35DraftBlocks:v35ParseWorkoutBlocks(v33WorkoutForBlocks(session.workout||""));
  parsed.forEach((b,i)=>{
    const record={id:uid("block"),session_id:session.id,block_type:b.block_type,title:b.title||v32BlockLabel(b.block_type),sort_order:i+1,items:b.items?.length?b.items:v32BlockItemsFromText(b.raw_text||""),notes:"Built from v3.5 phone session import",status:"planned",source_import:"phone_v35",updated_at:nowIso()};
    upsertLocal("session_blocks",record);queueRecord("session_blocks",record.id);
  });
  return parsed.length;
};

function v35PreviousSession(session){
  if(!session)return null;
  const targetSquads=sessionSquads(session).map(squadKey);
  return appState.sessions.filter(s=>s.id!==session.id&&`${s.session_date}-${s.day_part}`<`${session.session_date}-${session.day_part}`&&sessionSquads(s).some(q=>targetSquads.includes(squadKey(q))))
    .sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0]||null;
}
function v35SuggestedProgression(session,week,review){
  const carry=v35Text(review?.carry_forward||review?.reinforce||session?.next_session_cue);
  const objective=v35Text(week?.objective||session?.week_objective);
  const season=v3SessionPlan(session).season;
  const seasonGoal=v35Text(season?.overarching_goal||session?.season_name);
  if(carry&&objective)return `${carry} Progress it through the weekly objective: ${objective}`;
  if(carry)return `${carry} Keep the same technical standard while increasing only one demand: speed, density or distance.`;
  if(objective)return `Continue the weekly objective — ${objective} — and progress one variable without losing today’s movement quality.`;
  if(seasonGoal)return `Keep the next session connected to ${seasonGoal}; retain today’s key cue and progress one demand.`;
  return "Retain today’s key technical cue and progress one variable only: speed, density or distance.";
}
function v35RenderPlanThread(){
  const host=$("deckPlanThread"),nextHost=$("deckNextSession"),session=selectedSession();if(!host||!session)return;
  const previous=v35PreviousSession(session),review=previous?sessionReview(previous.id):null,{season,week}=v3SessionPlan(session),next=nextPlannedSession(session);
  const previousText=v35Text(review?.carry_forward||review?.reinforce||review?.went_well||previous?.plan_cue)||"No completed-session note has been logged yet.";
  const weekText=v35Text(week?.objective||session.week_objective)||"Weekly objective not linked yet.";
  const seasonText=v35Text(season?.overarching_goal||session.season_name)||"Season plan not linked yet.";
  const nextText=next?`${next.title}${next.technical_focus?` — ${next.technical_focus}`:""}`:v35SuggestedProgression(session,week,sessionReview(session.id));
  host.innerHTML=`<div class="plan-chain">
    <div class="plan-chain-row"><span>From last session${previous?` · ${escapeHtml(sessionLabel(previous))}`:""}</span><strong>${escapeHtml(previousText)}</strong></div>
    <div class="plan-chain-row"><span>Today</span><strong>${escapeHtml([session.primary_system,session.technical_focus].filter(Boolean).join(" · ")||session.title)}</strong></div>
    <div class="plan-chain-row"><span>This week</span><strong>${escapeHtml(weekText)}</strong></div>
    <div class="plan-chain-row"><span>Season direction</span><strong>${escapeHtml(seasonText)}</strong></div>
    <div class="plan-chain-row"><span>${next?"Lead into next session":"Suggested next progression"}</span><strong>${escapeHtml(nextText)}</strong></div>
  </div>`;
  if(nextHost)nextHost.innerHTML=next?`<strong>${escapeHtml(sessionLabel(next))} — ${escapeHtml(next.title)}</strong><div>${escapeHtml(next.primary_system||"")}</div><div class="help">${escapeHtml(next.technical_focus||"")}</div>`:`<div class="help">The suggestion above is built from the weekly plan, season direction and today’s finish notes.</div>`;
}

function v35EnsureLaneAssignments(session,roster=selectedRoster()){
  if(!session||!roster.length)return;
  const count=v35Clamp(Number(session.lane_count||6),1,12);
  const sorted=roster.slice().sort(rosterSort);
  sorted.forEach((athlete,index)=>{
    let lane=Number(athlete.training_lane);
    if(!Number.isFinite(lane)||lane<1||lane>count)lane=(index%count)+1;
    const existing=appState.session_lane_assignments.find(x=>x.session_id===session.id&&x.athlete_id===athlete.id);
    if(existing&&Number(existing.lane_number)>=1&&Number(existing.lane_number)<=count)return;
    const record={id:existing?.id||uid("lane"),session_id:session.id,athlete_id:athlete.id,lane_number:lane,lane_order:athlete.timing_order||index+1,updated_at:nowIso()};
    upsertLocal("session_lane_assignments",record);queueRecord("session_lane_assignments",record.id);
  });
  saveState(appState);scheduleFastSync();
}
const v35OldAttendanceRecord=attendanceRecord;
attendanceRecord=function(session,athleteId,status){
  const result=v35OldAttendanceRecord(session,athleteId,status);
  if(status==="present"||status==="modified")v35EnsureLaneAssignments(session,selectedRoster());
  return result;
};
const v35OldRenderAttendance=renderAttendance;
renderAttendance=function(){
  const session=selectedSession();if(session)v35EnsureLaneAssignments(session,selectedRoster());
  v35OldRenderAttendance();
  document.querySelectorAll(".attendance-row[data-athlete-id]").forEach(row=>{
    const athlete=appState.athletes.find(a=>a.id===row.dataset.athleteId);if(!athlete)return;
    let badge=row.querySelector(".v35-lane-badge");if(!badge){badge=document.createElement("span");badge.className="v35-lane-badge";row.querySelector("strong")?.after(badge)}
    badge.textContent=`Lane ${v3LaneAssignment(session.id,athlete)}`;
  });
};

function v35ActiveBlockId(sessionId){return appState.settings.v35_active_block_by_session?.[sessionId]||""}
function v35SetActiveBlock(sessionId,blockId){appState.settings.v35_active_block_by_session=appState.settings.v35_active_block_by_session||{};appState.settings.v35_active_block_by_session[sessionId]=blockId;saveState(appState)}
function v35RunBlockFromFallback(block){
  if(block.id)return v32RunBlock(block.id);
  const items=v34Array(block.items);if(!items.length)return;
  v32LiveBlockState={source:"session",id:"",title:block.title||v32BlockLabel(block.block_type),items,index:0};showView("times");v32LoadLiveLine(items[0]);
}
function v35RenderDeckBlocks(){
  const host=$("deckBlockList"),session=selectedSession();if(!host||!session)return;
  let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v35ParseWorkoutBlocks(session.workout).map((b,i)=>({...b,id:"",sort_order:i+1}));
  const active=v35ActiveBlockId(session.id)||blocks[0]?.id||"fallback-0";
  host.innerHTML=blocks.length?blocks.map((block,index)=>{
    const key=block.id||`fallback-${index}`,open=key===active;
    return `<details class="v35-deck-block" data-v35-deck-block="${escapeHtml(key)}" ${open?"open":""}><summary><div><span>${escapeHtml(v32BlockLabel(block.block_type))}</span><strong>${escapeHtml(block.title||v32BlockLabel(block.block_type))}</strong></div><b>${v35BlockDistance(block).toLocaleString()}m</b></summary><div class="v35-deck-block-body"><pre>${escapeHtml(v32BlockItemsText(block.items)||block.raw_text||"No set lines entered.")}</pre>${block.notes?`<div class="help"><strong>Coach note:</strong> ${escapeHtml(block.notes)}</div>`:""}<div class="button-row"><button type="button" data-v35-run-block="${index}">Run this block</button><button type="button" class="secondary" data-v35-show-adaptations>Modified versions</button><button type="button" class="secondary" data-v35-edit-session>Edit session</button></div></div></details>`;
  }).join(""):'<div class="warning-box">No session blocks are available. Open Edit session and check the pasted session.</div>';
  host.querySelectorAll(".v35-deck-block").forEach(detail=>detail.ontoggle=()=>{if(!detail.open)return;host.querySelectorAll(".v35-deck-block").forEach(other=>{if(other!==detail)other.open=false});v35SetActiveBlock(session.id,detail.dataset.v35DeckBlock)});
  host.querySelectorAll("[data-v35-run-block]").forEach(button=>button.onclick=()=>v35RunBlockFromFallback(blocks[Number(button.dataset.v35RunBlock)]));
  host.querySelectorAll("[data-v35-show-adaptations]").forEach(button=>button.onclick=()=>$("adaptationPanel")?.scrollIntoView({behavior:"smooth",block:"start"}));
  host.querySelectorAll("[data-v35-edit-session]").forEach(button=>button.onclick=v33EditCurrentSession);
}

function v35AdaptSetLine(item,profile,athlete,block){
  const original=item.raw||[`${item.reps||1} x ${item.distance||""}`,item.cycle,item.stroke,item.instruction].filter(Boolean).join(" | ");
  const reps=Math.max(1,Math.round(Number(item.reps||1)*profile.ratio));
  let distance=Number(item.distance||0);
  const blockType=block.block_type;
  // Protect skill and race-quality distances; shorten long aerobic repetitions first.
  if(distance>=300&&["warm_up","main_set","pull","kick"].includes(blockType))distance=Math.max(50,Math.round((distance*profile.ratio)/25)*25);
  const seconds=v35CycleSeconds(item.cycle);
  const cycle=seconds?v35CycleText(seconds*profile.cycleMultiplier):"";
  const stroke=item.stroke||"Choice";
  const instruction=item.instruction||original.replace(/\b\d+\s*[x×]\s*\d+\b/i,"").trim();
  return `${reps} x ${distance||item.distance||"?"}${cycle?` on ${cycle}`:""} ${stroke}${instruction?` — ${instruction}`:""}`.replace(/\s+/g," ").trim();
}
function v35AthleteLearningNotes(athlete){
  const captureNotes=(appState.captures||[]).filter(c=>c.athlete_id===athlete.id&&c.text_content).sort(byUpdated).slice(0,3).map(c=>c.text_content);
  const reviewNotes=(appState.session_reviews||[]).slice().sort(byUpdated).map(r=>r.athlete_notes||r.modifications||"").filter(text=>v35NameKey(text).includes(v35NameKey(athlete.full_name).split(" ")[0])).slice(0,2);
  return [athlete.modifications,athlete.coach_notes,...captureNotes,...reviewNotes].map(v35Text).filter(Boolean).slice(0,5);
}
function v35GenerateAdaptation(athlete,session=selectedSession()){
  const profile=v35ProfileForAthlete(athlete);if(!profile||!session)return "";
  const blocks=v32SessionBlocks(session.id).length?v32SessionBlocks(session.id):v35ParseWorkoutBlocks(session.workout||"");
  const lines=[`${athlete.full_name} — ${profile.label}`,`Same session purpose: ${session.primary_system||session.title}${session.technical_focus?` · ${session.technical_focus}`:""}`];
  for(const block of blocks){
    lines.push("",String(block.title||v32BlockLabel(block.block_type)).toUpperCase());
    for(const item of v34Array(block.items))lines.push(v35AdaptSetLine(item,profile,athlete,block));
  }
  const learning=v35AthleteLearningNotes(athlete);
  if(learning.length)lines.push("","COACH MEMORY TO CHECK",...learning.map(note=>`- ${note}`));
  lines.push("","Rule: volume is reduced, but the main theme, quality cues and race-skill intent stay connected to the squad session.");
  return lines.join("\n");
}
function v35AdaptationAthletes(){return appState.athletes.filter(a=>a.active&&v35ProfileForAthlete(a)).sort((a,b)=>a.full_name.localeCompare(b.full_name))}
function v35SavedAdaptation(athleteId,sessionId){return (appState.captures||[]).filter(c=>c.session_id===sessionId&&c.athlete_id===athleteId&&String(c.text_content||"").startsWith("[Adapted session v3.5]")).sort(byUpdated)[0]||null}
function v35RenderAdaptationPanel(){
  const panel=$("adaptationPanel"),tabs=$("adaptationAthleteTabs"),text=$("adaptationText"),session=selectedSession();if(!panel||!tabs||!text||!session)return;
  const athletes=v35AdaptationAthletes();if(!athletes.length){tabs.innerHTML='<div class="help">No active modified-session profiles are matched to the roll.</div>';text.value="";return}
  if(!athletes.some(a=>a.id===v35AdaptationAthleteId))v35AdaptationAthleteId=athletes[0].id;
  tabs.innerHTML=athletes.map(a=>`<button type="button" data-v35-adapt-athlete="${escapeHtml(a.id)}" class="${a.id===v35AdaptationAthleteId?"active":""}">${escapeHtml(a.full_name.split(" ")[0])} · ${escapeHtml(v35ProfileForAthlete(a).label)}</button>`).join("");
  tabs.querySelectorAll("[data-v35-adapt-athlete]").forEach(button=>button.onclick=()=>{v35AdaptationAthleteId=button.dataset.v35AdaptAthlete;v35RenderAdaptationPanel()});
  const athlete=athletes.find(a=>a.id===v35AdaptationAthleteId),saved=v35SavedAdaptation(athlete.id,session.id);
  text.value=saved?String(saved.text_content).replace(/^\[Adapted session v3\.5\]\s*/,""):v35GenerateAdaptation(athlete,session);
  const status=$("adaptationStatus");if(status)status.textContent=saved?`Saved ${new Date(saved.updated_at||saved.created_at).toLocaleString("en-NZ")}`:"Generated from the main session and current coaching notes — review before use.";
}
async function v35SaveAdaptation(){
  const session=selectedSession(),athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId),text=$("adaptationText")?.value.trim();if(!session||!athlete||!text)return;
  const existing=v35SavedAdaptation(athlete.id,session.id),record={id:existing?.id||uid("capture"),session_id:session.id,athlete_id:athlete.id,capture_type:"text",text_content:`[Adapted session v3.5] ${text}`,session_block_id:null,media_path:null,mime_type:"text/plain",created_at:existing?.created_at||nowIso(),updated_at:nowIso()};
  upsertLocal("captures",record);queueRecord("captures",record.id);saveState(appState);await syncIfPossible();v35RenderAdaptationPanel();updateStatus(`${athlete.full_name} modified session saved`,`good`);
}
async function v35ApproveLearning(){
  const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId),text=$("adaptationLearningRule")?.value.trim();if(!athlete||!text)return;
  athlete.modifications=v34AppendText(athlete.modifications,`Approved adaptation rule: ${text}`);athlete.updated_at=nowIso();queueRecord("athletes",athlete.id);saveState(appState);await syncIfPossible();$("adaptationLearningRule").value="";v35RenderAdaptationPanel();updateStatus(`Approved rule saved for ${athlete.full_name}`,"good");
}

function v35FinishFieldForPurpose(purpose){return purpose.startsWith("finish_question:")?purpose.split(":")[1]:""}
function v35ApplyFinishTranscript(tr){
  if(!tr)return;const data=tr.structured_data||{},field=v35FinishFieldForPurpose(tr.purpose||"");
  if(field&&$(field)){$(field).value=v34AppendText($(field).value,tr.raw_text);return}
  const f=data.finish_session||{};
  const mapping={reviewWentWell:f.went_well,reviewReinforce:f.reinforce,reviewAthletes:f.athlete_notes,reviewCarry:f.carry_forward,finishAthleteResponse:f.athlete_response,finishModifications:f.modifications,finishRaceEvidence:f.race_split_evidence};
  for(const [id,value] of Object.entries(mapping))if($(id)&&v35Text(value))$(id).value=v34AppendText($(id).value,value);
  if(!Object.values(mapping).some(v35Text)&&tr.raw_text)$("reviewWentWell").value=v34AppendText($("reviewWentWell").value,tr.raw_text);
}
function v35FinishPrompt(target){
  const prompts={reviewWentWell:"What went well?",reviewReinforce:"What needs reinforcing?",reviewAthletes:"Which swimmers need a note?",reviewCarry:"What carries into the next session?",session_debrief:"Talk through what changed, what worked, athlete response, what needs reinforcing and what should carry into the next session."};
  return prompts[target]||prompts.session_debrief;
}
async function v35StartFinishVoice(target="session_debrief"){
  try{
    v35FinishTarget=target;const stream=await navigator.mediaDevices.getUserMedia({audio:true});v35FinishChunks=[];v35FinishRecorder=new MediaRecorder(stream);v35FinishRecorder.ondataavailable=e=>{if(e.data.size)v35FinishChunks.push(e.data)};
    v35FinishRecorder.onstop=async()=>{
      const blob=new Blob(v35FinishChunks,{type:v35FinishRecorder.mimeType||"audio/webm"});stream.getTracks().forEach(track=>track.stop());
      const localId=await saveMediaBlob(blob,"voice","finish-session.webm"),session=selectedSession();
      const record={id:uid("capture"),session_id:session.id,athlete_id:null,capture_type:"voice",text_content:`Finish Session voice · ${v35FinishPrompt(v35FinishTarget)}`,session_block_id:null,media_path:null,media_local_id:localId,mime_type:blob.type,created_at:nowIso(),updated_at:nowIso()};
      upsertLocal("captures",record);queueRecord("captures",record.id);saveState(appState);await syncIfPossible();
      const tr={id:uid("transcript"),session_id:session.id,capture_id:record.id,athlete_id:null,session_block_id:null,source_type:"voice",purpose:v35FinishTarget==="session_debrief"?"session_debrief":`finish_question:${v35FinishTarget}`,status:"audio_saved",raw_text:"",structured_blocks:[],structured_data:{},error_message:"",created_at:nowIso(),updated_at:nowIso()};
      upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);
      const status=$("finishVoiceStatus");if(status)status.textContent="Transcribing…";
      try{await v34TranscribeCapture(tr,record);v35ApplyFinishTranscript(tr);if(status)status.textContent="Transcript added to the Finish Session fields. Check it before saving.";}
      catch(error){if(status)status.textContent=`Voice saved. Transcription error: ${error.message}`;}
      $("finishVoiceStopBtn").disabled=true;$("finishVoiceDebriefBtn").disabled=false;document.querySelectorAll("[data-finish-voice-field]").forEach(b=>b.disabled=false);
    };
    v35FinishRecorder.start();
    $("finishVoiceStopBtn").disabled=false;$("finishVoiceDebriefBtn").disabled=true;document.querySelectorAll("[data-finish-voice-field]").forEach(b=>b.disabled=true);
    const status=$("finishVoiceStatus");if(status)status.textContent=`Recording: ${v35FinishPrompt(target)}`;
  }catch(error){const status=$("finishVoiceStatus");if(status)status.textContent="Microphone permission or HTTPS is required.";}
}
function v35StopFinishVoice(){if(v35FinishRecorder&&v35FinishRecorder.state!=="inactive")v35FinishRecorder.stop()}

function v35NativeChatGpt(){
  const fallback=encodeURIComponent("https://chatgpt.com/");
  if(/Android/i.test(navigator.userAgent))location.href=`intent://chatgpt.com/#Intent;scheme=https;package=com.openai.chatgpt;S.browser_fallback_url=${fallback};end`;
  else window.open("https://chatgpt.com/","_blank","noopener");
}
function v35RebindChatGptButton(){
  const old=$("openChatGptBtn");if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",v35NativeChatGpt);
}
async function v35PasteSessionClipboard(){
  try{
    const text=await navigator.clipboard.readText();if(!text)throw new Error("The clipboard is empty.");$("sessionPasteInput").value=text;importedSessionDraft=parseSessionFromChat(text);renderSessionImportPreview();$("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;v33SetImportMessage(`Clipboard loaded · ${v35DraftBlocks.length} blocks found. Check the preview, then Save & Use Now.`,"good");
  }catch(error){v33SetImportMessage(`${error.message||"Clipboard access was blocked."} Press and hold in the session box and choose Paste.`,"warning");$("sessionPasteInput")?.focus()}
}
function v35RebindPasteButton(){const old=$("pasteSessionBtn");if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",v35PasteSessionClipboard)}

function v35DeactivateDepartedSwimmers(){
  const sophie=appState.athletes.find(a=>v35NameKey(a.full_name)==="sophie newlove");
  if(sophie&&sophie.active!==false){sophie.active=false;sophie.updated_at=nowIso();queueRecord("athletes",sophie.id);saveState(appState);scheduleFastSync()}
}

function v35InjectInterface(){
  document.title="McLay Swimming OS — v3.5 Stabilisation";
  const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.5 · plan → coach → capture → review → progress";
  const workoutCard=document.querySelector(".deck-workout-card");if(workoutCard){workoutCard.innerHTML=`<details class="v35-original-session"><summary><strong>Original session / edit source</strong><span>Hidden during normal coaching</span></summary><pre id="deckWorkout">No session loaded.</pre><div class="button-row"><button type="button" class="secondary" data-v35-edit-session>Edit / replace session</button></div></details>`}
  document.querySelector(".deck-sets-card")?.classList.add("v35-hidden-repeated-sets");
  const blocksCard=document.querySelector(".deck-blocks-card");if(blocksCard){blocksCard.querySelector("h3").textContent="One coaching block at a time";blocksCard.querySelector(".eyebrow").textContent="Compact Deck"}
  if(blocksCard&&!$("adaptationPanel"))blocksCard.insertAdjacentHTML("afterend",`<article id="adaptationPanel" class="card v35-adaptation-panel"><div class="card-heading"><div><div class="eyebrow">Modified sessions</div><h3>Main session → athlete version</h3></div><span id="adaptationStatus" class="help"></span></div><div id="adaptationAthleteTabs" class="quick-swimmer-buttons"></div><textarea id="adaptationText" class="large-textarea" aria-label="Editable modified session"></textarea><div class="button-row"><button id="regenerateAdaptationBtn" type="button" class="secondary">Regenerate from main session</button><button id="saveAdaptationBtn" type="button">Save athlete version</button></div><details><summary><strong>Teach the app an approved rule</strong><span>Only saved when you approve it</span></summary><textarea id="adaptationLearningRule" placeholder="e.g. Fast 75s need 1:55–2:00, not the squad cycle."></textarea><button id="approveAdaptationLearningBtn" type="button" class="secondary">Save approved rule</button></details></article>`);
  const reviewGrid=document.querySelector("#finish .review-grid");
  if(reviewGrid&&!$("finishVoicePanel")){
    reviewGrid.querySelectorAll("div").forEach(div=>{const textarea=div.querySelector("textarea");if(textarea){const button=document.createElement("button");button.type="button";button.className="secondary v35-question-mic";button.dataset.finishVoiceField=textarea.id;button.textContent="🎙 Answer by voice";div.querySelector("label")?.after(button)}});
    reviewGrid.insertAdjacentHTML("beforebegin",`<section id="finishVoicePanel" class="v35-finish-voice"><div class="card-heading"><div><div class="eyebrow">Voice debrief</div><h3>Answer the questions while it is fresh</h3></div></div><p class="help">The full debrief prompt covers what changed, what worked, athlete response, reinforcement and the link into the next session.</p><div class="button-row"><button id="finishVoiceDebriefBtn" type="button">🎙 Record full session debrief</button><button id="finishVoiceStopBtn" type="button" class="danger-button" disabled>■ Stop &amp; transcribe</button></div><div id="finishVoiceStatus" class="session-import-result">Ready.</div></section>`);
  }
  document.querySelectorAll("[data-v35-edit-session]").forEach(button=>button.onclick=v33EditCurrentSession);
  $("regenerateAdaptationBtn")?.addEventListener("click",()=>{const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId);if(athlete)$("adaptationText").value=v35GenerateAdaptation(athlete)});
  $("saveAdaptationBtn")?.addEventListener("click",v35SaveAdaptation);
  $("approveAdaptationLearningBtn")?.addEventListener("click",v35ApproveLearning);
  $("finishVoiceDebriefBtn")?.addEventListener("click",()=>v35StartFinishVoice("session_debrief"));
  $("finishVoiceStopBtn")?.addEventListener("click",v35StopFinishVoice);
  document.querySelectorAll("[data-finish-voice-field]").forEach(button=>button.addEventListener("click",()=>v35StartFinishVoice(button.dataset.finishVoiceField)));
  v35RebindChatGptButton();v35RebindPasteButton();
}

const v35OldRenderDeck=renderDeck;
renderDeck=function(){v35OldRenderDeck();v35RenderDeckBlocks();v35RenderPlanThread();v35RenderAdaptationPanel()};
const v35OldRenderReview=renderReview;
renderReview=function(){v35OldRenderReview();const status=$("finishVoiceStatus");if(status&&!status.textContent)status.textContent="Ready."};
const v35OldRenderAll=renderAll;
renderAll=function(){v35OldRenderAll();v35RenderDeckBlocks();v35RenderPlanThread();v35RenderAdaptationPanel()};

v35InjectInterface();
v35DeactivateDepartedSwimmers();
if(selectedSession())v35EnsureLaneAssignments(selectedSession(),selectedRoster());
renderAll();

// v3.5 parser refinements found during the automated session-flow test.
function v35ParseSetLine(line,index=0){
  const raw=String(line||"").trim();if(!raw)return null;
  const parts=raw.split("|").map(x=>x.trim()),core=parts[0]||raw;
  let m=core.match(/(\d+)\s*[x×]\s*(\d+)\s*m?/i),reps=1,distance=null;
  if(m){reps=Number(m[1]);distance=Number(m[2])}
  else{
    const single=core.match(/^\s*(\d{2,4})\s*m?\b/i);
    if(single)distance=Number(single[1]);
  }
  const cycleRaw=(parts[1]||core.match(/(?:on|@|cycle|off|every)\s*(\d{0,2}:?\d{1,2}(?:\.\d+)?)/i)?.[1]||"").trim();
  let stroke=(parts[2]||"").trim();
  if(!stroke){const sm=core.match(/\b(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|IM|medley|kick|pull|choice)\b/i);stroke=sm?v3Stroke(sm[1]):""}
  let instruction=parts.slice(3).join(" | ").trim();
  if(!instruction){
    instruction=core;
    if(m)instruction=instruction.replace(m[0],"");
    else if(distance)instruction=instruction.replace(/^\s*\d{2,4}\s*m?\b/i,"");
    instruction=instruction.replace(/(?:on|@|cycle|off|every)\s*\d{0,2}:?\d{1,2}(?:\.\d+)?/i,"").trim();
  }
  return {id:uid("block-line"),sort_order:index+1,raw,label:core,reps,distance,cycle:parseClockValue(cycleRaw),stroke:stroke||"Choice",instruction};
}
v32ParseSetLine=v35ParseSetLine;

const v35PriorInferBlockType=v35InferBlockType;
v35InferBlockType=function(text,index,total){
  const t=String(text||"").toLowerCase();
  if(/\bfins?\b|\bpads?\b|short burst|sharpen|neural|anc|cp/.test(t)&&index>0)return "pre_set";
  return v35PriorInferBlockType(text,index,total);
};

v35AdaptSetLine=function(item,profile,athlete,block){
  const original=item.raw||[`${item.reps||1} x ${item.distance||""}`,item.cycle,item.stroke,item.instruction].filter(Boolean).join(" | ");
  const originalReps=Math.max(1,Number(item.reps||1)),originalDistance=Number(item.distance||0);
  if(!originalDistance)return original;
  const targetVolume=originalReps*originalDistance*profile.ratio;
  let reps,distance=originalDistance;
  const quality=["skill","pre_set","post_set"].includes(block.block_type)||/race pace|fast|sprint|quality|underwater|turn|start/i.test(original);
  if(originalReps<=2&&!quality&&originalDistance>=100){
    reps=originalReps;
    distance=Math.max(25,Math.round((targetVolume/reps)/25)*25);
  }else{
    reps=Math.max(1,Math.round(originalReps*profile.ratio));
    if(reps*distance<targetVolume*.8&&originalDistance>=100&&!quality)distance=Math.max(25,Math.round((targetVolume/reps)/25)*25);
  }
  const seconds=v35CycleSeconds(item.cycle),cycle=seconds?v35CycleText(seconds*profile.cycleMultiplier):"",stroke=item.stroke||"Choice",instruction=item.instruction||"";
  return `${reps} x ${distance}${cycle?` on ${cycle}`:""} ${stroke}${instruction?` — ${instruction}`:""}`.replace(/\s+/g," ").trim();
};

// Rebuild any fallback view with the corrected single-distance parser.
renderAll();

v35CycleText=function(seconds){
  const total=Math.max(0,Math.round(Number(seconds)||0));
  return `${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`;
};
const v35PriorParseSetLine=v35ParseSetLine;
v35ParseSetLine=function(line,index=0){
  const item=v35PriorParseSetLine(line,index);if(!item)return item;
  const strokeWord={Freestyle:/^(free|freestyle)\b/i,Backstroke:/^(back|backstroke|bk)\b/i,Breaststroke:/^(breast|breaststroke|br)\b/i,Butterfly:/^(fly|butterfly)\b/i,IM:/^(im|medley)\b/i,Kick:/^kick\b/i,Pull:/^pull\b/i,Choice:/^choice\b/i}[item.stroke];
  if(strokeWord)item.instruction=String(item.instruction||"").replace(strokeWord,"").replace(/^\s*[-–—|:]\s*/,"").trim();
  return item;
};
v32ParseSetLine=v35ParseSetLine;
renderAll();

const v35PreviousAdaptSetLine=v35AdaptSetLine;
v35AdaptSetLine=function(item,profile,athlete,block){
  const clean={...item};
  if(v35NameKey(clean.instruction)===v35NameKey(clean.stroke))clean.instruction="";
  return v35PreviousAdaptSetLine(clean,profile,athlete,block);
};
renderAll();

// =============================================================================
// McLay Swimming OS v3.6 — corrected release.
// Fixes the v3.5 draft gaps: exact sync diagnostics, pathway/record pulls,
// cloud-only Team Manager import on phone, evidence-linked planning, active-roll
// filtering, and structured/AI-assisted athlete adaptation learning.
// =============================================================================
const V36_VERSION="3.6";
const V36_BUILD="20260726-corrected";

for(const key of ["athlete_adaptation_rules","session_adaptations"]){
  if(!Array.isArray(appState[key]))appState[key]=[];
  if(!CLOUD_TABLES.includes(key))CLOUD_TABLES.push(key);
  if(typeof V331_OPTIONAL_CLOUD_TABLES!=="undefined")V331_OPTIONAL_CLOUD_TABLES.add(key);
}
if(!appState.settings.v36_sync)appState.settings.v36_sync={last_success:"",last_error:"",last_error_table:"",last_attempt:""};
saveState(appState);

function v36IsArchivedAthlete(athlete){
  return !athlete||athlete.active===false||v35NameKey(athlete.full_name)==="sophie newlove";
}
function v36ActiveAthletes(){return appState.athletes.filter(a=>!v36IsArchivedAthlete(a))}
function v36WithActiveAthletes(fn){
  const all=appState.athletes;appState.athletes=all.filter(a=>!v36IsArchivedAthlete(a));
  try{return fn()}finally{appState.athletes=all}
}

// Keep departed swimmers out of every active coaching selector while retaining
// their historical Supabase results.
const v36BaseRenderAthletes=renderAthletes;
renderAthletes=function(){return v36WithActiveAthletes(v36BaseRenderAthletes)};
const v36BaseRenderResults=renderResults;
renderResults=function(){return v36WithActiveAthletes(v36BaseRenderResults)};
const v36BasePopulateResultAthletes=v3PopulateResultAthletes;
v3PopulateResultAthletes=function(){return v36WithActiveAthletes(v36BasePopulateResultAthletes)};

// Proper cloud rows for the new structured adaptation data.
const v36BaseCloudRow=cloudRow;
cloudRow=function(table,record){
  const org=appState.settings.organisation_id,user=getAuth()?.user?.id,base={...record,organisation_id:org,created_by:user};
  if(table==="athlete_adaptation_rules")return {
    id:base.id,organisation_id:org,athlete_id:base.athlete_id,scope:base.scope||"general",
    rule_text:base.rule_text,rule_json:base.rule_json||{},source_type:base.source_type||"coach_approved",
    active:base.active!==false,created_at:base.created_at||nowIso(),updated_at:base.updated_at||nowIso(),created_by:user
  };
  if(table==="session_adaptations")return {
    id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,
    adapted_text:base.adapted_text,generation_method:base.generation_method||"rules",
    rule_snapshot:base.rule_snapshot||[],evidence_snapshot:base.evidence_snapshot||{},
    coach_approved:base.coach_approved!==false,created_at:base.created_at||nowIso(),updated_at:base.updated_at||nowIso(),created_by:user
  };
  return v36BaseCloudRow(table,record);
};

// -----------------------------------------------------------------------------
// Exact sync diagnostics and the missing pathway/record reference pull.
// -----------------------------------------------------------------------------
let v36SyncError=null;
function v36PendingSummary(){
  const grouped={};for(const item of appState.pending||[])grouped[item.table]=(grouped[item.table]||0)+1;
  return grouped;
}
function v36RenderSyncDetails(){
  const host=$("v36SyncDetails");if(!host)return;
  const grouped=v36PendingSummary(),pending=Object.values(grouped).reduce((a,b)=>a+b,0),state=appState.settings.v36_sync||{};
  const rows=Object.entries(grouped).sort((a,b)=>a[0].localeCompare(b[0])).map(([table,count])=>`<div><strong>${escapeHtml(table)}</strong><span>${count} pending</span></div>`).join("");
  host.innerHTML=`<div class="v36-sync-grid">
    <div><span>Connection</span><strong>${cloudReady()?"Supabase connected":"Local only"}</strong></div>
    <div><span>Pending</span><strong>${pending}</strong></div>
    <div><span>Last success</span><strong>${state.last_success?new Date(state.last_success).toLocaleString("en-NZ"):"Not yet"}</strong></div>
    <div><span>Last error</span><strong>${escapeHtml(state.last_error||"None")}</strong></div>
  </div>${rows?`<div class="v36-pending-list">${rows}</div>`:""}`;
  const badge=$("syncBadge");if(badge)badge.title=state.last_error?`Sync error: ${state.last_error}`:pending?`${pending} changes are waiting to upload.`:"Cloud and device are aligned.";
}
function v36SetSyncState({success=false,error=null,table=""}={}){
  const state=appState.settings.v36_sync||(appState.settings.v36_sync={});state.last_attempt=nowIso();
  if(success){state.last_success=nowIso();state.last_error="";state.last_error_table=""}
  if(error){state.last_error=String(error.message||error);state.last_error_table=table||""}
  saveState(appState);v36RenderSyncDetails();
}

pushPending=async function(){
  if(!cloudReady())return;
  const priority={athletes:1,athlete_adaptation_rules:2,season_plans:3,weekly_plans:4,sessions:5,session_lane_assignments:6,session_blocks:7,session_adaptations:8,test_sets:9,attendance:10,captures:11,timed_sets:12,test_set_attempts:13,coach_result_imports:14,coach_results:15,coach_result_aliases:16,session_reviews:17,session_transcriptions:18};
  const pending=[...(appState.pending||[])].sort((a,b)=>(priority[a.table]||99)-(priority[b.table]||99));
  for(const item of pending){
    if(typeof V331_OPTIONAL_CLOUD_TABLES!=="undefined"&&V331_OPTIONAL_CLOUD_TABLES.has(item.table)&&v331UnavailableTables().has(item.table))continue;
    try{
      if(item.action==="delete"){
        await cloudFetch(`/rest/v1/${item.table}?id=eq.${encodeURIComponent(item.id)}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
        appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);continue;
      }
      const record=appState[item.table]?.find(r=>r.id===item.id);
      if(!record){appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);continue}
      if(item.table==="captures")await uploadCaptureMedia(record);
      await cloudFetch(`/rest/v1/${item.table}?on_conflict=id`,{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(cloudRow(item.table,record))});
      appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));saveState(appState);
    }catch(error){
      const missing=typeof v331MissingRelationTable==="function"?v331MissingRelationTable(error):"";
      if(missing===item.table&&typeof v331MarkTableUnavailable==="function"&&v331MarkTableUnavailable(item.table,error))continue;
      error.syncTable=item.table;error.syncId=item.id;error.syncAction=item.action||"upsert";throw error;
    }
  }
};

pullCloud=async function(){
  if(!cloudReady())return;
  const org=appState.settings.organisation_id;
  for(const table of CLOUD_TABLES){
    if(typeof V331_OPTIONAL_CLOUD_TABLES!=="undefined"&&V331_OPTIONAL_CLOUD_TABLES.has(table)&&v331UnavailableTables().has(table))continue;
    try{
      const rows=await cloudFetch(`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);
      appState[table]=mergeCollection(appState[table]||[],rows);
    }catch(error){
      const missing=typeof v331MissingRelationTable==="function"?v331MissingRelationTable(error):"";
      if(missing===table&&typeof v331MarkTableUnavailable==="function"&&v331MarkTableUnavailable(table,error))continue;
      error.syncTable=table;throw error;
    }
  }
  for(const view of RESULT_VIEWS){
    try{const rows=await cloudFetch(`/rest/v1/${view}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);appState[view]=rows.map(stripCloudFields)}
    catch(error){console.warn(`Optional result source ${view} not available`,error);if(!Array.isArray(appState[view]))appState[view]=[]}
  }
  // v3.5 accidentally stopped pulling these public tables. That caused the
  // phone to show Standards/Records as "Not loaded" even when the SQL existed.
  for(const table of ["pathway_standards","pathway_meets",...REFERENCE_TABLES]){
    try{
      const query=table==="pathway_standards"?"?select=*&active=eq.true&order=progression_order.asc":table==="pathway_meets"?"?select=*&order=progression_order.asc":"?select=*";
      appState[table]=await cloudFetch(`/rest/v1/${table}${query}`);
    }catch(error){console.warn(`Reference source ${table} unavailable`,error);if(!Array.isArray(appState[table]))appState[table]=[]}
  }
  v33FilterDeletedSessions();
  if(!appState.sessions.some(s=>s.id===appState.settings.selected_session_id)){
    const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];
    appState.settings.selected_session_id=next?.id||"";appState.settings.selected_squad=sessionSquads(next)[0]||"";resetLiveRoster();
  }
  saveState(appState);
};

syncNow=async function(){
  if(!getAuth()?.access_token)throw new Error("Sign in first.");
  if(!appState.settings.organisation_id)await ensureOrganisation();
  if(typeof v331ClearOptionalTableWarnings==="function")v331ClearOptionalTableWarnings();
  updateStatus("Syncing…");v36SyncError=null;v36SetSyncState();
  try{
    await pushPending();await pullCloud();v36SetSyncState({success:true});
    const left=(appState.pending||[]).length;updateStatus(left?`${left} pending · check Sync details`:"Cloud synced",left?"normal":"good");renderAll();
  }catch(error){
    v36SyncError=error;v36SetSyncState({error,table:error.syncTable||""});
    const prefix=error.syncTable?`${error.syncTable}: `:"";updateStatus(`${(appState.pending||[]).length} pending · sync error`,"error");renderAll();
    throw new Error(`${prefix}${error.message||error}`);
  }
};

syncIfPossible=async function(){
  if(!cloudReady()){renderMode();updateStatus("Local only","normal");v36RenderSyncDetails();return}
  try{
    await pushPending();await pullCloud();v36SetSyncState({success:true});
    const left=(appState.pending||[]).length;updateStatus(left?`${left} pending`:"Cloud synced",left?"normal":"good");
  }catch(error){
    console.error(error);v36SyncError=error;v36SetSyncState({error,table:error.syncTable||""});
    updateStatus(`${(appState.pending||[]).length} pending · sync error`,"error");
  }
  v36RenderSyncDetails();
};

// -----------------------------------------------------------------------------
// Session parsing: blank-line blocks, explicit headings and correct AM/PM.
// -----------------------------------------------------------------------------
function v36DetectDayPart(text){
  const labelled=String(text||"").match(/(?:^|\n)\s*(?:am\s*\/\s*pm|day\s*part|session\s*time|time)\s*[:\-–—]\s*(AM|PM)\b/i)?.[1];
  if(labelled)return labelled.toUpperCase();
  const titleLine=String(text||"").split(/\n/).slice(0,6).join(" ");
  if(/\b(morning|AM)\b/i.test(titleLine))return "AM";
  if(/\b(afternoon|evening|PM)\b/i.test(titleLine))return "PM";
  return new Date().getHours()<12?"AM":"PM";
}
function v36CleanPurpose(value){
  const text=v35Text(value);if(!text)return "";
  if(/^\d{1,2}(?::|\.)\d{2}\s*(?:am|pm)?$/i.test(text)||/^\d{1,2}\s*(?:am|pm)$/i.test(text))return "";
  return text.replace(/^\d{1,2}(?::|\.)\d{2}\s*(?:am|pm)?\s*[·|\-–—]*\s*/i,"").trim();
}
function v36ParseWorkoutBlocks(text){
  const lines=String(text||"").replace(/\r/g,"").split("\n"),blocks=[];let current=null;
  const push=()=>{if(!current)return;current.raw_text=current.lines.join("\n").trim();if(current.raw_text||current.hard_break){current.items=v32BlockItemsFromText(current.raw_text);current.block_type=current.block_type||v35InferBlockType(current.raw_text,blocks.length,99);current.title=current.title||v35TitleFromParagraph(current.lines,current.block_type);blocks.push(current)}current=null};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){push();continue}
    if(/^(date|time|venue|pool|location|squads?|group|title|session title|focus|technical|system|energy system|total|planned distance|purpose)\s*[:\-–—]/i.test(line)&&!current)continue;
    const heading=v35HeadingType(line);
    if(heading){push();current={block_type:heading,title:line.replace(/[:\-–—]+$/g,"").trim(),lines:[],hard_break:true};continue}
    if(!current)current={block_type:"",title:"",lines:[],hard_break:false};current.lines.push(line);
  }
  push();
  const useful=blocks.filter(b=>b.hard_break||b.lines.some(v35HasSetLine)||b.lines.length>1);
  const merged=[];
  useful.forEach((block,index)=>{
    if(!block.hard_break&&!v35HasSetLine(block.raw_text)&&merged.length){
      const prior=merged[merged.length-1];prior.raw_text=[prior.raw_text,block.raw_text].filter(Boolean).join("\n");prior.items=v32BlockItemsFromText(prior.raw_text);
    }else{
      if(!block.block_type)block.block_type=v35InferBlockType(block.raw_text,index,useful.length);
      if(!block.title)block.title=v35TitleFromParagraph(block.lines,block.block_type);
      merged.push(block);
    }
  });
  if(!merged.length&&v35Text(text))return [{block_type:"main_set",title:"Main set",raw_text:v35Text(text),items:v32BlockItemsFromText(text),hard_break:false}];
  return merged;
}
v35ParseWorkoutBlocks=v36ParseWorkoutBlocks;v32ParseWorkoutBlocks=v36ParseWorkoutBlocks;

const v36BaseParseSessionFromChat=parseSessionFromChat;
parseSessionFromChat=function(raw){
  const d=v36BaseParseSessionFromChat(raw),text=String(raw||"");d.day_part=v36DetectDayPart(text);
  d.primary_system=v36CleanPurpose(d.primary_system);d.technical_focus=v36CleanPurpose(d.technical_focus);
  if(!d.primary_system)d.primary_system=inferSystem(text);
  d.sets=extractStructuredSets(text);d.updated_at=nowIso();return d;
};

// -----------------------------------------------------------------------------
// Plan thread: completed-session evidence → today → week → season → next.
// Empty setup warnings are kept out of the poolside view.
// -----------------------------------------------------------------------------
function v36PreviousCompletedSession(session){
  if(!session)return null;const target=sessionSquads(session).map(squadKey);
  const candidates=appState.sessions.filter(s=>s.id!==session.id&&`${s.session_date}-${s.day_part}`<`${session.session_date}-${session.day_part}`&&sessionSquads(s).some(q=>target.includes(squadKey(q))));
  return candidates.sort((a,b)=>{const ca=a.status==="completed"?1:0,cb=b.status==="completed"?1:0;return cb-ca||`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`)})[0]||null;
}
function v36EvidenceForSession(session){
  if(!session)return [];
  const review=sessionReview(session.id),rows=[];
  const add=(label,value)=>{const text=v35Text(value);if(text&&!rows.some(r=>r.text===text))rows.push({label,text})};
  add("Carry forward",review?.carry_forward);add("Needs reinforcing",review?.reinforce);add("What worked",review?.went_well);
  add("Athlete response",review?.athlete_response);add("Athlete notes",review?.athlete_notes);add("Modifications",review?.modifications);add("Race evidence",review?.race_split_evidence);
  (appState.captures||[]).filter(c=>c.session_id===session.id&&c.text_content&&!/^\[Adapted session/i.test(c.text_content)).sort(byUpdated).slice(0,5).forEach(c=>add(c.athlete_id?appState.athletes.find(a=>a.id===c.athlete_id)?.full_name||"Athlete note":"Poolside capture",c.text_content));
  const timed=(appState.timed_sets||[]).filter(t=>t.session_id===session.id).sort(byUpdated).slice(0,4);
  timed.forEach(t=>{const athlete=appState.athletes.find(a=>a.id===t.athlete_id);add("Timed evidence",`${athlete?.full_name||"Swimmer"}: ${t.set_label||`${t.distance} ${t.stroke}`} · best ${formatSeconds(t.best)} · avg ${formatSeconds(t.average)}`)});
  return rows.slice(0,9);
}
function v36SeasonDirection(session,season){
  const meet=Array.isArray(season?.meet_plan)?season.meet_plan.find(m=>m&&String(m.date||"")>=String(session.session_date||"")):null;
  return [season?.phase,season?.overarching_goal,meet?.name?`Toward ${meet.name}${meet.date?` · ${meet.date}`:""}`:"",session.season_name].map(v35Text).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(" · ");
}
function v36SuggestedProgression(session,week,currentReview,previousEvidence){
  const carry=v35Text(currentReview?.carry_forward||currentReview?.reinforce||session.next_session_cue||previousEvidence.find(r=>r.label==="Needs reinforcing")?.text);
  const objective=v35Text(week?.objective||session.week_objective),phase=v35Text(week?.phase||session.week_phase);
  const cue=v36CleanPurpose(session.technical_focus)||session.title;
  if(carry&&objective)return `${carry} Then progress ${objective} without losing ${cue}.`;
  if(carry)return `${carry} Progress one demand only — speed, density or distance — while keeping ${cue}.`;
  if(objective)return `${objective}${phase?` (${phase})`:""}: retain ${cue} and progress one variable only.`;
  return `Retain ${cue} and progress one variable only: speed, density or distance.`;
}
v35RenderPlanThread=function(){
  const host=$("deckPlanThread"),nextHost=$("deckNextSession"),session=selectedSession();if(!host||!session)return;
  const previous=v36PreviousCompletedSession(session),evidence=v36EvidenceForSession(previous),{season,week}=v3SessionPlan(session),next=nextPlannedSession(session),rows=[];
  if(previous&&evidence.length)rows.push({label:`From last session · ${sessionLabel(previous)}`,html:evidence.map(e=>`<div class="v36-evidence-line"><b>${escapeHtml(e.label)}</b><span>${escapeHtml(e.text)}</span></div>`).join("")});
  const today=[v36CleanPurpose(session.primary_system),v36CleanPurpose(session.technical_focus)].filter(Boolean).join(" · ")||session.title;rows.push({label:"Today’s purpose",text:today});
  const weekText=[week?.phase||session.week_phase,week?.objective||session.week_objective,week?.carry_forward||session.week_carry_forward].map(v35Text).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(" · ");
  if(weekText)rows.push({label:"Where this fits this week",text:weekText});
  const seasonText=v36SeasonDirection(session,season);if(seasonText)rows.push({label:"Season direction",text:seasonText});
  const nextText=next?`${next.title}${next.technical_focus?` — ${v36CleanPurpose(next.technical_focus)}`:""}`:v36SuggestedProgression(session,week,sessionReview(session.id),evidence);
  rows.push({label:next?"Lead into next session":"Suggested next progression",text:nextText});
  host.innerHTML=`<div class="plan-chain">${rows.map(r=>`<div class="plan-chain-row"><span>${escapeHtml(r.label)}</span><strong>${r.html||escapeHtml(r.text)}</strong></div>`).join("")}</div>`;
  if(nextHost)nextHost.innerHTML=next?`<strong>${escapeHtml(sessionLabel(next))} — ${escapeHtml(next.title)}</strong><div>${escapeHtml(v36CleanPurpose(next.primary_system))}</div><div class="help">${escapeHtml(v36CleanPurpose(next.technical_focus))}</div>`:`<div class="help">Built from the last completed session, this week and the current season direction.</div>`;
};

// -----------------------------------------------------------------------------
// Lane assignment: preserve session choices, then use saved lane digits, then
// distribute remaining present swimmers across the actual lanes in use.
// -----------------------------------------------------------------------------
function v36LaneNumber(value){const m=String(value??"").match(/\d+/);return m?Number(m[0]):0}
v35EnsureLaneAssignments=function(session,roster=selectedRoster()){
  if(!session||!roster.length)return;const count=v35Clamp(Number(session.lane_count||1),1,12),sorted=roster.slice().sort(rosterSort);let changed=false;
  sorted.forEach((athlete,index)=>{
    const existing=appState.session_lane_assignments.find(x=>x.session_id===session.id&&x.athlete_id===athlete.id),existingLane=v36LaneNumber(existing?.lane_number);
    if(existing&&existingLane>=1&&existingLane<=count)return;
    let lane=v36LaneNumber(athlete.training_lane);if(lane<1||lane>count)lane=(index%count)+1;
    const record={id:existing?.id||uid("lane"),session_id:session.id,athlete_id:athlete.id,lane_number:lane,lane_order:Number(athlete.timing_order)||index+1,updated_at:nowIso()};
    upsertLocal("session_lane_assignments",record);queueRecord("session_lane_assignments",record.id);changed=true;
  });
  if(changed){saveState(appState);scheduleFastSync()}
};

// -----------------------------------------------------------------------------
// Results: derive PBs from valid complete race history and infer course only from
// explicit meet/course evidence. This prevents the same time becoming both LC/SC.
// -----------------------------------------------------------------------------
function v36CourseForResult(row){
  const raw=v3Course(row.course||row.pool_course||"");if(raw==="SCM"||raw==="LCM")return raw;
  const meet=String(v3MeetName(row)||"").toLowerCase();
  if(/short course|\bnzsc\b|scwc.*short|canterbury.*short/.test(meet))return "SCM";
  if(/long course|south island lc|\bnags\b|nz opens|division ii|div ii/.test(meet))return "LCM";
  return "";
}
const v36BaseAthleteHistory=athleteHistory;
athleteHistory=function(athleteId){
  const rows=v36BaseAthleteHistory(athleteId).map(r=>({...r,course:v36CourseForResult(r)})).filter(r=>r.course&&r.distance&&r.stroke&&Number(r.result_seconds)>0&&!/DQ|DNS|DNF/i.test(String(r.result_time_text||"")));
  const seen=new Set();return rows.filter(r=>{const key=[r.athlete_id,r.result_date,r.meet_name,r.distance,r.stroke,r.result_time_text,r.round].join("|").toLowerCase();if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||"")));
};
athleteOfficialPbs=function(athleteId){
  const history=athleteHistory(athleteId),best=new Map();
  history.forEach(row=>{const key=`${row.course}|${Number(row.distance)}|${v3Stroke(row.stroke)}`,old=best.get(key);if(!old||Number(row.result_seconds)<Number(old.result_seconds))best.set(key,{...row,pb_time:row.result_time_text,pb_seconds:row.result_seconds,pb_date:row.result_date})});
  if(!best.size){
    (appState.results_pb_board||[]).filter(r=>r.athlete_id===athleteId).map(r=>v3RaceRow(r,"official-pb")).forEach(row=>{row.course=v36CourseForResult(row);if(!row.course||!row.result_seconds)return;const key=`${row.course}|${row.distance}|${row.stroke}`,old=best.get(key);if(!old||row.result_seconds<old.result_seconds)best.set(key,{...row,pb_time:row.result_time_text,pb_seconds:row.result_seconds,pb_date:row.result_date})});
  }
  return [...best.values()].sort((a,b)=>a.distance-b.distance||a.stroke.localeCompare(b.stroke)||a.course.localeCompare(b.course));
};

// -----------------------------------------------------------------------------
// Cloud-only Team Manager/results import. The chosen file is read in memory,
// the file input is cleared immediately, and only accepted rows go to Supabase.
// -----------------------------------------------------------------------------
function v36MeetDateFallback(meet){
  const m=String(meet||"").toLowerCase();if(/canterbury.*2026/.test(m))return "2026-07-03";return "";
}
const v36BaseNormaliseImportRow=v3NormaliseImportRow;
v3NormaliseImportRow=function(raw,fallbackMeet,fallbackCourse){
  const row=v36BaseNormaliseImportRow(raw,fallbackMeet,fallbackCourse);if(!row.result_date)row.result_date=v36MeetDateFallback(row.meet_name);
  row.course=v36CourseForResult(row)||v3Course(fallbackCourse)||row.course;return row;
};
function v36Hy3Date(value){
  const raw=String(value||"").replace(/\D/g,"");
  if(raw.length!==8)return "";
  const month=Number(raw.slice(0,2)),day=Number(raw.slice(2,4)),year=Number(raw.slice(4,8));
  if(year<1900||month<1||month>12||day<1||day>31)return "";
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function v36Hy3Course(value){
  const code=String(value||"").trim().toUpperCase();
  if(["S","M","1"].includes(code))return "SCM";
  if(["L","3"].includes(code))return "LCM";
  if(["Y","2"].includes(code))return "SCY";
  return "";
}
function v36Hy3Stroke(value){
  const code=String(value||"").trim().toUpperCase();
  return ({A:"Freestyle",1:"Freestyle",B:"Backstroke",2:"Backstroke",C:"Breaststroke",3:"Breaststroke",D:"Butterfly",4:"Butterfly",E:"IM",5:"IM"})[code]||"";
}
function v36SecondsText(value){
  const seconds=Number(value);if(!Number.isFinite(seconds)||seconds<=0)return "";
  const minutes=Math.floor(seconds/60),remain=seconds-minutes*60;
  return minutes?`${minutes}:${remain.toFixed(2).padStart(5,"0")}`:remain.toFixed(2);
}
function v36ParseHy3(text){
  const rows=[],swimmers=new Map();let meetName="",meetDate="",currentEvent=null;
  for(const rawLine of String(text||"").split(/\r?\n/)){
    const line=rawLine.replace(/\r$/,"");if(line.length<2)continue;
    const type=line.slice(0,2);
    if(type==="B1"){
      meetName=line.slice(2,47).trim()||meetName;
      meetDate=v36Hy3Date(line.slice(92,100))||meetDate;
      currentEvent=null;continue;
    }
    if(type==="D1"){
      const swimmerId=line.slice(3,8).trim();
      const last=line.slice(8,28).trim(),first=line.slice(28,48).trim()||line.slice(48,68).trim(),middle=line.slice(68,69).trim();
      const fullName=[first,middle,last].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
      if(swimmerId&&fullName)swimmers.set(swimmerId,{swimmer_name:fullName,age:Number(line.slice(96,99).trim())||null,sex:line.slice(2,3).trim()||""});
      currentEvent=null;continue;
    }
    if(type==="E1"){
      const swimmerId=line.slice(3,8).trim(),swimmer=swimmers.get(swimmerId);
      const distance=Number(line.slice(15,21).trim())||0,stroke=v36Hy3Stroke(line.slice(21,22));
      const eventNumber=(line.slice(38,42).match(/\d+/)||[])[0]||"";
      currentEvent=swimmer&&distance&&stroke?{...swimmer,swimmer_id:swimmerId,distance,stroke,course:v36Hy3Course(line.slice(50,51))||v36Hy3Course(line.slice(59,60)),event_number:eventNumber}:null;
      continue;
    }
    if(type!=="E2"||!currentEvent)continue;
    const resultType=line.slice(2,3).trim().toUpperCase(),seconds=Number(line.slice(3,11).trim()),course=v36Hy3Course(line.slice(11,12))||currentEvent.course;
    const status=line.slice(12,13).trim().toUpperCase();
    if(!Number.isFinite(seconds)||seconds<=0||/[QFDRS]/.test(status))continue;
    if(course==="SCY")continue;
    const resultDate=v36Hy3Date(line.slice(87,95))||meetDate;
    rows.push({
      swimmer_name:currentEvent.swimmer_name,age:currentEvent.age,sex:currentEvent.sex,
      result_date:resultDate,meet_name:meetName,course,distance:currentEvent.distance,stroke:currentEvent.stroke,
      event:`${currentEvent.distance} ${currentEvent.stroke}`,round:({P:"Prelim",F:"Final",S:"Swim-off"})[resultType]||resultType,
      result_time:v36SecondsText(seconds),official_place:(line.slice(29,33).match(/\d+/)||[])[0]||"",
      heat_or_rank_field:(line.slice(26,29).match(/\d+/)||[])[0]||"",event_number:currentEvent.event_number,source_format:"HY3"
    });
  }
  return rows;
}
function v36LooksLikeHy3(text){
  const sample=String(text||"").slice(0,12000);return /^A1/m.test(sample)&&/^D1/m.test(sample)&&/^E1/m.test(sample)&&/^E2/m.test(sample);
}
function v36ParseResultsText(text,fileName=""){
  const lower=String(fileName||"").toLowerCase();
  if(lower.endsWith(".hy3")||v36LooksLikeHy3(text))return v36ParseHy3(text);
  if(lower.endsWith(".sd3")){const fixed=v3ParseFixed(text);if(fixed.length)return fixed}
  const delimited=v3Delimited(text);if(delimited.length)return delimited;
  return v3ParseFixed(text);
}
v3ParseResultsFile=async function(){
  const input=$("resultsFileInput"),file=input?.files?.[0];if(!file)return alert("Choose a Team Manager/results file first.");
  resultImportFileName=file.name;let text="",entryName=file.name;
  try{
    if(file.name.toLowerCase().endsWith(".zip")){const unpacked=await v3ReadResultsZip(file);text=unpacked.text;entryName=unpacked.name;resultImportFileName=`${file.name} :: ${unpacked.name}`}else text=await file.text();
    const raw=v36ParseResultsText(text,entryName);if(!raw.length)throw new Error("No usable result rows were found. Check that this is a supported CSV, TSV, HY3, SD3 or ZIP results export.");
    resultImportPreview=raw.map(r=>v3NormaliseImportRow(r,$("importMeetName").value.trim(),$("importCourse").value));v3RefreshImportStatuses();
    text="";input.value="";renderResultImportPreview();
  }catch(error){input.value="";$("resultImportSummary").innerHTML=`<div class="source-warning">${escapeHtml(error.message)}</div>`}
};
async function v36LoadBundledResultsRepair(){
  try{
    const response=await fetch("./SUPPLIED_RESULTS_REPAIR_IMPORT.csv",{cache:"no-store"});if(!response.ok)throw new Error("The bundled results-repair file is not on the website.");
    const text=await response.text();resultImportFileName="Bundled supplied results repair · 637 rows";const raw=v3Delimited(text);resultImportPreview=raw.map(r=>v3NormaliseImportRow(r,"",""));v3RefreshImportStatuses();renderResultImportPreview();showView("resultsupdate");
    $("resultImportSummary").insertAdjacentHTML("afterend",'<div class="help v36-ephemeral-note">The source file was read into temporary memory only. It is not saved as a file on this phone.</div>');
  }catch(error){alert(error.message)}
}
function v36SanitisedResultRow(r,batchId){
  const row={id:uid("result"),athlete_id:r.athlete_id,swimmer_name:r.swimmer_name,result_date:r.result_date||null,meet_name:r.meet_name,course:r.course,distance:Number(r.distance),stroke:r.stroke,round:r.round||null,result_time_text:r.result_time_text,result_seconds:Number(r.result_seconds),wa_points:r.wa_points||null,world_para_points:r.world_para_points||null,official_place:r.official_place||null,source_type:"file",import_batch_id:batchId,source_file:resultImportFileName,duplicate_key:r.duplicate_key,reviewed:true,created_at:nowIso(),updated_at:nowIso()};
  return cloudRow("coach_results",row);
}
v3CommitImport=async function(){
  const accepted=resultImportPreview.filter(r=>r.use&&r.athlete_id&&r.status==="READY"&&r.result_seconds);if(!accepted.length)return;
  if(!cloudReady()||!navigator.onLine){alert("Results import requires a live Supabase connection. The raw Team Manager file will not be stored locally.");return}
  const batch={id:uid("import"),file_name:resultImportFileName,source_type:"file",meet_name:$("importMeetName").value.trim(),imported_rows:accepted.length,held_rows:resultImportPreview.length-accepted.length,created_at:nowIso(),updated_at:nowIso()},batchRow=cloudRow("coach_result_imports",batch),rows=accepted.map(r=>v36SanitisedResultRow(r,batch.id)),aliases=[];
  accepted.forEach(r=>{const athlete=appState.athletes.find(a=>a.id===r.athlete_id),key=v3NameKey(r.swimmer_name);if(athlete&&key&&key!==v3NameKey(athlete.full_name)&&!aliases.some(a=>a.alias_key===key))aliases.push(cloudRow("coach_result_aliases",{id:(appState.coach_result_aliases||[]).find(a=>a.alias_key===key)?.id||uid("alias"),alias_name:r.swimmer_name,alias_key:key,athlete_id:athlete.id,updated_at:nowIso()}))});
  updateStatus(`Uploading ${accepted.length} results to Supabase…`);
  try{
    await cloudFetch("/rest/v1/coach_result_imports?on_conflict=id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(batchRow)});
    await cloudFetch("/rest/v1/coach_results?on_conflict=id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows)});
    if(aliases.length)await cloudFetch("/rest/v1/coach_result_aliases?on_conflict=id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(aliases)});
    resultImportPreview=[];resultImportFileName="";if($("resultsFileInput"))$("resultsFileInput").value="";await pullCloud();renderResultImportPreview();renderAll();v36SetSyncState({success:true});updateStatus(`${accepted.length} results uploaded to Supabase · source file discarded`,`good`);
  }catch(error){try{await cloudFetch(`/rest/v1/coach_result_imports?id=eq.${encodeURIComponent(batch.id)}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}})}catch{}alert(`Results were not committed: ${error.message}`);updateStatus("Results upload failed · preview retained","error")}
};

const v36BaseRenderResultImportPreview=renderResultImportPreview;
renderResultImportPreview=function(){
  v36WithActiveAthletes(v36BaseRenderResultImportPreview);const button=$("commitResultsImportBtn"),host=$("resultImportSummary");
  if(button&&resultImportPreview.some(r=>r.use&&r.athlete_id&&r.status==="READY"))button.disabled=!cloudReady()||!navigator.onLine;
  if(host&&!cloudReady()&&resultImportPreview.length)host.insertAdjacentHTML("beforeend",'<div class="source-warning">Connect to Supabase before saving. The file itself is not retained on this phone.</div>');
};

// Rebind handlers because the original listeners captured the earlier functions.
function v36RebindResultsButtons(){
  for(const [id,handler] of [["parseResultsFileBtn",v3ParseResultsFile],["commitResultsImportBtn",v3CommitImport]]){const old=$(id);if(!old)continue;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",handler)}
  const clear=$("clearResultsPreviewBtn");if(clear){const fresh=clear.cloneNode(true);clear.replaceWith(fresh);fresh.addEventListener("click",()=>{resultImportPreview=[];resultImportFileName="";if($("resultsFileInput"))$("resultsFileInput").value="";renderResultImportPreview()})}
}

// -----------------------------------------------------------------------------
// Structured adaptation rules + AI generation with deterministic fallback.
// -----------------------------------------------------------------------------
function v36DefaultProfile(athlete){return v35ProfileForAthlete(athlete)}
function v36RulesForAthlete(athlete){return (appState.athlete_adaptation_rules||[]).filter(r=>r.athlete_id===athlete.id&&r.active!==false).sort(byUpdated)}
function v36ParseClockRange(text){
  const match=String(text||"").match(/(\d{1,2}:\d{2})(?:\s*[–—-]\s*(\d{1,2}:\d{2}))?/);if(!match)return {};
  const first=v35CycleSeconds(match[1]),second=match[2]?v35CycleSeconds(match[2]):first;return {cycle_seconds:Math.round((first+second)/2),min_cycle_seconds:first,max_cycle_seconds:second};
}
function v36ParseRuleLocal(text){
  const raw=v35Text(text),lower=raw.toLowerCase(),rule={};
  if(/\bhalf\b|\b1\s*\/\s*2\b|½/.test(lower))rule.volume_ratio=.5;
  if(/two\s*[- ]?thirds|2\s*\/\s*3|⅔/.test(lower))rule.volume_ratio=2/3;
  const percent=lower.match(/(\d{1,3})\s*%/);if(percent)rule.volume_ratio=Number(percent[1])/100;
  const distance=lower.match(/\b(25|50|75|100|150|200|300|400)s?\b/);if(distance)rule.distance=Number(distance[1]);
  Object.assign(rule,v36ParseClockRange(raw));
  const mult=lower.match(/(?:cycle|rest|send[- ]?off)[^\d]{0,20}(\d+(?:\.\d+)?)\s*x/);if(mult)rule.cycle_multiplier=Number(mult[1]);
  if(/fast|race pace|quality|sprint/.test(lower))rule.quality_only=true;
  const block=lower.match(/\b(warm[ -]?up|pre[ -]?set|skill|main set|kick|pull|post[ -]?set|warm[ -]?down)\b/);if(block)rule.block_type=v32NormaliseBlockType(block[1]);
  if(/keep.*skill|retain.*skill/.test(lower))rule.keep_skill=true;if(/keep.*quality|retain.*quality/.test(lower))rule.keep_quality=true;
  if(/remove|drop|skip/.test(lower)){const remove=block?.[1];if(remove)rule.remove_block_type=v32NormaliseBlockType(remove)}
  const equipment=raw.match(/(?:use|with|equipment)\s+([a-z ,/&-]+)/i);if(equipment)rule.equipment=equipment[1].trim();
  return rule;
}
async function v36CoachAi(task,payload){
  if(!cloudReady()||!navigator.onLine)throw new Error("AI generation needs the Supabase connection.");
  const config=getConfig(),auth=getAuth(),response=await fetch(`${config.supabaseUrl}/functions/v1/transcribe-capture`,{method:"POST",headers:{"apikey":config.supabaseAnonKey,"Authorization":`Bearer ${auth.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({action:"coach_ai",task,payload})});
  const data=await response.json().catch(()=>({}));if(!response.ok||data.error)throw new Error(data.error||`AI request failed (${response.status})`);return data;
}
function v36RuleApplies(rule,item,block){
  const r=rule.rule_json||rule;if(r.distance&&Number(r.distance)!==Number(item.distance))return false;if(r.block_type&&r.block_type!==block.block_type)return false;
  if(r.quality_only&&!/fast|race pace|quality|sprint|max|vo2/i.test(`${item.raw||""} ${item.instruction||""}`))return false;return true;
}
function v36AdaptSetLine(item,profile,athlete,block,rules){
  const applicable=rules.map(r=>r.rule_json||r).filter(r=>v36RuleApplies(r,item,block));let ratio=profile.ratio,cycleMultiplier=profile.cycleMultiplier;
  applicable.forEach(r=>{if(Number(r.volume_ratio)>0)ratio=Number(r.volume_ratio);if(Number(r.cycle_multiplier)>0)cycleMultiplier=Number(r.cycle_multiplier)});
  let line=v35AdaptSetLine(item,{...profile,ratio,cycleMultiplier},athlete,block);
  const fixed=applicable.map(r=>Number(r.cycle_seconds||r.min_cycle_seconds||0)).filter(Boolean).sort((a,b)=>b-a)[0];
  if(fixed){const cycle=v35CycleText(fixed);if(/\bon\s+\d{1,2}:\d{2}\b/.test(line))line=line.replace(/\bon\s+\d{1,2}:\d{2}\b/,`on ${cycle}`);else line=`${line} on ${cycle}`}
  const equipment=applicable.map(r=>r.equipment).filter(Boolean).join(", ");if(equipment&&!line.toLowerCase().includes(equipment.toLowerCase()))line+=` · ${equipment}`;
  return line;
}
function v36AthleteEvidence(athlete,session){
  const captures=(appState.captures||[]).filter(c=>c.athlete_id===athlete.id&&c.text_content).sort(byUpdated).slice(0,6).map(c=>c.text_content),reviews=(appState.session_reviews||[]).sort(byUpdated).slice(0,10).flatMap(r=>[r.athlete_notes,r.modifications,r.athlete_response]).filter(Boolean).filter(t=>v35NameKey(t).includes(v35NameKey(athlete.full_name).split(" ")[0])).slice(0,5),prior=(appState.session_adaptations||[]).filter(a=>a.athlete_id===athlete.id&&a.session_id!==session.id).sort(byUpdated).slice(0,2).map(a=>a.adapted_text),timed=(appState.timed_sets||[]).filter(t=>t.athlete_id===athlete.id).sort(byUpdated).slice(0,3).map(t=>`${t.set_label||`${t.distance} ${t.stroke}`}: best ${formatSeconds(t.best)}, average ${formatSeconds(t.average)}`);
  return {coach_profile:[athlete.modifications,athlete.coach_notes,athlete.technical_focus].filter(Boolean),captures,reviews,prior_adaptations:prior,timed_sets:timed};
}
function v36GenerateAdaptationRules(athlete,session=selectedSession()){
  const profile=v36DefaultProfile(athlete);if(!profile||!session)return "";const rules=v36RulesForAthlete(athlete),blocks=v32SessionBlocks(session.id).length?v32SessionBlocks(session.id):v36ParseWorkoutBlocks(session.workout||""),lines=[`${athlete.full_name} — ${profile.label}`,`Same purpose: ${[v36CleanPurpose(session.primary_system),v36CleanPurpose(session.technical_focus)].filter(Boolean).join(" · ")||session.title}`];
  for(const block of blocks){if(rules.some(r=>(r.rule_json||{}).remove_block_type===block.block_type))continue;lines.push("",String(block.title||v32BlockLabel(block.block_type)).toUpperCase());for(const item of v34Array(block.items))lines.push(v36AdaptSetLine(item,profile,athlete,block,rules))}
  if(rules.length)lines.push("","APPROVED RULES USED",...rules.map(r=>`- ${r.rule_text}`));lines.push("","Coach check: the quality purpose and key technical cues are retained; volume and cycles are athlete-specific.");return lines.join("\n");
}
async function v36GenerateAdaptation(athlete,{preferAi=true}={}){
  const session=selectedSession();if(!athlete||!session)return "";const fallback=v36GenerateAdaptationRules(athlete,session),status=$("adaptationStatus");
  if(!preferAi||!cloudReady()||!navigator.onLine){if(status)status.textContent="Generated from approved rules on this device.";return fallback}
  try{
    if(status)status.textContent="AI is building the athlete version from the main session, approved rules and coaching evidence…";
    const blocks=(v32SessionBlocks(session.id).length?v32SessionBlocks(session.id):v36ParseWorkoutBlocks(session.workout||"")).map(b=>({block_type:b.block_type,title:b.title,items:b.items,notes:b.notes||""})),payload={athlete:{id:athlete.id,name:athlete.full_name,classification:[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean).join(" / "),default_profile:v36DefaultProfile(athlete),technical_focus:athlete.technical_focus||"",modifications:athlete.modifications||""},session:{id:session.id,title:session.title,primary_system:v36CleanPurpose(session.primary_system),technical_focus:v36CleanPurpose(session.technical_focus),planned_distance:session.planned_distance,blocks},approved_rules:v36RulesForAthlete(athlete).map(r=>({text:r.rule_text,structured:r.rule_json})),evidence:v36AthleteEvidence(athlete,session)};
    const result=await v36CoachAi("generate_adaptation",payload);if(status)status.textContent=`AI generated · ${result.summary||"review before use"}${result.warnings?.length?` · ${result.warnings.join("; ")}`:""}`;return result.adapted_session_text||fallback;
  }catch(error){if(status)status.textContent=`AI unavailable: ${error.message}. Rules-based version shown.`;return fallback}
}
function v36SavedAdaptation(athleteId,sessionId){return (appState.session_adaptations||[]).filter(a=>a.athlete_id===athleteId&&a.session_id===sessionId).sort(byUpdated)[0]||null}
v35SavedAdaptation=v36SavedAdaptation;
v35RenderAdaptationPanel=function(){
  const panel=$("adaptationPanel"),tabs=$("adaptationAthleteTabs"),text=$("adaptationText"),session=selectedSession();if(!panel||!tabs||!text||!session)return;const athletes=v35AdaptationAthletes();
  if(!athletes.length){tabs.innerHTML='<div class="help">No active modified-session profiles match the current roll.</div>';text.value="";return}
  if(!athletes.some(a=>a.id===v35AdaptationAthleteId))v35AdaptationAthleteId=athletes[0].id;
  tabs.innerHTML=athletes.map(a=>`<button type="button" data-v35-adapt-athlete="${escapeHtml(a.id)}" class="${a.id===v35AdaptationAthleteId?"active":""}">${escapeHtml(a.full_name.split(" ")[0])} · ${escapeHtml(v36DefaultProfile(a).label)}</button>`).join("");tabs.querySelectorAll("[data-v35-adapt-athlete]").forEach(button=>button.onclick=()=>{v35AdaptationAthleteId=button.dataset.v35AdaptAthlete;v35RenderAdaptationPanel()});
  const athlete=athletes.find(a=>a.id===v35AdaptationAthleteId),saved=v36SavedAdaptation(athlete.id,session.id);text.value=saved?saved.adapted_text:v36GenerateAdaptationRules(athlete,session);const status=$("adaptationStatus");if(status)status.textContent=saved?`Saved to Supabase coaching data · ${new Date(saved.updated_at||saved.created_at).toLocaleString("en-NZ")}`:"Rules-based draft ready. Use AI regenerate for deeper context.";
  const ruleHost=$("v36AdaptationRules");if(ruleHost)ruleHost.innerHTML=v36RulesForAthlete(athlete).map(r=>`<div class="v36-rule-row"><div><strong>${escapeHtml(r.scope||"general")}</strong><span>${escapeHtml(r.rule_text)}</span></div><button type="button" class="secondary" data-v36-delete-rule="${escapeHtml(r.id)}">Remove</button></div>`).join("")||'<div class="help">No extra approved rules yet.</div>';
  ruleHost?.querySelectorAll("[data-v36-delete-rule]").forEach(b=>b.onclick=()=>v36DeleteRule(b.dataset.v36DeleteRule));
};
v35SaveAdaptation=async function(){
  const session=selectedSession(),athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId),text=$("adaptationText")?.value.trim();if(!session||!athlete||!text)return;const existing=v36SavedAdaptation(athlete.id,session.id),record={id:existing?.id||`adaptation-${session.id}-${athlete.id}`,session_id:session.id,athlete_id:athlete.id,adapted_text:text,generation_method:/AI generated/i.test($("adaptationStatus")?.textContent||"")?"ai":"rules",rule_snapshot:v36RulesForAthlete(athlete).map(r=>({id:r.id,text:r.rule_text,rule:r.rule_json})),evidence_snapshot:v36AthleteEvidence(athlete,session),coach_approved:true,created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("session_adaptations",record);queueRecord("session_adaptations",record.id);saveState(appState);await syncIfPossible();v35RenderAdaptationPanel();updateStatus(`${athlete.full_name} version saved and synced when online`,"good")
};
async function v36ApproveLearning(){
  const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId),text=$("adaptationLearningRule")?.value.trim();if(!athlete||!text)return;let structured=v36ParseRuleLocal(text),source="coach_approved";
  try{const result=await v36CoachAi("parse_adaptation_rule",{athlete_name:athlete.full_name,rule_text:text});if(result.rule_json)structured=result.rule_json;source="coach_approved_ai_structured"}catch(error){const status=$("adaptationStatus");if(status)status.textContent=`Rule saved with local structure. AI parser unavailable: ${error.message}`}
  const record={id:uid("adapt-rule"),athlete_id:athlete.id,scope:structured.block_type||structured.distance?"specific":"general",rule_text:text,rule_json:structured,source_type:source,active:true,created_at:nowIso(),updated_at:nowIso()};upsertLocal("athlete_adaptation_rules",record);queueRecord("athlete_adaptation_rules",record.id);athlete.modifications=v34AppendText(athlete.modifications,`Approved adaptation rule: ${text}`);athlete.updated_at=nowIso();queueRecord("athletes",athlete.id);saveState(appState);await syncIfPossible();$("adaptationLearningRule").value="";$("adaptationText").value=await v36GenerateAdaptation(athlete,{preferAi:true});v35RenderAdaptationPanel();updateStatus(`Approved rule learned for ${athlete.full_name}`,"good")
}
v35ApproveLearning=v36ApproveLearning;
async function v36DeleteRule(id){const rule=appState.athlete_adaptation_rules.find(r=>r.id===id);if(!rule||!confirm("Remove this approved adaptation rule?"))return;appState.athlete_adaptation_rules=appState.athlete_adaptation_rules.filter(r=>r.id!==id);queueDelete("athlete_adaptation_rules",id);saveState(appState);await syncIfPossible();v35RenderAdaptationPanel()}

// -----------------------------------------------------------------------------
// Finish Session evidence is pre-summarised so the coach does not repeat data.
// -----------------------------------------------------------------------------
function v36RenderFinishEvidence(){
  const host=$("v36FinishEvidence"),session=selectedSession();if(!host||!session)return;const attendance=(appState.attendance||[]).filter(a=>a.session_id===session.id&&(a.status==="present"||a.status==="modified")),modified=attendance.filter(a=>a.status==="modified").map(a=>appState.athletes.find(x=>x.id===a.athlete_id)?.full_name).filter(Boolean),captures=(appState.captures||[]).filter(c=>c.session_id===session.id&&c.text_content&&!/^Finish Session voice/.test(c.text_content)).sort(byUpdated),timed=(appState.timed_sets||[]).filter(t=>t.session_id===session.id),blocks=v32SessionBlocks(session.id),completed=blocks.filter(b=>b.status==="completed").length;
  host.innerHTML=`<div class="v36-finish-grid"><div><span>Attendance</span><strong>${attendance.length} here${modified.length?` · modified: ${escapeHtml(modified.join(", "))}`:""}</strong></div><div><span>Blocks</span><strong>${completed}/${blocks.length||0} completed</strong></div><div><span>Times</span><strong>${timed.length} saved set${timed.length===1?"":"s"}</strong></div><div><span>Captures</span><strong>${captures.length} note${captures.length===1?"":"s"}</strong></div></div>${captures.slice(0,5).map(c=>`<div class="v36-evidence-line"><b>${escapeHtml(appState.athletes.find(a=>a.id===c.athlete_id)?.full_name||c.capture_type||"Note")}</b><span>${escapeHtml(c.text_content)}</span></div>`).join("")}${timed.slice(0,5).map(t=>`<div class="v36-evidence-line"><b>${escapeHtml(appState.athletes.find(a=>a.id===t.athlete_id)?.full_name||"Time")}</b><span>${escapeHtml(t.set_label||`${t.distance} ${t.stroke}`)} · best ${formatSeconds(t.best)} · avg ${formatSeconds(t.average)}</span></div>`).join("")}`;
}
const v36BaseRenderReview=renderReview;
renderReview=function(){v36BaseRenderReview();v36RenderFinishEvidence()};

// -----------------------------------------------------------------------------
// Interface additions and final rebindings.
// -----------------------------------------------------------------------------
function v36InjectInterface(){
  document.title="McLay Swimming OS — v3.6 Corrected";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.6 · plan → coach → capture → adapt → review → progress";
  const settingsCard=document.querySelector("#settings .two-column");if(settingsCard&&!$("v36SyncDetails"))settingsCard.insertAdjacentHTML("afterend",'<article class="card"><div class="card-heading"><div><div class="eyebrow">Exact sync status</div><h3>What is on the phone and what failed</h3></div></div><div id="v36SyncDetails"></div></article>');
  const tmCard=$("resultsFileInput")?.closest("article");if(tmCard&&!$("loadBundledResultsRepairBtn")){tmCard.querySelector("h3").textContent="Team Manager / results file — phone or desktop";tmCard.querySelector(".help")?.insertAdjacentHTML("afterend",'<p class="help"><strong>Phone privacy:</strong> the selected file is read in temporary memory, the file control is cleared immediately, and only accepted result rows are uploaded to Supabase. The raw file is not saved in McLay Swimming storage.</p><button id="loadBundledResultsRepairBtn" type="button" class="secondary full-width">Load the supplied 637-row results repair pack</button>')}
  const panel=$("adaptationPanel");if(panel&&!$("v36AdaptationRules")){panel.querySelector("h3").textContent="Main session → intelligent athlete version";const regenerate=$("regenerateAdaptationBtn");if(regenerate)regenerate.textContent="AI regenerate from session + evidence";panel.querySelector("details")?.insertAdjacentHTML("beforeend",'<div id="v36AdaptationRules" class="v36-rule-list"></div>')}
  const voice=$("finishVoicePanel");if(voice&&!$("v36FinishEvidence"))voice.insertAdjacentHTML("beforebegin",'<section class="v36-finish-evidence"><div class="eyebrow">Already captured</div><h3>Session evidence</h3><div id="v36FinishEvidence"></div></section>');
  v36RebindResultsButtons();$("loadBundledResultsRepairBtn")?.addEventListener("click",v36LoadBundledResultsRepair);
  const regen=$("regenerateAdaptationBtn");if(regen){const fresh=regen.cloneNode(true);regen.replaceWith(fresh);fresh.addEventListener("click",async()=>{const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId);if(athlete)$("adaptationText").value=await v36GenerateAdaptation(athlete,{preferAi:true})})}
  const save=$("saveAdaptationBtn");if(save){const fresh=save.cloneNode(true);save.replaceWith(fresh);fresh.addEventListener("click",v35SaveAdaptation)}
  const approve=$("approveAdaptationLearningBtn");if(approve){const fresh=approve.cloneNode(true);approve.replaceWith(fresh);fresh.addEventListener("click",v36ApproveLearning)}
}

const v36BaseRenderAll=renderAll;
renderAll=function(){v36BaseRenderAll();v36RenderSyncDetails();v36RenderFinishEvidence();v35RenderAdaptationPanel()};

v36InjectInterface();v35DeactivateDepartedSwimmers();v36RenderSyncDetails();renderAll();

// v3.6 bundled-results normalisation refinements.
function v36CleanImportedSwimmerName(value){
  return String(value||"").replace(/\bS\d+\s*\/\s*Sb\d+\s*\/\s*Sm\d+\b/gi,"").replace(/\b(?:S|SB|SM)\d+\b/gi,"").replace(/\s+/g," ").trim();
}
const v36BaseMatchAthlete=v3MatchAthlete;
v3MatchAthlete=function(name){return v36BaseMatchAthlete(v36CleanImportedSwimmerName(name))};
const v36PriorNormaliseImportRow=v3NormaliseImportRow;
v3NormaliseImportRow=function(raw,fallbackMeet,fallbackCourse){
  const meetFromRow=raw?.meet_key||raw?.meet||raw?.meet_name||raw?.competition||fallbackMeet||"";
  const row=v36PriorNormaliseImportRow(raw,meetFromRow,fallbackCourse);
  row.meet_name=row.meet_name||meetFromRow;
  row.swimmer_name=v36CleanImportedSwimmerName(row.swimmer_name||raw?.name||raw?.swimmer_name||"");
  row.athlete_id=v3MatchAthlete(row.swimmer_name)?.id||"";
  if(!row.result_date)row.result_date=v36MeetDateFallback(row.meet_name);
  row.course=v36CourseForResult({...row,meet_name:row.meet_name})||v3Course(fallbackCourse)||row.course;
  return row;
};

// Meet wording is stronger evidence than a conflicting stale course label.
const v36PriorCourseForResult=v36CourseForResult;
v36CourseForResult=function(row){
  const meet=String(v3MeetName(row)||"").toLowerCase();
  if(/short course|\bnzsc\b|scwc.*short|canterbury.*champ|aquagym challenge/.test(meet))return "SCM";
  if(/long course|south island lc|\bnags\b|nz opens|division ii|div ii/.test(meet))return "LCM";
  return v36PriorCourseForResult(row);
};
renderAll();

// Preserve unsaved adaptation edits across normal poolside re-renders.
let v36AdaptationViewKey="",v36AdaptationDirty=false;
const v36PriorRenderAdaptationPanel=v35RenderAdaptationPanel;
v35RenderAdaptationPanel=function(){
  const session=selectedSession(),before=$("adaptationText")?.value||"",key=`${session?.id||""}|${v35AdaptationAthleteId||""}`;
  v36PriorRenderAdaptationPanel();
  const text=$("adaptationText"),afterKey=`${selectedSession()?.id||""}|${v35AdaptationAthleteId||""}`;
  if(text&&v36AdaptationDirty&&v36AdaptationViewKey===afterKey)text.value=before;
  else{v36AdaptationViewKey=afterKey;v36AdaptationDirty=false}
  if(text&&!text.dataset.v36DirtyBound){text.dataset.v36DirtyBound="1";text.addEventListener("input",()=>{v36AdaptationDirty=true;v36AdaptationViewKey=`${selectedSession()?.id||""}|${v35AdaptationAthleteId||""}`})}
};
const v36PriorSaveAdaptation=v35SaveAdaptation;
v35SaveAdaptation=async function(){await v36PriorSaveAdaptation();v36AdaptationDirty=false;v36AdaptationViewKey=`${selectedSession()?.id||""}|${v35AdaptationAthleteId||""}`};
renderAll();

// Bind the final wrapped save/regenerate handlers after all v3.6 overrides.
for(const [id,handler] of [
  ["saveAdaptationBtn",()=>v35SaveAdaptation()],
  ["regenerateAdaptationBtn",async()=>{const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId);if(athlete){$("adaptationText").value=await v36GenerateAdaptation(athlete,{preferAi:true});v36AdaptationDirty=true;v36AdaptationViewKey=`${selectedSession()?.id||""}|${v35AdaptationAthleteId||""}`}}]
]){
  const old=$(id);if(old){const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",handler)}
}
renderAll();

// Remove stray clock text from purpose fields without removing genuine swim distances.
const v36PriorCleanPurpose=v36CleanPurpose;
v36CleanPurpose=function(value){
  let text=v36PriorCleanPurpose(value);
  text=text.replace(/^\d{1,2}\s*(?:am|pm)\b\s*[·|\-–—:]*\s*/i,"").trim();
  return text;
};
renderAll();

// =============================================================================
// v3.6.1 VERIFIED CORRECTIONS
// Final browser-audit fixes: session metadata, complete block review,
// reliable compact Deck state, and immediate Save & Use Now rendering.
// =============================================================================

let v361FreshParsedDraft=false;
let v361DraftSourceText="";

function v361ExplicitLabel(text,labels){
  const escaped=labels.map(label=>label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  const match=String(text||"").match(new RegExp(`(?:^|\\n)\\s*(?:${escaped.join("|")})\\s*[:\\-–—]\\s*([^\\n]+)`,`i`));
  return match?.[1]?.trim()||"";
}
function v361CleanClockPrefix(value){
  return String(value||"")
    .replace(/^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b\s*[·|:\-–—]*\s*/i,"")
    .trim();
}
function v361HeadingMetadata(raw){
  const text=String(raw||"").replace(/\r/g,"");
  const first=text.split("\n").map(line=>line.trim()).find(Boolean)||"";
  const dateMatch=first.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\b/)
    || text.match(/(?:^|\n)\s*(?:date)\s*[:\-–—]\s*(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})\b/i);
  let session_date="";
  if(dateMatch){
    const year=Number(dateMatch[3])<100?2000+Number(dateMatch[3]):Number(dateMatch[3]);
    session_date=`${year}-${String(Number(dateMatch[2])).padStart(2,"0")}-${String(Number(dateMatch[1])).padStart(2,"0")}`;
  }
  const partMatch=first.match(/\b(AM|PM)\b/i)||text.match(/(?:^|\n)\s*(?:am\s*\/\s*pm|day\s*part|session\s*time)\s*[:\-–—]\s*(AM|PM)\b/i);
  const day_part=partMatch?partMatch[1].toUpperCase():"";
  const explicitTitle=v361ExplicitLabel(text,["session title","title"]);
  let headingTitle="";
  if(first){
    headingTitle=first
      .replace(/^#+\s*/,"")
      .replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s*/i,"")
      .replace(/\b(?:AM|PM)\b/ig," ")
      .replace(/\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g," ")
      .replace(/^\s*[·|:\-–—]+\s*/,"")
      .replace(/\s*[·|:\-–—]+\s*/g," — ")
      .replace(/^\s*(?:session|workout)\s*[:\-–—]\s*/i,"")
      .replace(/\s+/g," ")
      .trim();
    if(/^(?:purpose|focus|technical|system|warm.?up|pre.?set|main set|warm.?down)\b/i.test(headingTitle))headingTitle="";
  }
  const purpose=v361CleanClockPrefix(v361ExplicitLabel(text,["purpose","session purpose","primary purpose"]));
  const system=v361CleanClockPrefix(v361ExplicitLabel(text,["primary system","energy system","system"]));
  const technical=v361CleanClockPrefix(v361ExplicitLabel(text,["technical focus","technical cue","key cue","cue"]));
  return {session_date,day_part,title:explicitTitle||headingTitle,purpose,system,technical};
}

const v361PriorParseSessionFromChat=parseSessionFromChat;
parseSessionFromChat=function(raw){
  const draft=v361PriorParseSessionFromChat(raw);
  const meta=v361HeadingMetadata(raw);
  if(meta.session_date)draft.session_date=meta.session_date;
  if(meta.day_part)draft.day_part=meta.day_part;
  if(meta.title)draft.title=meta.title;
  if(meta.system||meta.purpose)draft.primary_system=meta.system||meta.purpose;
  if(meta.technical)draft.technical_focus=meta.technical;
  if(meta.purpose)draft.plan_cue=meta.purpose;
  draft.primary_system=v361CleanClockPrefix(v36CleanPurpose(draft.primary_system));
  draft.technical_focus=v361CleanClockPrefix(v36CleanPurpose(draft.technical_focus));
  v361FreshParsedDraft=true;
  v361DraftSourceText=String(raw||"").trim();
  return draft;
};

function v361NormaliseDraftBlock(block,index){
  const raw=block.raw_text||v32BlockItemsText(block.items)||"";
  return {
    ...block,
    block_type:block.block_type||v35InferBlockType(raw,index,v35DraftBlocks.length||1),
    title:block.title||v32BlockLabel(block.block_type||"main_set"),
    raw_text:raw,
    items:block.items?.length?block.items:v32BlockItemsFromText(raw),
    purpose:block.purpose||"",
    cues:block.cues||"",
    keep_together:block.keep_together!==false
  };
}
function v361RenderEditableDraftBlocks(){
  const host=$("sessionImportPreview");if(!host||!importedSessionDraft)return;
  const d=importedSessionDraft;
  v35DraftBlocks=v35DraftBlocks.map(v361NormaliseDraftBlock);
  host.className="session-import-preview";
  host.innerHTML=`<div class="import-preview-grid">
    <div><span>Date</span><strong>${escapeHtml(sessionLabel(d))}</strong></div>
    <div><span>Title</span><strong>${escapeHtml(d.title||"Imported session")}</strong></div>
    <div><span>Squads</span><strong>${escapeHtml((d.squads||[]).join(" + ")||"Check squad")}</strong></div>
    <div><span>Distance</span><strong>${Number(d.planned_distance||0).toLocaleString()}m</strong></div>
    <div><span>Lanes / pool</span><strong>${Number(d.lane_count||1)} · ${escapeHtml(d.pool_course||"SCM")}</strong></div>
    <div><span>Blocks</span><strong>${v35DraftBlocks.length}</strong></div>
  </div>
  <div class="v35-block-review">${v35DraftBlocks.map((b,i)=>`<article class="v35-block-review-card" data-v361-draft-block="${i}">
    <div class="v35-block-review-head"><strong>Block ${i+1}</strong><select data-v361-block-type>${Object.keys(V32_BLOCK_ORDER).map(type=>`<option value="${type}" ${type===b.block_type?"selected":""}>${escapeHtml(v32BlockLabel(type))}</option>`).join("")}</select></div>
    <label>Title<input data-v361-block-title value="${escapeHtml(b.title||v32BlockLabel(b.block_type))}"></label>
    <label>Purpose<input data-v361-block-purpose value="${escapeHtml(b.purpose||"")}" placeholder="Why this block is here"></label>
    <label>Coach cues<input data-v361-block-cues value="${escapeHtml(b.cues||"")}" placeholder="Short delivery cues"></label>
    <label>Complete block text<textarea data-v361-block-text class="large-textarea">${escapeHtml(b.raw_text||v32BlockItemsText(b.items))}</textarea></label>
    <label class="v361-keep-together"><input type="checkbox" data-v361-keep-together ${b.keep_together!==false?"checked":""}> Keep this block together</label>
    <div class="button-row"><button type="button" class="secondary" data-v361-merge-previous ${i===0?"disabled":""}>Merge with previous</button><button type="button" class="secondary" data-v361-split-blanks>Split at blank lines</button></div>
  </article>`).join("")}</div>
  <details class="v35-original-session"><summary>Original pasted session</summary><pre class="import-workout-preview">${escapeHtml(d.workout||"")}</pre></details>`;
  host.querySelectorAll("[data-v361-draft-block]").forEach(card=>{
    const index=Number(card.dataset.v361DraftBlock),block=v35DraftBlocks[index];
    card.querySelector("[data-v361-block-type]").onchange=e=>{block.block_type=e.target.value};
    card.querySelector("[data-v361-block-title]").oninput=e=>block.title=e.target.value;
    card.querySelector("[data-v361-block-purpose]").oninput=e=>block.purpose=e.target.value;
    card.querySelector("[data-v361-block-cues]").oninput=e=>block.cues=e.target.value;
    card.querySelector("[data-v361-block-text]").oninput=e=>{block.raw_text=e.target.value;block.items=v32BlockItemsFromText(e.target.value)};
    card.querySelector("[data-v361-keep-together]").onchange=e=>block.keep_together=e.target.checked;
    card.querySelector("[data-v361-merge-previous]").onclick=()=>{
      const prior=v35DraftBlocks[index-1],current=v35DraftBlocks[index];
      prior.raw_text=[prior.raw_text,current.raw_text].filter(Boolean).join("\n");
      prior.items=v32BlockItemsFromText(prior.raw_text);
      prior.purpose=[prior.purpose,current.purpose].filter(Boolean).join(" · ");
      prior.cues=[prior.cues,current.cues].filter(Boolean).join(" · ");
      prior.keep_together=prior.keep_together!==false&&current.keep_together!==false;
      v35DraftBlocks.splice(index,1);v361RenderEditableDraftBlocks();
    };
    card.querySelector("[data-v361-split-blanks]").onclick=()=>{
      if(block.keep_together!==false){v33SetImportMessage("Untick ‘Keep this block together’ before splitting it.","warning");return}
      const parts=card.querySelector("[data-v361-block-text]").value.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
      if(parts.length<2){v33SetImportMessage("Add a blank line where this block should split, then press Split at blank lines.","warning");return}
      const replacements=parts.map((part,n)=>v361NormaliseDraftBlock({block_type:n?"main_set":block.block_type,title:n?`${block.title} ${n+1}`:block.title,raw_text:part,items:v32BlockItemsFromText(part),purpose:block.purpose,cues:block.cues,keep_together:true},index+n));
      v35DraftBlocks.splice(index,1,...replacements);v361RenderEditableDraftBlocks();
    };
  });
}

renderSessionImportPreview=function(){
  const box=$("sessionImportPreview");if(!box)return;
  if(!importedSessionDraft){box.className="session-import-preview help";box.textContent="Nothing previewed yet.";return}
  if(v361FreshParsedDraft){
    $("quickSessionDate").value=importedSessionDraft.session_date||localIsoDate(new Date());
    $("quickSessionPart").value=importedSessionDraft.day_part||v33PartNow();
    $("quickSessionTitle").value=importedSessionDraft.title||"";
    $("quickSessionSquads").value=(importedSessionDraft.squads||[]).join(", ");
    $("quickSessionLanes").value=importedSessionDraft.lane_count||selectedSession()?.lane_count||6;
    $("quickSessionCourse").value=importedSessionDraft.pool_course||selectedSession()?.pool_course||"SCM";
  }
  importedSessionDraft=v33ApplyQuickFields(importedSessionDraft);
  const source=String(importedSessionDraft.workout||"").trim();
  if(v361FreshParsedDraft||source!==v361DraftSourceText||!v35DraftBlocks.length){
    v35DraftBlocks=v36ParseWorkoutBlocks(v33WorkoutForBlocks(source)).map(v361NormaliseDraftBlock);
    v361DraftSourceText=source;
  }
  v361FreshParsedDraft=false;
  v361RenderEditableDraftBlocks();
};

v33ReplaceImportedBlocks=function(session){
  const existing=(appState.session_blocks||[]).filter(block=>block.session_id===session.id&&["phone_v33","phone_v35","phone_v361"].includes(block.source_import));
  for(const block of existing){appState.session_blocks=appState.session_blocks.filter(row=>row.id!==block.id);queueDelete("session_blocks",block.id)}
  const parsed=(v35DraftBlocks.length?v35DraftBlocks:v36ParseWorkoutBlocks(v33WorkoutForBlocks(session.workout||""))).map(v361NormaliseDraftBlock);
  parsed.forEach((block,index)=>{
    const record={
      id:uid("block"),session_id:session.id,block_type:block.block_type,title:block.title||v32BlockLabel(block.block_type),
      sort_order:index+1,items:block.items?.length?block.items:v32BlockItemsFromText(block.raw_text||""),
      purpose:block.purpose||"",cues:block.cues||"",keep_together:block.keep_together!==false,
      notes:"Built from v3.6.1 verified phone session import",status:"planned",source_import:"phone_v361",updated_at:nowIso()
    };
    upsertLocal("session_blocks",record);queueRecord("session_blocks",record.id);
  });
  return parsed.length;
};

function v361RenderDeckBlocks(){
  const host=$("deckBlockList"),session=selectedSession();if(!host||!session)return;
  let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));
  let active=v35ActiveBlockId(session.id);
  const keys=blocks.map((block,index)=>block.id||`fallback-${index}`);
  if(!active||!keys.includes(active)){active=keys[0]||"";if(active)v35SetActiveBlock(session.id,active)}
  host.innerHTML=blocks.length?blocks.map((block,index)=>{
    const key=keys[index],open=key===active;
    return `<details class="v35-deck-block" data-v35-deck-block="${escapeHtml(key)}" ${open?"open":""}><summary><div><span>${escapeHtml(v32BlockLabel(block.block_type))}</span><strong>${escapeHtml(block.title||v32BlockLabel(block.block_type))}</strong></div><b>${v35BlockDistance(block).toLocaleString()}m</b></summary><div class="v35-deck-block-body">${block.purpose?`<div class="v361-block-purpose"><b>Purpose</b><span>${escapeHtml(block.purpose)}</span></div>`:""}${block.cues?`<div class="v361-block-purpose"><b>Cues</b><span>${escapeHtml(block.cues)}</span></div>`:""}<pre>${escapeHtml(v32BlockItemsText(block.items)||block.raw_text||"No set lines entered.")}</pre>${block.notes&&!/^Built from v3\.6\.1 verified/i.test(block.notes)?`<div class="help"><strong>Coach note:</strong> ${escapeHtml(block.notes)}</div>`:""}<div class="button-row"><button type="button" data-v361-run-block="${index}">Run this block</button><button type="button" class="secondary" data-v361-show-adaptations>Modified versions</button><button type="button" class="secondary" data-v361-edit-session>Edit session</button></div></div></details>`;
  }).join(""):'<div class="warning-box">No session blocks are available. Open Edit session and check the pasted session.</div>';
  host.querySelectorAll(".v35-deck-block").forEach(detail=>{
    detail.ontoggle=()=>{
      if(!detail.isConnected||!host.contains(detail)||!detail.open)return;
      host.querySelectorAll(".v35-deck-block").forEach(other=>{if(other!==detail&&other.isConnected)other.open=false});
      v35SetActiveBlock(session.id,detail.dataset.v35DeckBlock);
    };
  });
  host.querySelectorAll("[data-v361-run-block]").forEach(button=>button.onclick=()=>v35RunBlockFromFallback(blocks[Number(button.dataset.v361RunBlock)]));
  host.querySelectorAll("[data-v361-show-adaptations]").forEach(button=>button.onclick=()=>$("adaptationPanel")?.scrollIntoView({behavior:"smooth",block:"start"}));
  host.querySelectorAll("[data-v361-edit-session]").forEach(button=>button.onclick=v33EditCurrentSession);
}
v35RenderDeckBlocks=v361RenderDeckBlocks;

function v361BindImportSaveButtons(){
  for(const [id,openNow] of [["saveImportedSessionBtn",false],["runImportedSessionBtn",true]]){
    const old=$(id);if(!old)continue;
    const fresh=old.cloneNode(true);old.replaceWith(fresh);
    fresh.addEventListener("click",async()=>{
      await saveImportedSession(openNow);
      if(openNow){
        renderAll();
        requestAnimationFrame(()=>{v361RenderDeckBlocks();$("deckBlockList")?.scrollIntoView({block:"start"})});
      }
    });
  }
}

// Preserve the new block fields when sending session_blocks to Supabase.
const v361PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  const row=v361PriorCloudRow(table,record);
  if(table==="session_blocks")return {...row,purpose:record.purpose||"",cues:record.cues||"",keep_together:record.keep_together!==false};
  return row;
};

function v361InjectStyles(){
  if($("v361Styles"))return;const style=document.createElement("style");style.id="v361Styles";style.textContent=`
    .v361-keep-together{display:flex;gap:.55rem;align-items:center;font-weight:700;margin:.45rem 0}
    .v361-keep-together input{width:auto;margin:0}
    .v361-block-purpose{display:grid;grid-template-columns:5rem 1fr;gap:.5rem;padding:.55rem .7rem;border-radius:.65rem;background:rgba(20,77,105,.08);margin-bottom:.55rem}
    .v361-block-purpose b{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}
    .v35-block-review-card label{display:grid;gap:.25rem;margin-top:.45rem}
  `;document.head.appendChild(style);
}

v361InjectStyles();v361BindImportSaveButtons();renderAll();

// Final cache/version label and a post-load Deck pass after older queued <details>
// toggle events have drained.
document.title="McLay Swimming OS — v3.6.1 Verified";
const v361Subtitle=document.querySelector(".header-subtitle");if(v361Subtitle)v361Subtitle.textContent="Version 3.6.1 · plan → coach → capture → adapt → review → progress";
requestAnimationFrame(()=>requestAnimationFrame(()=>v361RenderDeckBlocks()));

// =============================================================================
// v3.6.1 FINAL WORKFLOW COMPLETION
// Line-level timing, edit-in-place return, explicit "What changed?", and safe
// evidence prefill for Finish Session.
// =============================================================================

let v361ReturnBlockIndex=null;

function v361RunSingleLine(block,index){
  const items=v34Array(block.items);if(!items[index])return;
  v32LiveBlockState={source:"session",id:block.id||"",title:block.title||v32BlockLabel(block.block_type),items,index};
  showView("times");v32LoadLiveLine(items[index]);
}
function v361OpenEditLayer(){
  const session=selectedSession();if(!session)return v33OpenSessionComposer();
  const blocks=v32SessionBlocks(session.id);
  const keys=blocks.map((block,index)=>block.id||`fallback-${index}`);
  const active=v35ActiveBlockId(session.id);v361ReturnBlockIndex=Math.max(0,keys.indexOf(active));
  importedSessionDraft=clone(session);v361FreshParsedDraft=false;v361DraftSourceText=String(session.workout||"").trim();
  v35DraftBlocks=(blocks.length?blocks:v36ParseWorkoutBlocks(session.workout||"")).map((block,index)=>v361NormaliseDraftBlock({...clone(block),raw_text:v32BlockItemsText(block.items)||block.raw_text||""},index));
  $("sessionPasteInput").value=session.workout||"";
  $("quickSessionDate").value=session.session_date||localIsoDate(new Date());
  $("quickSessionPart").value=session.day_part||"AM";
  $("quickSessionTitle").value=session.title||"";
  $("quickSessionSquads").value=sessionSquads(session).join(", ");
  $("quickSessionLanes").value=session.lane_count||6;
  $("quickSessionCourse").value=session.pool_course||"SCM";
  $("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;
  $("sessionImportDetails").open=true;showView("deck");v361RenderEditableDraftBlocks();
  v33SetImportMessage("Editing the selected session. Save & Use Now returns to the same coaching block.","good");
  setTimeout(()=>$("sessionImportDetails")?.scrollIntoView({block:"start",behavior:"smooth"}),30);
}
v33EditCurrentSession=v361OpenEditLayer;

function v361RenderDeckBlocksFinal(){
  const host=$("deckBlockList"),session=selectedSession();if(!host||!session)return;
  let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));
  let active=v35ActiveBlockId(session.id),keys=blocks.map((block,index)=>block.id||`fallback-${index}`);
  if(!active||!keys.includes(active)){active=keys[0]||"";if(active)v35SetActiveBlock(session.id,active)}
  host.innerHTML=blocks.length?blocks.map((block,index)=>{
    const key=keys[index],items=v34Array(block.items),open=key===active;
    const lines=items.length?items.map((item,lineIndex)=>`<div class="v361-deck-line"><span>${escapeHtml(item.raw||[item.reps?`${item.reps} x ${item.distance}`:"",item.cycle?`on ${item.cycle}`:"",item.stroke,item.instruction].filter(Boolean).join(" "))}</span><button type="button" class="secondary" data-v361-run-line="${index}|${lineIndex}">Run</button></div>`).join(""):`<pre>${escapeHtml(block.raw_text||"No set lines entered.")}</pre>`;
    return `<details class="v35-deck-block" data-v35-deck-block="${escapeHtml(key)}" ${open?"open":""}><summary><div><span>${escapeHtml(v32BlockLabel(block.block_type))}</span><strong>${escapeHtml(block.title||v32BlockLabel(block.block_type))}</strong></div><b>${v35BlockDistance(block).toLocaleString()}m</b></summary><div class="v35-deck-block-body">${block.purpose?`<div class="v361-block-purpose"><b>Purpose</b><span>${escapeHtml(block.purpose)}</span></div>`:""}${block.cues?`<div class="v361-block-purpose"><b>Cues</b><span>${escapeHtml(block.cues)}</span></div>`:""}<div class="v361-deck-lines">${lines}</div>${block.notes&&!/^Built from v3\.6\.1 verified/i.test(block.notes)?`<div class="help"><strong>Coach note:</strong> ${escapeHtml(block.notes)}</div>`:""}<div class="button-row"><button type="button" data-v361-run-whole-block="${index}">Run whole block</button><button type="button" class="secondary" data-v361-show-adaptations>Modified versions</button><button type="button" class="secondary" data-v361-edit-session>Edit / replace session</button></div></div></details>`;
  }).join(""):'<div class="warning-box">No session blocks are available. Open Edit session and check the pasted session.</div>';
  host.querySelectorAll(".v35-deck-block").forEach(detail=>detail.ontoggle=()=>{if(!detail.isConnected||!host.contains(detail)||!detail.open)return;host.querySelectorAll(".v35-deck-block").forEach(other=>{if(other!==detail&&other.isConnected)other.open=false});v35SetActiveBlock(session.id,detail.dataset.v35DeckBlock)});
  host.querySelectorAll("[data-v361-run-line]").forEach(button=>button.onclick=()=>{const [blockIndex,lineIndex]=button.dataset.v361RunLine.split("|").map(Number);v361RunSingleLine(blocks[blockIndex],lineIndex)});
  host.querySelectorAll("[data-v361-run-whole-block]").forEach(button=>button.onclick=()=>v35RunBlockFromFallback(blocks[Number(button.dataset.v361RunWholeBlock)]));
  host.querySelectorAll("[data-v361-show-adaptations]").forEach(button=>button.onclick=()=>$("adaptationPanel")?.scrollIntoView({behavior:"smooth",block:"start"}));
  host.querySelectorAll("[data-v361-edit-session]").forEach(button=>button.onclick=v361OpenEditLayer);
}
v35RenderDeckBlocks=v361RenderDeckBlocksFinal;

function v361BindImportSaveButtonsFinal(){
  for(const [id,openNow] of [["saveImportedSessionBtn",false],["runImportedSessionBtn",true]]){
    const old=$(id);if(!old)continue;const fresh=old.cloneNode(true);old.replaceWith(fresh);
    fresh.addEventListener("click",async()=>{
      const returnIndex=v361ReturnBlockIndex;
      await saveImportedSession(openNow);
      if(openNow){
        const session=selectedSession(),blocks=v32SessionBlocks(session?.id);
        if(session&&returnIndex!==null&&blocks.length){const target=blocks[Math.min(returnIndex,blocks.length-1)];if(target)v35SetActiveBlock(session.id,target.id)}
        v361ReturnBlockIndex=null;renderAll();requestAnimationFrame(()=>v361RenderDeckBlocksFinal());
      }
    });
  }
}

function v361InjectWhatChanged(){
  const grid=document.querySelector("#finish .review-grid");if(!grid||$("reviewWhatChanged"))return;
  grid.insertAdjacentHTML("afterbegin",'<div><label>What changed from the plan?</label><button type="button" class="secondary v35-question-mic" data-finish-voice-field="reviewWhatChanged">🎙 Answer by voice</button><textarea id="reviewWhatChanged"></textarea></div>');
  grid.querySelector('[data-finish-voice-field="reviewWhatChanged"]')?.addEventListener("click",()=>v35StartFinishVoice("reviewWhatChanged"));
}
const v361PriorFinishPrompt=v35FinishPrompt;
v35FinishPrompt=function(target){if(target==="reviewWhatChanged")return "What changed from the planned session?";return v361PriorFinishPrompt(target)};
const v361PriorApplyFinishTranscript=v35ApplyFinishTranscript;
v35ApplyFinishTranscript=function(tr){v361PriorApplyFinishTranscript(tr);const value=tr?.structured_data?.finish_session?.what_changed;if(value&&$("reviewWhatChanged"))$("reviewWhatChanged").value=v34AppendText($("reviewWhatChanged").value,value)};

function v361ExplicitFinishPrefill(session,review){
  if(!session||review?.completed_at)return;
  const captures=(appState.captures||[]).filter(c=>c.session_id===session.id&&c.text_content),athleteNotes=captures.filter(c=>c.athlete_id).map(c=>`${appState.athletes.find(a=>a.id===c.athlete_id)?.full_name||"Swimmer"}: ${c.text_content}`).join("\n"),changes=captures.filter(c=>/^\[Session change\]/i.test(c.text_content)).map(c=>c.text_content.replace(/^\[Session change\]\s*/i,"")).join("\n"),timed=(appState.timed_sets||[]).filter(t=>t.session_id===session.id).map(t=>`${appState.athletes.find(a=>a.id===t.athlete_id)?.full_name||"Swimmer"}: ${t.set_label||`${t.distance} ${t.stroke}`} · best ${formatSeconds(t.best)} · avg ${formatSeconds(t.average)}`).join("\n"),modified=(appState.attendance||[]).filter(a=>a.session_id===session.id&&a.status==="modified").map(a=>appState.athletes.find(x=>x.id===a.athlete_id)?.full_name).filter(Boolean);
  if($("reviewWhatChanged")&&!$("reviewWhatChanged").value&&changes)$("reviewWhatChanged").value=changes;
  if($("reviewAthletes")&&!$("reviewAthletes").value&&athleteNotes)$("reviewAthletes").value=athleteNotes;
  if($("finishRaceEvidence")&&!$("finishRaceEvidence").value&&timed)$("finishRaceEvidence").value=timed;
  if($("finishModifications")&&!$("finishModifications").value&&modified.length)$("finishModifications").value=`Modified session: ${modified.join(", ")}`;
}
const v361PriorRenderReviewFinal=renderReview;
renderReview=function(){v361PriorRenderReviewFinal();const session=selectedSession(),review=sessionReview(session?.id)||{};if($("reviewWhatChanged"))$("reviewWhatChanged").value=review.what_changed||"";v361ExplicitFinishPrefill(session,review)};

async function v361SaveFinishSessionFinal(){
  const session=selectedSession();if(!session)return;const existing=sessionReview(session.id);
  const record={id:existing?.id||`review-${session.id}`,session_id:session.id,what_changed:$("reviewWhatChanged")?.value.trim()||"",went_well:$("reviewWentWell").value.trim(),reinforce:$("reviewReinforce").value.trim(),athlete_notes:$("reviewAthletes").value.trim(),carry_forward:$("reviewCarry").value.trim(),actual_distance:Number($("finishActualDistance").value||0),actual_duration:Number($("finishActualDuration").value||0),energy_systems:parseEvidenceMap($("finishEnergySystems").value),training_modes:parseEvidenceMap($("finishTrainingModes").value),stroke_exposure:parseEvidenceMap($("finishStrokeExposure").value),athlete_response:$("finishAthleteResponse").value.trim(),modifications:$("finishModifications").value.trim(),race_split_evidence:$("finishRaceEvidence").value.trim(),completed_at:nowIso(),updated_at:nowIso()};
  upsertLocal("session_reviews",record);queueRecord("session_reviews",record.id);session.status="completed";session.updated_at=nowIso();queueRecord("sessions",session.id);saveState(appState);await syncIfPossible();renderAll();showView("deck");updateStatus("Session completed and synced","good");
}

const v361PriorCloudRowFinal=cloudRow;
cloudRow=function(table,record){const row=v361PriorCloudRowFinal(table,record);if(table==="session_reviews")return {...row,what_changed:record.what_changed||""};return row};
const v361PriorEvidenceForSession=v36EvidenceForSession;
v36EvidenceForSession=function(session){const rows=v361PriorEvidenceForSession(session),changed=v35Text(sessionReview(session?.id)?.what_changed);return changed?[{label:"What changed",text:changed},...rows].slice(0,9):rows};

function v361BindFinishSave(){const old=$("finishSessionBtn");if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",v361SaveFinishSessionFinal)}
function v361AddFinalStyles(){const style=$("v361Styles");if(!style)return;style.textContent+=`.v361-deck-lines{display:grid;gap:.4rem;margin:.55rem 0}.v361-deck-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.55rem;align-items:center;padding:.5rem .6rem;border:1px solid rgba(18,58,91,.18);border-radius:.55rem;background:#fff}.v361-deck-line button{min-height:38px;padding:.4rem .7rem}`}

v361InjectWhatChanged();v361BindImportSaveButtonsFinal();v361BindFinishSave();v361AddFinalStyles();renderAll();requestAnimationFrame(()=>v361RenderDeckBlocksFinal());

// Preserve the edited block after all legacy queued toggle events complete.
function v361BindImportSaveButtonsReturnFix(){
  for(const [id,openNow] of [["saveImportedSessionBtn",false],["runImportedSessionBtn",true]]){
    const old=$(id);if(!old)continue;const fresh=old.cloneNode(true);old.replaceWith(fresh);
    fresh.addEventListener("click",async()=>{
      const returnIndex=v361ReturnBlockIndex;
      await saveImportedSession(openNow);
      if(!openNow)return;
      const session=selectedSession(),blocks=v32SessionBlocks(session?.id),target=session&&returnIndex!==null?blocks[Math.min(returnIndex,Math.max(0,blocks.length-1))]:null;
      v361ReturnBlockIndex=null;
      const restore=()=>{if(target&&selectedSession()?.id===session.id)v35SetActiveBlock(session.id,target.id);v361RenderDeckBlocksFinal()};
      restore();requestAnimationFrame(()=>requestAnimationFrame(restore));
    });
  }
}
v361BindImportSaveButtonsReturnFix();

// Use the visible open Deck block as the edit return anchor (not a stale stored id).
const v361PriorOpenEditLayer=v361OpenEditLayer;
v361OpenEditLayer=function(){
  const details=[...document.querySelectorAll('#deckBlockList .v35-deck-block')],open=details.findIndex(detail=>detail.open);
  v361PriorOpenEditLayer();
  if(open>=0)v361ReturnBlockIndex=open;
};
v33EditCurrentSession=v361OpenEditLayer;
requestAnimationFrame(()=>v361RenderDeckBlocksFinal());

// Keep desktop session edits and structured Deck blocks in step.
async function v361SaveDesktopSession(useNow=false){
  const existing=appState.sessions.find(s=>s.id===$("editSessionId").value),linkedSeason=appState.season_plans.find(s=>s.id===$("editSessionSeasonPlan")?.value),linkedWeek=appState.weekly_plans.find(w=>w.id===$("editSessionWeeklyPlan")?.value),workout=$("editSessionWorkout").value;
  const record={id:existing?.id||uid("session"),session_date:$("editSessionDate").value,day_part:$("editSessionPart").value,venue:$("editSessionVenue").value.trim(),title:$("editSessionTitle").value.trim(),squads:$("editSessionSquads").value.split(",").map(x=>x.trim()).filter(Boolean),planned_distance:Number($("editSessionDistance").value||0),primary_system:$("editSessionSystem").value.trim(),technical_focus:$("editSessionTechnical").value.trim(),season_plan_id:$("editSessionSeasonPlan")?.value||null,weekly_plan_id:$("editSessionWeeklyPlan")?.value||null,lane_count:Math.max(1,Math.min(12,Number($("editSessionLaneCount")?.value||1))),pool_course:$("editSessionPoolCourse")?.value||"SCM",season_name:linkedSeason?.name||$("editSessionSeason").value.trim(),week_start:linkedWeek?.week_start||$("editSessionWeekStart").value||null,week_phase:linkedWeek?.phase||$("editSessionWeekPhase").value.trim(),week_objective:linkedWeek?.objective||$("editSessionWeekObjective").value.trim(),week_carry_forward:linkedWeek?.carry_forward||$("editSessionWeekCarry").value.trim(),plan_cue:$("editSessionPlanCue").value.trim(),next_session_cue:$("editSessionNextCue").value.trim(),workout,sets:extractStructuredSets(workout),step_number:existing?.step_number||null,previous_session_id:existing?.previous_session_id||null,status:existing?.status||"planned",updated_at:nowIso()};
  if(!record.session_date||!record.title)return alert("Date and title are required.");
  const workoutChanged=!existing||String(existing.workout||"")!==String(workout||"");
  upsertLocal("sessions",record);queueRecord("sessions",record.id);
  if(workoutChanged||!v32SessionBlocks(record.id).length){v35DraftBlocks=v36ParseWorkoutBlocks(v33WorkoutForBlocks(workout)).map(v361NormaliseDraftBlock);v33ReplaceImportedBlocks(record)}
  if(useNow){appState.settings.selected_session_id=record.id;appState.settings.selected_squad=sessionSquads(record)[0]||""}
  saveState(appState);fillSessionEditor(record);renderAll();scheduleFastSync();
  if(useNow){showView("deck");requestAnimationFrame(()=>v361RenderDeckBlocksFinal());updateStatus("Session and blocks saved and open on Deck","good")}
  else updateStatus("Session and structured blocks saved","good");
}
for(const [id,useNow] of [["saveSessionBtn",false],["saveSessionAndUseBtn",true]]){const old=$(id);if(old){const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",()=>v361SaveDesktopSession(useNow))}}

// =============================================================================
// McLay Swimming OS v3.7 — complete coaching workflow release.
// Adds ID-owned adaptation profiles, explicit learning scopes, Main/Modified/
// Individual deck modes, deterministic stimulus protection, and durable weekly
// reports after Saturday or a weekend meet. All new data syncs through Supabase.
// =============================================================================
const V37_VERSION="3.7";
const V37_BUILD="20260726-complete";

for(const key of ["athlete_adaptation_profiles","weekly_reports"]){
  if(!Array.isArray(appState[key]))appState[key]=[];
  if(!CLOUD_TABLES.includes(key))CLOUD_TABLES.push(key);
  if(typeof V331_OPTIONAL_CLOUD_TABLES!=="undefined")V331_OPTIONAL_CLOUD_TABLES.add(key);
}
if(!appState.settings.v37)appState.settings.v37={adaptation_mode:"individual",group_ratio:"0.6666667",weekly_report_id:""};
saveState(appState);

function v37DefaultProfileSeed(athlete){
  const key=v35NameKey(athlete?.full_name),map={
    "charlotte murphy":{ratio:.5,label:"½ session",cycleMultiplier:1.15},
    "conor fischer":{ratio:.5,label:"½ session",cycleMultiplier:1.15},
    "mckenzie drage":{ratio:2/3,label:"⅔ session · independent rest",cycleMultiplier:1.5},
    "amber proudfoot":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.2},
    "matthew kofoed":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.2},
    "ruby stace":{ratio:2/3,label:"⅔ session",cycleMultiplier:1.2}
  };
  return map[key]||null;
}
function v37ProfileRecord(athlete){return (appState.athlete_adaptation_profiles||[]).find(p=>p.athlete_id===athlete?.id&&p.active!==false)||null}
function v37ProfileForAthlete(athlete){
  if(!athlete)return null;const stored=v37ProfileRecord(athlete),fallback=v37DefaultProfileSeed(athlete);if(!stored&&!fallback)return null;
  const ratio=Number(stored?.default_volume_ratio||fallback?.ratio||1),cycleMultiplier=Number(stored?.default_cycle_multiplier||fallback?.cycleMultiplier||1);
  return {ratio,cycleMultiplier,label:stored?.profile_label||fallback?.label||`${Math.round(ratio*100)}% session`,profile:stored};
}
function v37EnsureLocalProfiles(){
  const now=nowIso();
  for(const athlete of v36ActiveAthletes()){
    if(v37ProfileRecord(athlete))continue;const seed=v37DefaultProfileSeed(athlete);if(!seed)continue;
    appState.athlete_adaptation_profiles.push({
      id:`adapt-profile-${athlete.id}`,athlete_id:athlete.id,profile_label:seed.label,
      default_volume_ratio:seed.ratio,default_cycle_multiplier:seed.cycleMultiplier,
      rep_strategy:"Reduce repetitions first while retaining every key block.",
      distance_strategy:"Protect skill and quality distances; shorten long aerobic repetitions before short race work.",
      rest_strategy:keyIs(athlete,"mckenzie drage")?"Set send-offs independently. Fast 75s usually need 1:45–2:00; never scale the squad cycle by volume ratio.":"Preserve enough recovery to maintain the planned stimulus.",
      stroke_restrictions:"",equipment_preferences:"",underwater_limits:"",skill_emphasis:"",
      locked_rules:seed.ratio===.5?"Default main-session volume is approximately one half. Preserve theme, key skills and quality work.":"Default main-session volume is approximately two thirds. Preserve theme, key skills and quality work.",
      observed_patterns:"",current_considerations:"",successful_adaptations:"",avoid_review:"",
      active:true,created_at:now,updated_at:now
    });
  }
  saveState(appState);
}
function keyIs(athlete,name){return v35NameKey(athlete?.full_name)===name}
v37EnsureLocalProfiles();

// All generation after bootstrap is owned by the live athlete ID.
v35ProfileForAthlete=v37ProfileForAthlete;
v36DefaultProfile=v37ProfileForAthlete;
v35AdaptationAthletes=function(){return v36ActiveAthletes().filter(a=>v37ProfileForAthlete(a)).filter(a=>{const s=selectedSession();return !s||!sessionSquads(s).length||sessionSquads(s).some(sq=>squadKey(sq)===squadKey(a.squad))||/para/i.test(a.squad||"")}).sort((a,b)=>a.full_name.localeCompare(b.full_name))};

const v37PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  const row=v37PriorCloudRow(table,record),org=appState.settings.organisation_id,user=getAuth()?.user?.id;
  if(table==="athlete_adaptation_profiles")return {
    id:record.id,organisation_id:org,athlete_id:record.athlete_id,profile_label:record.profile_label||"Modified session",
    default_volume_ratio:Number(record.default_volume_ratio||1),default_cycle_multiplier:Number(record.default_cycle_multiplier||1),
    rep_strategy:record.rep_strategy||"",distance_strategy:record.distance_strategy||"",rest_strategy:record.rest_strategy||"",
    stroke_restrictions:record.stroke_restrictions||"",equipment_preferences:record.equipment_preferences||"",underwater_limits:record.underwater_limits||"",skill_emphasis:record.skill_emphasis||"",
    locked_rules:record.locked_rules||"",observed_patterns:record.observed_patterns||"",current_considerations:record.current_considerations||"",successful_adaptations:record.successful_adaptations||"",avoid_review:record.avoid_review||"",
    active:record.active!==false,created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:user
  };
  if(table==="weekly_reports")return {
    id:record.id,organisation_id:org,week_start:record.week_start,week_end:record.week_end,squad:record.squad||"All squads",title:record.title||"Weekly coaching report",
    report_text:record.report_text||"",evidence_snapshot:record.evidence_snapshot||{},generation_method:record.generation_method||"rules",coach_approved:record.coach_approved!==false,
    created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:user
  };
  return row;
};

function v37RuleApplies(record,item,block,session){
  const r=record.rule_json||record,scope=record.scope||r.learning_scope||"general";
  if(scope==="this_session"&&String(r.session_id||"")!==String(session?.id||""))return false;
  if(r.distance&&Number(r.distance)!==Number(item.distance))return false;
  if(r.block_type&&r.block_type!==block.block_type)return false;
  if(r.quality_only&&!/fast|race pace|quality|sprint|max|vo2|anaerobic|threshold/i.test(`${item.raw||""} ${item.instruction||""} ${block.purpose||""}`))return false;
  return true;
}
function v37RulesForAthlete(athlete,session=selectedSession()){return (appState.athlete_adaptation_rules||[]).filter(r=>r.athlete_id===athlete.id&&r.active!==false).filter(r=>r.scope!=="this_session"||String((r.rule_json||{}).session_id||"")===String(session?.id||"")).sort(byUpdated)}
v36RulesForAthlete=v37RulesForAthlete;

function v37AdaptSetLine(item,profile,athlete,block,rules,session){
  const applicable=rules.filter(r=>v37RuleApplies(r,item,block,session)),structured=applicable.map(r=>r.rule_json||r);let ratio=profile.ratio,cycleMultiplier=profile.cycleMultiplier;
  structured.forEach(r=>{if(Number(r.volume_ratio)>0)ratio=Number(r.volume_ratio);if(Number(r.cycle_multiplier)>0)cycleMultiplier=Number(r.cycle_multiplier)});
  let line=v35AdaptSetLine(item,{...profile,ratio,cycleMultiplier},athlete,block);
  const fixed=structured.map(r=>Number(r.cycle_seconds||r.min_cycle_seconds||0)).filter(Boolean).sort((a,b)=>b-a)[0];
  if(fixed){const cycle=v35CycleText(fixed);if(/\bon\s+\d{1,2}:\d{2}\b/.test(line))line=line.replace(/\bon\s+\d{1,2}:\d{2}\b/,`on ${cycle}`);else line=`${line} on ${cycle}`}
  const equipment=[profile.profile?.equipment_preferences,...structured.map(r=>r.equipment)].filter(Boolean).join(", ");if(equipment&&!line.toLowerCase().includes(equipment.toLowerCase()))line+=` · ${equipment}`;
  return line.replace(/\s+/g," ").trim();
}
function v37GenerateRulesVersion(athlete,session=selectedSession(),{group=false}={}){
  const profile=v37ProfileForAthlete(athlete);if(!profile||!session)return "";const rules=group?[]:v37RulesForAthlete(athlete,session),blocks=v32SessionBlocks(session.id).length?v32SessionBlocks(session.id):v36ParseWorkoutBlocks(session.workout||""),p=profile.profile||{},lines=[`${group?profile.label.toUpperCase():athlete.full_name+" — "+profile.label}`,`Purpose retained: ${[v36CleanPurpose(session.primary_system),v36CleanPurpose(session.technical_focus)].filter(Boolean).join(" · ")||session.title}`];
  for(const block of blocks){if(rules.some(r=>(r.rule_json||{}).remove_block_type===block.block_type))continue;lines.push("",String(block.title||v32BlockLabel(block.block_type)).toUpperCase());if(block.purpose)lines.push(`Purpose: ${block.purpose}`);if(block.cues)lines.push(`Cues: ${block.cues}`);for(const item of v34Array(block.items))lines.push(v37AdaptSetLine(item,profile,athlete,block,rules,session))}
  const considerations=[p.locked_rules,p.current_considerations,p.avoid_review].filter(Boolean);if(considerations.length)lines.push("","COACH CHECK",...considerations.map(x=>`- ${x}`));
  if(rules.length)lines.push("","APPROVED RULES USED",...rules.map(r=>`- ${r.rule_text}`));
  return lines.join("\n");
}
v36GenerateAdaptationRules=v37GenerateRulesVersion;

function v37ExtractAdaptedDistance(text){let total=0;for(const line of String(text||"").split(/\n/)){const m=line.match(/\b(\d{1,3})\s*[x×]\s*(\d{2,4})\b/i);if(m)total+=Number(m[1])*Number(m[2])}return total}
function v37StimulusWarnings(athlete,text,session=selectedSession()){
  if(!athlete||!session||!text)return ["No modified session is available to check."];const profile=v37ProfileForAthlete(athlete),main=`${session.primary_system||""} ${session.technical_focus||""} ${session.workout||""}`.toLowerCase(),adapt=String(text).toLowerCase(),warnings=[],target=Number(estimateDistance(session.workout||"")||session.planned_distance||0)*Number(profile?.ratio||1),actual=v37ExtractAdaptedDistance(text);
  const quality=/threshold|race pace|anaerobic|vo2|sprint|fast|max/.test(main),skill=/skill|alignment|body position|underwater|turn|start/.test(main);
  if(quality&&!/threshold|race pace|anaerobic|vo2|sprint|fast|max|quality/.test(adapt))warnings.push("The main quality stimulus is not clearly visible in the modified version.");
  if(skill&&!/skill|alignment|body position|underwater|turn|start|cue/.test(adapt))warnings.push("The main technical/skill thread may have been lost.");
  if(actual&&target&&Math.abs(actual-target)>Math.max(200,target*.25))warnings.push(`Volume is ${actual.toLocaleString()}m; the profile target is roughly ${Math.round(target/25)*25}m. Check that the change is deliberate.`);
  if(keyIs(athlete,"mckenzie drage")&&/75[^\n]*(?:on\s+1:1[0-9]|on\s+1:2[0-9])/i.test(text))warnings.push("McKenzie has a fast-75 cycle below the established 1:45–2:00 range.");
  const p=v37ProfileRecord(athlete);if(p?.avoid_review&&adapt.includes(String(p.avoid_review).toLowerCase()))warnings.push(`Profile avoid/review note may apply: ${p.avoid_review}`);
  return warnings;
}
function v37RenderStimulusCheck(athlete,text){const host=$("v37StimulusCheck");if(!host)return;const warnings=v37StimulusWarnings(athlete,text);host.className=`v37-stimulus ${warnings.length?"warning":"good"}`;host.innerHTML=warnings.length?`<strong>Stimulus check — review</strong>${warnings.map(w=>`<span>${escapeHtml(w)}</span>`).join("")}`:`<strong>Stimulus check passed</strong><span>The volume, quality language and technical thread remain consistent with the main session.</span>`}

let v37AdaptationMode=appState.settings.v37.adaptation_mode||"individual";
function v37MainSessionText(session=selectedSession()){const blocks=v32SessionBlocks(session?.id);return blocks.length?blocks.map(b=>[String(b.title||v32BlockLabel(b.block_type)).toUpperCase(),b.purpose?`Purpose: ${b.purpose}`:"",b.cues?`Cues: ${b.cues}`:"",v32BlockItemsText(b.items)||b.raw_text||""].filter(Boolean).join("\n")).join("\n\n"):session?.workout||"No session loaded."}
function v37ModifiedGroupText(){const athletes=v35AdaptationAthletes(),groups=new Map();for(const a of athletes){const p=v37ProfileForAthlete(a),key=String(Math.round(p.ratio*1000));if(!groups.has(key))groups.set(key,{profile:p,athletes:[]});groups.get(key).athletes.push(a)}const out=[];for(const {profile,athletes:list} of [...groups.values()].sort((a,b)=>a.profile.ratio-b.profile.ratio)){out.push(`${profile.label.toUpperCase()} GROUP — ${list.map(a=>a.full_name).join(", ")}`);out.push(v37GenerateRulesVersion(list[0],selectedSession(),{group:true}).split("\n").slice(1).join("\n"),"")}return out.join("\n")}

function v37RenderProfileEditor(athlete){const host=$("v37ProfileEditor");if(!host||!athlete)return;const p=v37ProfileRecord(athlete)||{};host.innerHTML=`<details><summary><strong>${escapeHtml(athlete.full_name)} adaptation profile</strong><span>ID-owned rules and coaching memory</span></summary><div class="v37-profile-grid"><label>Profile label<input id="v37ProfileLabel" value="${escapeHtml(p.profile_label||"")}"></label><label>Default volume ratio<input id="v37ProfileRatio" type="number" min="0.1" max="1.5" step="0.01" value="${Number(p.default_volume_ratio||1)}"></label><label>Cycle multiplier<input id="v37ProfileCycle" type="number" min="0.5" max="3" step="0.05" value="${Number(p.default_cycle_multiplier||1)}"></label></div><label>Repetition strategy<textarea id="v37RepStrategy">${escapeHtml(p.rep_strategy||"")}</textarea></label><label>Distance strategy<textarea id="v37DistanceStrategy">${escapeHtml(p.distance_strategy||"")}</textarea></label><label>Rest / send-off strategy<textarea id="v37RestStrategy">${escapeHtml(p.rest_strategy||"")}</textarea></label><div class="v37-profile-sections"><label><b>Locked rules</b><textarea id="v37LockedRules">${escapeHtml(p.locked_rules||"")}</textarea></label><label><b>Observed patterns</b><textarea id="v37ObservedPatterns">${escapeHtml(p.observed_patterns||"")}</textarea></label><label><b>Current considerations</b><textarea id="v37CurrentConsiderations">${escapeHtml(p.current_considerations||"")}</textarea></label><label><b>Successful adaptations</b><textarea id="v37SuccessfulAdaptations">${escapeHtml(p.successful_adaptations||"")}</textarea></label><label><b>Avoid / review</b><textarea id="v37AvoidReview">${escapeHtml(p.avoid_review||"")}</textarea></label></div><div class="v37-profile-grid"><label>Stroke restrictions<input id="v37StrokeRestrictions" value="${escapeHtml(p.stroke_restrictions||"")}"></label><label>Equipment preferences<input id="v37EquipmentPreferences" value="${escapeHtml(p.equipment_preferences||"")}"></label><label>Underwater limits<input id="v37UnderwaterLimits" value="${escapeHtml(p.underwater_limits||"")}"></label><label>Skill emphasis<input id="v37SkillEmphasis" value="${escapeHtml(p.skill_emphasis||"")}"></label></div><button id="v37SaveProfileBtn" type="button">Save athlete profile</button></details>`;$("v37SaveProfileBtn").onclick=()=>v37SaveProfile(athlete)}
async function v37SaveProfile(athlete){let p=v37ProfileRecord(athlete);if(!p){p={id:`adapt-profile-${athlete.id}`,athlete_id:athlete.id,created_at:nowIso(),active:true};appState.athlete_adaptation_profiles.push(p)}Object.assign(p,{profile_label:$("v37ProfileLabel").value.trim(),default_volume_ratio:Number($("v37ProfileRatio").value)||1,default_cycle_multiplier:Number($("v37ProfileCycle").value)||1,rep_strategy:$("v37RepStrategy").value.trim(),distance_strategy:$("v37DistanceStrategy").value.trim(),rest_strategy:$("v37RestStrategy").value.trim(),locked_rules:$("v37LockedRules").value.trim(),observed_patterns:$("v37ObservedPatterns").value.trim(),current_considerations:$("v37CurrentConsiderations").value.trim(),successful_adaptations:$("v37SuccessfulAdaptations").value.trim(),avoid_review:$("v37AvoidReview").value.trim(),stroke_restrictions:$("v37StrokeRestrictions").value.trim(),equipment_preferences:$("v37EquipmentPreferences").value.trim(),underwater_limits:$("v37UnderwaterLimits").value.trim(),skill_emphasis:$("v37SkillEmphasis").value.trim(),updated_at:nowIso()});queueRecord("athlete_adaptation_profiles",p.id);saveState(appState);await syncIfPossible();v35RenderAdaptationPanel();updateStatus(`${athlete.full_name} adaptation profile saved`,`good`)}

function v37RenderAdaptationPanel(){
  const panel=$("adaptationPanel"),tabs=$("adaptationAthleteTabs"),text=$("adaptationText"),session=selectedSession();if(!panel||!tabs||!text||!session)return;const athletes=v35AdaptationAthletes();
  if(!athletes.length){tabs.innerHTML='<div class="help">No active modified-session profiles match this session.</div>';text.value="";return}
  if(!athletes.some(a=>a.id===v35AdaptationAthleteId))v35AdaptationAthleteId=athletes[0].id;const athlete=athletes.find(a=>a.id===v35AdaptationAthleteId);
  const modeHost=$("v37AdaptationModes");if(modeHost)modeHost.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.v37Mode===v37AdaptationMode));
  tabs.hidden=v37AdaptationMode!=="individual";$("v37ProfileEditor").hidden=v37AdaptationMode!=="individual";$("v37LearningArea").hidden=v37AdaptationMode!=="individual";
  if(v37AdaptationMode==="main"){text.value=v37MainSessionText(session);text.readOnly=true;$("adaptationStatus").textContent="Main squad source session — this is never rewritten by adaptation learning."}
  else if(v37AdaptationMode==="group"){text.value=v37ModifiedGroupText();text.readOnly=false;$("adaptationStatus").textContent="Modified group view — shared ratio versions for poolside delivery."}
  else{
    text.readOnly=false;tabs.innerHTML=athletes.map(a=>`<button type="button" data-v35-adapt-athlete="${escapeHtml(a.id)}" class="${a.id===v35AdaptationAthleteId?"active":""}">${escapeHtml(a.full_name.split(" ")[0])} · ${escapeHtml(v37ProfileForAthlete(a).label)}</button>`).join("");tabs.querySelectorAll("[data-v35-adapt-athlete]").forEach(button=>button.onclick=()=>{v35AdaptationAthleteId=button.dataset.v35AdaptAthlete;v37RenderAdaptationPanel()});const saved=v36SavedAdaptation(athlete.id,session.id);if(!v36AdaptationDirty||v36AdaptationViewKey!==`${session.id}|${athlete.id}`)text.value=saved?saved.adapted_text:v37GenerateRulesVersion(athlete,session);$("adaptationStatus").textContent=saved?`Saved to Supabase coaching data · ${new Date(saved.updated_at||saved.created_at).toLocaleString("en-NZ")}`:"Rules-based individual draft ready. AI regenerate can use approved evidence.";v37RenderProfileEditor(athlete);
  }
  v37RenderStimulusCheck(athlete,text.value);text.oninput=()=>{v36AdaptationDirty=true;v36AdaptationViewKey=`${session.id}|${athlete.id}`;if(v37AdaptationMode==="individual")v37RenderStimulusCheck(athlete,text.value)};
  const ruleHost=$("v36AdaptationRules");if(ruleHost&&athlete){ruleHost.innerHTML=v37RulesForAthlete(athlete,session).map(r=>`<div class="v36-rule-row"><div><strong>${escapeHtml(v37ScopeLabel(r.scope))}</strong><span>${escapeHtml(r.rule_text)}</span></div><button type="button" class="secondary" data-v36-delete-rule="${escapeHtml(r.id)}">Remove</button></div>`).join("")||'<div class="help">No extra approved rules yet.</div>';ruleHost.querySelectorAll("[data-v36-delete-rule]").forEach(b=>b.onclick=()=>v36DeleteRule(b.dataset.v36DeleteRule))}
}
v35RenderAdaptationPanel=v37RenderAdaptationPanel;
function v37ScopeLabel(scope){return ({this_session:"This session only",similar_set:"Similar sets",all_distance:"All matching distances",general:"General profile"})[scope]||scope||"General profile"}

function v37LearningScopeStructured(scope,structured,text,athlete){const session=selectedSession(),activeBlock=[...document.querySelectorAll('#deckBlockList .v35-deck-block')].findIndex(d=>d.open),blocks=v32SessionBlocks(session?.id),block=activeBlock>=0?blocks[activeBlock]:null,out={...structured,learning_scope:scope};if(scope==="this_session")out.session_id=session?.id||"";if(scope==="similar_set"){if(!out.block_type&&block)out.block_type=block.block_type;out.similar_signature=[out.block_type||"",out.distance||"",out.quality_only?"quality":""].filter(Boolean).join("|")};if(scope==="all_distance"&&!out.distance){const m=String(text).match(/\b(25|50|75|100|150|200|300|400)s?\b/);out.distance=m?Number(m[1]):75}return out}
async function v37ApproveLearning(){
  const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId),text=$("adaptationLearningRule")?.value.trim(),scope=$("v37LearningScope")?.value||"general";if(!athlete||!text)return;
  if(scope==="dont_learn"){$("adaptationLearningRule").value="";$("adaptationStatus").textContent="Coach correction used for this edit only. No rule was learned.";return}
  let structured=v36ParseRuleLocal(text),source="coach_approved";try{const result=await v36CoachAi("parse_adaptation_rule",{athlete_name:athlete.full_name,rule_text:text,learning_scope:scope});if(result.rule_json)structured=result.rule_json;source="coach_approved_ai_structured"}catch(error){$("adaptationStatus").textContent=`Rule saved with local structure. AI parser unavailable: ${error.message}`}
  structured=v37LearningScopeStructured(scope,structured,text,athlete);const record={id:uid("adapt-rule"),athlete_id:athlete.id,scope,rule_text:text,rule_json:structured,source_type:source,active:true,created_at:nowIso(),updated_at:nowIso()};upsertLocal("athlete_adaptation_rules",record);queueRecord("athlete_adaptation_rules",record.id);
  const p=v37ProfileRecord(athlete);if(p&&scope==="general"){p.locked_rules=v34AppendText(p.locked_rules,text);p.updated_at=nowIso();queueRecord("athlete_adaptation_profiles",p.id)}
  saveState(appState);await syncIfPossible();$("adaptationLearningRule").value="";$("adaptationText").value=await v36GenerateAdaptation(athlete,{preferAi:true});v37RenderAdaptationPanel();updateStatus(`Approved ${v37ScopeLabel(scope).toLowerCase()} rule learned for ${athlete.full_name}`,"good")
}
v35ApproveLearning=v37ApproveLearning;

function v37InjectAdaptationInterface(){
  const panel=$("adaptationPanel");if(!panel||$("v37AdaptationModes"))return;panel.querySelector(".card-heading")?.insertAdjacentHTML("afterend",'<div id="v37AdaptationModes" class="v37-mode-tabs"><button type="button" data-v37-mode="main">Main</button><button type="button" data-v37-mode="group">Modified group</button><button type="button" data-v37-mode="individual" class="active">Individual</button></div><div id="v37StimulusCheck" class="v37-stimulus"></div>');
  const details=panel.querySelector("details");if(details){details.id="v37LearningArea";const old=details.querySelector("summary");if(old)old.innerHTML='<strong>Teach the app an approved rule</strong><span>Choose exactly how broadly this correction should apply</span>';details.querySelector("textarea")?.insertAdjacentHTML("beforebegin",'<label>Learning scope<select id="v37LearningScope"><option value="this_session">This session only</option><option value="similar_set">Similar threshold / quality sets</option><option value="all_distance">All matching distances (for example all 75s)</option><option value="general">General athlete profile</option><option value="dont_learn">Do not learn — this edit only</option></select></label>');details.insertAdjacentHTML("afterend",'<div id="v37ProfileEditor"></div>')}
  $("v37AdaptationModes").querySelectorAll("button").forEach(b=>b.onclick=()=>{v37AdaptationMode=b.dataset.v37Mode;appState.settings.v37.adaptation_mode=v37AdaptationMode;saveState(appState);v37RenderAdaptationPanel()});
  const approve=$("approveAdaptationLearningBtn");if(approve){const fresh=approve.cloneNode(true);approve.replaceWith(fresh);fresh.addEventListener("click",v37ApproveLearning)}
  const save=$("saveAdaptationBtn");if(save){const fresh=save.cloneNode(true);save.replaceWith(fresh);fresh.onclick=async()=>{if(v37AdaptationMode!=="individual")return updateStatus("Select Individual before saving an athlete-specific version.","error");await v35SaveAdaptation()}}
  const regen=$("regenerateAdaptationBtn");if(regen){const fresh=regen.cloneNode(true);regen.replaceWith(fresh);fresh.onclick=async()=>{if(v37AdaptationMode==="main"){v37RenderAdaptationPanel();return}if(v37AdaptationMode==="group"){$("adaptationText").value=v37ModifiedGroupText();return}const a=appState.athletes.find(x=>x.id===v35AdaptationAthleteId);if(a){$("adaptationText").value=await v36GenerateAdaptation(a,{preferAi:true});v37RenderStimulusCheck(a,$("adaptationText").value)}}}
}

// -----------------------------------------------------------------------------
// Durable weekly report: previous-week cues, session evidence, meet results and
// next-week progression are combined, editable, saveable and AI-assisted.
// -----------------------------------------------------------------------------
function v37WeekSessions(start,end,squad=""){return appState.sessions.filter(s=>s.session_date>=start&&s.session_date<=end).filter(s=>!squad||squad==="All squads"||sessionSquads(s).some(x=>squadKey(x)===squadKey(squad))).sort((a,b)=>`${a.session_date}-${a.day_part}`.localeCompare(`${b.session_date}-${b.day_part}`))}
function v37WeeklySnapshot(start,squad="All squads"){
  const bounds=weekBounds(start),sessions=v37WeekSessions(bounds.start,bounds.end,squad),reviews=sessions.map(s=>({session:s,review:sessionReview(s.id)})),week=appState.weekly_plans.find(w=>w.week_start===bounds.start)||appState.weekly_plans.find(w=>w.week_start<=bounds.start&&String(w.week_start)>=String(bounds.start)),season=week?appState.season_plans.find(s=>s.id===week.season_plan_id):null,ids=new Set(sessions.map(s=>s.id)),attendance=appState.attendance.filter(a=>ids.has(a.session_id)),captures=appState.captures.filter(c=>ids.has(c.session_id)&&c.text_content&&!/^Finish Session voice/.test(c.text_content)),timed=appState.timed_sets.filter(t=>ids.has(t.session_id)),results=(appState.coach_results||[]).filter(r=>r.result_date>=bounds.start&&r.result_date<=bounds.end);
  return {bounds,squad,sessions,reviews,week,season,attendance,captures,timed,results};
}
function v37LocalWeeklyReport(snapshot){
  const {bounds,squad,sessions,reviews,week,season,attendance,captures,timed,results}=snapshot,completed=sessions.filter(s=>s.status==="completed"||sessionReview(s.id)?.completed_at),planned=sessions.reduce((n,s)=>n+Number(s.planned_distance||0),0),actual=reviews.reduce((n,x)=>n+Number(x.review?.actual_distance||0),0),here=attendance.filter(a=>["present","modified"].includes(a.status)).length,changed=reviews.map(x=>x.review?.what_changed).filter(Boolean),worked=reviews.map(x=>x.review?.went_well).filter(Boolean),reinforce=reviews.map(x=>x.review?.reinforce).filter(Boolean),carry=reviews.map(x=>x.review?.carry_forward).filter(Boolean),athleteNotes=reviews.map(x=>x.review?.athlete_notes).filter(Boolean),mods=reviews.map(x=>x.review?.modifications).filter(Boolean);
  const lines=[`WEEKLY COACHING REPORT · ${formatDate(bounds.start)}–${formatDate(bounds.end)} · ${squad||"All squads"}`,"",`Season / phase: ${season?.name||"Not linked"}${week?.phase?` · ${week.phase}`:""}`,`Weekly objective: ${week?.objective||"Not entered"}`,`Carry-in: ${week?.carry_forward||"No formal carry-in entered"}`,"",`LOAD & DELIVERY`,`${completed.length}/${sessions.length} sessions completed · ${planned.toLocaleString()}m planned · ${actual.toLocaleString()}m recorded actual · ${here}/${attendance.length||0} attendance marks here/modified.`,...sessions.map(s=>{const r=sessionReview(s.id);return `- ${sessionLabel(s)} · ${s.title}: ${Number(s.planned_distance||0).toLocaleString()}m plan / ${Number(r?.actual_distance||0).toLocaleString()}m actual${r?.what_changed?` · changed: ${r.what_changed}`:""}`}),"",`WHAT DEVELOPED`,...(worked.length?worked.map(x=>`- ${x}`):["- No completed-session success notes recorded."]),"",`WHAT NEEDS REINFORCING`,...(reinforce.length?reinforce.map(x=>`- ${x}`):["- No reinforcement notes recorded."]),"",`ATHLETE / ADAPTATION EVIDENCE`,...(athleteNotes.length?athleteNotes.map(x=>`- ${x}`):[]),...(mods.length?mods.map(x=>`- ${x}`):[]),...(captures.slice(0,8).map(c=>`- ${appState.athletes.find(a=>a.id===c.athlete_id)?.full_name||"Group"}: ${c.text_content}`)),...(timed.slice(0,8).map(t=>`- ${appState.athletes.find(a=>a.id===t.athlete_id)?.full_name||"Swimmer"}: ${t.set_label||`${t.distance} ${t.stroke}`} · best ${formatSeconds(t.best)} · avg ${formatSeconds(t.average)}`)),"",`MEET / RESULT EVIDENCE`,...(results.length?results.slice(0,15).map(r=>`- ${appState.athletes.find(a=>a.id===r.athlete_id)?.full_name||r.swimmer_name||"Swimmer"}: ${r.distance} ${r.stroke} ${r.result_time_text||formatSeconds(r.result_seconds)} · ${r.meet_name||"Meet"}`):["- No imported meet results dated within this week."]),"",`PROGRESSION INTO NEXT WEEK`,...(carry.length?carry.map(x=>`- ${x}`):["- Build the next week from body position → power transfer → race rhythm."]),"- Progression lens: body position → power transfer → race rhythm.","- Protect the flow across the week and make the next progression visible rather than treating sessions as stand-alone.","- Anchor the next week precisely to the season phase and target meet."];
  return lines.filter((x,i,a)=>!(x===""&&a[i-1]==="")).join("\n");
}
function v37SavedWeeklyReport(start,squad){return (appState.weekly_reports||[]).filter(r=>r.week_start===start&&r.squad===(squad||"All squads")).sort(byUpdated)[0]||null}
async function v37GenerateWeeklyReport(preferAi=false){const start=$("v37ReportWeekStart").value||weekBounds(selectedSession()?.session_date||localIsoDate(new Date())).start,squad=$("v37ReportSquad").value||"All squads",snapshot=v37WeeklySnapshot(start,squad),fallback=v37LocalWeeklyReport(snapshot);$("v37WeeklyReportStatus").textContent="Building report…";if(preferAi&&cloudReady()&&navigator.onLine){try{const result=await v36CoachAi("generate_weekly_report",{week_start:snapshot.bounds.start,week_end:snapshot.bounds.end,squad,season:snapshot.season,weekly_plan:snapshot.week,sessions:snapshot.sessions,reviews:snapshot.reviews.map(x=>({session:x.session,review:x.review})),captures:snapshot.captures.map(c=>({athlete:appState.athletes.find(a=>a.id===c.athlete_id)?.full_name||"Group",text:c.text_content})),timed_sets:snapshot.timed,results:snapshot.results,required_cues:["body position → power transfer → race rhythm","protect flow across the week","anchor to season plan","show progression into next week"]});$("v37WeeklyReportText").value=result.report_text||fallback;$("v37WeeklyReportStatus").textContent=`AI-assisted draft · ${result.summary||"review before saving"}${result.warnings?.length?` · ${result.warnings.join("; ")}`:""}`;return}catch(error){$("v37WeeklyReportStatus").textContent=`AI unavailable: ${error.message}. Rules-based report shown.`}}$("v37WeeklyReportText").value=fallback;$("v37WeeklyReportStatus").textContent="Rules-based report generated from saved coaching evidence."}
async function v37SaveWeeklyReport(){const start=$("v37ReportWeekStart").value,squad=$("v37ReportSquad").value||"All squads",text=$("v37WeeklyReportText").value.trim();if(!start||!text)return;const snap=v37WeeklySnapshot(start,squad),existing=v37SavedWeeklyReport(snap.bounds.start,squad),record={id:existing?.id||uid("weekly-report"),week_start:snap.bounds.start,week_end:snap.bounds.end,squad,title:`Weekly coaching report · ${formatDate(snap.bounds.start)}–${formatDate(snap.bounds.end)}`,report_text:text,evidence_snapshot:{session_ids:snap.sessions.map(s=>s.id),review_ids:snap.reviews.map(x=>x.review?.id).filter(Boolean),capture_ids:snap.captures.map(c=>c.id),timed_set_ids:snap.timed.map(t=>t.id),result_ids:snap.results.map(r=>r.id)},generation_method:/AI-assisted/i.test($("v37WeeklyReportStatus").textContent)?"ai":"rules",coach_approved:true,created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("weekly_reports",record);queueRecord("weekly_reports",record.id);appState.settings.v37.weekly_report_id=record.id;saveState(appState);await syncIfPossible();$("v37WeeklyReportStatus").textContent=`Saved ${new Date(record.updated_at).toLocaleString("en-NZ")} · synced when online`;updateStatus("Weekly coaching report saved","good")}
function v37LoadWeeklyReport(){const start=$("v37ReportWeekStart").value||weekBounds(selectedSession()?.session_date||localIsoDate(new Date())).start,squad=$("v37ReportSquad").value||"All squads",saved=v37SavedWeeklyReport(weekBounds(start).start,squad);if(saved){$("v37WeeklyReportText").value=saved.report_text;$("v37WeeklyReportStatus").textContent=`Saved report · ${new Date(saved.updated_at).toLocaleString("en-NZ")}`}else{$("v37WeeklyReportText").value="";$("v37WeeklyReportStatus").textContent="No saved report for this week yet."}}
function v37ReportDue(session=selectedSession()){if(!session)return false;const d=new Date(`${session.session_date}T12:00:00`).getDay(),meet=/meet|champs|championship|festival|nags|nzsc|opens|division/i.test(session.title||"");return (d===6||meet)&&(session.status==="completed"||sessionReview(session.id)?.completed_at)}
function v37InjectWeeklyReport(){const reports=$("reports");if(!reports||$("v37WeeklyReportCard"))return;reports.querySelector(".view-heading")?.insertAdjacentHTML("afterend",'<article id="v37WeeklyReportCard" class="card"><div class="card-heading"><div><div class="eyebrow">Coach file</div><h3>Weekly coaching report</h3></div><span id="v37WeeklyReportStatus" class="help"></span></div><div class="v37-report-controls"><label>Week starting<input id="v37ReportWeekStart" type="date"></label><label>Squad<select id="v37ReportSquad"></select></label></div><textarea id="v37WeeklyReportText" class="large-textarea" placeholder="Generate the report after Saturday morning or the end of a weekend meet."></textarea><div class="button-row"><button id="v37GenerateWeeklyBtn" type="button">Generate from evidence</button><button id="v37GenerateWeeklyAiBtn" type="button" class="secondary">AI-assisted draft</button><button id="v37SaveWeeklyBtn" type="button">Save report</button><button id="v37CopyWeeklyBtn" type="button" class="secondary">Copy report</button></div></article>');const session=selectedSession(),bounds=weekBounds(session?.session_date||localIsoDate(new Date()));$("v37ReportWeekStart").value=bounds.start;const squads=["All squads",...new Set(v36ActiveAthletes().map(a=>a.squad).filter(Boolean))];$("v37ReportSquad").innerHTML=squads.map(s=>`<option>${escapeHtml(s)}</option>`).join("");$("v37GenerateWeeklyBtn").onclick=()=>v37GenerateWeeklyReport(false);$("v37GenerateWeeklyAiBtn").onclick=()=>v37GenerateWeeklyReport(true);$("v37SaveWeeklyBtn").onclick=v37SaveWeeklyReport;$("v37CopyWeeklyBtn").onclick=async()=>{await navigator.clipboard.writeText($("v37WeeklyReportText").value);$("v37WeeklyReportStatus").textContent="Copied to clipboard."};$("v37ReportWeekStart").onchange=v37LoadWeeklyReport;$("v37ReportSquad").onchange=v37LoadWeeklyReport;v37LoadWeeklyReport()}
function v37InjectReportDue(){const finish=$("finish");if(!finish||$("v37ReportDue"))return;finish.querySelector(".view-heading")?.insertAdjacentHTML("afterend",'<div id="v37ReportDue" class="v37-report-due" hidden><strong>Weekly report due after this session/meet.</strong><button type="button" class="secondary">Open weekly report</button></div>');$("v37ReportDue").querySelector("button").onclick=()=>{showView("reports");v37InjectWeeklyReport()}}
function v37RenderReportDue(){const host=$("v37ReportDue");if(host)host.hidden=!v37ReportDue()}

const v37PriorSaveFinish=v361SaveFinishSessionFinal;
v361SaveFinishSessionFinal=async function(){const wasDue=(()=>{const s=selectedSession();if(!s)return false;const d=new Date(`${s.session_date}T12:00:00`).getDay();return d===6||/meet|champs|championship|festival|nags|nzsc|opens|division/i.test(s.title||"")})();await v37PriorSaveFinish();if(wasDue){showView("reports");v37InjectWeeklyReport();await v37GenerateWeeklyReport(false);$("v37WeeklyReportStatus").textContent="Weekly report prepared from the completed Saturday/meet evidence. Review and save it."}};
function v37BindFinish(){const old=$("finishSessionBtn");if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.onclick=v361SaveFinishSessionFinal}

function v37InjectStyles(){if($("v37Styles"))return;const style=document.createElement("style");style.id="v37Styles";style.textContent=`
.v37-mode-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem;margin:.7rem 0}.v37-mode-tabs button.active{background:#123a5b;color:white}.v37-stimulus{display:grid;gap:.25rem;border-radius:.65rem;padding:.65rem .75rem;margin:.45rem 0}.v37-stimulus.warning{background:#fff3cd;border:1px solid #e5bf55}.v37-stimulus.good{background:#e8f7ee;border:1px solid #7bc59a}.v37-stimulus span{font-size:.82rem}.v37-profile-grid,.v37-report-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.55rem}.v37-profile-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.55rem}.v37-profile-sections textarea,#v37ProfileEditor textarea{min-height:90px}.v37-report-due{display:flex;justify-content:space-between;align-items:center;gap:.6rem;padding:.7rem;border-radius:.65rem;background:#eaf4ff;border:1px solid #81acd0;margin-bottom:.75rem}#v37WeeklyReportText{min-height:460px;white-space:pre-wrap}.v37-report-controls label{display:grid;gap:.25rem}@media(max-width:720px){.v37-mode-tabs{grid-template-columns:1fr}.v37-profile-sections{grid-template-columns:1fr}#v37WeeklyReportText{min-height:380px}.v37-report-due{align-items:flex-start;flex-direction:column}}
`;document.head.appendChild(style)}

function v37InjectAll(){document.title="McLay Swimming OS — v3.7 Complete";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.7 · plan → coach → capture → adapt → review → progress";v37InjectStyles();v37InjectAdaptationInterface();v37InjectWeeklyReport();v37InjectReportDue();v37BindFinish();v37RenderReportDue();v37RenderAdaptationPanel()}
const v37PriorRenderAll=renderAll;
renderAll=function(){v37PriorRenderAll();v37EnsureLocalProfiles();v37InjectAll();v37RenderReportDue();v37RenderAdaptationPanel()};

v37InjectAll();renderAll();

// v3.7 final render-order guard: the layered legacy renderers must never be the
// last writer to the compact Deck. Also remove departed swimmers from Reports.
const v37BaseRenderReportsFinal=renderReports;
renderReports=function(){return v36WithActiveAthletes(v37BaseRenderReportsFinal)};
const v37BaseRenderAllFinal=renderAll;
renderAll=function(){
  v37BaseRenderAllFinal();
  v361RenderDeckBlocksFinal();
  requestAnimationFrame(()=>requestAnimationFrame(()=>v361RenderDeckBlocksFinal()));
};
renderAll();

// =============================================================================
// McLay Swimming OS v3.7.2 — poolside core + coach-approved individual learning
// Final correction layer over v3.7. The main session remains the source of
// truth. Athlete profiles, evidence and learned rules are ID-owned, durable and
// coach-approved; no note silently becomes a permanent rule.
// =============================================================================
const V371_VERSION="3.7.2";
const V371_BUILD="20260726-poolside-learning";

for(const key of ["adaptation_learning_events"]){
  if(!Array.isArray(appState[key]))appState[key]=[];
  if(!CLOUD_TABLES.includes(key))CLOUD_TABLES.push(key);
  if(typeof V331_OPTIONAL_CLOUD_TABLES!=="undefined")V331_OPTIONAL_CLOUD_TABLES.add(key);
}
if(!appState.settings.v371)appState.settings.v371={dismissed_learning:[],candidate_athlete_id:"",candidate_source_id:""};
saveState(appState);

const v371PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  const row=v371PriorCloudRow(table,record),org=appState.settings.organisation_id,user=getAuth()?.user?.id;
  if(table==="session_adaptations")return {
    ...row,
    outcome:record.outcome||null,
    outcome_notes:record.outcome_notes||"",
    reviewed_at:record.reviewed_at||null
  };
  if(table==="adaptation_learning_events")return {
    id:record.id,organisation_id:org,athlete_id:record.athlete_id,session_id:record.session_id||null,
    source_capture_id:record.source_capture_id||null,source_adaptation_id:record.source_adaptation_id||null,
    decision:record.decision||"review",scope:record.scope||null,note:record.note||"",
    learned_rule_id:record.learned_rule_id||null,created_at:record.created_at||nowIso(),created_by:user
  };
  return row;
};

function v371RecordLearningEvent({athlete_id,session_id=null,source_capture_id=null,source_adaptation_id=null,decision="review",scope=null,note="",learned_rule_id=null}){
  if(!athlete_id)return null;
  const record={id:uid("adapt-learning"),athlete_id,session_id,source_capture_id,source_adaptation_id,decision,scope,note,learned_rule_id,created_at:nowIso()};
  upsertLocal("adaptation_learning_events",record);queueRecord("adaptation_learning_events",record.id);saveState(appState);scheduleFastSync();return record;
}
function v371SessionName(sessionId){const s=appState.sessions.find(x=>x.id===sessionId);return s?`${sessionLabel(s)} — ${s.title}`:"Session"}
function v371Dismissed(){return new Set(appState.settings.v371.dismissed_learning||[])}
function v371DismissCandidate(key){const rows=new Set(appState.settings.v371.dismissed_learning||[]);rows.add(key);appState.settings.v371.dismissed_learning=[...rows].slice(-250);saveState(appState)}

// -----------------------------------------------------------------------------
// Core Deck render-order guarantee. Navigation uses renderView(), not renderAll,
// so the verified compact renderer must be the final writer in both paths.
// -----------------------------------------------------------------------------
const v371PriorRenderDeck=renderDeck;
renderDeck=function(){
  v371PriorRenderDeck();
  v361RenderDeckBlocksFinal();
  v37RenderAdaptationPanel();
  v371RenderLearningSupport();
  v371RenderComposerProgress();
};
const v371PriorRenderView=renderView;
renderView=function(id){
  v371PriorRenderView(id);
  if(id==="deck"){
    v361RenderDeckBlocksFinal();
    v37RenderAdaptationPanel();
    v371RenderLearningSupport();
    v371RenderComposerProgress();
  }
};

// -----------------------------------------------------------------------------
// Phone session entry progress: one obvious route from input -> review -> live.
// -----------------------------------------------------------------------------
function v371InjectComposerProgress(){
  const result=$("sessionImportResult");if(!result||$("v371ComposerProgress"))return;
  result.insertAdjacentHTML("afterend",'<div id="v371ComposerProgress" class="v371-composer-progress" aria-live="polite"><div data-v371-step="input"><b>1</b><span>Enter session</span></div><div data-v371-step="preview"><b>2</b><span>Review blocks</span></div><div data-v371-step="use"><b>3</b><span>Save &amp; Use Now</span></div></div>');
  const input=$("sessionPasteInput");if(input)input.addEventListener("input",()=>v371RenderComposerProgress());
}
function v371RenderComposerProgress(){
  const host=$("v371ComposerProgress");if(!host)return;
  const hasInput=Boolean($("sessionPasteInput")?.value.trim()||v33PendingSessionPhoto),hasPreview=Boolean(importedSessionDraft&&v35DraftBlocks?.length),saved=Boolean(importedSessionDraft&&appState.sessions.some(s=>s.id===importedSessionDraft.id));
  const state={input:hasInput?"done":"active",preview:hasPreview?"done":hasInput?"active":"waiting",use:saved?"done":hasPreview?"active":"waiting"};
  host.querySelectorAll("[data-v371-step]").forEach(el=>{el.className=state[el.dataset.v371Step]||"waiting"});
}
const v371PriorImportPreview=renderSessionImportPreview;
renderSessionImportPreview=function(){v371PriorImportPreview();v371RenderComposerProgress()};

// -----------------------------------------------------------------------------
// Learning candidates: athlete-specific notes and adaptation outcomes are
// surfaced for review. Coach chooses whether and how broadly anything is learned.
// -----------------------------------------------------------------------------
function v371CandidateKey(type,id){return `${type}:${id}`}
function v371LearningCandidates(athlete){
  if(!athlete)return [];
  const dismissed=v371Dismissed(),captures=(appState.captures||[])
    .filter(c=>c.athlete_id===athlete.id&&c.text_content&&!/^Finish Session voice/i.test(c.text_content))
    .sort(byUpdated).slice(0,12).map(c=>({
      key:v371CandidateKey("capture",c.id),type:"capture",id:c.id,session_id:c.session_id,
      label:`Poolside note · ${v371SessionName(c.session_id)}`,text:String(c.text_content||"").replace(/^\[[^\]]+\]\s*/,""),created:c.updated_at||c.created_at||""
    }));
  const outcomes=(appState.session_adaptations||[])
    .filter(a=>a.athlete_id===athlete.id&&a.outcome_notes)
    .sort(byUpdated).slice(0,8).map(a=>({
      key:v371CandidateKey("adaptation",a.id),type:"adaptation",id:a.id,session_id:a.session_id,
      label:`Adaptation feedback · ${v371SessionName(a.session_id)}`,text:a.outcome_notes,created:a.reviewed_at||a.updated_at||""
    }));
  return [...captures,...outcomes].filter(c=>c.text&&!dismissed.has(c.key)).sort((a,b)=>String(b.created).localeCompare(String(a.created))).slice(0,10);
}
function v371OpenLearningNote(text,scope="this_session",source=null){
  v37AdaptationMode="individual";appState.settings.v37.adaptation_mode="individual";saveState(appState);v37RenderAdaptationPanel();
  const details=$("v37LearningArea");if(details){details.hidden=false;details.open=true}
  if($("v37LearningScope"))$("v37LearningScope").value=scope;
  if($("adaptationLearningRule")){$("adaptationLearningRule").value=text||"";$("adaptationLearningRule").focus()}
  if(source){appState.settings.v371.candidate_athlete_id=v35AdaptationAthleteId||"";appState.settings.v371.candidate_source_id=source.key||"";saveState(appState)}
  $("adaptationStatus").textContent="Learning note loaded. Edit it, choose the scope, then approve it — or choose Do not learn.";
  $("v37LearningArea")?.scrollIntoView({behavior:"smooth",block:"center"});
}
async function v371KeepObservation(athlete,candidate){
  const p=v37ProfileRecord(athlete);if(!p)return;
  p.observed_patterns=v34AppendText(p.observed_patterns,`${v371SessionName(candidate.session_id)}: ${candidate.text}`);p.updated_at=nowIso();queueRecord("athlete_adaptation_profiles",p.id);
  v371RecordLearningEvent({athlete_id:athlete.id,session_id:candidate.session_id,source_capture_id:candidate.type==="capture"?candidate.id:null,source_adaptation_id:candidate.type==="adaptation"?candidate.id:null,decision:"observation",note:candidate.text});
  v371DismissCandidate(candidate.key);saveState(appState);await syncIfPossible();v37RenderAdaptationPanel();v371RenderLearningSupport();updateStatus(`Observation added to ${athlete.full_name}'s profile`,"good");
}
function v371DismissLearningCandidate(athlete,candidate){
  v371RecordLearningEvent({athlete_id:athlete.id,session_id:candidate.session_id,source_capture_id:candidate.type==="capture"?candidate.id:null,source_adaptation_id:candidate.type==="adaptation"?candidate.id:null,decision:"dismissed",note:candidate.text});
  v371DismissCandidate(candidate.key);v371RenderLearningSupport();updateStatus("Evidence kept in the session record but not used for learning","good");
}
function v371InjectLearningSupport(){
  const panel=$("adaptationPanel");if(!panel||$("v371LearningSupport"))return;
  const profile=$("v37ProfileEditor");if(profile)profile.insertAdjacentHTML("afterend",'<section id="v371LearningSupport" class="v371-learning-support"><div class="card-heading"><div><div class="eyebrow">Coach-approved learning</div><h4>Recent evidence to review</h4></div><span class="help">Nothing becomes a permanent rule without your approval.</span></div><div id="v371LearningCandidates"></div><div id="v371AdaptationOutcome" class="v371-outcome"></div></section>');
}
function v371RenderLearningSupport(){
  const host=$("v371LearningCandidates"),outcome=$("v371AdaptationOutcome"),session=selectedSession(),athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId);
  if(!host||!athlete||v37AdaptationMode!=="individual")return;
  const candidates=v371LearningCandidates(athlete);
  host.innerHTML=candidates.length?candidates.map((c,index)=>`<article class="v371-learning-candidate" data-v371-candidate="${index}"><div><strong>${escapeHtml(c.label)}</strong><span>${escapeHtml(c.text)}</span></div><div class="button-row"><button type="button" data-v371-use="${index}">Review as rule</button><button type="button" class="secondary" data-v371-observe="${index}">Keep as observation</button><button type="button" class="secondary" data-v371-dismiss="${index}">Do not learn</button></div></article>`).join(""):'<div class="help">No new athlete-specific evidence is waiting for review.</div>';
  host.querySelectorAll("[data-v371-use]").forEach(b=>b.onclick=()=>{const c=candidates[Number(b.dataset.v371Use)];v371OpenLearningNote(c.text,"this_session",c)});
  host.querySelectorAll("[data-v371-observe]").forEach(b=>b.onclick=()=>v371KeepObservation(athlete,candidates[Number(b.dataset.v371Observe)]));
  host.querySelectorAll("[data-v371-dismiss]").forEach(b=>b.onclick=()=>v371DismissLearningCandidate(athlete,candidates[Number(b.dataset.v371Dismiss)]));
  const saved=session?v36SavedAdaptation(athlete.id,session.id):null;
  outcome.innerHTML=saved?`<div><strong>How did this version work?</strong><span>${escapeHtml(saved.outcome_notes||"Record the outcome after using it so the profile improves over time.")}</span></div><textarea id="v371OutcomeNotes" placeholder="What worked, what was too much, cycle/rest changes, skill or equipment notes…">${escapeHtml(saved.outcome_notes||"")}</textarea><div class="button-row"><button type="button" id="v371OutcomeWorked">Worked well</button><button type="button" class="secondary" id="v371OutcomeChange">Needs a change</button><button type="button" class="secondary" id="v371OutcomeNoLearn">Record only — do not learn</button></div>`:'<div class="help">Save this athlete version first. After the session, record whether it worked so the next version can improve.</div>';
  if(saved){
    $("v371OutcomeWorked").onclick=()=>v371SaveAdaptationOutcome(athlete,saved,"worked");
    $("v371OutcomeChange").onclick=()=>v371SaveAdaptationOutcome(athlete,saved,"needs_change");
    $("v371OutcomeNoLearn").onclick=()=>v371SaveAdaptationOutcome(athlete,saved,"record_only");
  }
}
async function v371SaveAdaptationOutcome(athlete,adaptation,outcome){
  const note=$("v371OutcomeNotes")?.value.trim()||`${v371SessionName(adaptation.session_id)}: ${outcome==="worked"?"The saved athlete version worked as intended.":outcome==="needs_change"?"The saved athlete version needs adjustment.":"Outcome recorded without learning."}`;
  adaptation.outcome=outcome;adaptation.outcome_notes=note;adaptation.reviewed_at=nowIso();adaptation.updated_at=nowIso();queueRecord("session_adaptations",adaptation.id);
  const p=v37ProfileRecord(athlete);
  if(outcome==="worked"&&p){p.successful_adaptations=v34AppendText(p.successful_adaptations,note);p.updated_at=nowIso();queueRecord("athlete_adaptation_profiles",p.id)}
  v371RecordLearningEvent({athlete_id:athlete.id,session_id:adaptation.session_id,source_adaptation_id:adaptation.id,decision:outcome,note});saveState(appState);await syncIfPossible();
  if(outcome==="needs_change")v371OpenLearningNote(note,"similar_set",{key:v371CandidateKey("adaptation",adaptation.id)});
  else{v37RenderAdaptationPanel();v371RenderLearningSupport();updateStatus(outcome==="worked"?`Successful adaptation added to ${athlete.full_name}'s profile`:"Outcome recorded without creating a permanent rule","good")}
}

// Link approved/dismissed learning back to the evidence candidate and preserve an
// audit trail. The existing rule generator remains conservative and deterministic.
const v371PriorApproveLearning=v37ApproveLearning;
v37ApproveLearning=async function(){
  const athlete=appState.athletes.find(a=>a.id===v35AdaptationAthleteId),scope=$("v37LearningScope")?.value||"general",note=$("adaptationLearningRule")?.value.trim()||"",sourceKey=appState.settings.v371.candidate_source_id||"";
  if(scope==="dont_learn"){
    if(athlete&&note)v371RecordLearningEvent({athlete_id:athlete.id,session_id:selectedSession()?.id||null,decision:"dismissed",scope,note});
    if(sourceKey)v371DismissCandidate(sourceKey);appState.settings.v371.candidate_source_id="";saveState(appState);
    if($("adaptationLearningRule"))$("adaptationLearningRule").value="";$("adaptationStatus").textContent="Correction kept in this session only. No rule was learned.";v371RenderLearningSupport();return;
  }
  const before=new Set((appState.athlete_adaptation_rules||[]).map(r=>r.id));
  await v371PriorApproveLearning();
  const learned=(appState.athlete_adaptation_rules||[]).filter(r=>!before.has(r.id)&&r.athlete_id===athlete?.id).sort(byUpdated)[0];
  if(athlete&&learned)v371RecordLearningEvent({athlete_id:athlete.id,session_id:selectedSession()?.id||null,decision:"learned",scope,note,learned_rule_id:learned.id});
  if(sourceKey)v371DismissCandidate(sourceKey);appState.settings.v371.candidate_source_id="";saveState(appState);v371RenderLearningSupport();
};
v35ApproveLearning=v37ApproveLearning;
function v371RebindLearningButton(){const old=$("approveAdaptationLearningBtn");if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.onclick=v37ApproveLearning}


// Any active swimmer can gain an ID-owned individual profile. The six confirmed
// modified swimmers are seeded by the migration, while this collapsed control
// keeps the same learning system available for future individual needs without
// cluttering the poolside Deck.
function v371ProfileEligibleAthletes(){
  const session=selectedSession(),squads=session?sessionSquads(session):[];
  return v36ActiveAthletes().filter(a=>!v37ProfileRecord(a)).filter(a=>!squads.length||squads.some(sq=>squadKey(sq)===squadKey(a.squad))||/para/i.test(a.squad||"")).sort((a,b)=>a.full_name.localeCompare(b.full_name));
}
function v371InjectProfileStarter(){
  const modes=$("v37AdaptationModes");if(!modes||$("v371ProfileStarter"))return;
  modes.insertAdjacentHTML("afterend",'<details id="v371ProfileStarter" class="v371-profile-starter"><summary><strong>Add another swimmer profile</strong><span>For any individual need; saved against the swimmer ID</span></summary><div class="form-grid"><label>Swimmer<select id="v371ProfileStarterAthlete"></select></label><label>Starting approach<select id="v371ProfileStarterApproach"><option value="individual">Individual — start at full volume</option><option value="half">Start near ½ session</option><option value="two_thirds">Start near ⅔ session</option></select></label></div><button id="v371CreateProfileBtn" type="button" class="secondary full-width">Create individual profile</button><div id="v371ProfileStarterMessage" class="help"></div></details>');
  $("v371CreateProfileBtn").onclick=v371CreateProfile;
}
function v371RenderProfileStarter(){
  const select=$("v371ProfileStarterAthlete"),button=$("v371CreateProfileBtn"),message=$("v371ProfileStarterMessage");if(!select||!button)return;
  const athletes=v371ProfileEligibleAthletes();select.innerHTML=athletes.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.full_name)} · ${escapeHtml(a.squad||"No squad")}</option>`).join("");button.disabled=!athletes.length;
  if(message)message.textContent=athletes.length?"Creating a profile does not invent a permanent rule. Add observations and approve learning as evidence develops.":"Every active swimmer relevant to this session already has an individual profile.";
}
async function v371CreateProfile(){
  const athlete=appState.athletes.find(a=>a.id===$("v371ProfileStarterAthlete")?.value);if(!athlete)return;
  const approach=$("v371ProfileStarterApproach")?.value||"individual",ratio=approach==="half"?.5:approach==="two_thirds"?2/3:1,cycle=approach==="individual"?1:1.15,now=nowIso();
  const p={id:`adapt-profile-${athlete.id}`,athlete_id:athlete.id,profile_label:approach==="half"?"½ session":approach==="two_thirds"?"⅔ session":"Individual plan",default_volume_ratio:ratio,default_cycle_multiplier:cycle,rep_strategy:"Preserve every key block; adjust repetitions only after checking the intended stimulus.",distance_strategy:"Protect skill and quality distances before shortening longer aerobic work.",rest_strategy:"Set recovery from the athlete response and intended stimulus; do not scale it blindly with volume.",stroke_restrictions:"",equipment_preferences:"",underwater_limits:"",skill_emphasis:"",locked_rules:"",observed_patterns:"",current_considerations:"",successful_adaptations:"",avoid_review:"",active:true,created_at:now,updated_at:now};
  upsertLocal("athlete_adaptation_profiles",p);queueRecord("athlete_adaptation_profiles",p.id);v35AdaptationAthleteId=athlete.id;v37AdaptationMode="individual";appState.settings.v37.adaptation_mode="individual";saveState(appState);await syncIfPossible();v37RenderAdaptationPanel();v371RenderLearningSupport();v371RenderProfileStarter();updateStatus(`${athlete.full_name} individual profile created`,"good");
}

// -----------------------------------------------------------------------------
// Final interface and state refresh.
// -----------------------------------------------------------------------------
function v371InjectStyles(){if($("v371Styles"))return;const style=document.createElement("style");style.id="v371Styles";style.textContent=`
.v371-composer-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem;margin:.65rem 0}.v371-composer-progress>div{display:flex;align-items:center;gap:.4rem;padding:.5rem;border:1px solid #cddce4;border-radius:.6rem;background:#f6f9fb;font-size:.78rem}.v371-composer-progress b{display:grid;place-items:center;width:1.45rem;height:1.45rem;border-radius:50%;background:#d8e4ea}.v371-composer-progress .active{border-color:#2b7a78;background:#eaf7f5}.v371-composer-progress .active b,.v371-composer-progress .done b{background:#2b7a78;color:white}.v371-composer-progress .done{background:#eef8f1;border-color:#83bc95}.v371-learning-support{border-top:1px solid #d7e5ed;margin-top:.85rem;padding-top:.75rem}.v371-learning-candidate{display:grid;gap:.55rem;border:1px solid #cfdee6;border-radius:.65rem;padding:.65rem;margin:.55rem 0;background:#f8fbfc}.v371-learning-candidate>div:first-child{display:grid;gap:.25rem}.v371-learning-candidate span,.v371-outcome span{font-size:.84rem;line-height:1.4}.v371-outcome{display:grid;gap:.55rem;border-top:1px solid #d7e5ed;padding-top:.75rem;margin-top:.75rem}.v371-outcome>div:first-child{display:grid;gap:.2rem}.v371-outcome textarea{min-height:90px}.v371-profile-starter{margin:.55rem 0;padding:.55rem;border:1px dashed #b9ced9;border-radius:.65rem;background:#f8fbfc}.v371-profile-starter summary{cursor:pointer}.v371-profile-starter summary span{display:block;font-size:.78rem;font-weight:400}.session-import-card details[open] .session-import-body{scroll-margin-top:7rem}@media(max-width:720px){.v371-composer-progress{grid-template-columns:1fr}.v371-learning-candidate .button-row,.v371-outcome .button-row{display:grid;grid-template-columns:1fr}.v35-deck-block-body .button-row{display:grid;grid-template-columns:1fr 1fr}.v35-deck-block-body .button-row button:first-child{grid-column:1/-1}.session-import-body .import-save-actions{position:sticky;bottom:4.5rem;z-index:5;background:rgba(255,255,255,.96);padding:.55rem;border:1px solid #d3e0e7;border-radius:.65rem;box-shadow:0 -2px 12px rgba(18,58,91,.12)}}
`;document.head.appendChild(style)}
function v371InjectAll(){
  document.title="McLay Swimming OS — v3.7.2 Complete";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.7.2 · enter → coach → capture → learn → review → progress";
  v371InjectStyles();v371InjectComposerProgress();v371InjectLearningSupport();v371InjectProfileStarter();v371RebindLearningButton();v371RenderComposerProgress();v371RenderLearningSupport();v371RenderProfileStarter();
}
const v371PriorRenderAll=renderAll;
renderAll=function(){v371PriorRenderAll();v371InjectAll();v361RenderDeckBlocksFinal();v37RenderAdaptationPanel();v371RenderLearningSupport();v371RenderComposerProgress();v371RenderProfileStarter()};

v371InjectAll();renderAll();

// v3.7.2 visibility guard for the individual-learning workspace.
const v371PriorRenderLearningSupportFinal=v371RenderLearningSupport;
v371RenderLearningSupport=function(){
  const support=$("v371LearningSupport");if(support)support.hidden=v37AdaptationMode!=="individual";
  if(v37AdaptationMode!=="individual")return;
  v371PriorRenderLearningSupportFinal();
};
renderAll();

// Refresh learning/outcome controls immediately after an athlete version is saved.
const v371PriorSaveAdaptationFinal=v35SaveAdaptation;
v35SaveAdaptation=async function(){await v371PriorSaveAdaptationFinal();v371RenderLearningSupport()};
renderAll();

// Keep the automatic Saturday/meet report anchored to the completed session's
// actual week, while still allowing the coach to choose a historical week.
function v371AlignWeeklyReportToSession(force=false){
  const input=$("v37ReportWeekStart"),session=selectedSession();if(!input||!session)return;
  const target=weekBounds(session.session_date).start;
  if(force||!input.value){input.value=target;v37LoadWeeklyReport()}
}
const v371RenderViewWithReportWeek=renderView;
renderView=function(id){
  v371RenderViewWithReportWeek(id);
  if(id==="reports")v371AlignWeeklyReportToSession(v37ReportDue(selectedSession()));
  if(id==="deck"){v361RenderDeckBlocksFinal();v37RenderAdaptationPanel();v371RenderLearningSupport();v371RenderComposerProgress()}
};
renderAll();

// Include Finish Session athlete notes, modifications and athlete-response text
// as review candidates when they explicitly name the swimmer. This lets normal
// debrief notes feed future para/individual planning without silent learning.
const v371PriorLearningCandidatesFinal=v371LearningCandidates;
v371LearningCandidates=function(athlete){
  const base=v371PriorLearningCandidatesFinal(athlete),dismissed=v371Dismissed(),full=v35NameKey(athlete?.full_name),first=full.split(" ")[0]||"",match=text=>{const t=v35NameKey(text);return Boolean(t&&(t.includes(full)||(first.length>=3&&new RegExp(`\\b${first}\\b`).test(t))))};
  const reviewRows=[];
  for(const review of (appState.session_reviews||[]).slice().sort(byUpdated).slice(0,30)){
    for(const [field,label] of [["athlete_notes","Athlete note"],["athlete_response","Athlete response"],["modifications","Session modification"],["reinforce","Needs reinforcing"],["carry_forward","Carry-forward"]]){
      const text=String(review[field]||"").trim();if(!match(text))continue;
      const key=`review:${review.id}:${field}`;if(dismissed.has(key))continue;
      reviewRows.push({key,type:"review",id:review.id,field,session_id:review.session_id,label:`${label} · ${v371SessionName(review.session_id)}`,text,created:review.updated_at||review.completed_at||""});
    }
  }
  const seen=new Set();return [...base,...reviewRows].sort((a,b)=>String(b.created).localeCompare(String(a.created))).filter(c=>!seen.has(c.key)&&seen.add(c.key)).slice(0,12);
};
renderAll();


// =============================================================================
// McLay Swimming OS v3.7.3 - supplied results + performance-chain repair
// The result views are treated as optional acceleration only. PBs, WA/WPS points,
// progression gaps and records are derived from the synced source rows and the
// required official reference tables, so a missing optional view cannot produce
// a false "Cloud synced" result screen.
// =============================================================================
const V373_VERSION="3.7.3";
const V373_BUILD="20260726-results-chain";
if(!appState.settings.v373_results_health)appState.settings.v373_results_health={checked_at:"",ok:false,counts:{},error:""};

function v373CanonicalMeet(value){
  const s=String(value||"").trim();
  if(/scwc|cwsc/i.test(s)&&/2026/.test(s))return "2026 SCWC Short Course Championships";
  if(/new zealand.*short|nzsc/i.test(s)&&/2025/.test(s))return "2025 New Zealand Short Course Championships";
  if(/age group|nags/i.test(s)&&/2026/.test(s))return "2026 New Zealand Age Group Championships";
  if(/new zealand.*open|nz opens/i.test(s)&&/2026/.test(s))return "2026 New Zealand Open Championships";
  if(/division\s*(ii|2)/i.test(s)&&/2026/.test(s))return "2026 Division II Championships";
  if(/south island/i.test(s)&&/2026/.test(s))return "2026 South Island Long Course Championships";
  if(/aquagym challenge/i.test(s)&&/2025/.test(s))return "2025 AquaGym Challenge";
  return s;
}
function v373Sex(row,athlete){return v32Sex(athlete?.sex||row?.swimmer_sex||row?.sex||"")}
function v373SourceClass(row,stroke){
  if(v3Stroke(stroke)==="Breaststroke")return String(row?.source_sb_class||row?.sb_class||"").toUpperCase();
  if(v3Stroke(stroke)==="IM")return String(row?.source_sm_class||row?.sm_class||"").toUpperCase();
  return String(row?.source_s_class||row?.s_class||"").toUpperCase();
}
function v373LatestDemographic(athlete){
  const rows=[];
  for(const r of (appState.results_event_history||[]))if(r.athlete_id===athlete.id)rows.push(v3RaceRow(r,"official"));
  for(const r of (appState.coach_results||[]))if(r.athlete_id===athlete.id&&r.excluded_from_pb!==true)rows.push(v3RaceRow(r,r.source_type||"coach"));
  return rows.filter(r=>r.swimmer_age||r.age||r.swimmer_sex||r.sex||r.source_s_class||r.source_sb_class||r.source_sm_class)
    .sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||"")))[0]||{};
}
function v373AgeForStandard(athlete,pb,row){
  const date=row?.age_date||row?.meet_date||pb?.result_date||"";
  const dobAge=v3Age(athlete,date);if(dobAge!==null)return dobAge;
  const latest=v373LatestDemographic(athlete);
  const age=Number(latest.swimmer_age??latest.age??pb?.swimmer_age??pb?.age);
  return Number.isFinite(age)&&age>0?age:null;
}
function v373ClassForStandard(athlete,pb,stroke){
  const profile=v3ParaClassForEvent(athlete,v3Stroke(stroke));if(profile)return profile;
  const latest=v373LatestDemographic(athlete);
  return v373SourceClass(latest,stroke)||v373SourceClass(pb,stroke);
}
function v373StandardMatches(row,athlete,pb){
  if(row.active===false)return false;
  if(Number(row.distance)!==Number(pb.distance)||v3Stroke(row.stroke)!==v3Stroke(pb.stroke))return false;
  const rc=v3Course(row.course),pc=v3Course(pb.course);if(rc!=="BOTH"&&rc!==pc)return false;
  const sex=v373Sex(pb,athlete);if(row.sex&&(!sex||v32Sex(row.sex)!==sex))return false;
  const age=v373AgeForStandard(athlete,pb,row),hasAge=row.age_min!==null&&row.age_min!==undefined||row.age_max!==null&&row.age_max!==undefined;
  if(hasAge&&age===null)return false;
  if(age!==null&&((row.age_min!==null&&row.age_min!==undefined&&age<Number(row.age_min))||(row.age_max!==null&&row.age_max!==undefined&&age>Number(row.age_max))))return false;
  const cls=v373ClassForStandard(athlete,pb,pb.stroke);
  if(row.para_class)return cls&&String(row.para_class).toUpperCase()===String(cls).toUpperCase();
  return !cls;
}

v32WaBase=function(row,athlete){
  const course=v3Course(row.course),sex=v373Sex(row,athlete),distance=Number(row.distance),stroke=v3Stroke(row.stroke);
  return (appState.world_aquatics_base_times||[]).find(x=>x.active!==false&&v3Course(x.course)===course&&v32Sex(x.sex)===sex&&Number(x.distance)===distance&&v3Stroke(x.stroke)===stroke)?.base_seconds||null;
};
v32ParaParameter=function(row,athlete){
  const classification=v373ClassForStandard(athlete,row,row.stroke);if(!classification||v3Course(row.course)!=="LCM")return null;
  const sex=v373Sex(row,athlete);
  return (appState.world_para_point_parameters||[]).find(x=>x.active!==false&&Number(x.distance)===Number(row.distance)&&v3Stroke(x.stroke)===v3Stroke(row.stroke)&&String(x.classification||"").toUpperCase()===classification&&v32Sex(x.sex)===sex)||null;
};
v32PointsFor=function(row,athlete){
  const para=Number(row?.world_para_points||row?.para_points)||v32ParaPoints(row,athlete);if(para)return {value:para,label:"World Para"};
  const wa=Number(row?.wa_points||row?.world_aquatics_points)||v32WaPoints(row,athlete);return wa?{value:wa,label:"WA"}:{value:null,label:""};
};
v3Points=function(row){const athlete=appState.athletes.find(a=>a.id===row?.athlete_id)||null;return Number(v32PointsFor(row,athlete).value)||0};

athleteHistory=function(athleteId){
  const athlete=appState.athletes.find(a=>a.id===athleteId)||null,all=[];
  for(const row of (appState.results_event_history||[]).filter(r=>r.athlete_id===athleteId))all.push(v3RaceRow(row,"official"));
  for(const row of (appState.coach_results||[]).filter(r=>r.athlete_id===athleteId&&r.excluded_from_pb!==true))all.push(v3RaceRow(row,row.source_type||"coach"));
  const seen=new Set(),rows=[];
  for(const raw of all){
    const row={...raw,meet_name:v373CanonicalMeet(raw.meet_name),course:v36CourseForResult(raw)};
    if(!row.course||!row.distance||!row.stroke||!Number(row.result_seconds)||/DQ|DNS|DNF|NT/i.test(String(row.result_time_text||"")))continue;
    const key=[row.athlete_id,row.result_date,row.meet_name,row.course,row.distance,v3Stroke(row.stroke),Number(row.result_seconds).toFixed(2),String(row.round||"").toLowerCase()].join("|").toLowerCase();
    if(seen.has(key))continue;seen.add(key);rows.push(row);
  }
  return rows.sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||""))||v3Points(b)-v3Points(a)||Number(a.result_seconds)-Number(b.result_seconds));
};
athleteCwscHistory=function(id){return athleteHistory(id).filter(r=>/SCWC|Canterbury/i.test(r.meet_name||""))};
athleteOfficialPbs=function(athleteId){
  const best=new Map();
  for(const row of athleteHistory(athleteId)){
    const key=`${row.course}|${Number(row.distance)}|${v3Stroke(row.stroke)}`,old=best.get(key);
    if(!old||Number(row.result_seconds)<Number(old.result_seconds)||(Number(row.result_seconds)===Number(old.result_seconds)&&v3Points(row)>v3Points(old)))best.set(key,{...row,pb_time:row.result_time_text,pb_seconds:row.result_seconds,pb_date:row.result_date});
  }
  return [...best.values()].sort((a,b)=>v3Points(b)-v3Points(a)||Number(a.distance)-Number(b.distance)||String(a.stroke).localeCompare(String(b.stroke))||String(a.course).localeCompare(String(b.course)));
};
groupedAthletePbs=function(athlete){
  const map=new Map();for(const row of athleteOfficialPbs(athlete.id)){const k=v3EventKey(row.distance,row.stroke);if(!map.has(k))map.set(k,{distance:row.distance,stroke:row.stroke,LCM:null,SCM:null,bestPoints:0});const g=map.get(k);g[row.course]=row;g.bestPoints=Math.max(g.bestPoints,v3Points(row))}
  return [...map.values()].sort((a,b)=>b.bestPoints-a.bestPoints||Number(a.distance)-Number(b.distance)||String(a.stroke).localeCompare(String(b.stroke)));
};

function v373StandardStages(athlete,pb,includeRecords=false){
  const stages=[];
  for(const row of (appState.pathway_standards||[])){
    const isRecord=row.standard_kind==="record"||/record/i.test(String(row.programme||""));
    if(isRecord!==includeRecords||!v373StandardMatches(row,athlete,pb))continue;
    stages.push({order:Number(row.progression_order)||0,name:row.programme||row.standard_kind||"Standard",target:row.qualifying_time_text,targetSeconds:Number(row.qualifying_seconds),ceilingSeconds:Number(row.ceiling_seconds)||null,source:row});
  }
  const uniq=new Map();for(const stage of stages.filter(x=>x.targetSeconds).sort((a,b)=>a.order-b.order||a.targetSeconds-b.targetSeconds)){const k=`${stage.order}|${stage.name}|${stage.targetSeconds}`;if(!uniq.has(k))uniq.set(k,stage)}return [...uniq.values()];
}
v3TargetStages=function(athlete,pb){return v373StandardStages(athlete,pb,false)};
athleteRecordRows=function(athlete){
  const rows=[];
  for(const pb of athleteOfficialPbs(athlete.id))for(const stage of v373StandardStages(athlete,pb,true)){rows.push({athlete_id:athlete.id,record_scope:stage.name,programme:stage.name,course:pb.course,distance:pb.distance,stroke:pb.stroke,pb_time:pb.result_time_text,pb_seconds:pb.result_seconds,record_time_text:stage.target,record_seconds:stage.targetSeconds,gap_seconds:Number(pb.result_seconds)-Number(stage.targetSeconds),source:stage.source})}
  const uniq=new Map();for(const r of rows.sort((a,b)=>Math.max(0,Number(a.gap_seconds))-Math.max(0,Number(b.gap_seconds))||Number(a.gap_seconds)-Number(b.gap_seconds))){const k=`${r.record_scope}|${r.course}|${r.distance}|${r.stroke}|${r.record_seconds}`;if(!uniq.has(k))uniq.set(k,r)}return [...uniq.values()];
};
function v373ProgressionRows(athlete){
  const rows=[];for(const pb of athleteOfficialPbs(athlete.id)){const p=v3Pathway(athlete,pb);if(p.next&&p.next.source?.standard_kind!=="record")rows.push({programme:p.next.name,course:pb.course,distance:pb.distance,stroke:pb.stroke,pb_time:pb.result_time_text,target_time_text:p.next.target,gap_seconds:p.next.gap,points:v3Points(pb)})}
  return rows.sort((a,b)=>b.points-a.points||a.gap_seconds-b.gap_seconds);
}
athleteResultOverview=function(athleteId){
  const cached=(appState.results_athlete_overview||[]).find(row=>row.athlete_id===athleteId),history=athleteHistory(athleteId),pbs=athleteOfficialPbs(athleteId);
  if(!history.length)return cached||null;
  return {...cached,athlete_id:athleteId,official_result_count:history.length,personal_best_count:pbs.length,latest_result_date:history[0]?.result_date||"",latest_meet:history[0]?.meet_name||""};
};
compactRaceRows=function(input,empty){
  const rows=[...(input||[])].sort((a,b)=>v3Points(b)-v3Points(a)||Number(a.result_seconds||v3Seconds(a.result_time_text))-Number(b.result_seconds||v3Seconds(b.result_time_text)));
  return rows.length?rows.map(r=>{const athlete=appState.athletes.find(a=>a.id===r.athlete_id),p=v32PointsFor(r,athlete);return `<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.result_time_text||r.pb_time||"—")}${p.value?` · ${p.value} ${p.label}`:""}</strong><span>${escapeHtml(r.meet_name||r.programme||"")}${r.result_date?` · ${escapeHtml(resultDateLabel(r.result_date))}`:""}${r.official_place?` · place ${escapeHtml(r.official_place)}`:""}</span></div>`}).join(""):`<div class="help">${escapeHtml(empty)}</div>`;
};
athleteQuickHtml=function(athlete){
  if(!athlete)return `<div class="help">Choose a swimmer.</div>`;
  const recentSet=appState.timed_sets.filter(t=>t.athlete_id===athlete.id).sort(byUpdated)[0],recentCapture=appState.captures.filter(c=>c.athlete_id===athlete.id&&c.text_content).sort(byUpdated)[0],pace=athlete.legacy_pace;
  const history=athleteHistory(athlete.id),pbs=athleteOfficialPbs(athlete.id),overview=athleteResultOverview(athlete.id),gaps=v373ProgressionRows(athlete),records=athleteRecordRows(athlete),classification=[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean).join(" / ");
  const nextMeet=athlete.next_meet_name?`${athlete.next_meet_name}${athlete.next_meet_date?` · ${formatDate(athlete.next_meet_date)}`:""}`:"Not loaded";
  const pbText=pbs.length?pbs.slice(0,12).map(row=>{const p=v32PointsFor(row,athlete);return `${row.course} ${row.distance} ${row.stroke} — ${row.result_time_text}${p.value?` · ${p.value} ${p.label}`:""}`}).join("\n"):"Not loaded";
  const gapText=gaps.length?gaps.slice(0,8).map(r=>`${r.course} ${r.distance} ${r.stroke} — next ${r.programme} ${r.target_time_text} · ${Number(r.gap_seconds).toFixed(2)}s`).join("\n"):"No matching next standard — check age/sex/classification or highest stage achieved";
  const recordText=records.length?records.slice(0,6).map(r=>`${r.record_scope} ${r.course} ${r.distance} ${r.stroke}: ${r.record_time_text} · ${Number(r.gap_seconds)<=0?"matched/better":`${Number(r.gap_seconds).toFixed(2)}s away`}`).join("\n"):"No matching record row for current PB events";
  return `<div class="deck-answer-row"><span>Squad / primary events</span><strong>${escapeHtml(athlete.squad||"—")}${(athlete.primary_events||[]).length?` · ${escapeHtml(athlete.primary_events.join(", "))}`:""}</strong></div>${classification?`<div class="deck-answer-row"><span>Current classification</span><strong>${escapeHtml(classification)}</strong></div>`:""}<div class="deck-answer-row"><span>Official results</span><strong>${history.length} races · ${pbs.length} PBs${overview?.latest_meet?` · latest ${escapeHtml(overview.latest_meet)}`:""}</strong></div><div class="deck-answer-row"><span>Current plan focus</span><strong>${escapeHtml(athlete.current_focus||athlete.technical_focus||"Not entered yet.")}</strong></div><div class="deck-answer-row"><span>Next meet</span><strong>${escapeHtml(nextMeet)}</strong></div><div class="deck-answer-row"><span>Official PBs · points ranked</span><strong class="profile-lines">${escapeHtml(pbText)}</strong></div><div class="deck-answer-row"><span>Standards / gaps</span><strong class="profile-lines">${escapeHtml(gapText)}</strong></div><div class="deck-answer-row"><span>Relevant records</span><strong class="profile-lines">${escapeHtml(recordText)}</strong></div><div class="deck-answer-row"><span>Planned adaptations</span><strong>${escapeHtml(athlete.modifications||"None entered")}</strong></div><div class="deck-answer-row"><span>Latest timed set</span><strong>${recentSet?`${escapeHtml(recentSet.set_label||"Timed set")} · best ${formatSeconds(recentSet.best)} · avg ${formatSeconds(recentSet.average)}`:"No timed set saved yet."}</strong></div><div class="deck-answer-row"><span>Legacy pace reference</span><strong>${pace?`T400 ${escapeHtml(pace.t400)} · AT100 ${escapeHtml(pace.at_100_10)}`:"No confirmed pace reference."}</strong></div><div class="deck-answer-row"><span>Latest note</span><strong>${recentCapture?escapeHtml(recentCapture.text_content):"No athlete note saved yet."}</strong></div>`;
};

async function v373FetchAll(path,pageSize=1000){
  const out=[];
  for(let start=0;;start+=pageSize){
    const page=await cloudFetch(path,{headers:{"Range":`${start}-${start+pageSize-1}`}});
    if(!Array.isArray(page))throw new Error(`Expected an array from ${path}`);
    out.push(...page);if(page.length<pageSize)break;
  }
  return out;
}
const v373BasePullCloud=pullCloud;
pullCloud=async function(){
  await v373BasePullCloud();
  const org=appState.settings.organisation_id,counts={};
  try{
    appState.coach_results=(await v373FetchAll(`/rest/v1/coach_results?select=*&organisation_id=eq.${encodeURIComponent(org)}&order=result_date.desc`)).map(stripCloudFields);
    appState.results_event_history=(await v373FetchAll(`/rest/v1/results_event_history?select=*&organisation_id=eq.${encodeURIComponent(org)}&order=result_date.desc`)).map(stripCloudFields);
    appState.pathway_standards=await v373FetchAll(`/rest/v1/pathway_standards?select=*&active=eq.true&order=progression_order.asc`);
    appState.world_aquatics_base_times=await v373FetchAll(`/rest/v1/world_aquatics_base_times?select=*&active=eq.true`);
    appState.world_para_point_parameters=await v373FetchAll(`/rest/v1/world_para_point_parameters?select=*&active=eq.true`);
    counts.pathway_standards=appState.pathway_standards.length;counts.record_rows=appState.pathway_standards.filter(r=>r.standard_kind==="record"||/record/i.test(String(r.programme||""))).length;
    counts.world_aquatics_base_times=appState.world_aquatics_base_times.length;counts.world_para_point_parameters=appState.world_para_point_parameters.length;
    counts.supplied_results=appState.coach_results.filter(r=>r.excluded_from_pb!==true&&(r.source_row_hash||r.source_type==="official_supplied")).length;
    const v373Rows=appState.coach_results.filter(r=>r.excluded_from_pb!==true&&String(r.id||"").startsWith("result-v373-"));counts.v373_results=v373Rows.length;counts.v373_swimmers=new Set(v373Rows.map(r=>r.athlete_id).filter(Boolean)).size;counts.v373_scwc=v373Rows.filter(r=>v373CanonicalMeet(r.meet_name)==="2026 SCWC Short Course Championships").length;counts.quarantined_results=appState.coach_results.filter(r=>r.excluded_from_pb===true).length;
    const henry=appState.athletes.find(a=>v3NameKey(a.full_name)==="henry crump"),william=appState.athletes.find(a=>v3NameKey(a.full_name)==="william callow");
    counts.henry_scwc=henry?athleteCwscHistory(henry.id).filter(r=>r.meet_name==="2026 SCWC Short Course Championships").length:0;
    counts.william_verified=william?v373Rows.filter(r=>r.athlete_id===william.id).length:0;counts.william_scwc=william?v373Rows.filter(r=>r.athlete_id===william.id&&v373CanonicalMeet(r.meet_name)==="2026 SCWC Short Course Championships").length:0;
    counts.william_pbs=william?athleteOfficialPbs(william.id).length:0;counts.william_gap_rows=william?v373ProgressionRows(william).length:0;counts.william_record_rows=william?athleteRecordRows(william).length:0;
    const checks=[
      [counts.v373_results===524,`v3.7.3 results returned ${counts.v373_results}; expected exactly 524`],
      [counts.v373_swimmers===23,`v3.7.3 results matched ${counts.v373_swimmers} swimmers; expected exactly 23`],
      [counts.v373_scwc===137,`official 2026 SCWC pack returned ${counts.v373_scwc}; expected exactly 137`],
      [counts.henry_scwc===5,`Henry SCWC returned ${counts.henry_scwc}; expected exactly 5`],
      [counts.william_verified===52,`William verified results returned ${counts.william_verified}; expected exactly 52`],
      [counts.william_scwc===7,`William SCWC returned ${counts.william_scwc}; expected exactly 7`],
      [counts.pathway_standards>=3000,`pathway_standards returned ${counts.pathway_standards}; expected at least 3000`],
      [counts.record_rows>=800,`record references returned ${counts.record_rows}; expected at least 800`],
      [counts.world_aquatics_base_times>=70,`WA base times returned ${counts.world_aquatics_base_times}; expected at least 70`],
      [counts.world_para_point_parameters>=384,`WPS parameters returned ${counts.world_para_point_parameters}; expected at least 384`],
      [counts.william_pbs>0,"William Callow has no derived PBs"],
      [counts.william_gap_rows>0,"William Callow has no matching progression rows"],
      [counts.william_record_rows>0,"William Callow has no matching record rows"]
    ];
    const failed=checks.find(([ok])=>!ok);if(failed){const e=new Error(failed[1]);e.syncTable="results_chain";throw e}
    appState.settings.v373_results_health={checked_at:nowIso(),ok:true,counts,error:""};saveState(appState);
  }catch(error){appState.settings.v373_results_health={checked_at:nowIso(),ok:false,counts,error:String(error.message||error)};saveState(appState);if(!error.syncTable)error.syncTable="results_chain";throw error}
};
const v373BaseRenderSyncDetails=v36RenderSyncDetails;
v36RenderSyncDetails=function(){
  v373BaseRenderSyncDetails();const host=$("v36SyncDetails");if(!host)return;const h=appState.settings.v373_results_health||{},c=h.counts||{};
  host.insertAdjacentHTML("beforeend",`<div class="v36-pending-list"><div><strong>Results chain</strong><span>${h.ok?"verified":"not verified"}</span></div><div><strong>Verified v3.7.3 pack</strong><span>${Number(c.v373_results||0)} rows · ${Number(c.v373_swimmers||0)} swimmers</span></div><div><strong>Official 2026 SCWC pack</strong><span>${Number(c.v373_scwc||0)} rows</span></div><div><strong>All supplied results on device</strong><span>${Number(c.supplied_results||0)}</span></div><div><strong>Quarantined old rows</strong><span>${Number(c.quarantined_results||0)}</span></div><div><strong>Pathway rows</strong><span>${Number(c.pathway_standards||0)}</span></div><div><strong>Record rows</strong><span>${Number(c.record_rows||0)}</span></div><div><strong>WA base times</strong><span>${Number(c.world_aquatics_base_times||0)}</span></div><div><strong>WPS parameters</strong><span>${Number(c.world_para_point_parameters||0)}</span></div><div><strong>Henry SCWC rows</strong><span>${Number(c.henry_scwc||0)}</span></div><div><strong>William verified / SCWC rows</strong><span>${Number(c.william_verified||0)} / ${Number(c.william_scwc||0)}</span></div><div><strong>William PB / gaps / records</strong><span>${Number(c.william_pbs||0)} / ${Number(c.william_gap_rows||0)} / ${Number(c.william_record_rows||0)}</span></div>${h.error?`<div><strong>Results error</strong><span>${escapeHtml(h.error)}</span></div>`:""}</div>`);
};

const v373BaseLoadBundled=v36LoadBundledResultsRepair;
v36LoadBundledResultsRepair=async function(){await v373BaseLoadBundled();resultImportFileName=`Bundled supplied results repair · ${resultImportPreview.length} verified rows`;renderResultImportPreview()};
function v373FinalInterface(){
  document.title="McLay Swimming OS — v3.7.3 Results Chain Repair";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.7.3 · complete results → points → gaps → records";
  const old=$("loadBundledResultsRepairBtn");if(old){const fresh=old.cloneNode(true);fresh.textContent="Load the supplied 524-row verified results pack";old.replaceWith(fresh);fresh.addEventListener("click",v36LoadBundledResultsRepair)}
}
// Final redraw uses the repaired result functions.
v373FinalInterface();saveState(appState);renderAll();


// =============================================================================
// McLay Swimming OS v3.7.4 — POOL-DECK STABILITY + PLAN-AWARE SESSION FLOW
// Fast local interactions, compact Deck, plan-linked session intake, accurate
// runnable lines, closest-standard-first ordering, and no whole-block timer jump.
// =============================================================================
const V374_VERSION="3.7.4";
const V374_BUILD="20260727-pool-deck-stability";
const V374_CACHE_DB="mclay_swimming_v374_heavy_cache";
const V374_CACHE_STORE="state";
let v374HeavyCacheTimer=null;
let v374LastHeavySignature="";
let v374ObservedHeavyArrays=new Map();
function v374HeavyArraysChanged(state){
  let changed=false;
  for(const key of V374_HEAVY_STATE_KEYS){
    const rows=state[key]||[],prior=v374ObservedHeavyArrays.get(key);
    if(!prior||prior.ref!==rows||prior.length!==rows.length){changed=true;v374ObservedHeavyArrays.set(key,{ref:rows,length:rows.length})}
  }
  return changed;
}

function v374HeavySignature(state){
  return [...V374_HEAVY_STATE_KEYS].map(key=>{
    const rows=state[key]||[];
    const latest=rows.reduce((max,row)=>String(row?.updated_at||row?.created_at||row?.result_date||"")>max?String(row?.updated_at||row?.created_at||row?.result_date||""):max,"");
    return `${key}:${rows.length}:${latest}`;
  }).join("|");
}
function v374OpenCache(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(V374_CACHE_DB,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(V374_CACHE_STORE))request.result.createObjectStore(V374_CACHE_STORE,{keyPath:"id"})};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function v374SaveHeavyCache(state){
  try{
    const signature=v374HeavySignature(state);if(!signature||signature===v374LastHeavySignature)return;
    const payload={};for(const key of V374_HEAVY_STATE_KEYS)payload[key]=state[key]||[];
    const db=await v374OpenCache();
    await new Promise((resolve,reject)=>{const tx=db.transaction(V374_CACHE_STORE,"readwrite");tx.objectStore(V374_CACHE_STORE).put({id:"latest",signature,payload,updated_at:nowIso()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    v374LastHeavySignature=signature;
  }catch(error){console.warn("Heavy result cache unavailable",error)}
}
window.v374ScheduleHeavyCache=function(state){
  // Ordinary roll, edit and Deck taps leave these arrays untouched, so they no
  // longer rescan thousands of result/standard rows after every interaction.
  if(!v374HeavyArraysChanged(state))return;
  clearTimeout(v374HeavyCacheTimer);
  v374HeavyCacheTimer=setTimeout(()=>v374SaveHeavyCache(state),1200);
};
async function v374HydrateHeavyCache(){
  try{
    const db=await v374OpenCache();
    const cached=await new Promise((resolve,reject)=>{const request=db.transaction(V374_CACHE_STORE).objectStore(V374_CACHE_STORE).get("latest");request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)});
    if(!cached?.payload)return false;
    let changed=false;
    for(const key of V374_HEAVY_STATE_KEYS){
      const incoming=Array.isArray(cached.payload[key])?cached.payload[key]:[];
      if(!incoming.length)continue;
      const current=Array.isArray(appState[key])?appState[key]:[];
      if(key==="coach_results"&&current.length){const map=new Map(incoming.map(row=>[row.id,row]));for(const row of current)map.set(row.id,row);appState[key]=[...map.values()];changed=true}
      else if(!current.length){appState[key]=incoming;changed=true}
    }
    v374LastHeavySignature=cached.signature||v374HeavySignature(appState);
    if(changed)renderAll();
    return changed;
  }catch(error){console.warn("Heavy result cache could not be restored",error);return false}
}

function v374ActiveView(){return document.querySelector(".view.active")?.id||"deck"}
function v374FlushLocalState(){
  if(!v374PendingPersist)return;
  const snapshot=v374PendingPersist;v374PendingPersist=null;
  if(v374StateWriteTimer!==null){clearTimeout(v374StateWriteTimer);v374StateWriteTimer=null}
  try{localStorage.setItem(STATE_KEY,JSON.stringify(snapshot))}catch(error){console.warn("Lightweight local save unavailable",error)}
}
window.addEventListener("pagehide",v374FlushLocalState);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")v374FlushLocalState()});

// More accurate swimming-clock notation: 1.15 and 115 mean 1:15, not 1.15s/1:55.
const v374PriorParseClockValue=parseClockValue;
parseClockValue=function(value){
  const raw=String(value||"").trim();if(!raw)return "";
  if(/^\d{1,2}\.\d{2}$/.test(raw))return raw.replace(".",":");
  if(/^\d{3}$/.test(raw)){const m=Number(raw.slice(0,-2)),s=Number(raw.slice(-2));if(s<60)return `${m}:${String(s).padStart(2,"0")}`}
  return v374PriorParseClockValue(raw);
};
function v374CycleFromLine(raw){
  const match=String(raw||"").match(/(?:\bon\b|@|cycle|every|send\s*[- ]?off|off)\s*(\d{1,2}(?::|\.)\d{2}|\d{2,3})/i);
  return match?parseClockValue(match[1]):"";
}
function v374MetadataLine(raw){
  const line=String(raw||"").trim();
  return /^(date|time|venue|pool|location|squads?|group|title|session title|focus|technical|system|energy system|total|planned distance|duration|master clock|activate|purpose)\s*[:\-–—]?/i.test(line)
    || /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:am|pm|morning|afternoon|evening))?(?:\s*[·|:\-–—].*)?$/i.test(line)
    || /^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}(?:\s+(?:am|pm|morning|afternoon|evening))?$/i.test(line)
    || /\b(?:total session|session total)\b/i.test(line)
    || (/\bminutes?\b/i.test(line)&&/\b\d{3,5}\s*m(?:etres?)?\b/i.test(line));
}
function v374SetLine(line,index=0){
  const raw=String(line||"").replace(/^\s*[-•*]+\s*/,"").trim();if(!raw||v374MetadataLine(raw))return null;
  const repeated=raw.match(/\b(\d{1,3}|\?)\s*[x×]\s*(\d{2,4})\s*m?\b/i);
  const single=!repeated?raw.match(/^\s*(\d{2,4})\s*m?\b/i):null;
  const distance=Number(repeated?.[2]||single?.[1]||0);
  const dynamic=repeated?.[1]==="?";
  const reps=repeated?(dynamic?1:Number(repeated[1])):(single?1:0);
  const runnable=Boolean(distance&&reps);
  const cycle=v374CycleFromLine(raw);
  const stroke=inferStrokeFromLine(raw);
  if(!runnable){
    if(raw.length>160)return null;
    return {id:`cue-${index+1}`,sort_order:index+1,raw,label:raw,reps:0,distance:null,cycle:"",stroke:"",instruction:raw,runnable:false,line_type:"cue"};
  }
  let instruction=raw;
  if(repeated)instruction=instruction.replace(repeated[0],"");else if(single)instruction=instruction.replace(single[0],"");
  instruction=instruction.replace(/(?:\bon\b|@|cycle|every|send\s*[- ]?off|off)\s*\d{1,3}(?::|\.)?\d{0,2}(?:\s*\/\s*\d{1,3}(?::|\.)?\d{0,2})*/i,"").replace(/^\s*[-–—|:]\s*/,"").trim();
  return {id:`line-${index+1}`,sort_order:index+1,raw,label:raw,reps,distance,cycle,stroke,instruction,runnable:true,dynamic_reps:dynamic,line_type:"set"};
}
v32ParseSetLine=v374SetLine;
v32BlockItemsFromText=function(text){return String(text||"").split(/\r?\n/).map((line,index)=>v374SetLine(line,index)).filter(Boolean)};
function v374SanitiseBlock(block,index=0){
  const source=block.raw_text||v32BlockItemsText(block.items||[]);
  const items=v32BlockItemsFromText(source);
  const cueLines=items.filter(item=>item.runnable===false).map(item=>item.raw).filter(Boolean);
  return {...block,block_type:block.block_type||v35InferBlockType(source,index,1),title:block.title||v32BlockLabel(block.block_type||"main_set"),raw_text:source,items,purpose:block.purpose||"",cues:block.cues||cueLines.join(" · "),keep_together:block.keep_together!==false};
}
const v374PriorNormaliseDraftBlock=v361NormaliseDraftBlock;
v361NormaliseDraftBlock=function(block,index){return v374SanitiseBlock(v374PriorNormaliseDraftBlock(block,index),index)};
const v374PriorParseWorkoutBlocks=v36ParseWorkoutBlocks;
v36ParseWorkoutBlocks=function(text){
  return v374PriorParseWorkoutBlocks(text).map(v374SanitiseBlock).filter(block=>{
    if((block.items||[]).length)return true;
    return String(block.raw_text||"").split(/\r?\n/).some(line=>line.trim()&&!v374MetadataLine(line));
  });
};
v35ParseWorkoutBlocks=v36ParseWorkoutBlocks;v32ParseWorkoutBlocks=v36ParseWorkoutBlocks;
function v374RunnableItems(block){return (block?.items||[]).map((item,index)=>item?.raw?v374SetLine(item.raw,index):item).filter(item=>item&&item.runnable!==false&&Number(item.distance)>0&&Number(item.reps)>0)}

function v374WeekStart(dateString){
  const d=new Date(`${dateString}T12:00:00`);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return localIsoDate(d);
}
function v374WeekForDate(dateString){
  const start=v374WeekStart(dateString);
  return appState.weekly_plans.find(week=>week.week_start===start)
    ||appState.weekly_plans.filter(week=>week.week_start&&week.week_start<=dateString).sort((a,b)=>String(b.week_start).localeCompare(String(a.week_start)))[0]
    ||selectedWeeklyPlan();
}
function v374SeasonForDate(dateString,week){
  return appState.season_plans.find(season=>season.id===week?.season_plan_id)
    ||appState.season_plans.find(season=>(!season.start_date||season.start_date<=dateString)&&(!season.end_date||season.end_date>=dateString)&&season.status!=="closed")
    ||selectedSeasonPlan();
}
function v374SlotLabel(dateString,part){return `${weekday(dateString)} ${String(part||"AM").toUpperCase()}`}
function v374SlotLine(week,dateString,part){
  if(!week)return "";const day=weekday(dateString),short=day.slice(0,3),p=String(part||"AM").toUpperCase();
  const structured=week.session_slots||week.sessions||week.timetable;
  if(Array.isArray(structured)){
    const row=structured.find(item=>String(item.day||item.weekday||"").toLowerCase().startsWith(short.toLowerCase())&&String(item.day_part||item.part||p).toUpperCase()===p);
    if(row)return [row.system,row.focus,row.purpose,row.title,row.notes].filter(Boolean).join(" · ");
  }else if(structured&&typeof structured==="object"){
    const row=structured[`${day} ${p}`]||structured[`${short} ${p}`]||structured[day]?.[p];
    if(row)return typeof row==="string"?row:[row.system,row.focus,row.purpose,row.title,row.notes].filter(Boolean).join(" · ");
  }
  const lines=String(week.notes||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const pattern=new RegExp(`^(?:${day}|${short})\\s*(?:${p}|${p==="AM"?"morning":"afternoon|evening"})?\\s*[:=\\-–—]\\s*(.+)$`,"i");
  return lines.map(line=>line.match(pattern)?.[1]||"").find(Boolean)||"";
}
function v374SameSlotSession(draft){
  const day=weekday(draft.session_date),part=draft.day_part;
  const exact=appState.sessions.find(session=>session.session_date===draft.session_date&&session.day_part===part);
  if(exact)return exact;
  return appState.sessions.filter(session=>session.day_part===part&&weekday(session.session_date)===day&&session.session_date<draft.session_date).sort((a,b)=>String(b.session_date).localeCompare(String(a.session_date)))[0]||null;
}
function v374ExplicitLabel(raw,labels){return Boolean(labelledValue(String(raw||""),labels))}
function v374SystemFromContext(text){
  const t=String(text||"");
  if(/aerobic\s+capacity/i.test(t))return "Aerobic capacity";
  if(/aerobic\s+power/i.test(t))return "Aerobic power";
  if(/threshold/i.test(t))return "Threshold";
  if(/race\s*pace/i.test(t))return "Race pace";
  if(/vo2/i.test(t))return "VO₂ max";
  if(/speed|neural/i.test(t))return "Speed / neural";
  if(/recovery/i.test(t))return "Recovery";
  return inferSystem(t);
}
function v374ApplyPlanContext(draft,raw){
  const week=v374WeekForDate(draft.session_date),season=v374SeasonForDate(draft.session_date,week),slot=v374SlotLine(week,draft.session_date,draft.day_part),same=v374SameSlotSession(draft),slotLabel=v374SlotLabel(draft.session_date,draft.day_part);
  if(same&&same.session_date===draft.session_date&&same.day_part===draft.day_part)draft.id=same.id;
  draft.weekly_plan_id=week?.id||same?.weekly_plan_id||null;draft.season_plan_id=season?.id||same?.season_plan_id||null;
  draft.week_start=week?.week_start||same?.week_start||v374WeekStart(draft.session_date);draft.week_phase=week?.phase||same?.week_phase||"";draft.week_objective=week?.objective||same?.week_objective||"";draft.week_carry_forward=week?.carry_forward||same?.week_carry_forward||"";draft.season_name=season?.name||same?.season_name||"";
  if((!draft.squads||!draft.squads.length)&&same?.squads)draft.squads=clone(same.squads);
  if(!draft.venue&&same?.venue)draft.venue=same.venue;if(!draft.lane_count&&same?.lane_count)draft.lane_count=same.lane_count;if(!draft.pool_course&&same?.pool_course)draft.pool_course=same.pool_course;
  if(!v374ExplicitLabel(raw,["primary system","system","energy system"]))draft.primary_system=v374SystemFromContext(slot)||same?.primary_system||((slotLabel==="Monday AM")?"Aerobic capacity":"")||draft.primary_system;
  if(!v374ExplicitLabel(raw,["technical focus","technical","focus","key cue","cue"]))draft.technical_focus=same?.technical_focus||draft.technical_focus||"";
  if(!draft.plan_cue)draft.plan_cue=slot||week?.objective||same?.plan_cue||"";
  if((!draft.title||draft.title==="Imported session")&&same?.title)draft.title=same.title;
  draft.v374_plan_context={slot:slotLabel,source:slot?"weekly plan slot":same?"matching session slot":week?"weekly plan":"Monday AM coaching rule",week:week?.objective||"",season:season?.name||""};
  return draft;
}
const v374PriorParseSession=parseSessionFromChat;
parseSessionFromChat=function(raw){return v374ApplyPlanContext(v374PriorParseSession(raw),raw)};

function v374DraftContextBanner(){
  const host=$("sessionImportPreview"),context=importedSessionDraft?.v374_plan_context;if(!host||!context)return;
  let banner=$("v374DraftContext");if(!banner){banner=document.createElement("div");banner.id="v374DraftContext";banner.className="v374-plan-anchor draft";host.prepend(banner)}
  banner.innerHTML=`<strong>${escapeHtml(context.slot)}</strong><span>${escapeHtml(importedSessionDraft.primary_system||"Plan focus not found")}${context.week?` · ${escapeHtml(context.week)}`:""}</span><small>Auto-linked from ${escapeHtml(context.source)}${context.season?` · ${escapeHtml(context.season)}`:""}</small>`;
}
const v374PriorRenderImportPreview=renderSessionImportPreview;
renderSessionImportPreview=function(){v374PriorRenderImportPreview();v374DraftContextBanner()};

function v374PlanAnchor(){
  const session=selectedSession(),hero=$("deckSessionTitle")?.closest("article");if(!session||!hero)return;
  let host=$("v374PlanAnchor");if(!host){host=document.createElement("div");host.id="v374PlanAnchor";host.className="v374-plan-anchor";const technical=$("deckTechnical")?.closest(".deck-cue-block");(technical||$("deckCueChips"))?.insertAdjacentElement("afterend",host)}
  const {week,season}=v3SessionPlan(session),slot=v374SlotLabel(session.session_date,session.day_part);
  host.innerHTML=`<strong>${escapeHtml(slot)} · ${escapeHtml(session.primary_system||"Plan focus")}</strong><span>${escapeHtml(week?.objective||session.week_objective||session.plan_cue||"No weekly objective linked")}</span>${season?.name||session.season_name?`<small>${escapeHtml(season?.name||session.season_name)}${week?.phase||session.week_phase?` · ${escapeHtml(week?.phase||session.week_phase)}`:""}</small>`:""}`;
}

function v374ActivateDeckBlock(session,block,key){
  v35SetActiveBlock(session.id,key);v374RenderDeckBlocks();
  const selected=$("deckBlockList")?.querySelector(`[data-v35-deck-block="${CSS.escape(key)}"]`);if(selected){selected.open=true;selected.scrollIntoView({block:"start",behavior:"smooth"})}
  updateStatus(`${block.title||v32BlockLabel(block.block_type)} is the current coaching block`,"good");
}
function v374OpenLineTiming(block,item){
  if(!item?.runnable)return;
  v32LiveBlockState={source:"session",id:block.id||"",title:block.title||v32BlockLabel(block.block_type),items:[item],index:0};
  document.body.classList.add("v374-block-running");showView("times");v32LoadLiveLine(item);v374LiveSummary(item,block);
}
function v374LiveSummary(item,block){
  const card=document.querySelector(".live-set-card");if(!card)return;
  let host=$("v374LiveSummary");if(!host){host=document.createElement("div");host.id="v374LiveSummary";host.className="v374-live-summary";card.querySelector(".card-heading")?.insertAdjacentElement("afterend",host)}
  host.innerHTML=`<span>${escapeHtml(block?.title||"Active set")}</span><strong>${escapeHtml(item.raw||item.label||"Set line")}</strong><small>${item.cycle?`Send-off ${escapeHtml(item.cycle)}`:"No send-off entered — add one only if timing this set"}</small>`;
}
function v374RenderDeckBlocks(){
  const host=$("deckBlockList"),session=selectedSession();if(!host||!session)return;
  let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));
  blocks=blocks.map(v374SanitiseBlock);
  let active=v35ActiveBlockId(session.id),keys=blocks.map((block,index)=>block.id||`fallback-${index}`);
  if(!active||!keys.includes(active))active=keys[0]||"";
  host.innerHTML=blocks.length?blocks.map((block,index)=>{
    const key=keys[index],open=key===active,items=block.items||[],distance=items.reduce((sum,item)=>sum+(item.runnable===false?0:Number(item.reps||0)*Number(item.distance||0)),0);
    const lines=items.map((item,lineIndex)=>item.runnable===false
      ?`<div class="v374-deck-cue"><span>Coach cue</span><strong>${escapeHtml(item.raw)}</strong></div>`
      :`<div class="v361-deck-line v374-set-line"><span>${escapeHtml(item.raw)}</span><button type="button" class="secondary" data-v374-time-line="${index}|${lineIndex}">Time</button></div>`).join("");
    return `<details class="v35-deck-block v374-deck-block" data-v35-deck-block="${escapeHtml(key)}" ${open?"open":""}><summary><div><span>${escapeHtml(v32BlockLabel(block.block_type))}</span><strong>${escapeHtml(block.title||v32BlockLabel(block.block_type))}</strong></div><b>${distance?`${distance.toLocaleString()}m`:""}</b></summary><div class="v35-deck-block-body">${block.purpose?`<div class="v361-block-purpose"><b>Purpose</b><span>${escapeHtml(block.purpose)}</span></div>`:""}${block.cues?`<div class="v361-block-purpose v374-cues"><b>Cues</b><span>${escapeHtml(block.cues)}</span></div>`:""}<div class="v361-deck-lines">${lines||`<pre>${escapeHtml(block.raw_text||"No set lines entered.")}</pre>`}</div><div class="button-row v374-block-actions"><button type="button" data-v374-coach-block="${index}">Coach this block</button><button type="button" class="secondary" data-v374-edit-session>Edit session</button></div></div></details>`;
  }).join(""):'<div class="warning-box">No session blocks are available. Open Edit session and check the pasted session.</div>';
  host.querySelectorAll(".v35-deck-block").forEach(detail=>detail.ontoggle=()=>{if(!detail.isConnected||!detail.open)return;host.querySelectorAll(".v35-deck-block").forEach(other=>{if(other!==detail&&other.isConnected)other.open=false});v35SetActiveBlock(session.id,detail.dataset.v35DeckBlock)});
  host.querySelectorAll("[data-v374-coach-block]").forEach(button=>button.onclick=()=>{const index=Number(button.dataset.v374CoachBlock);v374ActivateDeckBlock(session,blocks[index],keys[index])});
  host.querySelectorAll("[data-v374-time-line]").forEach(button=>button.onclick=()=>{const [bi,li]=button.dataset.v374TimeLine.split("|").map(Number);v374OpenLineTiming(blocks[bi],blocks[bi].items[li])});
  host.querySelectorAll("[data-v374-edit-session]").forEach(button=>button.onclick=v361OpenEditLayer);
}
v361RenderDeckBlocksFinal=v374RenderDeckBlocks;v35RenderDeckBlocks=v374RenderDeckBlocks;

// The visible standard list answers “what is closest next?” before points ranking.
function v374GapSort(a,b){
  const ga=Number(a?.gap_seconds),gb=Number(b?.gap_seconds),pa=Number.isFinite(ga)&&ga>0?ga:Number.POSITIVE_INFINITY,pb=Number.isFinite(gb)&&gb>0?gb:Number.POSITIVE_INFINITY;
  return pa-pb||Math.abs(ga)-Math.abs(gb)||String(a.course||"").localeCompare(String(b.course||""))||Number(a.distance||0)-Number(b.distance||0);
}
const v374PriorProgressionRows=v373ProgressionRows;
v373ProgressionRows=function(athlete){return v374PriorProgressionRows(athlete).slice().sort(v374GapSort)};
const v374PriorAthleteTargetRows=athleteTargetRows;
athleteTargetRows=function(athlete){return v374PriorAthleteTargetRows(athlete).slice().sort(v374GapSort)};
const v374PriorAthleteNzscRows=athleteNzscRows;
athleteNzscRows=function(athlete){return v374PriorAthleteNzscRows(athlete).slice().sort(v374GapSort)};
compactGapRows=function(rows,empty){const sorted=(rows||[]).slice().sort(v374GapSort);return sorted.length?sorted.slice(0,8).map((r,index)=>`<div class="mini-result ${index===0?"v374-next-target":""}"><strong>${index===0?"Next target · ":""}${escapeHtml(r.course?`${r.course} `:"")}${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · PB ${escapeHtml(r.pb_time||"—")}</strong><span>${escapeHtml(r.programme||r.age_group||r.para_class||"")} · target ${escapeHtml(r.target_time_text||r.qualifying_time_text||"—")} · ${Number(r.gap_seconds)<=0?`met by ${Math.abs(Number(r.gap_seconds)).toFixed(2)}s`:`${Number(r.gap_seconds).toFixed(2)}s away`}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`};

function v374FastRenderAll(){
  const id=v374ActiveView();
  renderView(id);
  if(id==="deck"){v374PlanAnchor();v374RenderDeckBlocks()}
  if(id==="settings"&&typeof v36RenderSyncDetails==="function")v36RenderSyncDetails();
  if(id==="finish"&&typeof v37RenderReportDue==="function")v37RenderReportDue();
}
renderAll=v374FastRenderAll;

function v374Interface(){
  document.title="McLay Swimming OS — v3.7.4 Pool-Deck Stability";
  const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.7.4 · instant deck actions · plan-aware sessions · closest targets first";
  const liveTitle=document.querySelector(".live-set-card .card-heading h3");if(liveTitle)liveTitle.textContent="Active set timing";
  $("liveBlockCloseBtn")?.addEventListener("click",()=>document.body.classList.remove("v374-block-running"));
  v374PlanAnchor();v374RenderDeckBlocks();
}

// Preserve the current full result/reference pack before future lightweight reloads.
v374SaveHeavyCache(appState);
v374Interface();renderAll();saveState(appState);
// v3.10.3: heavy result/reference data is restored lazily, never during poolside startup.

// -----------------------------------------------------------------------------
// v3.8.0 — T400 foundation + simplified Deck
// The app is a planning / decision / recording tool. Routine set-line watches
// are removed from Deck; timing remains available for deliberate test/key sets.
// -----------------------------------------------------------------------------
const V380_T400_FALLBACK_MODEL={
  "50":{"10":{"Regeneration":1.062,"Development":1.033,"Overload":1.002,"Threshold":0.969,"Clearance":0.941},"30":{"Regeneration":1.02,"Development":0.989,"Overload":0.961,"Threshold":0.931,"Clearance":0.91},"divisor":8},
  "100":{"10":{"Regeneration":1.1165,"Development":1.08,"Overload":1.05,"Threshold":1.024,"Clearance":1},"30":{"Regeneration":1.093,"Development":1.048,"Overload":1.024,"Threshold":0.995,"Clearance":0.972},"divisor":4},
  "200":{"10":{"Regeneration":1.1405,"Development":1.0945,"Overload":1.0687,"Threshold":1.0474,"Clearance":1.0225},"30":{"Regeneration":1.1261,"Development":1.081,"Overload":1.055,"Threshold":1.02518,"Clearance":1.0087},"divisor":2},
  "400":{"10":{"Regeneration":1.156,"Development":1.1142,"Overload":1.091,"Threshold":1.0686,"Clearance":1.04759},"30":{"Regeneration":1.1515,"Development":1.103,"Overload":1.0731,"Threshold":1.0554,"Clearance":1.036},"divisor":1},
  "continuous":{"factors":{"Regeneration":1.193,"Development":1.14,"Overload":1.1075,"Threshold":1.079,"Clearance":1.052},"distances":[600,800,1000,1200],"base_divisor":4}
};
const V380_ZONES=["Regeneration","Development","Overload","Threshold","Clearance"];
for(const key of ["training_pace_models","training_test_types","training_test_results"]){
  if(!CLOUD_TABLES.includes(key))CLOUD_TABLES.push(key);
  if(!Array.isArray(appState[key]))appState[key]=[];
}
if(appState.settings.selected_training_test_athlete_id===undefined)appState.settings.selected_training_test_athlete_id="";
if(appState.settings.active_training_test_type_id===undefined)appState.settings.active_training_test_type_id="";

function v380IsLegacyT400(test){return /(t400|time[ -]?400|400m?[ -]?(time trial|tt)|aerobic training speed)/i.test(`${test?.name||""} ${test?.category||""} ${test?.description||""}`)}
function v380CleanLegacyLocal(){
  const oldIds=new Set((appState.test_sets||[]).filter(v380IsLegacyT400).map(row=>row.id));
  if(oldIds.size){
    appState.test_sets=(appState.test_sets||[]).filter(row=>!oldIds.has(row.id));
    appState.test_set_attempts=(appState.test_set_attempts||[]).filter(row=>!oldIds.has(row.test_set_id));
  }
  for(const athlete of appState.athletes||[])if(athlete&&Object.prototype.hasOwnProperty.call(athlete,"legacy_pace"))delete athlete.legacy_pace;
}
v380CleanLegacyLocal();

const v380PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  const org=appState.settings.organisation_id,user=getAuth()?.user?.id;
  if(table==="training_test_results")return {
    id:record.id,organisation_id:org,test_type_id:record.test_type_id,athlete_id:record.athlete_id||null,
    source_swimmer_name:record.source_swimmer_name||"",match_name:record.match_name||"",
    result_seconds:Number(record.result_seconds),result_date:record.result_date,date_precision:record.date_precision||"day",
    result_period:record.result_period||String(record.result_date||"").slice(0,7),pool_course:record.pool_course||null,
    start_type:record.start_type||"Push",valid_for_anchor:record.valid_for_anchor!==false,
    source_type:record.source_type||"training",source_label:record.source_label||"",
    source_page:record.source_page||null,session_id:record.session_id||null,notes:record.notes||"",
    metadata:record.metadata||{},created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:user
  };
  if(table==="training_test_types"||table==="training_pace_models"){
    const clean={...record,organisation_id:org,created_by:user};return clean;
  }
  return v380PriorCloudRow(table,record);
};

const v380PriorPullCloud=pullCloud;
pullCloud=async function(){await v380PriorPullCloud();v380CleanLegacyLocal();saveState(appState)};

function v380T400Type(){return (appState.training_test_types||[]).find(row=>row.test_key==="t400_freestyle"&&row.active!==false)||null}
function v380PaceModel(){const row=(appState.training_pace_models||[]).find(model=>model.model_key==="t400"&&model.active!==false);return row?.coefficients||V380_T400_FALLBACK_MODEL}
function v380ResultRows(athleteId){const type=v380T400Type();return (appState.training_test_results||[]).filter(row=>row.test_type_id===type?.id&&(!athleteId||row.athlete_id===athleteId)).sort((a,b)=>Number(a.result_seconds)-Number(b.result_seconds)||String(b.result_date||"").localeCompare(String(a.result_date||"")))}
function v380T400Anchor(athleteId){return v380ResultRows(athleteId).find(row=>row.valid_for_anchor!==false)||null}
function v380RoundUp(value,step=5){return Math.ceil(Number(value)/step)*step}
function v380Clock(seconds){if(!Number.isFinite(Number(seconds)))return "—";return v3Time(Number(seconds))}
function v380Period(row){if(!row)return "";if(row.date_precision==="month"||/^\d{4}-\d{2}$/.test(row.result_period||"")){const [y,m]=String(row.result_period||row.result_date).slice(0,7).split("-").map(Number);return new Intl.DateTimeFormat("en-NZ",{month:"short",year:"numeric"}).format(new Date(y,m-1,1))}return resultDateLabel(row.result_date)}
function v380PaceValue(anchorSeconds,distance,zone,rest){const model=v380PaceModel(),section=model[String(distance)],factor=section?.[String(rest)]?.[zone];if(!section||!Number.isFinite(Number(factor)))return null;return Number(anchorSeconds)/Number(section.divisor)*Number(factor)}
function v380PaceTable(anchorSeconds,rest){
  const rows=[50,100,200,400].map(distance=>`<tr><th>${distance}m</th>${V380_ZONES.map(zone=>{const pace=v380PaceValue(anchorSeconds,distance,zone,rest),cycle=v380RoundUp(pace+Number(rest),5);return `<td><strong>${v380Clock(pace)}</strong><span>on ${v380Clock(cycle)}</span></td>`}).join("")}</tr>`).join("");
  return `<div class="v380-table-scroll"><table class="v380-pace-table"><thead><tr><th>Distance</th>${V380_ZONES.map(zone=>`<th>${escapeHtml(zone)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function v380ContinuousTable(anchorSeconds){const model=v380PaceModel().continuous||V380_T400_FALLBACK_MODEL.continuous;return `<div class="v380-table-scroll"><table class="v380-pace-table"><thead><tr><th>Continuous</th>${V380_ZONES.map(zone=>`<th>${escapeHtml(zone)}</th>`).join("")}</tr></thead><tbody>${(model.distances||[600,800,1000,1200]).map(distance=>`<tr><th>${distance}m</th>${V380_ZONES.map(zone=>{const value=(Number(anchorSeconds)/Number(model.base_divisor||4))*Number(model.factors[zone])*Number(distance/100);return `<td><strong>${v380Clock(value)}</strong></td>`}).join("")}</tr>`).join("")}</tbody></table></div>`}
function v380ActiveAthletes(){return (appState.athletes||[]).filter(a=>a.active!==false).slice().sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)))}
function v380SelectedTestAthlete(){const list=v380ActiveAthletes();let id=appState.settings.selected_training_test_athlete_id;if(!list.some(a=>a.id===id))id=appState.settings.selected_athlete_id&&list.some(a=>a.id===appState.settings.selected_athlete_id)?appState.settings.selected_athlete_id:list[0]?.id||"";appState.settings.selected_training_test_athlete_id=id;return list.find(a=>a.id===id)||null}
function v380HistoryHtml(athlete){const rows=v380ResultRows(athlete?.id).slice().sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||"")));if(!rows.length)return '<div class="help">No matched T400 freestyle results yet.</div>';const fastest=Math.min(...rows.filter(r=>r.valid_for_anchor!==false).map(r=>Number(r.result_seconds)));return rows.map(row=>`<div class="v380-history-row ${Number(row.result_seconds)===fastest?"anchor":""}"><div><strong>${v380Clock(row.result_seconds)}</strong><span>${escapeHtml(v380Period(row))}${row.pool_course?` · ${escapeHtml(row.pool_course)}`:" · course not stated"}</span></div><div>${Number(row.result_seconds)===fastest?'<span class="badge">Current anchor</span>':""}<small>${escapeHtml(row.source_label||row.source_type||"Training")}</small></div></div>`).join("")}

function v380RenderTestSets(){
  const section=$("testsets");if(!section)return;const type=v380T400Type(),athlete=v380SelectedTestAthlete(),anchor=v380T400Anchor(athlete?.id),all=(appState.training_test_results||[]).filter(row=>row.test_type_id===type?.id),matched=all.filter(row=>row.athlete_id),unmatched=all.length-matched.length,anchors=new Set(matched.filter(row=>row.valid_for_anchor!==false).map(row=>row.athlete_id)).size;
  section.innerHTML=`<div class="view-heading"><div><h2>Test sets &amp; training speeds</h2><p>Time only the tests and key sets worth keeping. T400 freestyle is the first formula-driven model.</p></div><button id="v380OpenTimingBtn" type="button">Time a T400</button></div>
  <div class="v380-summary-grid"><article><span>Imported history</span><strong>${all.length}</strong><small>${matched.length} matched · ${unmatched} awaiting a roster match</small></article><article><span>Current anchors</span><strong>${anchors}</strong><small>Fastest valid result per swimmer</small></article><article><span>Model</span><strong>${type?"Active":"SQL required"}</strong><small>10s rest · 30s rest · continuous</small></article></div>
  <div class="two-column v380-test-layout"><article class="card"><div class="eyebrow">Timed 400 Freestyle</div><h3>${escapeHtml(type?.name||"Run the v3.9.0 SQL migration first")}</h3><p>${escapeHtml(type?.protocol||"Formula model and result tables are not loaded from Supabase yet.")}</p><label>Swimmer</label><select id="v380AthleteSelect" class="large-select">${v380ActiveAthletes().map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===athlete?.id?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad||"")}</option>`).join("")}</select>${anchor?`<div class="v380-anchor-card"><span>Current fastest anchor</span><strong>${v380Clock(anchor.result_seconds)}</strong><small>${escapeHtml(v380Period(anchor))} · push start${anchor.pool_course?` · ${escapeHtml(anchor.pool_course)}`:" · source course not stated"}</small></div>`:'<div class="warning-box">No matched T400 result for this swimmer.</div>'}<div class="button-row"><button id="v380OpenTimingBtn2" type="button">Open T400 timing</button></div><details><summary><strong>Add a result manually</strong><span>Any valid post-warm-up push-start 400 counts</span></summary><div class="form-grid v380-manual"><div><label>Date</label><input id="v380ResultDate" type="date" value="${localIsoDate(new Date())}"></div><div><label>Time</label><input id="v380ResultTime" inputmode="decimal" placeholder="4:29.2"></div><div><label>Course</label><select id="v380ResultCourse"><option value="">Not stated</option><option value="SCM">SCM / 25m</option><option value="LCM">LCM / 50m</option></select></div></div><button id="v380SaveResultBtn" type="button">Save T400 result</button></details></article>
  <article class="card"><div class="eyebrow">Result history</div><h3>${escapeHtml(athlete?.full_name||"Swimmer")}</h3><div id="v380ResultHistory">${v380HistoryHtml(athlete)}</div></article></div>
  ${anchor?`<article class="card"><div class="card-heading"><div><div class="eyebrow">Aerobic training speeds</div><h3>${escapeHtml(athlete.full_name)} · anchor ${v380Clock(anchor.result_seconds)}</h3></div></div><details open><summary><strong>10-second rest model</strong><span>Pace plus rest, cycle rounded up to 5 seconds</span></summary>${v380PaceTable(Number(anchor.result_seconds),10)}</details><details><summary><strong>30-second rest model</strong><span>Pace plus rest, cycle rounded up to 5 seconds</span></summary>${v380PaceTable(Number(anchor.result_seconds),30)}</details><details><summary><strong>Continuous 600–1200m</strong><span>Master-sheet continuous swimming calculations</span></summary>${v380ContinuousTable(Number(anchor.result_seconds))}</details></article>`:""}
  <article class="card"><div class="eyebrow">Future-ready test types</div><h3>Same structure, different 400</h3><p>Backstroke, breaststroke, butterfly, IM, kick, kick with fins, pull, pull with paddles and swim with fins can be added without changing the result architecture.</p></article>`;
  const choose=$('v380AthleteSelect');if(choose)choose.onchange=()=>{appState.settings.selected_training_test_athlete_id=choose.value;appState.settings.selected_athlete_id=choose.value;saveState(appState);v380RenderTestSets()};
  for(const id of ["v380OpenTimingBtn","v380OpenTimingBtn2"]){const button=$(id);if(button)button.onclick=v380OpenT400Timing}
  const save=$("v380SaveResultBtn");if(save)save.onclick=v380SaveManualResult;
}
renderTestSets=v380RenderTestSets;

async function v380SaveManualResult(){const type=v380T400Type(),athlete=v380SelectedTestAthlete(),date=$("v380ResultDate")?.value,time=v3Seconds($("v380ResultTime")?.value);if(!type)return alert("Run the v3.9.0 SQL migration and sync first.");if(!athlete||!date||!Number.isFinite(time))return alert("Choose a swimmer, date and valid time.");const row={id:uid("training-test"),test_type_id:type.id,athlete_id:athlete.id,source_swimmer_name:athlete.full_name,match_name:athlete.full_name,result_seconds:time,result_date:date,date_precision:"day",result_period:date.slice(0,7),pool_course:$("v380ResultCourse")?.value||null,start_type:"Push",valid_for_anchor:true,source_type:"training",source_label:"Manual training entry",source_page:null,session_id:selectedSession()?.id||null,notes:"",metadata:{after_warm_up:true},created_at:nowIso(),updated_at:nowIso()};upsertLocal("training_test_results",row);queueRecord("training_test_results",row.id);saveState(appState);await syncIfPossible();updateStatus(`${athlete.full_name} T400 saved`,'good');v380RenderTestSets();renderDeckAthleteBrief()}
function v380OpenT400Timing(){const type=v380T400Type();if(!type)return alert("Run the v3.9.0 SQL migration and sync first.");appState.settings.active_training_test_type_id=type.id;saveState(appState);showView("times");$("liveSetLabel").value="Timed 400 Freestyle";$("liveReps").value=1;$("liveDistance").value="400";$("liveStroke").value="Freestyle";$("liveCycle").value="10:00";if($("liveTestSet"))$("liveTestSet").value="";resetLiveRoster();resetLiveSet();renderLiveBoard();v380TimingBanner()}
function v380TimingBanner(){const card=document.querySelector('.live-set-card');if(!card)return;let host=$("v380TimingBanner");if(!host){host=document.createElement('div');host.id='v380TimingBanner';host.className='v380-timing-banner';card.querySelector('.card-heading')?.insertAdjacentElement('afterend',host)}const active=(appState.training_test_types||[]).find(t=>t.id===appState.settings.active_training_test_type_id);host.hidden=!active;host.innerHTML=active?`<strong>${escapeHtml(active.name)}</strong><span>Push start · one master watch · tap each swimmer as they finish. Saving updates the T400 history and aerobic speeds automatically.</span><button type="button" class="secondary" id="v380CancelTestTiming">Cancel test mode</button>`:"";if($("v380CancelTestTiming"))$("v380CancelTestTiming").onclick=()=>{appState.settings.active_training_test_type_id="";saveState(appState);v380TimingBanner()}}

const v380PriorSaveLiveResults=saveLiveResults;
saveLiveResults=async function(){const type=(appState.training_test_types||[]).find(t=>t.id===appState.settings.active_training_test_type_id),session=selectedSession(),snapshot=type&&session?liveChannels.filter(channel=>channel.athlete_id&&channel.finishes.length).map(channel=>({athlete_id:channel.athlete_id,time:channel.finishes.slice().sort((a,b)=>a.rep-b.rep)[0]?.time})).filter(row=>Number.isFinite(row.time)):[];await v380PriorSaveLiveResults();if(!type||!snapshot.length)return;let added=0;for(const item of snapshot){const athlete=appState.athletes.find(a=>a.id===item.athlete_id);if(!athlete)continue;const exists=(appState.training_test_results||[]).some(row=>row.test_type_id===type.id&&row.athlete_id===athlete.id&&row.session_id===session.id&&Math.abs(Number(row.result_seconds)-Number(item.time))<0.01);if(exists)continue;const row={id:uid("training-test"),test_type_id:type.id,athlete_id:athlete.id,source_swimmer_name:athlete.full_name,match_name:athlete.full_name,result_seconds:item.time,result_date:session.session_date,date_precision:"day",result_period:session.session_date.slice(0,7),pool_course:session.pool_course||null,start_type:"Push",valid_for_anchor:true,source_type:"training",source_label:"T400 timing window",source_page:null,session_id:session.id,notes:"",metadata:{after_warm_up:true},created_at:nowIso(),updated_at:nowIso()};upsertLocal("training_test_results",row);queueRecord("training_test_results",row.id);added++}if(added){saveState(appState);await syncIfPossible();updateStatus(`${added} T400 result${added===1?'':'s'} saved and speeds updated`,'good')}renderAll()};
if($("liveSaveBtn"))$("liveSaveBtn").onclick=saveLiveResults;

function v380BlockDistance(block){const items=(block.items||[]).filter(item=>item.runnable!==false&&Number(item.reps)>0&&Number(item.distance)>0),totals=items.map(item=>Number(item.reps)*Number(item.distance)),sum=totals.reduce((a,b)=>a+b,0);if(items.length>1){for(let i=0;i<items.length;i++){const raw=String(items[i].raw||"").toLowerCase(),isSummary=raw.includes(String(block.title||"").toLowerCase())||/^(warm[- ]?up|pre[- ]?set|main set|pull|skill|warm[- ]?down)\b/.test(raw);if(isSummary&&Math.abs(totals[i]-(sum-totals[i]))<0.1)return totals[i]}}return sum}
function v380RenderDeckBlocks(){const host=$("deckBlockList"),session=selectedSession();if(!host||!session)return;let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));blocks=blocks.map(v374SanitiseBlock);let active=v35ActiveBlockId(session.id),keys=blocks.map((block,index)=>block.id||`fallback-${index}`);if(!active||!keys.includes(active))active=keys[0]||"";host.innerHTML=blocks.length?blocks.map((block,index)=>{const key=keys[index],open=key===active,distance=v380BlockDistance(block),lines=(block.items||[]).map(item=>item.runnable===false?`<div class="v374-deck-cue"><span>Coach cue</span><strong>${escapeHtml(item.raw)}</strong></div>`:`<div class="v361-deck-line v380-set-line"><span>${escapeHtml(item.raw)}</span></div>`).join("");return `<details class="v35-deck-block v374-deck-block" data-v35-deck-block="${escapeHtml(key)}" ${open?'open':''}><summary><div><span>${escapeHtml(v32BlockLabel(block.block_type))}</span><strong>${escapeHtml(block.title||v32BlockLabel(block.block_type))}</strong></div><b>${distance?`${distance.toLocaleString()}m`:''}</b></summary><div class="v35-deck-block-body">${block.purpose?`<div class="v361-block-purpose"><b>Purpose</b><span>${escapeHtml(block.purpose)}</span></div>`:''}${block.cues?`<div class="v361-block-purpose v374-cues"><b>Cues</b><span>${escapeHtml(block.cues)}</span></div>`:''}<div class="v361-deck-lines">${lines||`<pre>${escapeHtml(block.raw_text||'No set lines entered.')}</pre>`}</div><div class="button-row v374-block-actions"><button type="button" data-v380-coach-block="${index}">Current set</button><button type="button" class="secondary" data-v374-edit-session>Edit session</button></div></div></details>`}).join(''):'<div class="warning-box">No session sections are available. Open Edit session and check the pasted session.</div>';host.querySelectorAll('.v35-deck-block').forEach(detail=>detail.ontoggle=()=>{if(!detail.isConnected||!detail.open)return;host.querySelectorAll('.v35-deck-block').forEach(other=>{if(other!==detail&&other.isConnected)other.open=false});v35SetActiveBlock(session.id,detail.dataset.v35DeckBlock)});host.querySelectorAll('[data-v380-coach-block]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.v380CoachBlock);v374ActivateDeckBlock(session,blocks[index],keys[index])});host.querySelectorAll('[data-v374-edit-session]').forEach(button=>button.onclick=v361OpenEditLayer)}
v374RenderDeckBlocks=v380RenderDeckBlocks;v361RenderDeckBlocksFinal=v380RenderDeckBlocks;v35RenderDeckBlocks=v380RenderDeckBlocks;

const v380PriorAthleteQuickHtml=athleteQuickHtml;
athleteQuickHtml=function(athlete){if(!athlete)return v380PriorAthleteQuickHtml(athlete);let html=v380PriorAthleteQuickHtml(athlete).replace(/<div class="deck-answer-row"><span>Legacy pace reference<\/span><strong>.*?<\/strong><\/div>/s,'');const anchor=v380T400Anchor(athlete.id);if(!anchor)return html.replace('<div class="deck-answer-row"><span>Latest note</span>',`<div class="deck-answer-row"><span>T400 freestyle</span><strong>No matched result yet</strong></div><div class="deck-answer-row"><span>Latest note</span>`);const development=v380PaceValue(Number(anchor.result_seconds),100,'Development',10),threshold=v380PaceValue(Number(anchor.result_seconds),100,'Threshold',10);return html.replace('<div class="deck-answer-row"><span>Latest note</span>',`<div class="deck-answer-row"><span>T400 freestyle anchor</span><strong>${v380Clock(anchor.result_seconds)} · ${escapeHtml(v380Period(anchor))}</strong></div><div class="deck-answer-row"><span>Aerobic 100 targets</span><strong>Development ${v380Clock(development)} on ${v380Clock(v380RoundUp(development+10,5))} · Threshold ${v380Clock(threshold)} on ${v380Clock(v380RoundUp(threshold+10,5))}</strong></div><div class="deck-answer-row"><span>Latest note</span>`)};
renderPaceReference=function(){const athlete=appState.athletes.find(a=>a.id===$("timeAthlete")?.value),anchor=v380T400Anchor(athlete?.id);const host=$("paceReference");if(!host)return;host.innerHTML=anchor?`<div class="result"><strong>${escapeHtml(athlete.full_name)}</strong><br>T400 ${v380Clock(anchor.result_seconds)} · ${escapeHtml(v380Period(anchor))}<br>100 Development (+10): ${v380Clock(v380PaceValue(anchor.result_seconds,100,'Development',10))}<br>100 Threshold (+10): ${v380Clock(v380PaceValue(anchor.result_seconds,100,'Threshold',10))}</div>`:'<div class="warning-box">No matched T400 freestyle result for this swimmer.</div>'};

function v380InjectStyles(){if($("v380Styles"))return;const style=document.createElement('style');style.id='v380Styles';style.textContent=`
.v380-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem;margin-bottom:.8rem}.v380-summary-grid article{background:#fff;border:1px solid #b8ceda;border-radius:16px;padding:1rem;display:grid;gap:.25rem}.v380-summary-grid span,.v380-anchor-card span{font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:#56707d;font-weight:800}.v380-summary-grid strong{font-size:1.7rem;color:#123a5b}.v380-summary-grid small{color:#5f717a}.v380-anchor-card{margin:.8rem 0;padding:1rem;border-radius:15px;background:#e6f5ed;border:1px solid #8bc6a4;display:grid;gap:.2rem}.v380-anchor-card strong{font-size:2rem;color:#123a5b}.v380-history-row{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid #d9e4e9}.v380-history-row>div{display:grid;gap:.15rem}.v380-history-row span,.v380-history-row small{color:#637782}.v380-history-row.anchor{background:#eef8f2;padding:.75rem;border-radius:12px}.v380-table-scroll{overflow:auto;margin:.7rem 0}.v380-pace-table{border-collapse:separate;border-spacing:0;min-width:860px;width:100%}.v380-pace-table th,.v380-pace-table td{padding:.65rem;border-right:1px solid #d4e1e7;border-bottom:1px solid #d4e1e7;text-align:left}.v380-pace-table thead th{position:sticky;top:0;background:#123a5b;color:#fff}.v380-pace-table tbody th{background:#e9f2f7}.v380-pace-table td strong,.v380-pace-table td span{display:block}.v380-pace-table td span{font-size:.8rem;color:#60737d}.v380-timing-banner{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;background:#e7f5ed;border:1px solid #7fbd99;border-radius:14px;padding:.8rem;margin:.7rem 0}.v380-timing-banner span{flex:1;min-width:220px}.v380-set-line{padding:.75rem 1rem}.v380-manual{margin:.75rem 0}@media(max-width:720px){.v380-summary-grid{grid-template-columns:1fr}.v380-test-layout{grid-template-columns:1fr}.v380-anchor-card strong{font-size:1.65rem}}
`;document.head.appendChild(style)}

const v380PriorRenderView=renderView;
renderView=function(id){v380PriorRenderView(id);if(id==='testsets')v380RenderTestSets();if(id==='times')v380TimingBanner();if(id==='deck')v380RenderDeckBlocks()};
const v380PriorRenderAll=renderAll;
renderAll=function(){v380PriorRenderAll();const id=document.querySelector('.view.active')?.id;if(id==='testsets')v380RenderTestSets();if(id==='times')v380TimingBanner();if(id==='deck')v380RenderDeckBlocks()};
function v380Interface(){v380InjectStyles();document.title='McLay Swimming OS — v3.8.0 T400 Foundation';const subtitle=document.querySelector('.header-subtitle');if(subtitle)subtitle.textContent='Version 3.8.0 · simplified Deck · T400 training speeds · meaningful timing only';const timingHeading=$("times")?.querySelector('.view-heading h2');if(timingHeading)timingHeading.textContent='Test & key set timing';const timingCopy=$("times")?.querySelector('.view-heading p');if(timingCopy)timingCopy.textContent='Use timing deliberately for T400s, other test sets and key monitored work.';const runner=$("liveBlockRunnerCard");if(runner)runner.hidden=true;v380CleanLegacyLocal();saveState(appState);v380TimingBanner();v380RenderDeckBlocks()}
v380Interface();renderAll();

// -----------------------------------------------------------------------------
// v3.8.1 — coherent desktop + assistant coach portal v1
// Separate coach accounts use the same app and the same organisation, while
// Supabase RLS enforces assigned squads and explicit permissions.
// -----------------------------------------------------------------------------
const V381_BUILD="20260727-coach-system-381";
const V381_INVITE_KEY="mclay_swimming_assistant_invite";
const V381_PERMISSION_CATALOG=[
  {key:"view_deck",label:"View assigned sessions on Deck",group:"Poolside",default:true},
  {key:"mark_attendance",label:"Mark attendance",group:"Poolside",default:true},
  {key:"add_notes",label:"Add swimmer and session notes",group:"Poolside",default:true},
  {key:"record_times",label:"Record key-set times",group:"Poolside",default:true},
  {key:"record_tests",label:"Record T400 and other tests",group:"Poolside",default:true},
  {key:"view_test_speeds",label:"View T400 training speeds",group:"Information",default:true},
  {key:"view_swimmer_profiles",label:"View assigned swimmer profiles",group:"Information",default:true},
  {key:"view_plans",label:"Use weekly/season-plan context on Deck",group:"Information",default:true},
  {key:"view_adaptations",label:"View individual modifications",group:"Information",default:true},
  {key:"view_results",label:"View assigned swimmers' race results",group:"Information",default:false},
  {key:"view_goals",label:"View assigned swimmers' goals",group:"Information",default:false},
  {key:"view_reports",label:"View coaching reports",group:"Information",default:false},
  {key:"edit_lanes",label:"Change lane assignments",group:"Extra control",default:false},
  {key:"complete_sessions",label:"Complete and review sessions",group:"Extra control",default:false},
  {key:"edit_sessions",label:"Create and edit sessions",group:"Administration",default:false},
  {key:"manage_athletes",label:"Edit swimmer profiles",group:"Administration",default:false},
  {key:"edit_adaptations",label:"Edit individual modification rules",group:"Administration",default:false},
  {key:"edit_goals",label:"Edit race goals",group:"Administration",default:false},
  {key:"edit_results",label:"Edit official result data",group:"Administration",default:false},
  {key:"edit_plans",label:"Edit season and weekly plans",group:"Administration",default:false},
  {key:"view_all_squads",label:"Access every squad",group:"Administration",default:false}
];
const V381_OWNER_ROLES=new Set(["owner","head_coach","admin"]);
let v381CoachRosterCache=[];
let v381AccessGuard=false;

for(const [key,value] of Object.entries({membership_role:"",membership_display_name:"",membership_email:"",membership_active:true,membership_permissions:{},assigned_squads:[],local_identity_key:""})){
  if(appState.settings[key]===undefined)appState.settings[key]=value;
}

(function v381PersistInviteFromUrl(){
  const token=new URLSearchParams(location.search).get("coach_invite");
  if(token)try{localStorage.setItem(V381_INVITE_KEY,token)}catch{}
})();
function v381InviteToken(){try{return new URLSearchParams(location.search).get("coach_invite")||localStorage.getItem(V381_INVITE_KEY)||""}catch{return ""}}
function v381ClearInviteToken(){try{localStorage.removeItem(V381_INVITE_KEY)}catch{}const url=new URL(location.href);url.searchParams.delete("coach_invite");history.replaceState({},"",url.toString())}
function v381Role(){return String(appState.settings.membership_role||"").toLowerCase()}
function v381HasMembership(){return Boolean(v381Role())}
function v381IsOwner(){return !getAuth()?.access_token||!v381HasMembership()||V381_OWNER_ROLES.has(v381Role())}
function v381IsAssistant(){return Boolean(getAuth()?.access_token)&&v381Role()==="assistant_coach"}
function v381Permissions(){const p=appState.settings.membership_permissions;return p&&typeof p==="object"&&!Array.isArray(p)?p:{}}
function v381Can(key){return v381IsOwner()||v381Permissions()[key]===true}
function v381RoleLabel(){if(v381IsAssistant())return "Assistant Coach";if(V381_OWNER_ROLES.has(v381Role()))return v381Role()==="owner"?"Head Coach / Owner":"Head Coach";return getAuth()?.access_token?"Coach":"Local coaching mode"}
function v381DefaultPermissions(){return Object.fromEntries(V381_PERMISSION_CATALOG.map(item=>[item.key,item.default===true]))}
function v381NormalisedPermissions(input){const out={...v381DefaultPermissions(),...(input||{})};if(out.record_tests)out.record_times=true;return out}
function v381AssignedSquads(){return Array.isArray(appState.settings.assigned_squads)?appState.settings.assigned_squads:[]}

function v381ResetStateForIdentity(userId,orgId,role){
  const key=`${userId}:${orgId}`;
  const previous=String(appState.settings.local_identity_key||"");
  if(!previous&&role!=="assistant_coach"){
    appState.settings.local_identity_key=key;return;
  }
  if(previous===key)return;
  const collections=new Set([...CLOUD_TABLES,...RESULT_VIEWS,...REFERENCE_TABLES,"pathway_standards","pathway_meets"]);
  for(const name of collections)if(Array.isArray(appState[name]))appState[name]=[];
  appState.pending=[];
  appState.settings.selected_session_id="";
  appState.settings.selected_squad="";
  appState.settings.selected_athlete_id="";
  appState.settings.local_identity_key=key;
}

async function v381FetchMembership(userId){
  try{
    return await cloudFetch(`/rest/v1/organisation_members?select=organisation_id,role,display_name,email,active,assigned_squads,permissions&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  }catch(error){
    const basic=await cloudFetch(`/rest/v1/organisation_members?select=organisation_id,role&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
    return basic.map(row=>({...row,display_name:"",email:getAuth()?.user?.email||"",active:true,assigned_squads:[],permissions:{}}));
  }
}
function v381ApplyMembership(membership){
  const auth=getAuth();
  v381ResetStateForIdentity(auth.user.id,membership.organisation_id,String(membership.role||"").toLowerCase());
  appState.settings.organisation_id=membership.organisation_id;
  appState.settings.user_id=auth.user.id;
  appState.settings.membership_role=String(membership.role||"").toLowerCase();
  appState.settings.membership_display_name=membership.display_name||"";
  appState.settings.membership_email=membership.email||auth.user.email||"";
  appState.settings.membership_active=membership.active!==false;
  appState.settings.assigned_squads=Array.isArray(membership.assigned_squads)?membership.assigned_squads:[];
  appState.settings.membership_permissions=v381IsOwner()?v381NormalisedPermissions(Object.fromEntries(V381_PERMISSION_CATALOG.map(p=>[p.key,true]))):v381NormalisedPermissions(membership.permissions||{});
  saveState(appState);
}

const v381BaseEnsureOrganisation=ensureOrganisation;
ensureOrganisation=async function(){
  const auth=getAuth();
  if(!auth?.user?.id)throw new Error("Sign in first.");
  let memberships=await v381FetchMembership(auth.user.id);
  if(!memberships.length){
    const invite=v381InviteToken();
    if(invite){
      try{
        await cloudFetch("/rest/v1/rpc/mclay_accept_assistant_invite",{method:"POST",body:JSON.stringify({invite_token:invite})});
        v381ClearInviteToken();
        memberships=await v381FetchMembership(auth.user.id);
      }catch(error){
        throw new Error(`${error.message} Run the v3.9.0 SQL first if the assistant-coach migration is not installed.`);
      }
    }else{
      await v381BaseEnsureOrganisation();
      memberships=await v381FetchMembership(auth.user.id);
    }
  }
  const membership=memberships[0];
  if(!membership)throw new Error("No organisation membership was found.");
  if(membership.active===false)throw new Error("This coach account is suspended. Ask the head coach to restore access.");
  v381ApplyMembership(membership);
  if(v381IsOwner())await bootstrapOrganisationData(membership.organisation_id);
  v381Interface();
  return membership.organisation_id;
};

const v381OwnerPullCloud=pullCloud;
async function v381AssistantPullCloud(){
  if(!cloudReady())return;
  const org=appState.settings.organisation_id;
  for(const table of CLOUD_TABLES){
    try{
      const rows=await cloudFetch(`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);
      appState[table]=mergeCollection(appState[table]||[],rows.map(stripCloudFields));
    }catch(error){
      console.warn(`Assistant scope skipped ${table}`,error);
      if(!Array.isArray(appState[table]))appState[table]=[];
    }
  }
  for(const view of RESULT_VIEWS){
    if(!(v381Can("view_results")||v381Can("view_pacing"))){appState[view]=[];continue}
    try{
      const path=`/rest/v1/${view}?select=*&organisation_id=eq.${encodeURIComponent(org)}`;
      const rows=typeof v373FetchAll==="function"?await v373FetchAll(path):await cloudFetch(path);
      appState[view]=rows.map(stripCloudFields);
    }catch(error){console.warn(`Assistant result view ${view} unavailable`,error);appState[view]=[]}
  }
  if(v381Can("view_results")||v381Can("view_goals")||v381Can("view_pacing")){
    for(const table of ["pathway_standards","pathway_meets",...REFERENCE_TABLES]){
      try{
        const query=table==="pathway_standards"?"?select=*&active=eq.true&order=progression_order.asc":table==="pathway_meets"?"?select=*&order=progression_order.asc":"?select=*";
        appState[table]=typeof v373FetchAll==="function"?await v373FetchAll(`/rest/v1/${table}${query}`):await cloudFetch(`/rest/v1/${table}${query}`);
      }catch(error){console.warn(`Assistant reference ${table} unavailable`,error);appState[table]=[]}
    }
  }else{
    appState.pathway_standards=[];appState.pathway_meets=[];
    for(const table of REFERENCE_TABLES)appState[table]=[];
  }
  if(typeof v33FilterDeletedSessions==="function")v33FilterDeletedSessions();
  if(!appState.sessions.some(s=>s.id===appState.settings.selected_session_id)){
    const next=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0];
    appState.settings.selected_session_id=next?.id||"";
    appState.settings.selected_squad=sessionSquads(next)[0]||"";
    appState.settings.selected_athlete_id="";
    resetLiveRoster();
  }
  appState.settings.v373_results_health={checked_at:nowIso(),ok:true,assistant_scope:true,counts:{},error:""};
  saveState(appState);
}
pullCloud=async function(){return v381IsAssistant()?v381AssistantPullCloud():v381OwnerPullCloud()};

const v381BaseStripCloudFields=stripCloudFields;
stripCloudFields=function(row){const copy=v381BaseStripCloudFields(row);if(row?.created_by)copy.created_by=row.created_by;return copy};

function v381AllowedView(id){
  if(v381IsOwner())return id!=="coaches"||Boolean(getAuth()?.access_token&&appState.settings.organisation_id);
  const rules={
    deck:"view_deck",overview:"view_deck",attendance:"mark_attendance",capture:"add_notes",
    finish:"complete_sessions",times:["record_times","record_tests"],testsets:"view_test_speeds",
    athletes:"view_swimmer_profiles",results:"view_results",reports:"view_reports",settings:true,
    planning:"edit_plans",sessions:"edit_sessions",resultsupdate:"edit_results",manage:false,coaches:false
  };
  const rule=rules[id];
  if(rule===true)return true;if(rule===false||rule===undefined)return false;
  return Array.isArray(rule)?rule.some(v381Can):v381Can(rule);
}
function v381Hide(selector,hidden=true){document.querySelectorAll(selector).forEach(node=>node.hidden=hidden)}
function v381ApplyAccess(){
  const roleBadge=$("v381RoleBadge");if(roleBadge){roleBadge.textContent=v381RoleLabel();roleBadge.title=v381AssignedSquads().length?`Assigned: ${v381AssignedSquads().join(", ")}`:""}
  document.querySelectorAll("[data-view]").forEach(button=>{button.hidden=!v381AllowedView(button.dataset.view)});
  const edits=!v381Can("edit_sessions");
  v381Hide("#contextAddSessionBtn,#deckEditSessionBtn,#deckAddSessionBtn,#newSessionBtn,#saveSessionBtn,#saveSessionAndUseBtn,#deleteSessionBtn,#newSessionBlockBtn,#saveSessionBlockBtn,#duplicateSessionBlockBtn,#deleteSessionBlockBtn,#sessionImportDetails,[data-v374-edit-session]",edits);
  v381Hide("#markAllPresentBtn,#clearAttendanceBtn,#saveAttendanceBtn",!v381Can("mark_attendance"));
  v381Hide("#clearCaptureBtn,#saveVoiceTranscriptBtn,#deleteVoiceTranscriptBtn,#saveTextCaptureBtn,#quickSessionPhotoTranscribeBtn",!v381Can("add_notes"));
  v381Hide("#finishSessionBtn",!v381Can("complete_sessions"));
  v381Hide("#saveStopwatchSetBtn,#saveManualSetBtn",!v381Can("record_times"));
  v381Hide("#v380OpenTimingBtn,#v380OpenTimingBtn2,#v380SaveResultBtn",!v381Can("record_tests"));
  v381Hide("#saveAthleteProfileBtn",!v381Can("manage_athletes"));
  v381Hide("#newRaceGoalBtn,#saveRaceGoalBtn,#deleteRaceGoalBtn,#generateGoalSplitsBtn",!v381Can("edit_goals"));
  v381Hide("#newSeasonBtn,#saveSeasonBtn,#deleteSeasonBtn,#newWeekBtn,#saveWeekBtn,#deleteWeekBtn",!v381Can("edit_plans"));
  v381Hide("#newTestSetBtn,#saveTestSetBtn,#deleteTestSetBtn,#archiveTestSetBtn,#duplicateTestSetBtn",!v381IsOwner());
  const active=document.querySelector(".view.active")?.id;
  if(active&&!v381AllowedView(active)&&!v381AccessGuard){v381AccessGuard=true;showView(v381AllowedView("deck")?"deck":"settings");v381AccessGuard=false}
}

function v381InjectPortal(){
  if(!$("v381RoleBadge")){
    const badge=document.createElement("span");badge.id="v381RoleBadge";badge.className="v381-role-badge";
    document.querySelector(".status-cluster")?.prepend(badge);
  }
  if(!document.querySelector('.sidebar [data-view="coaches"]')){
    const button=document.createElement("button");button.className="nav-button";button.dataset.view="coaches";button.textContent="Assistant coaches";
    const settings=document.querySelector('.sidebar [data-view="settings"]');settings?.before(button);
  }
  if(!document.querySelector('.mobile-nav [data-view="coaches"]')){
    const button=document.createElement("button");button.className="nav-button";button.dataset.view="coaches";button.innerHTML="<span>♙</span>Coaches";
    const settings=document.querySelector('.mobile-nav [data-view="settings"]');settings?.before(button);
  }
  if(!$("coaches")){
    const section=document.createElement("section");section.id="coaches";section.className="view";
    section.innerHTML='<div class="view-heading"><div><h2>Assistant coaches</h2><p>Invite a coach into the same organisation, assign squads and decide exactly what they can see or record.</p></div></div><div id="v381CoachPortal"></div>';
    $("settings")?.before(section);
  }
  const account=$("authEmail")?.closest("article");
  if(account&&v381InviteToken()&&!$("v381InviteNotice")){
    const notice=document.createElement("div");notice.id="v381InviteNotice";notice.className="warning-box";
    notice.innerHTML="<strong>Assistant-coach invitation detected.</strong><br>Sign up or sign in with the invited email address. This app will join the existing coaching organisation instead of creating a new one.";
    account.prepend(notice);
  }
}
function v381Squads(){return [...new Set((appState.athletes||[]).filter(a=>a.active!==false&&a.squad).map(a=>a.squad))].sort((a,b)=>a.localeCompare(b))}
function v381PermissionInputs(prefix,permissions=v381DefaultPermissions()){
  const groups=[...new Set(V381_PERMISSION_CATALOG.map(p=>p.group))];
  return groups.map(group=>`<fieldset class="v381-permission-group"><legend>${escapeHtml(group)}</legend>${V381_PERMISSION_CATALOG.filter(p=>p.group===group).map(p=>`<label class="v381-check"><input type="checkbox" data-v381-permission="${escapeHtml(p.key)}" data-v381-prefix="${escapeHtml(prefix)}" ${permissions[p.key]===true?"checked":""}><span>${escapeHtml(p.label)}</span></label>`).join("")}</fieldset>`).join("")
}
function v381SquadInputs(prefix,selected=[]){const squads=v381Squads();return squads.length?squads.map(s=>`<label class="v381-check"><input type="checkbox" data-v381-squad="${escapeHtml(s)}" data-v381-prefix="${escapeHtml(prefix)}" ${selected.includes(s)?"checked":""}><span>${escapeHtml(s)}</span></label>`).join(""):'<span class="help">No squad names are loaded yet.</span>'}
function v381ValuesFor(prefix){
  const root=document.querySelector(`[data-v381-editor="${CSS.escape(prefix)}"]`)||$("v381InviteForm");
  const squads=[...root.querySelectorAll('[data-v381-squad]:checked')].map(input=>input.dataset.v381Squad);
  const permissions={};for(const input of root.querySelectorAll('[data-v381-permission]'))permissions[input.dataset.v381Permission]=input.checked;
  if(permissions.record_tests)permissions.record_times=true;
  return {squads,permissions};
}
function v381InviteLink(token){const url=new URL(location.href);url.search="";url.hash="";url.searchParams.set("coach_invite",token);return url.toString()}
async function v381Copy(text){try{await navigator.clipboard.writeText(text);updateStatus("Invitation link copied","good")}catch{window.prompt("Copy this link:",text)}}

async function v381LoadCoachRoster(){
  if(!v381IsOwner()||!cloudReady())return [];
  const result=await cloudFetch("/rest/v1/rpc/mclay_coach_access_roster",{method:"POST",body:JSON.stringify({target_org:appState.settings.organisation_id})});
  v381CoachRosterCache=Array.isArray(result)?result:[];return v381CoachRosterCache;
}
function v381RosterCard(row,index){
  const prefix=`coach-${index}`;const pending=row.status==="invited";const link=pending?v381InviteLink(row.invite_token):"";
  return `<article class="card v381-coach-card" data-v381-editor="${prefix}" data-v381-user="${escapeHtml(row.user_id||"")}" data-v381-token="${escapeHtml(row.invite_token||"")}"><div class="card-heading"><div><div class="eyebrow">${pending?"Invitation pending":"Assistant coach"}</div><h3>${escapeHtml(row.display_name||row.email||"Coach")}</h3><p>${escapeHtml(row.email||"")} · ${escapeHtml(row.status||"")}</p></div><span class="badge ${row.active?"good":"warning"}">${pending?"Invited":row.active?"Active":"Suspended"}</span></div>
  ${pending?`<label>Invitation link</label><div class="v381-copy-row"><input value="${escapeHtml(link)}" readonly><button type="button" data-v381-copy="${escapeHtml(link)}">Copy</button></div><p class="help">Expires ${row.expires_at?new Date(row.expires_at).toLocaleString("en-NZ"):"—"}</p><button type="button" class="secondary" data-v381-cancel-invite="${escapeHtml(row.invite_token)}">Cancel invitation</button>`:
  `<label>Coach name</label><input data-v381-name value="${escapeHtml(row.display_name||"")}"><div class="v381-access-grid"><fieldset><legend>Assigned squads</legend>${v381SquadInputs(prefix,row.assigned_squads||[])}</fieldset><div>${v381PermissionInputs(prefix,v381NormalisedPermissions(row.permissions||{}))}</div></div><label class="v381-check"><input data-v381-active type="checkbox" ${row.active?"checked":""}><span>Account active</span></label><div class="button-row"><button type="button" data-v381-save-access>Save access</button><button type="button" class="danger-button" data-v381-revoke-access>Suspend</button></div>`}</article>`;
}
async function v381RenderCoachPortal(refresh=true){
  const host=$("v381CoachPortal");if(!host)return;
  if(!v381IsOwner()){host.innerHTML='<div class="v381-access-denied"><strong>Owner access only.</strong><br>Assistant coaches cannot manage other accounts.</div>';return}
  if(!cloudReady()){host.innerHTML='<div class="warning-box">Sign in before inviting another coach.</div>';return}
  const defaults=v381DefaultPermissions();
  host.innerHTML=`<article class="card" id="v381InviteForm"><div class="eyebrow">New assistant coach</div><h3>Create a separate sign-in</h3><p>The coach receives a link, signs in with their own email and sees only the squads and tools selected here.</p><div class="form-grid"><div><label>Name</label><input id="v381InviteName" placeholder="Jordan"></div><div><label>Email</label><input id="v381InviteEmail" type="email" placeholder="coach@example.com"></div></div><fieldset><legend>Assigned squads</legend><div class="v381-check-grid">${v381SquadInputs("invite",[])}</div></fieldset><details open><summary><strong>Permissions</strong><span>Safe poolside defaults</span></summary><div class="v381-permission-grid">${v381PermissionInputs("invite",defaults)}</div></details><button id="v381CreateInviteBtn" type="button">Create assistant-coach invitation</button><div id="v381InviteResult"></div></article><div class="view-heading v381-team-heading"><div><h2>Coach access</h2><p>Changes take effect on the coach's next sync.</p></div><button id="v381RefreshCoaches" class="secondary" type="button">Refresh</button></div><div id="v381CoachRoster"><div class="help">Loading coach access…</div></div>`;
  $("v381CreateInviteBtn").onclick=v381CreateInvite;
  $("v381RefreshCoaches").onclick=()=>v381RenderCoachPortal(true);
  try{if(refresh||!v381CoachRosterCache.length)await v381LoadCoachRoster();v381RenderRosterList()}catch(error){$("v381CoachRoster").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}<br>Run the v3.9.0 SQL migration if the coach-access functions are not installed.</div>`}
}
function v381RenderRosterList(){
  const host=$("v381CoachRoster");if(!host)return;host.innerHTML=v381CoachRosterCache.length?v381CoachRosterCache.map(v381RosterCard).join(""):'<div class="help">No assistant coaches have been invited yet.</div>';
  host.querySelectorAll("[data-v381-copy]").forEach(button=>button.onclick=()=>v381Copy(button.dataset.v381Copy));
  host.querySelectorAll("[data-v381-save-access]").forEach(button=>button.onclick=()=>v381SaveAccess(button.closest(".v381-coach-card")));
  host.querySelectorAll("[data-v381-revoke-access]").forEach(button=>button.onclick=()=>v381RevokeAccess(button.closest(".v381-coach-card")));
  host.querySelectorAll("[data-v381-cancel-invite]").forEach(button=>button.onclick=()=>v381CancelInvite(button.dataset.v381CancelInvite));
}
async function v381CreateInvite(){
  const email=$("v381InviteEmail").value.trim(),name=$("v381InviteName").value.trim(),values=v381ValuesFor("invite");
  if(!email)return alert("Enter the assistant coach's email address.");if(!values.squads.length&&!values.permissions.view_all_squads)return alert("Assign at least one squad, or allow all squads.");
  try{
    const result=await cloudFetch("/rest/v1/rpc/mclay_create_assistant_invite",{method:"POST",body:JSON.stringify({target_org:appState.settings.organisation_id,target_email:email,target_display_name:name,target_squads:values.squads,target_permissions:values.permissions,valid_days:14})});
    const token=result?.[0]?.invite_token;if(!token)throw new Error("The invitation was created without a token.");const link=v381InviteLink(token);
    $("v381InviteResult").innerHTML=`<div class="result"><strong>Invitation ready.</strong><div class="v381-copy-row"><input value="${escapeHtml(link)}" readonly><button id="v381CopyNewInvite" type="button">Copy link</button></div><span class="help">Send this link to ${escapeHtml(name||email)}. They must use ${escapeHtml(email)}.</span></div>`;
    $("v381CopyNewInvite").onclick=()=>v381Copy(link);await v381LoadCoachRoster();v381RenderRosterList();
  }catch(error){$("v381InviteResult").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}</div>`}
}
async function v381SaveAccess(card){
  const prefix=card.dataset.v381Editor,user=card.dataset.v381User,values=v381ValuesFor(prefix),name=card.querySelector("[data-v381-name]").value.trim(),active=card.querySelector("[data-v381-active]").checked;
  try{await cloudFetch("/rest/v1/rpc/mclay_update_assistant_access",{method:"POST",body:JSON.stringify({target_org:appState.settings.organisation_id,target_user:user,target_display_name:name,target_squads:values.squads,target_permissions:values.permissions,target_active:active})});updateStatus("Coach access updated","good");await v381LoadCoachRoster();v381RenderRosterList()}catch(error){alert(error.message)}
}
async function v381RevokeAccess(card){const user=card.dataset.v381User;if(!confirm("Suspend this assistant coach's access? Their existing records remain."))return;try{await cloudFetch("/rest/v1/rpc/mclay_revoke_assistant_access",{method:"POST",body:JSON.stringify({target_org:appState.settings.organisation_id,target_user:user})});updateStatus("Coach access suspended","good");await v381LoadCoachRoster();v381RenderRosterList()}catch(error){alert(error.message)}}
async function v381CancelInvite(token){if(!confirm("Cancel this invitation link?"))return;try{await cloudFetch(`/rest/v1/coach_invitations?token=eq.${encodeURIComponent(token)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({active:false,updated_at:nowIso()})});await v381LoadCoachRoster();v381RenderRosterList()}catch(error){alert(error.message)}}

function v381CoachName(userId){if(!userId)return "";if(userId===getAuth()?.user?.id)return appState.settings.membership_display_name||appState.settings.membership_email||"Current coach";return v381CoachRosterCache.find(row=>row.user_id===userId)?.display_name||v381CoachRosterCache.find(row=>row.user_id===userId)?.email||"Coach"}
const v381BaseRenderCaptures=renderCaptures;
renderCaptures=async function(){await v381BaseRenderCaptures();const session=selectedSession(),items=appState.captures.filter(c=>c.session_id===session?.id).sort(byUpdated),cards=[...$("captureList").querySelectorAll(".list-item")];items.forEach((item,index)=>{const coach=v381CoachName(item.created_by);if(coach&&cards[index]?.querySelector(".list-meta"))cards[index].querySelector(".list-meta").textContent+=` · recorded by ${coach}`})};

function v381EnhanceTestCatalog(){
  const section=$("testsets");if(!section)return;const card=[...section.querySelectorAll("article.card")].find(node=>node.textContent.includes("Future-ready test types"));if(!card)return;
  const types=(appState.training_test_types||[]).filter(type=>type.test_key!=="t400_freestyle");
  card.innerHTML=`<div class="eyebrow">Test architecture</div><h3>Ready for more 400 types</h3><p>Freestyle is active first. The same result and formula structure is already prepared for the other modes.</p><div class="v381-type-chips">${types.length?types.map(type=>`<span class="chip ${type.active?"active":""}">${escapeHtml(type.name)}</span>`).join(""):['Backstroke','Breaststroke','Butterfly','IM','Kick','Kick with fins','Pull','Pull with paddles','Swim with fins'].map(name=>`<span class="chip">Timed 400 ${name}</span>`).join("")}</div>`;
}
const v381BaseV380RenderTestSets=v380RenderTestSets;
v380RenderTestSets=function(){v381BaseV380RenderTestSets();v381EnhanceTestCatalog();v381ApplyAccess()};
renderTestSets=v380RenderTestSets;

const v381BaseShowView=showView;
showView=function(id){if(!v381AllowedView(id)){id=v381AllowedView("deck")?"deck":"settings"}v381BaseShowView(id);if(id==="coaches")v381RenderCoachPortal();v381ApplyAccess()};
const v381BaseRenderView=renderView;
renderView=function(id){v381BaseRenderView(id);if(id==="coaches")v381RenderCoachPortal();v381ApplyAccess()};
const v381BaseRenderAll=renderAll;
renderAll=function(){v381BaseRenderAll();v381ApplyAccess()};
const v381BaseRenderMode=renderMode;
renderMode=function(){v381BaseRenderMode();v381ApplyAccess()};

function v381InjectStyles(){if($("v381Styles"))return;const style=document.createElement("style");style.id="v381Styles";style.textContent=`
.v381-access-grid{display:grid;grid-template-columns:minmax(240px,.55fr) minmax(0,1.45fr);gap:.8rem;align-items:start}.v381-permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;padding:.2rem 0 .75rem}.v381-permission-group,.v381-coach-card fieldset,#v381InviteForm fieldset{border:1px solid #c9dbe4;border-radius:10px;padding:.65rem;margin:.55rem 0;background:#f8fbfc}.v381-permission-group legend,.v381-coach-card legend,#v381InviteForm legend{padding:0 .35rem;color:#123a5b;font-size:.76rem;font-weight:900;text-transform:uppercase}.v381-check{display:flex;align-items:flex-start;gap:.45rem;margin:.35rem 0;text-transform:none;letter-spacing:0;font-size:.86rem;color:#294958}.v381-check input{width:auto;min-height:0;margin:.15rem 0 0}.v381-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.2rem .65rem}.v381-copy-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.45rem}.v381-team-heading{margin-top:1rem}.v381-coach-card{border-left:5px solid #2b7a78}.v381-type-chips{display:flex;gap:.4rem;flex-wrap:wrap}.v381-type-chips .chip.active{background:#e6f5ed;border-color:#78b58f;color:#195c32}@media(max-width:800px){.v381-access-grid,.v381-permission-grid{grid-template-columns:1fr}.v381-copy-row{grid-template-columns:1fr}.v381-copy-row button{width:100%}}
`;document.head.appendChild(style)}
function v381Interface(){
  v381InjectStyles();v381InjectPortal();document.title="McLay Swimming OS — v3.8.1 Coach System";
  const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.8.1 · desktop planning · simplified Deck · T400 speeds · assistant coach access";
  v381ApplyAccess();
}

// Clear role metadata after the existing sign-out handler without deleting the
// coach's local working records. A different account is cleared on membership load.
$("signOutBtn")?.addEventListener("click",()=>{appState.settings.membership_role="";appState.settings.membership_display_name="";appState.settings.membership_email="";appState.settings.membership_permissions={};appState.settings.assigned_squads=[];saveState(appState);v381Interface()});

v381Interface();renderAll();
if(getAuth()?.access_token&&getConfig().supabaseUrl&&getConfig().supabaseAnonKey){setTimeout(async()=>{try{await ensureOrganisation();if(typeof v3103ScheduleBackgroundSync==="function")v3103ScheduleBackgroundSync(900)}catch(error){console.warn("v3.10.3 startup account check",error);updateStatus(error.message||"Cloud account needs attention","error")}},450)}

// -----------------------------------------------------------------------------
// v3.8.2 — full-spectrum training-zone and race-pace engine
// Aerobic work remains anchored to the supplied T400 model. Race-specific work
// is calculated from official PBs and the next saved/pathway target. No
// anaerobic percentage model is invented: generic anaerobic labels require a
// race distance before an individual target is shown.
// -----------------------------------------------------------------------------
const V382_BUILD="20260727-full-spectrum-382";
const V382_AEROBIC_ZONES=["Regeneration","Development","Overload","Threshold","Clearance"];
const V382_RACE_DISTANCES=[50,100,200,400,800,1500];
const V382_STROKES=["Freestyle","Backstroke","Breaststroke","Butterfly","IM"];

if(typeof V381_PERMISSION_CATALOG!=="undefined"&&!V381_PERMISSION_CATALOG.some(item=>item.key==="view_pacing")){
  const at=Math.max(0,V381_PERMISSION_CATALOG.findIndex(item=>item.key==="view_test_speeds")+1);
  V381_PERMISSION_CATALOG.splice(at,0,{key:"view_pacing",label:"View individual training-zone and race-pace targets",group:"Information",default:true});
}

function v382NormalText(value){return String(value||"").toLowerCase().replace(/[–—]/g,"-").replace(/\s+/g," ").trim()}
function v382OrdinalIndex(text){const t=v382NormalText(text),words={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8};for(const [word,n] of Object.entries(words))if(new RegExp(`\\b${word}\\b`).test(t))return n;const m=t.match(/\b(\d+)(?:st|nd|rd|th)\b/);return m?Number(m[1]):null}
function v382CycleSeconds(value){const n=parseClockValue(String(value||""));return Number.isFinite(Number(n))?Number(n):null}
function v382Stroke(value){const s=v3Stroke(value||"");return V382_STROKES.includes(s)?s:"Freestyle"}
function v382Course(value){const c=v3Course(value||"");return c==="LCM"||c==="SCM"?c:"SCM"}
function v382SetText(item,block){return [item?.raw,item?.label,item?.instruction,block?.purpose,block?.cues].filter(Boolean).join(" ")}
function v382DetectedZone(text){const t=v382NormalText(text);if(/regeneration|regen|recovery/.test(t))return "Regeneration";if(/aerobic development|development/.test(t))return "Development";if(/aerobic overload|overload/.test(t))return "Overload";if(/threshold|css/.test(t))return "Threshold";if(/clearance|lactate clearance/.test(t))return "Clearance";return ""}
function v382DetectedRaceDistance(text){const t=v382NormalText(text);let m=t.match(/\b(50|100|200|400|800|1500)\s*m?\s*(?:race\s*)?pace\b/);if(!m)m=t.match(/\b(?:race\s*)?pace\s*(?:for|over|at)?\s*(50|100|200|400|800|1500)\b/);return m?Number(m[1]):null}
function v382DetectedSource(text){const t=v382NormalText(text);if(/\bpb\s*(?:pace)?\s*only\b|\bfrom pb\b/.test(t))return "pb";if(/\bgoal\s*(?:pace)?\s*only\b|\btarget\s*(?:pace)?\s*only\b/.test(t))return "goal";return "both"}
function v382DetectedRest(text){const t=v382NormalText(text);const m=t.match(/\b(10|30)\s*(?:sec|second|s)\s*rest\b/);return m?Number(m[1]):10}
function v382PaceSpec(item,block,session){
  const text=v382SetText(item,block),t=v382NormalText(text),zone=item?.pace_zone||v382DetectedZone(text),raceDistance=Number(item?.race_distance)||v382DetectedRaceDistance(text),max=/\b(max(?:imum)? effort|max speed|all out)\b/.test(t),genericAnaerobic=/\b(anaerobic|vo2|lactate production|sprint power|speed endurance|race pace)\b/.test(t);
  let mode=item?.pace_mode||"auto";
  if(mode==="auto")mode=raceDistance?"race":max?"max":zone?"aerobic":genericAnaerobic?"race":"none";
  return {
    mode,zone:zone||"Development",raceDistance:raceDistance||200,source:item?.pace_source||v382DetectedSource(text),rest:Number(item?.pace_rest)||v382DetectedRest(text),course:v382Course(item?.pace_course||session?.pool_course),stroke:v382Stroke(item?.pace_stroke||item?.stroke),segmentIndex:Number(item?.segment_index)||v382OrdinalIndex(text),genericAnaerobic:genericAnaerobic&&!raceDistance,repDistance:Number(item?.distance)||0,cycle:v382CycleSeconds(item?.cycle),text
  };
}
function v382ActiveBlockAndItem(){
  const session=selectedSession();if(!session)return {session:null,block:null,item:null,blockIndex:-1,itemIndex:-1};
  let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));
  blocks=blocks.map(v374SanitiseBlock);
  const activeKey=appState.settings.v382_active_pace_key||"";
  let blockIndex=0,itemIndex=0;
  const m=activeKey.match(/^(.*)::(\d+)$/);if(m){blockIndex=blocks.findIndex((block,index)=>(block.id||`fallback-${index}`)===m[1]);itemIndex=Number(m[2]);}
  if(blockIndex<0)blockIndex=0;
  const block=blocks[blockIndex]||null,items=(block?.items||[]).filter(item=>item.runnable!==false);
  if(itemIndex<0||itemIndex>=items.length)itemIndex=Math.max(0,items.findIndex(item=>v382PaceSpec(item,block,session).mode!=="none"));
  return {session,block,item:items[itemIndex]||null,blockIndex,itemIndex,blocks,items};
}
function v382SetActivePaceLine(blockIndex,itemIndex,open=true){const session=selectedSession();if(!session)return;let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));const block=blocks[blockIndex];if(!block)return;appState.settings.v382_active_pace_key=`${block.id||`fallback-${blockIndex}`}::${itemIndex}`;saveState(appState);v382RenderPacePanel();if(open){const details=$("v382PaceDetails");if(details){details.open=true;details.scrollIntoView({behavior:"smooth",block:"start"})}}}
function v382PresentRoster(){const session=selectedSession(),roster=selectedRoster();if(!session)return [];const marked=(appState.attendance||[]).filter(row=>row.session_id===session.id&&roster.some(a=>a.id===row.athlete_id));const here=new Set(marked.filter(row=>row.status==="present"||row.status==="modified").map(row=>row.athlete_id));return (here.size?roster.filter(a=>here.has(a.id)):roster).sort(rosterSort)}
function v382AerobicTarget(anchorSeconds,distance,zone,rest){
  const d=Number(distance),r=Number(rest)===30?30:10;if(!Number.isFinite(d)||d<=0)return null;
  if([50,100,200,400].includes(d)){const seconds=v380PaceValue(anchorSeconds,d,zone,r);return Number.isFinite(seconds)?{seconds,method:`master ${d}m / ${r}s-rest coefficient`}:null}
  const continuous=v380PaceModel().continuous||V380_T400_FALLBACK_MODEL.continuous;
  if(d>=500){const factor=Number(continuous?.factors?.[zone]);if(!factor)return null;return {seconds:(Number(anchorSeconds)/Number(continuous.base_divisor||4))*factor*(d/100),method:"master continuous-speed coefficient"}}
  const base=d<50?50:d<100?100:d<200?200:400,baseSeconds=v380PaceValue(anchorSeconds,base,zone,r);if(!Number.isFinite(baseSeconds))return null;return {seconds:baseSeconds*(d/base),method:`${base}m zone speed scaled to ${d}m`};
}
function v382PbFor(athlete,course,distance,stroke){return athleteOfficialPbs(athlete.id).find(row=>v3Course(row.course)===course&&Number(row.distance)===Number(distance)&&v3Stroke(row.stroke)===stroke)||null}
function v382ManualGoalFor(athlete,course,distance,stroke){return (appState.race_goals||[]).filter(goal=>goal.athlete_id===athlete.id&&goal.status!=="archived"&&v3Course(goal.course)===course&&Number(goal.distance)===Number(distance)&&v3Stroke(goal.stroke)===stroke).sort(byUpdated)[0]||null}
function v382GoalFor(athlete,pb,course,distance,stroke){const manual=v382ManualGoalFor(athlete,course,distance,stroke);if(manual)return {seconds:Number(manual.target_seconds||v3Seconds(manual.target_time_text)),label:manual.basis||"Coach goal",splits:v32Array(manual.target_splits),splitDistance:Number(manual.split_distance)||null,source:"manual"};const next=pb?v3Pathway(athlete,pb).next:null;return next?{seconds:Number(next.targetSeconds),label:next.name||"Next progression",splits:[],splitDistance:null,source:"pathway"}:null}
function v382BestRaceWithSplits(athlete,pb){if(!pb)return null;return athleteHistory(athlete.id).filter(row=>v3Course(row.course)===v3Course(pb.course)&&Number(row.distance)===Number(pb.distance)&&v3Stroke(row.stroke)===v3Stroke(pb.stroke)&&v32ParseSplits(row.splits).length).sort((a,b)=>Math.abs(Number(a.result_seconds)-Number(pb.result_seconds))-Math.abs(Number(b.result_seconds)-Number(pb.result_seconds)))[0]||null}
function v382LegFromCumulative(splits,segmentDistance,index){const arr=v32SplitsWithDistance(splits,segmentDistance).sort((a,b)=>a.distance-b.distance),target=Number(segmentDistance)*Number(index),hit=arr.find(row=>Number(row.distance)===target);if(!hit)return null;const previous=arr.find(row=>Number(row.distance)===target-Number(segmentDistance));return Number(hit.seconds)-Number(previous?.seconds||0)}
function v382RaceSegment(totalSeconds,raceDistance,repDistance,{splits=[],splitDistance=null,segmentIndex=null}={}){
  if(segmentIndex&&splitDistance&&Number(splitDistance)===Number(repDistance)){const leg=v382LegFromCumulative(splits,splitDistance,segmentIndex);if(Number.isFinite(leg)&&leg>0)return {seconds:leg,method:`actual ${segmentIndex}${segmentIndex===1?"st":segmentIndex===2?"nd":segmentIndex===3?"rd":"th"} ${repDistance} split`}}
  return {seconds:Number(totalSeconds)*(Number(repDistance)/Number(raceDistance)),method:"average race pace"};
}
function v382RowTarget(athlete,spec){
  if(spec.mode==="aerobic"){
    const anchor=v380T400Anchor(athlete.id);if(!anchor)return {status:"missing",message:"No matched T400 freestyle anchor"};
    const target=v382AerobicTarget(Number(anchor.result_seconds),spec.repDistance,spec.zone,spec.rest);if(!target)return {status:"missing",message:`No ${spec.repDistance}m coefficient available`};
    const cycle=spec.cycle||v380RoundUp(target.seconds+spec.rest,5),actualRest=cycle-target.seconds;
    return {status:"ok",kind:"aerobic",primary:`${v380Clock(target.seconds)} on ${v380Clock(cycle)}`,secondary:`${spec.zone} · T400 ${v380Clock(anchor.result_seconds)} · ${Math.max(0,actualRest).toFixed(actualRest<10?1:0)}s rest`,method:target.method};
  }
  if(spec.mode==="race"){
    if(spec.genericAnaerobic)return {status:"needs",message:"Choose a race distance; generic anaerobic work has no honest fixed pace yet"};
    const pb=v382PbFor(athlete,spec.course,spec.raceDistance,spec.stroke);if(!pb)return {status:"missing",message:`No ${spec.course} ${spec.raceDistance} ${spec.stroke} PB`};
    const pbRace=v382BestRaceWithSplits(athlete,pb),pbTarget=v382RaceSegment(pb.result_seconds,spec.raceDistance,spec.repDistance,{splits:pbRace?.splits||[],splitDistance:Number(pbRace?.split_distance)||null,segmentIndex:spec.segmentIndex});
    const goal=v382GoalFor(athlete,pb,spec.course,spec.raceDistance,spec.stroke),goalTarget=goal?v382RaceSegment(goal.seconds,spec.raceDistance,spec.repDistance,{splits:goal.splits,splitDistance:goal.splitDistance,segmentIndex:spec.segmentIndex}):null;
    if(spec.source==="goal"&&!goalTarget)return {status:"needs",message:"No saved or pathway next target for this event"};const parts=[];if(spec.source!=="goal")parts.push(`PB ${v380Clock(pbTarget.seconds)}`);if(spec.source!=="pb"&&goalTarget)parts.push(`${goal.label} ${v380Clock(goalTarget.seconds)}`);
    return {status:"ok",kind:"race",primary:parts.join(" · ")||`PB ${v380Clock(pbTarget.seconds)}`,secondary:`${spec.course} ${spec.raceDistance} ${spec.stroke} · PB ${v380Clock(pb.result_seconds)}${goal?` · target ${v380Clock(goal.seconds)}`:" · no next target loaded"}`,method:[pbTarget.method,goalTarget?.method].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(" / ")};
  }
  if(spec.mode==="max"){
    const pb=v382PbFor(athlete,spec.course,spec.repDistance,spec.stroke);return pb?{status:"ok",kind:"max",primary:`Max effort · PB reference ${v380Clock(pb.result_seconds)}`,secondary:`${spec.course} ${spec.repDistance} ${spec.stroke} · reference only`,method:"No fixed target imposed"}:{status:"needs",message:"Max effort — no fixed target; no like-for-like PB reference"};
  }
  return {status:"none",message:"No pacing intention detected on this set line"};
}
function v382PaceControls(spec,context){
  const lineOptions=context.items.map((item,index)=>`<option value="${index}" ${index===context.itemIndex?"selected":""}>${escapeHtml(String(item.raw||item.label||`Set line ${index+1}`).slice(0,90))}</option>`).join("");
  const model=`<label>Model<select id="v382Mode"><option value="auto" ${spec.mode==="none"?"selected":""}>Auto detect</option><option value="aerobic" ${spec.mode==="aerobic"?"selected":""}>T400 aerobic zone</option><option value="race" ${spec.mode==="race"?"selected":""}>Race pace</option><option value="max" ${spec.mode==="max"?"selected":""}>Max effort reference</option></select></label>`;
  const zone=`<label>Aerobic zone<select id="v382Zone">${V382_AEROBIC_ZONES.map(value=>`<option ${value===spec.zone?"selected":""}>${value}</option>`).join("")}</select></label>`;
  const rest=`<label>Rest model<select id="v382Rest"><option value="10" ${spec.rest===10?"selected":""}>10 seconds</option><option value="30" ${spec.rest===30?"selected":""}>30 seconds</option></select></label>`;
  const race=`<label>Race event<select id="v382RaceDistance">${V382_RACE_DISTANCES.map(distance=>`<option value="${distance}" ${distance===spec.raceDistance?"selected":""}>${distance}m</option>`).join("")}</select></label>`;
  const source=`<label>Pace source<select id="v382Source"><option value="both" ${spec.source==="both"?"selected":""}>PB + next target</option><option value="pb" ${spec.source==="pb"?"selected":""}>PB only</option><option value="goal" ${spec.source==="goal"?"selected":""}>Next target only</option></select></label>`;
  const stroke=`<label>Stroke<select id="v382Stroke">${V382_STROKES.map(value=>`<option ${value===spec.stroke?"selected":""}>${value}</option>`).join("")}</select></label>`;
  const course=`<label>Course<select id="v382Course"><option value="SCM" ${spec.course==="SCM"?"selected":""}>SCM / 25m</option><option value="LCM" ${spec.course==="LCM"?"selected":""}>LCM / 50m</option></select></label>`;
  let specific="";if(spec.mode==="aerobic")specific=zone+rest+stroke+course;else if(spec.mode==="race")specific=race+source+stroke+course;else if(spec.mode==="max")specific=stroke+course;else specific=zone+rest+race+source+stroke+course;
  return `<div class="v382-control-grid"><label class="v382-line-control">Set line<select id="v382LineSelect">${lineOptions}</select></label>${model}${specific}</div>`;
}
function v382RenderPacePanel(){
  const host=$("v382PacePanel");if(!host)return;const context=v382ActiveBlockAndItem(),{session,block,item}=context;if(!session||!block||!item){host.innerHTML='<div class="help">Select a session set to see individual targets.</div>';return}
  let spec=v382PaceSpec(item,block,session);const preview=appState.settings.v382_preview_pace;if(preview?.key&&preview.key===appState.settings.v382_active_pace_key)spec={...spec,...preview.values,mode:preview.values.pace_mode==="auto"?spec.mode:preview.values.pace_mode,zone:preview.values.pace_zone||spec.zone,rest:Number(preview.values.pace_rest)||spec.rest,raceDistance:Number(preview.values.race_distance)||spec.raceDistance,source:preview.values.pace_source||spec.source,stroke:preview.values.pace_stroke||spec.stroke,course:preview.values.pace_course||spec.course};const rows=v382PresentRoster().map(athlete=>({athlete,target:v382RowTarget(athlete,spec)}));
  host.innerHTML=`<details id="v382PaceDetails"><summary><div><span>Full-spectrum pacing</span><strong>${escapeHtml(item.raw||item.label||"Current set")}</strong></div><b>${spec.mode==="aerobic"?escapeHtml(spec.zone):spec.mode==="race"?`${spec.raceDistance} pace`:spec.mode==="max"?"Max effort":"Choose model"}</b></summary><div class="v382-panel-body">${v382PaceControls(spec,context)}<div class="button-row"><button id="v382RefreshTargets" type="button">Apply view</button>${typeof v381Can!=="function"||v381Can("edit_sessions")?`<button id="v382SaveSpec" type="button" class="secondary">Save pacing to set</button>`:""}</div><div class="v382-note">Aerobic targets use the supplied T400 formula model. Race targets use official PBs plus a saved goal or the closest unmet progression. Where no real split exists, the app labels the number as average race pace.</div><div class="v382-target-table"><div class="v382-target-head"><span>Swimmer</span><span>Individual target</span><span>Basis</span></div>${rows.map(({athlete,target})=>`<div class="v382-target-row ${target.status}"><strong>${escapeHtml(athlete.full_name)}</strong><span>${target.status==="ok"?`<b>${escapeHtml(target.primary)}</b><small>${escapeHtml(target.secondary)}</small>`:`<b>${escapeHtml(target.message)}</b>`}</span><small>${escapeHtml(target.method||"")}</small></div>`).join("")||'<div class="help">No swimmers in the active squad.</div>'}</div></div></details>`;
  $("v382LineSelect").onchange=()=>{v382SetActivePaceLine(context.blockIndex,Number($("v382LineSelect").value),false);$("v382PaceDetails").open=true};
  $("v382RefreshTargets").onclick=()=>{v382ApplyControlSpec(false)};if($("v382SaveSpec"))$("v382SaveSpec").onclick=()=>v382ApplyControlSpec(true);
}
function v382ControlValues(){const context=v382ActiveBlockAndItem(),spec=context.item?v382PaceSpec(context.item,context.block,context.session):{mode:"none",zone:"Development",rest:10,raceDistance:200,source:"both",stroke:"Freestyle",course:"SCM"};return {pace_mode:$("v382Mode")?.value||spec.mode||"auto",pace_zone:$("v382Zone")?.value||spec.zone||"Development",pace_rest:Number($("v382Rest")?.value)||spec.rest||10,race_distance:Number($("v382RaceDistance")?.value)||spec.raceDistance||200,pace_source:$("v382Source")?.value||spec.source||"both",pace_stroke:$("v382Stroke")?.value||spec.stroke||"Freestyle",pace_course:$("v382Course")?.value||spec.course||"SCM"}}
async function v382ApplyControlSpec(save){
  const context=v382ActiveBlockAndItem(),values=v382ControlValues();if(!context.item)return;
  if(!save){appState.settings.v382_preview_pace={key:appState.settings.v382_active_pace_key,values};saveState(appState);v382RenderPacePanel();$("v382PaceDetails").open=true;return}
  if(typeof v381Can==="function"&&!v381Can("edit_sessions"))return alert("This coach can view pacing but cannot change the session definition.");
  if(!context.block?.id)return alert("Save the session structure first, then save its pacing setup.");
  const real=appState.session_blocks.find(block=>block.id===context.block.id);if(!real)return;
  const runnableIndexes=(real.items||[]).map((item,index)=>item.runnable===false?null:index).filter(index=>index!==null),realIndex=runnableIndexes[context.itemIndex];if(realIndex===undefined)return;
  Object.assign(real.items[realIndex],values);appState.settings.v382_preview_pace=null;real.updated_at=nowIso();queueRecord("session_blocks",real.id);saveState(appState);await syncIfPossible();updateStatus("Set pacing saved","good");v382RenderDeckBlocks();v382RenderPacePanel();$("v382PaceDetails").open=true;
}
function v382EnsurePacePanel(){const list=$("deckBlockList");if(!list||$("v382PacePanel"))return;const card=list.closest("article.card")||list.parentElement,host=document.createElement("article");host.id="v382PacePanel";host.className="card v382-pace-panel";card.insertAdjacentElement("afterend",host);v382RenderPacePanel()}
function v382RaceLibraryHtml(athlete){
  const rows=athleteOfficialPbs(athlete?.id).slice().sort((a,b)=>Number(a.distance)-Number(b.distance)||String(a.stroke).localeCompare(String(b.stroke))).map(pb=>{const goal=v382GoalFor(athlete,pb,pb.course,pb.distance,pb.stroke),pace25=Number(pb.result_seconds)*25/Number(pb.distance),pace50=Number(pb.result_seconds)*50/Number(pb.distance),goal50=goal?goal.seconds*50/Number(pb.distance):null;return `<tr><th>${escapeHtml(pb.course)} ${pb.distance} ${escapeHtml(pb.stroke)}</th><td>${v380Clock(pb.result_seconds)}</td><td>${v380Clock(pace25)}</td><td>${v380Clock(pace50)}</td><td>${goal?`${escapeHtml(goal.label)} ${v380Clock(goal.seconds)} · 50 ${v380Clock(goal50)}`:"No next target"}</td></tr>`}).join("");
  return `<article class="card v382-race-library"><div class="eyebrow">Race-specific and anaerobic pacing</div><h3>${escapeHtml(athlete?.full_name||"Swimmer")} · PB and next-target pace library</h3><p>PB and next-target arithmetic is shown side by side. Actual race splits are used only when they exist; otherwise values are clearly average race pace.</p><div class="v380-table-scroll"><table class="v380-pace-table"><thead><tr><th>Event</th><th>PB</th><th>Avg 25</th><th>Avg 50</th><th>Next target</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No official PBs loaded for this swimmer.</td></tr>'}</tbody></table></div></article>`;
}

function v382RenderDeckBlocks(){
  const host=$("deckBlockList"),session=selectedSession();if(!host||!session)return;let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));blocks=blocks.map(v374SanitiseBlock);let active=v35ActiveBlockId(session.id),keys=blocks.map((block,index)=>block.id||`fallback-${index}`);if(!active||!keys.includes(active))active=keys[0]||"";
  host.innerHTML=blocks.length?blocks.map((block,blockIndex)=>{const key=keys[blockIndex],open=key===active,distance=v380BlockDistance(block),runnable=(block.items||[]).filter(item=>item.runnable!==false),lines=(block.items||[]).map(item=>{if(item.runnable===false)return `<div class="v374-deck-cue"><span>Coach cue</span><strong>${escapeHtml(item.raw)}</strong></div>`;const itemIndex=runnable.indexOf(item),spec=v382PaceSpec(item,block,session),label=spec.mode==="aerobic"?spec.zone:spec.mode==="race"?(spec.genericAnaerobic?"Choose pace":`${spec.raceDistance} pace`):spec.mode==="max"?"Max":"";return `<div class="v361-deck-line v380-set-line v382-set-line"><span>${escapeHtml(item.raw)}</span>${label?`<button type="button" class="secondary small" data-v382-targets="${blockIndex}:${itemIndex}">${escapeHtml(label)}</button>`:""}</div>`}).join("");return `<details class="v35-deck-block v374-deck-block" data-v35-deck-block="${escapeHtml(key)}" ${open?'open':''}><summary><div><span>${escapeHtml(v32BlockLabel(block.block_type))}</span><strong>${escapeHtml(block.title||v32BlockLabel(block.block_type))}</strong></div><b>${distance?`${distance.toLocaleString()}m`:''}</b></summary><div class="v35-deck-block-body">${block.purpose?`<div class="v361-block-purpose"><b>Purpose</b><span>${escapeHtml(block.purpose)}</span></div>`:''}${block.cues?`<div class="v361-block-purpose v374-cues"><b>Cues</b><span>${escapeHtml(block.cues)}</span></div>`:''}<div class="v361-deck-lines">${lines||`<pre>${escapeHtml(block.raw_text||'No set lines entered.')}</pre>`}</div><div class="button-row v374-block-actions"><button type="button" data-v380-coach-block="${blockIndex}">Current set</button><button type="button" class="secondary" data-v374-edit-session>Edit session</button></div></div></details>`}).join(''):'<div class="warning-box">No session sections are available. Open Edit session and check the pasted session.</div>';
  host.querySelectorAll('.v35-deck-block').forEach(detail=>detail.ontoggle=()=>{if(!detail.isConnected||!detail.open)return;host.querySelectorAll('.v35-deck-block').forEach(other=>{if(other!==detail&&other.isConnected)other.open=false});v35SetActiveBlock(session.id,detail.dataset.v35DeckBlock)});host.querySelectorAll('[data-v380-coach-block]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.v380CoachBlock);v374ActivateDeckBlock(session,blocks[index],keys[index])});host.querySelectorAll('[data-v374-edit-session]').forEach(button=>button.onclick=v361OpenEditLayer);host.querySelectorAll('[data-v382-targets]').forEach(button=>button.onclick=()=>{const [b,i]=button.dataset.v382Targets.split(':').map(Number);v382SetActivePaceLine(b,i,true)});v382EnsurePacePanel();v382RenderPacePanel();
}
v380RenderDeckBlocks=v382RenderDeckBlocks;v374RenderDeckBlocks=v382RenderDeckBlocks;v361RenderDeckBlocksFinal=v382RenderDeckBlocks;v35RenderDeckBlocks=v382RenderDeckBlocks;

const v382BaseRenderTestSets=v380RenderTestSets;
v380RenderTestSets=function(){v382BaseRenderTestSets();const section=$("testsets"),athlete=v380SelectedTestAthlete();if(section&&athlete)section.insertAdjacentHTML("beforeend",v382RaceLibraryHtml(athlete));};
renderTestSets=v380RenderTestSets;

const v382BaseAthleteQuickHtml=athleteQuickHtml;
athleteQuickHtml=function(athlete){let html=v382BaseAthleteQuickHtml(athlete);if(!athlete)return html;const closest=athleteOfficialPbs(athlete.id).map(pb=>({pb,goal:v382GoalFor(athlete,pb,pb.course,pb.distance,pb.stroke)})).filter(row=>row.goal).sort((a,b)=>(Number(a.pb.result_seconds)-Number(a.goal.seconds))-(Number(b.pb.result_seconds)-Number(b.goal.seconds)))[0];const row=closest?`<div class="deck-answer-row"><span>Race-pace anchor</span><strong>${escapeHtml(closest.pb.course)} ${closest.pb.distance} ${escapeHtml(closest.pb.stroke)} · PB ${v380Clock(closest.pb.result_seconds)} · ${escapeHtml(closest.goal.label)} ${v380Clock(closest.goal.seconds)}</strong></div>`:`<div class="deck-answer-row"><span>Race-pace anchor</span><strong>No PB + next-target match loaded</strong></div>`;return html.replace('<div class="deck-answer-row"><span>Latest note</span>',`${row}<div class="deck-answer-row"><span>Latest note</span>`)};

function v382InjectStyles(){if($("v382Styles"))return;const style=document.createElement("style");style.id="v382Styles";style.textContent=`
.v382-pace-panel{padding:0!important;overflow:hidden}.v382-pace-panel>details>summary{cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:.8rem;padding:.9rem 1rem;background:#e9f2f7}.v382-pace-panel>details>summary span{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:#567;font-weight:900}.v382-pace-panel>details>summary strong{display:block;color:#123a5b}.v382-pace-panel>details>summary b{white-space:nowrap;color:#123a5b}.v382-panel-body{padding:1rem}.v382-control-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem}.v382-control-grid label{font-size:.72rem}.v382-control-grid label:first-child{grid-column:span 2}.v382-note{margin:.75rem 0;padding:.65rem .75rem;border-left:5px solid #2b7a78;background:#eef8f6;font-size:.82rem;line-height:1.35}.v382-target-table{display:grid;border:1px solid #c8dbe4;border-radius:12px;overflow:hidden}.v382-target-head,.v382-target-row{display:grid;grid-template-columns:minmax(130px,.55fr) minmax(240px,1.25fr) minmax(170px,.7fr);gap:.65rem;padding:.65rem .75rem;align-items:center}.v382-target-head{background:#123a5b;color:#fff;font-size:.72rem;text-transform:uppercase;font-weight:900}.v382-target-row{border-top:1px solid #d6e4ea}.v382-target-row:nth-child(odd){background:#f7fafc}.v382-target-row span{display:grid;gap:.12rem}.v382-target-row small{color:#60737d;line-height:1.3}.v382-target-row.missing,.v382-target-row.needs{background:#fff8e7}.v382-set-line{grid-template-columns:minmax(0,1fr) auto!important}.v382-set-line button{white-space:nowrap}.v382-race-library{margin-top:.8rem}@media(max-width:900px){.v382-control-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v382-control-grid label:first-child{grid-column:1/-1}.v382-target-head{display:none}.v382-target-row{grid-template-columns:1fr;gap:.25rem}.v382-target-row>small{border-top:1px dashed #c8dbe4;padding-top:.25rem}.v382-panel-body{padding:.7rem}.v382-pace-panel>details>summary{padding:.7rem}.v382-set-line button{font-size:.64rem;min-width:62px}}
`;document.head.appendChild(style)}
function v382Interface(){v382InjectStyles();document.title="McLay Swimming OS — v3.8.2 Full-Spectrum Pacing";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.8.2 · T400 aerobic zones · PB + next-goal race pace · assistant coach targets";v382EnsurePacePanel();v382RenderPacePanel()}

const v382BaseRenderView=renderView;
renderView=function(id){v382BaseRenderView(id);if(id==="deck"){v382EnsurePacePanel();v382RenderPacePanel()}};
const v382BaseRenderAll=renderAll;
renderAll=function(){v382BaseRenderAll();const id=document.querySelector('.view.active')?.id;if(id==="deck"){v382EnsurePacePanel();v382RenderPacePanel()}};

v382Interface();renderAll();

// -----------------------------------------------------------------------------
// v3.9.0 — Club intelligence release candidate
// Keeps one canonical session, interprets likely physiological intent, reports
// planned volume, creates time-window individual versions, supports assistant
// challenges, whole-club programme records and reviewable communications.
// Numeric HR / stroke-rate guides remain blank until the coach enters them.
// -----------------------------------------------------------------------------
const V390_BUILD="20260728-club-intelligence-390";
const V390_ZONE_ORDER=["Regeneration","Development","Overload","Threshold","Clearance","Speed","Anaerobic power","Anaerobic capacity","Lactate tolerance","Race pace","Unclassified"];
const V390_TABLES=["coaching_profiles","squad_programmes","squad_timetable_slots","session_zone_classifications","session_zone_summaries","coach_classification_challenges","coach_communications"];
for(const key of V390_TABLES){if(!CLOUD_TABLES.includes(key))CLOUD_TABLES.push(key);if(!Array.isArray(appState[key]))appState[key]=[]}
for(const permission of [
  {key:"view_session_intelligence",label:"View zone classification, reasoning and individual delivery",group:"Information",default:true},
  {key:"challenge_classification",label:"Challenge a classification for head-coach review",group:"Information",default:true},
  {key:"view_club_programme",label:"View assigned squad timetable and programme",group:"Information",default:true},
  {key:"create_communications",label:"Prepare reviewable coach/swimmer email drafts",group:"Poolside",default:false},
  {key:"manage_club_programme",label:"Manage squad programmes and timetables",group:"Administration",default:false},
  {key:"manage_coaching_profile",label:"Edit the McLay physiology reference profile",group:"Administration",default:false}
])if(typeof V381_PERMISSION_CATALOG!=="undefined"&&!V381_PERMISSION_CATALOG.some(item=>item.key===permission.key))V381_PERMISSION_CATALOG.push(permission);

const v390PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  const org=appState.settings.organisation_id,user=getAuth()?.user?.id;
  if(table==="coaching_profiles")return {id:record.id,organisation_id:org,name:record.name||"McLay full-spectrum coaching profile",version:record.version||"1.0",source_credit:record.source_credit||"Clive Rushton cone used as the base reference; coach-owned adaptations remain explicit and versioned.",zone_definitions:record.zone_definitions||{},inference_rules:record.inference_rules||{},active:record.active!==false,created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="squad_programmes")return {id:record.id,organisation_id:org,squad_name:record.squad_name||"",active:record.active!==false,lead_coach_user_id:record.lead_coach_user_id||null,season_plan_id:record.season_plan_id||null,weekly_plan_id:record.weekly_plan_id||null,notes:record.notes||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="squad_timetable_slots")return {id:record.id,organisation_id:org,squad_name:record.squad_name||"",weekday:Number(record.weekday),day_part:record.day_part||"PM",start_time:record.start_time||null,end_time:record.end_time||null,venue:record.venue||"",pool_course:record.pool_course||null,lanes:record.lanes||"",default_focus:record.default_focus||"",active:record.active!==false,created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="session_zone_classifications")return {id:record.id,organisation_id:org,session_id:record.session_id,session_block_id:record.session_block_id||null,set_line_key:record.set_line_key,source_text:record.source_text||"",inferred_zone:record.inferred_zone||"",canonical_zone:record.canonical_zone||record.inferred_zone||"",confidence:Number(record.confidence||0),reasoning:record.reasoning||"",suggestion:record.suggestion||"",classification_basis:record.classification_basis||{},owner_overridden:record.owner_overridden===true,created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="session_zone_summaries")return {id:record.id,organisation_id:org,session_id:record.session_id,planned_volume:record.planned_volume||{},unclassified_volume:Number(record.unclassified_volume||0),source_snapshot:record.source_snapshot||"",model_version:record.model_version||"v390",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="coach_classification_challenges")return {id:record.id,organisation_id:org,session_id:record.session_id,session_block_id:record.session_block_id||null,set_line_key:record.set_line_key,source_text:record.source_text||"",current_zone:record.current_zone||"",proposed_zone:record.proposed_zone||"",reasoning:record.reasoning||"",status:record.status||"open",owner_response:record.owner_response||"",resolved_at:record.resolved_at||null,resolved_by:record.resolved_by||null,created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="coach_communications")return {id:record.id,organisation_id:org,communication_type:record.communication_type||"session_feedback",session_id:record.session_id||null,athlete_id:record.athlete_id||null,recipient_name:record.recipient_name||"",recipient_email:record.recipient_email||"",subject:record.subject||"",body:record.body||"",status:record.status||"draft",sent_at:record.sent_at||null,metadata:record.metadata||{},created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="athletes"){const row=v390PriorCloudRow(table,record);return {...row,swimmer_email:record.swimmer_email||null,guardian_email:record.guardian_email||null,communication_preference:record.communication_preference||"coach_review"}}
  return v390PriorCloudRow(table,record);
};

function v390Seconds(value){const n=v3Seconds(value);return Number.isFinite(Number(n))?Number(n):null}
function v390SetDistance(item){if(Number(item?.reps)>0&&Number(item?.distance)>0)return Number(item.reps)*Number(item.distance);const m=String(item?.raw||"").match(/\b(\d{1,3})\s*[x×]\s*(\d{1,4})\b/i);return m?Number(m[1])*Number(m[2]):0}
function v390RepDistance(item){if(Number(item?.distance)>0)return Number(item.distance);const m=String(item?.raw||"").match(/\b\d{1,3}\s*[x×]\s*(\d{1,4})\b/i);return m?Number(m[1]):0}
function v390Reps(item){if(Number(item?.reps)>0)return Number(item.reps);const m=String(item?.raw||"").match(/\b(\d{1,3})\s*[x×]\s*\d{1,4}\b/i);return m?Number(m[1]):1}
function v390Cycle(item){return v390Seconds(item?.cycle)||v390Seconds(String(item?.raw||"").match(/(?:\bon\b|@|every|cycle|send\s*[- ]?off)\s*(\d{1,3}(?::|\.)?\d{0,2})/i)?.[1])}
function v390Text(item,block,session){return [item?.raw,item?.instruction,block?.title,block?.purpose,block?.cues].filter(Boolean).join(" ")}
function v390Median(values){const nums=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!nums.length)return null;const mid=Math.floor(nums.length/2);return nums.length%2?nums[mid]:(nums[mid-1]+nums[mid])/2}
function v390LineKey(block,blockIndex,item,itemIndex){return `${block?.id||`fallback-${blockIndex}`}::${item?.id||itemIndex}`}
function v390Profile(){return (appState.coaching_profiles||[]).find(row=>row.active!==false)||{id:"local-v390-profile",name:"McLay full-spectrum coaching profile",version:"1.0",source_credit:"Clive Rushton cone used as the base reference; coach-owned adaptations remain explicit and versioned.",zone_definitions:{},inference_rules:{}}}
function v390SavedClassification(sessionId,key){return (appState.session_zone_classifications||[]).filter(row=>row.session_id===sessionId&&row.set_line_key===key).sort(byUpdated)[0]||null}
function v390ExpectedIntent(session){const week=v374WeekForDate(session.session_date),slot=v374SlotLine(week,session.session_date,session.day_part);return [session.primary_system,slot,week?.objective,session.week_objective,session.plan_cue].filter(Boolean).join(" · ")}
function v390ExpectedZones(session){
  const t=v382NormalText(v390ExpectedIntent(session));const zones=[];
  const add=z=>{if(!zones.includes(z))zones.push(z)};
  if(/regeneration|recovery|easy/.test(t))add("Regeneration");
  if(/aerobic development|endurance|aerobic base/.test(t))add("Development");
  if(/aerobic capacity|aerobic power|overload/.test(t))add("Overload");
  if(/threshold|css/.test(t))add("Threshold");
  if(/clearance/.test(t))add("Clearance");
  if(/alactic|speed|neural/.test(t))add("Speed");
  if(/anaerobic power/.test(t))add("Anaerobic power");
  if(/anaerobic capacity|vo2/.test(t))add("Anaerobic capacity");
  if(/lactate tolerance/.test(t))add("Lactate tolerance");
  if(/race pace/.test(t))add("Race pace");
  return zones;
}
function v390TargetForPace(athlete,spec){const row=v382RowTarget(athlete,spec);if(row.status!=="ok")return null;const first=row.primary.match(/(?:PB\s+|target\s+|^)(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?)/i)?.[1];return first?v390Seconds(first):null}
function v390EstimatedWorkSeconds(item,block,session){
  const spec=v382PaceSpec(item,block,session),roster=v382PresentRoster();
  const values=roster.map(a=>v390TargetForPace(a,spec)).filter(Number.isFinite);if(values.length)return v390Median(values);
  const d=v390RepDistance(item);if(!d)return null;
  const anchors=roster.map(a=>v380T400Anchor(a.id)).filter(Boolean).map(a=>Number(a.result_seconds)*(d/400));if(anchors.length)return v390Median(anchors)*(/max|all out/i.test(v390Text(item,block,session))?.82:1.05);
  return d;
}
function v390IntensityClassification(item,block,session){
  const text=v390Text(item,block,session),t=v382NormalText(text),spec=v382PaceSpec(item,block,session),distance=v390SetDistance(item),repDistance=v390RepDistance(item),reps=v390Reps(item),cycle=v390Cycle(item),work=v390EstimatedWorkSeconds(item,block,session),rest=cycle&&work?Math.max(0,cycle-work):null,ratio=work&&rest!==null?rest/work:null;
  let zone="Unclassified",confidence=.35,reasoning="No explicit physiological label was found.",suggestion="Add a zone or race-pace instruction if this is a key set.",basis="unclassified";
  if(spec.mode==="aerobic"){
    zone=spec.zone;confidence=.98;reasoning=`The set explicitly names ${spec.zone}; individual pace comes from the T400 model.`;suggestion="";basis="explicit_aerobic";
  }else if(spec.mode==="race"&&!spec.genericAnaerobic){
    zone="Race pace";confidence=.97;reasoning=`The set names ${spec.raceDistance} pace; PB and next-progression pace are the anchors.`;suggestion="";basis="explicit_race";
  }else if(/\b(regeneration|regen|recovery)\b/.test(t)){
    zone="Regeneration";confidence=.96;reasoning="Recovery/regeneration wording is explicit.";suggestion="";basis="explicit_word";
  }else if(/\b(aerobic development|development)\b/.test(t)){
    zone="Development";confidence=.95;reasoning="Aerobic development wording is explicit.";suggestion="";basis="explicit_word";
  }else if(/\b(aerobic overload|overload)\b/.test(t)){
    zone="Overload";confidence=.95;reasoning="Aerobic overload wording is explicit.";suggestion="";basis="explicit_word";
  }else if(/\bthreshold|css\b/.test(t)){
    zone="Threshold";confidence=.96;reasoning="Threshold/CSS wording is explicit.";suggestion="";basis="explicit_word";
  }else if(/\b(clearance|lactate clearance)\b/.test(t)){
    zone="Clearance";confidence=.96;reasoning="Lactate-clearance wording is explicit.";suggestion="";basis="explicit_word";
  }else if(/\b(max(?:imum)? effort|max speed|all out)\b/.test(t)||spec.mode==="max"){
    basis="duration_rest";
    if(work!==null&&work<=10&&(ratio===null||ratio>=3)){zone="Speed";confidence=.82;reasoning=`Estimated work is ${work.toFixed(1)}s${ratio!==null?` with about ${ratio.toFixed(1)}:1 rest-to-work`:""}, which points to short maximum-speed work.`;suggestion=ratio!==null&&ratio<4?"Longer recovery would preserve a purer speed response.":""}
    else if(work!==null&&work<=45&&ratio!==null&&ratio>=2.5){zone="Anaerobic power";confidence=.78;reasoning=`A maximal effort of about ${work.toFixed(0)}s with long recovery (${ratio.toFixed(1)}:1) is most consistent with anaerobic power.`;suggestion=ratio<4?"Increase recovery if the aim is maximum quality rather than accumulated fatigue.":""}
    else if(work!==null&&ratio!==null&&ratio<=1.25){zone="Lactate tolerance";confidence=.76;reasoning=`Repeated maximal work with limited recovery (${ratio.toFixed(1)}:1) is likely to accumulate substantial lactate.`;suggestion="Longer recovery would shift the response toward power; shorter recovery preserves tolerance/capacity stress."}
    else {zone="Anaerobic capacity";confidence=.68;reasoning=`Maximal work of about ${work!==null?`${work.toFixed(0)}s`:"unknown duration"}${ratio!==null?` with ${ratio.toFixed(1)}:1 rest-to-work`:""} sits between pure power and tolerance.`;suggestion="Check the intended response; distance, actual swim time and recovery will decide the final classification."}
  }else if(/\b(min(?:imum)? stroke count|stroke count|long and controlled|slow and controlled|easy choice|drill)\b/.test(t)){
    const minimum=/\bmin(?:imum)? stroke count|stroke count\b/.test(t),easy=/\beasy choice|slow and controlled\b/.test(t),drill=/\bdrill\b/.test(t);
    zone=(minimum||easy||block?.block_type==="warm_up"||block?.block_type==="warm_down")?"Regeneration":"Development";confidence=.74;
    reasoning=minimum?"Minimum-stroke-count work is provisionally treated as regeneration, preserving length, alignment and economy.":easy?"Easy/controlled work is normally regeneration.":`Drill work is inferred as ${zone.toLowerCase()} from its block context.`;
    suggestion=drill&&zone==="Development"?"Override if the drill is deliberately very easy or recovery-led.":"";basis="coach_language";
  }else if(/\b(aerobic capacity|aerobic power)\b/.test(t)){
    zone="Overload";confidence=.68;reasoning="Aerobic capacity/power language is provisionally mapped to the overload end of the T400 aerobic model.";suggestion="Confirm the intended T400 zone when the set is important.";basis="coach_language";
  }else if(/\b(warm[- ]?up|warm[- ]?down|cool[- ]?down|easy)\b/.test(t)||block?.block_type==="warm_up"||block?.block_type==="warm_down"){
    zone="Regeneration";confidence=.78;reasoning="Warm-up/down or easy work is normally regeneration unless a stronger instruction is present.";suggestion="";basis="block_context";
  }
  const expected=v390ExpectedZones(session),alignmentRelevant=block?.block_type==="main_set"||/main set/i.test(String(block?.title||"")),matches=!alignmentRelevant||!expected.length||expected.includes(zone)||(expected.includes("Overload")&&["Development","Threshold"].includes(zone));
  if(!matches&&zone!=="Unclassified")suggestion=suggestion||`Today's main-set plan points toward ${expected.join(" / ")}; this set looks more like ${zone}. Check that the difference is intentional.`;
  return {zone,confidence,reasoning,suggestion,basis,distance,repDistance,reps,cycle,work_seconds:work,rest_seconds:rest,rest_ratio:ratio,expected,matches,source_text:item?.raw||""};
}
function v390SessionRows(session=selectedSession()){
  if(!session)return [];
  let blocks=v32SessionBlocks(session.id);if(!blocks.length&&session.workout)blocks=v36ParseWorkoutBlocks(session.workout).map((block,index)=>({...block,id:"",sort_order:index+1}));blocks=blocks.map(v374SanitiseBlock);
  const rows=[];blocks.forEach((block,blockIndex)=>{(block.items||[]).filter(item=>item.runnable!==false).forEach((item,itemIndex)=>{const key=v390LineKey(block,blockIndex,item,itemIndex),inferred=v390IntensityClassification(item,block,session),saved=v390SavedClassification(session.id,key);rows.push({session,block,blockIndex,item,itemIndex,key,inferred,saved,zone:saved?.canonical_zone||inferred.zone,confidence:saved?.confidence??inferred.confidence,reasoning:saved?.reasoning||inferred.reasoning,suggestion:saved?.suggestion||inferred.suggestion,distance:inferred.distance})})});return rows;
}
function v390ZoneSummary(rows=v390SessionRows()){const totals={};let unclassified=0;for(const row of rows){const z=row.zone||"Unclassified",d=Number(row.distance||0);totals[z]=(totals[z]||0)+d;if(z==="Unclassified")unclassified+=d}return {totals,unclassified,total:Object.values(totals).reduce((a,b)=>a+b,0)}}
function v390ZoneName(value){const t=v382NormalText(value);const aliases=[["Regeneration",/regeneration|recovery|easy/],["Development",/development|aerobic base/],["Threshold",/threshold|css/],["Clearance",/clearance/],["Speed",/alactic|phosphate/],["Anaerobic power",/\banaerobic power\b/],["Anaerobic capacity",/\banaerobic capacity\b|vo2/],["Lactate tolerance",/lactate tolerance/],["Race pace",/race pace/],["Overload",/overload|\baerobic capacity\b|\baerobic power\b/]];return aliases.find(([,re])=>re.test(t))?.[0]||null}
function v390ActualZoneSummary(session=selectedSession()){const review=session?sessionReview(session.id):null,map=review?.energy_systems||{},totals={};for(const [key,raw] of Object.entries(map)){const zone=v390ZoneName(key),value=Number(raw?.value),unit=String(raw?.unit||"").toLowerCase();if(!zone||!Number.isFinite(value))continue;let metres=null;if(unit==="%"&&Number(review.actual_distance)>0)metres=Number(review.actual_distance)*value/100;else if(unit==="m"||unit==="")metres=value;if(Number.isFinite(metres))totals[zone]=(totals[zone]||0)+metres}return {totals,total:Object.values(totals).reduce((a,b)=>a+b,0),actual_distance:Number(review?.actual_distance||0),completed_at:review?.completed_at||null}}
function v390ConfidenceLabel(value){const n=Number(value);return n>=.85?"High":n>=.65?"Medium":"Low"}
function v390ConfidenceClass(value){const n=Number(value);return n>=.85?"good":n>=.65?"warning":"danger"}
function v390Prescription(item,block,session,athlete){
  const spec=v382PaceSpec(item,block,session),target=v382RowTarget(athlete,spec),mainReps=v390Reps(item),mainCycle=v390Cycle(item),targetSeconds=v390TargetForPace(athlete,spec),rest=spec.mode==="aerobic"?Number(spec.rest||10):Math.max(5,mainCycle&&targetSeconds?mainCycle-targetSeconds:10),individualCycle=targetSeconds?v380RoundUp(targetSeconds+rest,5):mainCycle;
  const groupTargets=v382PresentRoster().map(a=>v390TargetForPace(a,spec)).filter(Number.isFinite),groupTarget=v390Median(groupTargets),groupCycle=mainCycle||(groupTarget?v380RoundUp(groupTarget+rest,5):null),windowSeconds=groupCycle?groupCycle*mainReps:null;
  const attendance=(appState.attendance||[]).find(row=>row.session_id===session.id&&row.athlete_id===athlete.id),profile=typeof v37ProfileForAthlete==="function"?v37ProfileForAthlete(athlete):null,ratio=Number(profile?.ratio||1),flagged=attendance?.status==="modified"||ratio<.98||Boolean(String(athlete.modifications||"").trim());
  let reps=mainReps,reason="Main-group prescription";
  if(flagged&&windowSeconds&&individualCycle){reps=Math.max(1,Math.min(mainReps,Math.floor((windowSeconds+.001)/individualCycle)));if(ratio<.98)reps=Math.min(reps,Math.max(1,Math.round(mainReps*ratio)));reason=`Fits about ${v380Clock(windowSeconds)} of group working time using this swimmer's ${v380Clock(individualCycle)} cycle`}
  const raw=item?.raw||`${mainReps} x ${v390RepDistance(item)}`;const withoutCycle=String(raw).replace(/\s+(?:on|@|every|cycle|send\s*[- ]?off)\s*:?[0-9]{1,3}(?:(?::|\.)[0-9]{1,2})?\b/ig,"").replace(/\s{2,}/g," ").trim();const line=withoutCycle.replace(/\b\d{1,3}\s*[x×]\s*\d{1,4}\b/i,`${reps} × ${v390RepDistance(item)}`);
  const targetText=target.status==="ok"?target.primary:target.message;
  return {athlete,flagged,reps,mainReps,cycle:individualCycle||mainCycle,groupCycle,windowSeconds,target,targetText,line,reason,profile};
}
function v390ActiveContext(){const context=v382ActiveBlockAndItem();if(!context.item){const row=v390SessionRows()[0];return row?{session:row.session,block:row.block,item:row.item,blockIndex:row.blockIndex,itemIndex:row.itemIndex,items:[row.item]}:context}return context}
function v390IndividualHtml(context){if(!context?.item)return '<div class="help">Select a set line to see individual delivery.</div>';const roster=v382PresentRoster(),rows=roster.map(a=>v390Prescription(context.item,context.block,context.session,a));return `<div class="v390-prescription-list">${rows.map(row=>`<article class="v390-prescription ${row.flagged?"modified":""}"><div><strong>${escapeHtml(row.athlete.full_name)}</strong><span>${escapeHtml(row.line)}${row.cycle?` on ${escapeHtml(v380Clock(row.cycle))}`:""}</span></div><div><b>${escapeHtml(row.targetText)}</b><small>${escapeHtml(row.flagged?row.reason:"Main set retained")}</small></div></article>`).join("")||'<div class="help">No attending swimmers in the active squad.</div>'}</div>`}
function v390ZoneCards(summary){return V390_ZONE_ORDER.filter(z=>summary.totals[z]).map(z=>`<div class="v390-zone-card"><span>${escapeHtml(z)}</span><strong>${Number(summary.totals[z]).toLocaleString()}m</strong></div>`).join("")||'<div class="help">No classifiable set volume yet.</div>'}
function v390WallHtml(session,rows,active,context){const index=Math.max(0,rows.indexOf(active)),next=rows[index+1],prescriptions=context?.item?v382PresentRoster().map(a=>v390Prescription(context.item,context.block,context.session,a)).filter(x=>x.flagged&&(x.reps!==x.mainReps||x.target?.status==="ok")):[];return `<div class="v390-wall-shell"><div class="v390-wall-top"><div><span>${escapeHtml(session.title||sessionLabel(session))}</span><h1>${escapeHtml(active?.item?.raw||"Select the current set")}</h1></div><div class="v390-wall-zone"><span>Likely stimulus</span><strong>${escapeHtml(active?.zone||"—")}</strong></div></div><div class="v390-wall-grid"><section><span>Purpose / cue</span><strong>${escapeHtml([active?.block?.purpose,active?.item?.instruction,active?.block?.cues].filter(Boolean).join(" · ")||session.technical_focus||"Coach cue not entered")}</strong></section><section><span>Next</span><strong>${escapeHtml(next?.item?.raw||"Session finish")}</strong></section></div>${prescriptions.length?`<div class="v390-wall-exceptions"><span>Individual versions</span>${prescriptions.map(row=>`<div><strong>${escapeHtml(row.athlete.full_name)}</strong><b>${escapeHtml(row.line)}${row.cycle?` on ${escapeHtml(v380Clock(row.cycle))}`:""}</b><small>${escapeHtml(row.targetText)}</small></div>`).join("")}</div>`:""}<div class="v390-wall-actions"><button type="button" data-v390-wall-fullscreen>Fullscreen</button><button type="button" class="secondary" data-v390-wall-close>Close display</button></div></div>`}
function v390OpenWallDisplay(){const session=selectedSession(),rows=v390SessionRows(session),context=v390ActiveContext(),active=context?.item?rows.find(r=>r.blockIndex===context.blockIndex&&r.itemIndex===context.itemIndex)||rows[0]:rows[0];let overlay=$("v390WallDisplay");if(!overlay){overlay=document.createElement("div");overlay.id="v390WallDisplay";overlay.className="v390-wall-display";document.body.appendChild(overlay)}overlay.hidden=false;overlay.innerHTML=v390WallHtml(session,rows,active,context);overlay.querySelector("[data-v390-wall-close]")?.addEventListener("click",()=>{overlay.hidden=true;if(document.fullscreenElement)document.exitFullscreen?.()});overlay.querySelector("[data-v390-wall-fullscreen]")?.addEventListener("click",()=>overlay.requestFullscreen?.())}
function v390DeckPanel(){
  const host=$("v390DeckIntelligence");if(!host)return;const session=selectedSession();if(!session){host.innerHTML="";return}const rows=v390SessionRows(session),summary=v390ZoneSummary(rows),context=v390ActiveContext(),active=context?.item?rows.find(r=>r.blockIndex===context.blockIndex&&r.itemIndex===context.itemIndex)||rows[0]:rows[0],expected=v390ExpectedZones(session),mismatch=rows.filter(row=>row.inferred.matches===false&&row.zone!=="Unclassified"),open=window.innerWidth>=900?" open":"";
  host.innerHTML=`<div class="v390-deck-toolbar"><button type="button" class="secondary" data-v390-wall-open>Squad display</button></div><details${open}><summary><div><span>Session intelligence</span><strong>${escapeHtml(expected.join(" / ")||session.primary_system||"No plan intent linked")}</strong></div><b>${summary.total.toLocaleString()}m classified</b></summary><div class="v390-panel-body"><div class="v390-zone-grid">${v390ZoneCards(summary)}</div>${mismatch.length?`<div class="warning-box"><strong>${mismatch.length} intent check${mismatch.length===1?"":"s"}</strong><br>${escapeHtml(mismatch.slice(0,3).map(row=>`${row.item.raw}: ${row.zone}`).join(" · "))}</div>`:""}${active?`<article class="v390-active-classification"><div><span>Current set classification</span><strong>${escapeHtml(active.zone)}</strong></div><span class="badge ${v390ConfidenceClass(active.confidence)}">${v390ConfidenceLabel(active.confidence)} confidence</span><p>${escapeHtml(active.reasoning)}</p>${active.suggestion?`<p class="v390-suggestion"><strong>Check:</strong> ${escapeHtml(active.suggestion)}</p>`:""}<button type="button" class="secondary" data-v390-open-hub="intelligence">Why / override / challenge</button></article>`:""}<details class="v390-individual-details"><summary><strong>Individual delivery from the same session</strong><span>Attendance + pace anchors + shared time window</span></summary>${v390IndividualHtml(context)}</details></div></details>`;
  host.querySelector("[data-v390-open-hub]")?.addEventListener("click",()=>{showView("coachhub");v390SetHubTab("intelligence")});host.querySelector("[data-v390-wall-open]")?.addEventListener("click",v390OpenWallDisplay);
}
function v390EnsureDeckPanel(){const pace=$("v382PacePanel"),list=$("deckBlockList");if($("v390DeckIntelligence"))return;const host=document.createElement("article");host.id="v390DeckIntelligence";host.className="card v390-deck-intelligence";(pace||list?.closest("article.card")||list)?.insertAdjacentElement("afterend",host);v390DeckPanel()}

async function v390SaveClassification(row,zone){if(!v381IsOwner())return;const existing=v390SavedClassification(row.session.id,row.key),record={id:existing?.id||`zone-${row.session.id}-${String(row.key).replace(/[^a-z0-9]+/gi,"-")}`,session_id:row.session.id,session_block_id:row.block.id||null,set_line_key:row.key,source_text:row.item.raw||"",inferred_zone:row.inferred.zone,canonical_zone:zone,confidence:row.inferred.confidence,reasoning:row.inferred.reasoning,suggestion:row.inferred.suggestion,classification_basis:{...row.inferred,profile_version:v390Profile().version},owner_overridden:zone!==row.inferred.zone,created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("session_zone_classifications",record);queueRecord("session_zone_classifications",record.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();v390DeckPanel();updateStatus("Canonical zone saved","good")}
async function v390SaveChallenge(row,zone,reasoning){if(!reasoning.trim())return alert("Add your reasoning before sending the challenge.");const record={id:uid("zone-challenge"),session_id:row.session.id,session_block_id:row.block.id||null,set_line_key:row.key,source_text:row.item.raw||"",current_zone:row.zone,proposed_zone:zone,reasoning:reasoning.trim(),status:"open",owner_response:"",created_at:nowIso(),updated_at:nowIso(),created_by:getAuth()?.user?.id||null};upsertLocal("coach_classification_challenges",record);queueRecord("coach_classification_challenges",record.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Classification challenge sent","good")}
async function v390ResolveChallenge(id,status,response){const row=appState.coach_classification_challenges.find(x=>x.id===id);if(!row)return;row.status=status;row.owner_response=response||"";row.resolved_at=nowIso();row.resolved_by=getAuth()?.user?.id||null;row.updated_at=nowIso();queueRecord("coach_classification_challenges",row.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Challenge resolved","good")}
function v390IntelligenceTab(){const rows=v390SessionRows(),summary=v390ZoneSummary(rows),session=selectedSession(),actual=v390ActualZoneSummary(session),challenges=(appState.coach_classification_challenges||[]).filter(c=>!session||c.session_id===session.id).sort(byUpdated);return `<div class="v390-two-col"><article class="card"><div class="eyebrow">Planned zone volume</div><h3>${escapeHtml(session?.title||"Session")}</h3><div class="v390-zone-grid">${v390ZoneCards(summary)}</div><p class="help">Volume is the first reporting layer. Time in zone remains deliberately off until the underlying timing assumptions are validated.</p></article><article class="card"><div class="eyebrow">Recorded actual zone volume</div><h3>${actual.total?`${Math.round(actual.total).toLocaleString()}m classified from the session review`:"Not entered yet"}</h3><div class="v390-zone-grid">${actual.total?v390ZoneCards(actual):'<div class="help">Complete the session review energy-system split using metres or percentages to compare planned and actual volume.</div>'}</div>${actual.actual_distance?`<p class="help">Recorded session distance: ${actual.actual_distance.toLocaleString()}m.</p>`:""}</article></div><article class="card"><div class="eyebrow">Plan alignment</div><h3>${escapeHtml(v390ExpectedIntent(session)||"No verified slot intent")}</h3><p>${rows.filter(r=>r.inferred.matches===false).length?`${rows.filter(r=>r.inferred.matches===false).length} set line(s) deserve a coach check.`:"No obvious conflict between the classified work and the linked session intent."}</p></article><div class="v390-classification-list">${rows.map((row,index)=>`<article class="card v390-class-row"><div class="card-heading"><div><div class="eyebrow">${escapeHtml(row.block.title||"Set")}</div><h3>${escapeHtml(row.item.raw)}</h3><p>${escapeHtml(row.reasoning)}</p></div><span class="badge ${v390ConfidenceClass(row.confidence)}">${v390ConfidenceLabel(row.confidence)} · ${Math.round(row.confidence*100)}%</span></div>${row.suggestion?`<div class="warning-box"><strong>Coach check</strong><br>${escapeHtml(row.suggestion)}</div>`:""}${v381IsOwner()?`<label>Canonical classification<select data-v390-zone-select="${index}">${V390_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>`<option ${z===row.zone?"selected":""}>${escapeHtml(z)}</option>`).join("")}</select></label><button type="button" data-v390-save-zone="${index}">Save classification</button>`:`<details><summary><strong>Challenge this classification</strong><span>The head coach decides the canonical result</span></summary><label>Proposed zone<select data-v390-challenge-zone="${index}">${V390_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>`<option ${z===row.zone?"selected":""}>${escapeHtml(z)}</option>`).join("")}</select></label><label>Why<textarea data-v390-challenge-reason="${index}" placeholder="Explain why the set should sit elsewhere in the model."></textarea></label><button type="button" data-v390-send-challenge="${index}">Send challenge</button></details>`}</article>`).join("")||'<div class="help">No runnable set lines.</div>'}</div><article class="card"><div class="eyebrow">Assistant-coach learning loop</div><h3>Open and resolved challenges</h3>${challenges.map(c=>`<div class="v390-challenge"><div><strong>${escapeHtml(c.source_text)}</strong><span>${escapeHtml(c.current_zone)} → ${escapeHtml(c.proposed_zone)} · ${escapeHtml(c.status)}</span><p>${escapeHtml(c.reasoning)}</p>${c.owner_response?`<p><strong>Head coach:</strong> ${escapeHtml(c.owner_response)}</p>`:""}</div>${v381IsOwner()&&c.status==="open"?`<div><textarea data-v390-owner-response="${escapeHtml(c.id)}" placeholder="Explain the decision"></textarea><button type="button" data-v390-resolve="${escapeHtml(c.id)}:accepted">Accept</button><button type="button" class="secondary" data-v390-resolve="${escapeHtml(c.id)}:declined">Decline</button></div>`:""}</div>`).join("")||'<div class="help">No classification challenges.</div>'}</article>`}

function v390Squads(){const all=[...new Set([...(appState.squad_programmes||[]).map(x=>x.squad_name),...(appState.athletes||[]).map(x=>x.squad)].filter(Boolean))].sort((a,b)=>a.localeCompare(b));if(!v381IsAssistant()||v381Can("view_all_squads"))return all;const assigned=v381AssignedSquads().map(squadKey);return all.filter(s=>assigned.includes(squadKey(s)))}
function v390ClubTab(){const squads=v390Squads(),allowed=new Set(squads.map(squadKey)),slots=(appState.squad_timetable_slots||[]).filter(x=>x.active!==false&&allowed.has(squadKey(x.squad_name))).sort((a,b)=>Number(a.weekday)-Number(b.weekday)||String(a.start_time||"").localeCompare(String(b.start_time||""))),days=["","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];return `<div class="v390-two-col"><article class="card"><div class="eyebrow">Whole-club structure</div><h3>Squad programmes</h3>${squads.map(s=>{const p=(appState.squad_programmes||[]).find(x=>squadKey(x.squad_name)===squadKey(s))||{},season=(appState.season_plans||[]).find(x=>x.id===p.season_plan_id),week=(appState.weekly_plans||[]).find(x=>x.id===p.weekly_plan_id);return `<div class="v390-programme-row"><div><strong>${escapeHtml(s)}</strong><span>${escapeHtml(season?.name||"Season plan not linked")} · ${escapeHtml(week?.objective||"Weekly plan not linked")}</span></div>${v381Can("manage_club_programme")?`<button type="button" class="secondary" data-v390-edit-programme="${escapeHtml(s)}">Link plans</button>`:""}</div>`}).join("")||'<div class="help">No squads found.</div>'}</article><article class="card"><div class="eyebrow">Timetable</div><h3>All squad pool slots</h3>${slots.map(slot=>`<div class="v390-slot"><strong>${escapeHtml(days[slot.weekday]||"")} ${escapeHtml(slot.day_part)} · ${escapeHtml(slot.squad_name)}</strong><span>${escapeHtml([slot.start_time?.slice(0,5),slot.end_time?.slice(0,5),slot.venue,slot.lanes].filter(Boolean).join(" · ")||"Time/details not entered")}</span><small>${escapeHtml(slot.default_focus||"")}</small></div>`).join("")||'<div class="help">No timetable slots entered yet. Nothing has been invented.</div>'}</article></div>${v381Can("manage_club_programme")?`<article class="card"><div class="eyebrow">Add timetable slot</div><div class="form-grid"><label>Squad<select id="v390SlotSquad">${squads.map(s=>`<option>${escapeHtml(s)}</option>`).join("")}</select></label><label>Day<select id="v390SlotDay">${days.slice(1).map((d,i)=>`<option value="${i+1}">${d}</option>`).join("")}</select></label><label>AM / PM<select id="v390SlotPart"><option>AM</option><option>PM</option></select></label><label>Start<input id="v390SlotStart" type="time"></label><label>End<input id="v390SlotEnd" type="time"></label><label>Venue<input id="v390SlotVenue"></label><label>Lanes<input id="v390SlotLanes"></label><label class="wide">Default focus<input id="v390SlotFocus" placeholder="Use the verified weekly-plan wording"></label></div><button id="v390SaveSlot" type="button">Save timetable slot</button></article>`:""}`}
async function v390SaveSlot(){const squad=$("v390SlotSquad")?.value;if(!squad)return;const record={id:uid("timetable"),squad_name:squad,weekday:Number($("v390SlotDay").value),day_part:$("v390SlotPart").value,start_time:$("v390SlotStart").value||null,end_time:$("v390SlotEnd").value||null,venue:$("v390SlotVenue").value.trim(),pool_course:null,lanes:$("v390SlotLanes").value.trim(),default_focus:$("v390SlotFocus").value.trim(),active:true,created_at:nowIso(),updated_at:nowIso()};upsertLocal("squad_timetable_slots",record);queueRecord("squad_timetable_slots",record.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Timetable slot saved","good")}
function v390EditProgramme(squad){const existing=(appState.squad_programmes||[]).find(x=>squadKey(x.squad_name)===squadKey(squad)),season=prompt(`Season plan ID for ${squad} (leave blank to keep current)`,existing?.season_plan_id||"");if(season===null)return;const week=prompt(`Weekly plan ID for ${squad} (leave blank to keep current)`,existing?.weekly_plan_id||"");if(week===null)return;const record={id:existing?.id||`squad-programme-${squadKey(squad).replace(/\s+/g,"-")}`,squad_name:squad,active:true,lead_coach_user_id:existing?.lead_coach_user_id||null,season_plan_id:season||null,weekly_plan_id:week||null,notes:existing?.notes||"",created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("squad_programmes",record);queueRecord("squad_programmes",record.id);saveState(appState);syncIfPossible();v390RenderCoachHub()}

function v390RecipientEmail(athlete){const pref=athlete.communication_preference||"coach_review";if(pref==="none")return "";if(pref==="guardian")return athlete.guardian_email||"";if(pref==="both")return [athlete.swimmer_email,athlete.guardian_email].filter(Boolean).join(",");if(pref==="swimmer")return athlete.swimmer_email||"";return athlete.swimmer_email||athlete.guardian_email||""}
function v390SessionNotesFor(athlete,session){const notes=(appState.captures||[]).filter(c=>c.session_id===session.id&&(!c.athlete_id||c.athlete_id===athlete.id)&&c.text_content).sort(byUpdated).map(c=>c.text_content),times=(appState.timed_sets||[]).filter(t=>t.session_id===session.id&&t.athlete_id===athlete.id).map(t=>`${t.set_label||`${t.distance} ${t.stroke}`}: best ${formatSeconds(t.best)}${t.average?`, average ${formatSeconds(t.average)}`:""}`),adapt=v36SavedAdaptation?.(athlete.id,session.id);return {notes,times,adaptation:adapt?.adapted_text||""}}
function v390DraftBody(athlete,session){const data=v390SessionNotesFor(athlete,session),focus=session.primary_system||session.plan_cue||"today's session";return [`Hi ${athlete.full_name.split(" ")[0]},`,``, `A quick note from ${sessionLabel(session)} — ${focus}.`,data.times.length?`\nRecorded work:\n- ${data.times.join("\n- ")}`:"",data.notes.length?`\nCoaching notes:\n- ${data.notes.join("\n- ")}`:"",data.adaptation?`\nIndividual session detail:\n${data.adaptation}`:"",``,`Regards,`,`McLay Swimming coaching team`].filter(x=>x!=="").join("\n")}
async function v390CreateCommunication(athlete,session){const recipient=v390RecipientEmail(athlete),existing=(appState.coach_communications||[]).find(c=>c.session_id===session.id&&c.athlete_id===athlete.id&&c.status==="draft"),record={id:existing?.id||uid("communication"),communication_type:"session_feedback",session_id:session.id,athlete_id:athlete.id,recipient_name:athlete.full_name,recipient_email:recipient,subject:`${session.title||"Swimming session"} — ${formatDate(session.session_date)}`,body:v390DraftBody(athlete,session),status:"draft",metadata:{review_required:true},created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("coach_communications",record);queueRecord("coach_communications",record.id);saveState(appState);await syncIfPossible();return record}
function v390LatestMeetRows(athlete){const rows=(appState.coach_results||[]).filter(r=>r.athlete_id===athlete.id&&r.excluded_from_pb!==true&&r.result_date).sort((a,b)=>String(b.result_date).localeCompare(String(a.result_date)));if(!rows.length)return [];const latest=rows[0],key=String(latest.meet_name||latest.result_date||"").trim();return rows.filter(r=>String(r.meet_name||r.result_date||"").trim()===key)}
function v390MeetDraftBody(athlete,rows){const first=rows[0],meet=first?.meet_name||"Latest meet",date=first?.result_date?formatDate(first.result_date):"",lines=rows.map(r=>`${r.distance||""} ${r.stroke||""}${r.stage?` ${r.stage}`:""}: ${v3Time(Number(r.result_seconds))}`).join("\n");return `Hi ${athlete.full_name.split(" ")[0]},\nA review draft from ${meet}${date?` (${date})`:""}.\n${lines?`\nResults recorded:\n${lines}\n`:""}\nCoach analysis / next focus:\n[Review and add the coaching discussion before sending.]\n\nRegards,\nMcLay Swimming coaching team`}
async function v390CreateMeetCommunication(athlete){const rows=v390LatestMeetRows(athlete);if(!rows.length)return alert("No verified meet results are available for this swimmer yet.");const first=rows[0],meet=first.meet_name||"Latest meet",recipient=v390RecipientEmail(athlete),existing=(appState.coach_communications||[]).find(c=>c.communication_type==="meet_analysis"&&c.athlete_id===athlete.id&&c.metadata?.meet_name===meet&&c.status==="draft"),record={id:existing?.id||uid("communication"),communication_type:"meet_analysis",session_id:null,athlete_id:athlete.id,recipient_name:athlete.full_name,recipient_email:recipient,subject:`${meet} — performance review`,body:v390MeetDraftBody(athlete,rows),status:"draft",metadata:{review_required:true,meet_name:meet,result_date:first.result_date,result_ids:rows.map(r=>r.id)},created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("coach_communications",record);queueRecord("coach_communications",record.id);saveState(appState);await syncIfPossible();return record}

function v390Mailto(record){return `mailto:${encodeURIComponent(record.recipient_email||"")}?subject=${encodeURIComponent(record.subject||"")}&body=${encodeURIComponent(record.body||"")}`}
function v390CommsTab(){const session=selectedSession(),roster=v382PresentRoster(),drafts=(appState.coach_communications||[]).filter(c=>!session||!c.session_id||c.session_id===session.id).sort(byUpdated);return `<article class="card"><div class="eyebrow">Reviewable communications</div><h3>Post-session / post-meet email drafts</h3><p>Nothing sends automatically. Create a draft, review the wording and then open it in your email app.</p><div class="v390-comms-roster">${roster.map(a=>`<div><strong>${escapeHtml(a.full_name)}</strong><span>${escapeHtml(v390RecipientEmail(a)||"No swimmer/guardian email saved")}</span><div class="button-row"><button type="button" data-v390-create-draft="${escapeHtml(a.id)}">Session draft</button><button type="button" class="secondary" data-v390-create-meet-draft="${escapeHtml(a.id)}" ${v390LatestMeetRows(a).length?"":"disabled"}>Latest meet</button></div></div>`).join("")||'<div class="help">No attending swimmers.</div>'}</div></article>${drafts.map(d=>`<article class="card v390-draft"><div class="card-heading"><div><div class="eyebrow">${escapeHtml(d.communication_type)}</div><h3>${escapeHtml(d.recipient_name)}</h3><p>${escapeHtml(d.recipient_email||"Recipient email still required")}</p></div><span class="badge">${escapeHtml(d.status)}</span></div><label>Subject<input data-v390-draft-subject="${escapeHtml(d.id)}" value="${escapeHtml(d.subject)}"></label><label>Body<textarea data-v390-draft-body="${escapeHtml(d.id)}">${escapeHtml(d.body)}</textarea></label><div class="button-row"><button type="button" data-v390-save-draft="${escapeHtml(d.id)}">Save draft</button><a class="button secondary" href="${escapeHtml(v390Mailto(d))}">Open in email</a></div></article>`).join("")}`}
async function v390SaveDraft(id){const row=appState.coach_communications.find(x=>x.id===id);if(!row)return;row.subject=document.querySelector(`[data-v390-draft-subject="${CSS.escape(id)}"]`)?.value||row.subject;row.body=document.querySelector(`[data-v390-draft-body="${CSS.escape(id)}"]`)?.value||row.body;row.updated_at=nowIso();queueRecord("coach_communications",row.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Email draft saved","good")}

function v390ProfileTab(){const profile=v390Profile(),defs=profile.zone_definitions||{};return `<article class="card"><div class="eyebrow">McLay coaching profile</div><h3>Training-intensity reference, version ${escapeHtml(profile.version||"1.0")}</h3><p>${escapeHtml(profile.source_credit||"")}</p><div class="v390-profile-grid">${V390_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>{const d=defs[z]||{},hr=d.heart_rate||{};return `<fieldset><legend>${escapeHtml(z)}</legend><div class="form-grid"><label>HR min<input data-v390-hr-min="${escapeHtml(z)}" type="number" value="${hr.min??""}"></label><label>HR max<input data-v390-hr-max="${escapeHtml(z)}" type="number" value="${hr.max??""}"></label><label class="wide">Stroke-rate guide / notes<input data-v390-sr="${escapeHtml(z)}" value="${escapeHtml(d.stroke_rate_guide||"")}" placeholder="Leave blank until confirmed"></label><label class="wide">Definition<textarea data-v390-zone-notes="${escapeHtml(z)}">${escapeHtml(d.notes||"")}</textarea></label></div></fieldset>`}).join("")}</div>${v381Can("manage_coaching_profile")?'<button id="v390SaveProfile" type="button">Save new profile version</button>':'<div class="help">Reference values are controlled by the head coach.</div>'}</article>`}
async function v390SaveProfile(){const old=v390Profile(),defs={...old.zone_definitions};for(const z of V390_ZONE_ORDER.filter(x=>x!=="Unclassified")){const min=document.querySelector(`[data-v390-hr-min="${CSS.escape(z)}"]`)?.value,max=document.querySelector(`[data-v390-hr-max="${CSS.escape(z)}"]`)?.value,sr=document.querySelector(`[data-v390-sr="${CSS.escape(z)}"]`)?.value||"",notes=document.querySelector(`[data-v390-zone-notes="${CSS.escape(z)}"]`)?.value||"";defs[z]={...(defs[z]||{}),heart_rate:{min:min===""?null:Number(min),max:max===""?null:Number(max)},stroke_rate_guide:sr,notes}}
  const current=Number(String(old.version||"1.0").split(".")[1]||0),record={id:uid("coaching-profile"),name:old.name||"McLay full-spectrum coaching profile",version:`1.${current+1}`,source_credit:old.source_credit||"Clive Rushton cone used as the base reference; coach-owned adaptations remain explicit and versioned.",zone_definitions:defs,inference_rules:{...(old.inference_rules||{}),explicit_first:true,owner_override_only:true,assistant_challenge:true,volume_first:true,time_in_zone:false,numeric_guides_require_coach_confirmation:true},active:true,created_at:nowIso(),updated_at:nowIso()};for(const p of appState.coaching_profiles)p.active=false;upsertLocal("coaching_profiles",record);queueRecord("coaching_profiles",record.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus(`Coaching profile ${record.version} saved`,"good")}

function v390SetHubTab(tab){appState.settings.v390_hub_tab=tab;saveState(appState);v390RenderCoachHub()}
function v390RenderCoachHub(){const host=$("v390CoachHub");if(!host)return;const available=[];if(v381IsOwner()||v381Can("view_session_intelligence"))available.push(["intelligence","Session intelligence"]);if(v381IsOwner()||v381Can("view_club_programme"))available.push(["club","Club programme"]);if(v381IsOwner()||v381Can("create_communications"))available.push(["comms","Communications"]);if(v381IsOwner())available.push(["profile","Coaching profile"]);let tab=appState.settings.v390_hub_tab||available[0]?.[0]||"intelligence";if(!available.some(([key])=>key===tab))tab=available[0]?.[0]||"intelligence";host.innerHTML=`<div class="v390-tabs">${available.map(([key,label])=>`<button data-v390-tab="${key}" class="${tab===key?"active":""}">${label}</button>`).join("")}</div><div id="v390HubBody">${tab==="club"?v390ClubTab():tab==="comms"?v390CommsTab():tab==="profile"?v390ProfileTab():v390IntelligenceTab()}</div>`;host.querySelectorAll("[data-v390-tab]").forEach(b=>b.onclick=()=>v390SetHubTab(b.dataset.v390Tab));
  const rows=v390SessionRows();host.querySelectorAll("[data-v390-save-zone]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.v390SaveZone),z=host.querySelector(`[data-v390-zone-select="${i}"]`)?.value;v390SaveClassification(rows[i],z)});host.querySelectorAll("[data-v390-send-challenge]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.v390SendChallenge),z=host.querySelector(`[data-v390-challenge-zone="${i}"]`)?.value,r=host.querySelector(`[data-v390-challenge-reason="${i}"]`)?.value||"";v390SaveChallenge(rows[i],z,r)});host.querySelectorAll("[data-v390-resolve]").forEach(b=>b.onclick=()=>{const [id,status]=b.dataset.v390Resolve.split(":");const response=host.querySelector(`[data-v390-owner-response="${CSS.escape(id)}"]`)?.value||"";v390ResolveChallenge(id,status,response)});host.querySelectorAll("[data-v390-edit-programme]").forEach(b=>b.onclick=()=>v390EditProgramme(b.dataset.v390EditProgramme));$("v390SaveSlot")?.addEventListener("click",v390SaveSlot);host.querySelectorAll("[data-v390-create-draft]").forEach(b=>b.onclick=async()=>{const athlete=appState.athletes.find(a=>a.id===b.dataset.v390CreateDraft);await v390CreateCommunication(athlete,selectedSession());v390RenderCoachHub()});host.querySelectorAll("[data-v390-create-meet-draft]").forEach(b=>b.onclick=async()=>{const athlete=appState.athletes.find(a=>a.id===b.dataset.v390CreateMeetDraft);await v390CreateMeetCommunication(athlete);v390RenderCoachHub()});host.querySelectorAll("[data-v390-save-draft]").forEach(b=>b.onclick=()=>v390SaveDraft(b.dataset.v390SaveDraft));$("v390SaveProfile")?.addEventListener("click",v390SaveProfile)}
function v390InjectHub(){if(!document.querySelector('.sidebar [data-view="coachhub"]')){const b=document.createElement("button");b.className="nav-button";b.dataset.view="coachhub";b.textContent="Coach hub";document.querySelector('.sidebar [data-view="reports"]')?.after(b)}if(!document.querySelector('.mobile-nav [data-view="coachhub"]')){const b=document.createElement("button");b.className="nav-button";b.dataset.view="coachhub";b.innerHTML="<span>◎</span>Coach hub";document.querySelector('.mobile-nav [data-view="reports"]')?.after(b)}if(!$("coachhub")){const section=document.createElement("section");section.id="coachhub";section.className="view";section.innerHTML='<div class="view-heading"><div><h2>Coach hub</h2><p>Interpret the session, deliver individual versions, manage the club programme and prepare communications.</p></div></div><div id="v390CoachHub"></div>';$("settings")?.before(section)}}

const v390PriorAllowedView=v381AllowedView;
v381AllowedView=function(id){if(id==="coachhub")return v381IsOwner()||v381Can("view_session_intelligence")||v381Can("view_club_programme")||v381Can("create_communications");return v390PriorAllowedView(id)};
const v390PriorShowView=showView;
showView=function(id){v390PriorShowView(id);if(id==="coachhub")v390RenderCoachHub();if(id==="deck"){v390EnsureDeckPanel();v390DeckPanel()}};
const v390PriorRenderView=renderView;
renderView=function(id){v390PriorRenderView(id);if(id==="coachhub")v390RenderCoachHub();if(id==="deck"){v390EnsureDeckPanel();v390DeckPanel()}};
const v390PriorRenderAll=renderAll;
renderAll=function(){v390PriorRenderAll();v390InjectHub();v381ApplyAccess();const active=document.querySelector('.view.active')?.id;if(active==="coachhub")v390RenderCoachHub();if(active==="deck"){v390EnsureDeckPanel();v390DeckPanel()}};

function v390EnhanceCoachInvite(){const host=$("v381InviteResult");if(host&&!host.querySelector("[data-v390-email-invite]")&&host.querySelector("input")){const email=$("v381InviteEmail")?.value||"",name=$("v381InviteName")?.value||"Coach",link=host.querySelector("input")?.value||"";const a=document.createElement("a");a.dataset.v390EmailInvite="1";a.className="button secondary";a.textContent="Email invitation";a.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("McLay Swimming assistant-coach invitation")}&body=${encodeURIComponent(`Hi ${name},\n\nUse this secure invitation to create your assistant-coach sign-in:\n${link}\n\nYour squads and permissions are controlled by the head coach.`)}`;host.appendChild(a)}}
const v390PriorRenderRosterList=v381RenderRosterList;
v381RenderRosterList=function(){v390PriorRenderRosterList();document.querySelectorAll('.v381-coach-card[data-v381-token]').forEach(card=>{const token=card.dataset.v381Token,email=card.querySelector("p")?.textContent?.split(" · ")[0]?.trim()||"";if(token&&!card.querySelector("[data-v390-email-pending]")){const a=document.createElement("a");a.dataset.v390EmailPending="1";a.className="button secondary";a.textContent="Email invite";const link=v381InviteLink(token);a.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("McLay Swimming assistant-coach invitation")}&body=${encodeURIComponent(`Use this secure invitation to create your assistant-coach sign-in:\n${link}`)}`;card.appendChild(a)}})};
const v390PriorCreateInvite=v381CreateInvite;
v381CreateInvite=async function(){await v390PriorCreateInvite();v390EnhanceCoachInvite()};

function v390InjectStyles(){if($("v390Styles"))return;const style=document.createElement("style");style.id="v390Styles";style.textContent=`
[hidden]{display:none!important}.v390-deck-intelligence{padding:0!important;overflow:hidden}.v390-deck-intelligence>details>summary{cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:.75rem;background:#eaf3f7;padding:.8rem 1rem}.v390-deck-intelligence>details>summary span{display:block;font-size:.65rem;text-transform:uppercase;font-weight:900;color:#567}.v390-deck-intelligence>details>summary strong{display:block;color:#123a5b}.v390-panel-body{padding:.8rem}.v390-zone-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.45rem;margin:.5rem 0}.v390-zone-card{border:1px solid #c8dbe4;border-radius:.55rem;padding:.5rem;background:#f8fbfc}.v390-zone-card span{display:block;font-size:.68rem;text-transform:uppercase;color:#567;font-weight:900}.v390-zone-card strong{font-size:1.05rem;color:#123a5b}.v390-active-classification{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.45rem;align-items:start;padding:.65rem;border-left:5px solid #2b7a78;background:#f0f8f6;border-radius:.4rem;margin:.6rem 0}.v390-active-classification p,.v390-active-classification button{grid-column:1/-1;margin:.1rem 0}.v390-suggestion{background:#fff8e7;padding:.45rem;border-radius:.35rem}.v390-individual-details{border:1px solid #cbdde6;border-radius:.65rem;padding:.55rem}.v390-individual-details>summary{display:flex;justify-content:space-between;gap:.5rem;cursor:pointer}.v390-individual-details>summary span{font-size:.75rem;color:#567}.v390-prescription-list{display:grid;gap:.35rem;margin-top:.55rem}.v390-prescription{display:grid;grid-template-columns:minmax(0,1fr) minmax(190px,.75fr);gap:.55rem;padding:.5rem;border:1px solid #d6e5ec;border-radius:.5rem}.v390-prescription.modified{border-left:5px solid #b46a00;background:#fff8e7}.v390-prescription strong,.v390-prescription span,.v390-prescription b,.v390-prescription small{display:block}.v390-prescription span,.v390-prescription small{font-size:.76rem;color:#567}.v390-tabs{display:flex;gap:.4rem;overflow-x:auto;margin-bottom:.7rem}.v390-tabs button{white-space:nowrap;background:#fff;color:#123a5b;border:2px solid #9abed1}.v390-tabs button.active{background:#123a5b;color:#fff}.v390-two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.v390-classification-list{display:grid;gap:.65rem}.v390-class-row{border-left:5px solid #2b7a78}.v390-challenge{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.5fr);gap:.7rem;padding:.6rem 0;border-top:1px solid #dce8ed}.v390-challenge span{display:block;font-size:.75rem;color:#567}.v390-programme-row,.v390-slot,.v390-comms-roster>div{display:flex;justify-content:space-between;align-items:center;gap:.55rem;padding:.5rem 0;border-bottom:1px solid #dce8ed}.v390-programme-row span,.v390-slot span,.v390-slot small,.v390-comms-roster span{display:block;font-size:.75rem;color:#567}.v390-profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.v390-profile-grid fieldset{border:1px solid #cbdde6;border-radius:.6rem;padding:.6rem}.v390-profile-grid legend{font-weight:900;color:#123a5b}.v390-draft textarea{min-height:260px}.button{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border-radius:.6rem;padding:.6rem .85rem;font-weight:800}.v390-deck-toolbar{display:flex;justify-content:flex-end;padding:.45rem .55rem 0}.v390-wall-display{position:fixed;inset:0;z-index:9999;background:#082c45;color:#fff;padding:clamp(18px,4vw,60px);overflow:auto}.v390-wall-shell{max-width:1500px;margin:auto}.v390-wall-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2rem;align-items:start;border-bottom:4px solid #78d4df;padding-bottom:2rem}.v390-wall-top span,.v390-wall-grid span,.v390-wall-exceptions>span,.v390-wall-zone span{display:block;text-transform:uppercase;letter-spacing:.08em;font-weight:900;color:#a7dce3}.v390-wall-top h1{font-size:clamp(2rem,5vw,5.5rem);line-height:1.02;margin:.35rem 0}.v390-wall-zone{background:#fff;color:#082c45;padding:1.2rem 1.5rem;border-radius:1rem;min-width:230px}.v390-wall-zone span{color:#477}.v390-wall-zone strong{font-size:clamp(1.4rem,2.8vw,3rem)}.v390-wall-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;margin:2rem 0}.v390-wall-grid section{background:#123f5b;border-radius:1rem;padding:1.3rem}.v390-wall-grid strong{display:block;font-size:clamp(1.2rem,2vw,2.2rem);margin-top:.4rem}.v390-wall-exceptions{background:#fff;color:#082c45;border-radius:1rem;padding:1.2rem}.v390-wall-exceptions>span{color:#477}.v390-wall-exceptions>div{display:grid;grid-template-columns:minmax(160px,.5fr) 1fr minmax(170px,.5fr);gap:1rem;padding:.7rem 0;border-bottom:1px solid #d8e4e9;align-items:center}.v390-wall-exceptions small{font-size:1rem}.v390-wall-actions{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.2rem}.v390-wall-actions .secondary{background:#fff;color:#082c45}@media(max-width:900px){.v390-wall-top,.v390-wall-grid{grid-template-columns:1fr}.v390-wall-zone{min-width:0}.v390-wall-exceptions>div{grid-template-columns:1fr}.v390-two-col,.v390-profile-grid{grid-template-columns:1fr}.v390-prescription{grid-template-columns:1fr}.v390-challenge{grid-template-columns:1fr}.v390-panel-body{padding:.55rem}.v390-deck-intelligence>details>summary{padding:.6rem}.v390-zone-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v390-individual-details>summary{display:block}}
`;document.head.appendChild(style)}
const v390BaseFillAthleteProfile=fillAthleteProfile;
fillAthleteProfile=function(athlete){v390BaseFillAthleteProfile(athlete);if(!athlete)return;if($("profileSwimmerEmail"))$("profileSwimmerEmail").value=athlete.swimmer_email||"";if($("profileGuardianEmail"))$("profileGuardianEmail").value=athlete.guardian_email||"";if($("profileCommunicationPreference"))$("profileCommunicationPreference").value=athlete.communication_preference||"coach_review"};
function v390CaptureCommunicationFields(){const athlete=appState.athletes.find(a=>a.id===$("profileAthleteId")?.value);if(!athlete)return;athlete.swimmer_email=$("profileSwimmerEmail")?.value.trim()||null;athlete.guardian_email=$("profileGuardianEmail")?.value.trim()||null;athlete.communication_preference=$("profileCommunicationPreference")?.value||"coach_review";athlete.updated_at=nowIso();}
$("saveAthleteProfileBtn")?.addEventListener("click",v390CaptureCommunicationFields,true);

const v390BaseSetActivePaceLine=v382SetActivePaceLine;
v382SetActivePaceLine=function(blockIndex,itemIndex,open=true){v390BaseSetActivePaceLine(blockIndex,itemIndex,open);v390DeckPanel()};

const v390BaseRenderTestSets=v380RenderTestSets;
v380RenderTestSets=function(){v390BaseRenderTestSets();const host=$("testsets");if(host&&!$("v390MikeLeeCredit")){const note=document.createElement("p");note.id="v390MikeLeeCredit";note.className="help v390-model-credit";note.textContent="Time 400 methodology developed by Mike Lee · adapted within McLay Swimming OS.";host.querySelector(".view-heading")?.insertAdjacentElement("afterend",note)}};
renderTestSets=v380RenderTestSets;

function v390Interface(){v390InjectStyles();v390InjectHub();document.title="McLay Swimming OS — v3.9.0 Club Intelligence";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.9.0 · intelligent sessions · individual delivery · whole-club coaching · reviewable communications";v390EnsureDeckPanel();v390DeckPanel();if(document.querySelector("#testsets"))v380RenderTestSets()}

v390Interface();renderAll();


// -----------------------------------------------------------------------------
// v3.10.0 — Operational coaching release candidate
// One canonical session; attendance drives every individual view; McLay wording
// only; robust PB fallback/audit; structured modifications; meet workflow;
// reviewable communications and assistant-coach invitations/challenges.
// -----------------------------------------------------------------------------
const V310_BUILD="20260728-operational-coaching-310";
const V310_AEROBIC_ZONES=["Regeneration","Development","Overload","Threshold","Clearance"];
const V310_ANAEROBIC_ZONES=["Speed","Anaerobic power","Anaerobic capacity","Lactate tolerance","Race pace"];
const V310_ZONE_ORDER=[...V310_AEROBIC_ZONES,...V310_ANAEROBIC_ZONES,"Unclassified"];
const V310_TABLES=["session_participants","athlete_squad_history","athlete_individual_plans","swim_meets","swim_meet_entries","swim_meet_feedback","result_import_audits"];
for(const key of V310_TABLES){if(!CLOUD_TABLES.includes(key))CLOUD_TABLES.push(key);if(!Array.isArray(appState[key]))appState[key]=[]}
for(const permission of [
  {key:"manage_meets",label:"Manage meet entries, targets and reviews",group:"Administration",default:false},
  {key:"view_meets",label:"View assigned-squad meets and entries",group:"Information",default:true},
  {key:"manage_modifications",label:"Manage swimmer modifications and individual plans",group:"Administration",default:false},
  {key:"add_session_participants",label:"Add visitors or extra swimmers to a session",group:"Poolside",default:true},
  {key:"view_data_health",label:"View PB and import data-health checks",group:"Information",default:true}
])if(typeof V381_PERMISSION_CATALOG!=="undefined"&&!V381_PERMISSION_CATALOG.some(item=>item.key===permission.key))V381_PERMISSION_CATALOG.push(permission);

const v310PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  const org=appState.settings.organisation_id,user=getAuth()?.user?.id;
  if(table==="session_participants")return {id:record.id,organisation_id:org,session_id:record.session_id,athlete_id:record.athlete_id,participant_type:record.participant_type||"extra",source_squad:record.source_squad||"",notes:record.notes||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="athlete_squad_history")return {id:record.id,organisation_id:org,athlete_id:record.athlete_id,from_squad:record.from_squad||"",to_squad:record.to_squad||"",effective_date:record.effective_date||new Date().toISOString().slice(0,10),reason:record.reason||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="athlete_individual_plans")return {id:record.id,organisation_id:org,athlete_id:record.athlete_id,plan_name:record.plan_name||"Individual performance plan",plan_type:record.plan_type||"individual",start_date:record.start_date||null,end_date:record.end_date||null,priority:Number(record.priority||100),status:record.status||"active",purpose:record.purpose||"",session_adjustments:record.session_adjustments||{},notes:record.notes||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="swim_meets")return {id:record.id,organisation_id:org,name:record.name||"",start_date:record.start_date||null,end_date:record.end_date||record.start_date||null,venue:record.venue||"",course:record.course||null,meet_level:record.meet_level||"",status:record.status||"upcoming",notes:record.notes||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="swim_meet_entries")return {id:record.id,organisation_id:org,meet_id:record.meet_id,athlete_id:record.athlete_id,events:record.events||[],targets:record.targets||{},entry_status:record.entry_status||"entered",travel_notes:record.travel_notes||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="swim_meet_feedback")return {id:record.id,organisation_id:org,meet_id:record.meet_id,athlete_id:record.athlete_id,summary:record.summary||"",positives:record.positives||"",next_focus:record.next_focus||"",coach_notes:record.coach_notes||"",communication_id:record.communication_id||null,created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="result_import_audits")return {id:record.id,organisation_id:org,import_batch_id:record.import_batch_id||null,file_name:record.file_name||"",source_type:record.source_type||"",matched_rows:Number(record.matched_rows||0),unmatched_rows:Number(record.unmatched_rows||0),duplicate_rows:Number(record.duplicate_rows||0),held_rows:Number(record.held_rows||0),notes:record.notes||"",created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user};
  if(table==="athlete_adaptation_rules"){
    const row=v310PriorCloudRow(table,record);return {...row,modification_type:record.modification_type||"coaching",effective_from:record.effective_from||null,effective_to:record.effective_to||null,priority:Number(record.priority||100),private_medical:record.private_medical===true};
  }
  if(table==="athletes"){
    const row=v310PriorCloudRow(table,record);return {...row,is_visitor:record.is_visitor===true,visitor_home_club:record.visitor_home_club||null};
  }
  return v310PriorCloudRow(table,record);
};

function v310NormalText(value){return String(value||"").toLowerCase().replace(/[–—]/g,"-").replace(/×/g,"x").replace(/\s+/g," ").trim()}
function v310ExplicitAerobicZone(text){
  const raw=String(text||""),t=v310NormalText(raw);
  if(/\bregeneration\b|\bregen\b|\brecovery\b|\breg\b/.test(t))return "Regeneration";
  if(/\baerobic development\b|\bdevelopment\b|\bdev\b/.test(t))return "Development";
  if(/\baerobic overload\b|\boverload\b|\bol\b/.test(t))return "Overload";
  if(/\bthreshold\b|\bcss\b/.test(t)||/\bA(?:\s*[-.]?\s*)T\b/.test(raw))return "Threshold";
  if(/\blactate clearance\b|\bclearance\b|\bcl\b/.test(t))return "Clearance";
  return "";
}
const v310PriorDetectedZone=v382DetectedZone;
v382DetectedZone=function(text){return v310ExplicitAerobicZone(text)||v310PriorDetectedZone(text)};

function v310PaceRange(text){
  const raw=String(text||""),t=v310NormalText(raw);let m;
  if((m=t.match(/(?:plus\s*\/\s*minus|\+\s*\/\s*-|±)\s*(\d+(?:\.\d+)?)\s*(%|s|sec|secs|seconds?)?/i)))return {kind:(m[2]||"s").startsWith("%")?"percent":"seconds",minus:Number(m[1]),plus:Number(m[1]),label:`±${m[1]}${(m[2]||"s").startsWith("%")?"%":"s"}`};
  if((m=t.match(/(?:pace|pb|goal|target)\s*([+-])\s*(\d+(?:\.\d+)?)\s*(%|s|sec|secs|seconds?)?/i))){const val=Number(m[2]),kind=(m[3]||"s").startsWith("%")?"percent":"seconds";return {kind,minus:m[1]==="-"?val:0,plus:m[1]==="+"?val:0,label:`${m[1]}${m[2]}${kind==="percent"?"%":"s"}`}}
  if((m=t.match(/within\s*(\d+(?:\.\d+)?)\s*(%|s|sec|secs|seconds?)/i))){const val=Number(m[1]),kind=m[2].startsWith("%")?"percent":"seconds";return {kind,minus:val,plus:val,label:`within ${m[1]}${kind==="percent"?"%":"s"}`}}
  return null;
}
function v310ApplyRange(seconds,range){if(!range||!Number.isFinite(Number(seconds)))return {low:Number(seconds),high:Number(seconds)};const s=Number(seconds);if(range.kind==="percent")return {low:s*(1-range.minus/100),high:s*(1+range.plus/100)};return {low:Math.max(0,s-range.minus),high:s+range.plus}}
const v310PriorPaceSpec=v382PaceSpec;
v382PaceSpec=function(item,block,session){const spec=v310PriorPaceSpec(item,block,session);return {...spec,range:v310PaceRange(spec.text||item?.raw||"")}};

const v310PriorRowTarget=v382RowTarget;
v382RowTarget=function(athlete,spec){
  if(spec.mode!=="race")return v310PriorRowTarget(athlete,spec);
  if(spec.genericAnaerobic)return {status:"needs",message:"Choose a race distance so PB or goal pace can anchor this work"};
  const pb=v382PbFor(athlete,spec.course,spec.raceDistance,spec.stroke);if(!pb)return {status:"missing",message:`No ${spec.course} ${spec.raceDistance} ${spec.stroke} PB`};
  const pbRace=v382BestRaceWithSplits(athlete,pb),pbTarget=v382RaceSegment(pb.result_seconds,spec.raceDistance,spec.repDistance,{splits:pbRace?.splits||[],splitDistance:Number(pbRace?.split_distance)||null,segmentIndex:spec.segmentIndex});
  const goal=v382GoalFor(athlete,pb,spec.course,spec.raceDistance,spec.stroke),goalTarget=goal?v382RaceSegment(goal.seconds,spec.raceDistance,spec.repDistance,{splits:goal.splits,splitDistance:goal.splitDistance,segmentIndex:spec.segmentIndex}):null;
  if(spec.source==="goal"&&!goalTarget)return {status:"needs",message:"No saved or pathway next target for this event"};
  const parts=[];const detail=[];
  const add=(label,target)=>{if(!target)return;const r=v310ApplyRange(target.seconds,spec.range);parts.push(spec.range?`${label} ${v380Clock(r.low)}–${v380Clock(r.high)}`:`${label} ${v380Clock(target.seconds)}`);detail.push(target.method)};
  if(spec.source!=="goal")add("PB",pbTarget);if(spec.source!=="pb"&&goalTarget)add(goal.label,goalTarget);
  return {status:"ok",kind:"race",primary:parts.join(" · ")||`PB ${v380Clock(pbTarget.seconds)}`,secondary:`${spec.course} ${spec.raceDistance} ${spec.stroke} · PB ${v380Clock(pb.result_seconds)}${goal?` · target ${v380Clock(goal.seconds)}`:" · no next target loaded"}${spec.range?` · ${spec.range.label}`:""}`,method:[...new Set(detail.filter(Boolean))].join(" / ")};
};

function v310RaceStimulus({work,ratio,raceDistance,repDistance,reps,maximal}){
  if(work!==null&&work<=10&&(ratio===null||ratio>=3))return {zone:"Speed",confidence:.9,reason:`About ${work.toFixed(1)}s of maximum work with substantial recovery preserves speed quality.`};
  if(maximal&&work!==null&&work<=45&&ratio!==null&&ratio>=3.5)return {zone:"Anaerobic power",confidence:.84,reason:`About ${work.toFixed(0)}s of high-quality work with ${ratio.toFixed(1)}:1 recovery favours maximum power.`};
  if(work!==null&&ratio!==null&&ratio<=1.25&&reps>=3)return {zone:"Lactate tolerance",confidence:.82,reason:`Repeated work with only ${ratio.toFixed(1)}:1 recovery is likely to accumulate substantial fatigue and lactate.`};
  if(work!==null&&work<=120&&ratio!==null&&ratio<3.5)return {zone:"Anaerobic capacity",confidence:.78,reason:`Race-specific work of about ${work.toFixed(0)}s with incomplete recovery develops repeated high-intensity capacity.`};
  if(raceDistance&&raceDistance>=400)return {zone:"Race pace",confidence:.72,reason:`${raceDistance}m pace is retained as race-specific work; repetition duration and recovery decide the secondary response.`};
  if(repDistance&&repDistance<=25&&maximal)return {zone:"Speed",confidence:.7,reason:"Short maximum-distance work is provisionally treated as speed."};
  return {zone:"Race pace",confidence:.68,reason:"The named PB/goal race pace is the reliable anchor; the exact physiological response depends on actual duration and recovery."};
}
function v310IntensityClassification(item,block,session){
  const text=v390Text(item,block,session),t=v310NormalText(text),spec=v382PaceSpec(item,block,session),distance=v390SetDistance(item),repDistance=v390RepDistance(item),reps=v390Reps(item),cycle=v390Cycle(item),work=v390EstimatedWorkSeconds(item,block,session),rest=cycle&&work?Math.max(0,cycle-work):null,ratio=work&&rest!==null?rest/work:null,explicit=v310ExplicitAerobicZone(text);
  let zone="Unclassified",confidence=.35,reasoning="No explicit physiological label or reliable pace anchor was found.",suggestion="Add Reg, Dev, OL, AT, CL or a named race pace when this is a key set.",basis="unclassified";
  if(explicit){zone=explicit;confidence=.98;reasoning=`${explicit} is explicit; individual pace is anchored to the swimmer's T400 result.`;suggestion="";basis="explicit_aerobic"}
  else if(spec.mode==="aerobic"){zone=spec.zone;confidence=.98;reasoning=`${spec.zone} is explicit; individual pace comes from the T400 model.`;suggestion="";basis="explicit_aerobic"}
  else if(spec.mode==="race"&&!spec.genericAnaerobic){const maximal=/\b(max(?:imum)? effort|max speed|all out|sprint)\b/.test(t),stim=v310RaceStimulus({work,ratio,raceDistance:spec.raceDistance,repDistance,reps,maximal});zone=stim.zone;confidence=stim.confidence;reasoning=`PB or goal ${spec.raceDistance}m pace is the anchor. ${stim.reason}`;suggestion=ratio===null?"Add a send-off or rest when you want a stronger physiological classification.":"";basis="race_pace_duration_recovery"}
  else if(/\b(max(?:imum)? effort|max speed|all out|sprint)\b/.test(t)||spec.mode==="max"){const stim=v310RaceStimulus({work,ratio,raceDistance:null,repDistance,reps,maximal:true});zone=stim.zone;confidence=stim.confidence;reasoning=stim.reason;suggestion=ratio===null?"Add a send-off or rest to distinguish power from tolerance/capacity.":"";basis="duration_recovery"}
  else if(/\b(min(?:imum)? stroke count|stroke count|long and controlled|slow and controlled|easy choice|drill)\b/.test(t)){const minimum=/\bmin(?:imum)? stroke count|stroke count\b/.test(t),easy=/\beasy choice|slow and controlled\b/.test(t);zone=(minimum||easy||block?.block_type==="warm_up"||block?.block_type==="warm_down")?"Regeneration":"Development";confidence=.76;reasoning=minimum?"Minimum-stroke-count work is treated as Regeneration unless a stronger intensity is stated.":easy?"Slow and controlled work is treated as Regeneration.":`Drill work is provisionally treated as ${zone}.`;suggestion="Override if the drill is deliberately loaded or race-specific.";basis="coach_language"}
  else if(/\b(aerobic capacity|aerobic power)\b/.test(t)){zone="Overload";confidence=.7;reasoning="Aerobic capacity/power language is provisionally placed at the Overload end of the T400 model.";suggestion="Use OL, AT or CL if a more exact T400 target is intended.";basis="coach_language"}
  else if(/\b(warm[- ]?up|warm[- ]?down|cool[- ]?down|easy)\b/.test(t)||block?.block_type==="warm_up"||block?.block_type==="warm_down"){zone="Regeneration";confidence=.8;reasoning="Warm-up, warm-down and easy work are normally Regeneration unless a stronger instruction is stated.";suggestion="";basis="block_context"}
  const expected=v390ExpectedZones(session).map(z=>z==="Speed"?"Speed":z),alignmentRelevant=block?.block_type==="main_set"||/main set/i.test(String(block?.title||"")),matches=!alignmentRelevant||!expected.length||expected.includes(zone)||(expected.includes("Overload")&&["Development","Threshold"].includes(zone));
  if(!matches&&zone!=="Unclassified")suggestion=suggestion||`Today's main-set intent points toward ${expected.join(" / ")}; this line looks more like ${zone}. Check that the difference is intentional.`;
  return {zone,confidence,reasoning,suggestion,basis,distance,repDistance,reps,cycle,work_seconds:work,rest_seconds:rest,rest_ratio:ratio,expected,matches,source_text:item?.raw||"",pace_range:spec.range||null,race_distance:spec.raceDistance||null};
}
// Visible language is McLay wording only. T400 anchors the aerobic terms;
// PB/goal pace, work duration and recovery anchor the race-specific terms.
v390IntensityClassification=v310IntensityClassification;
function v310ZoneName(value){const explicit=v310ExplicitAerobicZone(value);if(explicit)return explicit;const t=v310NormalText(value);const aliases=[["Speed",/\bspeed\b|alactic|phosphate/],["Anaerobic power",/anaerobic power/],["Anaerobic capacity",/anaerobic capacity|vo2/],["Lactate tolerance",/lactate tolerance/],["Race pace",/race pace|\b(?:50|100|200|400|800|1500)\s*(?:m\s*)?pace\b/]];return aliases.find(([,re])=>re.test(t))?.[0]||null}
v390ZoneName=v310ZoneName;
v390ZoneCards=function(summary){return V310_ZONE_ORDER.filter(z=>summary.totals[z]).map(z=>`<div class="v390-zone-card"><span>${escapeHtml(z)}</span><strong>${Number(summary.totals[z]).toLocaleString()}m</strong></div>`).join("")||'<div class="help">No classifiable set volume yet.</div>'};

const v310PriorProfile=v390Profile;
v390Profile=function(){
  const profile=v310PriorProfile();
  return {...profile,source_credit:"Training framework informed by Clive Rushton. McLay terminology, T400 calculations, race-pace rules and coach overrides are explicit and versioned.",inference_rules:{...(profile.inference_rules||{}),visible_terminology:"McLay Regeneration / Development / Overload / Threshold / Clearance plus race-specific terms",colour_bands:false,numbered_zones:false}};
};
v390ProfileTab=function(){const profile=v390Profile(),defs=profile.zone_definitions||{};return `<article class="card"><div class="eyebrow">McLay coaching profile</div><h3>Training-intensity reference, version ${escapeHtml(profile.version||"1.0")}</h3><p>${escapeHtml(profile.source_credit||"")}</p><p class="help">Session input accepts Reg, Dev, OL, AT and CL. Coach, assistant and report screens expand these to the full words. Heart-rate and stroke-rate guides remain blank until the head coach confirms them.</p><div class="v390-profile-grid">${V310_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>{const d=defs[z]||{},hr=d.heart_rate||{};return `<fieldset><legend>${escapeHtml(z)}</legend><div class="form-grid"><label>HR min<input data-v390-hr-min="${escapeHtml(z)}" type="number" value="${hr.min??""}"></label><label>HR max<input data-v390-hr-max="${escapeHtml(z)}" type="number" value="${hr.max??""}"></label><label class="wide">Stroke-rate guide / notes<input data-v390-sr="${escapeHtml(z)}" value="${escapeHtml(d.stroke_rate_guide||"")}" placeholder="Leave blank until confirmed"></label><label class="wide">Definition<textarea data-v390-zone-notes="${escapeHtml(z)}">${escapeHtml(d.notes||"")}</textarea></label></div></fieldset>`}).join("")}</div>${v381Can("manage_coaching_profile")?'<button id="v390SaveProfile" type="button">Save new profile version</button>':'<div class="help">Reference values are controlled by the head coach.</div>'}</article>`};
v390SaveProfile=async function(){const old=v390Profile(),defs={...old.zone_definitions};for(const z of V310_ZONE_ORDER.filter(x=>x!=="Unclassified")){const min=document.querySelector(`[data-v390-hr-min="${CSS.escape(z)}"]`)?.value,max=document.querySelector(`[data-v390-hr-max="${CSS.escape(z)}"]`)?.value,sr=document.querySelector(`[data-v390-sr="${CSS.escape(z)}"]`)?.value||"",notes=document.querySelector(`[data-v390-zone-notes="${CSS.escape(z)}"]`)?.value||"";defs[z]={...(defs[z]||{}),heart_rate:{min:min===""?null:Number(min),max:max===""?null:Number(max)},stroke_rate_guide:sr,notes}}const current=Number(String(old.version||"1.0").split(".")[1]||0),record={id:uid("coaching-profile"),name:"McLay full-spectrum coaching profile",version:`1.${current+1}`,source_credit:"Training framework informed by Clive Rushton. McLay terminology, T400 calculations, race-pace rules and coach overrides are explicit and versioned.",zone_definitions:defs,inference_rules:{...(old.inference_rules||{}),explicit_first:true,owner_override_only:true,assistant_challenge:true,volume_first:true,time_in_zone:false,numeric_guides_require_coach_confirmation:true,colour_bands:false,numbered_zones:false},active:true,created_at:nowIso(),updated_at:nowIso()};for(const p of appState.coaching_profiles)p.active=false;upsertLocal("coaching_profiles",record);queueRecord("coaching_profiles",record.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus(`Coaching profile ${record.version} saved`,"good")};

v390IntelligenceTab=function(){const rows=v390SessionRows(),summary=v390ZoneSummary(rows),session=selectedSession(),actual=v390ActualZoneSummary(session),challenges=(appState.coach_classification_challenges||[]).filter(c=>!session||c.session_id===session.id).sort(byUpdated);return `<div class="v390-two-col"><article class="card"><div class="eyebrow">Planned training volume</div><h3>${escapeHtml(session?.title||"Session")}</h3><div class="v390-zone-grid">${v390ZoneCards(summary)}</div><p class="help">Aerobic classifications use the T400 model. Race-specific classifications use PB/goal pace, work duration and recovery. Volume is the first reporting layer.</p></article><article class="card"><div class="eyebrow">Recorded actual volume</div><h3>${actual.total?`${Math.round(actual.total).toLocaleString()}m classified from the session review`:"Not entered yet"}</h3><div class="v390-zone-grid">${actual.total?v390ZoneCards(actual):'<div class="help">Complete the session review split to compare planned and actual volume.</div>'}</div>${actual.actual_distance?`<p class="help">Recorded session distance: ${actual.actual_distance.toLocaleString()}m.</p>`:""}</article></div><article class="card"><div class="eyebrow">Plan alignment</div><h3>${escapeHtml(v390ExpectedIntent(session)||"No verified slot intent")}</h3><p>${rows.filter(r=>r.inferred.matches===false).length?`${rows.filter(r=>r.inferred.matches===false).length} set line(s) deserve a coach check.`:"No obvious conflict between the classified work and linked session intent."}</p></article><div class="v390-classification-list">${rows.map((row,index)=>`<article class="card v390-class-row"><div class="card-heading"><div><div class="eyebrow">${escapeHtml(row.block.title||"Set")}</div><h3>${escapeHtml(row.item.raw)}</h3><p>${escapeHtml(row.reasoning)}</p></div><span class="badge ${v390ConfidenceClass(row.confidence)}">${v390ConfidenceLabel(row.confidence)} · ${Math.round(row.confidence*100)}%</span></div>${row.suggestion?`<div class="warning-box"><strong>Coach check</strong><br>${escapeHtml(row.suggestion)}</div>`:""}${v381IsOwner()?`<label>Canonical classification<select data-v390-zone-select="${index}">${V310_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>`<option ${z===row.zone?"selected":""}>${escapeHtml(z)}</option>`).join("")}</select></label><button type="button" data-v390-save-zone="${index}">Save classification</button>`:`<details><summary><strong>Challenge this classification</strong><span>The head coach decides the canonical result</span></summary><label>Proposed classification<select data-v390-challenge-zone="${index}">${V310_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>`<option ${z===row.zone?"selected":""}>${escapeHtml(z)}</option>`).join("")}</select></label><label>Why<textarea data-v390-challenge-reason="${index}" placeholder="Explain why the set should sit elsewhere in the model."></textarea></label><button type="button" data-v390-send-challenge="${index}">Send challenge</button></details>`}</article>`).join("")||'<div class="help">No runnable set lines.</div>'}</div><article class="card"><div class="eyebrow">Assistant-coach learning loop</div><h3>Open and resolved challenges</h3>${challenges.map(c=>`<div class="v390-challenge"><div><strong>${escapeHtml(c.source_text)}</strong><span>${escapeHtml(c.current_zone)} → ${escapeHtml(c.proposed_zone)} · ${escapeHtml(c.status)}</span><p>${escapeHtml(c.reasoning)}</p>${c.owner_response?`<p><strong>Head coach:</strong> ${escapeHtml(c.owner_response)}</p>`:""}</div>${v381IsOwner()&&c.status==="open"?`<div><textarea data-v390-owner-response="${escapeHtml(c.id)}" placeholder="Explain the decision"></textarea><button type="button" data-v390-resolve="${escapeHtml(c.id)}:accepted">Accept</button><button type="button" class="secondary" data-v390-resolve="${escapeHtml(c.id)}:declined">Decline</button></div>`:""}</div>`).join("")||'<div class="help">No classification challenges.</div>'}</article>`};

function v310ResultKey(row){return `${v3Course(row.course)}|${Number(row.distance)||0}|${v3Stroke(row.stroke)}`}
function v310ResultSeconds(row){return Number(row.result_seconds||v3Seconds(row.result_time_text||row.pb_time||""))}
function v310ResultRowsForAthlete(athleteId){
  const rows=[...(appState.results_event_history||[]).filter(r=>r.athlete_id===athleteId),...(appState.coach_results||[]).filter(r=>r.athlete_id===athleteId&&r.excluded_from_pb!==true)];
  const map=new Map();for(const row of rows){const seconds=v310ResultSeconds(row);if(!seconds)continue;const key=[row.result_date||"",row.meet_name||"",v310ResultKey(row),seconds,row.round||""].join("|");if(!map.has(key))map.set(key,{...row,result_seconds:seconds,result_time_text:row.result_time_text||v380Clock(seconds)})}return [...map.values()].sort((a,b)=>String(b.result_date||"").localeCompare(String(a.result_date||""))||v310ResultSeconds(a)-v310ResultSeconds(b));
}
function v310PbFallbackRows(athleteId){const best=new Map();for(const row of v310ResultRowsForAthlete(athleteId)){const key=v310ResultKey(row),seconds=v310ResultSeconds(row),current=best.get(key);if(!current||seconds<v310ResultSeconds(current))best.set(key,row)}return [...best.values()].map(row=>({...row,pb_time:row.result_time_text||v380Clock(v310ResultSeconds(row)),pb_date:row.result_date,result_seconds:v310ResultSeconds(row)})).sort((a,b)=>String(a.course).localeCompare(String(b.course))||Number(a.distance)-Number(b.distance)||String(a.stroke).localeCompare(String(b.stroke)))}
const v310PriorOfficialPbs=athleteOfficialPbs;
athleteOfficialPbs=function(athleteId){const loaded=v310PriorOfficialPbs(athleteId)||[],fallback=v310PbFallbackRows(athleteId),map=new Map();for(const row of [...loaded,...fallback]){const key=v310ResultKey(row),seconds=v310ResultSeconds(row);if(!map.has(key)||seconds<v310ResultSeconds(map.get(key)))map.set(key,{...row,result_seconds:seconds,pb_time:row.pb_time||row.result_time_text||v380Clock(seconds)})}return [...map.values()].sort((a,b)=>String(a.course).localeCompare(String(b.course))||Number(a.distance)-Number(b.distance)||String(a.stroke).localeCompare(String(b.stroke)))};
const v310PriorHistory=athleteHistory;
athleteHistory=function(athleteId){return v310ResultRowsForAthlete(athleteId)};

function v310AllowedAthlete(athlete){if(!athlete||athlete.active===false)return false;if(typeof v381IsAssistant==="function"&&v381IsAssistant()){const assigned=v381AssignedSquads();return !assigned.length||assigned.some(s=>squadKey(s)===squadKey(athlete.squad))||v381Can("view_all_squads")}return true}
function v310SessionParticipants(sessionId){return (appState.session_participants||[]).filter(p=>p.session_id===sessionId)}
function v310AllSessionRoster(session=selectedSession()){
  if(!session)return [];const squadKeys=new Set(sessionSquads(session).map(squadKey)),ids=new Set(v310SessionParticipants(session.id).map(p=>p.athlete_id));for(const a of appState.attendance||[])if(a.session_id===session.id)ids.add(a.athlete_id);
  return (appState.athletes||[]).filter(a=>v310AllowedAthlete(a)&&(squadKeys.has(squadKey(a.squad))||ids.has(a.id))).sort(rosterSort);
}
allSessionRoster=v310AllSessionRoster;
v382PresentRoster=function(){const session=selectedSession(),roster=v310AllSessionRoster(session);if(!session)return [];const marked=(appState.attendance||[]).filter(row=>row.session_id===session.id&&roster.some(a=>a.id===row.athlete_id)),here=new Set(marked.filter(row=>row.status==="present"||row.status==="modified").map(row=>row.athlete_id));return roster.filter(a=>here.has(a.id)).sort(rosterSort)};
v35AdaptationAthletes=function(){const roster=v382PresentRoster();return roster.filter(a=>v35ProfileForAthlete(a)||(appState.athlete_adaptation_rules||[]).some(r=>r.athlete_id===a.id&&v310RuleActive(r))||v310ActiveIndividualPlan(a.id)||String(a.modifications||"").trim()).sort((a,b)=>a.full_name.localeCompare(b.full_name))};
function v310RuleActive(rule,date=new Date().toISOString().slice(0,10)){return rule?.active!==false&&(!rule.effective_from||rule.effective_from<=date)&&(!rule.effective_to||rule.effective_to>=date)}
function v310ActiveRules(athleteId,date=selectedSession()?.session_date||new Date().toISOString().slice(0,10)){return (appState.athlete_adaptation_rules||[]).filter(r=>r.athlete_id===athleteId&&v310RuleActive(r,date)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(b.updated_at||"").localeCompare(String(a.updated_at||"")))}
function v310ActiveIndividualPlan(athleteId,date=selectedSession()?.session_date||new Date().toISOString().slice(0,10)){return (appState.athlete_individual_plans||[]).filter(p=>p.athlete_id===athleteId&&p.status!=="archived"&&(!p.start_date||p.start_date<=date)&&(!p.end_date||p.end_date>=date)).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0]||null}
function v310ApplyRuleText(line,rules){let out=line;const reasons=[];for(const rule of rules){const t=v310NormalText(`${rule.rule_text||""} ${JSON.stringify(rule.rule_json||{})}`);if(/no butterfly|avoid fly/.test(t)&&/butterfly|\bfly\b/i.test(out)){out=out.replace(/butterfly|\bfly\b/ig,"choice no-fly");reasons.push("No butterfly")};if(/replace pull (?:with|for) kick|pull.*kick/.test(t)&&/\bpull\b/i.test(out)){out=out.replace(/\bpull\b/ig,"kick");reasons.push("Pull replaced with kick")};if(/replace swim (?:with|for) kick|swim.*kick/.test(t)&&/\bswim\b/i.test(out)){out=out.replace(/\bswim\b/ig,"kick");reasons.push("Swim replaced with kick")};if(/no paddles|avoid paddles/.test(t)&&/paddles?/i.test(out)){out=out.replace(/\+?\s*paddles?/ig,"");reasons.push("No paddles")}}return {line:out.replace(/\s{2,}/g," ").trim(),reasons}}
const v310PriorPrescription=v390Prescription;
v390Prescription=function(item,block,session,athlete){const base=v310PriorPrescription(item,block,session,athlete),rules=v310ActiveRules(athlete.id,session.session_date),plan=v310ActiveIndividualPlan(athlete.id,session.session_date),applied=v310ApplyRuleText(base.line,rules);let flagged=base.flagged||rules.length>0||Boolean(plan),reason=[base.reason,...applied.reasons,plan?`Active plan: ${plan.plan_name}`:""].filter(Boolean).join(" · ");let reps=base.reps,cycle=base.cycle,line=applied.line;if(plan?.session_adjustments?.volume_ratio&&base.mainReps){reps=Math.max(1,Math.min(base.mainReps,Math.round(base.mainReps*Number(plan.session_adjustments.volume_ratio))));line=line.replace(/\b\d{1,3}\s*[x×]\s*\d{1,4}\b/i,`${reps} × ${v390RepDistance(item)}`);reason+=` · ${Math.round(Number(plan.session_adjustments.volume_ratio)*100)}% individual-plan volume`};return {...base,flagged,reps,cycle,line,reason,rules,individualPlan:plan}}

function v310MeetForAthleteOnDate(athleteId,date){const entries=(appState.swim_meet_entries||[]).filter(e=>e.athlete_id===athleteId&&e.entry_status!=="withdrawn");return entries.map(e=>({entry:e,meet:(appState.swim_meets||[]).find(m=>m.id===e.meet_id)})).find(x=>x.meet&&x.meet.status!=="archived"&&x.meet.start_date<=date&&(x.meet.end_date||x.meet.start_date)>=date)||null}
function v310AttendanceRow(session,athlete){const value=attendanceFor(session.id,athlete.id)?.status||"",meet=v310MeetForAthleteOnDate(athlete.id,session.session_date),rules=v310ActiveRules(athlete.id,session.session_date),plan=v310ActiveIndividualPlan(athlete.id,session.session_date),pbs=athleteOfficialPbs(athlete.id);return `<div class="v310-attendance-row ${value==="present"||value==="modified"?"here":""}" data-v310-athlete="${escapeHtml(athlete.id)}"><div><strong>${escapeHtml(athlete.full_name)}</strong><small>${escapeHtml(athlete.squad||"Unassigned")}${meet?` · At ${escapeHtml(meet.meet.name)}`:""}${rules.length?` · ${rules.length} modification${rules.length===1?"":"s"}`:""}${plan?` · ${escapeHtml(plan.plan_name)}`:""}${!pbs.length?" · PB data missing":""}</small></div><div class="attendance-buttons"><button type="button" data-v310-status="present" class="${value==="present"?"active":""}">Here</button><button type="button" data-v310-status="modified" class="${value==="modified"?"active":""}">Modified</button><button type="button" data-v310-status="absent" class="secondary ${value==="absent"?"active":""}">Absent</button></div></div>`}
function v310RenderSessionAttendance(){const host=$("v310SessionAttendance"),session=selectedSession();if(!host)return;if(!session){host.innerHTML="";return}const roster=v310AllSessionRoster(session),present=v382PresentRoster(),outside=(appState.athletes||[]).filter(a=>a.active!==false&&!roster.some(r=>r.id===a.id)&&v310AllowedAthlete(a)).sort((a,b)=>a.full_name.localeCompare(b.full_name));host.innerHTML=`<details ${window.innerWidth>=900?"open":""}><summary><div><span>Session attendance</span><strong>${present.length} attending · ${roster.length} available</strong></div><b>Drives pacing and modifications</b></summary><div class="v310-attendance-body">${roster.map(a=>v310AttendanceRow(session,a)).join("")||'<div class="help">No roster linked to this session.</div>'}<div class="v310-add-participant"><label>Add an existing swimmer<select id="v310ExtraAthlete"><option value="">Choose swimmer</option>${outside.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.full_name)} — ${escapeHtml(a.squad||"Unassigned")}</option>`).join("")}</select></label><button id="v310AddExisting" type="button" class="secondary">Add to session</button></div>${typeof v381Can!=="function"||v381Can("add_session_participants")?`<details><summary><strong>Add visitor / trial swimmer</strong><span>Creates a real swimmer record and adds them only to this session</span></summary><div class="form-grid"><label>Name<input id="v310VisitorName"></label><label>Session squad<select id="v310VisitorSquad">${sessionSquads(session).map(s=>`<option>${escapeHtml(s)}</option>`).join("")}<option>Visitor</option></select></label><label>Home club<input id="v310VisitorClub"></label></div><button id="v310AddVisitor" type="button">Add visitor as present</button></details>`:""}</div></details>`;
  host.querySelectorAll("[data-v310-status]").forEach(btn=>btn.onclick=()=>{const athleteId=btn.closest("[data-v310-athlete]").dataset.v310Athlete;attendanceRecord(session,athleteId,btn.dataset.v310Status);v310RenderSessionAttendance();v390DeckPanel();renderAttendance()});
  $("v310AddExisting")?.addEventListener("click",async()=>{const athleteId=$("v310ExtraAthlete")?.value;if(!athleteId)return;const athlete=appState.athletes.find(a=>a.id===athleteId),record={id:`participant-${session.id}-${athleteId}`,session_id:session.id,athlete_id:athleteId,participant_type:"extra",source_squad:athlete?.squad||"",notes:"Added by arrangement",created_at:nowIso(),updated_at:nowIso()};upsertLocal("session_participants",record);queueRecord("session_participants",record.id);attendanceRecord(session,athleteId,"present");saveState(appState);await syncIfPossible();renderAll()});
  $("v310AddVisitor")?.addEventListener("click",async()=>{const name=$("v310VisitorName")?.value.trim();if(!name)return alert("Enter the visitor's name.");let athlete=(appState.athletes||[]).find(a=>v3NameKey(a.full_name)===v3NameKey(name));if(!athlete){athlete={id:uid("athlete"),full_name:name,squad:$("v310VisitorSquad")?.value||"Visitor",active:true,is_visitor:true,visitor_home_club:$("v310VisitorClub")?.value.trim()||null,created_at:nowIso(),updated_at:nowIso()};upsertLocal("athletes",athlete);queueRecord("athletes",athlete.id)}const record={id:`participant-${session.id}-${athlete.id}`,session_id:session.id,athlete_id:athlete.id,participant_type:"visitor",source_squad:athlete.squad||"Visitor",notes:athlete.visitor_home_club?`Visiting from ${athlete.visitor_home_club}`:"Visitor",created_at:nowIso(),updated_at:nowIso()};upsertLocal("session_participants",record);queueRecord("session_participants",record.id);attendanceRecord(session,athlete.id,"present");saveState(appState);await syncIfPossible();renderAll()});
}
function v310EnsureAttendancePanel(){if($("v310SessionAttendance"))return;const hero=document.querySelector("#deck .deck-hero"),host=document.createElement("article");host.id="v310SessionAttendance";host.className="card v310-session-attendance";(hero?.parentElement||$("deck"))?.insertBefore(host,hero?.nextSibling||null);v310RenderSessionAttendance()}
renderAttendance=function(){const session=selectedSession();if(!session)return;$("attendanceHeading").textContent=`${sessionLabel(session)} · ${session.venue||""} · ${sessionSquads(session).join(" + ")}`;const roster=v310AllSessionRoster(session);$("attendanceList").innerHTML=roster.map(a=>{const value=attendanceFor(session.id,a.id)?.status||"",meet=v310MeetForAthleteOnDate(a.id,session.session_date);return `<div class="attendance-row ${value==="present"||value==="modified"?"":"unmarked"}" data-athlete-id="${escapeHtml(a.id)}"><div><strong>${escapeHtml(a.full_name)}</strong><small>${escapeHtml(a.squad||"Unassigned")}${meet?` · At ${escapeHtml(meet.meet.name)}`:""}</small></div><div class="attendance-buttons"><button type="button" class="attendance-choice ${value==="present"?"active":""}" data-status="present">Here</button><button type="button" class="attendance-choice ${value==="modified"?"active":""}" data-status="modified">Modified</button><span class="attendance-default">${value==="present"||value==="modified"?"":"Absent"}</span></div></div>`}).join("")||'<div class="help">No swimmers are linked to this session yet.</div>';document.querySelectorAll("#attendance .attendance-choice").forEach(button=>button.onclick=()=>{const row=button.closest(".attendance-row"),already=button.classList.contains("active"),status=already?"absent":button.dataset.status;attendanceRecord(session,row.dataset.athleteId,status);renderAttendance();v310RenderSessionAttendance();v390DeckPanel()})};
setActiveRosterAttendance=function(status){const session=selectedSession();if(!session)return;for(const athlete of v310AllSessionRoster(session))attendanceRecord(session,athlete.id,status);renderAttendance();v310RenderSessionAttendance();updateStatus(status==="present"?"Session roster marked here":"Session roster cleared","good")};

function v310DataAudit(){const active=(appState.athletes||[]).filter(a=>a.active!==false),missing=[],fallback=[],orphans=[];for(const a of active){const loaded=(appState.results_pb_board||[]).filter(r=>r.athlete_id===a.id).length,derived=v310PbFallbackRows(a.id).length,history=v310ResultRowsForAthlete(a.id).length;if(!derived)missing.push({athlete:a,loaded,history});else if(!loaded)fallback.push({athlete:a,derived,history})}for(const r of appState.coach_results||[]){if(r.athlete_id)continue;const athlete=active.find(a=>v3NameKey(a.full_name)===v3NameKey(r.swimmer_name));if(athlete)orphans.push({row:r,athlete})}const lastImport=(appState.coach_result_imports||[]).sort(byUpdated)[0]||null;return {active,missing,fallback,orphans,lastImport}}
function v310DataHealthTab(){const a=v310DataAudit();return `<div class="v390-two-col"><article class="card"><div class="eyebrow">PB coverage</div><h3>${a.active.length-a.missing.length} of ${a.active.length} active swimmers have usable PBs</h3><p>${a.fallback.length} swimmer${a.fallback.length===1?"":"s"} currently use the safe local PB fallback because the cloud PB view is empty or stale.</p><button id="v310SyncAudit" type="button">Sync and rerun audit</button></article><article class="card"><div class="eyebrow">Last result import</div><h3>${escapeHtml(a.lastImport?.file_name||"No result import recorded")}</h3><p>${a.lastImport?`${new Date(a.lastImport.updated_at||a.lastImport.created_at).toLocaleString("en-NZ")} · ${a.lastImport.imported_rows||0} rows accepted · ${a.lastImport.held_rows||0} held`:"Use a Team Manager export where possible; PDF remains a reviewed fallback."}</p><button type="button" class="secondary" data-view-jump="resultsupdate">Open results update</button></article></div><article class="card"><div class="eyebrow">Release blocker audit</div><h3>Swimmers with no usable PB</h3>${a.missing.map(x=>`<div class="v310-audit-row"><strong>${escapeHtml(x.athlete.full_name)}</strong><span>${escapeHtml(x.athlete.squad||"Unassigned")} · ${x.history} race rows · PB view ${x.loaded}</span><button type="button" data-v310-open-results="${escapeHtml(x.athlete.id)}">Review</button></div>`).join("")||'<div class="help">Every active swimmer has at least one usable PB.</div>'}</article><article class="card"><div class="eyebrow">Probable unmatched rows</div><h3>Name matches needing a safe athlete link</h3>${a.orphans.map(x=>`<div class="v310-audit-row"><strong>${escapeHtml(x.row.swimmer_name)}</strong><span>Probable match: ${escapeHtml(x.athlete.full_name)} · ${escapeHtml(x.row.meet_name||"")} · ${x.row.distance||"?"} ${escapeHtml(x.row.stroke||"")}</span></div>`).join("")||'<div class="help">No probable name-only rows found.</div>'}</article>`}

function v310MeetName(meetId){return (appState.swim_meets||[]).find(m=>m.id===meetId)?.name||"Meet"}
function v310MeetTab(){const meets=(appState.swim_meets||[]).slice().sort((a,b)=>String(a.start_date||"").localeCompare(String(b.start_date||""))),selectedId=appState.settings.v310_meet_id||meets[0]?.id||"",meet=meets.find(m=>m.id===selectedId)||meets[0],entries=(appState.swim_meet_entries||[]).filter(e=>e.meet_id===meet?.id),allowed=(appState.athletes||[]).filter(v310AllowedAthlete).sort((a,b)=>a.full_name.localeCompare(b.full_name)),canManage=v381IsOwner()||v381Can("manage_meets"),canNote=v381IsOwner()||v381Can("manage_meets")||v381Can("add_notes");return `<div class="v390-two-col"><article class="card"><div class="card-heading"><div><div class="eyebrow">Upcoming and completed meets</div><h3>Train → race → review → train again</h3></div>${canManage?'<button id="v310NewMeet" type="button">New meet</button>':""}</div>${meets.map(m=>`<button type="button" class="v310-meet-button ${m.id===meet?.id?"active":""}" data-v310-meet="${escapeHtml(m.id)}"><strong>${escapeHtml(m.name)}</strong><span>${escapeHtml(m.start_date||"")}${m.end_date&&m.end_date!==m.start_date?` → ${escapeHtml(m.end_date)}`:""} · ${escapeHtml(m.status||"")}</span></button>`).join("")||'<div class="help">No meets entered yet.</div>'}</article><article class="card"><div class="eyebrow">Meet detail</div>${meet?`<h3>${escapeHtml(meet.name)}</h3><p>${escapeHtml([meet.start_date,meet.end_date&&meet.end_date!==meet.start_date?meet.end_date:"",meet.venue,meet.course].filter(Boolean).join(" · "))}</p>${canManage?`<div class="form-grid"><label>Name<input id="v310MeetName" value="${escapeHtml(meet.name)}"></label><label>Start<input id="v310MeetStart" type="date" value="${escapeHtml(meet.start_date||"")}"></label><label>End<input id="v310MeetEnd" type="date" value="${escapeHtml(meet.end_date||"")}"></label><label>Venue<input id="v310MeetVenue" value="${escapeHtml(meet.venue||"")}"></label><label>Course<select id="v310MeetCourse"><option value="">Not set</option><option ${meet.course==="SCM"?"selected":""}>SCM</option><option ${meet.course==="LCM"?"selected":""}>LCM</option></select></label><label>Status<select id="v310MeetStatus"><option ${meet.status==="upcoming"?"selected":""}>upcoming</option><option ${meet.status==="in_progress"?"selected":""}>in_progress</option><option ${meet.status==="complete"?"selected":""}>complete</option><option ${meet.status==="archived"?"selected":""}>archived</option></select></label></div><label>Notes<textarea id="v310MeetNotes">${escapeHtml(meet.notes||"")}</textarea></label><button id="v310SaveMeet" type="button">Save meet</button>`:""}`:'<h3>Select or create a meet</h3>'}</article></div>${meet?`<article class="card"><div class="card-heading"><div><div class="eyebrow">Entries and race plan</div><h3>${entries.length} swimmer${entries.length===1?"":"s"} linked</h3></div></div>${allowed.map(a=>{const e=entries.find(x=>x.athlete_id===a.id);return `<div class="v310-entry-row"><label><input type="checkbox" data-v310-entry-athlete="${escapeHtml(a.id)}" ${e?"checked":""} ${canManage?"":"disabled"}> <strong>${escapeHtml(a.full_name)}</strong><span>${escapeHtml(a.squad||"")}</span></label><input data-v310-entry-events="${escapeHtml(a.id)}" value="${escapeHtml((e?.events||[]).join(", "))}" placeholder="Events, e.g. 100 Free, 200 IM" ${e&&canManage?"":"disabled"}></div>`}).join("")}${canManage?'<button id="v310SaveEntries" type="button">Save entries</button>':'<p class="help">Entries are read-only for this account.</p>'}</article>${canNote?`<article class="card"><div class="eyebrow">Post-meet feedback</div><h3>Coach notes that feed the next block</h3><label>Swimmer<select id="v310FeedbackAthlete">${entries.map(e=>{const a=appState.athletes.find(x=>x.id===e.athlete_id);return a?`<option value="${escapeHtml(a.id)}">${escapeHtml(a.full_name)}</option>`:""}).join("")}</select></label><label>Summary<textarea id="v310FeedbackSummary"></textarea></label><label>What went well<textarea id="v310FeedbackPositives"></textarea></label><label>Next training focus<textarea id="v310FeedbackNext"></textarea></label><button id="v310SaveFeedback" type="button">Save feedback and prepare email</button></article>`:""}`:""}`}

function v310ModificationPanel(){const athlete=appState.athletes.find(a=>a.id===$("profileAthleteId")?.value);if(!athlete)return "";const rules=(appState.athlete_adaptation_rules||[]).filter(r=>r.athlete_id===athlete.id).sort((a,b)=>String(b.updated_at||"").localeCompare(String(a.updated_at||""))),plans=(appState.athlete_individual_plans||[]).filter(p=>p.athlete_id===athlete.id).sort((a,b)=>String(b.start_date||"").localeCompare(String(a.start_date||""))),canManage=v381IsOwner()||v381Can("manage_modifications")||v381Can("edit_adaptations"),canMove=v381IsOwner()||v381Can("manage_athletes");return `<article class="card v310-profile-operations"><div class="eyebrow">Squad and individual operation</div><h3>Movement, modifications and individual plans</h3>${canMove?`<div class="form-grid"><label>Current squad<select id="v310AthleteSquad">${[...new Set([...(appState.athletes||[]).map(a=>a.squad).filter(Boolean),athlete.squad||"Unassigned","Visitor"])].sort().map(s=>`<option ${s===athlete.squad?"selected":""}>${escapeHtml(s)}</option>`).join("")}</select></label><label>Effective date<input id="v310SquadEffective" type="date" value="${new Date().toISOString().slice(0,10)}"></label><label class="wide">Reason<input id="v310SquadReason" placeholder="Monthly squad move / training-up arrangement"></label></div><button id="v310ChangeSquad" type="button">Save squad move</button>`:`<p><strong>Current squad:</strong> ${escapeHtml(athlete.squad||"Unassigned")}</p>`}<h4>Active / historical modifications</h4>${rules.map(r=>`<div class="v310-rule-row"><div><strong>${escapeHtml(r.rule_text)}</strong><span>${escapeHtml(r.modification_type||"coaching")} · ${escapeHtml(r.effective_from||"open")} → ${escapeHtml(r.effective_to||"open")}</span></div>${canManage?`<button type="button" class="secondary" data-v310-disable-rule="${escapeHtml(r.id)}">${r.active===false?"Enable":"Disable"}</button>`:""}</div>`).join("")||'<div class="help">No structured modifications saved.</div>'}${canManage?`<details><summary><strong>Add modification</strong><span>Temporary or standing</span></summary><div class="form-grid"><label>Type<select id="v310RuleType"><option>injury</option><option>mobility</option><option>para</option><option>coaching</option></select></label><label>From<input id="v310RuleFrom" type="date"></label><label>Until<input id="v310RuleTo" type="date"></label><label>Priority<input id="v310RulePriority" type="number" value="100"></label></div><label>Instruction<textarea id="v310RuleText" placeholder="Shoulder injury — no butterfly; replace pull with kick"></textarea></label><button id="v310SaveRule" type="button">Save modification</button></details>`:""}<h4>Individual performance plans</h4>${plans.map(p=>`<div class="v310-rule-row"><div><strong>${escapeHtml(p.plan_name)}</strong><span>${escapeHtml(p.start_date||"open")} → ${escapeHtml(p.end_date||"open")} · ${escapeHtml(p.status||"")}</span><small>${escapeHtml(p.purpose||p.notes||"")}</small></div></div>`).join("")||'<div class="help">No individual plan.</div>'}${canManage?`<details><summary><strong>Add individual plan</strong><span>Taper, international meet or focused intervention</span></summary><div class="form-grid"><label>Name<input id="v310PlanName"></label><label>From<input id="v310PlanFrom" type="date"></label><label>Until<input id="v310PlanTo" type="date"></label><label>Volume ratio<input id="v310PlanRatio" type="number" step="0.05" min="0.1" max="1.5" value="1"></label></div><label>Purpose<textarea id="v310PlanPurpose"></textarea></label><button id="v310SavePlan" type="button">Save individual plan</button></details>`:'<p class="help">Modification and individual-plan controls are read-only for this account.</p>'}</article>`}

function v310EnsureProfilePanel(){const section=$("athletes"),existing=$("v310ProfileOperations");if(existing)existing.remove();const profileId=$("profileAthleteId")?.value;if(!section||!profileId)return;const host=document.createElement("div");host.id="v310ProfileOperations";host.innerHTML=v310ModificationPanel();section.appendChild(host);v310BindProfileOperations()}
function v310BindProfileOperations(){const athlete=appState.athletes.find(a=>a.id===$("profileAthleteId")?.value);if(!athlete)return;$("v310ChangeSquad")?.addEventListener("click",async()=>{const to=$("v310AthleteSquad")?.value,from=athlete.squad||"";if(!to||to===from)return;const h={id:uid("squad-move"),athlete_id:athlete.id,from_squad:from,to_squad:to,effective_date:$("v310SquadEffective")?.value||new Date().toISOString().slice(0,10),reason:$("v310SquadReason")?.value.trim()||"Squad move",created_at:nowIso(),updated_at:nowIso()};athlete.squad=to;athlete.updated_at=nowIso();upsertLocal("athlete_squad_history",h);queueRecord("athlete_squad_history",h.id);queueRecord("athletes",athlete.id);saveState(appState);await syncIfPossible();renderAll();updateStatus(`${athlete.full_name} moved to ${to}`,"good")});
  $("v310SaveRule")?.addEventListener("click",async()=>{const text=$("v310RuleText")?.value.trim();if(!text)return;const r={id:uid("adapt-rule"),athlete_id:athlete.id,scope:"general",rule_text:text,rule_json:v36ParseRuleLocal?.(text)||{},source_type:"coach_approved",modification_type:$("v310RuleType")?.value||"coaching",effective_from:$("v310RuleFrom")?.value||null,effective_to:$("v310RuleTo")?.value||null,priority:Number($("v310RulePriority")?.value||100),private_medical:false,active:true,created_at:nowIso(),updated_at:nowIso()};upsertLocal("athlete_adaptation_rules",r);queueRecord("athlete_adaptation_rules",r.id);saveState(appState);await syncIfPossible();v310EnsureProfilePanel();updateStatus("Modification saved","good")});
  document.querySelectorAll("[data-v310-disable-rule]").forEach(btn=>btn.onclick=async()=>{const r=appState.athlete_adaptation_rules.find(x=>x.id===btn.dataset.v310DisableRule);if(!r)return;r.active=r.active===false;r.updated_at=nowIso();queueRecord("athlete_adaptation_rules",r.id);saveState(appState);await syncIfPossible();v310EnsureProfilePanel()});
  $("v310SavePlan")?.addEventListener("click",async()=>{const name=$("v310PlanName")?.value.trim();if(!name)return;const p={id:uid("individual-plan"),athlete_id:athlete.id,plan_name:name,plan_type:"individual",start_date:$("v310PlanFrom")?.value||null,end_date:$("v310PlanTo")?.value||null,priority:100,status:"active",purpose:$("v310PlanPurpose")?.value.trim()||"",session_adjustments:{volume_ratio:Number($("v310PlanRatio")?.value||1)},notes:"",created_at:nowIso(),updated_at:nowIso()};upsertLocal("athlete_individual_plans",p);queueRecord("athlete_individual_plans",p.id);saveState(appState);await syncIfPossible();v310EnsureProfilePanel();updateStatus("Individual plan saved","good")});
}

function v310ChallengeEmailDraft(challenge){const ownerEmail=v390Profile()?.inference_rules?.head_coach_email||"";if(!ownerEmail)return;const session=appState.sessions.find(s=>s.id===challenge.session_id),record={id:uid("communication"),communication_type:"classification_challenge",session_id:challenge.session_id,athlete_id:null,recipient_name:"Head coach",recipient_email:ownerEmail,subject:`Classification challenge — ${session?.title||"session"}`,body:`An assistant coach has challenged a set classification.\n\nSet: ${challenge.source_text}\nCurrent: ${challenge.current_zone}\nProposed: ${challenge.proposed_zone}\nReason: ${challenge.reasoning}\n\nOpen Coach hub to review and respond.`,status:"draft",metadata:{challenge_id:challenge.id,review_required:true},created_at:nowIso(),updated_at:nowIso()};upsertLocal("coach_communications",record);queueRecord("coach_communications",record.id)}
const v310PriorSaveChallenge=v390SaveChallenge;
v390SaveChallenge=async function(row,zone,reasoning){const before=new Set((appState.coach_classification_challenges||[]).map(c=>c.id));await v310PriorSaveChallenge(row,zone,reasoning);const created=(appState.coach_classification_challenges||[]).find(c=>!before.has(c.id));if(created){v310ChallengeEmailDraft(created);saveState(appState);await syncIfPossible()}};

function v310MailSettings(){const p=v390Profile();return `<article class="card"><div class="eyebrow">Communications settings</div><h3>One reviewable email system</h3><p>Assistant invitations, classification challenges, session feedback and meet reviews use the same draft-first workflow. Nothing sends automatically.</p>${v381IsOwner()?`<label>Head coach notification email<input id="v310HeadCoachEmail" type="email" value="${escapeHtml(p.inference_rules?.head_coach_email||appState.settings.membership_email||"")}"></label><button id="v310SaveEmailSettings" type="button">Save email setting</button>`:""}</article>`}
const v310BaseCommsTab=v390CommsTab;
v390CommsTab=function(){return v310MailSettings()+v310BaseCommsTab()};

function v310ParseResultPdfLines(text,meetFallback="",courseFallback=""){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean),rows=[];let currentName="",currentEvent=null;
  const eventRe=/\b(25|50|100|200|400|800|1500)\s*(?:m\s*)?(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual medley|im)\b/i,timeRe=/\b(\d{1,2}:\d{2}(?:\.\d{1,2})?|\d{2,3}\.\d{1,2})\b/;
  for(const line of lines){const ev=line.match(eventRe);if(ev)currentEvent={distance:Number(ev[1]),stroke:v3Stroke(ev[2])};const possibleName=line.match(/^([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,3})\b/);if(possibleName&&!eventRe.test(possibleName[1])&&!/Final|Heat|Event|Place|Rank|Lane/i.test(possibleName[1]))currentName=possibleName[1];const tm=line.match(timeRe);if(currentName&&currentEvent&&tm){const seconds=v3Seconds(tm[1]);if(seconds&&seconds<3600){rows.push({swimmer_name:currentName,result_date:"",meet_name:meetFallback,course:courseFallback,distance:currentEvent.distance,stroke:currentEvent.stroke,event:`${currentEvent.distance} ${currentEvent.stroke}`,round:"",result_time:tm[1],source_format:"PDF text"});currentEvent=null}}}
  return rows;
}
async function v310LoadPdfJs(){if(window.pdfjsLib)return window.pdfjsLib;await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=resolve;s.onerror=()=>reject(new Error("PDF text extractor could not load. Use a TM file or paste extracted PDF text."));document.head.appendChild(s)});window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";return window.pdfjsLib}
async function v310ExtractPdfText(file){const lib=await v310LoadPdfJs(),doc=await lib.getDocument({data:await file.arrayBuffer()}).promise,pages=[];for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();pages.push(content.items.map(x=>x.str).join(" "))}return pages.join("\n")}
const v310PriorParseResultsFile=v3ParseResultsFile;
v3ParseResultsFile=async function(){const file=$("resultsFileInput")?.files?.[0];if(!file)return alert("Choose a results file first.");if(!/\.pdf$/i.test(file.name))return v310PriorParseResultsFile();resultImportFileName=file.name;try{const text=await v310ExtractPdfText(file),raw=v310ParseResultPdfLines(text,$("importMeetName").value.trim(),$("importCourse").value);if(!raw.length)throw new Error("PDF text was extracted, but no safe result rows were found. Paste the relevant PDF text into the fallback box or use a TM export.");resultImportPreview=raw.map(r=>v3NormaliseImportRow(r,$("importMeetName").value.trim(),$("importCourse").value));v3RefreshImportStatuses();$("resultsFileInput").value="";renderResultImportPreview()}catch(error){$("resultsFileInput").value="";$("resultImportSummary").innerHTML=`<div class="source-warning">${escapeHtml(error.message)}</div>`}};

function v310InjectPdfFallback(){const input=$("resultsFileInput");if(!input)return;input.accept=".csv,.tsv,.txt,.sd3,.hy3,.zip,.pdf";const card=input.closest("article");if(!card||$("v310PdfText"))return;card.querySelector("h3").textContent="Team Manager / results file — TM preferred, PDF reviewed fallback";card.insertAdjacentHTML("beforeend",`<details><summary><strong>Paste PDF result text</strong><span>Use when the PDF layout cannot be extracted reliably</span></summary><textarea id="v310PdfText" placeholder="Paste the relevant result-table text here"></textarea><button id="v310ParsePdfText" type="button" class="secondary">Preview pasted PDF text</button></details>`);$("v310ParsePdfText").onclick=()=>{const text=$("v310PdfText").value,raw=v310ParseResultPdfLines(text,$("importMeetName").value.trim(),$("importCourse").value);resultImportFileName="Pasted PDF result text";resultImportPreview=raw.map(r=>v3NormaliseImportRow(r,$("importMeetName").value.trim(),$("importCourse").value));v3RefreshImportStatuses();renderResultImportPreview()};
  v36RebindResultsButtons?.();
}
const v310PriorCommitImport=v3CommitImport;
v3CommitImport=async function(){const counts=resultImportPreview.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),snapshot={file_name:resultImportFileName,source_type:/pdf/i.test(resultImportFileName)?"pdf":"tm_or_results",matched_rows:counts.READY||0,unmatched_rows:counts.UNMATCHED||0,duplicate_rows:counts.DUPLICATE||0,held_rows:(counts.CHECK||0)+(counts.UNMATCHED||0)+(counts.DUPLICATE||0)};await v310PriorCommitImport();const audit={id:uid("result-audit"),...snapshot,created_at:nowIso(),updated_at:nowIso()};upsertLocal("result_import_audits",audit);queueRecord("result_import_audits",audit.id);saveState(appState);await syncIfPossible()};

function v310EnhanceCoachHub(){const host=$("v390CoachHub");if(!host)return;const tabs=host.querySelector(".v390-tabs");if(!tabs)return;const available=[];if(v381IsOwner()||v381Can("view_session_intelligence"))available.push(["intelligence","Session intelligence"]);if(v381IsOwner()||v381Can("view_club_programme"))available.push(["club","Club programme"]);if(v381IsOwner()||v381Can("create_communications"))available.push(["comms","Communications"]);if(v381IsOwner())available.push(["profile","Coaching profile"]);if(v381IsOwner()||v381Can("view_data_health"))available.push(["data","Data health"]);if(v381IsOwner()||v381Can("view_meets"))available.push(["meets","Meets"]);for(const [key,label] of available){let b=tabs.querySelector(`[data-v390-tab="${key}"]`);if(!b){b=document.createElement("button");b.dataset.v390Tab=key;b.textContent=label;tabs.appendChild(b)}b.classList.toggle("active",appState.settings.v390_hub_tab===key);b.onclick=()=>v390SetHubTab(key)}}
const v310PriorRenderCoachHub=v390RenderCoachHub;
v390RenderCoachHub=function(){const host=$("v390CoachHub");if(!host)return;const tab=appState.settings.v390_hub_tab;if(tab==="data"){host.innerHTML=`<div class="v390-tabs"></div><div id="v390HubBody">${v310DataHealthTab()}</div>`;v310EnhanceCoachHub();host.querySelector('[data-v390-tab="data"]')?.classList.add("active");v310BindHub();return}if(tab==="meets"){host.innerHTML=`<div class="v390-tabs"></div><div id="v390HubBody">${v310MeetTab()}</div>`;v310EnhanceCoachHub();host.querySelector('[data-v390-tab="meets"]')?.classList.add("active");v310BindHub();return}v310PriorRenderCoachHub();v310EnhanceCoachHub();v310BindHub()};
function v310BindHub(){
  $("v310SyncAudit")?.addEventListener("click",async()=>{await syncIfPossible();v390RenderCoachHub()});document.querySelectorAll("[data-v310-open-results]").forEach(btn=>btn.onclick=()=>{appState.settings.selected_athlete_id=btn.dataset.v310OpenResults;saveState(appState);showView("results")});
  $("v310HeadCoachEmail")&&($("v310SaveEmailSettings").onclick=async()=>{const old=v390Profile(),email=$("v310HeadCoachEmail").value.trim();old.inference_rules={...(old.inference_rules||{}),head_coach_email:email};old.updated_at=nowIso();queueRecord("coaching_profiles",old.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Head coach email saved","good")});
  document.querySelectorAll("[data-v310-meet]").forEach(btn=>btn.onclick=()=>{appState.settings.v310_meet_id=btn.dataset.v310Meet;saveState(appState);v390RenderCoachHub()});
  $("v310NewMeet")?.addEventListener("click",async()=>{const m={id:uid("meet"),name:"New meet",start_date:new Date().toISOString().slice(0,10),end_date:new Date().toISOString().slice(0,10),venue:"",course:null,status:"upcoming",notes:"",created_at:nowIso(),updated_at:nowIso()};upsertLocal("swim_meets",m);queueRecord("swim_meets",m.id);appState.settings.v310_meet_id=m.id;saveState(appState);await syncIfPossible();v390RenderCoachHub()});
  $("v310SaveMeet")?.addEventListener("click",async()=>{const m=appState.swim_meets.find(x=>x.id===appState.settings.v310_meet_id);if(!m)return;Object.assign(m,{name:$("v310MeetName").value.trim(),start_date:$("v310MeetStart").value||null,end_date:$("v310MeetEnd").value||$("v310MeetStart").value||null,venue:$("v310MeetVenue").value.trim(),course:$("v310MeetCourse").value||null,status:$("v310MeetStatus").value,notes:$("v310MeetNotes").value.trim(),updated_at:nowIso()});queueRecord("swim_meets",m.id);saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Meet saved","good")});
  document.querySelectorAll("[data-v310-entry-athlete]").forEach(cb=>cb.onchange=()=>{const input=document.querySelector(`[data-v310-entry-events="${CSS.escape(cb.dataset.v310EntryAthlete)}"]`);if(input)input.disabled=!cb.checked});
  $("v310SaveEntries")?.addEventListener("click",async()=>{const meetId=appState.settings.v310_meet_id;for(const cb of document.querySelectorAll("[data-v310-entry-athlete]")){const athleteId=cb.dataset.v310EntryAthlete,existing=appState.swim_meet_entries.find(e=>e.meet_id===meetId&&e.athlete_id===athleteId);if(cb.checked){const events=(document.querySelector(`[data-v310-entry-events="${CSS.escape(athleteId)}"]`)?.value||"").split(",").map(x=>x.trim()).filter(Boolean),e={id:existing?.id||`meet-entry-${meetId}-${athleteId}`,meet_id:meetId,athlete_id:athleteId,events,targets:existing?.targets||{},entry_status:"entered",travel_notes:existing?.travel_notes||"",created_at:existing?.created_at||nowIso(),updated_at:nowIso()};upsertLocal("swim_meet_entries",e);queueRecord("swim_meet_entries",e.id)}else if(existing){existing.entry_status="withdrawn";existing.updated_at=nowIso();queueRecord("swim_meet_entries",existing.id)}}saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Meet entries saved","good")});
  $("v310SaveFeedback")?.addEventListener("click",async()=>{const athleteId=$("v310FeedbackAthlete").value,meetId=appState.settings.v310_meet_id;if(!athleteId)return;const f={id:uid("meet-feedback"),meet_id:meetId,athlete_id:athleteId,summary:$("v310FeedbackSummary").value.trim(),positives:$("v310FeedbackPositives").value.trim(),next_focus:$("v310FeedbackNext").value.trim(),coach_notes:"",created_at:nowIso(),updated_at:nowIso()};upsertLocal("swim_meet_feedback",f);queueRecord("swim_meet_feedback",f.id);const athlete=appState.athletes.find(a=>a.id===athleteId);if(athlete&&v381Can("create_communications")){const meet=appState.swim_meets.find(m=>m.id===meetId),c={id:uid("communication"),communication_type:"meet_analysis",session_id:null,athlete_id,recipient_name:athlete.full_name,recipient_email:v390RecipientEmail(athlete),subject:`${meet?.name||"Meet"} — performance review`,body:[`Hi ${athlete.full_name.split(" ")[0]},`,"",f.summary,f.positives?`What went well:\n${f.positives}`:"",f.next_focus?`Next focus:\n${f.next_focus}`:"","Regards,","McLay Swimming coaching team"].filter(Boolean).join("\n\n"),status:"draft",metadata:{meet_id:meetId,feedback_id:f.id,review_required:true},created_at:nowIso(),updated_at:nowIso()};upsertLocal("coach_communications",c);queueRecord("coach_communications",c.id);f.communication_id=c.id;upsertLocal("swim_meet_feedback",f);queueRecord("swim_meet_feedback",f.id)}saveState(appState);await syncIfPossible();v390RenderCoachHub();updateStatus("Meet feedback and email draft saved","good")});
}

const v310PriorFillAthleteProfile=fillAthleteProfile;
fillAthleteProfile=function(athlete){v310PriorFillAthleteProfile(athlete);setTimeout(v310EnsureProfilePanel,0)};
const v310PriorRenderAll=renderAll;
renderAll=function(){v310PriorRenderAll();v310EnsureAttendancePanel();v310RenderSessionAttendance();v310InjectPdfFallback();if(document.querySelector("#athletes.view.active"))v310EnsureProfilePanel();const active=document.querySelector(".view.active")?.id;if(active==="coachhub")v390RenderCoachHub()};
const v310PriorShowView=showView;
showView=function(id){v310PriorShowView(id);if(id==="deck"){v310EnsureAttendancePanel();v310RenderSessionAttendance()}if(id==="resultsupdate")v310InjectPdfFallback();if(id==="athletes")setTimeout(v310EnsureProfilePanel,0);if(id==="coachhub")v390RenderCoachHub()};

function v310InjectStyles(){if($("v310Styles"))return;const style=document.createElement("style");style.id="v310Styles";style.textContent=`
.v310-session-attendance{padding:0!important;overflow:hidden}.v310-session-attendance>details>summary{display:flex;justify-content:space-between;align-items:center;gap:.6rem;padding:.75rem 1rem;background:#eef6f7;cursor:pointer}.v310-session-attendance>details>summary span{display:block;font-size:.68rem;text-transform:uppercase;font-weight:900;color:#567}.v310-session-attendance>details>summary strong{color:#123a5b}.v310-attendance-body{padding:.65rem}.v310-attendance-row{display:flex;justify-content:space-between;align-items:center;gap:.65rem;padding:.5rem 0;border-bottom:1px solid #dce8ed}.v310-attendance-row small,.attendance-row small{display:block;color:#657985;font-size:.72rem}.v310-attendance-row.here{background:#f2faf6}.v310-add-participant{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:.5rem;margin-top:.75rem}.v310-audit-row,.v310-rule-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.55rem;align-items:center;padding:.55rem 0;border-bottom:1px solid #dce8ed}.v310-audit-row span,.v310-rule-row span,.v310-rule-row small{display:block;color:#657985;font-size:.75rem}.v310-meet-button{width:100%;text-align:left;display:flex;justify-content:space-between;gap:.5rem;margin:.3rem 0;background:#fff;color:#123a5b;border:1px solid #b7cfd9}.v310-meet-button.active{background:#123a5b;color:#fff}.v310-meet-button span{font-size:.75rem}.v310-entry-row{display:grid;grid-template-columns:minmax(220px,.7fr) 1fr;gap:.55rem;align-items:center;padding:.4rem 0;border-bottom:1px solid #dce8ed}.v310-entry-row label{display:flex;align-items:center;gap:.35rem}.v310-entry-row label span{font-size:.72rem;color:#657985}.v310-profile-operations{margin-top:.8rem}.v310-profile-operations h4{margin-top:1rem}.v310-profile-operations details{margin-top:.65rem;border:1px solid #cfdee4;border-radius:.55rem;padding:.55rem}.v310-profile-operations summary{cursor:pointer}.v382-target-row small{white-space:normal}.v390-zone-card span{font-size:.7rem}@media(max-width:760px){.v310-attendance-row{display:block}.v310-attendance-row .attendance-buttons{margin-top:.35rem}.v310-add-participant,.v310-entry-row{grid-template-columns:1fr}.v310-audit-row,.v310-rule-row{grid-template-columns:1fr}}
`;document.head.appendChild(style)}
function v310Interface(){v310InjectStyles();document.title="McLay Swimming OS — v3.10.0 Operational Coaching";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.10.0 · trusted results · session attendance · individual delivery · meets · reviewable communications";v310EnsureAttendancePanel();v310RenderSessionAttendance();v310InjectPdfFallback();const active=document.querySelector(".view.active")?.id;if(active==="coachhub")v390RenderCoachHub()}

v310Interface();renderAll();

// -----------------------------------------------------------------------------
// v3.10.1 — Complete photo + voice transcription connection
// Adds the missing Supabase/OpenAI health check, preserves transcription status
// in cloud sync, and allows a coach to dictate a new session before it exists.
// -----------------------------------------------------------------------------
const V3101_BUILD="20260728-performance-capture-3102";
let v3101SessionRecorder=null;
let v3101SessionVoiceChunks=[];
let v3101PendingSessionVoice=null;
let v3101Health=null;

const v3101PriorCloudRow=cloudRow;
cloudRow=function(table,record){
  if(table==="session_transcriptions"){
    const org=appState.settings.organisation_id,user=getAuth()?.user?.id;
    return {
      id:record.id,organisation_id:org,session_id:record.session_id,capture_id:record.capture_id||null,
      athlete_id:record.athlete_id||null,session_block_id:record.session_block_id||null,
      purpose:record.purpose||"quick_note",source_type:record.source_type||"voice",status:record.status||"saved",
      raw_text:record.raw_text||"",structured_blocks:record.structured_blocks||[],structured_data:record.structured_data||{},
      error_message:record.error_message||"",provider:record.provider||"",provider_model:record.provider_model||record.model||"",
      provider_request_id:record.provider_request_id||record.request_id||"",completed_at:record.completed_at||null,
      created_at:record.created_at||nowIso(),updated_at:record.updated_at||nowIso(),created_by:record.created_by||user
    };
  }
  return v3101PriorCloudRow(table,record);
};

function v3101FunctionUrl(){const config=getConfig();return `${config.supabaseUrl}/functions/v1/transcribe-capture`}
function v3101AuthHeaders(json=true){const config=getConfig(),auth=getAuth();const headers={apikey:config.supabaseAnonKey,Authorization:`Bearer ${auth?.access_token||""}`};if(json)headers["Content-Type"]="application/json";return headers}
async function v3101Fetch(url,options={},timeoutMs=145000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal})}catch(error){if(error?.name==="AbortError")throw new Error("Transcription timed out. The recording or photo is safe; retry it.");throw error}finally{clearTimeout(timer)}}
function v3101HealthPill(label,ok,detail=""){return `<div class="v3101-health-row ${ok?"ok":"bad"}"><span>${ok?"✓":"!"}</span><div><strong>${escapeHtml(label)}</strong>${detail?`<small>${escapeHtml(detail)}</small>`:""}</div></div>`}
function v3101RenderHealth(){const host=$("v3101HealthResult");if(!host)return;if(!v3101Health){host.innerHTML='<div class="help">Run the check after the SQL migration and Edge Function have been deployed.</div>';return}const h=v3101Health;host.innerHTML=[v3101HealthPill("Edge Function deployed",h.function_deployed===true),v3101HealthPill("Transcription table",h.transcription_table?.ok===true,h.transcription_table?.error||""),v3101HealthPill("Private media bucket",h.media_bucket?.ok===true,h.media_bucket?.error||h.media_bucket?.name||""),v3101HealthPill("OpenAI secret configured",h.openai?.configured===true),v3101HealthPill("OpenAI connection",h.openai?.connected===true,h.openai?.error||h.openai?.model||"")].join("")+`<div class="list-meta">Checked ${h.checked_at?new Date(h.checked_at).toLocaleString("en-NZ"):"now"}</div>`}
async function v3101RunHealth(){if(!cloudReady())return alert("Sign in and connect Supabase first.");const button=$("v3101HealthBtn");if(button){button.disabled=true;button.textContent="Checking…"}try{const response=await v3101Fetch(v3101FunctionUrl(),{method:"POST",headers:v3101AuthHeaders(true),body:JSON.stringify({action:"health"})},45000),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Health check failed (${response.status})`);v3101Health=data;v3101RenderHealth();updateStatus(data.ok?"Transcription connection is ready":"Transcription setup needs attention",data.ok?"good":"error")}catch(error){v3101Health={function_deployed:false,transcription_table:{ok:false,error:error.message},media_bucket:{ok:false},openai:{configured:false,connected:false},checked_at:nowIso()};v3101RenderHealth();updateStatus("Transcription health check failed","error")}finally{if(button){button.disabled=false;button.textContent="Run transcription health check"}}}

function v3101InjectHealth(){if($("v3101TranscriptionHealth"))return;const capture=$("capture");if(!capture)return;const card=document.createElement("article");card.id="v3101TranscriptionHealth";card.className="card v3101-health-card";card.innerHTML='<div class="card-heading"><div><div class="eyebrow">Connection check</div><h3>Photo + voice transcription health</h3></div><span class="badge">OpenAI via Supabase</span></div><p>Checks the deployed function, private media bucket, transcription table and existing OpenAI secret without exposing the key.</p><button id="v3101HealthBtn" type="button">Run transcription health check</button><div id="v3101HealthResult" class="v3101-health-grid"></div>';
  capture.querySelector(".view-heading")?.insertAdjacentElement("afterend",card);$("v3101HealthBtn").onclick=v3101RunHealth;v3101RenderHealth()}

function v3101InjectSessionDictation(){if($("v3101SessionDictation"))return;const photo=$("quickSessionPhotoPreview");if(!photo)return;const box=document.createElement("div");box.id="v3101SessionDictation";box.className="v3101-dictation";box.innerHTML='<div><strong>Dictate the session</strong><span>Speak naturally. The transcript is placed into the same editable session box as pasted text.</span></div><div class="button-row"><button id="v3101StartSessionVoice" type="button">Start dictation</button><button id="v3101StopSessionVoice" type="button" class="danger-button" disabled>Stop & transcribe</button></div><audio id="v3101SessionVoicePreview" controls hidden></audio><div id="v3101SessionVoiceStatus" class="help">No recording yet.</div>';
  photo.insertAdjacentElement("afterend",box);$("v3101StartSessionVoice").onclick=v3101StartSessionVoice;$("v3101StopSessionVoice").onclick=v3101StopSessionVoice}
function v3101VoiceStatus(text,mode=""){const el=$("v3101SessionVoiceStatus");if(!el)return;el.textContent=text;el.className=`help ${mode}`.trim()}
function v3101RecorderOptions(){for(const mimeType of ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"]){if(window.MediaRecorder?.isTypeSupported?.(mimeType))return {mimeType}}return {}}
async function v3101StartSessionVoice(){try{if(!cloudReady())throw new Error("Sign in and connect Supabase before using automatic transcription.");const stream=await navigator.mediaDevices.getUserMedia({audio:true}),recorder=new MediaRecorder(stream,v3101RecorderOptions());v3101SessionVoiceChunks=[];v3101SessionRecorder=recorder;recorder.ondataavailable=e=>{if(e.data?.size)v3101SessionVoiceChunks.push(e.data)};recorder.onstop=async()=>{const mime=recorder.mimeType||"audio/webm",blob=new Blob(v3101SessionVoiceChunks,{type:mime});stream.getTracks().forEach(track=>track.stop());const localId=await saveMediaBlob(blob,"session_voice","dictated-session.webm");v3101PendingSessionVoice={blob,localId,mime,raw_text:"",structured_blocks:[],structured_data:{}};const preview=$("v3101SessionVoicePreview");preview.src=URL.createObjectURL(blob);preview.hidden=false;await v3101TranscribeDirectSession(blob)};recorder.start();$("v3101StartSessionVoice").disabled=true;$("v3101StopSessionVoice").disabled=false;v3101VoiceStatus("Recording… call the session exactly as you coach it.","good")}catch(error){alert(error.message||"Microphone access is unavailable.");v3101VoiceStatus(error.message||"Voice dictation unavailable.","error")}}
function v3101StopSessionVoice(){if(v3101SessionRecorder&&v3101SessionRecorder.state!=="inactive")v3101SessionRecorder.stop();$("v3101StartSessionVoice").disabled=false;$("v3101StopSessionVoice").disabled=true;v3101VoiceStatus("Uploading securely and transcribing…")}
async function v3101TranscribeDirectSession(blob){try{const form=new FormData();form.append("action","transcribe_direct");form.append("source_type","voice");form.append("purpose","planned_session");form.append("file",blob,"dictated-session.webm");const response=await v3101Fetch(v3101FunctionUrl(),{method:"POST",headers:v3101AuthHeaders(false),body:form}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Voice transcription failed (${response.status})`);const raw=String(data.raw_text||"").trim();if(!raw)throw new Error("No transcript came back from the recording.");Object.assign(v3101PendingSessionVoice,{raw_text:raw,structured_blocks:data.structured_blocks||[],structured_data:data.structured_data||{},provider:data.provider||"openai",provider_model:data.model||"",provider_request_id:data.request_id||""});$("sessionPasteInput").value=raw;importedSessionDraft=parseSessionFromChat(raw);renderSessionImportPreview();$("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;$("sessionImportDetails").open=true;v3101VoiceStatus("Transcribed. Check the wording, then save the session.","good");v33SetImportMessage("Voice session transcribed. Correct anything needed, then Save & Use Now.","good")}catch(error){v3101VoiceStatus(`${error.message} The recording remains on this device and can be tried again.`,"error");updateStatus("Voice transcription needs retry","error")}}

const v3101PriorSaveImportedSession=saveImportedSession;
saveImportedSession=async function(openNow){const pending=v3101PendingSessionVoice?{...v3101PendingSessionVoice}:null;await v3101PriorSaveImportedSession(openNow);const session=importedSessionDraft&&appState.sessions.find(s=>s.id===importedSessionDraft.id);if(!pending||!session)return;const capture={id:uid("capture"),session_id:session.id,athlete_id:null,capture_type:"voice",text_content:"Original dictated session",session_block_id:null,media_path:null,media_local_id:pending.localId,mime_type:pending.mime,created_at:nowIso(),updated_at:nowIso()};const tr={id:uid("transcript"),session_id:session.id,capture_id:capture.id,athlete_id:null,session_block_id:null,purpose:"planned_session",source_type:"voice",status:"applied",raw_text:pending.raw_text||session.workout||"",structured_blocks:pending.structured_blocks||[],structured_data:pending.structured_data||{},error_message:"",provider:pending.provider||"openai",provider_model:pending.provider_model||"",provider_request_id:pending.provider_request_id||"",completed_at:nowIso(),created_at:nowIso(),updated_at:nowIso()};upsertLocal("captures",capture);queueRecord("captures",capture.id);upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);v3101PendingSessionVoice=null;saveState(appState);scheduleFastSync();updateStatus("Session and original voice source saved","good")};

function v3101InjectStyles(){if($("v3101Styles"))return;const style=document.createElement("style");style.id="v3101Styles";style.textContent=`
.v3101-health-card{border-left:6px solid #123a5b}.v3101-health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.45rem;margin-top:.65rem}.v3101-health-row{display:grid;grid-template-columns:28px 1fr;gap:.4rem;align-items:start;border:1px solid #d3e1e8;border-radius:.55rem;padding:.55rem;background:#fff}.v3101-health-row>span{display:flex;align-items:center;justify-content:center;width:25px;height:25px;border-radius:999px;font-weight:900}.v3101-health-row.ok>span{background:#ddf4e3;color:#175b2b}.v3101-health-row.bad>span{background:#fbe0e0;color:#8d2020}.v3101-health-row small{display:block;color:#657985;margin-top:.15rem;overflow-wrap:anywhere}.v3101-dictation{border:1px solid #bdd2df;border-radius:.65rem;background:#f4f9fb;padding:.7rem;margin:.65rem 0}.v3101-dictation>div:first-child{display:grid;gap:.15rem}.v3101-dictation>div:first-child span{font-size:.75rem;color:#567}.v3101-dictation audio{width:100%;margin-top:.5rem}.help.good{color:#17602f}.help.error{color:#9a2525}@media(max-width:760px){.v3101-health-grid{grid-template-columns:1fr}.v3101-dictation .button-row button{flex:1}}
`;document.head.appendChild(style)}
function v3101Interface(){v3101InjectStyles();v3101InjectHealth();v3101InjectSessionDictation();document.title="McLay Swimming OS — v3.10.2 Performance + Capture Repair";const subtitle=document.querySelector(".header-subtitle");if(subtitle)subtitle.textContent="Version 3.10.2 · fast local actions · repaired photo and voice transcription"}
const v3101PriorRenderAll=renderAll;
renderAll=function(){v3101PriorRenderAll();v3101InjectHealth();v3101InjectSessionDictation();v3101RenderHealth()};
const v3101PriorShowView=showView;
showView=function(id){v3101PriorShowView(id);if(id==="capture"){v3101InjectHealth();v3101RenderHealth()}if(id==="deck")v3101InjectSessionDictation()};

v3101Interface();renderAll();


// =============================================================================
// McLay Swimming OS v3.10.2 — performance and capture repair.
// Ordinary taps stay local and responsive. Background sync pushes queued changes
// without re-downloading the entire club/result model after every interaction.
// Manual Sync remains the explicit full push + pull operation.
// =============================================================================
let v3102SyncTimer=null;
let v3102SyncRun=null;
let v3102QueuedPull=false;
let v3102LastInteraction=0;

function v3102SetBusy(label=""){
  document.body.classList.toggle("v3102-cloud-busy",Boolean(label));
  const badge=$("syncBadge");
  if(badge&&label&&!/error/i.test(badge.textContent||"")) badge.dataset.background=label;
}
async function v3102RunSync({pull=false,render=false,manual=false}={}){
  if(!cloudReady()){renderMode();return false}
  if(v3102SyncRun){
    if(pull){await v3102SyncRun;return v3102RunSync({pull:true,render,manual})}
    return v3102SyncRun;
  }
  v3102SyncRun=(async()=>{
    try{
      v3102SetBusy(pull?"Refreshing":"Saving");
      await pushPending();
      if(pull) await pullCloud();
      updateStatus(v331SyncStatusText(),v331UnavailableTables().size?"normal":"good");
      if(render) renderAll();
      return true;
    }catch(error){
      console.error(error);
      updateStatus("Waiting to sync","error");
      return false;
    }finally{
      v3102SetBusy("");
      v3102SyncRun=null;
    }
  })();
  return v3102SyncRun;
}
function v3102ScheduleSync(delay=1000){
  clearTimeout(v3102SyncTimer);
  v3102SyncTimer=setTimeout(()=>{v3102SyncTimer=null;v3102RunSync({pull:false,render:false})},delay);
}
async function v3102FlushPendingNow(){
  clearTimeout(v3102SyncTimer);v3102SyncTimer=null;
  if(v3102SyncRun)await v3102SyncRun;
  return v3102RunSync({pull:false,render:false});
}

// Existing save handlers await this function. Returning immediately keeps the
// phone responsive while the queued cloud write happens shortly afterward.
syncIfPossible=async function(){v3102ScheduleSync(850);return true};
scheduleFastSync=function(){v3102ScheduleSync(650)};
syncNow=async function(){
  if(!getAuth()?.access_token)throw new Error("Sign in first.");
  if(!appState.settings.organisation_id)await ensureOrganisation();
  v331ClearOptionalTableWarnings();
  updateStatus("Syncing…");
  clearTimeout(v3102SyncTimer);v3102SyncTimer=null;
  return v3102RunSync({pull:true,render:true,manual:true});
};
window.addEventListener("online",()=>v3102ScheduleSync(400));
for(const eventName of ["pointerdown","keydown","touchstart"]){window.addEventListener(eventName,()=>{v3102LastInteraction=Date.now()},{passive:true})}

function v3102AdoptQuickPhoto(file){
  v33PendingSessionPhoto=file||null;v33PendingPhotoSaved=false;
  if(v33QuickPhotoUrl)URL.revokeObjectURL(v33QuickPhotoUrl);
  if(!v33PendingSessionPhoto)return;
  v33QuickPhotoUrl=URL.createObjectURL(v33PendingSessionPhoto);
  $("quickSessionPhotoPreview").src=v33QuickPhotoUrl;$("quickSessionPhotoPreview").hidden=false;
  $("quickSessionPhotoTranscribeBtn").disabled=false;
  v33SetImportMessage("Photo selected. Transcribe it, or type/paste the session while it uploads.","good");
}
function v3102BindCaptureChoices(){
  const quickCamera=$("quickSessionPhotoCameraInput");
  if(quickCamera&&!quickCamera.dataset.bound3102){quickCamera.dataset.bound3102="1";quickCamera.addEventListener("change",e=>{v3102AdoptQuickPhoto(e.target.files?.[0]);e.target.value=""})}
  const sessionCamera=$("sessionPhotoCameraInput");
  if(sessionCamera&&!sessionCamera.dataset.bound3102){sessionCamera.dataset.bound3102="1";sessionCamera.addEventListener("change",async e=>{await v32SaveSessionPhoto(e.target.files?.[0]);e.target.value=""})}
  const gallery=$("galleryPhotoInput");
  if(gallery&&!gallery.dataset.bound3102){gallery.dataset.bound3102="1";gallery.addEventListener("change",async e=>{await saveFileCapture(e.target.files?.[0],"photo");e.target.value=""})}
}
function v3102PlaceDictation(){
  const box=$("v3101SessionDictation"),textarea=$("sessionPasteInput");if(!box||!textarea)return;
  box.querySelector("strong").textContent="Dictate a new session";
  const span=box.querySelector("span");if(span)span.textContent="Record the workout here. It will return to the editable session box below.";
  const label=textarea.previousElementSibling;
  if(label&&box.nextElementSibling!==label) label.insertAdjacentElement("beforebegin",box);
}
function v3102HumanTranscriptionError(message){
  const text=String(message||"");
  if(/quota|billing|exceeded your current/i.test(text))return "OpenAI API billing or quota needs attention.";
  if(/schema|response_format|structured_blocks/i.test(text))return "The transcription response format was rejected. Deploy the repaired v3.10.2 Edge Function.";
  if(/timed out|abort/i.test(text))return "Transcription timed out. The source is saved and can be retried.";
  if(/media|upload/i.test(text))return "The photo or audio could not upload. Check the connection and retry.";
  return text||"Transcription failed. The source remains saved for retry.";
}
const v3102PriorVoicePreview=v34VoicePreviewHtml;
v34VoicePreviewHtml=function(tr){
  if(tr?.status==="error")return `<div class="transcript-error"><strong>Transcription needs retry</strong><div>${escapeHtml(v3102HumanTranscriptionError(tr.error_message))}</div></div>`;
  return v3102PriorVoicePreview(tr);
};

const v3102PriorRenderAll=renderAll;
renderAll=function(){v3102PriorRenderAll();v3102BindCaptureChoices();v3102PlaceDictation()};
const v3102PriorShowView=showView;
showView=function(id){v3102PriorShowView(id);v3102BindCaptureChoices();if(id==="deck")v3102PlaceDictation()};

function v3102InjectStyles(){if($("v3102Styles"))return;const style=document.createElement("style");style.id="v3102Styles";style.textContent=`
.v3102-cloud-busy #syncBadge::after{content:" · saving";font-weight:600}.quick-photo-row{display:flex;flex-wrap:wrap;gap:.55rem;align-items:end}.quick-photo-row .file-button{min-width:150px}.file-button{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:.35rem;border:2px solid #87abc0;border-radius:.55rem;padding:.58rem .72rem;background:#fff;color:#123a5b;font-weight:800;cursor:pointer}.file-button:hover{background:#edf6fa}.file-button input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}.v3101-dictation{position:relative}.v3101-dictation .button-row{margin-top:.5rem}@media(max-width:760px){.quick-photo-row>*{flex:1 1 100%}.quick-photo-row .file-button{display:flex;justify-content:center}.button-row .file-button{flex:1 1 140px}}
`;document.head.appendChild(style)}

// Batch queue acknowledgements so a large pending queue does not rewrite local
// storage after every individual cloud row.
pushPending=async function(){
  if(!cloudReady())return;
  const priority={athletes:1,season_plans:2,weekly_plans:3,sessions:4,session_lane_assignments:5,session_blocks:6,test_sets:7,attendance:8,captures:9,timed_sets:10,test_set_attempts:11,coach_result_imports:12,coach_results:13,coach_result_aliases:14,session_reviews:15,session_transcriptions:16};
  const pending=[...appState.pending].sort((a,b)=>(priority[a.table]||99)-(priority[b.table]||99));
  let completed=0;
  const acknowledge=item=>{appState.pending=appState.pending.filter(p=>!(p.table===item.table&&p.id===item.id));completed++;if(completed%10===0)saveState(appState)};
  for(const item of pending){
    if(V331_OPTIONAL_CLOUD_TABLES.has(item.table)&&v331UnavailableTables().has(item.table))continue;
    try{
      if(item.action==="delete"){
        await cloudFetch(`/rest/v1/${item.table}?id=eq.${encodeURIComponent(item.id)}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});
        acknowledge(item);continue;
      }
      const record=appState[item.table]?.find(r=>r.id===item.id);
      if(!record){acknowledge(item);continue}
      if(item.table==="captures")await uploadCaptureMedia(record);
      const row=cloudRow(item.table,record);
      await cloudFetch(`/rest/v1/${item.table}?on_conflict=id`,{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row)});
      acknowledge(item);
    }catch(error){
      const missing=v331MissingRelationTable(error);
      if(missing===item.table&&v331MarkTableUnavailable(item.table,error))continue;
      if(completed)saveState(appState);
      throw error;
    }
  }
  if(completed)saveState(appState);
};

v3102InjectStyles();v3102BindCaptureChoices();v3102PlaceDictation();
document.title="McLay Swimming OS — v3.10.2 Performance + Capture Repair";
const v3102Subtitle=document.querySelector(".header-subtitle");if(v3102Subtitle)v3102Subtitle.textContent="Version 3.10.2 · fast local actions · repaired photo and voice transcription";
// Only push unsent local changes after startup. A full data refresh is manual.
setTimeout(()=>v3102ScheduleSync(250),1200);


// =============================================================================
// McLay Swimming OS v3.10.3 — recovery audit.
// Fixes stale-version rollback, persistent auth, automatic lightweight sync,
// lazy result hydration, direct transcription uploads and the complete
// Clive Rushton HR / freestyle stroke-rate reference in McLay terminology.
// =============================================================================
const V3103_VERSION="3.10.3";
const V3103_BUILD="20260728-recovery-audit-3103";
const V3103_CORE_RESULT_KEYS=["coach_results","results_pb_board","results_event_history","results_athlete_overview"];
const V3103_STARTUP_TABLES=["athletes","sessions","session_blocks","attendance","season_plans","weekly_plans","session_lane_assignments","coaching_profiles"];
const V3103_OPERATIONAL_TABLES=[
  "athletes","sessions","session_blocks","attendance","captures","session_transcriptions",
  "season_plans","weekly_plans","session_lane_assignments","training_test_types",
  "training_test_results","training_pace_models","race_goals","athlete_adaptation_rules",
  "athlete_modification_rules","athlete_individual_plans","session_adaptations","session_participants",
  "swim_meets","swim_meet_entries","swim_meet_feedback","coaching_profiles","squad_programmes",
  "squad_timetable_slots","session_zone_classifications","session_zone_summaries",
  "coach_classification_challenges","coach_communications"
];
const V3103_RUSHTON_REFERENCE={
  "Regeneration":{heart_rate:{max:140,label:"Below 140 bpm"},stroke_rates:{freestyle:{max:30,label:"30 cycles/min or lower"}},notes:"Recovery, warm-up/down, feel, alignment, controlled drill and minimum-stroke-count work."},
  "Development":{heart_rate:{max:140,label:"Below 140 bpm"},stroke_rates:{freestyle:{max:30,upper_context:31,label:"About 30 cycles/min or lower"}},notes:"Aerobic development anchored to the swimmer's T400 pace."},
  "Overload":{heart_rate:{typical:150,label:"About 150 bpm"},stroke_rates:{freestyle:{min:31,max:33,label:"31–33 cycles/min"}},notes:"Aerobic overload anchored to T400 pace; increasing fast-twitch-a recruitment while remaining highly aerobic."},
  "Threshold":{heart_rate:{min:160,max:165,label:"160–165 bpm"},stroke_rates:{freestyle:{min:33,max:35,label:"33–35 cycles/min"}},notes:"Threshold anchored to T400 pace; all fibre types recruited at the aerobic/glycolytic transition."},
  "Clearance":{heart_rate:{min:165,max:185,label:"165–185 bpm"},stroke_rates:{freestyle:{min:35,max:45,label:"35–45 cycles/min"}},notes:"Lactate-clearance work anchored to T400 pace with rising mixed aerobic/anaerobic contribution."},
  "Speed":{heart_rate:{label:"Not a primary guide"},stroke_rates:{freestyle:{min_exclusive:60,label:"Can exceed 60 cycles/min"}},notes:"Very short maximum-speed work, usually about 1–10 seconds, with enough recovery to protect speed quality."},
  "Anaerobic power":{heart_rate:{label:"Not a primary discriminator"},stroke_rates:{freestyle:{min:45,max:60,label:"Typically 45–60 cycles/min"}},notes:"Maximum-quality race-specific work with long recovery, classified from PB/goal pace, duration and recovery."},
  "Anaerobic capacity":{heart_rate:{label:"High/maximal; set design is more useful"},stroke_rates:{freestyle:{min:45,max:60,label:"Typically 45–60 cycles/min"}},notes:"Repeated high-intensity work with incomplete recovery, classified from race pace, work duration and recovery."},
  "Lactate tolerance":{heart_rate:{label:"Not a primary discriminator"},stroke_rates:{freestyle:{min:45,max:60,label:"45–60 cycles/min"}},notes:"Repeated maximal or near-maximal work with short/incomplete recovery and substantial chemical disturbance."},
  "Race pace":{heart_rate:{label:"Depends on event and set design"},stroke_rates:{freestyle:{label:"Use the swimmer's race-specific stroke-rate target when known"}},notes:"PB or goal race pace is the anchor; repetition duration, range and recovery determine the likely response."}
};

function v3103ApplyBrand(){
  document.title=`McLay Swimming OS — v${V3103_VERSION} Recovery Audit`;
  const subtitle=document.querySelector('.header-subtitle');
  if(subtitle)subtitle.textContent=`Version ${V3103_VERSION} · stable phone startup · automatic cloud · photo + voice · HR / SR / energy reference`;
  const button=$("mobileConnectionBtn");if(button){button.textContent="Cloud";button.setAttribute("aria-label","Open cloud account and status")}
  const nav=document.querySelector('.mobile-nav [data-view="settings"]');if(nav)nav.innerHTML='<span>☁</span>Cloud';
  const sync=$("syncNowBtn");if(sync)sync.textContent="Refresh cloud data";
}
const v3103PriorV381Interface=typeof v381Interface==="function"?v381Interface:null;
if(v3103PriorV381Interface){v381Interface=function(){v3103PriorV381Interface();v3103ApplyBrand()}}

// Keep PB/history and reference rows outside the ordinary poolside save payload.
// They remain in IndexedDB and are hydrated lazily when a result-aware screen opens.
let v3103CoreHydrated=false,v3103AllHeavyHydrated=false,v3103HydrateRun=null;
async function v3103ReadHeavyCache(){
  const db=await v374OpenCache();
  return new Promise((resolve,reject)=>{const r=db.transaction(V374_CACHE_STORE).objectStore(V374_CACHE_STORE).get("latest");r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});
}
async function v3103HydrateResults({all=false,render=true}={}){
  if((all&&v3103AllHeavyHydrated)||(!all&&v3103CoreHydrated))return true;
  if(v3103HydrateRun)return v3103HydrateRun;
  v3103HydrateRun=(async()=>{try{
    const cached=await v3103ReadHeavyCache();if(!cached?.payload)return false;
    const keys=all?[...V374_HEAVY_STATE_KEYS,...V3103_CORE_RESULT_KEYS]:V3103_CORE_RESULT_KEYS;
    for(const key of new Set(keys)){
      const incoming=Array.isArray(cached.payload[key])?cached.payload[key]:[];if(!incoming.length)continue;
      const current=Array.isArray(appState[key])?appState[key]:[];
      const map=new Map(incoming.map(row=>[row.id||JSON.stringify(row),row]));for(const row of current)map.set(row.id||JSON.stringify(row),row);
      appState[key]=[...map.values()];
    }
    v3103CoreHydrated=true;if(all)v3103AllHeavyHydrated=true;
    if(render){const id=document.querySelector('.view.active')?.id||"deck";renderView(id);if(id==="deck"){v390DeckPanel?.();v382RenderPacePanel?.()}}
    return true;
  }catch(error){console.warn("Result cache restore deferred",error);return false}finally{v3103HydrateRun=null}})();
  return v3103HydrateRun;
}
// Core PBs become available after the initial screen is interactive, without
// restoring the much larger standards/reference model or forcing renderAll.
setTimeout(()=>v3103HydrateResults({all:false,render:true}),900);

let v3103AuthRefreshRun=null;
function v3103AuthExpiresSoon(auth=getAuth()){const expires=Number(auth?.expires_at||0);return !expires||Date.now()>=(expires*1000-120000)}
async function v3103RefreshAuth(force=false){
  const auth=getAuth();if(!auth?.refresh_token){if(auth?.access_token)return auth;throw new Error("Sign in once to connect this device.")}
  if(!force&&!v3103AuthExpiresSoon(auth))return auth;
  if(v3103AuthRefreshRun)return v3103AuthRefreshRun;
  v3103AuthRefreshRun=(async()=>{const config=getConfig();const response=await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:config.supabaseAnonKey,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:auth.refresh_token})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error_description||data.msg||data.message||"Your saved login could not be refreshed.");saveAuth({...auth,...data,user:data.user||auth.user});return getAuth()})().finally(()=>{v3103AuthRefreshRun=null});
  return v3103AuthRefreshRun;
}
async function v3103EnsureCloudSession(){
  const config=getConfig();if(!config.supabaseUrl||!config.supabaseAnonKey)throw new Error("Supabase connection details are missing.");
  await v3103RefreshAuth(false);
  if(!appState.settings.organisation_id)await ensureOrganisation();
  return true;
}

const v3103RawCloudFetch=cloudFetch;
cloudFetch=async function(path,options={}){
  await v3103RefreshAuth(false);
  try{return await v3103RawCloudFetch(path,options)}catch(error){
    if(/jwt|token|expired|401|not signed in/i.test(String(error?.message||error))){await v3103RefreshAuth(true);return v3103RawCloudFetch(path,options)}
    throw error;
  }
};

const v3103PriorEnsureOrganisation=ensureOrganisation;
ensureOrganisation=async function(){
  const auth=await v3103RefreshAuth(false);
  const checked=Number(appState.settings.v3103_membership_checked_at||0);
  if(appState.settings.organisation_id&&appState.settings.membership_role&&Date.now()-checked<12*60*60*1000){v3103ApplyBrand();return appState.settings.organisation_id}
  const org=await v3103PriorEnsureOrganisation();appState.settings.v3103_membership_checked_at=Date.now();saveState(appState);v3103ApplyBrand();return org;
};

function v3103OperationalQuery(table,org){
  const base=`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`;
  if(table==="sessions")return `${base}&order=session_date.desc&limit=180`;
  if(["captures","session_transcriptions","coach_communications","coach_classification_challenges","swim_meet_feedback"].includes(table))return `${base}&order=updated_at.desc&limit=250`;
  return base;
}
async function v3103PullOperational({full=false}={}){
  await v3103EnsureCloudSession();const org=appState.settings.organisation_id;
  const tables=full?V3103_OPERATIONAL_TABLES:V3103_STARTUP_TABLES;
  for(const table of tables){if(!CLOUD_TABLES.includes(table)||v331UnavailableTables?.().has(table))continue;try{const rows=await cloudFetch(v3103OperationalQuery(table,org));appState[table]=mergeCollection(appState[table]||[],(rows||[]).map(stripCloudFields))}catch(error){const missing=typeof v331MissingRelationTable==="function"?v331MissingRelationTable(error):null;if(missing===table&&v331MarkTableUnavailable?.(table,error))continue;console.warn(`Operational refresh skipped ${table}`,error)}}
  saveState(appState);return true;
}
let v3103SyncTimer=null,v3103SyncRun=null,v3103LastError="";
function v3103SyncText(){const pending=(appState.pending||[]).length;if(v3103LastError)return pending?`${pending} saved · cloud retrying`:"Cloud retrying";return pending?`${pending} saving`:"Cloud up to date"}
function v3103RenderCloudStatus(){renderMode();if(cloudReady())updateStatus(v3103SyncText(),v3103LastError?"error":"good")}
async function v3103BackgroundSync({pull=false}={}){
  if(v3103SyncRun)return v3103SyncRun;
  v3103SyncRun=(async()=>{try{await v3103EnsureCloudSession();await pushPending();if(pull)await v3103PullOperational({full:pull==="full"});v3103LastError="";v3103RenderCloudStatus();return true}catch(error){v3103LastError=String(error?.message||error);console.warn("Background cloud sync",error);v3103RenderCloudStatus();return false}finally{v3103SyncRun=null}})();return v3103SyncRun;
}
function v3103ScheduleBackgroundSync(delay=900,pull=false){clearTimeout(v3103SyncTimer);v3103SyncTimer=setTimeout(()=>{v3103SyncTimer=null;v3103BackgroundSync({pull})},delay)}
window.v3103ScheduleBackgroundSync=v3103ScheduleBackgroundSync;
syncIfPossible=async function(){v3103ScheduleBackgroundSync(500,false);return true};
scheduleFastSync=function(){v3103ScheduleBackgroundSync(350,false)};
syncNow=async function(){await v3103BackgroundSync({pull:"full"});renderView(document.querySelector('.view.active')?.id||"deck");return true};
window.addEventListener("online",()=>v3103ScheduleBackgroundSync(250,true));
setInterval(()=>{if(document.visibilityState==="visible"&&navigator.onLine)v3103ScheduleBackgroundSync(100,false)},60000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")v3103ScheduleBackgroundSync(350,false)});
setTimeout(()=>v3103ScheduleBackgroundSync(1800,true),1400);

function v3103HeartRateText(zone){const ref=V3103_RUSHTON_REFERENCE[zone];return ref?.heart_rate?.label||"Context-dependent"}
function v3103StrokeRateText(zone){const ref=V3103_RUSHTON_REFERENCE[zone];return ref?.stroke_rates?.freestyle?.label||"Race-specific / not fixed"}
function v3103ReferenceHtml(zone){const ref=V3103_RUSHTON_REFERENCE[zone];if(!ref)return "";return `<div class="v3103-reference"><span><b>HR</b> ${escapeHtml(v3103HeartRateText(zone))}</span><span><b>Freestyle SR</b> ${escapeHtml(v3103StrokeRateText(zone))}</span><small>${escapeHtml(ref.notes)}</small></div>`}
const v3103PriorProfile=v390Profile;
v390Profile=function(){
  const profile=v3103PriorProfile();const defs={...(profile.zone_definitions||{})};
  for(const [zone,ref] of Object.entries(V3103_RUSHTON_REFERENCE))defs[zone]={...(defs[zone]||{}),heart_rate:ref.heart_rate,stroke_rates:ref.stroke_rates,stroke_rate_guide:ref.stroke_rates?.freestyle?.label||"",notes:ref.notes,reference_source:"Clive Rushton Swimformation reference"};
  return {...profile,version:"1.2",source_credit:"Training-intensity references adapted from Clive Rushton's Swimformation work. McLay T400 and race-pace calculations remain the pace anchors.",zone_definitions:defs,inference_rules:{...(profile.inference_rules||{}),numeric_guides_require_coach_confirmation:false,reference_source:"Clive Rushton Swimformation",colour_bands:false,numbered_zones:false}};
};
v390ZoneCards=function(summary){return V310_ZONE_ORDER.filter(z=>summary.totals[z]).map(z=>`<div class="v390-zone-card v3103-zone-card"><span>${escapeHtml(z)}</span><strong>${Number(summary.totals[z]).toLocaleString()}m</strong>${v3103ReferenceHtml(z)}</div>`).join("")||'<div class="help">No classifiable set volume yet.</div>'};
v390ProfileTab=function(){const profile=v390Profile();return `<article class="card"><div class="eyebrow">McLay coaching reference</div><h3>Heart rate, freestyle stroke rate and energy-system intent</h3><p>${escapeHtml(profile.source_credit)}</p><p class="help">Session entry accepts Reg, Dev, OL, AT and CL. The app expands them to full words. These references are supplied automatically; you are not required to type them in.</p><div class="v3103-reference-table">${V310_ZONE_ORDER.filter(z=>z!=="Unclassified").map(z=>`<article><h4>${escapeHtml(z)}</h4>${v3103ReferenceHtml(z)}</article>`).join("")}</div></article>`};
function v3103InjectActiveReference(){const host=document.querySelector('.v390-active-classification');if(!host||host.querySelector('.v3103-reference'))return;const zone=host.querySelector('strong')?.textContent?.trim();if(zone&&V3103_RUSHTON_REFERENCE[zone])host.insertAdjacentHTML('beforeend',v3103ReferenceHtml(zone))}
const v3103PriorDeckPanel=v390DeckPanel;
v390DeckPanel=function(){v3103PriorDeckPanel();v3103InjectActiveReference()};

async function v3103FunctionFetch(body,{form=false,timeout=145000}={}){
  await v3103EnsureCloudSession();const config=getConfig(),auth=getAuth();const headers={apikey:config.supabaseAnonKey,Authorization:`Bearer ${auth.access_token}`};if(!form)headers["Content-Type"]="application/json";
  let response=await v3101Fetch(v3101FunctionUrl(),{method:"POST",headers,body:form?body:JSON.stringify(body)},timeout);
  if(response.status===401){await v3103RefreshAuth(true);const fresh=getAuth();headers.Authorization=`Bearer ${fresh.access_token}`;response=await v3101Fetch(v3101FunctionUrl(),{method:"POST",headers,body:form?body:JSON.stringify(body)},timeout)}
  return response;
}
async function v3103UploadCaptureDirect(capture){
  await v3103EnsureCloudSession();await uploadCaptureMedia(capture);if(!capture.media_path)throw new Error("The photo or audio could not be uploaded.");
  const row=cloudRow("captures",capture);await cloudFetch(`/rest/v1/captures?on_conflict=id`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row)});
  appState.pending=appState.pending.filter(p=>!(p.table==="captures"&&p.id===capture.id));saveState(appState);return capture;
}

v34TranscribeCapture=async function(tr,capture,{rawTextOverride=""}={}){
  if(!tr||!capture)throw new Error("The transcription or linked capture is missing.");
  await v3103EnsureCloudSession();if(!rawTextOverride)await v3103UploadCaptureDirect(capture);
  tr.source_type=tr.source_type||capture.capture_type||"photo";tr.athlete_id=tr.athlete_id||capture.athlete_id||null;tr.session_block_id=tr.session_block_id||capture.session_block_id||null;tr.status="transcribing";tr.error_message="";tr.updated_at=nowIso();upsertLocal("session_transcriptions",tr);saveState(appState);
  const res=await v3103FunctionFetch({transcription_id:tr.id,capture_id:capture.id,session_id:tr.session_id,media_path:capture.media_path,source_type:tr.source_type,purpose:tr.purpose,athlete_id:tr.athlete_id,session_block_id:tr.session_block_id,raw_text_override:rawTextOverride||null});const data=await res.json().catch(()=>({}));
  if(!res.ok){tr.status="error";tr.error_message=data.error||`Transcription failed (${res.status})`;tr.updated_at=nowIso();upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);throw new Error(tr.error_message)}
  Object.assign(tr,{raw_text:data.raw_text||rawTextOverride||"",structured_blocks:data.structured_blocks||[],structured_data:data.structured_data||{},status:"review",error_message:"",provider:data.provider||"openai",provider_model:data.model||"",provider_request_id:data.request_id||"",updated_at:nowIso()});upsertLocal("session_transcriptions",tr);queueRecord("session_transcriptions",tr.id);saveState(appState);v3103ScheduleBackgroundSync(200,false);return tr;
};

v3101RunHealth=async function(){const button=$("v3101HealthBtn");if(button){button.disabled=true;button.textContent="Checking…"}try{const response=await v3103FunctionFetch({action:"health"},{timeout:45000}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Health check failed (${response.status})`);v3101Health=data;v3101RenderHealth();updateStatus(data.ok?"Transcription ready":"Transcription setup needs attention",data.ok?"good":"error")}catch(error){v3101Health={function_deployed:false,transcription_table:{ok:false,error:error.message},media_bucket:{ok:false},openai:{configured:false,connected:false},checked_at:nowIso()};v3101RenderHealth();updateStatus("Transcription health check failed","error")}finally{if(button){button.disabled=false;button.textContent="Run transcription health check"}}};
v3101StartSessionVoice=async function(){try{await v3103EnsureCloudSession();const stream=await navigator.mediaDevices.getUserMedia({audio:true}),recorder=new MediaRecorder(stream,v3101RecorderOptions());v3101SessionVoiceChunks=[];v3101SessionRecorder=recorder;recorder.ondataavailable=e=>{if(e.data?.size)v3101SessionVoiceChunks.push(e.data)};recorder.onstop=async()=>{const mime=recorder.mimeType||"audio/webm",blob=new Blob(v3101SessionVoiceChunks,{type:mime});stream.getTracks().forEach(track=>track.stop());const localId=await saveMediaBlob(blob,"session_voice","dictated-session.webm");v3101PendingSessionVoice={blob,localId,mime,raw_text:"",structured_blocks:[],structured_data:{}};const preview=$("v3101SessionVoicePreview");preview.src=URL.createObjectURL(blob);preview.hidden=false;await v3101TranscribeDirectSession(blob)};recorder.start();$("v3101StartSessionVoice").disabled=true;$("v3101StopSessionVoice").disabled=false;v3101VoiceStatus("Recording… call the session exactly as you coach it.","good")}catch(error){v3101VoiceStatus(error.message||"Voice dictation unavailable.","error")}};
v3101TranscribeDirectSession=async function(blob){try{const form=new FormData();form.append("action","transcribe_direct");form.append("source_type","voice");form.append("purpose","planned_session");form.append("file",blob,"dictated-session.webm");const response=await v3103FunctionFetch(form,{form:true}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Voice transcription failed (${response.status})`);const raw=String(data.raw_text||"").trim();if(!raw)throw new Error("No transcript came back from the recording.");Object.assign(v3101PendingSessionVoice,{raw_text:raw,structured_blocks:data.structured_blocks||[],structured_data:data.structured_data||{},provider:data.provider||"openai",provider_model:data.model||"",provider_request_id:data.request_id||""});$("sessionPasteInput").value=raw;importedSessionDraft=parseSessionFromChat(raw);renderSessionImportPreview();$("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;$("sessionImportDetails").open=true;v3101VoiceStatus("Transcribed. Check the wording, then save the session.","good");v33SetImportMessage("Voice session transcribed. Correct anything needed, then Save & Use Now.","good")}catch(error){v3101VoiceStatus(`${v3102HumanTranscriptionError(error.message)} The recording remains on this device and can be tried again.`,"error");updateStatus("Voice transcription needs retry","error")}};

v33QuickPhotoTranscribe=async function(){
  const file=v33PendingSessionPhoto;if(!file)return;try{await v3103EnsureCloudSession();let draft=importedSessionDraft;if(!draft){const seed=$("sessionPasteInput").value.trim()||`Session title: ${$("quickSessionTitle").value.trim()||"Session photo import"}\nDate: ${$("quickSessionDate").value}\nSquads: ${$("quickSessionSquads").value}`;draft=parseSessionFromChat(seed)}draft=v33ApplyQuickFields(draft);if(!draft.title)draft.title="Session photo import";if(!draft.workout)draft.workout="Session photo attached — transcription pending";importedSessionDraft=draft;upsertLocal("sessions",draft);queueRecord("sessions",draft.id);const priorId=appState.settings.selected_session_id,priorSquad=appState.settings.selected_squad;appState.settings.selected_session_id=draft.id;appState.settings.selected_squad=sessionSquads(draft)[0]||"";saveState(appState);await v33AttachPendingPhoto(draft);const capture=(appState.captures||[]).filter(c=>c.session_id===draft.id&&c.capture_type==="photo").sort(byUpdated)[0];if(!capture)throw new Error("The selected photo could not be saved.");await v3103UploadCaptureDirect(capture);const tr=(appState.session_transcriptions||[]).find(t=>t.capture_id===capture.id)||{id:uid("transcript"),session_id:draft.id,capture_id:capture.id,source_type:"photo",purpose:"planned",status:"saved",raw_text:"",structured_blocks:[],structured_data:{},created_at:nowIso(),updated_at:nowIso()};upsertLocal("session_transcriptions",tr);await v34TranscribeCapture(tr,capture);if(priorId&&appState.sessions.some(s=>s.id===priorId)){appState.settings.selected_session_id=priorId;appState.settings.selected_squad=priorSquad||""}saveState(appState);if(tr.raw_text){$("sessionPasteInput").value=tr.raw_text;importedSessionDraft={...draft,...parseSessionFromChat(tr.raw_text),id:draft.id};renderSessionImportPreview();$("saveImportedSessionBtn").disabled=false;$("runImportedSessionBtn").disabled=false;$("sessionImportDetails").open=true;v33SetImportMessage("Photo transcribed. Correct anything needed, then Save & Use Now.","good")}}catch(error){console.error(error);$("sessionImportDetails").open=true;v33SetImportMessage(`${v3102HumanTranscriptionError(error.message)} The photo remains saved for retry.`,"warning")}
};
// Existing click listener resolves the function through this binding only after
// a fresh replacement, so rebind the photo button explicitly.
if($("quickSessionPhotoTranscribeBtn")){const old=$("quickSessionPhotoTranscribeBtn"),fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.addEventListener("click",v33QuickPhotoTranscribe)}

const v3103PriorRenderAll=renderAll;
renderAll=function(){v3103PriorRenderAll();v3103ApplyBrand();v3103RenderCloudStatus();v3103InjectActiveReference()};
const v3103PriorShowView=showView;
showView=function(id){v3103PriorShowView(id);v3103ApplyBrand();if(["results","resultsupdate","athletes"].includes(id))v3103HydrateResults({all:id!=="athletes",render:true});v3103InjectActiveReference()};

function v3103InjectStyles(){if($("v3103Styles"))return;const style=document.createElement("style");style.id="v3103Styles";style.textContent=`
.v3103-reference{display:grid;gap:.18rem;margin-top:.4rem;padding:.45rem .55rem;border-radius:.5rem;background:#f2f7f9;color:#294653;font-size:.72rem}.v3103-reference span{display:block!important;font-size:.72rem!important;text-transform:none!important;letter-spacing:normal!important;color:#294653!important}.v3103-reference small{display:block;color:#60737d;line-height:1.35}.v3103-zone-card{min-width:190px}.v3103-reference-table{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:.6rem}.v3103-reference-table article{border:1px solid #c9dce4;border-radius:.65rem;padding:.65rem;background:#fff}.v3103-reference-table h4{margin:0;color:#123a5b}.v3102-cloud-busy #syncBadge::after{content:""}.v3103-loading{opacity:.65;pointer-events:none}@media(max-width:760px){.v3103-reference-table{grid-template-columns:1fr}.v3103-zone-card{min-width:0}}
`;document.head.appendChild(style)}
v3103InjectStyles();v3103ApplyBrand();v3103RenderCloudStatus();

// v3.10.3: sign-in establishes a persistent cloud session, then the app saves
// automatically. It no longer blocks the user behind a complete manual Sync.
function v3103BindPersistentAuth(){
  const signIn=$("signInBtn");
  if(signIn&&!signIn.dataset.bound3103){
    const fresh=signIn.cloneNode(true);signIn.replaceWith(fresh);fresh.dataset.bound3103="1";
    fresh.addEventListener("click",async()=>{fresh.disabled=true;try{
      const data=await authRequest("token?grant_type=password",{email:$("authEmail").value.trim(),password:$("authPassword").value});
      saveAuth(data);appState.settings.user_id=data.user.id;saveState(appState);await ensureOrganisation();
      $("connectionResult").innerHTML='<div class="result">Signed in. Cloud saving and refresh now happen automatically.</div>';
      v3103ScheduleBackgroundSync(100,true);v3103RenderCloudStatus();
    }catch(error){$("connectionResult").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}</div>`}finally{fresh.disabled=false}})
  }
  const signUp=$("signUpBtn");
  if(signUp&&!signUp.dataset.bound3103){
    const fresh=signUp.cloneNode(true);signUp.replaceWith(fresh);fresh.dataset.bound3103="1";
    fresh.addEventListener("click",async()=>{fresh.disabled=true;try{
      const data=await authRequest("signup",{email:$("authEmail").value.trim(),password:$("authPassword").value});
      if(data.access_token){saveAuth(data);appState.settings.user_id=data.user.id;saveState(appState);await ensureOrganisation();v3103ScheduleBackgroundSync(100,true)}
      $("connectionResult").innerHTML=`<div class="result">${data.access_token?"Account connected. Cloud saving is automatic.":"Account created. Confirm the email if requested, then sign in once."}</div>`;
    }catch(error){$("connectionResult").innerHTML=`<div class="warning-box">${escapeHtml(error.message)}</div>`}finally{fresh.disabled=false}})
  }
}
const v3103PriorRenderAllAuth=renderAll;
renderAll=function(){v3103PriorRenderAllAuth();v3103BindPersistentAuth()};
v3103BindPersistentAuth();

// Corrupt or partial legacy result rows must never print the word "undefined"
// on deck. They remain auditable in Results Update, while poolside output uses —.
const v3103PriorAthleteQuickHtml=athleteQuickHtml;
athleteQuickHtml=function(athlete){return String(v3103PriorAthleteQuickHtml(athlete)).replace(/\bundefined\b/g,"—")};

// Keep Deck calm: individual modifications and swimmer detail are available
// on demand instead of occupying the full phone screen all session.
function v3103CompactDeck(){
  const panel=$("adaptationPanel");
  if(panel&&!panel.dataset.compact3103){
    panel.dataset.compact3103="1";panel.classList.add("v3103-adaptation-collapsed");
    const heading=panel.querySelector(".card-heading");
    if(heading){const toggle=document.createElement("button");toggle.type="button";toggle.className="secondary v3103-adaptation-toggle";toggle.textContent="Open modified swimmers";toggle.onclick=()=>{const collapsed=panel.classList.toggle("v3103-adaptation-collapsed");toggle.textContent=collapsed?"Open modified swimmers":"Close modified swimmers"};heading.appendChild(toggle)}
  }
}
document.addEventListener("click",event=>{if(event.target.closest("[data-v35-show-adaptations],[data-v361-show-adaptations]")){const panel=$("adaptationPanel");panel?.classList.remove("v3103-adaptation-collapsed");const toggle=panel?.querySelector(".v3103-adaptation-toggle");if(toggle)toggle.textContent="Close modified swimmers"}},true);
const v3103PriorRenderAllCompact=renderAll;
renderAll=function(){v3103PriorRenderAllCompact();v3103CompactDeck()};
const v3103PriorShowViewCompact=showView;
showView=function(id){v3103PriorShowViewCompact(id);if(id==="deck")v3103CompactDeck()};
v3103CompactDeck();

// PB/result repair: fetch only the swimmer being opened. This closes holes such
// as an empty Archie profile without downloading the whole result chain on Deck.
const v3103AthleteResultRuns=new Map();
async function v3103EnsureAthleteResults(athleteId,{force=false}={}){
  if(!athleteId)return false;
  await v3103HydrateResults({all:false,render:false});
  const stamp=Number(appState.settings[`v3103_results_${athleteId}`]||0);
  const hasRows=(appState.coach_results||[]).some(r=>r.athlete_id===athleteId)||(appState.results_event_history||[]).some(r=>r.athlete_id===athleteId);
  if(!force&&hasRows&&Date.now()-stamp<6*60*60*1000)return true;
  if(!cloudReady())return hasRows;
  if(v3103AthleteResultRuns.has(athleteId))return v3103AthleteResultRuns.get(athleteId);
  const run=(async()=>{try{
    await v3103EnsureCloudSession();const org=appState.settings.organisation_id,encodedOrg=encodeURIComponent(org),encodedAthlete=encodeURIComponent(athleteId);
    const specs=[
      ["coach_results",`/rest/v1/coach_results?select=*&organisation_id=eq.${encodedOrg}&athlete_id=eq.${encodedAthlete}&order=result_date.desc`],
      ["results_event_history",`/rest/v1/results_event_history?select=*&organisation_id=eq.${encodedOrg}&athlete_id=eq.${encodedAthlete}&order=result_date.desc`],
      ["results_pb_board",`/rest/v1/results_pb_board?select=*&organisation_id=eq.${encodedOrg}&athlete_id=eq.${encodedAthlete}`],
      ["results_athlete_overview",`/rest/v1/results_athlete_overview?select=*&organisation_id=eq.${encodedOrg}&athlete_id=eq.${encodedAthlete}`]
    ];
    for(const [key,path] of specs){try{const rows=(await cloudFetch(path)||[]).map(stripCloudFields);appState[key]=[...(appState[key]||[]).filter(r=>r.athlete_id!==athleteId),...rows]}catch(error){console.warn(`Swimmer result refresh skipped ${key}`,error)}}
    appState.settings[`v3103_results_${athleteId}`]=Date.now();saveState(appState);v374SaveHeavyCache(appState);
    return (appState.coach_results||[]).some(r=>r.athlete_id===athleteId)||(appState.results_event_history||[]).some(r=>r.athlete_id===athleteId);
  }finally{v3103AthleteResultRuns.delete(athleteId)}})();v3103AthleteResultRuns.set(athleteId,run);return run;
}
const v3103PriorSelectAthleteEverywhere=selectAthleteEverywhere;
selectAthleteEverywhere=function(id){v3103PriorSelectAthleteEverywhere(id);v3103EnsureAthleteResults(id).then(changed=>{if(changed&&appState.settings.selected_athlete_id===id)v3103PriorSelectAthleteEverywhere(id)}).catch(error=>console.warn("Swimmer results unavailable",error))};
const quickDetails=$("deckAthleteQuickDetails");if(quickDetails)quickDetails.addEventListener("toggle",()=>{if(quickDetails.open)v3103EnsureAthleteResults(appState.settings.selected_athlete_id).then(()=>renderDeckAthleteBrief())});


// =============================================================================
// McLay Swimming OS v3.10.4 — real-phone recovery, roster/result eligibility,
// and non-blocking Deck navigation. This is the final runtime layer.
// =============================================================================
const V3104_VERSION="3.10.4";
const V3104_BUILD="20260728-phone-recovery-tm-audit";

function v3104StandardsEligible(athlete){
  if(!athlete)return false;
  const status=String(athlete.competitive_status||athlete.membership_type||"").toLowerCase();
  const squad=String(athlete.squad||"").toLowerCase();
  if(/non.?competitive|staff|coach|official|volunteer|transition/.test(status))return false;
  if(/fitness/.test(squad))return false;
  return /competitive/.test(status)||/national|development|intermediate|junior|para/.test(squad);
}
function v3104DemographicMessage(athlete){
  if(!v3104StandardsEligible(athlete))return '<div class="result">Competitive standards are not required for this member. T400 and coaching notes still remain available.</div>';
  if(!athlete?.sex||!athlete?.date_of_birth)return '<div class="source-warning">A verified sex and exact date of birth are still required for age-group standards. Results and T400 remain usable.</div>';
  if(athlete.date_of_birth_precision==="year")return '<div class="source-warning">Only the birth year is verified. Add the exact date before relying on age-group standards.</div>';
  return "";
}

// Prevent the scheduled 900 ms heavy-result restore from running while the coach
// is on Deck, Roll, Capture or Finish. Heavy data loads only on a result-aware view.
const v3104HydrateResultsBase=v3103HydrateResults;
v3103HydrateResults=async function(options={}){
  const active=document.querySelector('.view.active')?.id||"deck";
  const allowed=["results","resultsupdate","athletes"].includes(active)||options.force===true;
  if(!allowed)return false;
  return v3104HydrateResultsBase(options);
};

function v3104AfterPaint(fn){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(typeof requestIdleCallback==="function")requestIdleCallback(fn,{timeout:700});else setTimeout(fn,30);
  }));
}

function v3104RenderDeckEssential(){
  const session=selectedSession();
  const deckPicker=$("deckSessionPicker");
  if(deckPicker){
    const sessions=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`));
    deckPicker.innerHTML=sessions.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===session?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");
    deckPicker.onchange=()=>setSelectedSession(deckPicker.value);
  }
  if(!session){
    if($("deckSessionLabel"))$("deckSessionLabel").textContent="No session selected";
    if($("deckSessionTitle"))$("deckSessionTitle").textContent="Choose or create the actual session";
    if($("deckWorkout"))$("deckWorkout").textContent="No session loaded.";
    return;
  }
  if($("deckSessionLabel"))$("deckSessionLabel").textContent=sessionLabel(session);
  if($("deckSessionTitle"))$("deckSessionTitle").textContent=session.title;
  if($("deckSystem"))$("deckSystem").textContent=session.primary_system||"—";
  if($("deckTechnical"))$("deckTechnical").textContent=session.technical_focus||"—";
  if($("deckCueChips"))$("deckCueChips").innerHTML=[`<span class="chip">${escapeHtml(session.venue||"")}</span>`,...sessionSquads(session).map(s=>`<span class="chip">${escapeHtml(s)}</span>`),`<span class="chip">${Number(session.planned_distance||0).toLocaleString()}m</span>`].join("");
  if($("deckWorkout"))$("deckWorkout").textContent=session.workout||"No workout entered.";
  v361RenderDeckBlocksFinal?.();
  v371RenderComposerProgress?.();
  v310EnsureAttendancePanel?.();
  v310RenderSessionAttendance?.();
  v3101InjectSessionDictation?.();
  v3102PlaceDictation?.();
  v3103CompactDeck?.();

  // Swimmer PB/adaptation/reference work is deliberately deferred until after the
  // Board is visible. Hidden adaptation panels are not rebuilt during navigation.
  v3104AfterPaint(()=>{
    try{
      populateAthleteSelect("deckAthlete",false);
      const details=$("deckAthleteQuickDetails");if(details?.open)renderDeckAthleteBrief();
      v390EnsureDeckPanel?.();v390DeckPanel?.();v3103InjectActiveReference?.();
      const panel=$("adaptationPanel");
      if(panel&&!panel.classList.contains("v3103-adaptation-collapsed")){v37RenderAdaptationPanel?.();v371RenderLearningSupport?.()}
    }catch(error){console.warn("Deferred Deck details",error)}
  });
}

// Replace the many accumulated navigation wrappers with one targeted dispatcher.
// This avoids rebuilding every hidden panel whenever the coach taps Board.
renderView=function(id){
  renderMode();renderActiveContext();
  if(id==="deck"){v3104RenderDeckEssential();return}
  if(id==="overview"){renderSessionPicker();renderOverview();return}
  if(id==="attendance"){renderAttendance();return}
  if(id==="capture"){populateAthleteSelect("captureAthlete",true);renderCaptures();v3101InjectHealth?.();v3101RenderHealth?.();v3102BindCaptureChoices?.();return}
  if(id==="finish"){renderReview();return}
  if(id==="times"){populateAthleteSelect("timeAthlete",false);renderPaceReference();renderTimedSets();renderStopwatchLaps();renderManualTimes();renderLiveBoard();return}
  if(id==="sessions"){renderSessions();v3PopulatePlanSelects?.();return}
  if(id==="planning"){renderPlanning();return}
  if(id==="testsets"){renderTestSets();return}
  if(id==="athletes"){renderAthletes();v3104AfterPaint(()=>v3103HydrateResults({all:false,render:false,force:true}).then(()=>{if(document.querySelector('.view.active')?.id==="athletes")renderAthletes()}));return}
  if(id==="results"){renderResults();v3104AfterPaint(()=>v3103HydrateResults({all:true,render:false,force:true}).then(()=>{if(document.querySelector('.view.active')?.id==="results")renderResults()}));return}
  if(id==="resultsupdate"){renderResultsUpdate();v3104AfterPaint(()=>v3103HydrateResults({all:true,render:false,force:true}).then(()=>{if(document.querySelector('.view.active')?.id==="resultsupdate")renderResultsUpdate()}));return}
  if(id==="reports"){renderReports();return}
  if(id==="settings"){loadSettings();return}
  if(id==="coaches"){v381RenderCoachPortal?.();return}
  if(id==="coachhub"){v390RenderCoachHub?.();return}
};
showView=function(id){
  if(typeof v381AllowedView==="function"&&!v381AllowedView(id))id=v381AllowedView("deck")?"deck":"settings";
  document.querySelectorAll(".view").forEach(view=>view.classList.toggle("active",view.id===id));
  document.querySelectorAll(".nav-button").forEach(button=>button.classList.toggle("active",button.dataset.view===id));
  window.scrollTo({top:0,behavior:"auto"});
  const started=performance.now();renderView(id);
  v3103ApplyBrand?.();v3103RenderCloudStatus?.();v381ApplyAccess?.();
  const elapsed=performance.now()-started;if(elapsed>700)console.warn(`Slow view render ${id}: ${elapsed.toFixed(0)} ms`);
};
renderAll=function(){renderView(document.querySelector('.view.active')?.id||"deck");v3103ApplyBrand?.();v3103RenderCloudStatus?.();v381ApplyAccess?.()};

// Hidden modified-swimmer content is rendered only when deliberately opened.
document.addEventListener("click",event=>{
  const toggle=event.target.closest(".v3103-adaptation-toggle");if(!toggle)return;
  const panel=$("adaptationPanel");if(!panel||panel.classList.contains("v3103-adaptation-collapsed"))return;
  toggle.disabled=true;toggle.textContent="Loading modified swimmers…";
  v3104AfterPaint(()=>{try{v37RenderAdaptationPanel?.();v371RenderLearningSupport?.()}finally{toggle.disabled=false;toggle.textContent="Close modified swimmers"}});
},true);

// Non-competitive/Fitness members do not receive false standards warnings.
const v3104RenderResultsBase=renderResults;
renderResults=function(){
  v3104RenderResultsBase();
  const athlete=appState.athletes.find(a=>a.id===(appState.settings.selected_athlete_id||$("resultsAthlete")?.value));
  const summary=$("resultsAthleteSummary");if(summary&&athlete){summary.querySelectorAll('.source-warning').forEach(n=>n.remove());summary.insertAdjacentHTML('afterbegin',v3104DemographicMessage(athlete))}
  if(athlete&&!v3104StandardsEligible(athlete)){
    if($("resultsNzscGaps"))$("resultsNzscGaps").innerHTML='<div class="result">No competitive standard target required for this member.</div>';
    if($("resultsTargetGaps"))$("resultsTargetGaps").innerHTML='<div class="result">T400 and coaching progress remain available without competition targets.</div>';
  }
};

// Correctly map the new what_changed structured field while retaining verbatim
// raw text as the fallback for a single Finish question.
const v3104ApplyFinishBase=v35ApplyFinishTranscript;
v35ApplyFinishTranscript=function(tr){
  v3104ApplyFinishBase(tr);
  const value=tr?.structured_data?.finish_session?.what_changed;
  if(value&&$("reviewWhatChanged"))$("reviewWhatChanged").value=v34AppendText($("reviewWhatChanged").value,value);
};

// Cloud work remains automatic, but never forces a screen render.
syncIfPossible=async function(){v3103ScheduleBackgroundSync(650,false);return true};
syncNow=async function(){await v3103BackgroundSync({pull:"full"});return true};

function v3104ApplyBrand(){
  document.title=`McLay Swimming OS — v${V3104_VERSION} Phone Recovery`;
  const subtitle=document.querySelector('.header-subtitle');if(subtitle)subtitle.textContent=`Version ${V3104_VERSION} · fast Board · automatic cloud · verified voice transcript · roster + PB recovery`;
}
const v3104BrandBase=v3103ApplyBrand;
v3103ApplyBrand=function(){v3104BrandBase();v3104ApplyBrand()};
v3104ApplyBrand();
