import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a base64 signature image to Supabase Storage.
 */
export async function uploadSignature(
  dataUrl: string,
  userId: string,
  prefix: string = "sig"
): Promise<string> {
  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/png" });
  const path = `${userId}/${prefix}_${Date.now()}.png`;

  const { error } = await supabase.storage
    .from("signatures")
    .upload(path, blob, { contentType: "image/png", upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from("signatures").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload a signed PDF blob to storage and return the public URL.
 */
export async function uploadSignedPDF(
  pdfBlob: Blob,
  declarationId: string
): Promise<string> {
  const path = `${declarationId}.pdf`;

  const { error } = await supabase.storage
    .from("signed-declarations")
    .upload(path, pdfBlob, { contentType: "application/pdf", upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from("signed-declarations").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Get user's public IP address for audit trail.
 */
export async function getUserIP(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Get current GPS coordinates. Returns null if denied or unavailable.
 */
export function getGPSCoordinates(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/**
 * Collect full signing metadata for audit trail.
 */
export async function collectSigningMetadata(userId: string) {
  const [ip, gps] = await Promise.all([getUserIP(), getGPSCoordinates()]);
  return {
    signed_by_user_id: userId,
    signed_at: new Date().toISOString(),
    ip_address: ip,
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
    device_info: navigator.userAgent,
  };
}

/**
 * Create an audit log entry and return the verification_id.
 */
export async function createAuditLog(params: {
  declaration_id: string;
  signed_by_user_id: string;
  signer_role: "driver" | "manager";
  signer_name: string;
  signed_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
  device_info: string;
  ip_address: string;
  signature_url?: string;
  pdf_url?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("signature_audit_logs" as any)
    .insert(params as any)
    .select("verification_id")
    .single();

  if (error) throw error;
  return (data as any).verification_id;
}
