'use strict';
// Real coaching failure this fixes (Andy, live, 20 Sept 2026): THREE separate genuine "QR renderer could not
// load" failures against a third-party CDN (cdn.jsdelivr.net), THEN a FOURTH failure -- "QR renderer is
// missing from this build (engines/qrcode-local.js did not load)" -- immediately after that CDN was replaced
// with a second same-origin FILE loaded via its own <script> tag. The most likely cause of the fourth
// failure: a brand-new file is exactly the kind of change a manual deploy step can miss, when every other fix
// tonight only ever touched files that already existed on Andy's live site and updated correctly every single
// time (the failure also repeated identically on retry, consistent with a missing file rather than a blip).
//
// The fix: there is no longer a second file at all. engines/swimmer-invite-bn.js now contains its own inline
// QR encoder (qrEncode()/drawQr()) -- no external CDN, no separate same-origin file, no window global, no
// script tag, no precache entry that could ever be missing independently of the one file that has proven
// itself reliable on every deploy tonight.
//
// This test proves: (1) swimmer-invite-bn.js's source contains no external URL, no dynamic <script>
// creation, and no dependency on any window.QRCode-style global -- the QR renderer is just ordinary functions
// in this same file; (2) the inline encoder (exposed as X.qrEncode for testability, matching this file's own
// convention for other internal helpers like X.payloadFor/X.corePayloadFor) produces a structurally valid QR
// module matrix for a realistic invite URL (the same 64-hex-char token shape msos_create_swimmer_invite
// produces) -- correct finder-pattern placement (a real, spec-defined invariant independent of which mask
// gets chosen) and deterministic output across repeated calls; (3) fail-before/pass-after against the exact
// source change that removed the separate-file dependency.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const repoRoot=path.join(__dirname,'..');
const invitePath=path.join(repoRoot,'engines','swimmer-invite-bn.js');
const inviteSrc=fs.readFileSync(invitePath,'utf8');

function assertNoExternalRendererDependency(src,label){
  assert.ok(!/cdn\.jsdelivr\.net|https?:\/\/[^'"]*qrcode/i.test(src),`${label}: must not reference any external QR-renderer URL`);
  assert.ok(!/createElement\(['"]script['"]\)/.test(src),`${label}: must not dynamically create a <script> tag to load a renderer`);
  assert.ok(!/g\.QRCode|window\.QRCode|qrPromise/.test(src),`${label}: must not depend on any external QRCode global or cache a load promise for one -- the encoder must be local, synchronous, and always present`);
  assert.ok(/function qrEncode\(/.test(src),`${label}: must define its own inline qrEncode() function`);
  assert.ok(/function drawQr\(/.test(src),`${label}: must define its own inline drawQr() function`);
  assert.ok(!fs.existsSync(path.join(repoRoot,'engines','qrcode-local.js')),`${label}: engines/qrcode-local.js must not exist -- the separate-file approach that could be missed by a deploy is gone`);
}

function runNoExternalRendererDependencyInRealSource(){
  assertNoExternalRendererDependency(inviteSrc,'real source');
  console.log('QR_NO_EXTERNAL_RENDERER_DEPENDENCY_PASS');
}

function bootForEncode(){
  global.window=global;
  global.requestAnimationFrame=fn=>fn();
  global.document={querySelector:()=>null};
  global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};
  global.MSOS4={ui:{},state:{}};
  delete require.cache[require.resolve(invitePath)];
  require(invitePath);
  return global.MSOS4.swimmerInviteBN;
}

function runInlineEncoderProducesAValidMatrix(){
  const X=bootForEncode();
  assert.equal(typeof X.qrEncode,'function','swimmer-invite-bn.js must expose its inline encoder for testing (X.qrEncode)');
  assert.equal(typeof X.drawQr,'function','swimmer-invite-bn.js must expose its inline draw helper for testing (X.drawQr)');

  // A realistic invite URL: the exact shape msos_create_swimmer_invite produces (32 random bytes, hex-encoded
  // -> 64 hex chars) appended to the real swimmer-portal.html path.
  const token='4bce091b5d6a630244a389d78f29d009097a2a69c95b2d2f2704a1416d192688'.slice(0,64);
  const url=`https://example.test/swimmer-portal.html?invite=${token}`;

  const QR_LEVEL_M=0;
  const result=X.qrEncode(url,QR_LEVEL_M);
  assert.ok(Number.isInteger(result.moduleCount)&&result.moduleCount>=21,'a QR symbol must be at least version 1 size (21x21 modules)');
  assert.equal(result.moduleCount,result.version*4+17,'moduleCount must match the spec formula for the chosen version -- version*4+17');
  assert.equal(typeof result.isDark,'function');

  // Real, spec-defined structural invariant, independent of which of the 8 masks got picked: every QR symbol
  // has an identical 7x7 finder pattern (a ring: dark border, light ring, dark 3x3 core) at all three
  // finder-pattern corners. Finder-pattern modules are never masked, so this must hold for ANY valid output.
  const FINDER_7x7=[
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1],
  ];
  const size=result.moduleCount;
  for(let r=0;r<7;r++){
    for(let c=0;c<7;c++){
      assert.equal(result.isDark(r,c),FINDER_7x7[r][c]===1,`top-left finder pattern mismatch at (${r},${c})`);
      assert.equal(result.isDark(r,size-7+c),FINDER_7x7[r][c]===1,`top-right finder pattern mismatch at (${r},${c})`);
      assert.equal(result.isDark(size-7+r,c),FINDER_7x7[r][c]===1,`bottom-left finder pattern mismatch at (${r},${c})`);
    }
  }

  // Determinism: encoding the exact same input twice must produce the exact same matrix.
  const again=X.qrEncode(url,QR_LEVEL_M);
  assert.equal(again.moduleCount,result.moduleCount);
  assert.equal(again.version,result.version);
  assert.equal(again.maskPattern,result.maskPattern);
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)assert.equal(again.isDark(r,c),result.isDark(r,c),`non-deterministic output at (${r},${c})`);

  console.log('QR_INLINE_ENCODER_VALID_MATRIX_PASS');
}

function runDrawQrPaintsACanvasWithoutAnyExternalLoad(){
  // drawQr() must work synchronously against a plain DOM element -- no await, no network, no global lookup.
  const X=bootForEncode();
  const fillRectCalls=[];
  const ctx={fillStyle:'',fillRect:(...args)=>fillRectCalls.push(args)};
  const canvas={width:0,height:0,getContext:()=>ctx};
  const appended=[];
  const el={
    innerHTML:'',
    appendChild:node=>appended.push(node),
  };
  const realCreateElement=global.document.createElement;
  global.document.createElement=tag=>{assert.equal(tag,'canvas','drawQr must only ever create a canvas element, nothing else');return canvas;};
  X.drawQr(el,'https://example.test/swimmer-portal.html?invite=abc123',240,240);
  global.document.createElement=realCreateElement;

  assert.equal(appended.length,1,'drawQr must append exactly one canvas element');
  assert.equal(appended[0],canvas);
  assert.ok(fillRectCalls.length>1,'drawQr must actually paint the QR modules onto the canvas');

  console.log('QR_DRAW_SYNCHRONOUS_NO_EXTERNAL_LOAD_PASS');
}

function runFailBefore(){
  // The old, superseded call site depended on a global QRCode loaded from somewhere else (first a CDN, then
  // a second same-origin file) rather than defining its own encoder inline. This must fail this test's checks
  // -- whichever specific check catches it first -- proving this test would have caught either superseded
  // shape, not just the exact wording of the current fix.
  const buggyFragment=`try{const Q=await loadQr();if(gen.cancelled)return;new Q(qr,{text:activeUrl,width:240,height:240,correctLevel:Q.CorrectLevel?.M});}`;
  assert.throws(()=>assertNoExternalRendererDependency(buggyFragment,'pre-fix source'),AssertionError=>AssertionError instanceof assert.AssertionError,'pre-fix source: this test must actually fail against the old CDN/global-dependent call site, proving it would have caught this exact class of dependency');
  assert.ok(/g\.QRCode|window\.QRCode|loadQr/.test(buggyFragment)&&!/function qrEncode\(/.test(buggyFragment),'sanity check: the buggy fragment must genuinely lack an inline encoder and depend on an external global, matching what both superseded builds actually shipped');
  console.log('QR_NO_EXTERNAL_DEPENDENCY_FAILBEFORE_PASS');
}

(function(){
  runNoExternalRendererDependencyInRealSource();
  runInlineEncoderProducesAValidMatrix();
  runDrawQrPaintsACanvasWithoutAnyExternalLoad();
  runFailBefore();
  require('node:child_process').execFileSync(process.execPath,['--check',invitePath],{stdio:'pipe'});
  process.exit(0);
})();
