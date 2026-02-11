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

// Handle push: if app is focused, forward via postMessage; otherwise show notification
self.addEventListener("push", (event) => {
  const payload = event.data?.json() || {};
  console.log("[SW] Push received:", payload);

  const data = payload.data || {};
  const title = data.title || payload.notification?.title || "TranspoGest";
  const body = data.body || payload.notification?.body || "";
  const route = data.route || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const focusedClient = windowClients.find((c) => c.visibilityState === "visible");

      if (focusedClient) {
        // App is open — send to app, don't show system notification
        console.log("[SW] App is focused, forwarding via postMessage");
        focusedClient.postMessage({
          type: "PUSH_FOREGROUND",
          title,
          body,
          route,
        });
        // Don't show notification — app will handle display
      } else {
        // App is closed/background — show system notification
        console.log("[SW] App is in background, showing notification");
        self.registration.showNotification(title, {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          data: { url: route },
        });
      }
    })
  );
});

// Prevent Firebase SDK from also showing a notification
messaging.onBackgroundMessage(() => {
  // Handled by push event above — do nothing here
});

// Handle notification click
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
