import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestNotificationPermission, getFirebaseMessaging, onMessage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);
  const listenerSet = useRef(false);

  useEffect(() => {
    // Always set up foreground listener
    if (!listenerSet.current) {
      listenerSet.current = true;
      console.log("[PUSH] Setting up foreground listener...");
      
      getFirebaseMessaging().then((messaging) => {
        if (!messaging) {
          console.warn("[PUSH] Messaging not supported, skipping listener");
          return;
        }
        console.log("[PUSH] ✅ Foreground listener active");
        
        onMessage(messaging, (payload) => {
          console.log("[PUSH] 🔔 Foreground message received:", JSON.stringify(payload));
          const title = payload.notification?.title || payload.data?.title || "TranspoGest";
          const body = payload.notification?.body || payload.data?.body || "";
          const route = payload.data?.route || "/";

          // Vibrate
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
            console.log("[PUSH] Vibrated");
          }

          // Native notification
          if (Notification.permission === "granted") {
            try {
              const n = new Notification(title, {
                body,
                icon: "/pwa-192x192.png",
                badge: "/pwa-192x192.png",
                tag: "fg-" + Date.now(),
                requireInteraction: true,
              });
              n.onclick = () => {
                window.focus();
                if (route !== "/") window.location.href = route;
                n.close();
              };
              console.log("[PUSH] Native notification shown");
            } catch (e) {
              console.error("[PUSH] Native notification failed:", e);
            }
          } else {
            console.warn("[PUSH] Notification permission:", Notification.permission);
          }

          // Toast
          toast.info(title, { description: body, duration: 10000 });
          console.log("[PUSH] Toast shown");
        });
      }).catch((err) => {
        console.error("[PUSH] Listener setup error:", err);
        listenerSet.current = false;
      });
    }

    // Token registration
    if (!user || registered.current) return;

    const register = async () => {
      try {
        const { data: vapidData, error: vapidError } = await supabase.functions.invoke("get-vapid-key");
        if (vapidError || !vapidData?.vapidKey) {
          console.error("[PUSH] Failed to get VAPID key:", vapidError);
          return;
        }
        const token = await requestNotificationPermission(vapidData.vapidKey);
        if (!token) return;

        await supabase.from("user_fcm_tokens").upsert(
          { user_id: user.id, token, device_type: "web", last_active_at: new Date().toISOString() },
          { onConflict: "token" }
        );

        registered.current = true;
        console.log("[PUSH] FCM token registered for user:", user.id);
      } catch (err) {
        console.error("[PUSH] Registration failed:", err);
      }
    };

    register();
  }, [user]);
}
