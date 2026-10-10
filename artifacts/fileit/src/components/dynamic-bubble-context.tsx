import React, { createContext, useContext, useState, useEffect } from "react";
import { RecentFilesService } from "@/lib/recent-files-service";

export interface MinimizedFile {
  id: string;
  name: string;
  type: "pdf" | "docx" | "xlsx" | "image" | "text" | "archive" | "other";
  url?: string;
  size?: number;
}

interface DynamicBubbleContextType {
  minimizedFiles: MinimizedFile[];
  addMinimizedFile: (file: MinimizedFile) => void;
  removeMinimizedFile: (id: string) => void;
  restoreFile: (id: string) => void;
  splitScreenFile: MinimizedFile | null;
  setSplitScreenFile: (file: MinimizedFile | null) => void;
  activePreviewFile: MinimizedFile | null;
  setActivePreviewFile: (file: MinimizedFile | null) => void;
  recentFiles: MinimizedFile[];
  addRecentFile: (file: MinimizedFile) => void;
}

const DynamicBubbleContext = createContext<DynamicBubbleContextType | undefined>(undefined);

export function DynamicBubbleProvider({ children }: { children: React.ReactNode }) {
  const [minimizedFiles, setMinimizedFiles] = useState<MinimizedFile[]>([]);
  const [splitScreenFile, setSplitScreenFile] = useState<MinimizedFile | null>(null);
  const [activePreviewFile, setActivePreviewFile] = useState<MinimizedFile | null>(null);
  const [recentFiles, setRecentFiles] = useState<MinimizedFile[]>([]);

  useEffect(() => {
    const loaded = RecentFilesService.getRecentFiles();
    setRecentFiles(loaded);
  }, []);

  const addMinimizedFile = (file: MinimizedFile) => {
    setMinimizedFiles((prev) => {
      if (prev.some((f) => f.id === file.id)) return prev;
      return [...prev, file];
    });
    addRecentFile(file);
  };

  const addRecentFile = (file: MinimizedFile) => {
    const updated = RecentFilesService.saveRecentFile(file);
    setRecentFiles(updated);
  };

  const removeMinimizedFile = (id: string) => {
    setMinimizedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const restoreFile = (id: string) => {
    const found = minimizedFiles.find((f) => f.id === id) || recentFiles.find((f) => f.id === id);
    if (found) {
      setActivePreviewFile(found);
      removeMinimizedFile(id);
      addRecentFile(found);
    }
  };

  return (
    <DynamicBubbleContext.Provider
      value={{
        minimizedFiles,
        addMinimizedFile,
        removeMinimizedFile,
        restoreFile,
        splitScreenFile,
        setSplitScreenFile,
        activePreviewFile,
        setActivePreviewFile,
        recentFiles,
        addRecentFile,
      }}
    >
      {children}
    </DynamicBubbleContext.Provider>
  );
}



export function useDynamicBubble() {
  const context = useContext(DynamicBubbleContext);
  if (!context) {
    throw new Error("useDynamicBubble must be used within a DynamicBubbleProvider");
  }
  return context;
}
