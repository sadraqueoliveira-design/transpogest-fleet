/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCxlrFjkYNLhzZm1koUzuSgpgAp6XsXgdc",
  authDomain: "transpogest.firebaseapp.com",
  projectId: "transpogest",
  storageBucket: "transpogest.firebasestorage.app",
  messagingSenderId: "269125670853",
  appId: "1:269125670853:web:a61f5476b316603bf89dac",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background message:", payload);
  // Use data fields (data-only messages) or notification fields
  const title = payload.data?.title || payload.notification?.title || "TranspoGest";
  const body = payload.data?.body || payload.notification?.body || "";
  const icon = payload.notification?.icon || "/pwa-192x192.png";
  const route = payload.data?.route || "/";

  self.registration.showNotification(title, {
    body,
    icon,
    badge: "/pwa-192x192.png",
    data: { url: route },
  });
});

// Handle notification click - open the deep-link URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
