import { verifyFromChain } from '@reeg/verify';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyPanel } from './VerifyPanel';

// Mock only the network call; the panel + hook + react-query wiring are exercised for real.
vi.mock('@reeg/verify', async (importActual) => ({
  ...(await importActual<typeof import('@reeg/verify')>()),
  verifyFromChain: vi.fn(),
}));

const mockedVerify = vi.mocked(verifyFromChain);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockedVerify.mockReset();
});

describe('VerifyPanel', () => {
  it('starts unchecked and invites the user to verify', () => {
    render(<VerifyPanel id="0xabc" />, { wrapper });
    expect(screen.getByRole('status')).toHaveTextContent('Not checked');
    expect(screen.getByText(/No Reeg server is needed/i)).toBeInTheDocument();
  });

  it('shows a calm success when verification passes', async () => {
    mockedVerify.mockResolvedValue({
      ok: true,
      checks: [{ name: 'provenance-head', passed: true, detail: 'matches' }],
    });
    render(<VerifyPanel id="0xabc" />, { wrapper });

    await userEvent.click(screen.getByRole('button', { name: /verify independently/i }));

    expect(await screen.findByText(/Nothing here was changed after the fact/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Verified');
  });

  it('shows a clear failure when a check does not pass', async () => {
    mockedVerify.mockResolvedValue({
      ok: false,
      checks: [{ name: 'provenance-head', passed: false, detail: 'mismatch' }],
    });
    render(<VerifyPanel id="0xabc" />, { wrapper });

    await userEvent.click(screen.getByRole('button', { name: /verify independently/i }));

    expect(await screen.findByText(/could not be verified/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not verified');
  });

  it('reveals the underlying checks behind a disclosure', async () => {
    mockedVerify.mockResolvedValue({
      ok: true,
      checks: [{ name: 'provenance-head', passed: true, detail: 'replayed matches on-chain' }],
    });
    render(<VerifyPanel id="0xabc" />, { wrapper });
    await userEvent.click(screen.getByRole('button', { name: /verify independently/i }));
    await screen.findByText(/Nothing here was changed/i);

    await userEvent.click(screen.getByRole('button', { name: /how we check/i }));
    expect(screen.getByText(/replayed matches on-chain/i)).toBeInTheDocument();
  });
});
