/**
 * AttestationViewer: renders modelId, truncated hash, copy button.
 * Fail-safe: renders nothing when attestation is undefined.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttestationViewer } from '../../components/AttestationViewer';
import type { NearAiAttestation, Hex } from '@haggle/shared';

// Mock useAttestationBundle so the expando doesn't fetch during unit tests
vi.mock('@/lib/api', () => ({
  useAttestationBundle: () => ({ data: undefined, isLoading: false, error: null }),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function hex(s: string): Hex {
  return `0x${s}` as Hex;
}

const SAMPLE_ATTESTATION: NearAiAttestation = {
  dealId: hex('deadbeef' + '00'.repeat(28)),
  listingId: hex('11'.repeat(32)),
  offerId: hex('22'.repeat(32)),
  agreedPrice: '725000000000000000000000',
  agreedConditions: {
    location: '강남역 8번출구',
    meetTimeIso: '2026-04-18T19:00:00+09:00',
    payment: 'cash',
  },
  modelId: 'qwen3-30b',
  completionId: 'chatcmpl-abcdef123456',
  nonce: hex('aa'.repeat(32)),
  nearAiAttestationHash: hex('bb'.repeat(32)),
  attestationBundleUrl: '/attestation/0xdeadbeef',
  ts: 1700000000,
};

describe('AttestationViewer', () => {
  it('renders nothing when attestation is undefined', () => {
    const { container } = render(<AttestationViewer attestation={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modelId', () => {
    render(<AttestationViewer attestation={SAMPLE_ATTESTATION} />);
    expect(screen.getByText('qwen3-30b')).toBeInTheDocument();
  });

  it('renders truncated attestation hash', () => {
    render(<AttestationViewer attestation={SAMPLE_ATTESTATION} />);
    // The full hash is 0x + 32 bytes = 66 chars; truncated form shows ...
    const el = screen.getByText(/0xbbbb/);
    expect(el).toBeInTheDocument();
    // Should be truncated — not the full 66-char hash inline
    expect(el.textContent).not.toBe(hex('bb'.repeat(32)));
  });

  it('renders copy button for attestation hash', () => {
    render(<AttestationViewer attestation={SAMPLE_ATTESTATION} />);
    const copyButtons = screen.getAllByRole('button', { name: /복사/i });
    expect(copyButtons.length).toBeGreaterThan(0);
  });

  it('renders the verify script copy button', () => {
    render(<AttestationViewer attestation={SAMPLE_ATTESTATION} />);
    expect(screen.getByText(/심사위원용 검증 스크립트 복사/)).toBeInTheDocument();
  });

  it('renders the explainer text about TEE', () => {
    render(<AttestationViewer attestation={SAMPLE_ATTESTATION} />);
    expect(screen.getByText(/Intel TDX/)).toBeInTheDocument();
    expect(screen.getByText(/NVIDIA GPU TEE/)).toBeInTheDocument();
  });
});
