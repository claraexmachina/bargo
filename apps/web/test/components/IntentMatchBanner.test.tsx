import { IntentMatchBanner } from '@/components/IntentMatchBanner';
import type { GetIntentMatchesResponse } from '@bargo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Stub wagmi — wallet connected with a fixed address
vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`,
    isConnected: true,
  }),
}));

// Stub react-query hooks from lib/api
const mockUseIntentMatches = vi.fn();
const mockUseAckIntentMatch = vi.fn(() => ({ mutateAsync: vi.fn() }));

vi.mock('@/lib/api', () => ({
  useIntentMatches: (arg: unknown) => mockUseIntentMatches(arg),
  useAckIntentMatch: () => mockUseAckIntentMatch(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const DEMO_MATCH = {
  intentId: '0xaaaa' as `0x${string}`,
  listingId: '0xbbbb' as `0x${string}`,
  seller: '0xcccc' as `0x${string}`,
  itemMeta: {
    title: 'iPhone 15 Pro',
    description: 'Good condition',
    category: 'electronics' as const,
    images: [],
  },
  requiredKarmaTier: 1 as const,
  score: 'match' as const,
  matchReason: 'Category and conditions align.',
  matchedAt: 1700000000,
  acknowledged: false,
};

describe('IntentMatchBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there are no unacknowledged matches', () => {
    mockUseIntentMatches.mockReturnValue({
      data: { matches: [] } satisfies GetIntentMatchesResponse,
    });
    const { container } = render(<IntentMatchBanner />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when data is undefined', () => {
    mockUseIntentMatches.mockReturnValue({ data: undefined });
    const { container } = render(<IntentMatchBanner />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it('renders bell button with badge count when there are unacknowledged matches', () => {
    mockUseIntentMatches.mockReturnValue({
      data: { matches: [DEMO_MATCH] } satisfies GetIntentMatchesResponse,
    });
    render(<IntentMatchBanner />, { wrapper });

    const button = screen.getByRole('button', { name: /intent match/i });
    expect(button).toBeInTheDocument();
    expect(button.textContent).toContain('1');
  });

  it('shows badge count capped at 9+ for 10+ matches', () => {
    const manyMatches = Array.from({ length: 10 }, (_, i) => ({
      ...DEMO_MATCH,
      intentId: `0x${i.toString().padStart(4, '0')}` as `0x${string}`,
    }));
    mockUseIntentMatches.mockReturnValue({
      data: { matches: manyMatches } satisfies GetIntentMatchesResponse,
    });
    render(<IntentMatchBanner />, { wrapper });
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('renders nothing when all matches are acknowledged', () => {
    const acked = { ...DEMO_MATCH, acknowledged: true };
    mockUseIntentMatches.mockReturnValue({
      data: { matches: [acked] } satisfies GetIntentMatchesResponse,
    });
    const { container } = render(<IntentMatchBanner />, { wrapper });
    expect(container.firstChild).toBeNull();
  });
});
