import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Download,
  FolderOpen,
  LayoutDashboard,
  Moon,
  Settings2,
  Sun,
  Wrench,
  FileText,
} from 'lucide-react';
import { savePreference } from '@/shared/browser/preferences';
import { appUrl } from '@/shared/api/client';
import { Button } from '@/shared/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/shared/components/ui/sidebar';
import VersionBadge from './components/version-badge';

const links = [
  { path: '/', title: 'Dashboard', icon: LayoutDashboard },
  { path: '/download', title: 'Download', icon: Download },
  { path: '/browse', title: 'Browse', icon: FolderOpen },
  { path: '/repair', title: 'Repair', icon: Wrench },
  { path: '/stats', title: 'Statistics', icon: BarChart3 },
  { path: '/settings', title: 'Settings', icon: Settings2 },
];
export default function Navigation() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark');
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  function toggleTheme(): void {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    savePreference('theme', nextTheme);
    setTheme(nextTheme);
  }
  return (
    <Sidebar>
      <SidebarHeader className="gap-4 p-5">
        <Link
          className="flex items-center gap-3 font-semibold tracking-tight"
          to="/"
          onClick={() => setOpenMobile(false)}
        >
          <img src={appUrl('images/logo.png')} alt="" className="size-9" />
          <span className="text-xl">Decypharr</span>
        </Link>
        <p className="text-xs text-muted-foreground">Your media, connected.</p>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <nav aria-label="Main navigation">
            <SidebarMenu>
              {links.map(({ path, title, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    asChild
                    isActive={path === '/' ? pathname === path : pathname.startsWith(path)}
                    size="lg"
                  >
                    <NavLink to={path} end={path === '/'} onClick={() => setOpenMobile(false)}>
                      <Icon />
                      <span>{title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href={appUrl('debug/logs')} target="_blank" rel="noreferrer">
                <FileText />
                <span>Logs</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button variant="outline" onClick={() => toggleTheme()}>
          {theme === 'dark' ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </Button>
        <div className="flex justify-between items-center gap-2 text-xs text-muted-foreground">
          <span>Decypharr</span>
          <VersionBadge />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
