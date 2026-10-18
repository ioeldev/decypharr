import { savePreference } from '../shared/browser/preferences';
import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { appUrl } from '../shared/api/client';
import VersionBadge from './components/version-badge';

const links = [
  { path: '/', title: 'Dashboard' },
  { path: 'download', title: 'Download' },
  { path: 'browse', title: 'Browse' },
  { path: 'repair', title: 'Repair' },
  { path: 'settings', title: 'Settings' },
  { path: 'stats', title: 'Statistics' },
];

export default function Navigation() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark');

  function toggleTheme(): void {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    savePreference('theme', nextTheme);
    setTheme(nextTheme);
  }

  return (
    <header className="navbar bg-base-100 shadow-lg px-4 gap-6">
      <Link className="text-xl font-bold text-primary flex gap-2 items-center" to="/">
        <img src={appUrl('images/logo.png')} alt="" className="w-8 h-8" />Decypharr
      </Link>
      <nav aria-label="Main navigation" className="flex-1">
        <ul className="menu menu-horizontal">
          {links.map((link) => <li key={link.path}><NavLink to={link.path === '/' ? '/' : `/${link.path}`} end={link.path === '/'}>{link.title}</NavLink></li>)}
        </ul>
      </nav>
      <a className="link" href={appUrl('debug/logs')} target="_blank" rel="noreferrer">Logs</a>
      <VersionBadge />
      <button className="btn btn-ghost" onClick={() => toggleTheme()}>
        {theme === 'dark' ? 'Light theme' : 'Dark theme'}
      </button>
    </header>
  );
}
