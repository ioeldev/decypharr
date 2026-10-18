import { redirect } from 'react-router-dom';
import { requestJson } from '../shared/api/client';
import { sessionSchema } from '../domains/auth/auth.api';

export async function loadSession({ request }: { request: Request }) {
  const session = sessionSchema.parse(await requestJson('api/ui', { signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) }));
  const prefix = new URL(document.baseURI).pathname.replace(/\/$/, '');
  const path = new URL(request.url).pathname.slice(prefix.length).replace(/\/$/, '') || '/';
  if (session.setup_required && path !== '/setup') return redirect('/setup');
  if (!session.setup_required && path === '/setup') return redirect('/');
  if (session.setup_required) return session;
  if (session.needs_registration && path !== '/register') return redirect('/register');
  if (session.needs_registration) return session;
  if (!session.needs_registration && path === '/register') return redirect('/');
  if (!session.authenticated && path !== '/login') return redirect('/login');

  if (session.authenticated && path === '/login') return redirect('/');

  return session;
}
