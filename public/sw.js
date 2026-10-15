self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data; try { data=event.data?.json(); } catch { data=null; }
  event.waitUntil(self.registration.showNotification(data?.title || 'SITPA · Aviso', {
    body:data?.body || 'Abre SITPA para consultar la información actual.', icon:'sitpa-icon-192.png',
    tag:data?.tag || 'sitpa', renotify:true, data:{at:data?.at}
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const current = clients[0];
    return current ? current.focus() : self.clients.openWindow("./index.html");
  }));
});
