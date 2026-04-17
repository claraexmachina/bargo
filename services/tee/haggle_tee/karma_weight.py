"""Karma-weighted price split within ZOPA.

Per PRD §2.4 US-5 and §2.8:
  weight = 0.5 + 0.05 * (seller_tier - buyer_tier)
  clamped to [0.35, 0.65]

weight > 0.5 → seller-favourable (agreed_price closer to max_buy)
weight < 0.5 → buyer-favourable (agreed_price closer to min_sell)

agreed_price = floor(min_sell + (max_buy - min_sell) * weight)
"""

from __future__ import annotations


def karma_weight(seller_tier: int, buyer_tier: int) -> float:
    """Compute seller-favourable weight in [0.35, 0.65].

    Args:
        seller_tier: Karma tier of the seller (0..3).
        buyer_tier:  Karma tier of the buyer  (0..3).

    Returns:
        Float weight in [0.35, 0.65].
    """
    raw = 0.5 + 0.05 * (seller_tier - buyer_tier)
    return max(0.35, min(0.65, raw))
