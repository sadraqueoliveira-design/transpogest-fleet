let cachedStampDataUrl: string | null = null;
// v2: more aggressive background removal

/**
 * Remove white/light background from an image, making it transparent.
 * Returns a PNG data URL with transparency.
 */
function removeWhiteBackground(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate how "white" this pixel is (0 = black, 255 = white)
    const brightness = (r + g + b) / 3;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

    // If pixel is light and low saturation → make transparent
    if (brightness > 140 && saturation < 0.35) {
      // Fully transparent for very white pixels
      if (brightness > 200) {
        data[i + 3] = 0;
      } else {
        // Gradual fade for semi-white pixels
        const alpha = Math.max(0, Math.min(255, (255 - brightness) * 3));
        data[i + 3] = alpha;
      }
    } else if (brightness > 100 && saturation < 0.2) {
      // Partial transparency for grayish areas
      data[i + 3] = Math.round((255 - brightness) * 1.5);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Load the company stamp image as a base64 data URL with white background removed.
 * Caches after first load.
 */
export async function loadStampDataUrl(): Promise<string> {
  if (cachedStampDataUrl) return cachedStampDataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cachedStampDataUrl = removeWhiteBackground(img);
      resolve(cachedStampDataUrl);
    };
    img.onerror = () => {
      // Fallback: return raw image if processing fails
      fetch("/stamp.png")
        .then((res) => res.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            cachedStampDataUrl = reader.result as string;
            resolve(cachedStampDataUrl);
          };
          reader.readAsDataURL(blob);
        });
    };
    img.src = "/stamp.png";
  });
}
