import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch a manager's digitized signature from the private bucket
 * and return it as a base64 data URL for PDF embedding.
 * Returns null if not available.
 */
export async function fetchManagerSignatureForPDF(managerId: string): Promise<string | null> {
  try {
    // Check if manager has a saved_signature_url (stored as path)
    const { data: profile } = await supabase
      .from("profiles")
      .select("saved_signature_url")
      .eq("id", managerId)
      .maybeSingle();

    if (!profile?.saved_signature_url) return null;

    const path = profile.saved_signature_url;

    // Download the file from private bucket
    const { data: blob, error } = await supabase.storage
      .from("manager-signatures")
      .download(path);

    if (error || !blob) return null;

    // Convert to base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
