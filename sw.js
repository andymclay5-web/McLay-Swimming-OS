'use strict';
const BUILD='v4-final-acceptance-20260825a';
const CACHE='mclay-swimming-os-v4-coherent-20260826-r2';
const STATIC=[
  './','./index.html','./swimmer-portal.html','./swimmer-portal.css?v=20260824bn','./swimmer-portal.js?v=20260824cu',
  './manifest.webmanifest','./config.js','./seed.js','./icon-192.png','./icon-512.png','./monthly_calendar.json',
  './morning-board.html','./morning-board.css?v=20260818b','./morning-board.js?v=20260818b',
  './engines/session-truth.js?v=20260818c','./engines/morning-coaching.js?v=20260818c'
];
const localAsset=value=>{try{const u=new URL(value,self.location.href);return u.origin===self.location.origin?u.href:null}catch{return null}};
async function activeRuntime(){
  const r=await fetch('./index.html',{cache:'reload'});if(!r.ok)throw new Error(`precache failed ./index.html ${r.status}`);
  const text=await r.clone().text(),urls=[];
  for(const m of text.matchAll(/(?:src|href)="([^"]+)"/g)){const u=localAsset(m[1]);if(u)urls.push(u)}
  return{index:r,urls:[...new Set(urls)]};
}
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(CACHE),runtime=await activeRuntime();
  await c.put('./index.html',runtime.index.clone());
  const urls=[...new Set([...STATIC.map(localAsset).filter(Boolean),...runtime.urls])];
  for(const url of urls){const r=await fetch(url,{cache:'reload'});if(!r.ok)throw new Error(`precache failed ${url} ${r.status}`);await c.put(url,r)}
  self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('mclay-swimming-os-v4-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
async function refresh(req,key=req){try{const r=await fetch(req,{cache:'no-store'});if(r&&r.ok){const c=await caches.open(CACHE);await c.put(key,r.clone())}return r}catch{return null}}
async function immediateCached(req,key=req){const cached=await caches.match(key);if(cached){refresh(req,key);return cached}return(await refresh(req,key))||Response.error()}
async function cacheFirst(req){const cached=await caches.match(req);if(cached)return cached;return(await refresh(req,req))||Response.error()}
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;if(/\/rest\/v1\/|\/auth\/v1\/|\/storage\/v1\/|\/functions\/v1\//.test(u.pathname))return;
  if(e.request.mode==='navigate'){const key=u.pathname.endsWith('/morning-board.html')?'./morning-board.html':u.pathname.endsWith('/swimmer-portal.html')?'./swimmer-portal.html':'./index.html';e.respondWith(immediateCached(e.request,key));return}
  if(/\.(?:js|css)$/.test(u.pathname)){e.respondWith(immediateCached(e.request));return}
  e.respondWith(cacheFirst(e.request));
});
self.addEventListener('message',e=>{if(e.data?.type==='MSOS_BUILD')e.source?.postMessage?.({type:'MSOS_BUILD',build:BUILD,cache:CACHE})});
