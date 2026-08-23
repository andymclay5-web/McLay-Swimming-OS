'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const norm = p => p.split(path.sep).join('/');
function walk(dir){const out=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())out.push(...walk(full));else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(full);}return out;}
function writers(regex){const rows=[];for(const file of walk(ROOT)){const rel=norm(path.relative(ROOT,file));if(/\.(?:test|spec)\.js$/.test(rel)||rel.startsWith('tests/'))continue;const source=fs.readFileSync(file,'utf8');if(regex.test(source))rows.push(rel);regex.lastIndex=0;}return rows.sort();}

const authority=read('architecture/AUTHORITY_MAP.md');assert.match(authority,/One domain, one policy owner, many projections/i);assert.match(authority,/Squad Stimulus Profile/i);
const index=read('index.html'),scripts=[...index.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]),loaded=new Set(scripts);
const guardianLayers=scripts.filter(x=>/(?:^|\/)release-guardian(?:-[a-z]+)?\.js$/i.test(x)),amberLayers=scripts.filter(x=>/(?:^|\/)amber-(?:ratio|alignment)-[a-z]+\.js$/i.test(x)),correctionLayers=scripts.filter(x=>/(?:contract-fixes|phone-fixes|adaptive-options)-[a-z]+\.js$/i.test(x));
assert.ok(guardianLayers.length<=13,`New Guardian wrapper added: ${guardianLayers.join(', ')}`);assert.ok(amberLayers.length<=4,`New Amber correction wrapper added: ${amberLayers.join(', ')}`);assert.ok(correctionLayers.length<=4,`New correction wrapper added: ${correctionLayers.join(', ')}`);

const adaptItemWriters=writers(/\bM\.adapt\.item\s*=/g),allowedAdaptWriters=new Set(['engines/bridge.js','v4-correct.js','engines/rainbow-rules-au.js']);
assert.deepEqual(adaptItemWriters.filter(x=>!allowedAdaptWriters.has(x)),[],`Unexpected M.adapt.item policy writer(s): ${adaptItemWriters.join(', ')}`);
const bridgeIndex=scripts.indexOf('engines/bridge.js');
const loadedLateAdaptWriters=adaptItemWriters.filter(x=>loaded.has(x)&&x!=='engines/bridge.js'&&scripts.indexOf(x)>bridgeIndex);
assert.deepEqual(loadedLateAdaptWriters,[],`Loaded layer replaces Modification after bridge: ${loadedLateAdaptWriters.join(', ')}`);

const engineAdaptWriters=writers(/\b(?:E|MSOSEngines)\.Modification\.adaptItem\s*=/g),allowedEngineAdaptWriters=new Set(['engines/rainbow-rules-au.js']);
assert.deepEqual(engineAdaptWriters.filter(x=>!allowedEngineAdaptWriters.has(x)),[],`Unexpected engine Modification writer(s): ${engineAdaptWriters.join(', ')}`);
assert.deepEqual(engineAdaptWriters.filter(x=>loaded.has(x)),[],`Loaded layer replaces E.Modification.adaptItem: ${engineAdaptWriters.filter(x=>loaded.has(x)).join(', ')}`);

const storeSaveWriters=writers(/\bM\.store\.save\s*=/g),allowedStoreWriters=new Set(['app.js','engines/storage.js','engines/presence-persistence-bc.js','engines/guardian-runtime.js']);assert.deepEqual(storeSaveWriters.filter(x=>!allowedStoreWriters.has(x)),[],`Unexpected M.store.save writer(s): ${storeSaveWriters.join(', ')}`);
const guardianFiltering=writers(/\.filter\(\s*t\s*=>\s*!retired\.has\s*\(/g).filter(x=>/release-guardian/i.test(x)),allowedGuardianFiltering=new Set(['engines/release-guardian.js','engines/release-guardian-ao.js','engines/release-guardian-aq.js','engines/release-guardian-as.js','engines/release-guardian-at.js','engines/release-guardian-av.js','engines/release-guardian-bc.js','engines/release-guardian-bd.js','engines/release-guardian-be.js','engines/release-guardian-bk.js','engines/release-guardian-bl.js']);assert.deepEqual(guardianFiltering.filter(x=>!allowedGuardianFiltering.has(x)),[],`New runtime Guardian filtering introduced: ${guardianFiltering.join(', ')}`);
console.log(JSON.stringify({gate:'MSOS_AUTHORITY_BASELINE',guardianLayers:guardianLayers.length,amberLayers:amberLayers.length,correctionLayers:correctionLayers.length,adaptItemWriters,engineAdaptWriters,loadedLateAdaptWriters,storeSaveWriters,knownGuardianFiltering:guardianFiltering,rule:'Modification has one active policy owner; counts may fall and no new wrapper may be added.'},null,2));
