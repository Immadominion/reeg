import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { friendlyName } from '../lib/format';
import { SharePanel } from './SharePanel';

const OWNER = `0x${'1'.repeat(64)}`;
const BOB = `0x${'2'.repeat(64)}`;
const NEW = `0x${'3'.repeat(64)}`;
const NOW = 1_700_000_000_000;

function ownerGrant() {
  return { grantee: OWNER, rights: 3, expiryMs: 0n };
}

describe('SharePanel', () => {
  it('shows people by name and role, never as a raw address in the text', () => {
    render(
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={[ownerGrant(), { grantee: BOB, rights: 3, expiryMs: 0n }]}
        nowMs={NOW}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );
    expect(screen.getByText(friendlyName(BOB))).toBeInTheDocument();
    // The role + expiry line for the person (the same words also appear in the add-form select,
    // so match the combined row text specifically).
    expect(screen.getByText(/Can restore · No expiry/)).toBeInTheDocument();
    // The raw address is not rendered as visible text (only as a hover title).
    expect(screen.queryByText(BOB)).not.toBeInTheDocument();
  });

  it('lets the owner add a person, passing the resolved address and role', async () => {
    const onGrant = vi.fn();
    render(
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={[ownerGrant()]}
        nowMs={NOW}
        onGrant={onGrant}
        onRevoke={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText(/add a person/i), NEW);
    await userEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(onGrant).toHaveBeenCalledWith(NEW, { role: 'restore', expiryMs: 0n });
  });

  it('rejects a malformed address without calling onGrant', async () => {
    const onGrant = vi.fn();
    render(
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={[ownerGrant()]}
        nowMs={NOW}
        onGrant={onGrant}
        onRevoke={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText(/add a person/i), 'not-an-address');
    await userEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(onGrant).not.toHaveBeenCalled();
    expect(screen.getByText(/full address/i)).toBeInTheDocument();
  });

  it('removes a person and is honest that revocation is forward-looking', async () => {
    const onRevoke = vi.fn();
    render(
      <SharePanel
        owner={OWNER}
        connectedAddress={OWNER}
        grants={[ownerGrant(), { grantee: BOB, rights: 1, expiryMs: 0n }]}
        nowMs={NOW}
        onGrant={vi.fn()}
        onRevoke={onRevoke}
      />,
    );
    expect(
      screen.getByText(/already opened this environment may keep access/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRevoke).toHaveBeenCalledWith(BOB);
  });

  it('hides the controls from a non-owner', () => {
    render(
      <SharePanel
        owner={OWNER}
        connectedAddress={BOB}
        grants={[ownerGrant(), { grantee: BOB, rights: 1, expiryMs: 0n }]}
        nowMs={NOW}
        onGrant={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Only the owner can change/i)).toBeInTheDocument();
  });
});
