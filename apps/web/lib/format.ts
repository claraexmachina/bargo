import { KARMA_TIER_NAMES } from '@haggle/shared';
import type { KarmaTier } from '@haggle/shared';

const KRW_FORMATTER = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  minimumFractionDigits: 0,
});

/**
 * Format a wei (bigint) value as KRW display string.
 * 1 ETH = 1 KRW for demo simplicity (no real exchange rate).
 * The demo uses round numbers so the display is still meaningful.
 */
export function formatKRW(weiString: string): string {
  try {
    const wei = BigInt(weiString);
    // 1 token unit (10^18 wei) = 1원 display unit
    const krw = wei / 10n ** 18n;
    return KRW_FORMATTER.format(Number(krw));
  } catch {
    return '₩---';
  }
}

/**
 * Parse a KRW display value (e.g. "700,000") to wei string.
 * Strips commas/spaces, multiplies by 10^18.
 */
export function krwToWei(krwString: string): string {
  const cleaned = krwString.replace(/[,\s₩원]/g, '');
  const n = BigInt(cleaned === '' ? '0' : cleaned);
  return (n * 10n ** 18n).toString();
}

/** Truncate 0x address for display: 0x1234...abcd */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Return display name for a karma tier */
export function karmaTierName(tier: KarmaTier): string {
  return KARMA_TIER_NAMES[tier] ?? 'Unknown';
}

/** Format a unix-seconds timestamp as locale string */
export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Format ISO 8601 date string for meetup display */
export function formatMeetTime(isoString: string): string {
  return new Date(isoString).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });
}
