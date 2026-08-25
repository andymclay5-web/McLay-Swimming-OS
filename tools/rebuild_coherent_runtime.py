from pathlib import Path
import re, subprocess

BASE='2d5b278470cf65c252e6a2f15453864b8a26006f'

def show(ref,path):
    return subprocess.check_output(['git','show',f'{ref}:{path}'],text=True)

def require_count(s,needle,n=1,label=None):
    c=s.count(needle)
    if c!=n: raise SystemExit(f'{label or needle}: expected {n}, got {c}')

# Start contaminated monolith/helper files from the known physical legacy-Board cleanup.
Path('app.js').write_text(show(BASE,'app.js'))
Path('v4-poolside-core.js').write_text(show(BASE,'v4-poolside-core.js'))

# app.js: primitives/scaffolding only; no competing final presentation/domain owners.
p=Path('app.js'); s=p.read_text()
require_count(s,' P.parse=(source,identity={})=>{',label='primitive parser owner')
s=s.replace(' P.parse=(source,identity={})=>{',' P.primitiveParse=(source,identity={})=>{',1)
blank="const original=rawLines[li],line=U.text(original),indent=lineIndent(original);if(!line){currentGroup=null;current=null;groupIndented=false;continue}"
require_count(s,blank,label='round blank-line boundary')
s=s.replace(blank,"const original=rawLines[li],line=U.text(original),indent=lineIndent(original);if(!line){current=null;continue}",1)
require_count(s,' Store.save=s=>',label='bootstrap save')
s=s.replace(' Store.save=s=>',' Store.bootstrapSave=s=>',1)
marker=" Store.session=(state,id=state.settings.selectedSessionId)=>state.canonicalSessions?.[id]||null;"
require_count(s,marker,label='store session marker')
s=s.replace(marker," Store.save=Store.bootstrapSave;\n"+marker,1)
for old,new in [(' A.profile=(athlete,state)=>',' A.legacyProfile=(athlete,state)=>'),(' A.item=(item,athlete,state,session=null)=>',' A.legacyItem=(item,athlete,state,session=null)=>'),(' A.session=(session,athlete,state)=>',' A.legacySession=(session,athlete,state)=>')]:
    require_count(s,old,label='legacy adaptation '+old)
    s=s.replace(old,new,1)
s=s.replace('A.item(y,athlete,state,session)','A.legacyItem(y,athlete,state,session)')
s=s.replace('const profile=A.profile(athlete,state)','const profile=A.legacyProfile(athlete,state)')
s=s.replace('A.item(i,athlete,state,session)','A.legacyItem(i,athlete,state,session)')
require_count(s,' G.run=()=>{',label='foundation guardian')
s=s.replace(' G.run=()=>{',' G.foundationRun=()=>{',1)
require_count(s,' X.saveT400=(athleteId,value,session=M.currentSession(),state=M.state,date=new Date().toISOString().slice(0,10))=>',label='core t400 save')
s=s.replace(' X.saveT400=(athleteId,value,session=M.currentSession(),state=M.state,date=new Date().toISOString().slice(0,10))=>',' X.coreSaveT400=(athleteId,value,session=M.currentSession(),state=M.state,date=new Date().toISOString().slice(0,10))=>',1)
# navigation scaffold: final navigation engine owns routing/history.
nav_start=s.find("(function(g){\n const M=g.MSOS4,UI=M.ui;\n const N=M.nav={};")
if nav_start<0: raise SystemExit('legacy navigation owner not found')
nav_end=s.find('})(globalThis);',nav_start)
if nav_end<0: raise SystemExit('legacy navigation end not found')
s=s[:nav_start]+"(function(g){g.MSOS4.nav=g.MSOS4.nav||{};})(globalThis);"+s[nav_end+len('})(globalThis);'):]
# selection truth: visible selection must equal actual canonical selection.
old="let s=M.currentSession();if(s&&!M.access.sessionAllowed(s)){s=allowed[0]||null;if(s)M.state.settings.selectedSessionId=s.id}const pick=document.querySelector('#sessionSelect');"
require_count(s,old,label='header selection repair')
new="let s=M.currentSession();if(!s){s=allowed[0]||null;M.state.settings.selectedSessionId=s?.id||''}else if(!M.access.sessionAllowed(s)){s=allowed[0]||null;M.state.settings.selectedSessionId=s?.id||''}const pick=document.querySelector('#sessionSelect');"
s=s.replace(old,new,1)
# Retire old final UI surfaces from the monolith by deleting their complete IIFEs.
def remove_iife_by_marker(src,marker,replacement):
    pos=src.find(marker)
    if pos<0: return src
    start=src.rfind('(function(g){',0,pos); end=src.find('})(globalThis);',pos)
    if start<0 or end<0: raise SystemExit(f'IIFE boundary missing for {marker}')
    return src[:start]+replacement+'\n'+src[end+len('})(globalThis);'):]
# Extract generic timing before deleting it.
old_app=show(BASE,'app.js'); pos=old_app.find(' let ticker=null;')
if pos<0: raise SystemExit('general timing owner missing')
start=old_app.rfind('(function(g){',0,pos); end=old_app.find('})(globalThis);',pos)
chunk=old_app[start:end+len('})(globalThis);')]
chunk=chunk.replace(" const M=g.MSOS4,U=M.util,UI=M.ui,X=M.timing;"," const M=g.MSOS4,U=M.util,UI=M.ui,X=M.timing,G=M.generalTimingUI={build:'v4-general-timing-ui-20260826'};")
require_count(chunk,' UI.renderTimes=()=>{',label='generic timing render')
chunk=chunk.replace(' UI.renderTimes=()=>{',' G.render=()=>{',1).replace('UI.renderTimes()','G.render()')
Path('engines/general-timing-ui.js').write_text("'use strict';\n"+chunk+'\n')
s=remove_iife_by_marker(s,' let ticker=null;','// General stopwatch UI is owned by engines/general-timing-ui.js.')
s=remove_iife_by_marker(s,' UI.renderAthletes=()=>','// Swimmer performance UI is owned by engines/swimmer-instant-open-cn.js.')
s=remove_iife_by_marker(s,' UI.renderHub=()=>','// Coach Hub UI is owned by the dedicated coach-hub engine.')
p.write_text(s)

# parser-semantics is sole public parser owner.
p=Path('engines/parser-semantics.js'); s=p.read_text()
require_count(s,'const primitive=P.parse.bind(P)',label='parser semantics primitive')
p.write_text(s.replace('const primitive=P.parse.bind(P)','const primitive=P.primitiveParse.bind(P)',1))

# poolside core keeps helper/data repair only, never parser/Board/TV ownership.
p=Path('v4-poolside-core.js'); s=p.read_text()
for pat,label in [(r'\n  const BASE_PARSE=M\.parser\.parse\.bind\(M\.parser\);','poolside BASE_PARSE'),(r'\n  M\.parser\.parse=\(source,identity=\{\}\)=>compactSession\(BASE_PARSE\(normaliseText\(source\),identity\)\);','poolside parser assignment')]:
    s,n=re.subn(pat,'',s,1)
    if n!=1: raise SystemExit(f'{label}: {n}')
p.write_text(s)

# storage is sole operational persistence owner and repairs invalid UI session identity.
p=Path('engines/storage.js'); s=p.read_text()
old="if(ui)for(const[k,v]of Object.entries(ui)){if(k==='savedAt'||v===undefined)continue;if(k==='selectedSessionId'&&opSavedAt>uiSavedAt)continue;state.settings[k]=v}state.settings.view='board';"
require_count(s,old,label='storage applyUi')
new="if(ui)for(const[k,v]of Object.entries(ui)){if(k==='savedAt'||v===undefined)continue;if(k==='selectedSessionId'){if(opSavedAt>uiSavedAt)continue;if(v&&!state.canonicalSessions?.[v])continue}state.settings[k]=v}if(state.settings.selectedSessionId&&!state.canonicalSessions?.[state.settings.selectedSessionId])state.settings.selectedSessionId='';if(!state.settings.selectedSessionId){const first=Object.values(state.canonicalSessions||{}).sort((a,b)=>`${b.identity?.date||''}-${b.identity?.dayPart||''}`.localeCompare(`${a.identity?.date||''}-${a.identity?.dayPart||''}`))[0];if(first)state.settings.selectedSessionId=first.id}M.rosterPolicy?.apply?.(state);state.settings.view='board';"
p.write_text(s.replace(old,new,1))

# Roster policy keeps production roster clean without deleting history.
Path('engines/roster-policy.js').write_text("""'use strict';
(function(g){
 const M=g.MSOS4;if(!M)return;
 const key=a=>String(a?.full_name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const historical=a=>key(a)==='sophienewlove';
 const fixture=a=>/^meet[ab]$/.test(key(a))&&!a?.date_of_birth&&!a?.dob;
 const P=M.rosterPolicy={build:'v4-roster-policy-20260826'};
 P.visible=a=>!!a&&a.active!==false&&!historical(a)&&!fixture(a);
 P.apply=(state=M.state)=>{if(!state)return false;let changed=false;const blocked=new Set();for(const a of state.athletes||[]){if(historical(a)||fixture(a)){blocked.add(a.id);if(a.active!==false){a.active=false;changed=true}}}const q=state.settings||{};if(Array.isArray(q.timingRoster)){const n=q.timingRoster.filter(id=>!blocked.has(id));if(n.length!==q.timingRoster.length){q.timingRoster=n;changed=true}}if(blocked.has(q.selectedAthleteId)){q.selectedAthleteId='';changed=true}if(blocked.has(q.selectedSwimmerId)){q.selectedSwimmerId='';changed=true}return changed};
 P.isHistorical=historical;P.isFixture=fixture;P.apply(M.state);
})(globalThis);
""")

# v4-correct: keep useful product helpers but remove wrapper-based authority theft.
p=Path('v4-correct.js'); s=p.read_text()
a=s.find('  // Run roster enforcement every time state is established, not only on first boot.'); b=s.find('  // ---------- Athlete modification parity ----------',a)
if a<0 or b<0: raise SystemExit('v4-correct ensure wrapper region missing')
s=s[:a]+"  // Roster/state policy is owned by engines/roster-policy.js and storage hydration.\n\n"+s[b:]
a=s.find('  if(M.adapt){',s.find('// ---------- Athlete modification parity ----------')); b=s.find('\n\n\n  C.ACTIVE_MODIFICATION_DEFAULTS',a)
if a<0 or b<0: raise SystemExit('v4-correct adapt wrapper region missing')
s=s[:a]+"  // Public adaptation truth is owned by engines/modification.js through engines/bridge.js.\n"+s[b:]
a=s.find('  // ---------- Install UI wrappers ----------'); b=s.find('\n\n  // Keep selected session/view/swimmer as local truth during live updates.',a)
if a<0 or b<0: raise SystemExit('v4-correct UI wrapper region missing')
direct="""  // ---------- Dedicated Coach Hub / Times presentation owners ----------
  if(M.ui){
    C.renderCoachHub=renderCoachHub;
    C.renderTimes=renderTimes;
    M.ui.renderHub=renderCoachHub;
    M.ui.renderTimes=renderTimes;
  }
"""
s=s[:a]+direct+s[b:]
a=s.find('  // Keep selected session/view/swimmer as local truth during live updates.'); b=s.find('\n\n\n  // ---------- Guardian:',a)
if a<0 or b<0: raise SystemExit('v4-correct live wrapper region missing')
s=s[:a]+"  // Live replication ownership remains in its dedicated runtime.\n"+s[b:]
a=s.find('  // ---------- Guardian: retire only superseded expectations'); b=s.find('\n\n  // ---------- Boot',a)
if a<0 or b<0: raise SystemExit('v4-correct Guardian wrapper region missing')
s=s[:a]+"  // Guardian execution ownership is engines/guardian-runtime.js.\n"+s[b:]
s=s.replace("if(M.state.settings.v4TimingMode==='general'&&C.baseRenderTimes){\n      C.baseRenderTimes();","if(M.state.settings.v4TimingMode==='general'&&M.generalTimingUI?.render){\n      M.generalTimingUI.render();")
p.write_text(s)

# T400 capture consumes an explicit primitive rather than wrapping a public owner.
p=Path('engines/t400-capture.js'); s=p.read_text()
old="if(!M?.timing?.saveT400||!E?.Aerobic||!E?.Evidence)return;const C=M.t400Capture={build:'v4-t400-capture-20260820r'};const base=M.timing.saveT400.bind(M.timing)"
require_count(s,old,label='t400 capture owner')
s=s.replace(old,"if(!M?.timing?.coreSaveT400||!E?.Aerobic||!E?.Evidence)return;const C=M.t400Capture={build:'v4-t400-capture-20260826-coherent'};const core=M.timing.coreSaveT400.bind(M.timing)",1).replace('row=base(athleteId,value,session,state,date,st,meta)','row=core(athleteId,value,session,state,date,st,meta)')
p.write_text(s)

# Guardian runtime consumes foundationRun explicitly rather than wrapping public run.
p=Path('engines/guardian-runtime.js'); s=p.read_text()
old="const M=g.MSOS4,G=M?.guardian,E=g.MSOSEngines;if(!M||!G?.run)return;\n  const inheritedRun=G.run.bind(G),BUILD="
require_count(s,old,label='guardian runtime owner')
p.write_text(s.replace(old,"const M=g.MSOS4,G=M?.guardian,E=g.MSOSEngines;if(!M||!G?.foundationRun)return;\n  const inheritedRun=G.foundationRun.bind(G),BUILD=",1))

# index: select one owner per UI/domain and assign a coherent runtime generation.
p=Path('index.html'); s=p.read_text()
s=s.replace('<script src="engines/storage.js?v=20260825-latest-ack" defer></script>','<script src="engines/roster-policy.js?v=20260826-coherent-r1" defer></script><script src="engines/storage.js?v=20260826-coherent-r1" defer></script>')
s=s.replace('<script src="engines/performance-ui.js?v=20260824cg" defer></script>','')
s=s.replace('<script src="engines/t400-capture.js?v=20260820r" defer></script>','<script src="engines/general-timing-ui.js?v=20260826-coherent-r1" defer></script><script src="engines/t400-capture.js?v=20260826-coherent-r1" defer></script>')
for old in ['app.js?v=20260821ak-cache','engines/parser-semantics.js?v=20260824-authority','v4-correct.js?v=20260821ak-cache','v4-poolside-core.js?v=20260819f-targettruth','engines/board.js?v=20260825tv','engines/navigation.js?v=20260825finala','engines/guardian-runtime.js?v=20260825finala','engines/swimmer-instant-open-cn.js?v=20260825-owner']:
    s=s.replace(old,old.split('?')[0]+'?v=20260826-coherent-r1')
p.write_text(s)

print('COHERENT_RUNTIME_RECONSTRUCTION_COMPLETE')
