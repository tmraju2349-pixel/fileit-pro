import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { HardDrive, MessageSquareCode, ShieldCheck, ScanLine, Zap } from "lucide-react";
import { FileitLogo } from "@/components/brand/FileitLogo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getActiveRoom, subscribeToActiveRoom, type StoredRoom } from "@/lib/rooms-storage";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [activeRoom, setActiveRoom] = useState<StoredRoom | null>(() => getActiveRoom());

  useEffect(() => {
    setActiveRoom(getActiveRoom());
    return subscribeToActiveRoom(() => {
      setActiveRoom(getActiveRoom());
    });
  }, []);

  const isFilesActive = location === "/" || location === "/files";
  const isTextActive = location === "/text";
  const isRoomsActive = location.startsWith("/rooms");
  const isConnectivityActive = location === "/connectivity";
  const roomsHref = activeRoom ? `/rooms/${activeRoom.id}` : "/rooms";

  const roomLabel = activeRoom
    ? `Room: ${activeRoom.name.length > 10 ? activeRoom.name.slice(0, 9) + "…" : activeRoom.name}`
    : "Private Rooms";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-14 md:h-16 flex items-center justify-between max-w-7xl">
          <Link
            href="/"
            className="flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg transition-transform hover:opacity-95 shrink-0"
          >
            <FileitLogo size="md" showWordmark={true} />
          </Link>

          <nav className="flex items-center gap-1 sm:gap-1.5">
            <Link
              href="/files"
              className={`flex items-center gap-2 text-xs md:text-sm font-semibold transition-all px-3 py-1.5 md:py-2 rounded-xl ${
                isFilesActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>Files</span>
            </Link>

            <Link
              href="/text"
              className={`flex items-center gap-2 text-xs md:text-sm font-semibold transition-all px-3 py-1.5 md:py-2 rounded-xl ${
                isTextActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <MessageSquareCode className="w-4 h-4" />
              <span>Text & Code</span>
            </Link>

            <Link
              href={roomsHref}
              className={`flex items-center gap-2 text-xs md:text-sm font-semibold transition-all px-3 py-1.5 md:py-2 rounded-xl ${
                isRoomsActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title={activeRoom ? `Active Room: ${activeRoom.name}` : "Private Rooms"}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{roomLabel}</span>
              {activeRoom && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isRoomsActive ? "bg-primary-foreground" : "bg-emerald-500"
                  }`}
                />
              )}
            </Link>

            <Link
              href="/connectivity"
              className={`flex items-center gap-2 text-xs md:text-sm font-semibold transition-all px-3 py-1.5 md:py-2 rounded-xl ${
                isConnectivityActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Connectivity</span>
            </Link>

            <Link
              href="/qr"
              className="flex items-center gap-1 text-xs md:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-2 rounded-xl hover:bg-secondary md:hidden"
              title="QR Scanner"
            >
              <ScanLine className="w-4 h-4" />
            </Link>

            <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

            <ThemeToggle className="ml-1 sm:ml-1.5" />
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full flex flex-col">{children}</main>
    </div>
  );
}
