import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCxlrFjkYNLhzZm1koUzuSgpgAp6XsXgdc",
  authDomain: "transpogest.firebaseapp.com",
  projectId: "transpogest",
  storageBucket: "transpogest.firebasestorage.app",
  messagingSenderId: "269125670853",
  appId: "1:269125670853:web:a61f5476b316603bf89dac",
  measurementId: "G-KFT18Y478H",
};

const app = initializeApp(firebaseConfig);

let messagingInstance: ReturnType<typeof getMessaging> | null = null;

export async function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported();
  if (!supported) {
    console.warn("Firebase Messaging not supported in this browser");
    return null;
  }
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

export async function requestNotificationPermission(vapidKey: string): Promise<string | null> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.warn("Notification permission denied");
    return null;
  }

  // Wait for service worker registration
  const sw = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: sw,
  });
  return token;
}

export { onMessage };
