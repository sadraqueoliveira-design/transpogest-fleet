import { supabase } from "@/integrations/supabase/client";

/**
 * Upload a base64 signature image to Supabase Storage.
 * Returns the public URL of the uploaded image.
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
