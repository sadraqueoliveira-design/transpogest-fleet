import { supabase } from "@/integrations/supabase/client";

/**
 * Remove white/light background from an image, making it transparent.
 * Returns a data URL with transparency.
 */
function removeWhiteBackgroundFromDataUrl(dataUrl: string, threshold = 230): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0; // make transparent
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

/**
 * Fetch a manager's digitized signature from the private bucket
 * and return it as a base64 data URL (with transparent background) for PDF embedding.
 * Returns null if not available.
 */
export async function fetchManagerSignatureForPDF(managerId: string): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("saved_signature_url")
      .eq("id", managerId)
      .maybeSingle();

    if (!profile?.saved_signature_url) return null;

    const path = profile.saved_signature_url;

    const { data: blob, error } = await supabase.storage
      .from("manager-signatures")
      .download(path);

    if (error || !blob) return null;

    // Convert blob to data URL
    const rawDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    if (!rawDataUrl) return null;

    // Remove white background to ensure transparency in PDF
    try {
      return await removeWhiteBackgroundFromDataUrl(rawDataUrl);
    } catch {
      return rawDataUrl; // fallback to original if processing fails
    }
  } catch {
    return null;
  }
}
