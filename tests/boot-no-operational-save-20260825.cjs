'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const storage=fs.readFileSync('engines/storage.js','utf8');
assert.match(storage,/if\(!S\.ready\)\{S\.preHydrationSaveRequests=/,'pre-hydration save requests must be tracked, not persisted as full operational writes');
const pre=storage.match(/if\(!S\.ready\)\{[\s\S]*?return state\}/);assert.ok(pre,'pre-hydration save branch not found');
assert.doesNotMatch(pre[0],/queueFull|putFull|localStorage\.setItem\(M\.STORAGE_KEY/,'pre-hydration save branch must never full-save state');
const hydrate=storage.match(/async function hydrate\(\)\{[\s\S]*?S\.readyPromise=hydrate\(\)/);assert.ok(hydrate,'hydrate function not found');
assert.doesNotMatch(hydrate[0],/deferredLiveSave/,'hydration must not replay a boot-time full save');
console.log('BOOT_HYDRATION_READ_ONLY_PASS');
