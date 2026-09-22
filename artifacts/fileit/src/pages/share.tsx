import { useRoute } from "wouter";
import { useGetFileByToken, getGetFileByTokenQueryKey } from "@workspace/api-client-react";
import { getFileDownloadUrl, getFileUrl } from "@/lib/storage";
import { formatBytes } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Download, AlertCircle, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { FileitLogo } from "@/components/brand/FileitLogo";
import { FileitLoader } from "@/components/brand/FileitLoader";
import { inspectFileType } from "@/lib/file-type-helpers";

export default function SharePage() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token;
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { data: file, isLoading, isError } = useGetFileByToken(token || "", {
    query: {
      enabled: !!token,
      queryKey: getGetFileByTokenQueryKey(token || ""),
      retry: false,
    },
  });

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const fileMeta = file ? inspectFileType(file.originalName, file.mimeType) : null;

  const handleDownload = () => {
    if (!file) return;
    const link = document.createElement("a");
    link.href = getFileDownloadUrl(file.storagePath);
    link.download = file.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleView = () => {
    if (!file) return;
    window.open(getFileUrl(file.storagePath), "_blank");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <FileitLoader size="lg" label="Decrypting share link..." sublabel="Direct fast delivery" />
      </div>
    );
  }

  if (isError || !file) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-4 bg-card p-8 rounded-2xl border border-border shadow-sm"
        >
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold">File not found</h1>
          <p className="text-muted-foreground">
            This link may have expired or the file was deleted by the owner.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-3 md:p-4 selection:bg-primary/20">
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
        className="w-full max-w-sm"
      >
        <div className="bg-card border border-border rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-xl shadow-primary/5 text-center flex flex-col items-center gap-4 md:gap-5">
          {/* Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shadow-xs border border-border"
          >
            {fileMeta?.icon}
          </motion.div>

          {/* File info */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-1.5"
          >
            <div className="flex justify-center">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${fileMeta?.badgeColor}`}>
                {fileMeta?.badgeLabel}
              </span>
            </div>
            <h1 className="text-lg font-bold break-all leading-tight text-foreground">{file.originalName}</h1>
            <p className="text-sm text-muted-foreground">
              {formatBytes(file.size)}
              {file.downloadCount !== undefined && (
                <> &bull; {file.downloadCount} {file.downloadCount === 1 ? "download" : "downloads"}</>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
            </p>
            {fileMeta?.category === "apk" && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-lg p-2 mt-2 font-medium">
                Android Package file &bull; Sideload & Install ready
              </p>
            )}
            {fileMeta?.category === "archive" && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg p-2 mt-2 font-medium">
                Compressed Archive package &bull; Extract with any ZIP/TAR tool
              </p>
            )}
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full flex flex-col gap-2.5"
          >
            <Button className="w-full h-11 font-semibold rounded-xl" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download {fileMeta?.extension ? `.${fileMeta.extension.toLowerCase()}` : "File"}
            </Button>
            {fileMeta?.canPreviewInBrowser && (
              <Button
                variant="outline"
                className="w-full h-11 font-semibold rounded-xl"
                onClick={handleView}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open in browser
              </Button>
            )}
          </motion.div>

          {/* QR Code */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="p-2.5 bg-white rounded-xl shadow-sm border border-border">
              <QRCodeSVG
                value={shareUrl}
                size={120}
                level="M"
                includeMargin={false}
              />
            </div>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-secondary"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.span
                    key="done"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 text-green-600 font-medium"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Link copied!
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy share link
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="flex items-center justify-center pt-2"
          >
            <FileitLogo size="sm" showWordmark={true} />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
