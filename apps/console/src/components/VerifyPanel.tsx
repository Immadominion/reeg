import { useState } from 'react';
import { useVerification } from '../hooks/useEnvironment';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';
import { VerifiedBadge, type VerifyState } from './ui/VerifiedBadge';

/**
 * The reassurance feature, made simple. Clicking Verify independently re-checks the whole
 * history against public records and shows a calm pass or a clear fail. It works with the Reeg
 * backend offline; the user never has to know that, only that "Verified" feels earned. The
 * proof itself lives behind a quiet "How we check" disclosure.
 */
export function VerifyPanel({ id }: { id: string }) {
  const { data: report, isFetching, isError, refetch } = useVerification(id);
  const [showDetails, setShowDetails] = useState(false);

  const state: VerifyState = isFetching
    ? 'checking'
    : report
      ? report.ok
        ? 'verified'
        : 'failed'
      : isError
        ? 'failed'
        : 'unverified';

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <VerifiedBadge state={state} />
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Checking…' : 'Verify independently'}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">{message(state)}</p>

        {report && (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {showDetails ? 'Hide details' : 'How we check'}
          </button>
        )}

        {report && showDetails && (
          <ul className="space-y-1 rounded-lg bg-muted p-3 font-mono text-xs">
            {report.checks.map((check) => (
              <li key={check.name} className="flex gap-2">
                <span className={check.passed ? 'text-verified' : 'text-destructive'}>
                  {check.passed ? 'ok' : 'fail'}
                </span>
                <span className="text-muted-foreground">
                  {check.name} — {check.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function message(state: VerifyState): string {
  switch (state) {
    case 'verified':
      return 'Verified independently. Nothing here was changed after the fact.';
    case 'failed':
      return 'This history could not be verified. Something does not match the record.';
    case 'checking':
      return 'Checking the full history against public records.';
    case 'unverified':
      return 'Check this history yourself. No Reeg server is needed.';
  }
}
