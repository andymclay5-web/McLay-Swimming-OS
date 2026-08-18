'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const build='v4-poolside-core-20260819b-releasegate';
const read=file=>fs.readFileSync(path.join(root,file));
const text=file=>read(file).toString('utf8');

const checksumRows=text('SHA256SUMS.txt').trim().split('\n').map(line=>{
  const match=line.match(/^([a-f0-9]{64})  (.+)$/);
  assert.ok(match,`Malformed checksum row: ${line}`);
  return {expected:match[1],file:match[2]};
});

for(const {expected,file} of checksumRows){
  assert.ok(fs.existsSync(path.join(root,file)),`Missing release file: ${file}`);
  const actual=crypto.createHash('sha256').update(read(file)).digest('hex');
  assert.equal(actual,expected,`Release checksum changed: ${file}`);
}

const index=text('index.html');
const worker=text('sw.js');
const app=text('app.js');
const manifest=JSON.parse(text('manifest.webmanifest'));
const required=[
  'index.html','manifest.webmanifest','config.js','seed.js','styles.css','v4-correct.css',
  'v4-poolside-core.css','app.js','v4-correct.js','v4-poolside-core.js','icon-192.png',
  'icon-512.png','monthly_calendar.json','morning-board.html','morning-board.css','morning-board.js',
  'engines/session-truth.js','engines/morning-coaching.js'
];

for(const file of required){
  assert.ok(checksumRows.some(row=>row.file===file),`Release checksums omit ${file}`);
  assert.ok(worker.includes(file),`Offline cache omits ${file}`);
}
assert.ok(index.includes(`app.js?v=20260819b-releasegate`),'index uses a stale app build');
assert.ok(index.includes(`v4-correct.js?v=20260819b-releasegate`),'index uses a stale correct-layer build');
assert.ok(index.includes(`v4-poolside-core.js?v=20260819b-releasegate`),'index uses a stale poolside build');
assert.ok(worker.includes(`const BUILD='${build}'`),'service worker uses a different build');
assert.ok(app.includes("navigator.serviceWorker.register('./sw.js')"),'Version 4 never registers its offline worker');
assert.equal(manifest.name,'McLay Swimming OS — Version 4','manifest uses a stale product name');
assert.equal(manifest.short_name,'McLay Swim V4','manifest uses a stale install name');

console.log(`Release package PASS · ${checksumRows.length} verified files · ${build}`);
