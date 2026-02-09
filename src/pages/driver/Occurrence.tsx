import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, MapPin, Camera, X } from "lucide-react";

export default function Occurrence() {
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadPhotos = async (): Promise<string[]> => {
    if (!user || photos.length === 0) return [];
    const urls: string[] = [];
    for (const photo of photos) {
      const ext = photo.name.split(".").pop();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("occurrence-photos").upload(path, photo);
      if (error) {
        toast.error("Erro ao enviar foto: " + error.message);
        continue;
      }
      const { data } = supabase.storage.from("occurrence-photos").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const photoUrls = await uploadPhotos();
    const { data: vehicle } = await supabase.from("vehicles").select("id").eq("current_driver_id", user?.id || "").maybeSingle();
    const { error } = await supabase.from("occurrences").insert({
      driver_id: user?.id,
      vehicle_id: vehicle?.id || null,
      description,
      lat: location?.lat || null,
      lng: location?.lng || null,
      photos: photoUrls.length > 0 ? photoUrls : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Ocorrência registada!");
      setDescription("");
      setLocation(null);
      setPhotos([]);
    }
    setLoading(false);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
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

            {/* Photo upload */}
            <div className="space-y-2">
              <Label>Fotos</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
                }}
              />
              <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <Camera className="mr-2 h-4 w-4" />
                Tirar Foto / Anexar Imagens
              </Button>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(p)} alt="" className="h-16 w-16 rounded-md object-cover border" />
                      <button type="button" onClick={() => removePhoto(i)} className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
