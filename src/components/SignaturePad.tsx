import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eraser, Check } from "lucide-react";

interface SignaturePadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtitle?: string;
  summaryContent?: React.ReactNode;
  onConfirm: (dataUrl: string) => void | Promise<void>;
  loading?: boolean;
}

export default function SignaturePad({
  open,
  onOpenChange,
  title = "Assinar Declaração",
  subtitle,
  summaryContent,
  onConfirm,
  loading = false,
}: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    sigRef.current?.clear();
    setIsEmpty(true);
  };

  const handleConfirm = async () => {
    if (!sigRef.current || sigRef.current.isEmpty()) return;
    const canvas = sigRef.current.getCanvas();
    const dataUrl = canvas.toDataURL("image/png");
    await onConfirm(dataUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {summaryContent && (
          <div className="rounded-lg border p-3 text-sm space-y-1">
            {summaryContent}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Desenhe a sua assinatura abaixo:</p>
          <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg bg-white">
            <SignatureCanvas
              ref={sigRef}
              canvasProps={{
                className: "w-full rounded-lg",
                style: { width: "100%", height: 180 },
              }}
              penColor="#1a1a2e"
              backgroundColor="rgba(255,255,255,0)"
              onBegin={() => setIsEmpty(false)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClear} disabled={loading}>
            <Eraser className="h-4 w-4 mr-1" /> Limpar
          </Button>
          <Button onClick={handleConfirm} disabled={isEmpty || loading} size="lg">
            {loading ? "A processar..." : (
              <><Check className="h-4 w-4 mr-1" /> Confirmar Assinatura</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
