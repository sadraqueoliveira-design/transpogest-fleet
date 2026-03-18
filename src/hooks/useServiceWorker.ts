import { useState, useEffect, useCallback } from "react";

export function useServiceWorker() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      // New SW activated, reload
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      setRegistration(reg);

      const awaitStateChange = (sw: ServiceWorker) => {
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed") {
            setNeedRefresh(true);
          }
        });
      };

      if (reg.waiting) {
        setNeedRefresh(true);
      }

      if (reg.installing) {
        awaitStateChange(reg.installing);
      }

      reg.addEventListener("updatefound", () => {
        if (reg.installing) {
          awaitStateChange(reg.installing);
        }
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const updateApp = useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }, [registration]);

  const forceRefresh = useCallback(() => {
    if (registration) {
      registration.update().then(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }, [registration]);

  return { needRefresh, updateApp, forceRefresh };
}
