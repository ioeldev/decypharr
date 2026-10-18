import { createBrowserRouter } from 'react-router-dom';
import { loadSession } from './session-loader';
import App from './app';
import Loading from './loading';
import RouteError from './route-error';

const basename = new URL(document.baseURI).pathname.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    HydrateFallback: Loading,
    loader: loadSession,
    shouldRevalidate: () => true,
    ErrorBoundary: RouteError,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('../domains/queues/pages/dashboard/dashboard.page')).default }) },
      { path: 'login', lazy: async () => ({ Component: (await import('../domains/auth/pages/login.page')).default }) },
      { path: 'register', lazy: async () => ({ Component: (await import('../domains/auth/pages/register.page')).default }) },
      { path: 'setup', lazy: async () => ({ Component: (await import('../domains/setup/pages/setup.page')).default }) },
      { path: 'download', lazy: async () => ({ Component: (await import('../domains/downloads/pages/download.page')).default }) },
      { path: 'browse', lazy: async () => ({ Component: (await import('../domains/library/pages/browse/browse.page')).default }) },
      { path: 'repair', lazy: async () => ({ Component: (await import('../domains/repair/pages/audit/audit.page')).default }) },
      { path: 'repair/library', lazy: async () => ({ Component: (await import('../domains/repair/pages/library/library.page')).default }) },
      { path: 'repair/reacquire', lazy: async () => ({ Component: (await import('../domains/repair/pages/recovery/recovery.page')).default }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('../domains/settings/pages/settings.page')).default }) },
      { path: 'stats', lazy: async () => ({ Component: (await import('../domains/statistics/pages/statistics.page')).default }) },
    ],
  },
], { basename });
