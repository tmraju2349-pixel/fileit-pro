import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QRScanPage() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [, navigate] = useLocation();

  const handleNavigate = (url: string) => {
    if (!url.trim()) return;
    try {
      const parsed = new URL(url.trim());
      const path = parsed.pathname + parsed.search + parsed.hash;
      navigate(path);
    } catch {
      setError("Invalid URL. Please paste a valid share link.");
    }
  };

  useEffect(() => {
    if (!scanning) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let stopped = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Use BarcodeDetector if available
        if ("BarcodeDetector" in window) {
          const detector = new (window as unknown as { BarcodeDetector: new (opts: object) => { detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ["qr_code"] });
          const scan = async () => {
            if (stopped || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                setScanning(false);
                handleNavigate(barcodes[0].rawValue);
                return;
              }
            } catch {
              // ignore frame errors
            }
            if (!stopped) requestAnimationFrame(scan);
          };
          scan();
        } else {
          setError("QR scanning is not supported in this browser. Paste the link below instead.");
          setScanning(false);
        }
      } catch (err) {
        setError("Could not access camera. Please allow camera permission and try again.");
        setScanning(false);
      }
    })();

    return () => {
      stopped = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [scanning]);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4 gap-6">
      <div className="text-center space-y-1">
        <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-3">
          <ScanLine className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold">Scan QR code</h1>
        <p className="text-muted-foreground text-sm">
          Point your camera at a Fileit share QR code
        </p>
      </div>

      <div className="w-full max-w-sm aspect-square rounded-2xl border-2 border-dashed border-border bg-card overflow-hidden flex items-center justify-center">
        {scanning ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
        ) : (
          <div className="text-center space-y-2 p-8 text-muted-foreground">
            {error ? (
              <div className="space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
                <p className="text-destructive text-sm">{error}</p>
              </div>
            ) : (
              <p className="text-sm">Tap the button below to start scanning</p>
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Button
          className="w-full h-12 font-semibold rounded-xl"
          onClick={() => {
            setError("");
            setScanning((s) => !s);
          }}
        >
          {scanning ? "Stop scanning" : "Scan QR code"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNavigate(inputUrl)}
            placeholder="Paste share link here"
            className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button variant="outline" onClick={() => handleNavigate(inputUrl)}>
            Go
          </Button>
        </div>
      </div>
    </div>
  );
}
