import { Layout } from "@/components/layout";
import { Dropzone } from "@/components/dropzone";
import { useUpload } from "@/hooks/use-upload";
import { useGetFileStats, useListFiles } from "@workspace/api-client-react";
import { FileCard, FileCardSkeleton } from "@/components/file-card";
import { formatBytes } from "@/lib/utils";
import { Link } from "wouter";
import { HardDrive, Files, Copy, CheckCircle2, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { ChangeExpirationDialog } from "@/components/change-expiration-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    let start = 0;
    const step = Math.ceil(value / 30);
    const timer = setInterval(() => {
      start = Math.min(start + step, value);
      setDisplay(start);
      if (start >= value) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { ease: "easeOut" as const, duration: 0.4 } },
};

export default function Home() {
  const { uploadFile, isUploading, progress } = useUpload();
  const { data: stats, isLoading: statsLoading } = useGetFileStats();
  const { data: files, isLoading: filesLoading } = useListFiles();
  const [sharedFile, setSharedFile] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<string>("259200"); // Default 3 days (in seconds)
  const { toast } = useToast();

  const shareUrl = sharedFile ? `${window.location.origin}/share/${sharedFile.token}` : "";

  const getExpiresAtDate = (seconds: string) => {
    if (seconds === "forever") return undefined;
    return new Date(Date.now() + parseInt(seconds) * 1000).toISOString();
  };

  const handleFileSelect = async (file: File) => {
    try {
      const expiresAt = getExpiresAtDate(selectedDuration);
      const result = await uploadFile(file, undefined, expiresAt);
      setSharedFile({ name: result.originalName, token: result.shareToken });
    } catch {
      // error handled in hook
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied to clipboard!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl space-y-12">
        {/* Hero */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          <motion.div variants={itemVariants} className="text-center space-y-2">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
              Share files instantly
            </h1>
            <p className="text-lg text-muted-foreground">
              No sign up. No friction. Just drag, drop, and share.
            </p>
          </motion.div>

          <motion.div variants={itemVariants} className="max-w-2xl mx-auto mt-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/30 border border-border/60 p-3 rounded-2xl">
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5 px-1">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>Auto-Dissolve in:</span>
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { label: "1 Hour", value: "3600" },
                  { label: "12 Hours", value: "43200" },
                  { label: "1 Day", value: "86400" },
                  { label: "3 Days (Default)", value: "259200" },
                  { label: "1 Week", value: "604800" },
                  { label: "Keep Forever", value: "forever" },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={selectedDuration === opt.value ? "default" : "ghost"}
                    className={`h-8 text-xs font-semibold rounded-lg px-2.5 ${
                      selectedDuration === opt.value
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setSelectedDuration(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <Dropzone
              onFileSelect={handleFileSelect}
              isUploading={isUploading}
              progress={progress}
            />
          </motion.div>
        </motion.section>

        {/* Stats */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8"
        >
          {[
            {
              icon: <Files className="w-5 h-5" />,
              label: "Files uploaded",
              value: statsLoading ? "—" : <AnimatedCount value={stats?.totalFiles ?? 0} />,
            },
            {
              icon: <HardDrive className="w-5 h-5" />,
              label: "Storage used",
              value: statsLoading ? "—" : formatBytes(stats?.totalSize ?? 0),
            },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              className="flex items-center gap-4 p-5 rounded-2xl bg-card border border-border"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </motion.section>

        {/* Recent uploads */}
        {!filesLoading && Array.isArray(files) && files.length > 0 && (
          <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            <motion.div variants={itemVariants} className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent uploads</h2>
              <Link
                href="/files"
                className="text-sm text-primary hover:underline font-medium"
              >
                View all
              </Link>
            </motion.div>
            <motion.div variants={itemVariants} className="space-y-2">
              {files.slice(0, 5).map((file) => (
                <FileCard key={file.id} file={file} showActions={false} />
              ))}
            </motion.div>
          </motion.section>
        )}

        {filesLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <FileCardSkeleton key={i} />
            ))}
          </div>
        )}
      </div>

      {/* Share dialog */}
      <Dialog open={!!sharedFile} onOpenChange={(open) => !open && setSharedFile(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>File ready to share!</DialogTitle>
            <DialogDescription>
              Share this link with anyone — no account required to download.
            </DialogDescription>
          </DialogHeader>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-5 py-2"
          >
            <div className="p-3 bg-white rounded-2xl shadow-sm border border-border">
              <QRCodeSVG value={shareUrl} size={160} />
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Scan the QR code or copy the link below
            </p>

            <div className="w-full flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="flex-1 font-mono text-xs bg-secondary/50"
              />
              <Button
                onClick={copyShareLink}
                variant={copied ? "default" : "outline"}
                className="shrink-0 transition-all"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Copied
                    </motion.span>
                  ) : (
                    <motion.span
                      key="copy"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      className="flex items-center gap-1"
                    >
                      <Copy className="w-4 h-4" /> Copy
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </div>

            <Button variant="secondary" className="w-full" onClick={() => setSharedFile(null)}>
              Done
            </Button>
          </motion.div>
        </DialogContent>
      </Dialog>
      
      <ChangeExpirationDialog />
    </Layout>
  );
}
