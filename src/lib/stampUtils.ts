let cachedStampDataUrl: string | null = null;

/**
 * Load the company stamp image as a base64 data URL.
 * Caches after first load.
 */
export async function loadStampDataUrl(): Promise<string> {
  if (cachedStampDataUrl) return cachedStampDataUrl;
  const res = await fetch("/stamp.png");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      cachedStampDataUrl = reader.result as string;
      resolve(cachedStampDataUrl);
    };
    reader.readAsDataURL(blob);
  });
}
