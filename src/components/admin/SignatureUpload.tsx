import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Trash2, Loader2, Wand2, Image as ImageIcon } from "lucide-react";

interface SignatureUploadProps {
  currentUrl: string | null;
  onSaved: (url: string | null) => void;
}

/**
 * Removes white/light background from a signature image, making it transparent.
 * Uses canvas pixel manipulation.
 */
function removeWhiteBackground(img: HTMLImageElement, threshold = 230): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas not supported"));

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // If pixel is "white-ish", make it transparent
      if (r > threshold && g > threshold && b > threshold) {
        data[i + 3] = 0; // alpha = 0
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Auto-crop: find bounding box of non-transparent pixels
    const w = canvas.width;
    const h = canvas.height;
    let top = h, bottom = 0, left = w, right = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx + 3] > 0) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    // Add small padding
    const pad = 4;
    top = Math.max(0, top - pad);
    bottom = Math.min(h - 1, bottom + pad);
    left = Math.max(0, left - pad);
    right = Math.min(w - 1, right + pad);

    const cropW = right - left + 1;
    const cropH = bottom - top + 1;

    if (cropW <= 0 || cropH <= 0) {
      // Image is entirely white/transparent
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create blob"));
      }, "image/png");
      return;
    }

    const croppedData = ctx.getImageData(left, top, cropW, cropH);
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const croppedCtx = croppedCanvas.getContext("2d")!;
    croppedCtx.putImageData(croppedData, 0, 0);

    croppedCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create blob"));
    }, "image/png");
  });
}

export default function SignatureUpload({ currentUrl, onSaved }: SignatureUploadProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const processAndUpload = useCallback(async (file: File) => {
    if (!user) return;
    setProcessing(true);

    try {
      // Load image
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(file);
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = objectUrl;
      });

      // Remove white background and auto-crop
      const processedBlob = await removeWhiteBackground(img);
      URL.revokeObjectURL(objectUrl);

      // Show preview
      const previewUrl = URL.createObjectURL(processedBlob);
      setPreview(previewUrl);

      // Upload to private bucket
      setUploading(true);
      const path = `${user.id}/digitized_signature.png`;

      // Delete old file first (ignore errors)
      await supabase.storage.from("manager-signatures").remove([path]);

      const { error } = await supabase.storage
        .from("manager-signatures")
        .upload(path, processedBlob, {
          contentType: "image/png",
          upsert: true,
        });

      if (error) throw error;

      // Get signed URL (private bucket)
      const { data: signedData, error: signedError } = await supabase.storage
        .from("manager-signatures")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

      if (signedError) throw signedError;

      // Save the path reference in profile (not the signed URL)
      await supabase
        .from("profiles")
        .update({ saved_signature_url: path } as any)
        .eq("id", user.id);

      onSaved(signedData.signedUrl);
      toast.success("Assinatura digitalizada guardada com sucesso");
    } catch (err: any) {
      toast.error("Erro ao processar assinatura: " + err.message);
    } finally {
      setProcessing(false);
      setUploading(false);
    }
  }, [user, onSaved]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecione uma imagem (PNG ou JPG)");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máx. 5MB)");
      return;
    }

    processAndUpload(file);
  };

  const handleDelete = async () => {
    if (!user) return;
    setUploading(true);
    try {
      const path = `${user.id}/digitized_signature.png`;
      await supabase.storage.from("manager-signatures").remove([path]);
      await supabase
        .from("profiles")
        .update({ saved_signature_url: null } as any)
        .eq("id", user.id);
      setPreview(null);
      onSaved(null);
      toast.success("Assinatura removida");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const isLoading = processing || uploading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Assinatura Digitalizada
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Carregue uma imagem da sua assinatura (PNG/JPG). O fundo branco será automaticamente removido para integração natural nos PDFs.
        </p>

        {preview && (
          <div className="relative border-2 border-dashed rounded-lg p-4 bg-[repeating-conic-gradient(#e5e5e5_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
            <img
              src={preview}
              alt="Assinatura digitalizada"
              className="max-h-24 mx-auto"
            />
            {!isLoading && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={handleDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {processing ? "A processar..." : "A guardar..."}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {preview ? "Substituir Assinatura" : "Carregar Imagem de Assinatura"}
            </>
          )}
        </Button>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
          <Wand2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>O fundo branco é removido automaticamente e a imagem é recortada para melhor resultado no PDF.</span>
        </div>
      </CardContent>
    </Card>
  );
}
