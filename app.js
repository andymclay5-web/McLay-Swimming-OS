
"use strict";

const CONFIG_KEY = "mclay_swimming_v1_cloud_config";
const STATE_KEY = "mclay_swimming_os_v1";
const TOKEN_KEY = "mclay_swimming_v1_auth";
const DB_NAME = "mclay_swimming_v1_media";
const MEDIA_STORE = "media";
const CLOUD_TABLES = ["athletes","sessions","attendance","captures","timed_sets","session_reviews","season_plans","weekly_plans","session_lane_assignments","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases"];
const RESULT_VIEWS = [
  "results_athlete_overview",
  "results_pb_board",
  "results_event_history",
  "nzsc_2026_gap_matrix",
  "scwc_target_gap_matrix",
  "results_record_gaps"
];

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
for(const key of ["athletes","sessions","attendance","captures","timed_sets","session_reviews","season_plans","weekly_plans","session_lane_assignments","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases","pathway_standards","pathway_meets","pending",...RESULT_VIEWS]){
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
  document.querySelectorAll(".attendance-choice").forEach(button=>button.onclick=()=>{const row=button.closest(".attendance-row"),group=button.closest(".attendance-buttons"),already=button.classList.contains("active"),status=already?"absent":button.dataset.status;group.querySelectorAll(".attendance-choice").forEach(b=>b.classList.toggle("active",!already&&b===button));row.classList.toggle("unmarked",status==="absent");const label=group.querySelector(".attendance-default");if(label)label.textContent=status==="absent"?"Absent":"";attendanceRecord(session,row.dataset.athleteId,status);renderOverview()});
}
function setActiveRosterAttendance(status){const session=selectedSession();if(!session)return;for(const athlete of selectedRoster())attendanceRecord(session,athlete.id,status);renderAttendance();renderOverview();updateStatus(status==="present"?"Active squad marked here":"Active squad cleared","good")}
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
function timingRoster(){const session=selectedSession(),roster=selectedRoster();const marked=appState.attendance.filter(a=>a.session_id===session?.id&&roster.some(r=>r.id===a.athlete_id));const here=new Set(marked.filter(a=>a.status==="present"||a.status==="modified").map(a=>a.athlete_id));return here.size?roster.filter(a=>here.has(a.id)):roster}
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
$("newSessionBtn").addEventListener("click",()=>fillSessionEditor(null));
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
  if(table==="captures") return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,capture_type:base.capture_type,text_content:base.text_content,media_path:base.media_path,mime_type:base.mime_type,created_at:base.created_at,updated_at:base.updated_at,created_by:user};
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
  for(const table of CLOUD_TABLES) queueWholeTable(table);
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
// McLay Swimming OS v3 — complete results, planning, lane timing and test sets
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
function v3Pathway(athlete,pb){if(!pb)return {achieved:[],next:null};const achieved=[];let next=null;for(const stage of v3TargetStages(athlete,pb)){if(!stage.targetSeconds)continue;const met=Number(pb.result_seconds)<=stage.targetSeconds;let label=stage.name;if(stage.name==="Division II"&&stage.ceilingSeconds&&Number(pb.result_seconds)<=stage.ceilingSeconds)label="Div II outgrown";if(met)achieved.push(label);else if(!next)next={...stage,gap:Number(pb.result_seconds)-stage.targetSeconds}}return {achieved:[...new Set(achieved)],next}}
function v3PathwayHtml(athlete,pb){if(!pb)return '<span class="pathway-missing">No PB</span>';const p=v3Pathway(athlete,pb);const done=p.achieved.map(x=>`<span class="pathway-achieved">${escapeHtml(x)} ✓</span>`).join("");const next=p.next?`<span class="pathway-next">Next <strong>${escapeHtml(p.next.name)}</strong> ${escapeHtml(p.next.target)} · ${p.next.gap.toFixed(2)}s</span>`:'<span class="pathway-next"><strong>Top loaded progression achieved</strong></span>';return `<div class="pathway-compact">${done}${next}</div>`}
function v3PbCell(athlete,pb){if(!pb)return '<span class="pathway-missing">—</span>';const points=v3Points(pb);return `<div class="pb-course-block"><div class="pb-time-line"><strong>${escapeHtml(pb.result_time_text||v3Time(pb.result_seconds))}</strong>${points?`<span class="points-badge">${points} pts</span>`:""}</div><div class="pb-meta">${escapeHtml(pb.meet_name||"PB")}${pb.result_date?` · ${escapeHtml(resultDateLabel(pb.result_date))}`:""}</div>${v3PathwayHtml(athlete,pb)}</div>`}
function v3GroupedPbRows(athlete){const groups=groupedAthletePbs(athlete);return groups.length?groups.map(g=>`<tr><td class="pb-event-cell"><strong>${g.distance} ${escapeHtml(g.stroke.replace("stroke",""))}</strong></td><td>${v3PbCell(athlete,g.LCM)}</td><td>${v3PbCell(athlete,g.SCM)}</td><td>${g.bestPoints?`<span class="points-badge">${g.bestPoints}</span>`:"—"}</td></tr>`).join(""):'<tr><td colspan="4">No PBs loaded for this swimmer.</td></tr>'}
function compactRaceRows(rows,empty){return rows.length?rows.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.result_time_text||r.pb_time||"—")}</strong><span>${escapeHtml(r.meet_name||r.programme||"")}${r.result_date?` · ${escapeHtml(resultDateLabel(r.result_date))}`:""}${r.official_place?` · place ${escapeHtml(r.official_place)}`:""}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`}
function compactGapRows(rows,empty){return rows.length?rows.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.distance)} ${escapeHtml(r.stroke)} · ${escapeHtml(r.pb_time||"—")}</strong><span>${escapeHtml(r.programme||r.age_group||r.para_class||"")} · ${Number(r.gap_seconds)<=0?`met by ${Math.abs(Number(r.gap_seconds)).toFixed(2)}s`:`needs ${Number(r.gap_seconds).toFixed(2)}s`}</span></div>`).join(""):`<div class="help">${escapeHtml(empty)}</div>`}
function compactRecordRows(athlete){const rows=athleteRecordRows(athlete);return rows.length?rows.map(r=>`<div class="mini-result"><strong>${escapeHtml(r.record_scope||r.programme||"Record")} · ${escapeHtml(r.distance)} ${escapeHtml(r.stroke)}</strong><span>PB ${escapeHtml(r.pb_time||"—")} · record ${escapeHtml(r.record_time_text||r.record_time||"—")}${r.gap_seconds!==undefined?` · ${Number(r.gap_seconds)<=0?"record matched/better":`${Number(r.gap_seconds).toFixed(2)}s away`}`:""}</span></div>`).join(""):'<div class="help">No matching record rows loaded yet.</div>'}
function renderAthleteResultsHub(athlete){const hub=$("athleteResultsHub");if(!hub||!athlete)return;$("athleteResultsHubTitle").textContent=`${athlete.full_name} · complete PBs and progression`;const cant=athleteCwscHistory(athlete.id),si=athleteSouthIslandHistory(athlete.id),nationals=athleteNationalHistory(athlete.id);hub.innerHTML=`<div class="athlete-hub-grid"><section class="athlete-hub-section complete-pbs"><h4>All PBs · LC and SC grouped</h4><div class="complete-results-note">Ordered by World Para points or WA points where available. Every PB remains visible.</div><div class="table-wrap"><table class="pb-complete-table"><thead><tr><th>Event</th><th>Long course PB + progression</th><th>Short course PB + progression</th><th>Points</th></tr></thead><tbody>${v3GroupedPbRows(athlete)}</tbody></table></div></section><section class="athlete-hub-section"><h4>Canterbury championships</h4>${compactRaceRows(cant,"No Canterbury championship results loaded.")}</section><section class="athlete-hub-section"><h4>South Island championships</h4>${compactRaceRows(si,"No South Island championship results loaded.")}</section><section class="athlete-hub-section"><h4>National championships</h4>${compactRaceRows(nationals,"No national championship results loaded.")}</section><section class="athlete-hub-section"><h4>Records</h4>${compactRecordRows(athlete)}</section></div>`}
function renderResults(){const athletes=appState.athletes.slice().sort((a,b)=>a.full_name.localeCompare(b.full_name));const selectedId=$("resultsAthlete")?.value||appState.settings.selected_athlete_id||athletes[0]?.id;const athlete=athletes.find(a=>a.id===selectedId)||athletes[0];if(!athlete)return;appState.settings.selected_athlete_id=athlete.id;saveState(appState);$("resultsAthlete").innerHTML=athletes.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===athlete.id?"selected":""}>${escapeHtml(a.full_name)} — ${escapeHtml(a.squad)}</option>`).join("");const pbs=athleteOfficialPbs(athlete.id),history=athleteHistory(athlete.id),overview=athleteResultOverview(athlete.id);$("resultsKpiAthletes").textContent=new Set([...(appState.results_pb_board||[]),...(appState.coach_results||[])].map(r=>r.athlete_id).filter(Boolean)).size;$("resultsKpiPbs").textContent=appState.athletes.reduce((n,a)=>n+athleteOfficialPbs(a.id).length,0);$("resultsKpiQualified").textContent=(appState.pathway_standards||[]).length;$("resultsKpiTargets").textContent=(appState.results_record_gaps||[]).length;const classes=[athlete.current_s_class,athlete.current_sb_class,athlete.current_sm_class].filter(Boolean).join(" / "),demographicWarning=!athlete.sex||!athlete.date_of_birth?'<div class="source-warning">Set sex and date of birth in the coach profile to calculate age-group qualifying progressions accurately.</div>':"";$("resultsAthleteSummary").innerHTML=`${demographicWarning}<div class="deck-answer-row"><span>Squad</span><strong>${escapeHtml(athlete.squad||"Unassigned")}</strong></div>${classes?`<div class="deck-answer-row"><span>Classification</span><strong>${escapeHtml(classes)}</strong></div>`:""}<div class="deck-answer-row"><span>PB course-events</span><strong>${pbs.length}</strong></div><div class="deck-answer-row"><span>Complete race rows</span><strong>${history.length}</strong></div><div class="deck-answer-row"><span>Latest meet</span><strong>${escapeHtml(overview?.latest_meet||history[0]?.meet_name||"No result loaded")}</strong></div>`;$("resultsPbBody").innerHTML=v3GroupedPbRows(athlete);const grouped=groupedAthletePbs(athlete);const nextRows=[];for(const g of grouped){for(const pb of [g.LCM,g.SCM].filter(Boolean)){const p=v3Pathway(athlete,pb);if(p.next)nextRows.push({title:`${pb.course} ${g.distance} ${g.stroke} · PB ${pb.result_time_text}`,meta:`Next ${p.next.name} ${p.next.target} · ${p.next.gap.toFixed(2)}s`})}}$("resultsNzscGaps").innerHTML=resultRowsHtml(nextRows,"No next standards available.");const targetRows=athleteTargetRows(athlete);$("resultsTargetGaps").innerHTML=compactGapRows(targetRows,"No Canterbury squad target rows.");$("resultsCwscSummary").innerHTML=compactRaceRows([...athleteCwscHistory(athlete.id),...athleteSouthIslandHistory(athlete.id)],"No regional championship results loaded.");$("resultsNationalsSummary").innerHTML=compactRaceRows(athleteNationalHistory(athlete.id),"No national-meet results loaded.");$("resultsRecordsSummary").innerHTML=compactRecordRows(athlete);renderAthleteResultsHub(athlete);$("resultsHistoryBody").innerHTML=history.length?history.map(row=>`<tr><td>${resultDateLabel(row.result_date)}</td><td>${escapeHtml(row.meet_name||"—")}</td><td>${escapeHtml(row.course||"—")}</td><td>${row.distance} ${escapeHtml(row.stroke)}</td><td>${escapeHtml(row.round||"—")}</td><td><strong>${escapeHtml(row.result_time_text)}</strong></td><td>${row.official_place??"—"}</td></tr>`).join(""):'<tr><td colspan="7">No race history loaded.</td></tr>';const wrap=$("resultsHistoryBody")?.closest(".table-wrap");if(wrap)wrap.classList.add("full-history-table")}

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
function cloudRow(table,record){const org=appState.settings.organisation_id,user=getAuth()?.user?.id,base={...record,organisation_id:org,created_by:user};if(table==="athletes")return {id:base.id,organisation_id:org,full_name:base.full_name,squad:base.squad,active:base.active,legacy_pace:base.legacy_pace,date_of_birth:base.date_of_birth,primary_events:base.primary_events||[],current_focus:base.current_focus,technical_focus:base.technical_focus,modifications:base.modifications,coach_notes:base.coach_notes,next_meet_name:base.next_meet_name,next_meet_date:base.next_meet_date,next_meet_venue:base.next_meet_venue,pb_summary:base.pb_summary||[],qualifying_summary:base.qualifying_summary||[],records_summary:base.records_summary||[],training_lane:base.training_lane||null,timing_order:base.timing_order||null,sex:base.sex||null,current_s_class:base.current_s_class||null,current_sb_class:base.current_sb_class||null,current_sm_class:base.current_sm_class||null,updated_at:base.updated_at,created_by:user};if(table==="sessions")return {id:base.id,organisation_id:org,session_date:base.session_date,day_part:base.day_part,venue:base.venue,title:base.title,squads:base.squads,planned_distance:base.planned_distance,primary_system:base.primary_system,technical_focus:base.technical_focus,plan_cue:base.plan_cue,next_session_cue:base.next_session_cue,season_name:base.season_name||null,week_start:base.week_start||null,week_phase:base.week_phase||null,week_objective:base.week_objective||null,week_carry_forward:base.week_carry_forward||null,season_plan_id:base.season_plan_id||null,weekly_plan_id:base.weekly_plan_id||null,lane_count:base.lane_count||1,pool_course:base.pool_course||"SCM",workout:base.workout,sets:base.sets||[],step_number:base.step_number,previous_session_id:base.previous_session_id,status:base.status,updated_at:base.updated_at,created_by:user};if(table==="attendance")return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,status:base.status,note:base.note,updated_at:base.updated_at,created_by:user};if(table==="captures")return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,capture_type:base.capture_type,text_content:base.text_content,media_path:base.media_path,mime_type:base.mime_type,created_at:base.created_at,updated_at:base.updated_at,created_by:user};if(table==="timed_sets")return {id:base.id,organisation_id:org,session_id:base.session_id,athlete_id:base.athlete_id,distance:base.distance,stroke:base.stroke,set_label:base.set_label,send_off:base.send_off,times:base.times,average:base.average,best:base.best,spread:base.spread,lane_number:base.lane_number||null,test_set_id:base.test_set_id||null,test_set_attempt_id:base.test_set_attempt_id||null,created_at:base.created_at,updated_at:base.updated_at,created_by:user};if(table==="session_reviews")return {id:base.id,organisation_id:org,session_id:base.session_id,went_well:base.went_well,reinforce:base.reinforce,athlete_notes:base.athlete_notes,carry_forward:base.carry_forward,actual_distance:base.actual_distance||0,actual_duration:base.actual_duration||0,energy_systems:base.energy_systems||{},training_modes:base.training_modes||{},stroke_exposure:base.stroke_exposure||{},athlete_response:base.athlete_response,modifications:base.modifications,race_split_evidence:base.race_split_evidence,completed_at:base.completed_at,updated_at:base.updated_at,created_by:user};if(["season_plans","weekly_plans","session_lane_assignments","test_sets","test_set_attempts","coach_result_imports","coach_results","coach_result_aliases"].includes(table)){const clean={...base};delete clean.use;delete clean.status;return clean}return base}
async function pullCloud(){if(!cloudReady())return;const org=appState.settings.organisation_id;for(const table of CLOUD_TABLES){try{const rows=await cloudFetch(`/rest/v1/${table}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);appState[table]=mergeCollection(appState[table]||[],rows)}catch(error){console.warn(`Optional v3 table ${table} not available`,error);if(!Array.isArray(appState[table]))appState[table]=[]}}for(const view of RESULT_VIEWS){try{const rows=await cloudFetch(`/rest/v1/${view}?select=*&organisation_id=eq.${encodeURIComponent(org)}`);appState[view]=rows.map(stripCloudFields)}catch(error){console.warn(`Optional result source ${view} not available`,error);if(!Array.isArray(appState[view]))appState[view]=[]}}for(const table of ["pathway_standards","pathway_meets"]){try{appState[table]=await cloudFetch(`/rest/v1/${table}?select=*&${table==="pathway_standards"?"active=eq.true&":""}order=progression_order.asc`)}catch(error){console.warn(`Pathway source ${table} unavailable`,error);if(!Array.isArray(appState[table]))appState[table]=[]}}saveState(appState)}

function renderDeck(){const session=selectedSession();const deckPicker=$("deckSessionPicker");if(deckPicker){const sessions=appState.sessions.slice().sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`));deckPicker.innerHTML=sessions.map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===session?.id?"selected":""}>${escapeHtml(sessionLabel(s))} — ${escapeHtml(s.title)}</option>`).join("");deckPicker.onchange=()=>setSelectedSession(deckPicker.value)}if(!session){$("deckSessionLabel").textContent="No session selected";$("deckSessionTitle").textContent="Choose or create the actual session";$("deckWorkout").textContent="No session loaded.";return}$("deckSessionLabel").textContent=sessionLabel(session);$("deckSessionTitle").textContent=session.title;$("deckSystem").textContent=session.primary_system||"—";$("deckTechnical").textContent=session.technical_focus||"—";$("deckCueChips").innerHTML=[`<span class="chip">${escapeHtml(session.venue||"")}</span>`,...sessionSquads(session).map(s=>`<span class="chip">${escapeHtml(s)}</span>`),`<span class="chip">${Number(session.planned_distance||0).toLocaleString()}m</span>`,`<span class="chip">${Number(session.lane_count||1)} lane${Number(session.lane_count||1)===1?"":"s"}</span>`].join("");$("deckWorkout").textContent=session.workout||"No workout entered.";const sets=session.sets?.length?session.sets:extractStructuredSets(session.workout);$("deckSetList").innerHTML=sets.length?sets.map((set,index)=>`<div class="deck-set-row"><div><strong>${escapeHtml(set.label||`${set.reps} × ${set.distance}`)}</strong><small>${set.reps} × ${set.distance} · ${escapeHtml(set.stroke||"")}${set.cycle?` · on ${escapeHtml(set.cycle)}`:""}</small></div><button type="button" data-run-set="${index}">Run live</button></div>`).join(""):'<div class="help">No repeating sets detected.</div>';document.querySelectorAll("[data-run-set]").forEach(btn=>btn.onclick=()=>runStructuredSet(sets[Number(btn.dataset.runSet)]));const {season,week}=v3SessionPlan(session),previous=appState.sessions.find(s=>s.id===session.previous_session_id)||appState.sessions.filter(s=>`${s.session_date}-${s.day_part}`<`${session.session_date}-${session.day_part}`).sort((a,b)=>`${b.session_date}-${b.day_part}`.localeCompare(`${a.session_date}-${a.day_part}`))[0],previousReview=previous?sessionReview(previous.id):null,next=nextPlannedSession(session);$("deckPlanThread").innerHTML=`<div class="plan-chain"><div class="plan-chain-row"><span>Season</span><strong>${escapeHtml(season?.name||session.season_name||"Season not linked")}</strong></div><div class="plan-chain-row"><span>Week${week?.week_start?` · ${escapeHtml(formatDate(week.week_start))}`:session.week_start?` · ${escapeHtml(formatDate(session.week_start))}`:""}</span><strong>${escapeHtml(week?.phase||session.week_phase||"Weekly plan not linked")}</strong></div><div class="plan-chain-row"><span>Weekly objective</span><strong>${escapeHtml(week?.objective||session.week_objective||"Not entered")}</strong></div>${week?.carry_forward||session.week_carry_forward?`<div class="plan-chain-row"><span>Carry from last week</span><strong>${escapeHtml(week?.carry_forward||session.week_carry_forward)}</strong></div>`:""}</div><div class="plan-thread-row"><span>Carry from last session</span><strong>${escapeHtml(previousReview?.carry_forward||session.plan_cue||"No carry-forward logged yet.")}</strong></div><div class="plan-thread-row"><span>Today’s purpose</span><strong>${escapeHtml(session.primary_system||"—")} · ${escapeHtml(session.technical_focus||"—")}</strong></div><div class="plan-thread-row"><span>Lead into next session</span><strong>${escapeHtml(session.next_session_cue||next?.technical_focus||next?.title||"Next-session cue not entered yet.")}</strong></div>`;$("deckNextSession").innerHTML=next?`<strong>${escapeHtml(sessionLabel(next))} — ${escapeHtml(next.title)}</strong><div>${escapeHtml(next.primary_system||"")}</div>`:'<div class="warning-box">No later session entered yet.</div>'}

function renderAll(){renderMode();renderSessionPicker();renderActiveContext();renderOverview();renderDeck();renderSessionImportPreview();renderAttendance();populateAthleteSelect("captureAthlete",true);populateAthleteSelect("timeAthlete",false);populateAthleteSelect("deckAthlete",false);if($("deckAthlete")){$("deckAthlete").onchange=renderDeckAthleteBrief;renderDeckAthleteBrief()}renderReview();renderCaptures();renderPaceReference();renderTimedSets();renderStopwatchLaps();renderManualTimes();renderSessions();renderPlanning();renderTestSets();renderAthletes();renderResults();renderResultsUpdate();renderReports();loadSettings();v3PopulatePlanSelects();v3PopulateTestSetSelect();if($("liveLaneCount"))$("liveLaneCount").value=selectedSession()?.lane_count||1;renderLiveBoard()}

// v3 UI bindings
if($("newSeasonBtn"))$("newSeasonBtn").addEventListener("click",()=>fillSeasonEditor(null));if($("saveSeasonBtn"))$("saveSeasonBtn").addEventListener("click",v3SaveSeason);if($("deleteSeasonBtn"))$("deleteSeasonBtn").addEventListener("click",()=>v3DeletePlan("season_plans",$("seasonPlanId").value));if($("newWeekBtn"))$("newWeekBtn").addEventListener("click",()=>fillWeekEditor(null));if($("saveWeekBtn"))$("saveWeekBtn").addEventListener("click",v3SaveWeek);if($("deleteWeekBtn"))$("deleteWeekBtn").addEventListener("click",()=>v3DeletePlan("weekly_plans",$("weeklyPlanId").value));if($("editSessionSeasonPlan"))$("editSessionSeasonPlan").addEventListener("change",v3ApplySessionSeasonLink);if($("editSessionWeeklyPlan"))$("editSessionWeeklyPlan").addEventListener("change",v3ApplySessionWeekLink);
if($("liveLaneCount"))$("liveLaneCount").addEventListener("change",()=>{const s=selectedSession();if(!s)return;s.lane_count=Math.max(1,Math.min(12,Number($("liveLaneCount").value)||1));queueRecord("sessions",s.id);saveState(appState);resetLiveRoster();renderLiveBoard()});if($("liveWaveGap"))$("liveWaveGap").addEventListener("change",()=>{applyLaneOffsets(Number($("liveWaveGap").value)||0);if($("liveChannelGrid"))$("liveChannelGrid").dataset.rosterKey="";renderLiveBoard()});
if($("newTestSetBtn"))$("newTestSetBtn").addEventListener("click",()=>fillTestSetEditor(null));if($("saveTestSetBtn"))$("saveTestSetBtn").addEventListener("click",v3SaveTestSet);if($("duplicateTestSetBtn"))$("duplicateTestSetBtn").addEventListener("click",v3DuplicateTestSet);if($("archiveTestSetBtn"))$("archiveTestSetBtn").addEventListener("click",async()=>{const t=appState.test_sets.find(x=>x.id===$("testSetId").value);if(!t)return;t.active=false;t.updated_at=nowIso();queueRecord("test_sets",t.id);saveState(appState);await syncIfPossible();renderAll()});if($("loadTestSetTimingBtn"))$("loadTestSetTimingBtn").addEventListener("click",()=>v3LoadTestSet());if($("liveTestSet"))$("liveTestSet").addEventListener("change",()=>{const t=appState.test_sets.find(x=>x.id===$("liveTestSet").value);if(t)v3LoadTestSet(t)});
if($("saveManualResultBtn"))$("saveManualResultBtn").addEventListener("click",v3SaveManualResult);if($("parseResultsFileBtn"))$("parseResultsFileBtn").addEventListener("click",v3ParseResultsFile);if($("clearResultsPreviewBtn"))$("clearResultsPreviewBtn").addEventListener("click",()=>{resultImportPreview=[];resultImportFileName="";renderResultImportPreview()});if($("commitResultsImportBtn"))$("commitResultsImportBtn").addEventListener("click",v3CommitImport);

const savedSession=appState.sessions.find(s=>s.id===appState.settings.selected_session_id);if(!savedSession&&appState.sessions.length){const today=localIsoDate(new Date()),fallback=appState.sessions.slice().sort((a,b)=>Math.abs(new Date(`${a.session_date}T12:00:00`)-new Date(`${today}T12:00:00`))-Math.abs(new Date(`${b.session_date}T12:00:00`)-new Date(`${today}T12:00:00`))||String(b.updated_at||"").localeCompare(String(a.updated_at||"")))[0];appState.settings.selected_session_id=fallback.id;appState.settings.selected_squad=sessionSquads(fallback)[0]||"";saveState(appState)}else if(savedSession&&!sessionSquads(savedSession).some(s=>squadKey(s)===squadKey(appState.settings.selected_squad))){appState.settings.selected_squad=sessionSquads(savedSession)[0]||"";saveState(appState)}
bindLiveSet();
if($("finishSessionBtn"))$("finishSessionBtn").addEventListener("click",saveFinishSession);
renderAll();
fillSessionEditor(selectedSession());
if(window.matchMedia("(max-width: 980px)").matches) showView("deck");
readSharedText();
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
if(cloudReady()) syncIfPossible();