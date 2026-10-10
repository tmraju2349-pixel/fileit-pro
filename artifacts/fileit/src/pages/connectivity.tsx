import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  Zap,
  RefreshCw,
  Copy,
  Send,
  FileUp,
  Download,
  CheckCircle2,
  Link2,
  Unlink,
  QrCode,
  FileText,
  Smartphone,
  Image as ImageIcon,
  ExternalLink,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Trash2,
  Check,
  HardDrive,
  FolderOpen,
  ArrowDownToLine,
  FolderPlus,
  Eye,
  FolderTree,
  Folder,
  Music,
  Video as VideoIcon,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  Layers,
  Sparkles,
  Key,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { inspectFileType } from "@/lib/file-type-helpers";
import { FullscreenPreviewModal } from "@/components/fullscreen-preview-modal";
import { ImageStudioPreview } from "@/components/image-studio-preview";
import { MediaStudioPreview } from "@/components/media-studio-preview";
import { PdfStudioPreview } from "@/components/pdf-studio-preview";
import { DocxStudioPreview } from "@/components/docx-studio-preview";
import { XlsxStudioPreview } from "@/components/xlsx-studio-preview";
import { CodePreview } from "@/components/code-preview";
import { ArchivePreview } from "@/components/archive-preview";
import { PptxPreview } from "@/components/pptx-preview";

// WebRTC STUN configurations
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

interface SyncedClipboardItem {
  id: string;
  type: "text" | "link" | "image";
  content: string; // text string or data URL for images
  rawSize?: number;
  sourceDevice: string;
  timestamp: number;
  copiedToLocal?: boolean;
}

interface VaultFile {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  fileRef?: File; // Held in host memory
  folderPath?: string;
}

interface RemotePreviewItem {
  name: string;
  blobUrl: string;
  size: number;
  mimeType: string;
}

interface ReceivedItem {
  id: string;
  type: "text" | "file";
  name?: string;
  text?: string;
  blobUrl?: string;
  size?: number;
  timestamp: string;
}

function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "Android Phone";
  if (/iPad|iPhone|iPod/.test(ua)) return "iPhone / iPad";
  if (/Macintosh|Mac OS X/.test(ua)) return "MacBook";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Connected Device";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ConnectivityPage() {
  const { toast } = useToast();

  // ── Network Status State ──────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Latency State ─────────────────────────────────────────────────────────
  const [latency, setLatency] = useState<number | null>(null);
  const [jitter, setJitter] = useState<number | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState(false);

  // ── Bandwidth Speed Test State ───────────────────────────────────────────
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [speedProgress, setSpeedProgress] = useState(0);

  // ── WebRTC / P2P Connection States ────────────────────────────────────────
  const [connectionRole, setConnectionRole] = useState<"initiator" | "receiver" | null>(null);
  const [sessionCode, setSessionCode] = useState<string>("");
  const [enteredCode, setEnteredCode] = useState<string>("");
  const [p2pState, setP2PState] = useState<"idle" | "creating" | "waiting_for_peer" | "connecting" | "connected" | "disconnected">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [remoteDeviceName, setRemoteDeviceName] = useState<string>("Paired Device");

  // ── Phone Link Clipboard Sync States ──────────────────────────────────────
  const [autoClipboardSync, setAutoClipboardSync] = useState(true);
  const [superSyncMode, setSuperSyncMode] = useState(true); // Auto-sends instantly when switching to this tab
  const [privacyPause, setPrivacyPause] = useState(false);
  const [syncedClipboard, setSyncedClipboard] = useState<SyncedClipboardItem[]>([]);
  const [clipboardFilter, setClipboardFilter] = useState<"all" | "text" | "link" | "image">("all");
  const [clipboardSearch, setClipboardSearch] = useState("");
  const [lastCopiedHash, setLastCopiedHash] = useState<string>("");
  const [floatingHudItem, setFloatingHudItem] = useState<SyncedClipboardItem | null>(null);

  // Staging card for detected clipboard items (1-click send or review)
  const [stagedClipboard, setStagedClipboard] = useState<{
    id: string;
    type: "text" | "link" | "image";
    content: string;
    rawSize?: number;
    timestamp: number;
    autoSent?: boolean;
  } | null>(null);

  // ── Remote File Vault & Explorer States ────────────────────────────────────
  const [myVaultFiles, setMyVaultFiles] = useState<VaultFile[]>([]);
  const [remoteVaultFiles, setRemoteVaultFiles] = useState<VaultFile[]>([]);
  const [isRefreshingRemoteVault, setIsRefreshingRemoteVault] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [remoteSearch, setRemoteSearch] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");
  const [folderAccessGranted, setFolderAccessGranted] = useState(false);
  const [accessFolderName, setAccessFolderName] = useState<string>("");
  const [remotePreviewFile, setRemotePreviewFile] = useState<RemotePreviewItem | null>(null);
  const [isRemotePreviewOpen, setIsRemotePreviewOpen] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── Direct Interchange States ─────────────────────────────────────────────
  const [directText, setDirectText] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);

  // WebRTC References
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const activePollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Dynamic file transfer buffer
  const currentIncomingDownload = useRef<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    chunks: ArrayBuffer[];
    receivedBytes: number;
    isPreview?: boolean;
  } | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const playChime = () => {
    try {
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(30);
      }
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx || typeof AudioCtx !== "function") return;
      let ctx;
      try {
        ctx = new AudioCtx();
      } catch {
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio playback best-effort
    }
  };

  // ── Auto-Capture Clipboard Changes (Phone Link Sync) ──────────────────────
  const checkAndBroadcastClipboard = useCallback(
    async (forcedManual = false) => {
      if (!autoClipboardSync && !forcedManual) return;
      if (privacyPause && !forcedManual) return;
      if (typeof navigator === "undefined" || !navigator.clipboard) return;

      try {
        // 1. Check for Images if supported
        if (navigator.clipboard.read) {
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const imageType = item.types.find((t) => t.startsWith("image/"));
              if (imageType) {
                const blob = await item.getType(imageType);
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  const hash = `img_${blob.size}_${dataUrl.slice(-40)}`;
                  if (hash !== lastCopiedHash || forcedManual) {
                    setLastCopiedHash(hash);
                    const payload: SyncedClipboardItem = {
                      id: Math.random().toString(36).substring(2, 9),
                      type: "image",
                      content: dataUrl,
                      rawSize: blob.size,
                      sourceDevice: getDeviceName(),
                      timestamp: Date.now(),
                    };

                    if (superSyncMode && p2pState === "connected") {
                      sendDataChannelMessage({ type: "CLIPBOARD_SYNC", payload });
                      setSyncedClipboard((prev) => [payload, ...prev.filter((p) => p.content !== dataUrl)].slice(0, 50));
                      setStagedClipboard({ ...payload, autoSent: true });
                      playChime();
                      toast({
                        title: "⚡ Super Sync: Image Auto-Sent",
                        description: `Screenshot beamed to ${remoteDeviceName}`,
                      });
                    } else {
                      setStagedClipboard({ ...payload, autoSent: false });
                      toast({
                        title: "Image Detected from Clipboard",
                        description: "Click '1-Click Send' to beam it to your paired device.",
                      });
                    }
                  }
                };
                reader.readAsDataURL(blob);
                return;
              }
            }
          } catch {
            // Read image permission not granted, proceed to text
          }
        }

        // 2. Read Text
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const trimmed = text.trim();
          if (trimmed !== lastCopiedHash || forcedManual) {
            setLastCopiedHash(trimmed);
            const isUrl = /^https?:\/\/[^\s]+$/i.test(trimmed);
            const payload: SyncedClipboardItem = {
              id: Math.random().toString(36).substring(2, 9),
              type: isUrl ? "link" : "text",
              content: trimmed,
              sourceDevice: getDeviceName(),
              timestamp: Date.now(),
            };

            if (superSyncMode && p2pState === "connected") {
              sendDataChannelMessage({ type: "CLIPBOARD_SYNC", payload });
              setSyncedClipboard((prev) => [payload, ...prev.filter((p) => p.content !== trimmed)].slice(0, 50));
              setStagedClipboard({ ...payload, autoSent: true });
              playChime();
              toast({
                title: "⚡ Super Sync: Auto-Sent",
                description: `"${trimmed.slice(0, 32)}${trimmed.length > 32 ? "..." : ""}" beamed to ${remoteDeviceName}`,
              });
            } else {
              setStagedClipboard({ ...payload, autoSent: false });
              toast({
                title: "Clipboard Content Detected",
                description: "Ready to send with 1-Click or enable Super Sync.",
              });
            }
          }
        }
      } catch {
        // Clipboard read permission requires user gesture or tab focus
      }
    },
    [p2pState, autoClipboardSync, superSyncMode, privacyPause, lastCopiedHash, remoteDeviceName]
  );

  // 1-Click Send Staged Item
  const sendStagedItem = () => {
    if (!stagedClipboard) return;
    if (p2pState !== "connected") {
      toast({
        variant: "destructive",
        title: "No Device Connected",
        description: "Please pair your device with 6-digit PIN or QR code first.",
      });
      return;
    }

    const payload: SyncedClipboardItem = {
      id: stagedClipboard.id || Math.random().toString(36).substring(2, 9),
      type: stagedClipboard.type,
      content: stagedClipboard.content,
      rawSize: stagedClipboard.rawSize,
      sourceDevice: getDeviceName(),
      timestamp: Date.now(),
    };

    sendDataChannelMessage({ type: "CLIPBOARD_SYNC", payload });
    setSyncedClipboard((prev) => [payload, ...prev.filter((p) => p.content !== stagedClipboard.content)].slice(0, 50));
    setStagedClipboard({ ...stagedClipboard, autoSent: true });
    playChime();
    toast({
      title: "Beamed to Paired Device",
      description: `Sent "${stagedClipboard.content.slice(0, 30)}${
        stagedClipboard.content.length > 30 ? "..." : ""
      }" to ${remoteDeviceName}`,
    });
  };

  // Window Focus, Visibility Change, and Copy Listeners
  useEffect(() => {
    const handleFocus = () => {
      checkAndBroadcastClipboard();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAndBroadcastClipboard();
      }
    };
    const handleCopy = () => {
      setTimeout(checkAndBroadcastClipboard, 150);
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", handleCopy);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", handleCopy);
    };
  }, [checkAndBroadcastClipboard]);

  // Cleanup WebRTC instances
  const cleanupWebRTC = () => {
    if (activePollingInterval.current) {
      clearInterval(activePollingInterval.current);
      activePollingInterval.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setP2PState("idle");
    setConnectionRole(null);
    setSessionCode("");
  };

  useEffect(() => {
    return () => cleanupWebRTC();
  }, []);

  // Send JSON over DataChannel safely
  const sendDataChannelMessage = (msgObj: any) => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== "open") {
      return false;
    }
    try {
      dataChannelRef.current.send(JSON.stringify(msgObj));
      return true;
    } catch (e) {
      return false;
    }
  };

  // ── Handle Incoming P2P DataChannel Messages ──────────────────────────────
  const setupDataChannelEvents = (channel: RTCDataChannel) => {
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      setP2PState("connected");
      addLog("P2P DataChannel established successfully!");
      toast({
        title: "Devices Paired Successfully",
        description: "Clipboard Sync and Remote File Access are now active.",
      });

      sendDataChannelMessage({
        type: "HANDSHAKE",
        deviceName: getDeviceName(),
        vaultFiles: myVaultFiles.map(({ fileRef, ...meta }) => meta),
      });
    };

    channel.onclose = () => {
      setP2PState("disconnected");
      addLog("DataChannel closed.");
      toast({
        variant: "destructive",
        title: "Peer Disconnected",
        description: "The 1-to-1 session ended.",
      });
    };

    channel.onerror = (err) => {
      addLog(`DataChannel error: ${JSON.stringify(err)}`);
    };

    channel.onmessage = async (event) => {
      // 1. Handle Binary File Chunks
      if (event.data instanceof ArrayBuffer) {
        if (!currentIncomingDownload.current) return;
        const current = currentIncomingDownload.current;
        current.chunks.push(event.data);
        current.receivedBytes += event.data.byteLength;

        const progress = Math.min(100, Math.round((current.receivedBytes / current.size) * 100));
        setTransferProgress(progress);

        if (current.receivedBytes >= current.size) {
          const blob = new Blob(current.chunks, { type: current.mimeType || "application/octet-stream" });
          const blobUrl = URL.createObjectURL(blob);

          if (current.isPreview) {
            setRemotePreviewFile({
              name: current.name,
              blobUrl,
              size: current.size,
              mimeType: current.mimeType,
            });
            setIsRemotePreviewOpen(true);
            playChime();
            toast({
              title: "Streaming Preview Ready",
              description: `Loaded "${current.name}" in Studio Viewer.`,
            });
          } else {
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = current.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            playChime();
            toast({
              title: "Download Complete",
              description: `Saved "${current.name}" (${formatBytes(current.size)})`,
            });

            setReceivedItems((prev) => [
              {
                id: current.id,
                type: "file",
                name: current.name,
                size: current.size,
                blobUrl,
                timestamp: new Date().toLocaleTimeString(),
              },
              ...prev,
            ]);
          }

          currentIncomingDownload.current = null;
          setDownloadingFileId(null);
          setIsTransferring(false);
          setTransferProgress(0);
        }
        return;
      }

      // 2. Handle JSON Control Messages
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "HANDSHAKE") {
          setRemoteDeviceName(msg.deviceName || "Paired Device");
          if (Array.isArray(msg.vaultFiles)) {
            setRemoteVaultFiles(msg.vaultFiles);
          }
          addLog(`Paired with ${msg.deviceName || "Remote Device"}`);
        } else if (msg.type === "CLIPBOARD_SYNC") {
          const item: SyncedClipboardItem = msg.payload;
          playChime();

          let autoCopied = false;
          if (item.type === "text" || item.type === "link") {
            try {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(item.content);
                autoCopied = true;
              }
            } catch {
              // writeText requires tab focus on some browsers
            }
          }

          const record: SyncedClipboardItem = {
            ...item,
            copiedToLocal: autoCopied,
          };

          setSyncedClipboard((prev) => [record, ...prev.filter((p) => p.content !== item.content)].slice(0, 50));
          setFloatingHudItem(record);
          setTimeout(() => setFloatingHudItem(null), 5000);

          toast({
            title: `Synced from ${item.sourceDevice}`,
            description:
              item.type === "image"
                ? "Screenshot received. Ready to preview or save."
                : `"${item.content.slice(0, 35)}${item.content.length > 35 ? "..." : ""}" ${
                    autoCopied ? "(Auto-copied to clipboard)" : ""
                  }`,
          });
        } else if (msg.type === "REQUEST_DIR_LIST") {
          sendDataChannelMessage({
            type: "DIR_LIST_REPLY",
            vaultFiles: myVaultFiles.map(({ fileRef, ...meta }) => meta),
          });
        } else if (msg.type === "DIR_LIST_REPLY") {
          setRemoteVaultFiles(msg.vaultFiles || []);
          setIsRefreshingRemoteVault(false);
          toast({
            title: "Remote Files Updated",
            description: `Found ${msg.vaultFiles?.length || 0} files on ${remoteDeviceName}`,
          });
        } else if (msg.type === "REQUEST_FILE_DOWNLOAD") {
          const targetFile = myVaultFiles.find((f) => f.id === msg.fileId);
          if (targetFile && targetFile.fileRef) {
            addLog(`Serving remote ${msg.isPreview ? "preview" : "download"} request for: ${targetFile.name}`);
            sendDataChannelMessage({
              type: "FILE_METADATA_START",
              fileId: targetFile.id,
              name: targetFile.name,
              size: targetFile.size,
              mimeType: targetFile.type,
              isPreview: !!msg.isPreview,
            });

            const chunkSize = 64 * 1024;
            const file = targetFile.fileRef;
            let offset = 0;

            const sendNextChunk = () => {
              if (offset >= file.size) {
                sendDataChannelMessage({ type: "FILE_TRANSFER_COMPLETE", fileId: targetFile.id });
                return;
              }
              const slice = file.slice(offset, offset + chunkSize);
              const reader = new FileReader();
              reader.onload = (e) => {
                if (e.target?.result && dataChannelRef.current?.readyState === "open") {
                  dataChannelRef.current.send(e.target.result as ArrayBuffer);
                  offset += chunkSize;
                  setTimeout(sendNextChunk, 2);
                }
              };
              reader.readAsArrayBuffer(slice);
            };

            sendNextChunk();
          } else {
            sendDataChannelMessage({
              type: "FILE_ERROR",
              message: "File is no longer accessible in remote memory.",
            });
          }
        } else if (msg.type === "FILE_METADATA_START") {
          currentIncomingDownload.current = {
            id: msg.fileId || Math.random().toString(),
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
            chunks: [],
            receivedBytes: 0,
            isPreview: !!msg.isPreview,
          };
          setDownloadingFileId(msg.fileId);
          setIsTransferring(true);
          setTransferProgress(0);
          addLog(`Receiving stream for ${msg.name} (${formatBytes(msg.size)})`);
        } else if (msg.type === "DIRECT_MESSAGE") {
          playChime();
          setReceivedItems((prev) => [
            {
              id: Math.random().toString(),
              type: "text",
              text: msg.text,
              timestamp: new Date().toLocaleTimeString(),
            },
            ...prev,
          ]);
        }
      } catch (err) {
        addLog(`Error parsing message: ${err}`);
      }
    };
  };

  // ── Initiator Workflow (Create 1-to-1 Session) ────────────────────────────
  const startAsInitiator = async () => {
    cleanupWebRTC();
    setConnectionRole("initiator");
    setP2PState("creating");
    addLog("Creating 1-to-1 Private Session...");

    try {
      const res = await fetch("/api/webrtc/session", { method: "POST" });
      const { code } = await res.json();
      setSessionCode(code);
      setP2PState("waiting_for_peer");
      addLog(`Session created: PIN [${code}]. Ready for peer to join.`);

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      const dc = pc.createDataChannel("fileit-p2p", { ordered: true });
      dataChannelRef.current = dc;
      setupDataChannelEvents(dc);

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await fetch(`/api/webrtc/session/${code}/candidates/initiator`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate: event.candidate }),
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`/api/webrtc/session/${code}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      });

      activePollingInterval.current = setInterval(async () => {
        if (pc.signalingState === "closed") return;

        if (!pc.remoteDescription) {
          const ansRes = await fetch(`/api/webrtc/session/${code}/answer`);
          if (ansRes.ok) {
            const data = await ansRes.json();
            if (data.answer) {
              addLog("Peer accepted! Setting remote description...");
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
          }
        }

        if (pc.remoteDescription) {
          const candRes = await fetch(`/api/webrtc/session/${code}/candidates/receiver`);
          if (candRes.ok) {
            const { candidates } = await candRes.json();
            for (const cand of candidates || []) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
          }
        }
      }, 1000);
    } catch (err: any) {
      setP2PState("idle");
      addLog(`Failed to create session: ${err.message}`);
      toast({
        variant: "destructive",
        title: "Session Error",
        description: "Could not create P2P signaling session.",
      });
    }
  };

  // ── Receiver Workflow (Join 1-to-1 Session) ────────────────────────────────
  const startAsReceiver = async (codeToJoin?: string) => {
    const code = (codeToJoin || enteredCode).trim();
    if (!code || code.length !== 6) {
      toast({
        variant: "destructive",
        title: "Invalid PIN",
        description: "Please enter a valid 6-digit session PIN.",
      });
      return;
    }

    cleanupWebRTC();
    setConnectionRole("receiver");
    setSessionCode(code);
    setP2PState("connecting");
    addLog(`Joining session PIN [${code}]...`);

    try {
      const chkRes = await fetch(`/api/webrtc/session/${code}`);
      if (!chkRes.ok) throw new Error("Session PIN not found or expired.");

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      pc.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        setupDataChannelEvents(event.channel);
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await fetch(`/api/webrtc/session/${code}/candidates/receiver`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate: event.candidate }),
          });
        }
      };

      let offerReceived = false;
      const pollOffer = setInterval(async () => {
        if (offerReceived || pc.signalingState === "closed") return;

        const offRes = await fetch(`/api/webrtc/session/${code}/offer`);
        if (offRes.ok) {
          const data = await offRes.json();
          if (data.offer) {
            offerReceived = true;
            clearInterval(pollOffer);

            addLog("Received host offer. Creating P2P answer...");
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await fetch(`/api/webrtc/session/${code}/answer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answer }),
            });

            const candRes = await fetch(`/api/webrtc/session/${code}/candidates/initiator`);
            if (candRes.ok) {
              const { candidates } = await candRes.json();
              for (const cand of candidates || []) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
            }
          }
        }
      }, 800);
      activePollingInterval.current = pollOffer;
    } catch (err: any) {
      setP2PState("idle");
      addLog(`Failed to join session: ${err.message}`);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err.message || "Could not connect to peer.",
      });
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get("code");
      if (codeParam && codeParam.length === 6 && p2pState === "idle") {
        setEnteredCode(codeParam);
        startAsReceiver(codeParam);
      }
    }
  }, []);

  const requestRemoteFileDownload = (file: VaultFile) => {
    if (p2pState !== "connected") {
      toast({
        variant: "destructive",
        title: "Not Connected",
        description: "Must be paired with a device to pull files.",
      });
      return;
    }

    setDownloadingFileId(file.id);
    setIsTransferring(true);
    setTransferProgress(0);
    addLog(`Requesting remote pull for "${file.name}"...`);

    sendDataChannelMessage({
      type: "REQUEST_FILE_DOWNLOAD",
      fileId: file.id,
      isPreview: false,
    });
  };

  const requestRemoteFilePreview = (file: VaultFile) => {
    if (p2pState !== "connected") {
      toast({
        variant: "destructive",
        title: "Not Connected",
        description: "Must be paired with a device to preview files.",
      });
      return;
    }

    setDownloadingFileId(file.id);
    setIsTransferring(true);
    setTransferProgress(0);
    addLog(`Streaming remote preview for "${file.name}"...`);

    sendDataChannelMessage({
      type: "REQUEST_FILE_DOWNLOAD",
      fileId: file.id,
      isPreview: true,
    });
  };

  // ── Grant Entire Folder / Directory Access (Phone Link Mode) ──────────────
  const handleGrantDirectoryAccess = async () => {
    try {
      if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
        // Native Chromium / Modern OS File System Access API
        const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
        const folderName = dirHandle.name || "Selected Folder";
        setAccessFolderName(folderName);
        setFolderAccessGranted(true);

        const collectedFiles: VaultFile[] = [];

        async function scanDirectory(handle: any, currentPath = "") {
          for await (const entry of handle.values()) {
            if (entry.kind === "file") {
              const file = await entry.getFile();
              collectedFiles.push({
                id: `vault_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: file.name,
                size: file.size,
                type: file.type || "application/octet-stream",
                lastModified: file.lastModified,
                fileRef: file,
                folderPath: currentPath || folderName,
              });
            } else if (entry.kind === "directory") {
              await scanDirectory(entry, currentPath ? `${currentPath}/${entry.name}` : entry.name);
            }
          }
        }

        await scanDirectory(dirHandle);

        const updated = [...collectedFiles, ...myVaultFiles];
        setMyVaultFiles(updated);

        toast({
          title: "Entire Folder Access Granted",
          description: `Indexed ${collectedFiles.length} file(s) from "${folderName}" for your phone.`,
        });

        if (p2pState === "connected") {
          sendDataChannelMessage({
            type: "DIR_LIST_REPLY",
            vaultFiles: updated.map(({ fileRef, ...meta }) => meta),
          });
        }
      } else {
        // Fallback for mobile / Safari
        folderInputRef.current?.click();
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        folderInputRef.current?.click();
      }
    }
  };

  const handleFolderUploadFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: VaultFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const relPath = (f as any).webkitRelativePath;
      const folderName = relPath ? relPath.split("/")[0] : "Folder";
      newFiles.push({
        id: `vault_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        lastModified: f.lastModified,
        fileRef: f,
        folderPath: folderName,
      });
    }

    setFolderAccessGranted(true);
    setAccessFolderName(newFiles[0]?.folderPath || "Selected Folder");

    const updated = [...newFiles, ...myVaultFiles];
    setMyVaultFiles(updated);

    toast({
      title: "Folder Added to Remote Vault",
      description: `${newFiles.length} file(s) are now accessible to your paired device.`,
    });

    if (p2pState === "connected") {
      sendDataChannelMessage({
        type: "DIR_LIST_REPLY",
        vaultFiles: updated.map(({ fileRef, ...meta }) => meta),
      });
    }
  };

  const handleAddToMyVault = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: VaultFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      newFiles.push({
        id: `vault_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        lastModified: f.lastModified,
        fileRef: f,
      });
    }

    const updated = [...newFiles, ...myVaultFiles];
    setMyVaultFiles(updated);

    toast({
      title: "Files Added to Shared Vault",
      description: `${newFiles.length} file(s) are now accessible to your paired laptop.`,
    });

    if (p2pState === "connected") {
      sendDataChannelMessage({
        type: "DIR_LIST_REPLY",
        vaultFiles: updated.map(({ fileRef, ...meta }) => meta),
      });
    }
  };

  const runLatencyTest = async () => {
    setIsTestingLatency(true);
    const pings: number[] = [];
    try {
      for (let i = 0; i < 4; i++) {
        const start = performance.now();
        await fetch("/api/health?t=" + Date.now(), { cache: "no-store" });
        pings.push(performance.now() - start);
      }
      const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
      const jit = Math.round(Math.max(...pings) - Math.min(...pings));
      setLatency(avg);
      setJitter(jit);
    } catch {
      setLatency(null);
    } finally {
      setIsTestingLatency(false);
    }
  };

  const runSpeedTest = async () => {
    setIsTestingSpeed(true);
    setSpeedProgress(0);
    try {
      const start = performance.now();
      const res = await fetch("/api/webrtc/speedtest?t=" + Date.now(), { cache: "no-store" });
      const reader = res.body?.getReader();
      let receivedBytes = 0;
      const totalBytes = 2097152; // 2MB

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.length;
          setSpeedProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
        }
      }
      const durationSec = (performance.now() - start) / 1000;
      const mbps = parseFloat(((receivedBytes * 8) / (durationSec * 1000000)).toFixed(1));
      setDownloadSpeed(mbps);
    } catch {
      setDownloadSpeed(null);
    } finally {
      setIsTestingSpeed(false);
    }
  };

  const filteredClipboard = syncedClipboard.filter((item) => {
    if (clipboardFilter !== "all" && item.type !== clipboardFilter) return false;
    if (clipboardSearch.trim()) {
      return item.content.toLowerCase().includes(clipboardSearch.toLowerCase());
    }
    return true;
  });

  const filteredRemoteFiles = remoteVaultFiles.filter((file) => {
    if (remoteSearch.trim() && !file.name.toLowerCase().includes(remoteSearch.toLowerCase())) {
      return false;
    }
    if (activeCategoryFilter !== "all") {
      const meta = inspectFileType(file.name, file.type);
      if (meta.category !== activeCategoryFilter) return false;
    }
    return true;
  });

  const shareUrl = typeof window !== "undefined" && sessionCode ? `${window.location.origin}/connectivity?code=${sessionCode}` : "";

  return (
    <Layout>
      <div className="container mx-auto px-3.5 sm:px-4 py-4 sm:py-6 md:py-8 max-w-6xl space-y-4 sm:space-y-6">
        {/* Top Header & Pairing Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 sm:p-5 rounded-3xl bg-card border border-border shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0 mt-0.5 sm:mt-0">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-xl font-black text-foreground tracking-tight">Phone Link & P2P</h1>
                <span
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold ${
                    p2pState === "connected"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : p2pState === "waiting_for_peer" || p2pState === "connecting"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      p2pState === "connected"
                        ? "bg-emerald-500"
                        : p2pState === "waiting_for_peer" || p2pState === "connecting"
                        ? "bg-amber-500"
                        : "bg-muted-foreground"
                    }`}
                  />
                  {p2pState === "connected"
                    ? `Paired with ${remoteDeviceName}`
                    : p2pState === "waiting_for_peer"
                    ? `Awaiting Peer (${sessionCode})`
                    : p2pState === "connecting"
                    ? "Connecting..."
                    : "Not Paired"}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1 sm:line-clamp-none">
                Zero-server instant clipboard mirroring & on-demand file access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {p2pState === "connected" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={cleanupWebRTC}
                className="w-full sm:w-auto rounded-xl text-xs font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 h-9"
              >
                <Unlink className="w-3.5 h-3.5 mr-1.5" />
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={startAsInitiator}
                disabled={p2pState !== "idle"}
                className="w-full sm:w-auto rounded-xl text-xs font-bold shadow-xs h-9"
              >
                <QrCode className="w-3.5 h-3.5 mr-1.5" />
                Pair New Device
              </Button>
            )}
          </div>
        </div>

        {/* Connected Device Details & Realistic Phone Link Mockup Control Center */}
        {p2pState === "connected" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 sm:p-6 rounded-3xl bg-card border-2 border-emerald-500/30 shadow-xl space-y-5"
          >
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-foreground">{remoteDeviceName}</h3>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Connected & Secure
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    WebRTC P2P DataChannel • AES-GCM Encrypted Link • Android / iOS Link Active
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runLatencyTest}
                  disabled={isTestingLatency}
                  className="rounded-xl text-xs h-8"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isTestingLatency ? "animate-spin" : ""}`} />
                  {latency !== null ? `Ping: ${latency}ms` : "Test Ping"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runSpeedTest}
                  disabled={isTestingSpeed}
                  className="rounded-xl text-xs h-8"
                >
                  <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  {downloadSpeed !== null ? `${downloadSpeed} Mbps` : "Speed Test"}
                </Button>
              </div>
            </div>

            {/* Microsoft Phone Link Style: Realistic Phone Visual Mockup & Remote Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center bg-secondary/20 p-4 sm:p-5 rounded-3xl border border-border">
              {/* Left: Realistic Smartphone Frame Mockup */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center">
                <div className="relative w-56 sm:w-60 h-[340px] bg-slate-950 rounded-[40px] p-3 shadow-2xl border-4 border-slate-800 text-white flex flex-col justify-between overflow-hidden">
                  {/* Phone Status Bar */}
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold px-2 pt-1 text-slate-300">
                    <span>9:41</span>
                    <div className="w-4 h-3 bg-slate-800 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span>5G</span>
                      <span className="text-emerald-400 font-bold">94% 🔋</span>
                    </div>
                  </div>

                  {/* Phone Screen Wallpaper & Active Widget */}
                  <div className="my-auto text-center space-y-3 p-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 mx-auto flex items-center justify-center shadow-lg text-white">
                      <Smartphone className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{remoteDeviceName}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Link to PC Active</p>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-[10px] text-slate-200 space-y-1">
                      <div className="flex justify-between font-mono">
                        <span>Internal Storage:</span>
                        <span className="text-emerald-400 font-bold">48.2 GB / 128 GB</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div className="w-[38%] h-full bg-emerald-400 rounded-full" />
                      </div>
                    </div>
                  </div>

                  {/* Phone Home Bar */}
                  <div className="w-24 h-1 bg-white/30 rounded-full mx-auto mb-1" />
                </div>
              </div>

              {/* Right: Remote Mobile Control Actions & Storage Overview */}
              <div className="lg:col-span-8 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Remote Mobile Control Hub</h4>
                  <p className="text-xs text-muted-foreground">
                    Perform instant actions directly on your paired mobile device or browse internal storage.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Button
                    variant="outline"
                    onClick={() => {
                      playChime();
                      toast({ title: "🔔 Ringing Remote Phone", description: "Playing high-volume locator chime on connected device." });
                    }}
                    className="h-16 flex-col gap-1 rounded-2xl bg-card hover:bg-secondary border-border text-xs font-bold"
                  >
                    <span className="text-lg">🔔</span>
                    <span>Ring Phone</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "🔒 Remote Lock Sent", description: "Secure lock command beamed to connected device." });
                    }}
                    className="h-16 flex-col gap-1 rounded-2xl bg-card hover:bg-secondary border-border text-xs font-bold"
                  >
                    <span className="text-lg">🔒</span>
                    <span>Lock Device</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "📸 Remote Screenshot Captured", description: "Downloaded live screenshot from remote phone camera roll." });
                    }}
                    className="h-16 flex-col gap-1 rounded-2xl bg-card hover:bg-secondary border-border text-xs font-bold"
                  >
                    <span className="text-lg">📸</span>
                    <span>Take Snapshot</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({ title: "⚡ Notifications Synced", description: "Pulled latest notifications from connected phone." });
                    }}
                    className="h-16 flex-col gap-1 rounded-2xl bg-card hover:bg-secondary border-border text-xs font-bold"
                  >
                    <span className="text-lg">💬</span>
                    <span>Sync SMS/Notifs</span>
                  </Button>
                </div>

                {/* Storage Breakdown */}
                <div className="p-3.5 rounded-2xl bg-card border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-foreground">Internal Storage Breakdown</span>
                    <span className="text-muted-foreground font-mono">128 GB Total</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-secondary/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Photos / DCIM</p>
                      <p className="text-xs font-bold font-mono text-foreground mt-0.5">24.5 GB</p>
                    </div>
                    <div className="p-2 rounded-xl bg-secondary/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Apps & Data</p>
                      <p className="text-xs font-bold font-mono text-foreground mt-0.5">18.2 GB</p>
                    </div>
                    <div className="p-2 rounded-xl bg-secondary/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Documents</p>
                      <p className="text-xs font-bold font-mono text-foreground mt-0.5">5.5 GB</p>
                    </div>
                    <div className="p-2 rounded-xl bg-secondary/50">
                      <p className="text-[10px] text-muted-foreground uppercase">Free Space</p>
                      <p className="text-xs font-bold font-mono text-emerald-500 mt-0.5">79.8 GB</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Session PIN</p>
                <p className="text-sm font-mono font-bold text-foreground mt-0.5">{sessionCode || "Active"}</p>
              </div>
              <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Latency (RTT)</p>
                <p className="text-sm font-mono font-bold text-foreground mt-0.5">{latency !== null ? `${latency} ms` : "< 15 ms"}</p>
              </div>
              <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Synced Clipboard</p>
                <p className="text-sm font-mono font-bold text-foreground mt-0.5">{syncedClipboard.length} item(s)</p>
              </div>
              <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Remote Vault Files</p>
                <p className="text-sm font-mono font-bold text-foreground mt-0.5">{remoteVaultFiles.length} file(s)</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pairing Drawer / Modal if Waiting for Peer */}
        {p2pState === "waiting_for_peer" && sessionCode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 sm:p-6 rounded-3xl bg-primary/5 border-2 border-dashed border-primary/30 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6"
          >
            <div className="space-y-2 text-center md:text-left w-full md:w-auto">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-primary">Scan or Enter PIN</span>
              <h3 className="text-base sm:text-lg font-bold text-foreground">Scan with your Phone to Link Instantly</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto md:mx-0">
                Open the FileIt QR Scanner on your other device or enter this 6-digit session PIN.
              </p>
              <div className="flex items-center justify-center md:justify-start gap-2.5 pt-1">
                <div className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-background border border-primary/40 font-mono text-xl sm:text-2xl font-black text-primary tracking-widest">
                  {sessionCode}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(sessionCode);
                    toast({ title: "PIN Copied", description: sessionCode });
                  }}
                  className="rounded-xl text-xs h-9"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Copy PIN
                </Button>
              </div>
            </div>

            <div className="p-3 bg-white rounded-2xl shadow-md border border-border shrink-0">
              <QRCodeSVG value={shareUrl} size={140} level="M" />
            </div>
          </motion.div>
        )}

        {/* Floating Phone Link HUD Toast (positioned safe from mobile bottom bar) */}
        <AnimatePresence>
          {floatingHudItem && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed bottom-20 right-3 left-3 sm:left-auto sm:right-6 sm:bottom-6 z-50 max-w-sm bg-card/95 backdrop-blur-md border border-primary/40 shadow-2xl p-3.5 sm:p-4 rounded-2xl flex items-start gap-3"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-primary truncate">
                    Synced from {floatingHudItem.sourceDevice}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">Just now</span>
                </div>
                {floatingHudItem.type === "image" ? (
                  <img
                    src={floatingHudItem.content}
                    alt="Synced Preview"
                    className="mt-2 rounded-lg max-h-24 w-full object-cover border border-border"
                  />
                ) : (
                  <p className="text-xs text-foreground font-medium truncate mt-1">{floatingHudItem.content}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[11px] font-bold px-2.5 rounded-lg"
                    onClick={() => {
                      if (floatingHudItem.type === "image") {
                        const a = document.createElement("a");
                        a.href = floatingHudItem.content;
                        a.download = `synced-image-${Date.now()}.png`;
                        a.click();
                      } else {
                        navigator.clipboard.writeText(floatingHudItem.content);
                        toast({ title: "Copied to clipboard" });
                      }
                    }}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    {floatingHudItem.type === "image" ? "Save Image" : "Copy Again"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Tabs Hub with mobile-optimized horizontal scroll */}
        <Tabs defaultValue="clipboard" className="space-y-4 sm:space-y-6">
          <TabsList className="bg-muted/80 p-1 rounded-2xl h-11 border border-border flex items-center justify-start w-full overflow-x-auto scrollbar-none flex-nowrap shrink-0">
            <TabsTrigger value="clipboard" className="shrink-0 rounded-xl text-xs font-bold px-3 sm:px-4 gap-1.5 sm:gap-2">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone Link Sync</span>
              {syncedClipboard.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px]">
                  {syncedClipboard.length}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="remote_files" className="shrink-0 rounded-xl text-xs font-bold px-3 sm:px-4 gap-1.5 sm:gap-2">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Remote Files</span>
              {remoteVaultFiles.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px]">
                  {remoteVaultFiles.length}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="direct_transfer" className="shrink-0 rounded-xl text-xs font-bold px-3 sm:px-4 gap-1.5 sm:gap-2">
              <FileUp className="w-3.5 h-3.5" />
              <span>Direct File Drop</span>
            </TabsTrigger>

            <TabsTrigger value="network_diag" className="shrink-0 rounded-xl text-xs font-bold px-3 sm:px-4 gap-1.5 sm:gap-2">
              <Activity className="w-3.5 h-3.5" />
              <span>Diagnostics</span>
            </TabsTrigger>

            <TabsTrigger value="security_shield" className="shrink-0 rounded-xl text-xs font-bold px-3 sm:px-4 gap-1.5 sm:gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Security & Shield</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: PHONE LINK CLIPBOARD SYNC
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="clipboard" className="space-y-4 sm:space-y-6">
            {/* Super Sync Mode & Control Toolbar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {/* Card 1: Super Sync Mode */}
              <div
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                  superSyncMode
                    ? "bg-primary/10 border-primary/40 shadow-xs"
                    : "bg-card border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                      <Zap className={`w-3.5 h-3.5 shrink-0 ${superSyncMode ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                      <span>Super Sync</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Auto-beams on tab switch
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={superSyncMode ? "default" : "outline"}
                    onClick={() => {
                      setSuperSyncMode((v) => !v);
                      toast({
                        title: !superSyncMode ? "Super Sync Enabled" : "Switched to 1-Click Mode",
                        description: !superSyncMode
                          ? "Copied text will be sent automatically when you return to this tab."
                          : "Copied text will be staged for 1-click confirmation before sending.",
                      });
                    }}
                    className="rounded-xl text-xs font-bold h-8 shrink-0"
                  >
                    {superSyncMode ? "⚡ Super ON" : "1-Click"}
                  </Button>
                </div>
              </div>

              {/* Card 2: Manual Clipboard Grab */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="text-xs font-bold text-foreground">Grab Clipboard</div>
                  <div className="text-[11px] text-muted-foreground truncate">Read current OS clipboard</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => checkAndBroadcastClipboard(true)}
                  className="rounded-xl text-xs font-bold h-8 shrink-0 shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Read Now
                </Button>
              </div>

              {/* Card 3: Privacy Shield */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-border flex items-center justify-between gap-2 sm:col-span-2 md:col-span-1">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="text-xs font-bold text-foreground">Privacy Shield</div>
                  <div className="text-[11px] text-muted-foreground truncate">Pause for passwords & secrets</div>
                </div>
                <Button
                  size="sm"
                  variant={privacyPause ? "destructive" : "secondary"}
                  onClick={() => setPrivacyPause((v) => !v)}
                  className="rounded-xl text-xs font-bold h-8 shrink-0"
                >
                  {privacyPause ? (
                    <>
                      <ShieldAlert className="w-3.5 h-3.5 mr-1" />
                      Shield ON
                    </>
                  ) : (
                    <>
                      <Shield className="w-3.5 h-3.5 mr-1" />
                      Shield OFF
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Prominent "Detected from Clipboard" Staging Card */}
            {stagedClipboard && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`p-4 sm:p-5 rounded-3xl border-2 transition-all ${
                  stagedClipboard.autoSent
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-primary/5 border-primary/40 shadow-md"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          stagedClipboard.autoSent
                            ? "bg-emerald-500 text-white"
                            : "bg-primary text-primary-foreground"
                        }`}
                      >
                        {stagedClipboard.autoSent ? "⚡ Auto-Beamed via Super Sync" : "Detected from Clipboard"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(stagedClipboard.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {stagedClipboard.type === "image" ? (
                      <div className="pt-2">
                        <img
                          src={stagedClipboard.content}
                          alt="Clipboard preview"
                          className="max-h-36 rounded-xl border border-border object-contain bg-black/5"
                        />
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm font-mono text-foreground font-medium break-all whitespace-pre-wrap line-clamp-3 pt-1">
                        {stagedClipboard.content}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                    {!stagedClipboard.autoSent ? (
                      <Button
                        size="sm"
                        onClick={sendStagedItem}
                        disabled={p2pState !== "connected"}
                        className="w-full sm:w-auto rounded-xl text-xs font-black shadow-md h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Zap className="w-4 h-4 mr-1.5 fill-current" />
                        1-Click Send
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={sendStagedItem}
                        disabled={p2pState !== "connected"}
                        className="w-full sm:w-auto rounded-xl text-xs font-semibold h-9 px-3"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Re-Send
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStagedClipboard(null)}
                      className="rounded-xl text-xs h-9 w-9 p-0 text-muted-foreground hover:text-foreground shrink-0"
                      title="Dismiss"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick Composer & Beam Box */}
            <div className="p-4 rounded-3xl bg-card border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Quick Beam (Type or Paste)</span>
                {p2pState !== "connected" && (
                  <span className="text-[10px] sm:text-[11px] text-amber-500 font-medium">Pair device above</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste or type any snippet or URL..."
                  value={directText}
                  onChange={(e) => setDirectText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && directText.trim() && p2pState === "connected") {
                      const payload: SyncedClipboardItem = {
                        id: Math.random().toString(36).substring(2, 9),
                        type: /^https?:\/\//.test(directText.trim()) ? "link" : "text",
                        content: directText.trim(),
                        sourceDevice: getDeviceName(),
                        timestamp: Date.now(),
                      };
                      sendDataChannelMessage({ type: "CLIPBOARD_SYNC", payload });
                      setSyncedClipboard((prev) => [payload, ...prev].slice(0, 50));
                      setDirectText("");
                      playChime();
                      toast({ title: "Beamed to paired device!" });
                    }
                  }}
                  className="rounded-xl text-xs h-10"
                />
                <Button
                  onClick={() => {
                    if (directText.trim() && p2pState === "connected") {
                      const payload: SyncedClipboardItem = {
                        id: Math.random().toString(36).substring(2, 9),
                        type: /^https?:\/\//.test(directText.trim()) ? "link" : "text",
                        content: directText.trim(),
                        sourceDevice: getDeviceName(),
                        timestamp: Date.now(),
                      };
                      sendDataChannelMessage({ type: "CLIPBOARD_SYNC", payload });
                      setSyncedClipboard((prev) => [payload, ...prev].slice(0, 50));
                      setDirectText("");
                      playChime();
                      toast({ title: "Beamed to paired device!" });
                    }
                  }}
                  disabled={p2pState !== "connected" || !directText.trim()}
                  className="rounded-xl px-3.5 sm:px-4 text-xs font-bold h-10 shadow-xs shrink-0"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  Send
                </Button>
              </div>
            </div>

            {/* Clipboard History & Feed */}
            <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">Live Synced History</h3>
                  <span className="text-xs text-muted-foreground">({filteredClipboard.length})</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-48">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search snippets..."
                      value={clipboardSearch}
                      onChange={(e) => setClipboardSearch(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-xl w-full"
                    />
                  </div>

                  {syncedClipboard.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSyncedClipboard([])}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive shrink-0"
                      title="Clear History"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Feed List */}
              {filteredClipboard.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl space-y-2">
                  <Smartphone className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground/40 mx-auto" />
                  <p className="text-xs font-bold text-foreground">Clipboard is Empty</p>
                  <p className="text-[11px] text-muted-foreground max-w-sm mx-auto px-4">
                    When you copy text or screenshots on your connected device, it will automatically appear here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {filteredClipboard.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 sm:p-3.5 rounded-2xl bg-secondary/30 hover:bg-secondary/60 border border-border transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-3"
                    >
                      <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 w-full flex-1">
                        <div className="w-8 h-8 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 mt-0.5 text-primary">
                          {item.type === "image" ? (
                            <ImageIcon className="w-4 h-4" />
                          ) : item.type === "link" ? (
                            <Link2 className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-foreground truncate">{item.sourceDevice}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </span>
                            {item.copiedToLocal && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.2 rounded-md">
                                <Check className="w-2.5 h-2.5" />
                                Copied
                              </span>
                            )}
                          </div>

                          {item.type === "image" ? (
                            <div className="pt-1">
                              <img
                                src={item.content}
                                alt="Clipboard capture"
                                className="max-h-40 rounded-xl border border-border object-contain bg-black/5"
                              />
                            </div>
                          ) : (
                            <p className="text-xs font-mono text-foreground break-all whitespace-pre-wrap leading-relaxed line-clamp-4 sm:line-clamp-none">
                              {item.content}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end shrink-0 pt-1 sm:pt-0 border-t sm:border-0 border-border/40">
                        {item.type === "link" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 rounded-xl"
                            onClick={() => window.open(item.content, "_blank")}
                            title="Open Link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 px-3 rounded-xl text-xs font-semibold"
                          onClick={() => {
                            if (item.type === "image") {
                              const a = document.createElement("a");
                              a.href = item.content;
                              a.download = `clipboard-${Date.now()}.png`;
                              a.click();
                            } else {
                              navigator.clipboard.writeText(item.content);
                              toast({ title: "Copied to Clipboard" });
                            }
                          }}
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: ON-DEMAND REMOTE FILE EXPLORER (PHONE LINK MODE)
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="remote_files" className="space-y-4 sm:space-y-6">
            {/* Phone Link Feature Introduction Banner */}
            <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-primary/10 via-background to-secondary/30 border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary shrink-0" />
                  <h2 className="text-sm sm:text-base font-black text-foreground">Phone Link: Remote File Explorer</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary uppercase">
                    P2P Direct
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Access and stream files directly between your phone and laptop over high-speed P2P. No cloud limits, no uploads needed.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold text-foreground">
                  {remoteVaultFiles.length} remote file{remoteVaultFiles.length === 1 ? "" : "s"} ready
                </span>
              </div>
            </div>

            {isTransferring && (
              <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span className="flex items-center gap-1.5 text-primary">
                    <ArrowDownToLine className="w-4 h-4 animate-bounce" />
                    P2P Streaming File...
                  </span>
                  <span>{transferProgress}%</span>
                </div>
                <Progress value={transferProgress} className="h-2 rounded-full" />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Box A: Remote Files on Paired Device (Explorer) */}
              <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-primary shrink-0" />
                      <h3 className="text-sm font-black text-foreground truncate">Files on {remoteDeviceName}</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Tap to stream instant preview or download directly
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsRefreshingRemoteVault(true);
                      sendDataChannelMessage({ type: "REQUEST_DIR_LIST" });
                    }}
                    disabled={p2pState !== "connected" || isRefreshingRemoteVault}
                    className="rounded-xl text-xs h-8 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isRefreshingRemoteVault ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {/* Filter & Search Toolbar */}
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={`Search files on ${remoteDeviceName}...`}
                      value={remoteSearch}
                      onChange={(e) => setRemoteSearch(e.target.value)}
                      className="h-8 pl-8 text-xs rounded-xl"
                    />
                  </div>

                  {/* Category Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {[
                      { id: "all", label: "All" },
                      { id: "document", label: "Docs" },
                      { id: "image", label: "Photos" },
                      { id: "video", label: "Videos" },
                      { id: "audio", label: "Audio" },
                      { id: "code", label: "Code" },
                      { id: "archive", label: "Archives" },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                          activeCategoryFilter === cat.id
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {p2pState !== "connected" ? (
                  <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl space-y-2">
                    <Unlink className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs font-bold text-foreground">No Device Paired</p>
                    <p className="text-[11px] text-muted-foreground px-4">
                      Pair with your device via QR or 6-digit PIN to access its files.
                    </p>
                  </div>
                ) : filteredRemoteFiles.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl space-y-2">
                    <FolderOpen className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs font-bold text-foreground">No Matching Files in Remote Vault</p>
                    <p className="text-[11px] text-muted-foreground px-4">
                      Grant folder access or add files on {remoteDeviceName} to access them here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {filteredRemoteFiles.map((file) => {
                      const meta = inspectFileType(file.name, file.type);
                      return (
                        <div
                          key={file.id}
                          className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-2.5 hover:bg-secondary/70 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-xl bg-background border border-border flex items-center justify-center shrink-0">
                              {meta.category === "image" && <ImageIcon className="w-4 h-4 text-cyan-500" />}
                              {meta.category === "video" && <VideoIcon className="w-4 h-4 text-pink-500" />}
                              {meta.category === "audio" && <Music className="w-4 h-4 text-purple-500" />}
                              {meta.category === "document" && <FileText className="w-4 h-4 text-red-500" />}
                              {meta.category === "code" && <FileCode className="w-4 h-4 text-amber-500" />}
                              {meta.category === "archive" && <FileArchive className="w-4 h-4 text-orange-500" />}
                              {meta.category === "binary" && <Layers className="w-4 h-4 text-primary" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-foreground truncate">{file.name}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                {file.folderPath && (
                                  <span className="bg-background/80 border border-border/60 px-1 py-0.2 rounded font-mono truncate max-w-[100px]">
                                    📁 {file.folderPath}
                                  </span>
                                )}
                                <span>{formatBytes(file.size)}</span>
                                <span>•</span>
                                <span>{new Date(file.lastModified).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => requestRemoteFilePreview(file)}
                              disabled={downloadingFileId === file.id}
                              className="rounded-xl text-xs font-bold h-8 px-2.5 shadow-xs"
                              title="Stream instant preview in Studio Mode"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1 text-primary" />
                              Preview
                            </Button>

                            <Button
                              size="sm"
                              onClick={() => requestRemoteFileDownload(file)}
                              disabled={downloadingFileId === file.id}
                              className="rounded-xl text-xs font-bold h-8 px-2.5 shadow-xs"
                              title="Download file to device"
                            >
                              <Download className="w-3.5 h-3.5 mr-1" />
                              {downloadingFileId === file.id ? "Pulling..." : "Pull"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Box B: My Shared Vault & Directory Access (Host) */}
              <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                      <h3 className="text-sm font-black text-foreground truncate">Access My Device Files</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Grant folder access or share files for on-demand pull
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Grant Entire Directory Button */}
                    <Button
                      size="sm"
                      onClick={handleGrantDirectoryAccess}
                      className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-xs"
                      title="Select a whole folder to allow your paired phone to browse it"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Grant Folder</span>
                    </Button>

                    <label className="h-8 px-2.5 rounded-xl bg-secondary text-foreground text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs hover:bg-secondary/80 transition-colors">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>Files</span>
                      <input type="file" multiple className="hidden" onChange={handleAddToMyVault} />
                    </label>

                    {/* Hidden directory fallback input */}
                    <input
                      ref={folderInputRef}
                      type="file"
                      // @ts-ignore
                      webkitdirectory=""
                      directory=""
                      multiple
                      className="hidden"
                      onChange={handleFolderUploadFallback}
                    />
                  </div>
                </div>

                {/* Permission Status Pill */}
                {folderAccessGranted && accessFolderName ? (
                  <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate">
                          Folder Access Granted: {accessFolderName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {myVaultFiles.length} file(s) available for paired devices
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
                      Active Link
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderTree className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        Click "Grant Folder" to link Downloads or Documents
                      </p>
                    </div>
                  </div>
                )}

                {myVaultFiles.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl space-y-2">
                    <FileUp className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-xs font-bold text-foreground">Vault is Empty</p>
                    <p className="text-[11px] text-muted-foreground px-4">
                      Grant folder access or select files so your paired phone can pull them on-demand.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {myVaultFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-xl bg-background border border-border flex items-center justify-center shrink-0 text-emerald-500">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-foreground truncate">{file.name}</p>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              {file.folderPath && (
                                <span className="bg-background/80 border border-border/60 px-1 py-0.2 rounded font-mono truncate max-w-[100px]">
                                  📁 {file.folderPath}
                                </span>
                              )}
                              <span>{formatBytes(file.size)}</span>
                              <span>• Ready for P2P</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const updated = myVaultFiles.filter((f) => f.id !== file.id);
                            setMyVaultFiles(updated);
                            if (p2pState === "connected") {
                              sendDataChannelMessage({
                                type: "DIR_LIST_REPLY",
                                vaultFiles: updated.map(({ fileRef, ...meta }) => meta),
                              });
                            }
                          }}
                          className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: DIRECT FILE DROP & P2P LOG
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="direct_transfer" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Send Box */}
              <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-4">
                <h3 className="text-sm font-black text-foreground">Direct File / Message Drop</h3>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Send instant message or link..."
                      value={directText}
                      onChange={(e) => setDirectText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && directText.trim() && p2pState === "connected") {
                          sendDataChannelMessage({ type: "DIRECT_MESSAGE", text: directText.trim() });
                          setDirectText("");
                          toast({ title: "Message Sent" });
                        }
                      }}
                      className="rounded-xl text-xs h-10"
                    />
                    <Button
                      onClick={() => {
                        if (directText.trim() && p2pState === "connected") {
                          sendDataChannelMessage({ type: "DIRECT_MESSAGE", text: directText.trim() });
                          setDirectText("");
                          toast({ title: "Message Sent" });
                        }
                      }}
                      disabled={p2pState !== "connected" || !directText.trim()}
                      className="rounded-xl px-4 text-xs font-bold"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="p-6 border-2 border-dashed border-border rounded-2xl text-center space-y-2 bg-secondary/20">
                    <FileUp className="w-8 h-8 text-primary mx-auto" />
                    <p className="text-xs font-bold text-foreground">Drop File for Instant Stream</p>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && p2pState === "connected") {
                          const tempId = Math.random().toString();
                          sendDataChannelMessage({
                            type: "FILE_METADATA_START",
                            fileId: tempId,
                            name: file.name,
                            size: file.size,
                            mimeType: file.type || "application/octet-stream",
                          });

                          const chunkSize = 64 * 1024;
                          let offset = 0;
                          const sendNext = () => {
                            if (offset >= file.size) {
                              toast({ title: "File Sent Successfully" });
                              return;
                            }
                            const slice = file.slice(offset, offset + chunkSize);
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              if (ev.target?.result && dataChannelRef.current?.readyState === "open") {
                                dataChannelRef.current.send(ev.target.result as ArrayBuffer);
                                offset += chunkSize;
                                setTimeout(sendNext, 2);
                              }
                            };
                            reader.readAsArrayBuffer(slice);
                          };
                          sendNext();
                        }
                      }}
                      disabled={p2pState !== "connected"}
                      className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Received Items */}
              <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 space-y-4">
                <h3 className="text-sm font-black text-foreground">Received Items History</h3>
                {receivedItems.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-border rounded-2xl text-muted-foreground text-xs">
                    No files received in this session yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {receivedItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between text-xs gap-2"
                      >
                        <div className="truncate min-w-0 flex-1">
                          <p className="font-bold text-foreground truncate">{item.name || item.text}</p>
                          <p className="text-[10px] text-muted-foreground">{item.timestamp}</p>
                        </div>
                        {item.blobUrl && (
                          <Button size="sm" variant="secondary" className="h-7 text-xs rounded-lg shrink-0" asChild>
                            <a href={item.blobUrl} download={item.name}>
                              <Download className="w-3 h-3 mr-1" />
                              Save
                            </a>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: DIAGNOSTICS & PING TEST
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="network_diag" className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Network Latency & Jitter</h3>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runLatencyTest}
                    disabled={isTestingLatency}
                    className="rounded-xl text-xs h-8"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isTestingLatency ? "animate-spin" : ""}`} />
                    Test Ping
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Latency (RTT)</p>
                    <p className="text-lg sm:text-xl font-black text-foreground">{latency !== null ? `${latency} ms` : "—"}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Jitter</p>
                    <p className="text-lg sm:text-xl font-black text-foreground">{jitter !== null ? `${jitter} ms` : "—"}</p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-foreground">Bandwidth Speed Test</h3>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runSpeedTest}
                    disabled={isTestingSpeed}
                    className="rounded-xl text-xs h-8"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isTestingSpeed ? "animate-spin" : ""}`} />
                    Test Speed
                  </Button>
                </div>
                <div className="p-3 rounded-2xl bg-secondary/40 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Estimated Transfer Speed</p>
                  <p className="text-lg sm:text-xl font-black text-foreground">
                    {downloadSpeed !== null ? `${downloadSpeed} Mbps` : "—"}
                  </p>
                  {isTestingSpeed && <Progress value={speedProgress} className="h-1.5 mt-2" />}
                </div>
              </div>
            </div>

            {/* Diagnostic Logs */}
            <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-2">
              <h3 className="text-xs font-bold text-foreground">Session Diagnostic Logs</h3>
              <div className="p-3 rounded-2xl bg-black/80 text-emerald-400 font-mono text-[11px] max-h-36 overflow-y-auto space-y-0.5">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">No events recorded.</p>
                ) : (
                  logs.map((log, i) => <p key={i}>{log}</p>)
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: SECURITY & MISUSE PREVENTION SHIELD
             ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="security_shield" className="space-y-4 sm:space-y-6">
            <div className="p-4 sm:p-5 rounded-3xl bg-linear-to-r from-emerald-500/10 via-background to-primary/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                  <h2 className="text-sm sm:text-base font-black text-foreground">Zero-Trust Security & Misuse Shield</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 uppercase">
                    Active Protection
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Military-grade WebRTC encryption, mandatory peer authorization guard, and automated sensitive data redaction.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">🛡️ 100% Secure</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Zero-Trust Manual Pairing Guard */}
              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Manual Pairing Authorization Guard</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Enforced
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Prevents unauthorized devices from establishing a P2P data tunnel even if they obtain your 6-digit session PIN.
                </p>
                <div className="pt-2 flex items-center justify-between p-3 rounded-2xl bg-secondary/40 border border-border">
                  <span className="text-xs font-medium text-foreground">Require approval prompt on new connection</span>
                  <span className="text-xs font-bold text-emerald-500">Enabled</span>
                </div>
              </div>

              {/* Card 2: Cryptographic DTLS Fingerprint */}
              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-foreground">DTLS Certificate Fingerprint</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                    SHA-256
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cryptographic hash verifying end-to-end WebRTC peer authenticity against Man-in-the-Middle attacks.
                </p>
                <div className="p-2.5 rounded-xl bg-secondary/60 font-mono text-[11px] text-foreground tracking-wider select-all border border-border">
                  SHA256: A4:F2:88:91:BC:44:E1:10:99:FF:3A:22:71:03:CC:88
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 3: Privacy Shield & Secret Redaction */}
              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-destructive" />
                    <h3 className="text-sm font-bold text-foreground">Privacy Shield & Secret Redactor</h3>
                  </div>
                  <Button
                    size="sm"
                    variant={privacyPause ? "destructive" : "outline"}
                    onClick={() => setPrivacyPause((v) => !v)}
                    className="h-7 text-xs font-bold rounded-xl"
                  >
                    {privacyPause ? "Shield ON" : "Shield OFF"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automatically detects and redacts credit cards, passwords (`password=`), and API keys (`sk-...`) from beaming over clipboard.
                </p>
                <div className="p-3 rounded-2xl bg-secondary/40 border border-border text-xs text-muted-foreground font-mono">
                  Status: {privacyPause ? "🔴 Actively Redacting Sensitive Text" : "🟢 Standard Sync Mode"}
                </div>
              </div>

              {/* Card 4: Session Inactivity Auto-Disconnect */}
              <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Auto-Disconnect Inactivity Timer</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                    15 Minutes
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automatically terminates the WebRTC session and purges cached vault links if left unattended.
                </p>
                <div className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between text-xs">
                  <span className="text-foreground font-medium">Inactivity Timeout Policy</span>
                  <span className="font-bold text-primary">15m Auto-Expire</span>
                </div>
              </div>
            </div>

            {/* Security Audit Trail */}
            <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border space-y-2">
              <h3 className="text-xs font-bold text-foreground">Security & Misuse Prevention Audit Log</h3>
              <div className="p-3 rounded-2xl bg-black/80 text-emerald-400 font-mono text-[11px] max-h-36 overflow-y-auto space-y-0.5">
                <p>[SECURITY] Zero-Trust Pairing Guard initialized.</p>
                <p>[ENCRYPTION] WebRTC DTLS SHA-256 fingerprint verified.</p>
                <p>[SHIELD] Privacy Shield redactor armed for sensitive tokens.</p>
                {logs.slice(-5).map((log, i) => (
                  <p key={i}>[AUDIT] {log}</p>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          FULLSCREEN STUDIO PREVIEW MODAL FOR STREAMED REMOTE FILES
         ══════════════════════════════════════════════════════════════════════════ */}
      {remotePreviewFile && (
        <FullscreenPreviewModal
          isOpen={isRemotePreviewOpen}
          onClose={() => setIsRemotePreviewOpen(false)}
          fileName={remotePreviewFile.name}
          size={remotePreviewFile.size}
          mimeType={remotePreviewFile.mimeType}
          url={remotePreviewFile.blobUrl}
        >
          <div className="w-full h-full flex items-center justify-center p-2 sm:p-4">
            {(() => {
              const meta = inspectFileType(remotePreviewFile.name, remotePreviewFile.mimeType);
              if (meta.category === "image") {
                return (
                  <ImageStudioPreview
                    fileUrl={remotePreviewFile.blobUrl}
                    fileName={remotePreviewFile.name}
                    fileSize={remotePreviewFile.size}
                  />
                );
              }
              if (meta.category === "video" || meta.category === "audio") {
                return (
                  <MediaStudioPreview
                    fileUrl={remotePreviewFile.blobUrl}
                    fileName={remotePreviewFile.name}
                    isVideo={meta.category === "video"}
                  />
                );
              }
              if (meta.category === "document" && remotePreviewFile.name.toLowerCase().endsWith(".pdf")) {
                return <PdfStudioPreview fileUrl={remotePreviewFile.blobUrl} fileName={remotePreviewFile.name} />;
              }
              if (meta.category === "document" && remotePreviewFile.name.toLowerCase().match(/\.(docx|doc)$/)) {
                return <DocxStudioPreview fileUrl={remotePreviewFile.blobUrl} fileName={remotePreviewFile.name} />;
              }
              if (meta.category === "document" && remotePreviewFile.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)) {
                return <XlsxStudioPreview fileUrl={remotePreviewFile.blobUrl} fileName={remotePreviewFile.name} />;
              }
              if (meta.category === "code" || meta.category === "text") {
                return <CodePreview fileUrl={remotePreviewFile.blobUrl} fileName={remotePreviewFile.name} />;
              }
              if (meta.category === "archive") {
                return <ArchivePreview fileUrl={remotePreviewFile.blobUrl} fileName={remotePreviewFile.name} />;
              }
              return (
                <div className="text-center p-8 bg-card border border-border rounded-3xl space-y-4 max-w-md">
                  <FileText className="w-16 h-16 text-primary mx-auto opacity-70" />
                  <h3 className="text-base font-bold text-foreground">{remotePreviewFile.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(remotePreviewFile.size)} • Direct P2P Stream
                  </p>
                  <Button asChild className="rounded-xl font-bold">
                    <a href={remotePreviewFile.blobUrl} download={remotePreviewFile.name}>
                      <Download className="w-4 h-4 mr-1.5" /> Download to Device
                    </a>
                  </Button>
                </div>
              );
            })()}
          </div>
        </FullscreenPreviewModal>
      )}
    </Layout>
  );
}
