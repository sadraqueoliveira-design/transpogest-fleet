import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { WifiOff, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";

export default function OfflineIndicator() {
  const { isOnline, pendingCount } = useOfflineQueue();

  // Don't show anything if online and no pending items
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed top-14 inset-x-0 z-40 flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-medium transition-all animate-fade-in",
        isOnline
          ? "bg-warning/20 text-warning border-b border-warning/30"
          : "bg-destructive/20 text-destructive border-b border-destructive/30"
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Sem internet — os dados serão guardados localmente</span>
        </>
      ) : (
        <>
          <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
          <span>A sincronizar {pendingCount} registo(s) pendente(s)...</span>
        </>
      )}
    </div>
  );
}
