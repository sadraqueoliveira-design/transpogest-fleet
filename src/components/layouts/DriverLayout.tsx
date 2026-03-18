import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Home, Fuel, FileText, AlertTriangle, User, ClipboardList, FolderOpen, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { hapticTap } from "@/lib/haptics";
import InstallPrompt from "@/components/driver/InstallPrompt";
import OfflineIndicator from "@/components/driver/OfflineIndicator";
import UpdatePrompt from "@/components/driver/UpdatePrompt";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

const navItems = [
  { to: "/motorista", icon: Home, label: "Início" },
  { to: "/motorista/abastecer", icon: Fuel, label: "Abastecer" },
  { to: "/motorista/locais", icon: Store, label: "Locais" },
  { to: "/motorista/solicitacoes", icon: FileText, label: "Pedidos" },
  { to: "/motorista/ocorrencia", icon: AlertTriangle, label: "Ocorrência" },
  { to: "/motorista/declaracoes", icon: ClipboardList, label: "Declarações" },
  { to: "/motorista/documentos", icon: FolderOpen, label: "Docs" },
  { to: "/motorista/perfil", icon: User, label: "Perfil" },
];

export default function DriverLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { profile, user } = useAuth();
  const { pendingCount } = useOfflineQueue();

  // Push notifications
  usePushNotifications();

  // Force dark mode on driver app
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => { document.documentElement.classList.remove("dark"); };
  }, []);

  // Realtime: notify driver when a route is assigned to them
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("driver-route-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "routes", filter: `driver_id=eq.${user.id}` },
        (payload) => {
          const r = payload.new as any;
          toast.info(`Nova rota atribuída: ${r.start_location || "?"} → ${r.end_location || "?"}`, { duration: 8000 });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "routes", filter: `driver_id=eq.${user.id}` },
        (payload) => {
          const r = payload.new as any;
          if (r.status === "in_progress") {
            toast.info(`Rota ativada: ${r.start_location || "?"} → ${r.end_location || "?"}`, { duration: 6000 });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
            TG
          </div>
          <span className="font-bold text-foreground">TranspoGest</span>
        </div>
        <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 pb-28">
        {children}
      </main>

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Install prompt */}
      <InstallPrompt />

      {/* Bottom nav – big touch targets */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-driver-nav safe-area-pb">
        <div className="flex items-center overflow-x-auto scrollbar-hide py-1 px-1 gap-0.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => hapticTap()}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 min-h-[52px] min-w-[52px] justify-center text-xs font-medium transition-colors",
                  active ? "text-driver-nav-active" : "text-driver-nav-foreground"
                )}
              >
                <div className="relative">
                  <item.icon className={cn("h-6 w-6", active && "text-driver-nav-active")} />
                  {item.to === "/motorista" && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
