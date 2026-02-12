import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

interface NotificationLog {
  id: string;
  title: string;
  body: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  sender_user_id: string | null;
  recipient_user_id: string;
  data: any;
}

interface Props {
  /** admin = shows all sent notifications; driver = shows only own */
  mode: "admin" | "driver";
  /** Max items to show */
  limit?: number;
}

export default function NotificationHistory({ mode, limit = 20 }: Props) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
      setLoading(true);
      let query = supabase
        .from("push_notifications_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (mode === "driver") {
        query = query.eq("recipient_user_id", user.id);
      }

      const { data } = await query;
      if (data) {
        setLogs(data as NotificationLog[]);

        // Resolve sender names for admin mode
        if (mode === "admin") {
          const senderIds = [...new Set(data.filter(d => d.sender_user_id).map(d => d.sender_user_id!))];
          if (senderIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", senderIds);
            if (profiles) {
              const map: Record<string, string> = {};
              profiles.forEach(p => { map[p.id] = p.full_name || "Sem nome"; });
              setSenderNames(map);
            }
          }
        }
      }
      setLoading(false);
    };

    fetchLogs();

    // Realtime subscription
    const channel = supabase
      .channel(`notif-history-${mode}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "push_notifications_log",
        ...(mode === "driver" ? { filter: `recipient_user_id=eq.${user.id}` } : {}),
      }, (payload) => {
        setLogs(prev => [payload.new as NotificationLog, ...prev].slice(0, limit));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, mode, limit]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "sent": return "Enviado";
      case "failed": return "Falhou";
      default: return "Pendente";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Histórico de Notificações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Histórico de Notificações
          {logs.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">{logs.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma notificação encontrada</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30"
              >
                <div className="mt-0.5">{statusIcon(log.status)}</div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-sm font-medium leading-tight truncate">{log.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{log.body}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(log.sent_at || log.created_at), {
                        addSuffix: true,
                        locale: pt,
                      })}
                    </span>
                    {mode === "admin" && log.sender_user_id && senderNames[log.sender_user_id] && (
                      <>
                        <span>·</span>
                        <span>por {senderNames[log.sender_user_id]}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{statusLabel(log.status)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
