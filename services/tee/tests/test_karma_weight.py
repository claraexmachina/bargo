"""Tests for karma_weight.py — monotonicity, clamping, symmetry."""

from __future__ import annotations

import pytest

from haggle_tee.karma_weight import karma_weight


def test_equal_tiers_returns_half() -> None:
    for tier in range(4):
        assert karma_weight(tier, tier) == pytest.approx(0.5)


def test_seller_advantage() -> None:
    """Higher seller tier → weight > 0.5 (seller favoured)."""
    assert karma_weight(3, 0) == pytest.approx(0.65)
    assert karma_weight(2, 0) == pytest.approx(0.6)
    assert karma_weight(3, 1) == pytest.approx(0.6)


def test_buyer_advantage() -> None:
    """Higher buyer tier → weight < 0.5 (buyer favoured)."""
    assert karma_weight(0, 3) == pytest.approx(0.35)
    assert karma_weight(0, 2) == pytest.approx(0.4)
    assert karma_weight(1, 3) == pytest.approx(0.4)


def test_clamped_at_lower_bound() -> None:
    # (0 - 3) * 0.05 = -0.15 → 0.5 - 0.15 = 0.35, already at boundary
    assert karma_weight(0, 3) >= 0.35


def test_clamped_at_upper_bound() -> None:
    assert karma_weight(3, 0) <= 0.65


def test_monotone_in_seller_tier() -> None:
    """Increasing seller_tier never decreases weight."""
    buyer = 1
    weights = [karma_weight(s, buyer) for s in range(4)]
    assert weights == sorted(weights)


def test_monotone_in_buyer_tier() -> None:
    """Increasing buyer_tier never increases weight (seller becomes less favoured)."""
    seller = 2
    weights = [karma_weight(seller, b) for b in range(4)]
    assert weights == sorted(weights, reverse=True)


def test_symmetry() -> None:
    """karma_weight(a, b) + karma_weight(b, a) == 1.0."""
    for a in range(4):
        for b in range(4):
            assert karma_weight(a, b) + karma_weight(b, a) == pytest.approx(1.0)
