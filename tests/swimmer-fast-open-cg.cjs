'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../engines/performance-ui.js'),'utf8');
assert.match(src,/const bridgeLoading=!!\(M\.engineBridge&&!M\.engineBridge\.hydrated\)/,'swimmer view must know when evidence hydration is still running');
assert.match(src,/bridgeLoading&&!M\.engineBridge\.hydrating/,'hydration should continue in background without duplicate starts');
assert.doesNotMatch(src,/if\(M\.engineBridge&&!M\.engineBridge\.hydrated\)\{loadingCard[\s\S]*?return;\}/,'swimmer navigation must not block on full evidence hydration');
assert.match(src,/Opening swimmer now\./,'view should visibly open while connected evidence refreshes');
console.log('SWIMMER_FAST_OPEN_CG_PASS');
