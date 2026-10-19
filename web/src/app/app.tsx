import { Outlet, useLocation, useNavigation } from 'react-router-dom';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/components/ui/sidebar';
import { Separator } from '@/shared/components/ui/separator';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import Navigation from './navigation';

const sectionTitles: Record<string, string> = {
  download: 'Download',
  browse: 'Library',
  repair: 'Repair',
  settings: 'Settings',
  stats: 'Statistics',
};
export default function App() {
  const navigation = useNavigation();
  const { pathname } = useLocation();
  const sectionTitle = sectionTitles[pathname.split('/')[1] ?? ''] ?? 'Dashboard';
  return (
    <TooltipProvider>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:bg-background focus:p-3"
        >
          Skip to content
        </a>
        <Navigation />
        <SidebarInset className="min-w-0">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4 md:px-5">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-muted-foreground">Workspace</span>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">{sectionTitle}</span>
          </header>
          <div
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full min-w-0 max-w-[100rem] flex-1 p-3 md:p-5"
            aria-busy={navigation.state !== 'idle'}
          >
            <Outlet />
          </div>
          <footer className="flex flex-wrap gap-4 border-t px-4 py-5 text-xs text-muted-foreground md:px-8">
            <span className="mr-auto">Decypharr · Media workspace</span>
            <a href="https://github.com/sirrobot01/decypharr">GitHub</a>
            <a href="https://docs.decypharr.com/">Documentation</a>
            <a href="https://sponsor.decypharr.com">Sponsor</a>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
