"use strict";
const CACHE_NAME="mclay-swimming-os-v3-10-3-recovery-20260728";
const CORE=["./","./index.html","./styles.css?v=20260728-recovery3103","./app.js?v=20260728-recovery3103","./config.js","./seed.js","./manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith("mclay-swimming-os-")&&key!==CACHE_NAME)await caches.delete(key);
  const cache=await caches.open(CACHE_NAME);
  for(const url of CORE){try{const request=new Request(url,{cache:"reload"}),response=await fetch(request);if(response.ok)await cache.put(request,response.clone())}catch(error){console.warn("Optional install cache skipped",url,error)}}
  await self.skipWaiting();
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE_NAME)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener("message",event=>{if(event.data==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",event=>{const req=event.request,url=new URL(req.url);if(req.method!=="GET"||url.origin!==self.location.origin)return;if(/\/(rest|auth|storage|functions)\/v1\//.test(url.pathname))return;event.respondWith((async()=>{try{const response=await fetch(req,{cache:"no-store"});if(response&&response.ok){const cache=await caches.open(CACHE_NAME);const key=req.mode==="navigate"?new Request("./index.html"):req;await cache.put(key,response.clone())}return response}catch(error){const cache=await caches.open(CACHE_NAME);return (req.mode==="navigate"?await cache.match("./index.html"):await cache.match(req))||Response.error()}})())});
