import { useState, useEffect } from "react";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";
import { hapticTap } from "@/lib/haptics";

export default function UpdatePrompt() {
  const { needRefresh, updateApp } = useServiceWorker();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (needRefresh) {
      setVisible(true);
      setFading(false);
      const fadeTimer = setTimeout(() => setFading(true), 9000);
      const hideTimer = setTimeout(() => setVisible(false), 10000);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
    setVisible(false);
  }, [needRefresh]);

  if (!visible) return null;

  return (
    <div className={`fixed top-16 inset-x-4 z-50 transition-opacity duration-1000 ${fading ? "opacity-0" : "opacity-100 animate-fade-in"}`}>
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card p-4 shadow-lg">
        <Download className="h-6 w-6 shrink-0 text-primary animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-card-foreground">Nova atualização disponível</p>
          <p className="text-xs text-muted-foreground">Toque para atualizar a aplicação</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            hapticTap();
            updateApp();
          }}
          className="h-10 min-h-[44px] px-4 gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>
    </div>
  );
}
