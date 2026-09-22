import { useState, useCallback } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import { FileitLoader } from "@/components/brand/FileitLoader";

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  progress?: number;
}

export function Dropzone({ onFileSelect, isUploading, progress = 0 }: DropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const processFiles = async (filesList: FileList) => {
    if (!filesList || filesList.length === 0) return;
    
    if (filesList.length === 1) {
      onFileSelect(filesList[0]);
    } else {
      setIsZipping(true);
      try {
        const zip = new JSZip();
        for (let i = 0; i < filesList.length; i++) {
          const file = filesList[i];
          zip.file(file.name, file);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipFile = new File([zipBlob], `archive-${Date.now()}.zip`, {
          type: "application/zip",
        });
        onFileSelect(zipFile);
      } catch (err) {
        console.error("Failed to create zip:", err);
      } finally {
        setIsZipping(false);
      }
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      processFiles(e.dataTransfer.files);
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        processFiles(e.target.files);
      }
    },
    [onFileSelect]
  );

  return (
    <motion.div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      animate={
        isDragActive
          ? { scale: 1.03, boxShadow: "0 0 0 3px hsl(var(--primary)/0.4)" }
          : { scale: 1, boxShadow: "0 0 0 0px transparent" }
      }
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "relative group flex flex-col items-center justify-center w-full min-h-[300px] border-2 border-dashed rounded-2xl p-12 text-center transition-colors duration-300 bg-card overflow-hidden",
        isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/50",
        (isUploading || isZipping) && "pointer-events-none"
      )}
    >
      <motion.div
        className="absolute inset-0 bg-primary/5 rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isDragActive ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      <input
        type="file"
        multiple
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        disabled={isUploading || isZipping}
      />

      <AnimatePresence mode="wait">
        {isZipping ? (
          <motion.div
            key="zipping"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="flex flex-col items-center gap-5"
          >
            <FileitLoader
              size="lg"
              label="Bundling archive..."
              sublabel="Compressing files before transfer"
            />
          </motion.div>
        ) : isUploading ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            className="flex flex-col items-center gap-5"
          >
            <div className="relative w-24 h-24 flex items-center justify-center">
              {/* Outer glow aura */}
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-lg animate-pulse" />

              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                <motion.circle
                  cx="40" cy="40" r="34"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 34}
                  animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - progress / 100) }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  className="text-base font-extrabold text-foreground"
                  key={progress}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                >
                  {progress}%
                </motion.span>
              </div>
            </div>
            <div className="space-y-1 text-center">
              <p className="font-bold text-lg text-foreground tracking-tight">
                {progress < 50 ? "Transferring payload..." : progress < 90 ? "Encrypting & Storing..." : "Finalizing share link..."}
              </p>
              <p className="text-xs text-muted-foreground">Streaming data securely to fast storage node</p>
            </div>
            <div className="w-52 h-1.5 bg-muted rounded-full overflow-hidden p-0.5">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-4"
          >
            <motion.div
              animate={isDragActive ? { scale: 1.15, rotate: -5 } : { scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              className={cn(
                "p-4 rounded-full transition-colors duration-300",
                isDragActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}
            >
              <UploadCloud className="w-9 h-9" />
            </motion.div>
            <div className="space-y-1">
              <p className="font-semibold text-lg text-foreground">
                {isDragActive ? "Drop to upload" : "Click to upload or drag and drop"}
              </p>
              <p className="text-sm text-muted-foreground">
                Accepts <strong className="text-foreground">any file format</strong> up to 500 MB (Single or batch).
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md pt-1">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                .APK Android
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                .ZIP / .TAR / .GZ
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                .7Z / .RAR / .ISO
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                Videos & Photos
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border">
                PDF / Docs / Code
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
