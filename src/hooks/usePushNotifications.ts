import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestNotificationPermission, getFirebaseMessaging, onMessage } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const VAPID_KEY = "VUC53U5NLEnv77O6HngJrhg0-uEsUZ1_hi6pyKGKFAU";

export function usePushNotifications() {
  const { user } = useAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (!user || registered.current || !VAPID_KEY) return;

    const register = async () => {
      try {
        const token = await requestNotificationPermission(VAPID_KEY);
        if (!token) return;

        // Upsert token in database
        await supabase.from("user_fcm_tokens").upsert(
          { user_id: user.id, token, device_type: "web", last_active_at: new Date().toISOString() },
          { onConflict: "token" }
        );

        registered.current = true;
        console.log("FCM token registered");

        // Listen for foreground messages
        const messaging = await getFirebaseMessaging();
        if (messaging) {
          onMessage(messaging, (payload) => {
            console.log("Foreground message:", payload);
            const { title, body } = payload.notification || {};
            toast.info(title || "Notificação", { description: body });
          });
        }
      } catch (err) {
        console.error("Push registration failed:", err);
      }
    };

    register();
  }, [user]);
}
