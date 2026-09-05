'use strict';
// Proves the two dead-but-live-order-dependent originals flagged in WRITER_MAP_FINDINGS.md are
// actually gone from app.js, not just shadowed by script load order -- and that the real owners
// (engines/live-training-authority.js's L.apply, engines/navigation.js's N.applyHistory/N.init)
// are still the ones wired at runtime. Retiring dead code is only safe if it was truly dead; this
// test pins both halves of that claim so a future edit can't silently reintroduce either landmine
// or silently break the real owner while doing so.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const appJs=fs.readFileSync(path.resolve(__dirname,'..','app.js'),'utf8');

// 1: the dead app.js originals must be gone -- not present under any load order.
assert.doesNotMatch(appJs,/L\.apply=msg=>\{if\(!msg\|\|msg\.kind!=='v4-live-state'/,'app.js must not contain the original ungated L.apply body -- its owner is engines/live-training-authority.js');
assert.doesNotMatch(appJs,/N\.applyHistory=state=>\{applyingHistory=true/,'app.js must not contain the original N.applyHistory body -- its owner is engines/navigation.js, and this one could write selectedSessionId straight from history state');

// 2: what app.js legitimately still owns in this area must be untouched -- L.init (channel setup,
// no other file creates the BroadcastChannel) and N.init (still present; also superseded by
// navigation.js's own N.init reassignment before boot ever calls it, but not part of this retirement).
assert.match(appJs,/L\.init=\(\)=>\{if\(L\.channel\|\|typeof BroadcastChannel/,'L.init (BroadcastChannel setup) must still be present -- it is not one of the two retired originals');
assert.match(appJs,/N\.init=\(\)=>\{const initial=N\.views\.includes/,'app.js N.init must still be present unchanged -- only N.applyHistory was retired from this IIFE');

// 3: the real owners must still be wired and reachable.
const liveAuthSrc=fs.readFileSync(path.resolve(__dirname,'..','engines','live-training-authority.js'),'utf8');
assert.match(liveAuthSrc,/L\.apply=msg=>\{/,'engines/live-training-authority.js must still own L.apply');
const navSrc=fs.readFileSync(path.resolve(__dirname,'..','engines','navigation.js'),'utf8');
assert.match(navSrc,/N\.applyHistory=state=>/,'engines/navigation.js must still own N.applyHistory');
assert.match(navSrc,/N\.init=\(\)=>\{if\(V\.initialized\)return/,'engines/navigation.js must still own N.init (so app.js\'s now-unreferenced dead N.init body never actually runs)');

// 4: index.html must still load engines/live-training-authority.js and engines/navigation.js
// AFTER app.js -- the entire "retirement is safe" argument depends on that load order.
const indexHtml=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const scriptSrcs=[...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]);
const idx=name=>scriptSrcs.findIndex(s=>s.includes(name));
const appIdx=idx('app.js'),liveIdx=idx('live-training-authority.js'),navIdx=idx('navigation.js');
assert.ok(appIdx>=0&&liveIdx>=0&&navIdx>=0,`could not locate all three scripts in index.html (app.js:${appIdx} live-training-authority.js:${liveIdx} navigation.js:${navIdx})`);
assert.ok(liveIdx>appIdx,'engines/live-training-authority.js must load after app.js');
assert.ok(navIdx>appIdx,'engines/navigation.js must load after app.js');

console.log('DEAD_LIVE_NAV_ORIGINALS_RETIRED_PASS both-dead-bodies-gone real-owners-still-wired load-order-confirmed');
