import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, CheckCircle2, XCircle, Clock, CalendarIcon, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { formatDistanceToNow, format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
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
  /** Max items to fetch */
  limit?: number;
}

const PAGE_SIZE = 10;

export default function NotificationHistory({ mode, limit = 100 }: Props) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const filtered = useMemo(() => {
    let result = logs;
    if (statusFilter !== "all") {
      result = result.filter(l => l.status === statusFilter);
    }
    if (dateFrom) {
      const start = startOfDay(dateFrom);
      result = result.filter(l => new Date(l.created_at) >= start);
    }
    if (dateTo) {
      const end = endOfDay(dateTo);
      result = result.filter(l => new Date(l.created_at) <= end);
    }
    return result;
  }, [logs, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [statusFilter, dateFrom, dateTo]);

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

  const hasFilters = statusFilter !== "all" || dateFrom || dateTo;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Histórico de Notificações
          {filtered.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">{filtered.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
              <SelectItem value="failed">Falhados</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                <CalendarIcon className="h-3 w-3" />
                {dateFrom ? format(dateFrom, "dd/MM", { locale: pt }) : "De"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={pt} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                <CalendarIcon className="h-3 w-3" />
                {dateTo ? format(dateTo, "dd/MM", { locale: pt }) : "Até"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={pt} />
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setStatusFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
              Limpar
            </Button>
          )}
        </div>

        {/* List */}
        {paged.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma notificação encontrada</p>
        ) : (
          <div className="space-y-2">
            {paged.map((log) => (
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs min-w-[3ch] text-center">{safePage + 1}/{totalPages}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
