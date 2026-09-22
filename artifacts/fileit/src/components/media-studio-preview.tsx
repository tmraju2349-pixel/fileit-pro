import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Camera,
  Download,
  Maximize,
  Repeat,
  Music,
  Video as VideoIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { inspectFileType } from "@/lib/file-type-helpers";

export function MediaStudioPreview({
  url,
  fileName,
  type = "audio",
  className = "",
}: {
  url: string;
  fileName: string;
  type?: "audio" | "video";
  className?: string;
}) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);

  const meta = inspectFileType(fileName);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Canvas Waveform Animation for Audio
  useEffect(() => {
    if (type !== "audio") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const renderWaveform = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const numBars = 36;
      const barWidth = 6;
      const gap = (width - numBars * barWidth) / (numBars - 1);

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + gap);
        // Harmonic height
        const factor = isPlaying ? Math.sin(phase + i * 0.35) * 0.45 + 0.55 : 0.18;
        const barHeight = Math.max(6, height * factor * 0.85);
        const y = (height - barHeight) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, "#ec4899");
        grad.addColorStop(1, "#8b5cf6");
        ctx.fillStyle = grad;

        // Rounded bar
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      if (isPlaying) phase += 0.08;
      animId = requestAnimationFrame(renderWaveform);
    };

    renderWaveform();
    return () => cancelAnimationFrame(animId);
  }, [type, isPlaying]);

  const togglePlay = () => {
    const el = type === "audio" ? audioRef.current : videoRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (val: number[]) => {
    const el = type === "audio" ? audioRef.current : videoRef.current;
    if (!el) return;
    el.currentTime = val[0];
    setCurrentTime(val[0]);
  };

  const handleSkip = (seconds: number) => {
    const el = type === "audio" ? audioRef.current : videoRef.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + seconds), duration);
  };

  const handleSpeedChange = (speed: number) => {
    const el = type === "audio" ? audioRef.current : videoRef.current;
    if (!el) return;
    el.playbackRate = speed;
    setPlaybackRate(speed);
  };

  const handleTakeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${fileName.replace(/\.[^/.]+$/, "")}_Frame_${Math.round(currentTime)}s.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast({
      title: "Video Snapshot Saved",
      description: `Saved video frame at ${formatTime(currentTime)} as PNG image.`,
    });
  };

  return (
    <div className={`bg-card rounded-2xl border border-border overflow-hidden flex flex-col shadow-xs ${className}`}>
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
              type === "audio"
                ? "bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/20"
                : "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20"
            }`}
          >
            {type === "audio" ? <Music className="w-4 h-4" /> : <VideoIcon className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground truncate">{fileName}</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${
                  type === "audio"
                    ? "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20"
                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                }`}
              >
                {meta.extension}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              {formatTime(currentTime)} / {formatTime(duration)} • {playbackRate}x speed
            </p>
          </div>
        </div>

        {/* Action button */}
        {type === "video" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleTakeSnapshot}
            className="h-8 text-xs font-bold rounded-xl gap-1.5"
            title="Take a high-res PNG snapshot of the current frame"
          >
            <Camera className="w-3.5 h-3.5 text-purple-500" />
            <span className="hidden sm:inline">Capture Frame</span>
          </Button>
        )}
      </div>

      {/* Main Stage */}
      {type === "audio" ? (
        <div className="p-8 flex flex-col items-center justify-center bg-gradient-to-b from-card to-secondary/30 gap-6">
          <audio
            ref={audioRef}
            src={url}
            loop={isLooping}
            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
            onEnded={() => setIsPlaying(false)}
          />

          {/* Canvas Waveform Display */}
          <div className="w-full max-w-md h-24 bg-card/60 backdrop-blur-md rounded-2xl border border-border p-3 flex items-center justify-center shadow-inner">
            <canvas ref={canvasRef} width={380} height={70} className="w-full h-full" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center bg-black/90 p-2 relative group">
          <video
            ref={videoRef}
            src={url}
            loop={isLooping}
            controls={false}
            className="max-w-full max-h-[60vh] rounded-xl object-contain shadow-2xl"
            onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
            onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
        </div>
      )}

      {/* Media Studio Bottom Control Center */}
      <div className="p-4 bg-secondary/40 border-t border-border space-y-3">
        {/* Scrubber Time Bar */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="flex-1 cursor-pointer"
          />
          <span className="text-[11px] font-mono text-muted-foreground w-10">
            {formatTime(duration)}
          </span>
        </div>

        {/* Master Controls Row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Playback rate buttons */}
          <div className="flex items-center gap-1">
            {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => handleSpeedChange(speed)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  playbackRate === speed
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Center: Play, Skip, Loop */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSkip(-10)}
              className="h-8 w-8 p-0 rounded-full"
              title="Rewind 10 seconds"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              onClick={togglePlay}
              className="h-10 w-10 rounded-full p-0 shadow-md font-bold"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSkip(10)}
              className="h-8 w-8 p-0 rounded-full"
              title="Forward 10 seconds"
            >
              <RotateCw className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsLooping(!isLooping)}
              className={`h-8 w-8 p-0 rounded-full ${
                isLooping ? "text-primary bg-primary/10" : "text-muted-foreground"
              }`}
              title={isLooping ? "Loop Enabled" : "Loop Disabled"}
            >
              <Repeat className="w-4 h-4" />
            </Button>
          </div>

          {/* Right: Volume Slider */}
          <div className="flex items-center gap-2 w-32">
            <button
              type="button"
              onClick={() => {
                const el = type === "audio" ? audioRef.current : videoRef.current;
                if (!el) return;
                el.muted = !isMuted;
                setIsMuted(!isMuted);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.05}
              onValueChange={(val) => {
                const el = type === "audio" ? audioRef.current : videoRef.current;
                if (!el) return;
                el.volume = val[0];
                setVolume(val[0]);
                setIsMuted(val[0] === 0);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
