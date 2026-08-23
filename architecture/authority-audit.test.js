'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const norm = p => p.split(path.sep).join('/');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function writers(regex) {
  const rows = [];
  for (const file of walk(ROOT)) {
    const rel = norm(path.relative(ROOT, file));
    if (/\.(?:test|spec)\.js$/.test(rel) || rel.startsWith('tests/')) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (regex.test(source)) rows.push(rel);
    regex.lastIndex = 0;
  }
  return rows.sort();
}

const authority = read('architecture/AUTHORITY_MAP.md');
assert.match(authority, /One domain, one policy owner, many projections/i);
assert.match(authority, /Squad Stimulus Profile/i);

const index = read('index.html');
const scripts = [...index.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
const guardianLayers = scripts.filter(x => /(?:^|\/)release-guardian(?:-[a-z]+)?\.js$/i.test(x));
const amberLayers = scripts.filter(x => /(?:^|\/)amber-(?:ratio|alignment)-[a-z]+\.js$/i.test(x));
const correctionLayers = scripts.filter(x => /(?:contract-fixes|phone-fixes|adaptive-options)-[a-z]+\.js$/i.test(x));

// Baseline guard: consolidation PRs may reduce these counts but may not increase them.
assert.ok(guardianLayers.length <= 13, `New Guardian wrapper added: ${guardianLayers.join(', ')}`);
assert.ok(amberLayers.length <= 4, `New Amber correction wrapper added: ${amberLayers.join(', ')}`);
assert.ok(correctionLayers.length <= 4, `New correction wrapper added: ${correctionLayers.join(', ')}`);

// Modification policy must not gain a new M.adapt.item writer while existing debt is retired.
const adaptItemWriters = writers(/\bM\.adapt\.item\s*=/g);
const allowedAdaptWriters = new Set(['engines/bridge.js', 'v4-correct.js']);
const unexpectedAdapt = adaptItemWriters.filter(x => !allowedAdaptWriters.has(x));
assert.deepEqual(unexpectedAdapt, [], `Unexpected M.adapt.item policy writer(s): ${unexpectedAdapt.join(', ')}`);

// Local state ownership is being consolidated from bootstrap app.js into engines/storage.js.
// No third writer is allowed during the migration.
const storeSaveWriters = writers(/\bM\.store\.save\s*=/g);
const allowedStoreWriters = new Set(['app.js', 'engines/storage.js']);
const unexpectedStore = storeSaveWriters.filter(x => !allowedStoreWriters.has(x));
assert.deepEqual(unexpectedStore, [], `Unexpected M.store.save writer(s): ${unexpectedStore.join(', ')}`);

// Runtime Guardian result filtering is known debt in the final historical overlay.
// Do not permit a second file to hide/replace failing source assertions.
const guardianFiltering = writers(/\.filter\(\s*t\s*=>\s*!retired\.has\s*\(/g)
  .filter(x => /release-guardian/i.test(x));
const unexpectedFiltering = guardianFiltering.filter(x => x !== 'engines/release-guardian-bl.js');
assert.deepEqual(unexpectedFiltering, [], `New runtime Guardian filtering introduced: ${unexpectedFiltering.join(', ')}`);

console.log(JSON.stringify({
  gate: 'MSOS_AUTHORITY_BASELINE',
  guardianLayers: guardianLayers.length,
  amberLayers: amberLayers.length,
  correctionLayers: correctionLayers.length,
  adaptItemWriters,
  storeSaveWriters,
  knownGuardianFiltering: guardianFiltering,
  rule: 'Counts may fall; no new policy owner/wrapper may be added.'
}, null, 2));
