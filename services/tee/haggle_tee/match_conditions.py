"""Condition matching — pure set-overlap logic.

Given seller and buyer ConditionStructs, compute compatibility on 4 axes:
  1. location  — first common district; empty-side = no preference
  2. timeWindow — intersect days AND hour range [start, end); empty-side = no preference
  3. payment   — first common method; empty-side = no preference
  4. extras    — advisory only (no hard fail)

On success, produces AgreedConditions with meetTimeIso = next occurrence of
the first compatible (weekday, hour) pair in KST (Asia/Seoul, +09:00).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from .schemas import AgreedConditions, ConditionStruct

_KST = timezone(timedelta(hours=9))

_DAY_ORDER: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
]
_DAY_IDX: dict[str, int] = {d: i for i, d in enumerate(_DAY_ORDER)}
# Python weekday(): Mon=0 .. Sun=6 — matches _DAY_ORDER


@dataclass
class Compatible:
    agreed: AgreedConditions


@dataclass
class Incompatible:
    reason_code: str  # "location" | "time" | "payment"


MatchResult = Compatible | Incompatible


def _intersect_days(
    seller: list[str] | list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]],
    buyer: list[str] | list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]],
) -> list[str]:
    """Return ordered intersection; empty input = no preference (accept all)."""
    if not seller:
        return list(buyer) if buyer else list(_DAY_ORDER)
    if not buyer:
        return list(seller)
    seller_set = set(seller)
    return [d for d in _DAY_ORDER if d in seller_set and d in buyer]


def _intersect_hours(
    s_start: int,
    s_end: int,
    b_start: int,
    b_end: int,
) -> tuple[int, int] | None:
    """Intersect two [start, end) ranges. Returns None if empty."""
    lo = max(s_start, b_start)
    hi = min(s_end, b_end)
    return (lo, hi) if lo < hi else None


def _next_occurrence(day: str, hour: int) -> str:
    """ISO 8601 KST timestamp of the next occurrence of (weekday, hour)."""
    now = datetime.now(_KST)
    target_weekday = _DAY_IDX[day]
    days_ahead = (target_weekday - now.weekday()) % 7

    candidate = now.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(
        days=days_ahead
    )
    # If today matches but the hour has passed, roll to next week
    if candidate <= now:
        candidate += timedelta(days=7)
    return candidate.isoformat()


def match(seller: ConditionStruct, buyer: ConditionStruct) -> MatchResult:
    """Compute compatibility between seller and buyer conditions.

    Empty arrays on either side are treated as "no preference" (compatible).
    Returns Compatible(AgreedConditions) or Incompatible(reason_code).
    """
    # --- 1. Location ---
    if seller.location and buyer.location:
        seller_locs = set(seller.location)
        common_locs = [loc for loc in buyer.location if loc in seller_locs]
        if not common_locs:
            return Incompatible(reason_code="location")
        agreed_location = common_locs[0]
    elif seller.location:
        agreed_location = seller.location[0]
    elif buyer.location:
        agreed_location = buyer.location[0]
    else:
        agreed_location = "tbd"

    # --- 2. Time window ---
    s_tw = seller.timeWindow
    b_tw = buyer.timeWindow

    common_days = _intersect_days(s_tw.days, b_tw.days)
    if not common_days:
        return Incompatible(reason_code="time")

    # Intersect hour ranges
    # Handle "no preference" (empty days treated as all days above; default hours if 0,0)
    s_start = s_tw.startHour if s_tw.days else 9
    s_end = s_tw.endHour if s_tw.days else 22
    b_start = b_tw.startHour if b_tw.days else 9
    b_end = b_tw.endHour if b_tw.days else 22

    hour_range = _intersect_hours(s_start, s_end, b_start, b_end)
    if hour_range is None:
        return Incompatible(reason_code="time")

    agreed_day = common_days[0]
    agreed_hour = hour_range[0]  # earliest valid hour in intersection
    meet_time_iso = _next_occurrence(agreed_day, agreed_hour)

    # --- 3. Payment ---
    if seller.payment and buyer.payment:
        seller_payments = set(seller.payment)
        common_payments = [p for p in buyer.payment if p in seller_payments]
        if not common_payments:
            return Incompatible(reason_code="payment")
        agreed_payment: Literal["cash", "card", "transfer", "crypto"] = common_payments[0]
    elif seller.payment:
        agreed_payment = seller.payment[0]
    elif buyer.payment:
        agreed_payment = buyer.payment[0]
    else:
        agreed_payment = "cash"

    # --- 4. Extras — advisory only ---
    # (not a hard fail; logged privately if needed)

    return Compatible(
        agreed=AgreedConditions(
            location=agreed_location,
            meetTimeIso=meet_time_iso,
            payment=agreed_payment,
        )
    )


def intersect_hour_range(
    s_start: int, s_end: int, b_start: int, b_end: int
) -> tuple[int, int] | None:
    """Exported for tests."""
    return _intersect_hours(s_start, s_end, b_start, b_end)


def next_occurrence(day: str, hour: int) -> str:
    """Exported for tests."""
    return _next_occurrence(day, hour)
