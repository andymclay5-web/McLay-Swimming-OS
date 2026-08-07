"use strict";
const CACHE_NAME="mclay-swimming-os-v3-20-10-poolside-foreground-freeze-repair-20260807";
const BUILD="3.20.10-poolside-foreground-freeze-repair-20260807";
const CORE=["./","./index.html","./styles.css?v=20260807-core3210","./app.js?v=20260807-core3210","./config.js","./seed.js","./manifest.webmanifest","./icon-192.png","./icon-512.png","./monthly_calendar.json"];
async function cacheResponse(cache,key,response){if(response&&response.ok){await cache.put(key,response.clone())}return response}
async function fetchFresh(request){return fetch(request,{cache:"no-store"})}
self.addEventListener("install",event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  for(const url of CORE){const request=new Request(url,{cache:"reload"}),response=await fetch(request);if(!response.ok)throw new Error(`Core cache failed ${url}: ${response.status}`);await cache.put(request,response.clone())}
  await self.skipWaiting();
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith("mclay-swimming-os-")&&key!==CACHE_NAME)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("message",event=>{
  if(event.data==="SKIP_WAITING")self.skipWaiting();
  if(event.data==="MCLAY_BUILD?")event.source?.postMessage?.({type:"MCLAY_BUILD",build:BUILD});
});
self.addEventListener("fetch",event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=="GET"||url.origin!==self.location.origin)return;
  if(/\/(rest|auth|storage|functions)\/v1\//.test(url.pathname))return;
  if(req.mode==="navigate"){
    // Phone-call/app-switch recovery must never wait for mobile data to wake up.
    // Return the installed shell immediately, then refresh it in the background.
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME),cached=await cache.match("./index.html");
      if(cached)return cached;
      try{return await cacheResponse(cache,new Request("./index.html"),await fetchFresh(req))}catch{return Response.error()}
    })());
    event.waitUntil((async()=>{try{const cache=await caches.open(CACHE_NAME);await cacheResponse(cache,new Request("./index.html"),await fetchFresh(req))}catch{}})());
    return;
  }
  // Core/static files are also instant from the installed build. Network refresh
  // is background-only so returning from a call cannot present a white screen.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME),cached=await cache.match(req);
    if(cached){event.waitUntil((async()=>{try{await cacheResponse(cache,req,await fetchFresh(req))}catch{}})());return cached}
    try{return await cacheResponse(cache,req,await fetchFresh(req))}catch{return Response.error()}
  })());
});
