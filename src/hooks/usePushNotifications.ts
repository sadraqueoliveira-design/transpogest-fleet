import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestNotificationPermission, getFirebaseMessaging, onMessage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);
  const listenerSet = useRef(false);

  // Foreground message listener — always set up, independent of token registration
  useEffect(() => {
    if (listenerSet.current) return;

    const setupListener = async () => {
      try {
        const messaging = await getFirebaseMessaging();
        if (!messaging) return;

        listenerSet.current = true;
        console.log("[PUSH] Foreground listener registered");

        onMessage(messaging, (payload) => {
          console.log("[PUSH] Foreground message received:", payload);
          const { title, body } = payload.notification || {};
          const route = payload.data?.route || "/";

          // Vibrate if supported
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

          // Show native notification even in foreground
          if (Notification.permission === "granted") {
            const n = new Notification(title || "TranspoGest", {
              body: body || "",
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              tag: "foreground-" + Date.now(),
            });
            n.onclick = () => {
              window.focus();
              if (route !== "/") window.location.href = route;
              n.close();
            };
          }

          // Also show in-app toast
          toast.info(title || "Notificação", { description: body });
        });
      } catch (err) {
        console.error("[PUSH] Foreground listener error:", err);
      }
    };

    setupListener();
  }, []);

  // Token registration
  useEffect(() => {
    if (!user || registered.current) return;

    const register = async () => {
      try {
        const { data: vapidData, error: vapidError } = await supabase.functions.invoke("get-vapid-key");
        if (vapidError || !vapidData?.vapidKey) {
          console.error("Failed to get VAPID key:", vapidError);
          return;
        }
        const token = await requestNotificationPermission(vapidData.vapidKey);
        if (!token) return;

        await supabase.from("user_fcm_tokens").upsert(
          { user_id: user.id, token, device_type: "web", last_active_at: new Date().toISOString() },
          { onConflict: "token" }
        );

        registered.current = true;
        console.log("[PUSH] FCM token registered");
      } catch (err) {
        console.error("[PUSH] Push registration failed:", err);
      }
    };

    register();
  }, [user]);
}
