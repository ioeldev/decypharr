import { Button } from '@/shared/components/ui/button';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { appUrl } from '../shared/api/client';

export default function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Unable to load this page. Check the connection and try again.';
  return (
    <main className="p-8 flex flex-col gap-4">
      <h1 className="text-2xl">Page unavailable</h1>
      <p role="alert">{message}</p>
      <Button asChild variant="secondary">
        <a href={appUrl('')}>Go to Dashboard</a>
      </Button>
      <Button onClick={() => window.location.reload()} variant="secondary">
        Retry
      </Button>
    </main>
  );
}
