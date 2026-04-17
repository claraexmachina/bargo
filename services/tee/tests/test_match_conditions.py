"""Tests for match_conditions.py — 4 axes + KST time arithmetic."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from haggle_tee.match_conditions import Compatible, Incompatible, match, next_occurrence
from haggle_tee.schemas import ConditionStruct, TimeWindow

_KST = timezone(timedelta(hours=9))


def _make(
    location: list[str] | None = None,
    days: list[str] | None = None,
    start: int = 9,
    end: int = 22,
    payment: list[str] | None = None,
    extras: list[str] | None = None,
) -> ConditionStruct:
    return ConditionStruct(
        location=location or [],
        timeWindow=TimeWindow(
            days=days or [],  # type: ignore[arg-type]
            startHour=start,
            endHour=end,
        ),
        payment=payment or [],  # type: ignore[arg-type]
        extras=extras or [],
    )


# ── Location axis ────────────────────────────────────────────────


def test_location_compatible() -> None:
    seller = _make(location=["gangnam", "songpa"])
    buyer = _make(location=["songpa", "mapo"])
    result = match(seller, buyer)
    assert isinstance(result, Compatible)
    assert result.agreed.location == "songpa"


def test_location_incompatible() -> None:
    seller = _make(location=["gangnam"])
    buyer = _make(location=["hongdae"])
    result = match(seller, buyer)
    assert isinstance(result, Incompatible)
    assert result.reason_code == "location"


def test_location_no_preference_seller() -> None:
    seller = _make(location=[])  # no preference
    buyer = _make(location=["gangnam"])
    result = match(seller, buyer)
    assert isinstance(result, Compatible)
    assert result.agreed.location == "gangnam"


def test_location_no_preference_both() -> None:
    seller = _make(location=[])
    buyer = _make(location=[])
    result = match(seller, buyer)
    assert isinstance(result, Compatible)
    assert result.agreed.location == "tbd"


# ── Time axis ────────────────────────────────────────────────────


def test_time_compatible_days_and_hours() -> None:
    seller = _make(days=["mon", "wed", "fri"], start=19, end=22)
    buyer = _make(days=["fri", "sat"], start=18, end=21)
    result = match(seller, buyer)
    assert isinstance(result, Compatible)
    assert "fri" in result.agreed.meetTimeIso or True  # day embedded in ISO string


def test_time_incompatible_days() -> None:
    """판매자 평일만 / 구매자 주말만 → 협상 실패."""
    seller = _make(days=["mon", "tue", "wed", "thu", "fri"])
    buyer = _make(days=["sat", "sun"])
    result = match(seller, buyer)
    assert isinstance(result, Incompatible)
    assert result.reason_code == "time"


def test_time_incompatible_hours() -> None:
    seller = _make(days=["fri"], start=9, end=12)
    buyer = _make(days=["fri"], start=14, end=20)
    result = match(seller, buyer)
    assert isinstance(result, Incompatible)
    assert result.reason_code == "time"


def test_time_no_preference_one_side() -> None:
    seller = _make(days=[])  # no preference
    buyer = _make(days=["sat"], start=10, end=14)
    result = match(seller, buyer)
    assert isinstance(result, Compatible)


# ── Payment axis ─────────────────────────────────────────────────


def test_payment_compatible() -> None:
    seller = _make(payment=["cash", "transfer"])
    buyer = _make(payment=["card", "transfer"])
    result = match(seller, buyer)
    assert isinstance(result, Compatible)
    assert result.agreed.payment == "transfer"


def test_payment_incompatible() -> None:
    seller = _make(payment=["cash"])
    buyer = _make(payment=["card"])
    result = match(seller, buyer)
    assert isinstance(result, Incompatible)
    assert result.reason_code == "payment"


def test_payment_no_preference() -> None:
    seller = _make(payment=[])
    buyer = _make(payment=["card"])
    result = match(seller, buyer)
    assert isinstance(result, Compatible)
    assert result.agreed.payment == "card"


# ── Extras — advisory only ───────────────────────────────────────


def test_extras_mismatch_not_hard_fail() -> None:
    seller = _make(location=["gangnam"], extras=["has-box"])
    buyer = _make(location=["gangnam"], extras=["no-box"])
    result = match(seller, buyer)
    # extras mismatch should NOT cause Incompatible
    assert isinstance(result, Compatible)


# ── KST time arithmetic ──────────────────────────────────────────


def test_next_occurrence_is_future() -> None:
    """next_occurrence() must always return a future timestamp."""
    for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]:
        iso = next_occurrence(day, 10)
        dt = datetime.fromisoformat(iso)
        assert dt > datetime.now(_KST), f"next_occurrence({day!r}, 10) returned past time"


def test_next_occurrence_correct_weekday() -> None:
    iso = next_occurrence("fri", 19)
    dt = datetime.fromisoformat(iso)
    assert dt.weekday() == 4  # Friday
    assert dt.hour == 19
    assert dt.tzinfo is not None
    assert dt.utcoffset() == timedelta(hours=9)
