import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, MapPin } from "lucide-react";

export default function Occurrence() {
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          toast.success("Localização obtida");
        },
        () => toast.error("Não foi possível obter a localização")
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: vehicle } = await supabase.from("vehicles").select("id").eq("current_driver_id", user?.id || "").maybeSingle();
    const { error } = await supabase.from("occurrences").insert({
      driver_id: user?.id,
      vehicle_id: vehicle?.id || null,
      description,
      lat: location?.lat || null,
      lng: location?.lng || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Ocorrência registada!");
      setDescription("");
      setLocation(null);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-warning" />Registar Ocorrência
      </h1>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Descreva o incidente..." rows={4} />
            </div>

            <div className="space-y-2">
              <Label>Localização</Label>
              <Button type="button" variant="outline" className="w-full" onClick={getLocation}>
                <MapPin className="mr-2 h-4 w-4" />
                {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Obter Localização Atual"}
              </Button>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "A registar..." : "Registar Ocorrência"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
