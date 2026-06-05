import type { ReactNode } from 'react';
import { Card, CardBody } from './ui/Card';

/** Warm, instructive empty state. Most of the first impression, so treated as a feature. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        {action}
      </CardBody>
    </Card>
  );
}

/** Calm, plain-language error with a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-accent hover:underline"
          >
            Try again
          </button>
        )}
      </CardBody>
    </Card>
  );
}

/** Shown when the Console has no package configured (a deploy-time setting). */
export function NotConfigured() {
  return (
    <Card>
      <CardBody className="space-y-2 py-10 text-center">
        <h2 className="text-lg font-semibold text-foreground">Not configured yet</h2>
        <p className="text-sm text-muted-foreground">
          Set the environment package for this Console build to start opening and verifying
          environments.
        </p>
      </CardBody>
    </Card>
  );
}
