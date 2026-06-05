import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerifiedBadge } from './VerifiedBadge';

describe('VerifiedBadge', () => {
  it('reads as Verified when verified', () => {
    render(<VerifiedBadge state="verified" />);
    expect(screen.getByRole('status')).toHaveTextContent('Verified');
  });

  it('reads as Not verified on failure', () => {
    render(<VerifiedBadge state="failed" />);
    expect(screen.getByRole('status')).toHaveTextContent('Not verified');
  });

  it('shows a checking and an unchecked state', () => {
    const { rerender } = render(<VerifiedBadge state="checking" />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    rerender(<VerifiedBadge state="unverified" />);
    expect(screen.getByRole('status')).toHaveTextContent('Not checked');
  });
});
