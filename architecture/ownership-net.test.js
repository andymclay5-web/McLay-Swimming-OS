'use strict';
/**
 * Ownership net — a "hold the line" gate over the protected-state writers that
 * WRITER_MAP_FINDINGS.md tracks.
 *
 * It does NOT prove the architecture is finished. It freezes the *current,
 * known* set of files that write each protected state, so that:
 *   - a NEW writer appearing (a fix that became a patch) fails CI immediately,
 *     with a message pointing at the finding it violates;
 *   - a writer being removed (a transitional file finally retired) also fails,
 *     so the retirement is recorded here on purpose rather than by accident.
 *
 * When you legitimately change a set, update the list below in the same commit
 * and say why in the commit message. Categories:
 *   OWNER        — the authoritative writer for this state
 *   ADAPTER      — a projection/display that writes a scoped copy, gated
 *   TRANSITIONAL — debt tracked in AUTHORITY_MAP.md / WRITER_MAP_FINDINGS.md,
 *                  to be retired; must not grow
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const loaded=[...index.matchAll(/(?:src|href)="([^"?]+)/g)].map(m=>m[1]).filter(f=>/\.js$/.test(f));
const has=(file,re)=>{try{return re.test(fs.readFileSync(path.join(ROOT,file),'utf8'));}catch{return false;}};
const writersOf=re=>loaded.filter(f=>has(f,re)).sort();

function gate(label,re,expected,notes){
  const actual=writersOf(re);
  const exp=[...expected].sort();
  assert.deepEqual(actual,exp,
    `\n${label}\n  expected writers: ${exp.join(', ')||'(none)'}\n  actual writers:   ${actual.join(', ')||'(none)'}\n  ${notes}\n`);
  return actual;
}

// --- settings.selectedSessionId ---------------------------------------------
gate('settings.selectedSessionId writers',
  /settings\.selectedSessionId\s*=/,
  [
    'app.js',                                // OWNER — bootstrap + renderHeader role failsafe
    'engines/live-training-authority.js',    // ADAPTER — tv/swimmer display follows the coach session (gated)
    'engines/storage.js',                    // ADAPTER — cold-boot reconciliation from the durable record (gated on revision)
    'engines/coach-loop-ui.js',              // ADAPTER — restore the session on return from an athlete detour (existence-gated)
    'v4-poolside-core.js',                   // TRANSITIONAL — session create/repair wrapper
    'v4-correct.js',                         // TRANSITIONAL — live-sync apply wrapper restores selection around apply
  ],
  'A new entry here means a second thing decides which session is active — see WRITER_MAP_FINDINGS.md §2 and product rule 2.11/2.14.');

// --- canonicalSessions[id] = (direct session-tree writes) -------------------
gate('canonicalSessions[id] = writers',
  /canonicalSessions\[[^\]]+\]\s*=/,
  [
    'app.js',                                // OWNER — Store.putSession (+ the shadowed original L.apply)
    'engines/storage.js',                    // OWNER — hydration
    'engines/live-training-authority.js',    // ADAPTER — L.apply installs the coach session on a derived display (gated)
    'v4-poolside-core.js',                   // TRANSITIONAL — semantic repair pass
    'engines/session-repair.js',             // TRANSITIONAL — manual repair helper, MUST stay un-auto-wired
  ],
  'A new entry here means a second session-tree constructor — WRITER_MAP_FINDINGS.md §1. session-repair.js must never be auto-invoked (see tests/operational-authority-root-20260901.cjs).');

// --- session mutation logic (identity/finish/branch) -----------------------
gate('canonical session mutation methods (C.*)',
  /\bC\.(?:finishAtBlock|finishAtItem|branchAtItem|addSessionSquad|editItem|addLine|removeItem)\s*=/,
  ['app.js'],
  'Session structure/identity edits belong to one owner (app.js M.changes). A UI engine defining these means the Roll/Board is editing the session itself — WRITER_MAP_FINDINGS.md §1.');

// --- browser-history session selection ------------------------------------
const nav=fs.readFileSync(path.join(ROOT,'engines/navigation.js'),'utf8');
assert.ok(loaded.indexOf('engines/navigation.js')>loaded.indexOf('app.js'),
  'navigation.js must load after app.js so its applyHistory is the runtime owner');
const navApply=nav.match(/N\.applyHistory\s*=\s*state=>\{([\s\S]*?)\};/)?.[1]||'';
assert.ok(navApply,'navigation.js must define the history apply owner');
assert.doesNotMatch(navApply,/selectedSessionId\s*=/,
  'Android/browser Back must never select a different session — WRITER_MAP_FINDINGS.md §2, product rule 2.14');

// --- live-sync apply single owner at runtime ------------------------------
gate('L.apply definitions',
  /\bL\.apply\s*=/,
  ['app.js', 'engines/live-training-authority.js'],
  'The app.js definition is the shadowed original; live-training-authority.js loads later and wins. A third definition, or a reorder, needs a conscious decision — WRITER_MAP_FINDINGS.md §1/§4.');
assert.ok(loaded.indexOf('engines/live-training-authority.js')>loaded.indexOf('app.js'),
  'live-training-authority.js must load after app.js to own L.apply');
assert.match(fs.readFileSync(path.join(ROOT,'engines/live-training-authority.js'),'utf8'),
  /Number\(msg\.revision\|\|0\)<Number\(M\.state\.settings\.liveRevision\|\|0\)/,
  'live-sync must reject a stale-revision broadcast before applying it — WRITER_MAP_FINDINGS.md §4');

console.log(JSON.stringify({
  gate:'MSOS_OWNERSHIP_NET',
  selectedSessionId:writersOf(/settings\.selectedSessionId\s*=/),
  canonicalSessionWrites:writersOf(/canonicalSessions\[[^\]]+\]\s*=/),
  sessionMutationOwner:'app.js',
  historyOwner:'engines/navigation.js',
  liveApplyOwner:'engines/live-training-authority.js',
  rule:'Every protected-state writer set is frozen here; drift fails CI on purpose.',
},null,2));
