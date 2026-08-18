'use strict';
const assert=require('assert');
const Media=require('../assembly/media-capture-adapter.js');
let failures=0;
async function test(name,fn){try{await fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
function file(name,type,size=1234){return{name,type,size}}
(async()=>{
console.log(`Assembly Media Capture ${Media.VERSION}`);
await test('photo video and voice validate their own media MIME families',async()=>{const store=new Media.MemoryMediaStore(),m=new Media.MediaCaptureAdapter({store,clock:()=> '2026-08-19T07:45:00+12:00'});for(const [type,f] of [['photo',file('a.jpg','image/jpeg')],['video',file('a.mp4','video/mp4')],['voice',file('a.m4a','audio/mp4')]]){const ref=await m.save(f,{type});assert.strictEqual(ref.type,type);assert.strictEqual(ref.provider,'indexeddb');assert(ref.id);assert.strictEqual((await m.get(ref)).blob,f)}});
await test('wrong media family and empty files fail before persistent write',async()=>{const store=new Media.MemoryMediaStore(),m=new Media.MediaCaptureAdapter({store});await assert.rejects(()=>m.save(file('x.mp4','video/mp4'),{type:'photo'}),/image file/);await assert.rejects(()=>m.save(file('x.jpg','image/jpeg',0),{type:'photo'}),/empty/);assert.strictEqual((await store.list()).length,0)});
await test('media reference contains metadata but never embeds blob bytes into Capture Evidence metadata',async()=>{const m=new Media.MediaCaptureAdapter({store:new Media.MemoryMediaStore(),clock:()=> '2026-08-19T07:46:00+12:00'}),ref=await m.save(file('lane4.jpg','image/jpeg',222),{type:'photo',context:{sessionId:'s1',blockId:'b1'}});assert.deepStrictEqual(Object.keys(ref).sort(),['createdAt','id','mime','name','provider','size','store','type'].sort());assert(!Object.prototype.hasOwnProperty.call(ref,'blob'));const row=await m.get(ref);assert.strictEqual(row.context.sessionId,'s1');assert.strictEqual(row.blob.name,'lane4.jpg')});
await test('failed downstream capture can remove already-local media without guessing another row',async()=>{const store=new Media.MemoryMediaStore(),m=new Media.MediaCaptureAdapter({store}),ref=await m.save(file('clip.mp4','video/mp4'),{type:'video'});assert(await m.get(ref));assert.strictEqual(await m.remove(ref),true);assert.strictEqual(await m.get(ref),null)});
if(failures){console.error(`\n${failures} media capture regression(s) failed`);process.exit(1)}console.log('\nALL ASSEMBLY MEDIA CAPTURE REGRESSIONS PASS');
})().catch(e=>{console.error(e);process.exit(1)});
