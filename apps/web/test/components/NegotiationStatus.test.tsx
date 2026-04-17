/**
 * NegotiationStatus: fail state must show only "협상 실패 — 조건 불일치",
 * no price or condition text.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NegotiationStatus } from '../../components/NegotiationStatus';
import type { GetStatusResponse } from '@haggle/shared';

const FAIL_STATUS: GetStatusResponse = {
  negotiationId: '0xdeadbeef00000000000000000000000000000000000000000000000000000000',
  state: 'fail',
  attestation: {
    payload: {
      listingId: '0x1111111111111111111111111111111111111111111111111111111111111111',
      offerId: '0x2222222222222222222222222222222222222222222222222222222222222222',
      reasonHash: '0xabc',
      modelId: 'mock/demo@v0',
      enclaveId: '0xdead',
      ts: 1700000000,
      nonce: '0x1234',
    },
    result: 'fail',
    signature: '0x00',
    signerAddress: '0x0000000000000000000000000000000000000000',
  },
  updatedAt: 1700000000,
};

const AGREEMENT_STATUS: GetStatusResponse = {
  negotiationId: '0xdeadbeef00000000000000000000000000000000000000000000000000000000',
  state: 'agreement',
  attestation: {
    payload: {
      listingId: '0x1111111111111111111111111111111111111111111111111111111111111111',
      offerId: '0x2222222222222222222222222222222222222222222222222222222222222222',
      agreedPrice: (725_000n * 10n ** 18n).toString(),
      agreedConditions: {
        location: 'gangnam',
        meetTimeIso: '2026-04-18T19:00:00+09:00',
        payment: 'cash',
      },
      modelId: 'near-ai/llama-3.1-8b@v1',
      enclaveId: '0xdead',
      ts: 1700000000,
      nonce: '0x1234',
    },
    result: 'agreement',
    signature: '0x00',
    signerAddress: '0x0000000000000000000000000000000000000000',
  },
  updatedAt: 1700000000,
};

describe('NegotiationStatus — fail state', () => {
  it('renders only the fail message, no price or condition detail', () => {
    render(<NegotiationStatus status={FAIL_STATUS} />);

    expect(screen.getByText(/협상 실패 — 조건 불일치/)).toBeInTheDocument();

    // Must NOT reveal any price or condition text
    expect(screen.queryByText(/700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/750,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/강남/)).not.toBeInTheDocument();
    expect(screen.queryByText(/conditions_incompatible/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reasonHash/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no_price_zopa/)).not.toBeInTheDocument();
  });

  it('does not render any attestation payload fields', () => {
    const { container } = render(<NegotiationStatus status={FAIL_STATUS} />);
    expect(container.textContent).not.toMatch(/0xabc/);
    expect(container.textContent).not.toMatch(/modelId/);
  });
});

describe('NegotiationStatus — running state', () => {
  it('shows bot-vs-bot animation, no price or condition literal text', () => {
    const runningStatus: GetStatusResponse = {
      negotiationId: '0xdeadbeef00000000000000000000000000000000000000000000000000000000',
      state: 'running',
      updatedAt: 1700000000,
    };
    render(<NegotiationStatus status={runningStatus} />);

    expect(screen.getByText(/TEE 안에서 협상 중/)).toBeInTheDocument();
    // Must not reveal any price numbers or raw condition text
    expect(screen.queryByText(/700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/750,000/)).not.toBeInTheDocument();
    // Must not show raw condition strings like "강남" or "직거래"
    expect(screen.queryByText(/강남/)).not.toBeInTheDocument();
    expect(screen.queryByText(/직거래/)).not.toBeInTheDocument();
  });
});

describe('NegotiationStatus — agreement state', () => {
  it('shows agreed price and conditions', () => {
    render(<NegotiationStatus status={AGREEMENT_STATUS} />);
    expect(screen.getByText(/협상 성공/)).toBeInTheDocument();
    expect(screen.getByText(/gangnam/i)).toBeInTheDocument();
  });

  it('does NOT show any reservation price (min_sell or max_buy)', () => {
    render(<NegotiationStatus status={AGREEMENT_STATUS} />);
    // 700,000 = seller min, 750,000 = buyer max — must not appear
    expect(screen.queryByText(/700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/750,000/)).not.toBeInTheDocument();
  });
});
