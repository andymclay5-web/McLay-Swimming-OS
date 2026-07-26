"use strict";

const CACHE_NAME = "mclay-swimming-os-coach-v3-7-1-20260726";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=20260726-coach361",
  "./config.js",
  "./seed.js",
  "./app.js?v=20260726-coach371",
  "./manifest.webmanifest"
];

// Source result files are processed in memory and are never written to the PWA
// cache. Only accepted rows are committed to Supabase.
const EPHEMERAL_RESULT_FILE = /\.(csv|tsv|txt|sd3|hy3|zip)$/i;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("mclay-swimming-os-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin)return;
  if(EPHEMERAL_RESULT_FILE.test(url.pathname)){
    event.respondWith(fetch(request,{cache:"no-store"}));
    return;
  }
  event.respondWith(fetch(request).then(response=>{
    if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request.mode==="navigate"?"./index.html":request,copy))}
    return response;
  }).catch(()=>request.mode==="navigate"?caches.match("./index.html"):caches.match(request)));
});
