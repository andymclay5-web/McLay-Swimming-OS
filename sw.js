"use strict";

const CACHE_NAME = "mclay-swimming-os-coach-v3-3-20260725";
const CORE = [
  "./",
  "./index.html",
  "./styles.css?v=20260725-coach33",
  "./config.js",
  "./seed.js",
  "./app.js?v=20260725-coach33",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("mclay-swimming-os-") && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if(request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then(response => {
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request.mode === "navigate" ? "./index.html" : request, copy));
      }
      return response;
    }).catch(() => request.mode === "navigate" ? caches.match("./index.html") : caches.match(request))
  );
});
