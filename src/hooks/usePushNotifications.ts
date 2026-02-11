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
    // Always set up foreground listener (independent of user/token)
    if (!listenerSet.current) {
      listenerSet.current = true;
      getFirebaseMessaging().then((messaging) => {
        if (!messaging) return;
        console.log("[PUSH] Foreground listener registered");
        onMessage(messaging, (payload) => {
          console.log("[PUSH] Foreground message received:", payload);
          const { title, body } = payload.notification || {};
          const route = payload.data?.route || "/";
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
          toast.info(title || "Notificação", { description: body });
        });
      }).catch((err) => console.error("[PUSH] Foreground listener error:", err));
    }

    // Token registration (needs user)
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
