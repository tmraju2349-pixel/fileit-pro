import React, { useState } from "react";
import { useDynamicBubble } from "@/components/dynamic-bubble-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Archive,
  Columns,
  X,
  Maximize2,
  Upload,
  Sparkles,
  Layers,
  Clock,
  Minimize2,
  FileCode,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export function DynamicBubbleBar() {
  const {
    minimizedFiles,
    restoreFile,
    removeMinimizedFile,
    setSplitScreenFile,
    activePreviewFile,
    setActivePreviewFile,
    recentFiles,
    addMinimizedFile,
  } = useDynamicBubble();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      const file = droppedFiles[0];
      const newFile = {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        type: file.name.endsWith(".pdf")
          ? ("pdf" as const)
          : file.name.match(/\.(docx|doc)$/)
          ? ("docx" as const)
          : file.name.match(/\.(xlsx|xls|csv)$/)
          ? ("xlsx" as const)
          : file.name.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)
          ? ("image" as const)
          : ("text" as const),
        url: URL.createObjectURL(file),
        size: file.size,
      };
      setActivePreviewFile(newFile);
      setIsExpanded(true);
      toast({
        title: "Dynamic Island: File Staged",
        description: `Loaded ${file.name} for instant multitasking view.`,
      });
    }
  };

  const handleOpenFile = (file: { id: string; name: string; url?: string; size?: number; type?: string }) => {
    setActivePreviewFile(file as any);
    setIsExpanded(false);
    if (file.id && !file.id.includes("_") && !file.id.startsWith("blob")) {
      setLocation(`/view/${file.id}`);
    }
  };

  const getFileIcon = (type?: string, name?: string) => {
    const lowerName = (name || "").toLowerCase();
    if (type === "pdf" || lowerName.endsWith(".pdf")) return <FileText className="w-4 h-4 text-red-400" />;
    if (type === "xlsx" || lowerName.match(/\.(xlsx|xls|csv)$/)) return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    if (type === "image" || lowerName.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return <ImageIcon className="w-4 h-4 text-sky-400" />;
    if (type === "archive" || lowerName.match(/\.(zip|tar|gz|7z|rar)$/)) return <Archive className="w-4 h-4 text-amber-400" />;
    if (
      type === "text" ||
      lowerName.match(/\.(txt|text|log|md|js|ts|py|html|css|json|sql|sh|c|cpp|rs|go|java|yaml|yml|env)$/)
    ) {
      return <FileCode className="w-4 h-4 text-cyan-400" />;
    }
    return <FileText className="w-4 h-4 text-indigo-400" />;
  };

  const totalItemsCount = minimizedFiles.length + recentFiles.length;

  return (
    <div className="fixed top-3 right-4 sm:right-6 z-[100000] pointer-events-none flex flex-col items-end">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* Apple Dynamic Island Floating Pill */
          <motion.div
            key="ball"
            drag
            dragConstraints={{ left: -600, right: 0, top: 0, bottom: 600 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsExpanded(true)}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              handleDrop(e);
              setIsExpanded(true);
            }}
            className={`pointer-events-auto cursor-pointer flex items-center gap-2.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full shadow-2xl border backdrop-blur-2xl transition-all select-none ${
              isDragOver
                ? "bg-primary text-primary-foreground border-white/60 scale-110 shadow-primary/50"
                : activePreviewFile
                ? "bg-black/95 dark:bg-zinc-950/95 text-white border-white/30 shadow-black/80 ring-1 ring-primary/40"
                : totalItemsCount > 0
                ? "bg-black/90 dark:bg-zinc-950/90 text-white border-white/20 shadow-black/60"
                : "bg-black/85 dark:bg-zinc-900/85 text-zinc-100 border-white/15 shadow-black/40 hover:border-white/30"
            }`}
          >
            {/* Left Badge / Icon */}
            <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-inner shrink-0">
              {activePreviewFile ? (
                getFileIcon(activePreviewFile.type, activePreviewFile.name)
              ) : (
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              )}
              {totalItemsCount > 0 && !activePreviewFile && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                  {totalItemsCount}
                </span>
              )}
            </div>

            {/* Label Content */}
            <div className="flex flex-col text-left max-w-[130px] sm:max-w-[180px]">
              {activePreviewFile ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold tracking-tight text-white truncate">
                      {activePreviewFile.name}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono tracking-wide">
                    Live Preview Active
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold tracking-tight">Dynamic Island</span>
                  <span className="text-[10px] text-zinc-400 truncate">
                    {totalItemsCount > 0 ? `${totalItemsCount} files stashed` : "Multitasking tray"}
                  </span>
                </>
              )}
            </div>

            {/* Action buttons directly on Active File pill */}
            {activePreviewFile ? (
              <div className="flex items-center gap-1 pl-1 border-l border-white/15" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    addMinimizedFile(activePreviewFile);
                    setActivePreviewFile(null);
                    toast({ title: "Minimized to Island", description: `${activePreviewFile.name} stashed.` });
                  }}
                  className="h-6 w-6 rounded-full text-zinc-400 hover:text-amber-400 hover:bg-white/10"
                  title="Minimize File"
                >
                  <Minimize2 className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setSplitScreenFile(activePreviewFile);
                    toast({ title: "Split-Screen Ready", description: `${activePreviewFile.name} staged for split view.` });
                  }}
                  className="h-6 w-6 rounded-full text-zinc-400 hover:text-purple-400 hover:bg-white/10"
                  title="Open in Split Screen"
                >
                  <Columns className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsExpanded(true)}
                  className="h-6 w-6 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
                  title="Expand Island Drawer"
                >
                  <Layers className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-1 items-center ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
            )}
          </motion.div>
        ) : (
          /* Expanded Apple Dynamic Island Multitasking Drawer */
          <motion.div
            key="drawer"
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className="pointer-events-auto bg-black/95 dark:bg-zinc-950/98 text-white border border-white/20 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl w-[360px] sm:w-[420px] max-w-[95vw] space-y-3"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-inner">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wide">Dynamic Island Multitasker</h3>
                  <p className="text-[10px] text-zinc-400">Switch & multitask across documents anywhere</p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsExpanded(false)}
                className="h-7 w-7 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Currently Active File Notice */}
            {activePreviewFile && (
              <div className="p-2.5 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-primary uppercase font-bold block">Active Preview</span>
                    <span className="text-xs font-bold text-white truncate block">{activePreviewFile.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      addMinimizedFile(activePreviewFile);
                      setActivePreviewFile(null);
                    }}
                    className="h-7 px-2 text-[10px] text-zinc-300 hover:text-white hover:bg-white/15 rounded-lg"
                  >
                    Minimize
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSplitScreenFile(activePreviewFile)}
                    className="h-7 px-2 text-[10px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/15 rounded-lg"
                  >
                    Split
                  </Button>
                </div>
              </div>
            )}

            {/* Drag & Drop Staging Zone */}
            <div
              className={`p-3 rounded-2xl border border-dashed transition-all text-center ${
                isDragOver
                  ? "bg-primary/20 border-primary text-white"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10"
              }`}
            >
              <Upload className="w-4 h-4 mx-auto mb-1 text-primary animate-bounce" />
              <p className="text-xs font-medium">Drop files here for instant multitasking preview</p>
            </div>

            {/* Minimized Files Section */}
            {minimizedFiles.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <Minimize2 className="w-3 h-3" /> Minimized In Bubble ({minimizedFiles.length})
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {minimizedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 px-3 py-2 rounded-2xl transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(file.type, file.name)}
                        <span className="text-xs font-semibold text-zinc-200 truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenFile(file)}
                          className="h-7 w-7 rounded-xl text-zinc-400 hover:text-white hover:bg-white/20"
                          title="Restore and View"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSplitScreenFile(file)}
                          className="h-7 w-7 rounded-xl text-zinc-400 hover:text-purple-400 hover:bg-white/20"
                          title="Split Screen"
                        >
                          <Columns className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeMinimizedFile(file.id)}
                          className="h-7 w-7 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-red-500/20"
                          title="Close"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recently Opened Files Section */}
            {recentFiles.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Recently Opened Files ({recentFiles.length})
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {recentFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => handleOpenFile(file)}
                      className="flex items-center justify-between bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 px-3 py-2 rounded-2xl cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(file.type, file.name)}
                        <span className="text-xs font-semibold text-zinc-300 group-hover:text-white truncate">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-zinc-400 bg-white/10 px-2 py-0.5 rounded-full">
                          Open
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalItemsCount === 0 && !activePreviewFile && (
              <div className="py-4 text-center text-xs text-zinc-400 italic">
                No minimized or recent files yet. Open any file or drop it here to start multitasking!
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
