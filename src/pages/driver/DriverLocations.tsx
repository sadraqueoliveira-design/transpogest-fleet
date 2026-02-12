import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, Store, MapPin, Navigation, ExternalLink,
  Copy, MessageCircle, Phone, ChevronDown
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface Location {
  id: string;
  name: string;
  code: string;
  arp2_code: string | null;
  type: string;
  categoria: string | null;
  address: string | null;
  localidade: string | null;
  distrito: string | null;
  codigo_postal: string | null;
  lat: number | null;
  lng: number | null;
  janelas_horarias: string | null;
  ativo: boolean;
  client_id: string;
}

export default function DriverLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("hubs")
        .select("id, name, code, arp2_code, type, categoria, address, localidade, distrito, codigo_postal, lat, lng, janelas_horarias, ativo, client_id")
        .eq("ativo", true)
        .order("name");
      if (data) setLocations(data as unknown as Location[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = locations.filter(h => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      h.name.toLowerCase().includes(s) ||
      h.code.toLowerCase().includes(s) ||
      (h.arp2_code && h.arp2_code.toLowerCase().includes(s)) ||
      (h.localidade && h.localidade.toLowerCase().includes(s)) ||
      (h.address && h.address.toLowerCase().includes(s)) ||
      (h.distrito && h.distrito.toLowerCase().includes(s))
    );
  });

  const hasCoords = (h: Location) => h.lat != null && h.lng != null;

  const shareText = (h: Location) =>
    `${h.name}\n${h.address || h.localidade || ""}\nhttps://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" /> Locais da Rede
        </h1>
        <p className="text-sm text-muted-foreground">Pesquise e navegue para lojas e locais</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, código, localidade..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} local(is)</p>

      {/* Location cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum local encontrado</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(h => (
            <Card key={h.id} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{h.name}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{h.type || "loja"}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{h.code}</span>
                      {h.arp2_code && <span className="font-mono">ARP2: {h.arp2_code}</span>}
                    </div>

                    {(h.localidade || h.address) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{h.localidade || h.address}</span>
                      </p>
                    )}

                    {h.janelas_horarias && (
                      <p className="text-[10px] text-muted-foreground">🕐 {h.janelas_horarias}</p>
                    )}
                  </div>

                  {/* Navigation actions */}
                  {hasCoords(h) && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`, "_blank")}
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Navegar
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`, "_blank")}>
                            <ExternalLink className="h-4 w-4 mr-2" />Google Maps
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://waze.com/ul?ll=${h.lat},${h.lng}&navigate=yes`, "_blank")}>
                            <Navigation className="h-4 w-4 mr-2" />Waze
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://share.here.com/l/${h.lat},${h.lng}`, "_blank")}>
                            <ExternalLink className="h-4 w-4 mr-2" />HERE Go
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://www.sygic.com/gps-navigation/maps/point?coordinate=${h.lat}|${h.lng}`, "_blank")}>
                            <ExternalLink className="h-4 w-4 mr-2" />Sygic Truck
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://navigation.eurowag.com/navigate?lat=${h.lat}&lon=${h.lng}`, "_blank")}>
                            <ExternalLink className="h-4 w-4 mr-2" />Eurowag GPS Truck
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`https://osmand.net/go?lat=${h.lat}&lon=${h.lng}&z=15`, "_blank")}>
                            <ExternalLink className="h-4 w-4 mr-2" />OsmAnd
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            navigator.clipboard.writeText(shareText(h));
                            toast.success("Copiado!");
                          }}>
                            <Copy className="h-4 w-4 mr-2" />Copiar morada + link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            window.open(`https://wa.me/?text=${encodeURIComponent(shareText(h))}`, "_blank");
                          }}>
                            <MessageCircle className="h-4 w-4 mr-2" />WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            window.open(`sms:?body=${encodeURIComponent(shareText(h))}`, "_blank");
                          }}>
                            <Phone className="h-4 w-4 mr-2" />SMS
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
