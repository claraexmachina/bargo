/**
 * NegotiationStatus: fail state must show only the fail message,
 * no price, condition text, or failureReason leak.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NegotiationStatus } from '../../components/NegotiationStatus';
import type { GetStatusResponse, Hex } from '@haggle/shared';

// Mock useAttestationBundle (used by AttestationViewer inside NegotiationStatus)
vi.mock('@/lib/api', () => ({
  useAttestationBundle: () => ({ data: undefined, isLoading: false, error: null }),
}));

function hex(s: string): Hex {
  return `0x${s}` as Hex;
}

const FAIL_STATUS: GetStatusResponse = {
  negotiationId: hex('deadbeef' + '00'.repeat(28)),
  state: 'fail',
  failureReason: 'conditions_incompatible',
  updatedAt: 1700000000,
};

const AGREEMENT_STATUS: GetStatusResponse = {
  negotiationId: hex('deadbeef' + '00'.repeat(28)),
  state: 'agreement',
  attestation: {
    dealId: hex('deadbeef' + '00'.repeat(28)),
    listingId: hex('11'.repeat(32)),
    offerId: hex('22'.repeat(32)),
    agreedPrice: (725_000n * 10n ** 18n).toString(),
    agreedConditions: {
      location: '강남역 8번출구',
      meetTimeIso: '2026-04-18T19:00:00+09:00',
      payment: 'cash',
    },
    modelId: 'qwen3-30b',
    completionId: 'chatcmpl-abc123',
    nonce: hex('aa'.repeat(32)),
    nearAiAttestationHash: hex('bb'.repeat(32)),
    attestationBundleUrl: '/attestation/0xdeadbeef',
    ts: 1700000000,
  },
  updatedAt: 1700000000,
};

describe('NegotiationStatus — fail state', () => {
  it('renders only the fail message, no price or condition detail', () => {
    render(<NegotiationStatus status={FAIL_STATUS} />);

    expect(screen.getByText(/협상 실패/)).toBeInTheDocument();

    // Must NOT reveal any price or condition text
    expect(screen.queryByText(/700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/750,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/강남/)).not.toBeInTheDocument();
    // Must NOT show failureReason verbatim
    expect(screen.queryByText(/conditions_incompatible/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no_price_zopa/)).not.toBeInTheDocument();
  });

  it('does not render attestation payload fields', () => {
    const { container } = render(<NegotiationStatus status={FAIL_STATUS} />);
    expect(container.textContent).not.toMatch(/reasonHash/);
    expect(container.textContent).not.toMatch(/modelId/);
  });
});

describe('NegotiationStatus — running state', () => {
  it('shows bot-vs-bot animation, no price or condition literal text', () => {
    const runningStatus: GetStatusResponse = {
      negotiationId: hex('deadbeef' + '00'.repeat(28)),
      state: 'running',
      updatedAt: 1700000000,
    };
    render(<NegotiationStatus status={runningStatus} />);

    expect(screen.getByText(/NEAR AI TEE 안에서 협상 중/)).toBeInTheDocument();
    expect(screen.queryByText(/700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/750,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/강남/)).not.toBeInTheDocument();
    expect(screen.queryByText(/직거래/)).not.toBeInTheDocument();
  });
});

describe('NegotiationStatus — agreement state', () => {
  it('shows agreed price and conditions', () => {
    render(<NegotiationStatus status={AGREEMENT_STATUS} />);
    expect(screen.getByText(/협상 성공/)).toBeInTheDocument();
    expect(screen.getByText(/강남역 8번출구/)).toBeInTheDocument();
  });

  it('does NOT show any reservation price (min_sell or max_buy)', () => {
    render(<NegotiationStatus status={AGREEMENT_STATUS} />);
    // 700,000 = seller min, 750,000 = buyer max — must not appear
    expect(screen.queryByText(/700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/750,000/)).not.toBeInTheDocument();
  });
});
