import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { hapticSuccess } from "@/lib/haptics";

interface QueueItem {
  id: string;
  table: string;
  payload: Record<string, any>;
  createdAt: number;
  /** Optional files to upload before inserting (key = field that gets the URL) */
  files?: { bucket: string; path: string; fieldKey: string; blob: string }[];
}

const STORAGE_KEY = "transpogest_offline_queue";

function loadQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(loadQueue().length);
  const syncingRef = useRef(false);

  // Track online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Process queue when we come back online
  const processQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    let synced = 0;
    const remaining: QueueItem[] = [];

    for (const item of queue) {
      try {
        const payload = { ...item.payload };

        // Upload any stored files first
        if (item.files) {
          for (const file of item.files) {
            const blob = await fetch(file.blob).then(r => r.blob()).catch(() => null);
            if (blob) {
              const { error } = await supabase.storage.from(file.bucket).upload(file.path, blob);
              if (!error) {
                const { data } = supabase.storage.from(file.bucket).getPublicUrl(file.path);
                payload[file.fieldKey] = data.publicUrl;
              }
            }
          }
        }

        const { error } = await supabase.from(item.table as any).insert(payload as any);
        if (error) {
          console.error("Offline sync error:", error);
          remaining.push(item);
        } else {
          synced++;
        }
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    setPendingCount(remaining.length);
    syncingRef.current = false;

    if (synced > 0) {
      hapticSuccess();
      toast.success(`${synced} registo(s) sincronizado(s) automaticamente`, {
        icon: "🔄",
        duration: 4000,
      });
    }
  }, []);

  // Auto-sync when online
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // Also try periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) processQueue();
    }, 30000);
    return () => clearInterval(interval);
  }, [processQueue]);

  /**
   * Enqueue a record. If online, tries to insert directly.
   * If offline (or insert fails due to network), saves to local queue.
   * Returns true if saved (online or offline).
   */
  const enqueue = useCallback(
    async (
      table: string,
      payload: Record<string, any>,
      options?: { files?: QueueItem["files"] }
    ): Promise<boolean> => {
      // If online, try direct insert
      if (navigator.onLine) {
        try {
          const finalPayload = { ...payload };

          // Upload files if present
          if (options?.files) {
            for (const file of options.files) {
              const blob = await fetch(file.blob).then(r => r.blob()).catch(() => null);
              if (blob) {
                const { error } = await supabase.storage.from(file.bucket).upload(file.path, blob);
                if (!error) {
                  const { data } = supabase.storage.from(file.bucket).getPublicUrl(file.path);
                  finalPayload[file.fieldKey] = data.publicUrl;
                }
              }
            }
          }

          const { error } = await supabase.from(table as any).insert(finalPayload as any);
          if (!error) return true;
          // If it's a network error, fall through to offline queue
          if (!error.message.includes("Failed to fetch") && !error.message.includes("NetworkError")) {
            throw error;
          }
        } catch (err: any) {
          // Non-network errors should be thrown
          if (err?.code && !err.message?.includes("fetch")) {
            throw err;
          }
        }
      }

      // Save to offline queue
      const item: QueueItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        table,
        payload,
        createdAt: Date.now(),
        files: options?.files,
      };

      const queue = loadQueue();
      queue.push(item);
      saveQueue(queue);
      setPendingCount(queue.length);

      toast.info("Salvo Offline — será enviado automaticamente ao reconectar", {
        icon: "📴",
        duration: 4000,
      });

      return true;
    },
    []
  );

  return { isOnline, pendingCount, enqueue, processQueue };
}
