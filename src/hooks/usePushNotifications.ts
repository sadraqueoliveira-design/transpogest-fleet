import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestNotificationPermission, getFirebaseMessaging } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);
  const listenerSet = useRef(false);

  useEffect(() => {
    // Listen for foreground messages from service worker via postMessage
    if (!listenerSet.current) {
      listenerSet.current = true;
      console.log("[PUSH] Setting up SW postMessage listener...");

      const handleSWMessage = (event: MessageEvent) => {
        if (event.data?.type !== "PUSH_FOREGROUND") return;

        const { title, body, route } = event.data;
        console.log("[PUSH] 🔔 Foreground push received:", title, body);

        // Vibrate
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

        // Show native notification
        if (Notification.permission === "granted") {
          try {
            const n = new Notification(title || "TranspoGest", {
              body: body || "",
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              tag: "fg-" + Date.now(),
              requireInteraction: true,
            });
            n.onclick = () => {
              window.focus();
              if (route && route !== "/") window.location.href = route;
              n.close();
            };
          } catch (e) {
            console.error("[PUSH] Native notification failed:", e);
          }
        }

        // Show in-app toast
        toast.info(title || "Notificação", { description: body, duration: 10000 });
      };

      navigator.serviceWorker?.addEventListener("message", handleSWMessage);
      console.log("[PUSH] ✅ Foreground listener active (postMessage)");
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
