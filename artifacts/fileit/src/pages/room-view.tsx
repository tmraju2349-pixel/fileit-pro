import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { useParams, useLocation } from "wouter";
import {
  ShieldCheck,
  Lock,
  Download,
  Trash2,
  Edit2,
  Clock,
  QrCode,
  ArrowLeft,
  FileUp,
  FileCode,
  File,
  Eye,
  Check,
  Copy,
  AlertTriangle,
  Flame,
  LogOut,
  Wifi,
  Zap,
  Share2,
  Smartphone,
  Monitor,
  Send,
  Radio,
  Sparkles,
  RefreshCw,
  Clipboard,
  ArrowDownCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PptxPreview } from "@/components/pptx-preview";
import { ArchivePreview } from "@/components/archive-preview";
import { CodePreview } from "@/components/code-preview";
import { MediaStudioPreview } from "@/components/media-studio-preview";
import { ImageStudioPreview } from "@/components/image-studio-preview";
import { inspectFileType } from "@/lib/file-type-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getRoomToken,
  saveStoredRoom,
  removeStoredRoom,
  formatTimeRemaining,
  setActiveRoom,
  leaveActiveRoom,
} from "@/lib/rooms-storage";
import { formatBytes } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import { ChangeExpirationDialog } from "@/components/change-expiration-dialog";
import {
  RoomP2PMeshManager,
  type MeshPeer,
  type MeshFileTransfer,
  type MeshFlashMessage,
  getDeviceDetails,
} from "@/lib/room-p2p-mesh";

interface RoomData {
  id: string;
  name: string;
  shareToken: string;
  expiresAt: string;
  createdAt: string;
}

interface RoomFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  storagePath: string;
  shareToken: string;
  downloadCount: number;
  expiresAt?: string;
  createdAt: string;
}

interface RoomTextMessage {
  id: string;
  title: string;
  content: string;
  language: string;
  createdAt: string;
}

export default function RoomViewPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [isSubmittingPass, setIsSubmittingPass] = useState(false);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [messages, setMessages] = useState<RoomTextMessage[]>([]);

  // Room Modals
  const [showQrModal, setShowQrModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<RoomFile | null>(null);

  // Edit / Rename File state
  const [editingFile, setEditingFile] = useState<RoomFile | null>(null);
  const [newFileName, setNewFileName] = useState("");

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<string>("room-default");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and Drop state
  const [isWindowDragActive, setIsWindowDragActive] = useState(false);
  const [isBoxDragActive, setIsBoxDragActive] = useState(false);
  const dragCounter = useRef(0);

  // New Note state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Active Tab inside Room
  const [activeTab, setActiveTab] = useState<"files" | "notes" | "mesh">("files");

  // ── P2P Wi-Fi Mesh Network State ──────────────────────────────────────────
  const [meshPeers, setMeshPeers] = useState<MeshPeer[]>([]);
  const [activeTransfer, setActiveTransfer] = useState<MeshFileTransfer | null>(null);
  const [p2pReceivedFiles, setP2pReceivedFiles] = useState<Array<{ name: string; size: number; blobUrl: string; fromName: string; time: string }>>([]);
  const [flashMessages, setFlashMessages] = useState<MeshFlashMessage[]>([]);
  const [flashInput, setFlashInput] = useState("");
  const [lastSyncedClipboard, setLastSyncedClipboard] = useState<string | null>(null);
  const [isStreamingP2P, setIsStreamingP2P] = useState(false);
  const meshManagerRef = useRef<RoomP2PMeshManager | null>(null);
  const p2pFileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Room Vault
  const fetchRoomData = useCallback(async (tokenOrPass?: string, isPassword = false) => {
    if (!roomId) return;
    setIsLoading(true);

    const activeToken = tokenOrPass || getRoomToken(roomId);
    const headers: Record<string, string> = {};

    if (isPassword && tokenOrPass) {
      headers["x-room-password"] = tokenOrPass;
    } else if (activeToken) {
      headers["x-room-token"] = activeToken;
    }

    try {
      const res = await fetch(`/api/rooms/${roomId}`, { headers });
      if (!res.ok) {
        setIsUnlocked(false);
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      setRoom(data.room);
      setFiles(data.files || []);
      setMessages(data.textMessages || []);
      setIsUnlocked(true);

      // Save to keyring and establish active room session
      saveStoredRoom({
        id: data.room.id,
        name: data.room.name,
        token: data.room.shareToken,
        expiresAt: data.room.expiresAt,
        joinedAt: new Date().toISOString(),
      });
      setActiveRoom(data.room.id);
    } catch {
      setIsUnlocked(false);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoomData();
  }, [fetchRoomData]);

  // ── Initialize Room P2P WebRTC Mesh Network ──────────────────────────────
  useEffect(() => {
    if (!isUnlocked || !roomId) return;

    const manager = new RoomP2PMeshManager(roomId);
    meshManagerRef.current = manager;

    manager.onPeersUpdated = (peers) => {
      setMeshPeers(peers);
    };

    manager.onFileTransferProgress = (transfer) => {
      setActiveTransfer(transfer);
      if (transfer.progress >= 100) {
        setTimeout(() => {
          setActiveTransfer((prev) => (prev?.id === transfer.id ? null : prev));
        }, 3500);
      }
    };

    manager.onFileReceived = (file) => {
      setP2pReceivedFiles((prev) => [
        { ...file, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        ...prev,
      ]);
      toast({
        title: "⚡ Direct P2P Stream Received!",
        description: `"${file.name}" (${formatBytes(file.size)}) streamed directly from ${file.fromName} into browser memory.`,
      });
      // Auto-trigger browser download to disk
      const a = document.createElement("a");
      a.href = file.blobUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    manager.onClipboardSync = (text, fromName) => {
      setLastSyncedClipboard(text);
      toast({
        title: "📋 Live Clipboard Synced",
        description: `Received text from ${fromName}: "${text.slice(0, 45)}${text.length > 45 ? "..." : ""}"`,
      });
      try {
        navigator.clipboard.writeText(text);
      } catch {}
    };

    manager.onFlashMessage = (msg) => {
      setFlashMessages((prev) => [msg, ...prev].slice(0, 50));
    };

    manager.start();

    return () => {
      manager.stop();
      meshManagerRef.current = null;
    };
  }, [isUnlocked, roomId, toast]);

  // ── P2P Actions Handlers ──────────────────────────────────────────────────
  const handleBroadcastClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        toast({ title: "Clipboard is empty", description: "Copy some text to your clipboard first.", variant: "destructive" });
        return;
      }
      if (!meshManagerRef.current) return;
      const sent = meshManagerRef.current.broadcastClipboard(text.trim());
      if (sent === 0) {
        toast({
          title: "Waiting for Roommates",
          description: "No other device is currently active in this room. Open this room on your second device or phone!",
        });
      } else {
        toast({
          title: "📋 Clipboard Broadcasted!",
          description: `Pushed clipboard text to ${sent} connected roommate device(s).`,
        });
      }
    } catch {
      const manualText = window.prompt("Enter text to broadcast to all connected devices in this room:");
      if (manualText && manualText.trim() && meshManagerRef.current) {
        const sent = meshManagerRef.current.broadcastClipboard(manualText.trim());
        toast({
          title: "📋 Clipboard Broadcasted!",
          description: `Sent to ${sent} connected device(s).`,
        });
      }
    }
  };

  const handleSendFlashMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flashInput.trim() || !meshManagerRef.current) return;

    const msgObj = meshManagerRef.current.broadcastFlashMessage(flashInput.trim());
    setFlashMessages((prev) => [msgObj, ...prev].slice(0, 50));
    setFlashInput("");
  };

  const handleP2PStreamFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !meshManagerRef.current) return;
    const filesArray = Array.from(fileList);

    const connectedCount = meshManagerRef.current.getConnectedPeerCount();
    if (connectedCount === 0) {
      toast({
        title: "No P2P Peers Connected Yet",
        description: "To stream directly with zero server storage, open this private room on a second device or phone.",
        variant: "destructive",
      });
      return;
    }

    setIsStreamingP2P(true);
    for (const file of filesArray) {
      try {
        await meshManagerRef.current.broadcastFile(file);
        toast({
          title: "⚡ Direct Stream Complete!",
          description: `Sent "${file.name}" to all connected room devices at maximum Wi-Fi speed.`,
        });
      } catch (err: any) {
        toast({
          title: "P2P Stream Failed",
          description: err.message || "Failed to stream file",
          variant: "destructive",
        });
      }
    }
    setIsStreamingP2P(false);
  };

  // Handle Manual Password Unlock
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword.trim()) return;

    setIsSubmittingPass(true);
    try {
      // First try to join via API to get token
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: unlockPassword.trim(),
          token: getRoomToken(roomId) || undefined,
        }),
      });

      if (!res.ok) {
        // Try direct unlock with password header
        await fetchRoomData(unlockPassword.trim(), true);
        if (!isUnlocked) {
          throw new Error("Invalid password or room dissolved");
        }
      } else {
        const joinData = await res.json();
        saveStoredRoom({
          id: joinData.id,
          name: joinData.name,
          token: joinData.token,
          expiresAt: joinData.expiresAt,
          joinedAt: new Date().toISOString(),
        });
        setActiveRoom(joinData.id);
        await fetchRoomData(joinData.token, false);
      }

      toast({
        title: "Room Decrypted",
        description: "Access granted to room vault.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Access denied";
      toast({
        title: "Authentication Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPass(false);
    }
  };

  // Upload File directly to Room
  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !roomId || !room) return;

    setIsUploading(true);
    setUploadProgress(10);

    const token = room.shareToken || getRoomToken(roomId);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const formData = new FormData();
        formData.append("file", file);

        // Upload to storage
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) throw new Error("Upload failed");
        const { storagePath, shareToken } = await uploadRes.json();

        setUploadProgress(60);

        // Register to room
        let expiresAt: string | undefined = undefined;
        if (selectedDuration !== "room-default" && selectedDuration !== "forever") {
          expiresAt = new Date(Date.now() + parseInt(selectedDuration) * 1000).toISOString();
        }

        const registerRes = await fetch(`/api/rooms/${roomId}/files`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "x-room-token": token } : {}),
          },
          body: JSON.stringify({
            originalName: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            storagePath,
            shareToken,
            expiresAt,
          }),
        });

        if (!registerRes.ok) throw new Error("Could not link file to room");
        setUploadProgress(100);
      } catch {
        toast({
          title: "Upload Failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive",
        });
      }
    }

    toast({
      title: "Upload Complete",
      description: `Added file(s) to ${room.name}`,
    });

    setIsUploading(false);
    setUploadProgress(0);
    fetchRoomData();
  };

  // Move existing file (from drag-and-drop file card) into this Room
  const handleLinkFileIdToRoom = async (fileId: string) => {
    if (!roomId || !room) return;
    try {
      const token = room.shareToken || getRoomToken(roomId);
      const res = await fetch(`/api/rooms/${roomId}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-room-token": token } : {}),
        },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) throw new Error("Could not link file to room");
      toast({
        title: "File Added to Room",
        description: `Successfully moved file into "${room.name}".`,
      });
      fetchRoomData();
    } catch {
      toast({
        title: "Failed to Move File",
        description: "Could not add file to this room.",
        variant: "destructive",
      });
    }
  };

  // Full-window drag-and-drop listener when unlocked in room
  useEffect(() => {
    if (!isUnlocked || !room) return;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current += 1;
      if (
        e.dataTransfer?.types?.includes("Files") ||
        e.dataTransfer?.types?.includes("fileid") ||
        e.dataTransfer?.types?.includes("text/plain")
      ) {
        setIsWindowDragActive(true);
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setIsWindowDragActive(false);
        dragCounter.current = 0;
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsWindowDragActive(false);

      const fileId = e.dataTransfer?.getData("fileId");
      if (fileId) {
        handleLinkFileIdToRoom(fileId);
        return;
      }

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleUploadFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [isUnlocked, room, roomId]);

  // Rename / Edit file in Room
  const handleRenameFile = async () => {
    if (!editingFile || !newFileName.trim() || !room) return;

    try {
      const res = await fetch(`/api/rooms/${roomId}/files/${editingFile.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-room-token": room.shareToken,
        },
        body: JSON.stringify({ originalName: newFileName.trim() }),
      });

      if (!res.ok) throw new Error("Failed to rename file");

      toast({
        title: "File Renamed",
        description: `Updated name to "${newFileName.trim()}".`,
      });

      setEditingFile(null);
      fetchRoomData();
    } catch {
      toast({
        title: "Rename Error",
        description: "Could not rename file",
        variant: "destructive",
      });
    }
  };

  // Delete file from Room
  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!room) return;

    try {
      const res = await fetch(`/api/rooms/${roomId}/files/${fileId}`, {
        method: "DELETE",
        headers: { "x-room-token": room.shareToken },
      });

      if (!res.ok) throw new Error("Failed to delete file");

      toast({
        title: "File Removed",
        description: `Deleted "${fileName}" from room vault.`,
      });
      fetchRoomData();
    } catch {
      toast({
        title: "Delete Error",
        description: "Could not delete file",
        variant: "destructive",
      });
    }
  };

  // Add Room Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || !room) return;

    setIsAddingNote(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-room-token": room.shareToken,
        },
        body: JSON.stringify({
          title: noteTitle.trim() || "Room Note",
          content: noteContent.trim(),
          language: "plaintext",
        }),
      });

      if (!res.ok) throw new Error("Failed to add note");

      setNoteTitle("");
      setNoteContent("");
      toast({ title: "Note added to room vault" });
      fetchRoomData();
    } catch {
      toast({
        title: "Error",
        description: "Could not save room note",
        variant: "destructive",
      });
    } finally {
      setIsAddingNote(false);
    }
  };

  // Delete Room Note
  const handleDeleteNote = async (msgId: string) => {
    if (!room) return;
    try {
      await fetch(`/api/rooms/${roomId}/messages/${msgId}`, {
        method: "DELETE",
        headers: { "x-room-token": room.shareToken },
      });
      fetchRoomData();
      toast({ title: "Note deleted" });
    } catch {
      toast({ title: "Failed to delete note", variant: "destructive" });
    }
  };

  // Explicit Leave Room: Clears active session so Private Rooms returns to Hub
  const handleLeaveRoom = () => {
    leaveActiveRoom();
    toast({
      title: "Left Private Room",
      description: `You have exited "${room?.name || "Room"}". Keyring preserved on this device.`,
    });
    setLocation("/rooms?switch=true");
  };

  // Early Room Dissolution
  const handleDissolveRoom = async () => {
    if (!room || !window.confirm(`Are you sure you want to dissolve "${room.name}"? ALL files will be permanently purged immediately.`)) return;

    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: "DELETE",
        headers: { "x-room-token": room.shareToken },
      });

      if (!res.ok) throw new Error("Failed to dissolve room");

      removeStoredRoom(roomId);
      leaveActiveRoom();
      toast({
        title: "Room Dissolved",
        description: "All files and records have been permanently wiped.",
      });
      setLocation("/rooms?switch=true");
    } catch {
      toast({
        title: "Error",
        description: "Could not dissolve room",
        variant: "destructive",
      });
    }
  };

  // Download All as ZIP
  const handleDownloadAllZip = () => {
    if (!room) return;
    window.open(`/api/rooms/${roomId}/download?token=${room.shareToken}`, "_blank");
  };

  // Share pairing QR link
  const pairingQrPayload = room
    ? JSON.stringify({
        roomName: room.name,
        token: room.shareToken,
        roomId: room.id,
      })
    : "";

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center text-sm text-muted-foreground">
          Checking room authentication & decrypting vault...
        </div>
      </Layout>
    );
  }

  // ── STEALTH ZERO-LEAK UNLOCK GATE ──────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-md">
          <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto">
              <Lock className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-bold text-foreground">Private Room Locked</h1>
              <p className="text-xs text-muted-foreground">
                This room is protected by room credentials. Enter password to verify roommate status.
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Room Password
                </label>
                <Input
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  placeholder="Enter room password"
                  className="h-11 rounded-xl bg-background"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmittingPass}
                className="w-full h-11 rounded-xl font-bold text-sm bg-primary text-primary-foreground"
              >
                {isSubmittingPass ? "Decrypting..." : "Unlock Room Vault"}
              </Button>
            </form>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/rooms?switch=true")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Back to Rooms Directory
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const remaining = formatTimeRemaining(room?.expiresAt);

  // ── ACTIVE ROOMMATE VAULT ──────────────────────────────────────────────────
  return (
    <Layout>
      {/* Full-Screen Drag-and-Drop Overlay */}
      {isWindowDragActive && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/85 backdrop-blur-md border-4 border-dashed border-primary/70 m-4 rounded-3xl pointer-events-none transition-all animate-in fade-in duration-150">
          <div className="p-6 rounded-full bg-primary/10 text-primary mb-4 animate-bounce">
            <FileUp className="w-12 h-12" />
          </div>
          <h3 className="text-2xl font-bold text-foreground">Drop files into {room?.name || "Private Room"}</h3>
          <p className="text-sm text-muted-foreground mt-1">Files will be instantly uploaded and added to this private room vault</p>
        </div>
      )}

      <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
        {/* Top Room Banner & Security Status */}
        <div className="p-5 md:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation("/rooms?switch=true")}
                  className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground -ml-1"
                  title="Switch room or view rooms directory"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Roommate Authorized
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mt-1">
                {room?.name}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Private vault shared between room devices • Only roommates can view, download, add, and edit
              </p>
            </div>

            {/* Roommate Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQrModal(true)}
                className="rounded-xl h-9 px-3 text-xs font-semibold gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5 text-primary" />
                <span>Pair Phone / QR</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllZip}
                disabled={files.length === 0 && messages.length === 0}
                className="rounded-xl h-9 px-3 text-xs font-semibold gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download All (.ZIP)</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLeaveRoom}
                className="rounded-xl h-9 px-3 text-xs font-semibold gap-1.5 border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all text-foreground"
                title="Exit this room session and return to Rooms directory"
              >
                <LogOut className="w-3.5 h-3.5 text-amber-500" />
                <span>Leave Room</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDissolveRoom}
                className="rounded-xl h-9 px-3 text-xs font-semibold gap-1.5 text-destructive hover:bg-destructive/10"
                title="Immediately delete this room and all files"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Dissolve Room</span>
              </Button>
            </div>
          </div>

          {/* 3-Day Dissolution Warning Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-600 dark:text-amber-400">
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                3-Day Auto-Dissolution: <strong>{remaining.text}</strong>
              </span>
            </div>
            <span className="text-[11px] opacity-90">
              All files, notes, and records will be permanently purged when the timer expires.
            </span>
          </div>

          {/* ── LIVE P2P WI-FI MESH NETWORK BAR ─────────────────────────────── */}
          <div className="p-4 rounded-2xl bg-secondary/40 border border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    meshPeers.some((p) => p.connected) ? "bg-emerald-400" : "bg-blue-400"
                  }`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    meshPeers.some((p) => p.connected) ? "bg-emerald-500" : "bg-blue-500"
                  }`} />
                </span>
                <span className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Radio className="w-3.5 h-3.5 text-primary" />
                  P2P Wi-Fi Mesh:
                </span>
              </div>

              {meshPeers.some((p) => p.connected) ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {meshPeers.filter((p) => p.connected).length + 1} Devices Linked
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1">
                    <span className="px-2 py-0.5 rounded-full bg-background border text-[10px] font-medium flex items-center gap-1">
                      <Monitor className="w-3 h-3 text-primary" /> You ({getDeviceDetails().peerName})
                    </span>
                    {meshPeers.map((p) => (
                      <span
                        key={p.peerId}
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-medium flex items-center gap-1 ${
                          p.connected
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.deviceType === "mobile" ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                        {p.peerName} {p.connected ? "(Active)" : "(Connecting...)"}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Ready & waiting for 2nd device (Open this room on your phone or laptop)
                </span>
              )}
            </div>

            {/* Quick Actions for Active Mesh */}
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="file"
                multiple
                ref={p2pFileInputRef}
                onChange={(e) => handleP2PStreamFiles(e.target.files)}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleBroadcastClipboard}
                className="h-8 rounded-xl px-2.5 text-xs font-semibold gap-1 text-primary border-primary/30 hover:bg-primary/10"
                title="Broadcast your current clipboard text to all connected roommates"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Live Sync Clipboard</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => p2pFileInputRef.current?.click()}
                disabled={isStreamingP2P}
                className="h-8 rounded-xl px-2.5 text-xs font-semibold gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                title="Stream a file directly through RAM with zero server storage"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isStreamingP2P ? "Streaming..." : "Direct P2P Stream"}</span>
              </Button>
            </div>
          </div>

          {/* Active P2P Transfer Progress Meter */}
          {activeTransfer && (
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Zap className="w-4 h-4 text-primary animate-pulse" />
                  {activeTransfer.direction === "sending" ? "Streaming P2P File to Devices:" : "Receiving Direct Stream:"}{" "}
                  <strong>{activeTransfer.name}</strong> ({formatBytes(activeTransfer.size)})
                </span>
                <span className="text-primary font-mono">{activeTransfer.speed} • {activeTransfer.progress}%</span>
              </div>
              <div className="w-full bg-secondary/80 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-150 rounded-full"
                  style={{ width: `${activeTransfer.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Room Tab Selector */}
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("files")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "files"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground bg-muted/40"
              }`}
            >
              <File className="w-3.5 h-3.5" />
              <span>Room Vault Files ({files.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("mesh")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "mesh"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground bg-muted/40"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Direct Wi-Fi Mesh ({meshPeers.filter((p) => p.connected).length})</span>
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "notes"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground bg-muted/40"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Room Notes & Code ({messages.length})</span>
            </button>
          </div>

          {activeTab === "files" && (
            <div>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={(e) => handleUploadFiles(e.target.files)}
                className="hidden"
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="rounded-xl h-9 px-3.5 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground"
              >
                <FileUp className="w-4 h-4" />
                <span>{isUploading ? `Adding Files (${uploadProgress}%)...` : "Add Files to Room"}</span>
              </Button>
            </div>
          )}

          {activeTab === "mesh" && (
            <Button
              size="sm"
              onClick={() => p2pFileInputRef.current?.click()}
              disabled={isStreamingP2P}
              className="rounded-xl h-9 px-3.5 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Zap className="w-4 h-4" />
              <span>Stream Direct File</span>
            </Button>
          )}
        </div>

        {/* ───────────────────────────────────────────────────────────────────────
            TAB 1: ROOM FILES (ADD, VIEW, DOWNLOAD, EDIT/RENAME, DELETE)
        ──────────────────────────────────────────────────────────────────────── */}
        {activeTab === "files" && (
          <div className="space-y-4">
            {/* Dissolve Timer Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/30 border border-border/60 p-3 rounded-2xl">
              <span className="text-sm font-semibold text-foreground flex items-center gap-1.5 px-1">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <span>Auto-Dissolve override:</span>
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { label: "Room Timer", value: "room-default" },
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

            {/* Multi-file drop target */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                setIsBoxDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsBoxDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsBoxDragActive(false);

                const fileId = e.dataTransfer.getData("fileId");
                if (fileId) {
                  handleLinkFileIdToRoom(fileId);
                  return;
                }

                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleUploadFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 rounded-3xl border-2 border-dashed text-center cursor-pointer transition-all ${
                isBoxDragActive
                  ? "border-primary ring-4 ring-primary/20 bg-primary/10 scale-[1.01]"
                  : "border-border hover:border-primary/50 bg-card/50"
              }`}
            >
              <FileUp className={`w-8 h-8 mx-auto mb-2 transition-transform ${isBoxDragActive ? "text-primary scale-110" : "text-muted-foreground/60"}`} />
              <p className="text-sm font-semibold text-foreground">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Any file dropped here is immediately accessible to all roommates in this room
              </p>
            </div>

            {/* Room Files Grid */}
            {files.length === 0 ? (
              <div className="p-12 text-center rounded-3xl border border-border bg-card">
                <File className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">Room vault is currently empty</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload photos, videos, documents, or archives above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="p-4 rounded-2xl bg-card border border-border shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate flex-1" title={file.originalName}>
                          {file.originalName}
                        </h3>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Uploaded {new Date(file.createdAt).toLocaleDateString()} • {file.downloadCount} downloads
                      </p>
                      {file.expiresAt && (
                        <div className={`flex items-center gap-1 text-[11px] font-semibold ${
                          formatTimeRemaining(file.expiresAt).isUrgent ? "text-amber-500" : "text-muted-foreground"
                        }`}>
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{formatTimeRemaining(file.expiresAt).text}</span>
                        </div>
                      )}
                    </div>

                    {/* Roommate Actions: View, Download, Edit/Rename, Delete */}
                    <div className="flex items-center justify-between gap-1 pt-3 mt-3 border-t border-border/70">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewFile(file)}
                          className="h-8 px-2 text-xs font-semibold rounded-lg gap-1"
                          title="Preview file"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </Button>

                        <a
                          href={`/api/storage/${file.storagePath}?download=1`}
                          download={file.originalName}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const event = new CustomEvent("change-file-expiration", {
                              detail: { fileId: file.id, originalName: file.originalName, currentExpiresAt: file.expiresAt },
                              bubbles: true,
                            });
                            window.dispatchEvent(event);
                          }}
                          className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                          title="Change Dissolve Timer"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingFile(file);
                            setNewFileName(file.originalName);
                          }}
                          className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                          title="Rename / Edit filename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteFile(file.id, file.originalName)}
                          className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                          title="Delete from room"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────────────────
            TAB 2: ROOM NOTES & CODE (COLLABORATIVE TEXT)
        ──────────────────────────────────────────────────────────────────────── */}
        {activeTab === "notes" && (
          <div className="space-y-6">
            {/* Add Note Card */}
            <form onSubmit={handleAddNote} className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileCode className="w-4 h-4 text-primary" />
                Add Shared Note or Code for Roommates
              </h2>
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note or snippet title (e.g. WiFi password, meeting notes, code)"
                className="h-10 rounded-xl bg-background text-sm"
              />
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write or paste text here..."
                className="min-h-[100px] rounded-xl bg-background text-sm font-mono"
                required
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isAddingNote || !noteContent.trim()}
                  className="rounded-xl h-9 px-4 text-xs font-bold bg-primary text-primary-foreground"
                >
                  {isAddingNote ? "Saving..." : "Add to Room"}
                </Button>
              </div>
            </form>

            {/* Notes List */}
            {messages.length === 0 ? (
              <div className="p-8 text-center rounded-3xl border border-dashed border-border bg-card/40">
                <p className="text-sm font-semibold text-foreground">No notes in this room yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use the box above to add text or code.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm text-foreground truncate">{msg.title}</h3>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/40 font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {msg.content}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/70">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          toast({ title: "Copied note to clipboard" });
                        }}
                        className="h-8 px-2.5 text-xs font-semibold rounded-lg gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteNote(msg.id)}
                        className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────────────────
            TAB 3: DIRECT WI-FI MESH STREAM (ZERO-STORAGE P2P SUITE)
        ──────────────────────────────────────────────────────────────────────── */}
        {activeTab === "mesh" && (
          <div className="space-y-6 animate-in fade-in">
            {/* Direct P2P Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleP2PStreamFiles(e.dataTransfer.files);
              }}
              onClick={() => p2pFileInputRef.current?.click()}
              className="p-8 rounded-3xl border-2 border-dashed border-primary/40 bg-card hover:bg-primary/5 hover:border-primary transition-all cursor-pointer text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Stream Directly to Connected Devices
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  Files are streamed directly peer-to-peer into the browser RAM of all connected roommates. Zero server storage used, unlimited speed.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                {meshPeers.filter((p) => p.connected).length > 0
                  ? `Ready to stream to ${meshPeers.filter((p) => p.connected).length} active peer(s)`
                  : "Connect a 2nd device to stream live"}
              </div>
            </div>

            {/* Two-Column Grid: Instant Flash Notes + Received Streams */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Instant Zero-Storage Flash Chat */}
              <div className="p-5 rounded-3xl bg-card border border-border space-y-4 shadow-xs flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Send className="w-4 h-4 text-primary" />
                      Direct Roommate Flash Chat
                    </h3>
                    <span className="text-[10px] text-muted-foreground font-mono">P2P Encrypted</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Instant zero-server messaging between devices currently in this room. Wiped when you leave.
                  </p>

                  <div className="h-48 overflow-y-auto space-y-2 pr-1 pt-2">
                    {flashMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
                        <span>No messages yet. Send a quick note to connected devices!</span>
                      </div>
                    ) : (
                      flashMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-2xl text-xs space-y-1 ${
                            msg.fromPeerId === meshManagerRef.current?.myPeerId
                              ? "bg-primary/10 border border-primary/20 ml-6"
                              : "bg-secondary border mr-6"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{msg.fromName}</span>
                            <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="text-foreground leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <form onSubmit={handleSendFlashMessage} className="flex gap-2 pt-2 border-t border-border">
                  <Input
                    placeholder="Type an instant flash note..."
                    value={flashInput}
                    onChange={(e) => setFlashInput(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                  <Button type="submit" size="sm" className="h-9 rounded-xl px-3 font-semibold text-xs gap-1">
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </Button>
                </form>
              </div>

              {/* Received Direct P2P Files History */}
              <div className="p-5 rounded-3xl bg-card border border-border space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
                    Direct P2P Received Streams
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                    {p2pReceivedFiles.length} In-RAM
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Files streamed straight to this browser without hitting any cloud servers.
                </p>

                <div className="h-48 overflow-y-auto space-y-2 pr-1">
                  {p2pReceivedFiles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
                      <span>No direct streams received yet during this active session.</span>
                    </div>
                  ) : (
                    p2pReceivedFiles.map((f, i) => (
                      <div key={i} className="p-3 rounded-2xl bg-secondary/50 border flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{f.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatBytes(f.size)} • from {f.fromName} at {f.time}
                          </p>
                        </div>
                        <a href={f.blobUrl} download={f.name}>
                          <Button size="sm" variant="outline" className="h-7 text-xs font-semibold rounded-lg px-2 text-emerald-600 border-emerald-500/20">
                            <Download className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                        </a>
                      </div>
                    ))
                  )}
                </div>

                {lastSyncedClipboard && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-primary">
                      <span className="flex items-center gap-1">
                        <Clipboard className="w-3 h-3" /> Last Synced Clipboard
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(lastSyncedClipboard);
                          toast({ title: "Copied to clipboard" });
                        }}
                        className="text-[10px] underline"
                      >
                        Copy Again
                      </button>
                    </div>
                    <p className="font-mono text-xs text-foreground truncate">{lastSyncedClipboard}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PAIRING QR CODE MODAL ────────────────────────────────────────── */}
        <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
          <DialogContent className="max-w-sm rounded-3xl p-6 text-center space-y-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg font-bold flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                Pair Roommate Device
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Scan this with your Android camera or phone to join "{room?.name}" instantly.
              </DialogDescription>
            </DialogHeader>

            <div className="p-4 rounded-2xl bg-white flex items-center justify-center shadow-inner mx-auto w-fit">
              <QRCodeSVG value={pairingQrPayload} size={180} level="M" />
            </div>

            <div className="space-y-2 text-left">
              <div className="p-3 rounded-xl bg-muted text-xs space-y-1">
                <p className="font-semibold text-foreground">Room Token:</p>
                <p className="font-mono text-[11px] text-muted-foreground break-all">{room?.shareToken}</p>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(room?.shareToken || "");
                toast({ title: "Room token copied" });
              }}
              className="w-full rounded-xl h-10 text-xs font-semibold gap-1.5"
            >
              <Copy className="w-4 h-4" />
              <span>Copy Pairing Token</span>
            </Button>
          </DialogContent>
        </Dialog>

        {/* ── RENAME / EDIT FILE MODAL ─────────────────────────────────────── */}
        <Dialog open={!!editingFile} onOpenChange={(open) => !open && setEditingFile(null)}>
          <DialogContent className="max-w-md rounded-3xl p-6 space-y-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary" />
                Edit / Rename File
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                All roommates will see the updated file name immediately.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">File Name</label>
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="h-11 rounded-xl bg-background"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingFile(null)} className="rounded-xl">
                Cancel
              </Button>
              <Button onClick={handleRenameFile} className="rounded-xl font-bold bg-primary text-primary-foreground">
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── IN-BROWSER FILE PREVIEW MODAL ─────────────────────────────────── */}
        <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
          <DialogContent className="max-w-3xl rounded-3xl p-6 space-y-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-bold truncate">
                {previewFile?.originalName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {previewFile && formatBytes(previewFile.size)} • {previewFile?.mimeType}
              </DialogDescription>
            </DialogHeader>

            <div className="p-1 rounded-2xl flex items-center justify-center min-h-[260px] max-h-[75vh] overflow-auto">
              {previewFile && (() => {
                const meta = inspectFileType(previewFile.originalName, previewFile.mimeType);
                const fileUrl = `/api/storage/${previewFile.storagePath}`;

                if (meta.category === "image") {
                  return (
                    <ImageStudioPreview
                      url={fileUrl}
                      fileName={previewFile.originalName}
                      size={previewFile.size}
                      className="w-full border-0"
                    />
                  );
                }
                if (meta.category === "video") {
                  return (
                    <MediaStudioPreview
                      url={fileUrl}
                      fileName={previewFile.originalName}
                      type="video"
                      className="w-full border-0"
                    />
                  );
                }
                if (meta.category === "audio") {
                  return (
                    <MediaStudioPreview
                      url={fileUrl}
                      fileName={previewFile.originalName}
                      type="audio"
                      className="w-full border-0"
                    />
                  );
                }
                if (
                  meta.category === "presentation" ||
                  previewFile.originalName.toLowerCase().endsWith(".pptx") ||
                  previewFile.originalName.toLowerCase().endsWith(".ppt")
                ) {
                  return (
                    <PptxPreview
                      url={fileUrl}
                      fileName={previewFile.originalName}
                      className="w-full border-0"
                    />
                  );
                }
                if (meta.category === "archive" || meta.category === "apk") {
                  return (
                    <ArchivePreview
                      url={fileUrl}
                      fileName={previewFile.originalName}
                      className="w-full border-0"
                    />
                  );
                }
                if (meta.category === "code" || meta.category === "text") {
                  return (
                    <CodePreview
                      url={fileUrl}
                      fileName={previewFile.originalName}
                      className="w-full border-0"
                    />
                  );
                }
                return (
                  <div className="text-center py-10 space-y-2">
                    <File className="w-12 h-12 text-muted-foreground/50 mx-auto" />
                    <p className="text-sm font-semibold text-foreground">File ready for download</p>
                    <p className="text-xs text-muted-foreground">This file format is ready for local download.</p>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreviewFile(null)} className="rounded-xl">
                Close
              </Button>
              <a
                href={`/api/storage/${previewFile?.storagePath}?download=1`}
                download={previewFile?.originalName}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </a>
            </div>
          </DialogContent>
        </Dialog>

        <ChangeExpirationDialog onClose={() => fetchRoomData()} />
      </div>
    </Layout>
  );
}
