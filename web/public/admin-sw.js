// Admin portal service worker: shows alerts (Web Push) while the portal is closed or the phone is asleep, and opens the right page on tap.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Unique Futsal Admin", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(
    self.registration.showNotification(d.title || "Unique Futsal Admin", {
      body: d.body || "",
      tag: d.tag || undefined,
      renotify: true,
      requireInteraction: !!d.urgent, // orders and emergencies stay on screen until answered
      vibrate: d.urgent ? [400, 150, 400, 150, 400] : [250, 120, 250],
      icon: "/logo-mark.png",
      badge: "/logo-mark.png",
      data: { href: d.href || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/dashboard";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) { try { await c.navigate(href); } catch { /* cross-origin */ } } return; }
    }
    await self.clients.openWindow(href);
  })());
});
