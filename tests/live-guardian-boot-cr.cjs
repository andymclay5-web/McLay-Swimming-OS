'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
assert.doesNotMatch(app,/setTimeout\(\(\)=>\{const r=M\.guardian\.run\(\)/,'live boot must never execute full Guardian');
const render=app.match(/UI\.renderGuardian=r=>\{[\s\S]*?\}\);\n\}\)\(globalThis\);/);
assert.ok(render,'Guardian renderer not found');
assert.doesNotMatch(render[0],/\|\|M\.guardian\.run\(\)/,'opening Guardian must never fall through to full regression');
assert.match(app,/document\.body\.dataset\.guardian=lastGuardian\?\.ok\?'pass':'pending'/,'boot should only reflect prior Guardian metadata');
console.log('LIVE_GUARDIAN_BOOT_OWNER_PASS');
