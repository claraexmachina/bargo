import type { Hex, NearAiAttestation } from '@bargo/shared';
import { render, screen } from '@testing-library/react';
/**
 * AttestationViewer: renders modelId, truncated hash, copy button.
 * Fail-safe: renders nothing when attestation is undefined.
 */
import { describe, expect, it, vi } from 'vitest';
import { AttestationViewer } from '../../components/AttestationViewer';

// Mock useAttestationBundle so we can control its return value per test
type BundleResult = { data: unknown; isLoading: boolean; error: Error | null };
const defaultBundle: BundleResult = { data: undefined, isLoading: false, error: null };
let bundleResult: BundleResult = defaultBundle;
vi.mock('@/lib/api', () => ({
  useAttestationBundle: () => bundleResult,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function hex(s: string): Hex {
  return `0x${s}` as Hex;
}

const SAMPLE_ATTESTATION: NearAiAttestation = {
  dealId: hex(`deadbeef${'00'.repeat(28)}`),
  listingId: hex('11'.repeat(32)),
  offerId: hex('22'.repeat(32)),
  agreedPrice: '725000000000000000000000',
  agreedConditions: {
    location: '강남역 8번출구',
    meetTimeIso: '2026-04-18T19:00:00+09:00',
    payment: 'cash',
  },
  agreedConditionsHash: hex('ff'.repeat(32)),
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

describe('AttestationBundleExpando error path', () => {
  it('renders error message when bundle fetch fails', async () => {
    const { fireEvent } = await import('@testing-library/react');
    bundleResult = { data: undefined, isLoading: false, error: new Error('network failure') };

    render(<AttestationViewer attestation={SAMPLE_ATTESTATION} />);

    const expandoButton = screen.getByRole('button', { name: /전체 증명 번들 보기/ });
    fireEvent.click(expandoButton);

    expect(screen.getByText(/번들을 불러올 수 없습니다/)).toBeInTheDocument();

    bundleResult = defaultBundle;
  });
});
