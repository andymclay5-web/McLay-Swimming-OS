'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),sw=fs.readFileSync('sw.js','utf8'),index=fs.readFileSync('index.html','utf8'),version=fs.readFileSync('VERSION.txt','utf8').trim();
assert.doesNotMatch(app,/function renderAdapt\(/,'legacy initials-card Board renderer still exists in app.js');
assert.doesNotMatch(app,/UI\.renderBoard\s*=\s*\(\)\s*=>/,'app.js still owns Board rendering');
// app.js and parser-semantics.js must each carry a cache-bust identity that
// index.html and sw.js agree on, and it must not be one of the identities we
// have deliberately retired. (Was pinned to release 20260825's literal values —
// that made every subsequent release fail this check for no real reason.)
const RETIRED_APP_IDENTITIES=['20260821ak-cache','20260819f-targettruth'];
for(const file of ['app.js','engines/parser-semantics.js']){
  const esc=file.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&');
  const inIndex=index.match(new RegExp(esc+'\\?v=([^"\'\\)]+)'));
  const inSw=sw.match(new RegExp(esc+'\\?v=([^"\'\\)]+)'));
  assert.ok(inIndex&&inIndex[1],`${file} has no cache-bust identity in index.html`);
  assert.ok(inSw&&inSw[1],`${file} has no cache-bust identity in the offline package`);
  assert.equal(inIndex[1],inSw[1],`${file} identity differs between index.html and sw.js`);
}
const appIdentity=index.match(/app\.js\?v=([^"'\)]+)/)[1];
assert.ok(!RETIRED_APP_IDENTITIES.includes(appIdentity),`app.js is served under a retired identity: ${appIdentity}`);
const vm=version.match(/McLay Swimming OS Version 4 · (\S+)/),bm=sw.match(/const BUILD='([^']+)'/),cm=sw.match(/const CACHE='([^']+)'/);assert.ok(vm&&bm&&cm,'release identity declarations missing');assert.equal(bm[1],vm[1],'service worker build must match VERSION.txt');assert.match(cm[1],/^mclay-swimming-os-v4-/,'service worker cache identity must be versioned');
assert.match(sw,/async function networkFirst/,'network-first runtime strategy missing');
assert.doesNotMatch(sw,/immediateCached/,'stale-while-revalidate runtime strategy still present');
assert.match(sw,/if\(e\.request\.mode==='navigate'\)[\s\S]*networkFirst/,'navigations are not network-first');
assert.match(sw,/\.\(\?:js\|css\)\$[\s\S]*networkFirst/,'runtime JS/CSS are not network-first');
assert.ok(index.indexOf('app.js')<index.indexOf('engines/board.js'),'dedicated Board engine must load after base app');
assert.ok(index.indexOf('engines/training-prescription-policy.js')<index.indexOf('engines/modification.js'),'training policy must load before modification/coordinator composition');
console.log('COHERENT_RUNTIME_RELEASE_PASS');
