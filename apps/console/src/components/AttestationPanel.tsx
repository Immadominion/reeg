import { toHex } from '@reeg/verify';
import { AlertTriangle, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { useAttestation } from '../hooks/useEnvironment';
import { Card, CardBody } from './ui/Card';
import { Skeleton } from './ui/Skeleton';

/**
 * The optional proof-of-code tier (Nautilus). When an environment's snapshots were produced under
 * a measured secure enclave, this confirms — offline, from on-chain signatures and the enclave's
 * pinned measurements — exactly which code ran. Strictly additive: an environment without
 * attestation shows a calm explainer, never a failure.
 */
export function AttestationPanel({ id }: { id: string }) {
  const { data: report, isLoading } = useAttestation(id);
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-full" />
        </CardBody>
      </Card>
    );
  }
  if (!report) {
    return null;
  }

  if (!report.attested) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldQuestion className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold tracking-tight">Proof of code</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            No hardware attestation on this environment. Attestation is optional — when enabled, a
            measured secure enclave signs each snapshot, so you can prove which code produced it.
          </p>
        </CardBody>
      </Card>
    );
  }

  const failed = report.checks.find((check) => !check.passed);
  const enclaveKey = report.records[0]?.enclavePubkey;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className={report.ok ? 'h-4 w-4 text-verified' : 'h-4 w-4 text-warning'}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold tracking-tight">
            {report.ok ? 'Code attested' : 'Attested, with a caveat'}
          </h2>
        </div>

        <p className="text-sm text-muted-foreground">
          {report.ok
            ? 'A measured secure enclave signed this environment’s snapshots. You can prove exactly which code ran — verified offline.'
            : 'An attestation is present but did not fully verify. See the details below.'}
        </p>

        <div className="text-xs text-muted-foreground">
          {report.records.length} attested snapshot{report.records.length === 1 ? '' : 's'}
          {enclaveKey ? (
            <>
              {' · '}
              <span className="tnum font-mono">enclave {toHex(enclaveKey).slice(0, 10)}…</span>
            </>
          ) : null}
        </div>

        {failed ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>{failed.detail ?? failed.name}</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {open ? 'Hide checks' : 'How we check'}
        </button>

        {open ? (
          <ul className="space-y-1 rounded-lg bg-muted p-3 font-mono text-xs">
            {report.checks.map((check) => (
              <li key={check.name} className="flex gap-2">
                <span className={check.passed ? 'text-verified' : 'text-warning'}>
                  {check.passed ? 'ok' : 'warn'}
                </span>
                <span className="text-muted-foreground">
                  {check.name}
                  {check.detail ? ` — ${check.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
