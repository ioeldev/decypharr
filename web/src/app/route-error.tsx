import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { appUrl } from '../shared/api/client';

export default function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'Unable to load this page. Check the connection and try again.';
  return <main className="p-8 space-y-4"><h1 className="text-2xl">Page unavailable</h1><p role="alert">{message}</p><a className="btn" href={appUrl('')}>Go to Dashboard</a><button className="btn" onClick={() => window.location.reload()}>Retry</button></main>;
}
