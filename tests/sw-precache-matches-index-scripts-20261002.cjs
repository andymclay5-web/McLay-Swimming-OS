'use strict';
// 2 Oct 2026 (Andy, full-app audit after the Swimify-parser work landed via ChatGPT): ChatGPT's
// three Swimify commits (engines/meet-swimify-format.js + routing hooks in meet-field-au.js and
// meet-program-ba.js, index.html's script tag) never touched sw.js. index.html's own <script> tags
// are not what the PWA actually serves offline -- sw.js's install handler fetches every URL in its
// REQUIRED array and fails the whole install if ANY of them 404s, and only ever serves what it
// precached (plus live network-first for .js/.css while online). A script referenced by index.html
// but missing from REQUIRED isn't "slightly stale" -- it silently never got pre-cached, so the very
// first time a device goes offline (or a flaky network fetch fails) with this build installed, that
// engine is simply gone with no error surfaced anywhere. This test asserts the general invariant
// (every local script src in index.html must appear in sw.js's REQUIRED list) rather than just
// checking the one file -- a future added engine missing the same way should fail this same test.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const SW_PATH = path.join(ROOT, 'sw.js');

function localScriptSrcs(html) {
  const out = [];
  const re = /<script src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (/^https?:\/\//i.test(src)) continue; // no external scripts expected, but skip defensively
    out.push(src);
  }
  return out;
}

function requiredList(swSource) {
  const m = swSource.match(/const REQUIRED=\[(.*?)\];/);
  assert(m, 'sw.js must define a const REQUIRED=[...] precache array (test assumption broke -- re-check sw.js structure)');
  return m[1].split(',').map(s => s.trim().replace(/^'(.*)'$/, '$1'));
}

function checkCoverage() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const sw = fs.readFileSync(SW_PATH, 'utf8');
  const scripts = localScriptSrcs(html);
  assert(scripts.length > 50, `sanity check: expected many script tags in index.html, found ${scripts.length}`);
  const required = new Set(requiredList(sw));
  const missing = scripts.filter(src => !required.has('./' + src));
  return { scripts, missing };
}

(function main() {
  // Fail-before: reproduce the real bug by temporarily stripping the Swimify engine's entry back
  // out of the REQUIRED array in the real sw.js, confirming this test correctly catches it, then
  // restoring the original file exactly.
  const original = fs.readFileSync(SW_PATH, 'utf8');
  const swimifyEntry = "'./engines/meet-swimify-format.js?v=20260929a',";
  assert(original.includes(swimifyEntry), 'expected sw.js to currently include the Swimify precache entry (fix already applied) -- refusing to run against unexpected state');
  try {
    const stripped = original.replace(swimifyEntry, '');
    assert.notStrictEqual(stripped, original, 'string replace should have removed exactly one occurrence');
    fs.writeFileSync(SW_PATH, stripped);
    execCheckSyntax();
    const before = checkCoverage();
    assert(before.missing.includes('engines/meet-swimify-format.js?v=20260929a'), 'fail-before: expected the Swimify engine to be reported missing from REQUIRED once stripped, got missing=' + JSON.stringify(before.missing));
    console.log('SW_PRECACHE_FAILBEFORE_PASS');
  } finally {
    fs.writeFileSync(SW_PATH, original);
    execCheckSyntax();
  }

  const after = checkCoverage();
  assert.strictEqual(after.missing.length, 0, 'every local script in index.html must be precached by sw.js; missing=' + JSON.stringify(after.missing));
  console.log('SW_PRECACHE_COVERAGE_PASS');
  console.log('SW_PRECACHE_ALL_PASS');
})();

function execCheckSyntax() {
  const { execSync } = require('child_process');
  execSync(`node --check ${JSON.stringify(SW_PATH)}`, { stdio: 'pipe' });
}
