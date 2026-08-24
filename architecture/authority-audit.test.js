'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8'),norm=p=>p.split(path.sep).join('/');
function walk(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())out.push(...walk(f));else if(e.isFile()&&e.name.endsWith('.js'))out.push(f)}return out}
function writers(regex){const rows=[];for(const file of walk(ROOT)){const rel=norm(path.relative(ROOT,file));if(/\.(?:test|spec)\.js$/.test(rel)||rel.startsWith('tests/'))continue;const source=fs.readFileSync(file,'utf8');if(regex.test(source))rows.push(rel);regex.lastIndex=0}return rows.sort()}
const authority=read('architecture/AUTHORITY_MAP.md');assert.match(authority,/One domain, one policy owner, many projections/i);
const index=read('index.html'),scripts=[...index.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]),loaded=new Set(scripts);
const forbiddenLoaded=scripts.filter(x=>/(?:contract-fixes|adaptive-options|amber-(?:ratio|alignment)|morning-session-contract|parser-natural-structure|release-guardian(?:-[a-z]+)?|phone-fixes-ao\.js)/i.test(x));
assert.deepEqual(forbiddenLoaded,[],`Runtime patch/overlay layer loaded: ${forbiddenLoaded.join(', ')}`);
const guardianFiltering=writers(/\.filter\([^\n]{0,160}(?:retired|staleNames)/g).filter(x=>loaded.has(x));assert.deepEqual(guardianFiltering,[],`Loaded Guardian filters/retires tests: ${guardianFiltering.join(', ')}`);
const storeSaveWriters=writers(/\bM\.store\.save\s*=/g).filter(x=>loaded.has(x));assert.deepEqual(storeSaveWriters.filter(x=>!['app.js','engines/storage.js'].includes(x)),[],`Loaded layer replaces storage authority: ${storeSaveWriters.join(', ')}`);
const adaptWriters=writers(/\bM\.adapt\.item\s*=/g).filter(x=>loaded.has(x));assert.deepEqual(adaptWriters.filter(x=>!['engines/bridge.js','v4-correct.js'].includes(x)),[],`Unexpected loaded M.adapt.item writer: ${adaptWriters.join(', ')}`);
const engineAdaptWriters=writers(/\b(?:E|MSOSEngines)\.Modification\.adaptItem\s*=/g).filter(x=>loaded.has(x));assert.deepEqual(engineAdaptWriters,[],`Loaded layer replaces Modification owner: ${engineAdaptWriters.join(', ')}`);
const coordinatorWriters=writers(/\b(?:E|MSOSEngines)\.Coordinator\.prescription\s*=/g).filter(x=>loaded.has(x));assert.deepEqual(coordinatorWriters,[],`Loaded layer replaces Coordinator owner: ${coordinatorWriters.join(', ')}`);
const parserWriters=writers(/\bM\.parser\.parse\s*=/g).filter(x=>loaded.has(x));assert.deepEqual(parserWriters.filter(x=>!['v4-poolside-core.js'].includes(x)),[],`Loaded layer replaces canonical parser after authority: ${parserWriters.join(', ')}`);
assert.ok(scripts.indexOf('engines/parser-semantics.js')<scripts.indexOf('v4-poolside-core.js'),'Parser semantics must load before canonical session owner');
console.log(JSON.stringify({gate:'MSOS_AUTHORITY_ZERO_TOLERANCE',forbiddenLoaded,guardianFiltering,storeSaveWriters,adaptWriters,engineAdaptWriters,coordinatorWriters,parserWriters,rule:'No runtime correction stack; one authority per domain; Guardian never manufactures a pass.'},null,2));
