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
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "TranspoGest", {
    body: body || "",
    icon: icon || "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
  });
});
