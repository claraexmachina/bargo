// --- Karma tier names ---
export const KARMA_TIER_NAMES = ['Newcomer', 'Regular', 'Trusted', 'Elite'] as const;

// --- Karma SNT staking thresholds (wei) ---
export const KARMA_THRESHOLDS_WEI = {
  tier1: 10n * 10n ** 18n,
  tier2: 100n * 10n ** 18n,
  tier3: 1000n * 10n ** 18n,
} as const;

// --- Concurrent negotiation throughput limits, indexed by tier (0..3) ---
export const THROUGHPUT_LIMITS = [3, 10, 20, 2 ** 31 - 1] as const;

// --- High-value listing threshold (500k wei equiv in demo token) ---
export const HIGH_VALUE_THRESHOLD_WEI = 500_000n * 10n ** 18n;

// --- RLN ---
// Epoch duration in seconds (resolved: 300s per team decision)
export const RLN_EPOCH_DURATION = 300 as const;
// Maximum offers per epoch per user per listing
export const RLN_MAX_PER_EPOCH = 3 as const;

// --- Settlement ---
export const SETTLEMENT_WINDOW_SECONDS = 86_400 as const; // 24 hours
