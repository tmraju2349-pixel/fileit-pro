import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import FilesPage from "@/pages/files";
import TextStudioPage from "@/pages/text-studio";
import RoomsHubPage from "@/pages/rooms-hub";
import RoomViewPage from "@/pages/room-view";
import SharePage from "@/pages/share";
import ViewPage from "@/pages/view";
import QRScanPage from "@/pages/qr-scan";
import FolderSharePage from "@/pages/folder-share";
import ConnectivityPage from "@/pages/connectivity";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/files" component={FilesPage} />
      <Route path="/text" component={TextStudioPage} />
      <Route path="/rooms" component={RoomsHubPage} />
      <Route path="/rooms/:id" component={RoomViewPage} />
      <Route path="/share/:token" component={SharePage} />
      <Route path="/folder-share/:token" component={FolderSharePage} />
      <Route path="/view/:id" component={ViewPage} />
      <Route path="/qr" component={QRScanPage} />
      <Route path="/connectivity" component={ConnectivityPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
