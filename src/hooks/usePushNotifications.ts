import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Detect if running inside Capacitor native shell
const isNative = () => {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

export function usePushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);
  const listenerSet = useRef(false);

  // Save token to profiles.fcm_token AND user_fcm_tokens (backward compat)
  const saveToken = useCallback(
    async (token: string) => {
      if (!user) return;
      console.log("[PUSH] Saving token for user:", user.id);

      // Update profiles.fcm_token
      await supabase
        .from("profiles")
        .update({ fcm_token: token } as any)
        .eq("id", user.id);

      // Also upsert into user_fcm_tokens for backward compatibility
      await supabase.from("user_fcm_tokens").upsert(
        {
          user_id: user.id,
          token,
          device_type: isNative() ? "android" : "web",
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "token" }
      );

      registered.current = true;
      console.log("[PUSH] ✅ Token saved successfully");
    },
    [user]
  );

  // ── NATIVE (Capacitor) ──────────────────────────────────────────
  const registerNative = useCallback(async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      console.log("[PUSH] Native permission result:", permResult.receive);

      if (permResult.receive !== "granted") {
        console.warn("[PUSH] Native permission denied");
        return;
      }

      // Register for push
      await PushNotifications.register();

      // Listen for token
      PushNotifications.addListener("registration", async (tokenData) => {
        console.log("[PUSH] 🔑 Native FCM token:", tokenData.value?.substring(0, 20) + "...");
        await saveToken(tokenData.value);
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("[PUSH] Native registration error:", err);
      });

      // Foreground notification
      PushNotifications.addListener("pushNotificationReceived", (notification) => {
        console.log("[PUSH] 🔔 Native foreground notification:", notification);
        const title = notification.title || "TranspoGest";
        const body = notification.body || "";

        // Vibrate
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

        // In-app toast
        toast.info(title, { description: body, duration: 10000 });
      });

      // Notification tapped
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        console.log("[PUSH] 📲 Notification tapped:", action);
        const route = action.notification.data?.route;
        if (route && route !== "/") {
          window.location.href = route;
        }
      });

      console.log("[PUSH] ✅ Native listeners configured");
    } catch (err) {
      console.error("[PUSH] Native registration failed:", err);
    }
  }, [saveToken]);

  // ── WEB (Firebase SDK) ──────────────────────────────────────────
  const registerWeb = useCallback(async () => {
    try {
      // Set up SW postMessage listener for foreground
      if (!listenerSet.current) {
        listenerSet.current = true;

        const handleSWMessage = (event: MessageEvent) => {
          if (event.data?.type !== "PUSH_FOREGROUND") return;
          const { title, body, route } = event.data;
          console.log("[PUSH] 🔔 Web foreground push:", title, body);

          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

          // Native notification
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

          toast.info(title || "Notificação", { description: body, duration: 10000 });
        };

        navigator.serviceWorker?.addEventListener("message", handleSWMessage);
        console.log("[PUSH] ✅ Web foreground listener active");
      }

      // Token registration via Firebase SDK
      const { requestNotificationPermission } = await import("@/lib/firebase");
      const { data: vapidData, error: vapidError } = await supabase.functions.invoke("get-vapid-key");
      if (vapidError || !vapidData?.vapidKey) {
        console.error("[PUSH] Failed to get VAPID key:", vapidError);
        return;
      }

      const token = await requestNotificationPermission(vapidData.vapidKey);
      if (!token) return;

      await saveToken(token);
    } catch (err) {
      console.error("[PUSH] Web registration failed:", err);
    }
  }, [saveToken]);

  // ── Main effect ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user || registered.current) return;

    if (isNative()) {
      registerNative();
    } else {
      registerWeb();
    }
  }, [user, registerNative, registerWeb]);
}
