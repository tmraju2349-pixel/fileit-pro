import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Wifi, 
  WifiOff, 
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
  AlertCircle,
  QrCode,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

// WebRTC STUN configurations
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

interface ReceivedItem {
  id: string;
  type: "text" | "file";
  name?: string;
  text?: string;
  blobUrl?: string;
  size?: number;
  timestamp: string;
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
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null); // in Mbps
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);
  const [speedProgress, setSpeedProgress] = useState(0);

  // ── WebRTC / Peer-to-Peer Connection States ──────────────────────────────
  const [connectionRole, setConnectionRole] = useState<"initiator" | "receiver" | null>(null);
  const [sessionCode, setSessionCode] = useState<string>("");
  const [enteredCode, setEnteredCode] = useState<string>("");
  const [p2pState, setP2PState] = useState<"idle" | "creating" | "waiting_for_peer" | "connecting" | "connected" | "disconnected">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  
  const [clipboardText, setClipboardText] = useState("");
  const [directFile, setDirectFile] = useState<File | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);

  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);

  // WebRTC Connection References
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const activePollingInterval = useRef<NodeJS.Timeout | null>(null);

  // Incoming File Assembly States
  const incomingFileMeta = useRef<{ name: string; size: number; mimeType: string } | null>(null);
  const incomingFileChunks = useRef<ArrayBuffer[]>([]);
  const incomingReceivedBytes = useRef<number>(0);

  // Add Log helper
  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Cleanup active WebRTC instances on unmount/role change
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
    setDirectFile(null);
    setIsTransferring(false);
    setTransferProgress(0);
  };

  useEffect(() => {
    return () => {
      cleanupWebRTC();
    };
  }, []);

  // ── LATENCY DIAGNOSTICS (Echo RTT Probes) ─────────────────────────────────
  const runLatencyTest = async () => {
    setIsTestingLatency(true);
    addLog("Starting server round-trip latency probe...");
    
    const pings: number[] = [];
    try {
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error("Health check unreachable");
        const end = performance.now();
        pings.push(end - start);
        await new Promise((r) => setTimeout(r, 200));
      }

      const avgLatency = pings.reduce((a, b) => a + b, 0) / pings.length;
      
      // Calculate Jitter (average difference between consecutive pings)
      let sumJitter = 0;
      for (let i = 1; i < pings.length; i++) {
        sumJitter += Math.abs(pings[i] - pings[i - 1]);
      }
      const calculatedJitter = sumJitter / (pings.length - 1);

      setLatency(Math.round(avgLatency));
      setJitter(Math.round(calculatedJitter));
      addLog(`Latency probe complete: Avg RTT = ${Math.round(avgLatency)}ms, Jitter = ${Math.round(calculatedJitter)}ms`);
    } catch {
      toast({
        variant: "destructive",
        title: "Latency probe failed",
        description: "Could not reach the diagnostics backend.",
      });
    } finally {
      setIsTestingLatency(false);
    }
  };

  // ── SPEED TEST DIAGNOSTICS (Downstream Stream) ───────────────────────────
  const runSpeedTest = async () => {
    setIsTestingSpeed(true);
    setSpeedProgress(0);
    setDownloadSpeed(null);
    addLog("Initiating synthetic bandwidth speed test...");

    try {
      const start = performance.now();
      
      // Fetch dynamic 2MB diagnostic speedtest block
      const res = await fetch("/api/webrtc/speedtest");
      if (!res.ok) throw new Error("Speedtest source unavailable");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Readable stream unavailable");

      let receivedBytes = 0;
      const totalBytes = 2 * 1024 * 1024; // 2MB expected

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.length;
        setSpeedProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
      }

      const end = performance.now();
      const elapsedSeconds = (end - start) / 1000;
      
      // Convert Bytes to Megabits: (bytes * 8) / (1024 * 1024)
      const megabits = (receivedBytes * 8) / (1024 * 1024);
      const mbps = megabits / elapsedSeconds;

      setDownloadSpeed(parseFloat(mbps.toFixed(2)));
      addLog(`Bandwidth test complete: Speed = ${mbps.toFixed(2)} Mbps over ${elapsedSeconds.toFixed(2)}s.`);
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Speed test failed",
        description: "Diagnose endpoint returned an invalid response.",
      });
    } finally {
      setIsTestingSpeed(false);
    }
  };

  // ── WEBRTC CODES (Setup DataChannel Handlers) ─────────────────────────────
  const setupDataChannelListeners = (channel: RTCDataChannel) => {
    channel.onopen = () => {
      setP2PState("connected");
      addLog("Direct WebRTC DataChannel successfully connected!");
      toast({
        title: "Peer Linked Successfully",
        description: "You can now sync clipboard text and drop files directly.",
      });
    };

    channel.onclose = () => {
      setP2PState("disconnected");
      addLog("DataChannel closed.");
    };

    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "clipboard") {
            const newItem: ReceivedItem = {
              id: Math.random().toString(),
              type: "text",
              text: msg.text,
              timestamp: new Date().toLocaleTimeString(),
            };
            setReceivedItems((prev) => [newItem, ...prev]);
            addLog(`Received direct clipboard sync: "${msg.text.substring(0, 30)}..."`);
            
            // Try to write to native clipboard
            navigator.clipboard.writeText(msg.text)
              .then(() => toast({ title: "Clipboard synced", description: "Copied direct sync content." }))
              .catch(() => {});
          } else if (msg.type === "file-metadata") {
            // Start of a file receive stream
            incomingFileMeta.current = {
              name: msg.name,
              size: msg.size,
              mimeType: msg.mimeType,
            };
            incomingFileChunks.current = [];
            incomingReceivedBytes.current = 0;
            setIsTransferring(true);
            setTransferProgress(0);
            addLog(`Incoming file transfer: "${msg.name}" (${Math.round(msg.size / 1024)} KB)`);
          } else if (msg.type === "file-complete") {
            // Assembly of the compiled chunks
            if (incomingFileMeta.current) {
              const fileBlob = new Blob(incomingFileChunks.current, { type: incomingFileMeta.current.mimeType });
              const blobUrl = URL.createObjectURL(fileBlob);

              const newItem: ReceivedItem = {
                id: Math.random().toString(),
                type: "file",
                name: incomingFileMeta.current.name,
                blobUrl,
                size: incomingFileMeta.current.size,
                timestamp: new Date().toLocaleTimeString(),
              };

              setReceivedItems((prev) => [newItem, ...prev]);
              addLog(`Successfully assembled and loaded P2P file: "${incomingFileMeta.current.name}"`);
              toast({
                title: "File received directly",
                description: `"${incomingFileMeta.current.name}" is ready for download.`,
              });
            }
            setIsTransferring(false);
            setTransferProgress(0);
            incomingFileMeta.current = null;
            incomingFileChunks.current = [];
            incomingReceivedBytes.current = 0;
          }
        } catch {
          // Non-JSON standard string
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Feed direct binary chunk into buffer
        incomingFileChunks.current.push(event.data);
        incomingReceivedBytes.current += event.data.byteLength;

        if (incomingFileMeta.current) {
          const prog = Math.round((incomingReceivedBytes.current / incomingFileMeta.current.size) * 100);
          setTransferProgress(prog);
        }
      }
    };
  };

  // ── INITIATOR FLOW (Generate Code and listen for offer/answer) ────────────
  const startInitiatorFlow = async () => {
    cleanupWebRTC();
    setConnectionRole("initiator");
    setP2PState("creating");
    addLog("Creating direct pairing session...");

    try {
      const res = await fetch("/api/webrtc/session", { method: "POST" });
      const { code } = await res.json();
      setSessionCode(code);
      setP2PState("waiting_for_peer");
      addLog(`Pairing session established. Code: ${code}. Waiting for peer to connect...`);

      // 1. Initialize PeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      // 2. Setup local DataChannel
      const channel = pc.createDataChannel("fileit-p2p-channel", { ordered: true });
      dataChannelRef.current = channel;
      setupDataChannelListeners(channel);

      // 3. Gather ICE Candidates & send to server
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await fetch(`/api/webrtc/session/${code}/candidates/initiator`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate: event.candidate }),
          });
        }
      };

      // 4. Create and upload Local offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`/api/webrtc/session/${code}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer }),
      });

      addLog("Signaling offer uploaded. Awaiting answer response...");

      // 5. Poll for remote Receiver Answer & Receiver Candidates
      let answered = false;
      const polledCandidates = new Set<string>();

      activePollingInterval.current = setInterval(async () => {
        try {
          if (!answered) {
            const ansRes = await fetch(`/api/webrtc/session/${code}/answer`);
            if (ansRes.status === 200) {
              const { answer } = await ansRes.json();
              await pc.setRemoteDescription(new RTCSessionDescription(answer));
              answered = true;
              setP2PState("connecting");
              addLog("Remote pairing answer received. Aligning secure WebRTC tunnel...");
            }
          }

          if (answered) {
            // Poll for Receiver ICE candidates
            const candRes = await fetch(`/api/webrtc/session/${code}/candidates/receiver`);
            if (candRes.ok) {
              const { candidates } = await candRes.json();
              for (const cand of candidates) {
                const str = JSON.stringify(cand);
                if (!polledCandidates.has(str)) {
                  polledCandidates.add(str);
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                  addLog("Exchanged verified Receiver hardware ICE coordinate.");
                }
              }
            }
          }
        } catch (err) {
          console.error("Initiator polling error", err);
        }
      }, 1500);

    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Failed to establish signaling",
        description: "Our signaling server was unreachable.",
      });
      setP2PState("idle");
    }
  };

  // ── RECEIVER FLOW (Enter Code, fetch offer, upload answer) ────────────────
  const joinReceiverFlow = async () => {
    if (!enteredCode.trim() || enteredCode.trim().length !== 6) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description: "Please enter a valid 6-digit session code.",
      });
      return;
    }

    cleanupWebRTC();
    setConnectionRole("receiver");
    setP2PState("connecting");
    const code = enteredCode.trim();
    addLog(`Attempting to join session code ${code}...`);

    try {
      // 1. Check session existence & fetch Offer
      const checkRes = await fetch(`/api/webrtc/session/${code}`);
      if (!checkRes.ok) {
        throw new Error("Session does not exist or expired.");
      }

      const offerRes = await fetch(`/api/webrtc/session/${code}/offer`);
      if (offerRes.status !== 200) {
        throw new Error("Initiator has not generated connection parameters yet.");
      }
      const { offer } = await offerRes.json();

      // 2. Initialize PeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      // 3. Register incoming data channel trigger
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannelRef.current = channel;
        setupDataChannelListeners(channel);
        addLog("P2P communication channel synced on receiver end.");
      };

      // 4. Gather local candidates & push to server
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await fetch(`/api/webrtc/session/${code}/candidates/receiver`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ candidate: event.candidate }),
          });
        }
      };

      // 5. Apply Remote Offer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      addLog("Applied remote session parameter offer. Generating response answer...");

      // 6. Create Answer & upload to server
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`/api/webrtc/session/${code}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });

      addLog("Signaling answer uploaded. Syncing candidates with initiator...");

      // 7. Poll for Initiator ICE candidates
      const polledCandidates = new Set<string>();
      activePollingInterval.current = setInterval(async () => {
        try {
          const candRes = await fetch(`/api/webrtc/session/${code}/candidates/initiator`);
          if (candRes.ok) {
            const { candidates } = await candRes.json();
            for (const cand of candidates) {
              const str = JSON.stringify(cand);
              if (!polledCandidates.has(str)) {
                polledCandidates.add(str);
                await pc.addIceCandidate(new RTCIceCandidate(cand));
                addLog("Exchanged verified Initiator hardware ICE coordinate.");
              }
            }
          }
        } catch (err) {
          console.error("Receiver polling error", err);
        }
      }, 1500);

    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: err.message || "Could not handshake with peer.",
      });
      setP2PState("idle");
    }
  };

  // ── SEND SYNC CLIPBOARD (Over WebRTC DataChannel) ─────────────────────────
  const sendClipboardSync = () => {
    if (!clipboardText.trim()) return;
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      toast({
        variant: "destructive",
        title: "Not Connected",
        description: "Direct connection channel is not open.",
      });
      return;
    }

    channel.send(JSON.stringify({
      type: "clipboard",
      text: clipboardText.trim(),
    }));

    toast({
      title: "Clipboard synced to peer",
      description: "Successfully pushed data directly to the active roommate.",
    });

    setClipboardText("");
  };

  // ── SEND DIRECT FILE (Slices file into 16KB ArrayBuffer chunks) ──────────
  const sendDirectFile = () => {
    if (!directFile) return;
    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") {
      toast({
        variant: "destructive",
        title: "Not Connected",
        description: "Direct WebRTC channel is offline.",
      });
      return;
    }

    setIsTransferring(true);
    setTransferProgress(0);
    addLog(`Initiating direct file stream: "${directFile.name}"`);

    // 1. Send starting Metadata packet
    channel.send(JSON.stringify({
      type: "file-metadata",
      name: directFile.name,
      size: directFile.size,
      mimeType: directFile.type,
    }));

    // 2. Read and stream file in chunk slices
    const CHUNK_SIZE = 16 * 1024; // 16KB payload chunks
    let offset = 0;
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      channel.send(arrayBuffer);

      offset += arrayBuffer.byteLength;
      const currentProg = Math.round((offset / directFile.size) * 100);
      setTransferProgress(currentProg);

      if (offset < directFile.size) {
        readNextChunk();
      } else {
        // Send final completion metadata
        channel.send(JSON.stringify({ type: "file-complete" }));
        addLog(`File successfully streamed to remote peer: "${directFile.name}"`);
        toast({
          title: "File sent directly!",
          description: `Direct transfer of "${directFile.name}" completed.`,
        });
        setIsTransferring(false);
        setTransferProgress(0);
        setDirectFile(null);
      }
    };

    const readNextChunk = () => {
      const slice = directFile.slice(offset, offset + CHUNK_SIZE);
      fileReader.readAsArrayBuffer(slice);
    };

    readNextChunk();
  };

  // ── Bluetooth Link Connection Flow ──────────────────────────────────────────
  const [isBluetoothConnecting, setIsBluetoothConnecting] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState<any | null>(null);

  const handleBluetoothConnect = async () => {
    setIsBluetoothConnecting(true);
    addLog("Initiating Bluetooth Low Energy (BLE) scanning...");
    
    // Check if BLE exists in browser navigator object
    const nav = navigator as any;
    if (!nav || !nav.bluetooth) {
      addLog("Error: Native Web Bluetooth API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Android Chrome under an HTTPS context.");
      toast({
        variant: "destructive",
        title: "Web Bluetooth Unsupported",
        description: "Your browser does not support the Web Bluetooth API. Please use a Chromium-based browser (Chrome, Edge) on secure host (HTTPS).",
      });
      setIsBluetoothConnecting(false);
      return;
    }

    try {
      addLog("Opening secure native pairing selector window...");
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });

      addLog(`Pairing requested with Bluetooth device: "${device.name || "Unnamed Device"}"`);
      addLog("Establishing low-latency GATT profile session...");
      
      const server = await device.gatt.connect();
      setBluetoothDevice(device);
      setP2PState("connected");
      
      addLog(`Bluetooth Connection Successful: GATT linked to "${device.name || "Unnamed Device"}" (ID: ${device.id})`);
      toast({
        title: "Bluetooth Device Connected!",
        description: `Directly synced with ${device.name || "Unnamed Device"}.`,
      });
    } catch (err: any) {
      addLog(`Bluetooth connection cancelled or failed: ${err.message}`);
      toast({
        variant: "destructive",
        title: "Bluetooth Sync Failed",
        description: err.message || "Operation was aborted.",
      });
    } finally {
      setIsBluetoothConnecting(false);
    }
  };

  const getStatusColor = () => {
    switch (p2pState) {
      case "connected": return "bg-emerald-500 text-emerald-500";
      case "connecting": return "bg-amber-500 text-amber-500";
      case "waiting_for_peer": return "bg-blue-500 text-blue-500 animate-pulse";
      case "disconnected": return "bg-red-500 text-red-500";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl space-y-6">
        
        {/* Header Display */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
              <Zap className="w-7 h-7 text-primary animate-pulse" />
              <span>Connectivity Suite</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Test your file-sharing speeds or establish instant, secure browser-to-browser WebRTC file streams.
            </p>
          </div>

          {/* Network Health Indicator */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/80 text-xs font-semibold ${
            isOnline ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 shrink-0" />
                <span>Web Connectivity: ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>Web Connectivity: OFFLINE</span>
              </>
            )}
          </div>
        </div>

        {/* Diagnostic Speed & Latency Meters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border border-border shadow-xs overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-sm">
                  <Activity className="w-4 h-4 text-primary" />
                  <span>API Server Latency</span>
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={runLatencyTest} 
                  disabled={isTestingLatency || !isOnline}
                  className="h-8 gap-1.5 font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingLatency ? "animate-spin" : ""}`} />
                  {isTestingLatency ? "Measuring..." : "Ping Server"}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 py-1">
                <div className="bg-secondary/40 border rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Round Trip Time (RTT)</p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {latency !== null ? `${latency} ms` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {latency !== null ? (latency < 100 ? "Excellent Ping" : "Average Connection") : "No diagnostics run"}
                  </p>
                </div>
                <div className="bg-secondary/40 border rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jitter Variance</p>
                  <p className="text-2xl font-black text-foreground mt-1">
                    {jitter !== null ? `${jitter} ms` : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {jitter !== null ? (jitter < 15 ? "Highly Stable" : "Slight Fluctuation") : "No diagnostics run"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-xs overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-sm">
                  <Zap className="w-4 h-4 text-primary" />
                  <span>Bandwidth Speedometer</span>
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={runSpeedTest} 
                  disabled={isTestingSpeed || !isOnline}
                  className="h-8 gap-1.5 font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingSpeed ? "animate-spin" : ""}`} />
                  {isTestingSpeed ? "Streaming..." : "Test Speed"}
                </Button>
              </div>

              {isTestingSpeed ? (
                <div className="space-y-2 py-3">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>Streaming synthetic test packet...</span>
                    <span>{speedProgress}%</span>
                  </div>
                  <Progress value={speedProgress} className="h-2" />
                </div>
              ) : (
                <div className="bg-secondary/40 border rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Downstream Rate</p>
                    <p className="text-2xl font-black text-foreground mt-1">
                      {downloadSpeed !== null ? `${downloadSpeed} Mbps` : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-primary">
                      {downloadSpeed !== null ? (downloadSpeed > 30 ? "Super-Fast Connection" : "Standard Speed") : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {downloadSpeed !== null ? "Ready for instant rooms" : "Click 'Test Speed' above"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Peer-to-Peer Zero-Storage Handshake Portal */}
        <Card className="border border-border shadow-md overflow-hidden">
          <div className="bg-primary/5 border-b px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-base flex items-center gap-1.5">
                <Link2 className="w-5 h-5 text-primary shrink-0" />
                <span>Zero-Storage Direct Peer Connect</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Directly stream files and clipboards from your device memory to another without routing to any server.
              </p>
            </div>

            {/* Connection Status Badge */}
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`} />
              <span className="text-xs font-bold capitalize">
                {p2pState === "waiting_for_peer" ? "Waiting for partner..." : p2pState.replace("_", " ")}
              </span>
              {p2pState !== "idle" && (
                <Button size="sm" variant="ghost" onClick={cleanupWebRTC} className="h-7 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-lg px-2">
                  <Unlink className="w-3.5 h-3.5 mr-1" />Disconnect
                </Button>
              )}
            </div>
          </div>

          <CardContent className="p-5">
            {p2pState === "idle" ? (
              <Tabs defaultValue="share" className="w-full">
                <TabsList className="grid grid-cols-2 sm:grid-cols-4 mb-4 max-w-2xl gap-1">
                  <TabsTrigger value="share" className="text-xs font-bold">1. 1-to-1 Portal</TabsTrigger>
                  <TabsTrigger value="join" className="text-xs font-bold">2. Join Portal</TabsTrigger>
                  <TabsTrigger value="bluetooth" className="text-xs font-bold">3. Bluetooth BLE</TabsTrigger>
                  <TabsTrigger value="mesh" className="text-xs font-bold">4. Multi-Device Room</TabsTrigger>
                </TabsList>

                <TabsContent value="share" className="space-y-4">
                  <div className="bg-secondary/30 rounded-xl p-4 border space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Spawns a direct peer-to-peer sharing session. Keep this tab open while you share the pairing key.
                    </p>
                    <Button onClick={startInitiatorFlow} className="w-full font-bold">
                      Generate Pairing Portal Code
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="join" className="space-y-4">
                  <div className="bg-secondary/30 rounded-xl p-4 border space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Enter the 6-digit code generated on your partner's screen to build the direct channel.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter 6-digit peer code"
                        maxLength={6}
                        value={enteredCode}
                        onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, ""))}
                        className="font-mono text-center text-lg tracking-widest font-black"
                      />
                      <Button onClick={joinReceiverFlow} className="font-bold">
                        Link Peer Device
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="bluetooth" className="space-y-4">
                  <div className="bg-secondary/30 rounded-xl p-4 border space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Scan and connect with nearby Bluetooth devices directly using the secure browser Web Bluetooth API.
                    </p>
                    <Button 
                      onClick={handleBluetoothConnect} 
                      disabled={isBluetoothConnecting}
                      className="w-full font-bold gap-1.5"
                    >
                      <RefreshCw className={`w-4 h-4 ${isBluetoothConnecting ? "animate-spin" : ""}`} />
                      {isBluetoothConnecting ? "Scanning for Bluetooth Devices..." : "Scan & Link via Bluetooth"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="mesh" className="space-y-4">
                  <div className="bg-secondary/30 rounded-xl p-4 border space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Connect 2 or more devices on the same Wi-Fi into an automatic P2P Mesh Room. Supports zero-server RAM file streaming, live clipboard synchronization, and group flash chat!
                    </p>
                    <a href="/rooms" className="block">
                      <Button className="w-full font-bold gap-1.5 bg-primary text-primary-foreground">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>Launch Auto-Private Mesh Room</span>
                      </Button>
                    </a>
                  </div>
                </TabsContent>
              </Tabs>
            ) : p2pState === "waiting_for_peer" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                <div className="space-y-4 flex flex-col justify-center">
                  <div>
                    <h3 className="font-black text-lg text-foreground">Waiting for peer connection...</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Share this pairing code with your partner device. Once they enter this code on their FileIt connectivity screen, the browsers will negotiate a direct channel.
                    </p>
                  </div>

                  <div className="bg-secondary/50 border border-dashed rounded-2xl p-5 text-center">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pairing Code</p>
                    <p className="text-4xl font-black text-primary tracking-widest font-mono select-all mt-2">
                      {sessionCode}
                    </p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => {
                        navigator.clipboard.writeText(sessionCode);
                        toast({ title: "Code copied" });
                      }}
                      className="mt-3 font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copy Key
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center bg-secondary/20 border rounded-2xl p-4">
                  <QRCodeSVG 
                    value={`${window.location.origin}/qr?code=${sessionCode}`} 
                    size={160} 
                    className="p-1.5 bg-white border rounded-xl shadow-xs" 
                  />
                  <p className="text-xs text-muted-foreground font-semibold mt-3 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-primary" />
                    <span>Scan to pair automatically</span>
                  </p>
                </div>
              </div>
            ) : p2pState === "connected" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                
                {/* Peer Transfers (Left) */}
                <div className="space-y-4">
                  {/* Sync Clipboard */}
                  <div className="bg-secondary/30 border rounded-2xl p-4 space-y-3">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Copy className="w-4 h-4 text-primary" />
                      <span>Sync Clipboard Directly</span>
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type text to send to peer clipboard..."
                        value={clipboardText}
                        onChange={(e) => setClipboardText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendClipboardSync()}
                        className="text-xs"
                      />
                      <Button size="sm" onClick={sendClipboardSync} className="font-bold gap-1">
                        <Send className="w-3.5 h-3.5" /> Sync
                      </Button>
                    </div>
                  </div>

                  {/* Direct File Transfer */}
                  <div className="bg-secondary/30 border rounded-2xl p-4 space-y-3">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <FileUp className="w-4 h-4 text-primary" />
                      <span>Stream File Directly</span>
                    </h3>
                    
                    <div className="border border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center bg-background/50 hover:bg-background/80 transition-colors">
                      <Input
                        id="p2p-file-input"
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setDirectFile(file);
                        }}
                      />
                      <label htmlFor="p2p-file-input" className="cursor-pointer space-y-2 w-full h-full block py-2">
                        {directFile ? (
                          <div className="text-xs font-semibold">
                            <span className="text-primary truncate block max-w-xs mx-auto font-bold">{directFile.name}</span>
                            <span className="text-muted-foreground text-[10px] block mt-0.5">({Math.round(directFile.size / 1024)} KB)</span>
                          </div>
                        ) : (
                          <>
                            <FileUp className="w-6 h-6 text-muted-foreground mx-auto" />
                            <p className="text-xs font-bold text-muted-foreground">Select any file (APK, ZIP, TAR, media, etc.)</p>
                          </>
                        )}
                      </label>
                    </div>

                    {directFile && (
                      <Button 
                        size="sm" 
                        onClick={sendDirectFile} 
                        disabled={isTransferring}
                        className="w-full font-bold"
                      >
                        {isTransferring ? `Streaming ${transferProgress}%` : "Stream Instantly"}
                      </Button>
                    )}

                    {isTransferring && (
                      <div className="space-y-1">
                        <Progress value={transferProgress} className="h-1.5" />
                        <p className="text-[10px] text-center text-muted-foreground font-semibold">Streaming binary byte buffers directly...</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Feed History (Right) */}
                <div className="space-y-3 flex flex-col">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Incoming Direct Feed</h3>
                  
                  <div className="bg-secondary/10 border border-border/80 rounded-2xl p-4 flex-1 min-h-[220px] max-h-[300px] overflow-y-auto space-y-2.5">
                    {receivedItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-2 py-8">
                        <Zap className="w-5 h-5 text-muted-foreground/50" />
                        <p className="text-xs font-semibold">Awaiting peer transmissions...</p>
                      </div>
                    ) : (
                      receivedItems.map((item) => (
                        <div key={item.id} className="bg-background border rounded-xl p-3 flex items-center justify-between shadow-xs transition-all">
                          <div className="space-y-1 truncate max-w-[70%]">
                            <div className="flex items-center gap-1.5">
                              {item.type === "text" ? (
                                <FileText className="w-3.5 h-3.5 text-primary" />
                              ) : (
                                <Download className="w-3.5 h-3.5 text-emerald-500" />
                              )}
                              <span className="text-xs font-bold truncate block">
                                {item.type === "text" ? item.text : item.name}
                              </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground font-medium">Received at {item.timestamp}</p>
                          </div>

                          <div>
                            {item.type === "text" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  navigator.clipboard.writeText(item.text || "");
                                  toast({ title: "Copied to clipboard" });
                                }}
                                className="h-7 font-bold px-2.5 rounded-lg text-[10px]"
                              >
                                Copy
                              </Button>
                            ) : (
                              <a href={item.blobUrl} download={item.name} className="inline-flex">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 font-bold px-2.5 rounded-lg text-emerald-600 border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/15 text-[10px]"
                                >
                                  Download
                                </Button>
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-6 space-y-2">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm font-semibold text-muted-foreground">Pairing session ended or offline.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Diagnostics Log Output */}
        <Card className="border border-border/80 shadow-xs overflow-hidden">
          <div className="bg-secondary/40 border-b px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Real-Time Diagnostic Console Logs</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setLogs([])} className="h-6 text-[10px] text-muted-foreground hover:text-foreground">
              Clear Console
            </Button>
          </div>
          <CardContent className="p-3 bg-neutral-950 font-mono text-[10px] text-zinc-300 leading-relaxed max-h-[140px] overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-zinc-500 italic">Console idle. Awaiting operations...</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className="truncate">{log}</p>
              ))
            )}
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
}
