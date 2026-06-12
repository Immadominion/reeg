import { exportEvidence } from '@reeg/verify';
import { Download, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useVerification } from '../hooks/useEnvironment';
import { CONFIG, NETWORK, readClient } from '../lib/config';
import { shortId } from '../lib/format';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';
import { VerifiedBadge, type VerifyState } from './ui/VerifiedBadge';

/**
 * The reassurance feature, made simple. Verify independently re-checks the whole history against
 * public records and shows a calm pass or a clear fail — with the Reeg backend offline; the user
 * never has to know that, only that "Verified" feels earned. Export evidence hands an auditor a
 * portable record they can verify on their own, with no Reeg and no chain.
 */
export function VerifyPanel({ id }: { id: string }) {
  const { data: report, isFetching, isError, refetch } = useVerification(id);
  const [showDetails, setShowDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const state: VerifyState = isFetching
    ? 'checking'
    : report
      ? report.ok
        ? 'verified'
        : 'failed'
      : isError
        ? 'failed'
        : 'unverified';

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const evidence = await exportEvidence(readClient, CONFIG.packageId, id, {
        network: NETWORK,
        exportedAtMs: Date.now(),
      });
      downloadJson(`reeg-evidence-${shortId(id)}.json`, evidence);
    } catch {
      setExportError('Could not export evidence right now. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="shadow-panel">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold tracking-tight">Proof</h2>
          </div>
          <VerifiedBadge state={state} />
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{message(state)}</p>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Checking…' : 'Verify independently'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export evidence'}
          </Button>
        </div>

        {exportError ? <p className="text-xs text-destructive">{exportError}</p> : null}

        {report ? (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {showDetails ? 'Hide details' : 'How we check'}
          </button>
        ) : null}

        {report && showDetails ? (
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
        ) : null}
      </CardBody>
    </Card>
  );
}

/** Trigger a client-side download of a JSON object (the auditor evidence record). */
function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
      return 'Check this history yourself, or export a record an auditor can verify. No Reeg server is needed.';
  }
}
