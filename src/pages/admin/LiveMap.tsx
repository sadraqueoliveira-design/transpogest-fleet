import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VehicleMarker {
  id: string;
  plate: string;
  last_lat: number | null;
  last_lng: number | null;
  last_speed: number | null;
  tachograph_status: string | null;
  current_driver_id: string | null;
}

export default function LiveMap() {
  const [vehicles, setVehicles] = useState<VehicleMarker[]>([]);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    const fetchVehicles = async () => {
      const { data } = await supabase.from("vehicles").select("id, plate, last_lat, last_lng, last_speed, tachograph_status, current_driver_id");
      if (data) setVehicles(data);
    };
    fetchVehicles();
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const initMap = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");

      const map = L.map(mapRef.current!, { zoomControl: true }).setView([39.5, -8.0], 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      mapInstance.current = map;

      // Add vehicle markers
      vehicles.forEach((v) => {
        if (v.last_lat && v.last_lng) {
          const speed = v.last_speed || 0;
          const color = speed > 5 ? "#22c55e" : speed === 0 ? "#ef4444" : "#eab308";
          const icon = L.divIcon({
            html: `<div style="width:32px;height:32px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M18 17H6V4h2v6l2-1.5L12 10V4h6v13z"/></svg>
            </div>`,
            className: "",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          L.marker([v.last_lat, v.last_lng], { icon })
            .addTo(map)
            .bindPopup(`
              <div style="font-family:Inter,sans-serif;min-width:160px">
                <strong style="font-size:14px">${v.plate}</strong><br/>
                <span style="color:#666">Velocidade: ${speed} km/h</span><br/>
                <span style="color:#666">Tacógrafo: ${v.tachograph_status || "N/A"}</span>
              </div>
            `);
        }
      });

      // Fit bounds if markers exist
      const withCoords = vehicles.filter((v) => v.last_lat && v.last_lng);
      if (withCoords.length > 0) {
        const bounds = L.latLngBounds(withCoords.map((v) => [v.last_lat!, v.last_lng!]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    };

    if (vehicles.length >= 0) initMap();

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [vehicles]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-header">Mapa ao Vivo</h1>
        <p className="page-subtitle">Localização em tempo real da frota</p>
      </div>

      <div className="flex gap-3 text-sm">
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-success" />Em movimento</div>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-destructive" />Parado</div>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-warning" />Ralenti</div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div ref={mapRef} className="h-[500px] lg:h-[600px] rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
