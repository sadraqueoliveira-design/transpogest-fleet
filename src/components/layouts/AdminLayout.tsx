import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Truck, Route, Wrench, ClipboardList,
  FileText, Users, LogOut, ChevronLeft, ChevronRight, Menu,
  Building2, MapPin, CreditCard, Settings, Store, Fuel, ShieldAlert, ShieldCheck, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Painel" },
  { to: "/admin/frota", icon: Truck, label: "Frota" },
  { to: "/admin/abastecimento", icon: Fuel, label: "Abastecimento" },
  { to: "/admin/clientes", icon: Building2, label: "Clientes" },
  { to: "/admin/hubs", icon: MapPin, label: "Hubs" },
  { to: "/admin/locais", icon: Store, label: "Locais da Rede" },
  { to: "/admin/rotas", icon: Route, label: "Rotas" },
  { to: "/admin/manutencao", icon: Wrench, label: "Manutenção" },
  { to: "/admin/formularios", icon: ClipboardList, label: "Formulários" },
  { to: "/admin/solicitacoes", icon: FileText, label: "Solicitações" },
  { to: "/admin/motoristas", icon: Users, label: "Motoristas" },
  { to: "/admin/tacografo", icon: CreditCard, label: "Tacógrafo" },
  { to: "/admin/declaracoes", icon: ShieldAlert, label: "Declarações" },
  { to: "/admin/antram", icon: Settings, label: "ANTRAM" },
  { to: "/admin/compliance", icon: ShieldCheck, label: "Compliance" },
  { to: "/admin/auto-aprovacao", icon: Zap, label: "Auto-Aprovação" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingDeclarations, setPendingDeclarations] = useState(0);
  const { pathname } = useLocation();
  const { profile, signOut, role } = useAuth();

  // Push notifications for admins
  usePushNotifications();

  useEffect(() => {
    const fetchPending = async () => {
      const { count } = await supabase
        .from("activity_declarations")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft");
      setPendingDeclarations(count || 0);
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 lg:relative",
          collapsed ? "w-[68px]" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            TG
          </div>
          {!collapsed && <span className="text-lg font-bold tracking-tight">TranspoGest</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.to || (item.to !== "/admin" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span className="flex-1">{item.label}</span>
                )}
                {!collapsed && item.to === "/admin/declaracoes" && pendingDeclarations > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px]">
                    {pendingDeclarations}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground text-xs font-semibold">
              {profile?.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-sidebar-foreground">{profile?.full_name || "Utilizador"}</p>
                <p className="truncate text-xs text-sidebar-muted capitalize">{role}</p>
              </div>
            )}
            {!collapsed && (
              <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent">
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 hidden h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:bg-secondary lg:flex"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-bold">TranspoGest</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
