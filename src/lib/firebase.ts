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
  try {
    console.log("[PUSH] Starting requestNotificationPermission...");
    
    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.error("[PUSH] Firebase Messaging not supported");
      return null;
    }
    console.log("[PUSH] Messaging instance obtained");

    console.log("[PUSH] Current permission:", Notification.permission);
    const permission = await Notification.requestPermission();
    console.log("[PUSH] Permission result:", permission);
    
    if (permission !== "granted") {
      console.warn("[PUSH] Notification permission denied");
      return null;
    }

    // Wait for service worker registration
    console.log("[PUSH] Registering service worker...");
    const sw = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    console.log("[PUSH] Service worker registered, getting token...");
    
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: sw,
    });
    console.log("[PUSH] Token obtained:", token ? token.substring(0, 20) + "..." : "null");
    return token;
  } catch (err) {
    console.error("[PUSH] Error in requestNotificationPermission:", err);
    throw err;
  }
}

export { onMessage };
