import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { hapticTap } from "@/lib/haptics";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed this session
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    hapticTap();
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-20 inset-x-4 z-40 animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg">
        <Download className="h-6 w-6 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-card-foreground">Instalar TranspoGest</p>
          <p className="text-xs text-muted-foreground">Acesso rápido sem browser</p>
        </div>
        <Button size="sm" onClick={handleInstall} className="h-10 min-h-[44px] px-4">
          Instalar
        </Button>
        <button onClick={() => setDismissed(true)} className="text-muted-foreground p-1">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
