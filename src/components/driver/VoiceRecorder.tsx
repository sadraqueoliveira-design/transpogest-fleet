import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2 } from "lucide-react";
import { hapticTap, hapticSuccess, hapticError } from "@/lib/haptics";
import { toast } from "sonner";

interface Props {
  onRecorded: (blob: Blob) => void;
  audioUrl?: string | null;
  onClear?: () => void;
}

export default function VoiceRecorder({ onRecorded, audioUrl, onClear }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecorded(blob);
        hapticSuccess();
      };
      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      hapticTap();
    } catch {
      toast.error("Não foi possível aceder ao microfone");
      hapticError();
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-2">
      {recording ? (
        <Button type="button" variant="destructive" className="w-full min-h-[52px] text-base gap-2" onClick={stop}>
          <Square className="h-5 w-5" /> Parar Gravação ({fmt(seconds)})
        </Button>
      ) : (
        <Button type="button" variant="outline" className="w-full min-h-[52px] text-base gap-2" onClick={start}>
          <Mic className="h-5 w-5" /> Gravar Nota de Voz
        </Button>
      )}
      {audioUrl && (
        <div className="flex items-center gap-2">
          <audio src={audioUrl} controls className="flex-1 h-10" />
          {onClear && (
            <button type="button" onClick={onClear} className="text-destructive p-2">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
