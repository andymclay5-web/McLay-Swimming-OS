'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const build='v4-guardian-runtime-order-20260822bl';
const read=file=>fs.readFileSync(path.join(root,file));
const text=file=>read(file).toString('utf8');

const checksumRows=text('SHA256SUMS.txt').trim().split('\n').map(line=>{
  const match=line.match(/^([a-f0-9]{64})  (.+)$/);
  assert.ok(match,`Malformed checksum row: ${line}`);
  return {expected:match[1],file:match[2]};
});
const mutableReleaseEntrypoints=new Set(['index.html','sw.js']);
for(const {expected,file} of checksumRows){
  assert.ok(fs.existsSync(path.join(root,file)),`Missing release file: ${file}`);
  if(mutableReleaseEntrypoints.has(file))continue;
  const actual=crypto.createHash('sha256').update(read(file)).digest('hex');
  assert.equal(actual,expected,`Protected release asset changed: ${file}`);
}

const index=text('index.html'),worker=text('sw.js'),app=text('app.js'),version=text('VERSION.txt').trim(),manifest=JSON.parse(text('manifest.webmanifest'));
const stableRequired=['manifest.webmanifest','config.js','seed.js','styles.css','v4-correct.css','v4-poolside-core.css','app.js','v4-correct.js','v4-poolside-core.js','icon-192.png','icon-512.png','monthly_calendar.json','morning-board.html','morning-board.css','morning-board.js','engines/session-truth.js','engines/morning-coaching.js'];
for(const file of stableRequired)assert.ok(checksumRows.some(row=>row.file===file),`Stable release checksums omit ${file}`);

const liveRuntimeFiles=[
  'engines/presence-persistence-bc.js','architecture/interaction-core.js','architecture/athlete-session-core.js','architecture/training-history-core.js','architecture/athlete-observation-core.js','architecture/athlete-report-core.js','engines/athlete-session-bd.js','engines/swimmer-training-bd.js','engines/swimmer-training-bd.css','engines/release-guardian-bg.js','engines/stability-identity-bh.js','engines/guardian-device-state-bj.js','engines/privacy-hardening-bk.js','engines/release-guardian-bj.js','engines/release-guardian-bl.js','engines/guardian-runtime.js'
];
for(const file of liveRuntimeFiles){assert.ok(fs.existsSync(path.join(root,file)),`Missing current runtime file: ${file}`);assert.ok(worker.includes(file),`Offline cache omits current runtime file: ${file}`);if(file.endsWith('.js'))assert.ok(index.includes(file),`index does not load current runtime file: ${file}`);}

assert.equal(version,`McLay Swimming OS Version 4 · ${build}`,'VERSION.txt does not match current release candidate');
assert.ok(index.includes('app.js?v=20260821ak-cache'),'index uses a stale app build');
assert.ok(index.includes('v4-correct.js?v=20260821ak-cache'),'index uses a stale correct-layer build');
assert.ok(index.includes('v4-poolside-core.js?v=20260819f-targettruth'),'index uses a stale poolside build');
const order=['stability-identity-bh.js','guardian-device-state-bj.js','privacy-hardening-bk.js','release-guardian-bj.js','release-guardian-bl.js','guardian-runtime.js'];
let last=-1;for(const file of order){const at=index.indexOf(file);assert.ok(at>last,`Guardian script order wrong at ${file}`);last=at;}
const stability=text('engines/stability-identity-bh.js');
assert.ok(!stability.includes('loadFullGuardian'),'stability must not dynamically reload an older Guardian layer');
assert.ok(!stability.includes('release-guardian-bj.js?v='),'stability contains a late BJ Guardian loader');
assert.ok(stability.includes('placeholder_roster_contamination'),'placeholder roster contamination is not audited');
assert.ok(stability.includes('purgePlaceholders'),'placeholder roster cleanup is missing');
assert.ok(text('engines/privacy-hardening-bk.js').includes('ownAudience'),'swimmer evidence deny-by-default hardening missing');
assert.ok(text('engines/privacy-hardening-bk.js').includes('This is not your race'),'cross-athlete Meet evidence write guard missing');
assert.ok(text('engines/release-guardian-bl.js').includes('Current privacy · swimmer Meet evidence is own-athlete and shared-only'),'current privacy Guardian replacement missing');
assert.ok(text('engines/release-guardian-bl.js').includes('Current integration · presence persistence remains connected under current build'),'current integration Guardian missing');
assert.ok(text('engines/release-guardian-bl.js').includes(build),'BL Guardian does not own final build');
assert.ok(text('engines/guardian-runtime.js').includes('fullRun'),'explicit full Guardian handle is missing');
assert.ok(text('engines/guardian-runtime.js').includes('Run full Guardian'),'phone Guardian no longer exposes the full suite');
assert.ok(text('engines/guardian-device-state-bj.js').includes('No placeholder/test swimmers in production roster'),'device-state placeholder check is missing');
assert.ok(text('.github/workflows/full-guardian.yml').includes("'v4-*'"),'full Guardian does not run on every v4 candidate upload');
assert.ok(text('.github/workflows/full-guardian.yml').includes('guardian-runtime-order-bl.cjs'),'Full Guardian does not test browser Guardian ordering');
assert.ok(worker.includes(`const BUILD='${build}'`),'service worker uses a different build');
assert.ok(worker.includes(`const CACHE='mclay-swimming-os-${build}'`),'service-worker cache does not match release build');
assert.ok(app.includes("navigator.serviceWorker.register('./sw.js')"),'Version 4 never registers its offline worker');
assert.ok(/N\.init=\(\)=>\{[^}]*N\.activateView\(initial\)/.test(app),'saved view activation contract disappeared from core navigation');
assert.ok(text('v4-poolside-core.js').includes('known_2026-08-15_duplicate_breakdown_and_rest_distance'),'known 6,090m saved-session corruption repair is missing');
assert.ok(text('v4-poolside-core.js').includes('<details class="pool-targets">'),'parent-set target dropdown is missing');
assert.ok(text('v4-poolside-core.js').includes('data-pool-swimmers'),'direct Swimmers / Pathway route is missing');
assert.ok(text('v4-correct.js').includes('hydrateT400Evidence'),'legacy T400 evidence hydration is missing');
assert.ok(text('v4-correct.js').includes('legacyPaceRows'),'athlete legacy T400 migration is missing');
assert.ok(text('v4-poolside-core.js').includes('cueRaceIntent'),'standalone race-pace cue resolution is missing');
assert.ok(text('v4-poolside-core.js').includes('condensedRepPattern')||text('v4-correct.js').includes('condensedRepPattern'),'modified mixed-zone phase retention is missing');
assert.ok(text('v4-correct.js').includes('How has training in this area been?'),'poolside pathway-to-training answer is missing');
assert.ok(text('engines/presence-persistence-bc.js').includes('mergeRows'),'non-destructive attendance merge is missing');
assert.ok(text('engines/athlete-session-bd.js').includes('startSquadAtItem'),'squad layer start action is missing');
assert.ok(text('engines/athlete-session-bd.js').includes('endAtItem'),'individual session end action is missing');
assert.ok(text('engines/swimmer-training-bd.js').includes('projectionFor'),'Training UI is not connected to athlete-session projection');
assert.ok(text('engines/swimmer-training-bd.js').includes('Partial evidence'),'set-level partial evidence presentation is missing');
assert.ok(stability.includes('migrate-pre-bh-role-state'),'stale role migration guard is missing');
assert.equal(manifest.name,'McLay Swimming OS — Version 4','manifest uses a stale product name');
assert.equal(manifest.short_name,'McLay Swim V4','manifest uses a stale install name');
console.log(`Release package PASS · ${checksumRows.length-2} stable hashes · ${liveRuntimeFiles.length} current runtime connections · ${build}`);
