// Condition matching logic for the negotiation engine.
// Exports:
//   - conditionPairJsonSchema (re-export from nearai/client.ts)
//   - matchConditions(seller, buyer) → compatible or incompatible

import type { ConditionStruct, AgreedConditions } from '@bargo/shared';

export { conditionPairJsonSchema } from '../nearai/client.js';

export type MatchResult =
  | { compatible: true; agreed: AgreedConditions }
  | { compatible: false; axis: 'location' | 'time' | 'payment' };

/**
 * Compute the next occurrence (in KST +09:00) of the given day-of-week and hour.
 * Returns an ISO 8601 string like "2026-04-20T19:00:00+09:00".
 *
 * dayOfWeek: 0=Sunday, 1=Monday, ..., 6=Saturday
 */
function nextOccurrenceKST(dayOfWeek: number, hour: number): string {
  // Current time in KST
  const nowUTC = new Date();
  // Offset to KST: UTC+9 = 540 minutes
  const nowKST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);

  // Find next occurrence
  let daysAhead = (dayOfWeek - nowKST.getUTCDay() + 7) % 7;
  if (daysAhead === 0 && nowKST.getUTCHours() >= hour) {
    daysAhead = 7; // same day but past the hour — go to next week
  }

  const target = new Date(nowKST.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  const h = String(hour).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:00:00+09:00`;
}

const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Day = (typeof DAY_ORDER)[number];

function dayIndex(day: string): number {
  const idx = DAY_ORDER.indexOf(day as Day);
  return idx === -1 ? 0 : idx;
}

/**
 * Match seller and buyer conditions.
 *
 * Empty array = "no preference"; single-side empty → compatible on that axis.
 */
export function matchConditions(
  seller: ConditionStruct,
  buyer: ConditionStruct,
): MatchResult {
  // --- Location ---
  const sellerLoc = seller.location;
  const buyerLoc = buyer.location;
  let agreedLocation: string;

  if (sellerLoc.length === 0 && buyerLoc.length === 0) {
    agreedLocation = 'anywhere';
  } else if (sellerLoc.length === 0) {
    agreedLocation = buyerLoc[0]!;
  } else if (buyerLoc.length === 0) {
    agreedLocation = sellerLoc[0]!;
  } else {
    const intersection = sellerLoc.filter((l) => buyerLoc.includes(l));
    if (intersection.length === 0) {
      return { compatible: false, axis: 'location' };
    }
    agreedLocation = intersection[0]!;
  }

  // --- Time window ---
  const sellerDays = seller.timeWindow.days;
  const buyerDays = buyer.timeWindow.days;
  let agreedDay: string;
  let agreedHour: number;

  if (sellerDays.length === 0 && buyerDays.length === 0) {
    // Both have no preference — pick Monday 10:00 as a neutral default
    agreedDay = 'mon';
    agreedHour = 10;
  } else {
    const effectiveSellerDays: string[] = sellerDays.length > 0 ? sellerDays : [...DAY_ORDER];
    const effectiveBuyerDays: string[] = buyerDays.length > 0 ? buyerDays : [...DAY_ORDER];

    const commonDays = effectiveSellerDays.filter((d) => effectiveBuyerDays.includes(d));
    if (commonDays.length === 0) {
      return { compatible: false, axis: 'time' };
    }

    // Intersect hours — overlap of [sellerStart, sellerEnd) ∩ [buyerStart, buyerEnd)
    const hourStart = Math.max(seller.timeWindow.startHour, buyer.timeWindow.startHour);
    const hourEnd = Math.min(seller.timeWindow.endHour, buyer.timeWindow.endHour);

    if (hourStart >= hourEnd) {
      return { compatible: false, axis: 'time' };
    }

    // Pick earliest valid (day, hour) — sort common days by day-of-week index
    const sortedDays = [...commonDays].sort((a, b) => dayIndex(a) - dayIndex(b));
    agreedDay = sortedDays[0]!;
    agreedHour = hourStart;
  }

  const meetTimeIso = nextOccurrenceKST(dayIndex(agreedDay), agreedHour);

  // --- Payment ---
  const sellerPay = seller.payment;
  const buyerPay = buyer.payment;
  let agreedPayment: AgreedConditions['payment'];

  if (sellerPay.length === 0 && buyerPay.length === 0) {
    agreedPayment = 'cash'; // neutral default
  } else if (sellerPay.length === 0) {
    agreedPayment = buyerPay[0]!;
  } else if (buyerPay.length === 0) {
    agreedPayment = sellerPay[0]!;
  } else {
    const intersection = sellerPay.filter((p) => buyerPay.includes(p));
    if (intersection.length === 0) {
      return { compatible: false, axis: 'payment' };
    }
    agreedPayment = intersection[0]!;
  }

  return {
    compatible: true,
    agreed: {
      location: agreedLocation,
      meetTimeIso,
      payment: agreedPayment,
    },
  };
}
