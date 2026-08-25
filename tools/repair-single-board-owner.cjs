'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');

function read(name){return fs.readFileSync(path.join(root,name),'utf8')}
function write(name,s){fs.writeFileSync(path.join(root,name),s)}
function mustReplace(s,from,to,label){if(!s.includes(from))throw new Error(`Missing ${label||from}`);return s.replace(from,to)}

// 1) Physically remove the legacy Board/TV implementation from app.js.
{
  const file='app.js';
  let s=read(file);
  const uiStart=s.indexOf('const UI=M.ui=M.ui||{};');
  if(uiStart<0)throw new Error('app.js UI core marker not found');
  const boardStart=s.indexOf(' function composition(item){',uiStart);
  const bindStart=s.indexOf(' UI.bindBoard=()=>{',boardStart);
  const boardEndMarker='\n };\n})(globalThis);';
  const boardEnd=s.indexOf(boardEndMarker,bindStart);
  if(boardStart<0||bindStart<0||boardEnd<0)throw new Error('app.js legacy Board markers not found');
  s=s.slice(0,boardStart)+' // Board rendering is owned exclusively by engines/board.js.\n'+s.slice(boardEnd+4);
  const tvStart=s.indexOf(' UI.renderTV=()=>{');
  if(tvStart>=0){const tvEnd=s.indexOf('\n',tvStart);s=s.slice(0,tvStart)+' // TV rendering is owned exclusively by engines/board.js.'+s.slice(tvEnd)}
  if(/UI\.renderBoard\s*=/.test(s))throw new Error('app.js legacy Board owner still present');
  if(/UI\.renderTV\s*=/.test(s))throw new Error('app.js legacy TV owner still present');
  write(file,s);
}

// 2) Physically remove the second legacy Board owner from v4-poolside-core.js.
{
  const file='v4-poolside-core.js';
  let s=read(file);
  const start=s.indexOf('  UI.renderBoard=()=>{');
  if(start<0)throw new Error('poolside legacy Board owner marker not found');
  const end=s.indexOf('\n  };\n',start);
  if(end<0)throw new Error('poolside legacy Board owner end marker not found');
  s=s.slice(0,start)+'  // Board rendering is owned exclusively by engines/board.js.\n'+s.slice(end+'\n  };\n'.length);
  if(/UI\.renderBoard\s*=/.test(s))throw new Error('poolside legacy Board owner still present');
  write(file,s);
}

// 3) Give the Board-critical runtime one coherent asset generation.
const tag='20260826-board-single-owner';
{
  let s=read('index.html');
  const pairs=[
    ['app.js?v=20260821ak-cache',`app.js?v=${tag}`],
    ['v4-poolside-core.js?v=20260819f-targettruth',`v4-poolside-core.js?v=${tag}`],
    ['engines/evidence.js?v=20260825-owner',`engines/evidence.js?v=${tag}`],
    ['engines/race-pace.js?v=20260820aa',`engines/race-pace.js?v=${tag}`],
    ['engines/modification.js?v=20260821ak-cache',`engines/modification.js?v=${tag}`],
    ['engines/coordinator.js?v=20260824-authority',`engines/coordinator.js?v=${tag}`],
    ['engines/board.js?v=20260825tv',`engines/board.js?v=${tag}`]
  ];
  for(const [a,b] of pairs)s=mustReplace(s,a,b,'index asset identity');
  write('index.html',s);
}
{
  let s=read('sw.js');
  const pairs=[
    ['app.js?v=20260821ak-cache',`app.js?v=${tag}`],
    ['v4-poolside-core.js?v=20260819f-targettruth',`v4-poolside-core.js?v=${tag}`],
    ['engines/evidence.js?v=20260825-owner',`engines/evidence.js?v=${tag}`],
    ['engines/race-pace.js?v=20260820aa',`engines/race-pace.js?v=${tag}`],
    ['engines/modification.js?v=20260821ak-cache',`engines/modification.js?v=${tag}`],
    ['engines/coordinator.js?v=20260824-authority',`engines/coordinator.js?v=${tag}`],
    ['engines/board.js?v=20260825tv',`engines/board.js?v=${tag}`]
  ];
  for(const [a,b] of pairs)s=mustReplace(s,a,b,'service-worker asset identity');
  write('sw.js',s);
}

// 4) Update existing release hashes for changed protected files, without weakening the manifest.
{
  const files=['index.html','app.js','v4-poolside-core.js','sw.js'];
  let sums=read('SHA256SUMS.txt');
  for(const file of files){
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
    const re=new RegExp(`^[0-9a-f]{64}  ${file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'m');
    if(!re.test(sums))throw new Error(`SHA256SUMS entry missing for ${file}`);
    sums=sums.replace(re,`${hash}  ${file}`);
  }
  write('SHA256SUMS.txt',sums);
}

// 5) Hard architecture proof: one executable Board owner in runtime source.
const runtime=['app.js','v4-poolside-core.js','engines/board.js'];
const owners=[];
for(const file of runtime){const s=read(file);for(const m of s.matchAll(/UI\.renderBoard\s*=/g))owners.push(file)}
if(owners.length!==1||owners[0]!=='engines/board.js')throw new Error(`Board owners must be exactly engines/board.js; found ${owners.join(', ')||'none'}`);
const board=read('engines/board.js');
if(!/UI\.renderBoard\s*=\s*render/.test(board))throw new Error('Dedicated Board engine is not the Board owner');
if(!/v4-board-whiteboard-20260825tv/.test(board))throw new Error('Expected good whiteboard Board engine not present');

console.log('Single Board owner repair complete: legacy Board implementations removed; engines/board.js is sole owner.');
