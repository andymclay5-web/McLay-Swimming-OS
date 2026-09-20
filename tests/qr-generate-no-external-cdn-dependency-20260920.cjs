'use strict';
// Real coaching failure this fixes (Andy, live, 20 Sept 2026): THREE separate genuine "QR renderer could not
// load" failures across three different builds tonight (07:57, 08:39, 08:58 UTC) -- the last one happening
// even after the loadQr() forever-cached-rejection bug and the QR-image/whole-attempt isolation were both
// fixed and independently confirmed working (outcome:'ok'/step:'done', a genuinely fresh network attempt, not
// a replayed cached result). Three genuine failures reaching the same external host, over roughly an hour,
// across three different fixes to the client-side retry logic, points at the network path to that specific
// third-party CDN (cdn.jsdelivr.net) itself -- not a client bug more retry logic can fix. Every other script
// and asset in this app is already bundled same-origin and precached by sw.js at install time; the QR image
// was the one remaining piece that still depended on reaching a third party LIVE, at the exact moment a coach
// taps Generate, poolside, on whatever connection happens to be available right then.
//
// The fix: engines/qrcode-local.js is a from-scratch, dependency-free implementation of the QR encoding
// algorithm (ISO/IEC 18004), vendored into the repo and precached same-origin exactly like every other
// engine file. loadQr() in swimmer-invite-bn.js no longer creates a <script> tag, fetches anything, or caches
// a promise -- it just returns the already-present global. There is no more live network request of any kind,
// to any host, anywhere in this feature.
//
// This test proves: (1) loadQr()'s source contains no external URL, no dynamic <script> creation, and no
// promise-caching field -- the entire mechanism that could ever depend on network reachability is gone, not
// just retried more carefully; (2) engines/qrcode-local.js exists, and is wired into both index.html's script
// tags and sw.js's REQUIRED precache list with matching version tags, so it loads and is available offline
// exactly like every other same-origin script; (3) the vendored encoder, required directly, produces a
// structurally valid QR module matrix for a realistic invite URL (the same 64-hex-char token shape
// msos_create_swimmer_invite produces) -- correct finder-pattern placement (a real, spec-defined invariant
// that does not depend on which mask gets chosen) and deterministic output across repeated calls; (4)
// fail-before/pass-after against the exact loadQr() source change.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const qrLocalPath=path.join(repoRoot,'engines','qrcode-local.js');
const indexPath=path.join(repoRoot,'index.html');
const swPath=path.join(repoRoot,'sw.js');
const inviteSrc=fs.readFileSync(invitePath,'utf8');

function extractLoadQr(src){
  const m=src.match(/async function loadQr\(\)\{[^}]*\}[^}]*\}?/);
  // loadQr() is a single-line, brace-balanced function in the real source; grab it precisely by scanning
  // balanced braces from its start rather than a fragile regex, so this works regardless of exact body length.
  const start=src.indexOf('async function loadQr(');
  assert.ok(start>=0,'test setup error: could not find loadQr() in the source at all');
  let depth=0,i=start,bodyStart=-1;
  for(;i<src.length;i++){
    if(src[i]==='{'){if(bodyStart===-1)bodyStart=i;depth++;}
    else if(src[i]==='}'){depth--;if(depth===0)break;}
  }
  assert.ok(depth===0&&bodyStart!==-1,'test setup error: could not brace-match loadQr() body');
  return src.slice(start,i+1);
}

function assertNoExternalCdnDependency(src,label){
  const loadQrSrc=extractLoadQr(src);
  assert.ok(!/cdn\.jsdelivr\.net|https?:\/\//.test(loadQrSrc),`${label}: loadQr() must not reference any external URL`);
  assert.ok(!/createElement\(['"]script['"]\)/.test(loadQrSrc),`${label}: loadQr() must not dynamically create a <script> tag`);
  assert.ok(!/qrPromise/.test(loadQrSrc),`${label}: loadQr() must not cache a network promise -- there is no network call left to cache`);
  assert.ok(/typeof g\.QRCode===['"]function['"]/.test(loadQrSrc),`${label}: loadQr() must simply check for the same-origin global`);
}

function runNoExternalCdnDependencyInRealSource(){
  assertNoExternalCdnDependency(inviteSrc,'real source');
  console.log('QR_NO_CDN_LOADQR_SOURCE_PASS');
}

function runQrcodeLocalIsPrecachedAndReferenced(){
  assert.ok(fs.existsSync(qrLocalPath),'engines/qrcode-local.js must exist in the repo');
  const localSrc=fs.readFileSync(qrLocalPath,'utf8');
  assert.ok(/module\.exports\s*=\s*QRCode/.test(localSrc),'qrcode-local.js must be require()-able for testing and tooling');
  assert.ok(/root\.QRCode\s*=\s*QRCode/.test(localSrc),'qrcode-local.js must attach a global QRCode for the browser <script> tag path');

  const indexSrc=fs.readFileSync(indexPath,'utf8');
  const indexMatch=indexSrc.match(/<script src="engines\/qrcode-local\.js\?v=([a-z0-9-]+)"/);
  assert.ok(indexMatch,'index.html must load engines/qrcode-local.js as a plain <script> tag, versioned like every other engine');

  const swSrc=fs.readFileSync(swPath,'utf8');
  const swMatch=swSrc.match(/\.\/engines\/qrcode-local\.js\?v=([a-z0-9-]+)/);
  assert.ok(swMatch,'sw.js REQUIRED precache list must include engines/qrcode-local.js -- otherwise it is not guaranteed available offline like every other script');

  assert.equal(indexMatch[1],swMatch[1],'index.html and sw.js must reference the exact same qrcode-local.js version tag, or an update to one without the other could serve a stale cached copy');

  // The <script> tag for qrcode-local.js must appear before swimmer-invite-bn.js's tag so QRCode is already a
  // global well before Generate could ever be tapped (both are `defer`, so document order is execution order).
  const qrLocalIdx=indexSrc.indexOf('engines/qrcode-local.js');
  const inviteTagIdx=indexSrc.indexOf('engines/swimmer-invite-bn.js');
  assert.ok(qrLocalIdx>=0&&inviteTagIdx>=0&&qrLocalIdx<inviteTagIdx,'engines/qrcode-local.js must be loaded before engines/swimmer-invite-bn.js in index.html');

  console.log('QR_LOCAL_PRECACHED_AND_REFERENCED_PASS');
}

function runVendoredEncoderProducesAValidMatrix(){
  delete require.cache[require.resolve(qrLocalPath)];
  const QRCode=require(qrLocalPath);
  assert.equal(typeof QRCode.encode,'function','the vendored file must expose a low-level encode() function');
  assert.ok(QRCode.CorrectLevel&&typeof QRCode.CorrectLevel.M==='number','the vendored file must expose CorrectLevel.M, matching the app\'s call site (Q.CorrectLevel?.M)');

  // A realistic invite URL: the exact shape msos_create_swimmer_invite produces (32 random bytes, hex-encoded
  // -> 64 hex chars) appended to the real swimmer-portal.html path.
  const token='4bce091b5d6a630244a389d78f29d009097a2a69c95b2d2f2704a1416d192688'.slice(0,64);
  const url=`https://example.test/swimmer-portal.html?invite=${token}`;

  const result=QRCode.encode(url,QRCode.CorrectLevel.M);
  assert.ok(Number.isInteger(result.moduleCount)&&result.moduleCount>=21,'a QR symbol must be at least version 1 size (21x21 modules)');
  assert.equal(result.moduleCount,result.version*4+17,'moduleCount must match the spec formula for the chosen version -- version*4+17');
  assert.equal(typeof result.isDark,'function');

  // Real, spec-defined structural invariant, independent of which of the 8 masks got picked: every QR symbol
  // has an identical 7x7 finder pattern (a ring: dark border, light ring, dark 3x3 core) at the top-left
  // corner. Finder-pattern modules are never masked, so this must hold for ANY valid encode() output.
  const FINDER_7x7=[
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1],
  ];
  for(let r=0;r<7;r++){
    for(let c=0;c<7;c++){
      assert.equal(result.isDark(r,c),FINDER_7x7[r][c]===1,`top-left finder pattern mismatch at (${r},${c}) -- module placement is broken`);
    }
  }
  // The same finder pattern must also appear at the top-right and bottom-left corners.
  const size=result.moduleCount;
  for(let r=0;r<7;r++){
    for(let c=0;c<7;c++){
      assert.equal(result.isDark(r,size-7+c),FINDER_7x7[r][c]===1,`top-right finder pattern mismatch at (${r},${c})`);
      assert.equal(result.isDark(size-7+r,c),FINDER_7x7[r][c]===1,`bottom-left finder pattern mismatch at (${r},${c})`);
    }
  }

  // Determinism: encoding the exact same input twice must produce the exact same matrix (no reliance on
  // Math.random, Date.now, or other non-deterministic state -- a coach re-tapping Generate for the same
  // still-valid link should never get a visually different QR image).
  const again=QRCode.encode(url,QRCode.CorrectLevel.M);
  assert.equal(again.moduleCount,result.moduleCount);
  assert.equal(again.version,result.version);
  assert.equal(again.maskPattern,result.maskPattern);
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)assert.equal(again.isDark(r,c),result.isDark(r,c),`non-deterministic output at (${r},${c})`);

  console.log('QR_VENDORED_ENCODER_VALID_MATRIX_PASS');
}

function runFailBefore(){
  const buggyLoadQr=`async function loadQr(){if(typeof g.QRCode==='function')return g.QRCode;if(X.qrPromise)return X.qrPromise;X.qrPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';s.referrerPolicy='no-referrer';s.onload=()=>typeof g.QRCode==='function'?resolve(g.QRCode):reject(new Error('QR renderer did not load'));s.onerror=()=>reject(new Error('QR renderer could not load'));document.head.appendChild(s)}).catch(err=>{X.qrPromise=null;throw err;});return X.qrPromise;}`;
  assert.throws(()=>assertNoExternalCdnDependency(buggyLoadQr,'pre-fix source'),/must not reference any external URL/,'pre-fix source: this test must actually fail against the old CDN-based loadQr(), proving it would have caught this exact dependency');
  console.log('QR_NO_CDN_FAILBEFORE_PASS');
}

(function(){
  runNoExternalCdnDependencyInRealSource();
  runQrcodeLocalIsPrecachedAndReferenced();
  runVendoredEncoderProducesAValidMatrix();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  require('node:child_process').execFileSync(process.execPath,['--check',qrLocalPath],{stdio:'pipe'});
  process.exit(0);
})();
