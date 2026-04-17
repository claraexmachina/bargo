import { ListingCard } from '@/components/ListingCard';
import type { ListingPublic } from '@bargo/shared';
import { render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// next/link renders an <a> in jsdom without needing a router
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const DEMO_LISTING: ListingPublic = {
  id: '0x1111111111111111111111111111111111111111111111111111111111111111',
  seller: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  requiredKarmaTier: 2,
  itemMeta: {
    title: 'MacBook M1 Pro 14-inch',
    description: 'Excellent condition, box included.',
    category: 'electronics',
    images: [],
  },
  status: 'open',
  createdAt: 1700000000,
};

describe('ListingCard', () => {
  it('renders the listing title', () => {
    render(<ListingCard listing={DEMO_LISTING} />);
    expect(screen.getByText('MacBook M1 Pro 14-inch')).toBeInTheDocument();
  });

  it('renders the sealed-bid badge with tier', () => {
    render(<ListingCard listing={DEMO_LISTING} />);
    const badge = screen.getByTestId('sealed-bid-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('Sealed-bid');
    expect(badge.textContent).toContain('Tier 2');
  });

  it('does NOT render any price value', () => {
    render(<ListingCard listing={DEMO_LISTING} />);
    // No KRW price, no wei, no numeric price in any form
    expect(screen.queryByText(/₩/)).not.toBeInTheDocument();
    expect(screen.queryByText(/800,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/askPrice/i)).not.toBeInTheDocument();
  });

  it('links to the correct listing detail page', () => {
    render(<ListingCard listing={DEMO_LISTING} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      '/listings/0x1111111111111111111111111111111111111111111111111111111111111111',
    );
  });
});
