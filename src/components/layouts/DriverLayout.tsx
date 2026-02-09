import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Home, Fuel, FileText, AlertTriangle, User, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/motorista", icon: Home, label: "Início" },
  { to: "/motorista/abastecer", icon: Fuel, label: "Abastecer" },
  { to: "/motorista/solicitacoes", icon: FileText, label: "Pedidos" },
  { to: "/motorista/ocorrencia", icon: AlertTriangle, label: "Ocorrência" },
  { to: "/motorista/documentos", icon: FolderOpen, label: "Docs" },
  { to: "/motorista/perfil", icon: User, label: "Perfil" },
];

export default function DriverLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { profile } = useAuth();

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
      <main className="flex-1 p-4 pb-24">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-driver-nav safe-area-pb">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "text-driver-nav-active" : "text-driver-nav-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "text-driver-nav-active")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
