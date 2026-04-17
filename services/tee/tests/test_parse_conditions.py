"""Tests for parse_conditions.py — fake LLM injection, normalization checks."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from haggle_tee.parse_conditions import LLMTimeoutError, parse_conditions


def _fake_client(response_json: dict) -> MagicMock:  # type: ignore[type-arg]
    """Build a minimal AsyncOpenAI mock that returns *response_json* as chat content."""
    content = json.dumps(response_json)
    message = MagicMock()
    message.content = content
    choice = MagicMock()
    choice.message = message
    completion = MagicMock()
    completion.choices = [choice]

    client = MagicMock()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=completion)
    return client


@pytest.mark.asyncio
async def test_parse_gangnam_weekday() -> None:
    """강남 직거래만, 평일 19시 이후 → gangnam location, mon-fri days."""
    fake_response = {
        "location": ["gangnam"],
        "timeWindow": {"days": ["mon", "tue", "wed", "thu", "fri"], "startHour": 19, "endHour": 23},
        "payment": [],
        "extras": [],
    }
    client = _fake_client(fake_response)
    result = await parse_conditions(
        "강남 직거래만, 평일 19시 이후, 박스 없음", "seller", _client=client
    )
    assert result.location == ["gangnam"]
    assert set(result.timeWindow.days) == {"mon", "tue", "wed", "thu", "fri"}
    assert result.timeWindow.startHour == 19


@pytest.mark.asyncio
async def test_parse_songpa_weekend() -> None:
    """송파 가능, 주말만 됨, 카드결제 → songpa, sat-sun, card."""
    fake_response = {
        "location": ["songpa"],
        "timeWindow": {"days": ["sat", "sun"], "startHour": 9, "endHour": 20},
        "payment": ["card"],
        "extras": [],
    }
    client = _fake_client(fake_response)
    result = await parse_conditions("송파 가능, 주말만, 카드결제 가능", "buyer", _client=client)
    assert result.location == ["songpa"]
    assert set(result.timeWindow.days) == {"sat", "sun"}
    assert result.payment == ["card"]


@pytest.mark.asyncio
async def test_parse_multiple_locations() -> None:
    fake_response = {
        "location": ["gangnam", "songpa"],
        "timeWindow": {"days": [], "startHour": 9, "endHour": 22},
        "payment": ["cash", "transfer"],
        "extras": ["has-box"],
    }
    client = _fake_client(fake_response)
    result = await parse_conditions("강남/송파 직거래, 박스 있음", "seller", _client=client)
    assert "gangnam" in result.location
    assert "songpa" in result.location
    assert "has-box" in result.extras


@pytest.mark.asyncio
async def test_llm_timeout_raises() -> None:
    """TimeoutError from asyncio.wait_for → LLMTimeoutError."""
    import asyncio

    client = MagicMock()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=asyncio.TimeoutError())

    with pytest.raises(LLMTimeoutError):
        await parse_conditions("아무 조건", "seller", _client=client)


@pytest.mark.asyncio
async def test_empty_conditions() -> None:
    """No conditions mentioned → empty arrays, default hours."""
    fake_response = {
        "location": [],
        "timeWindow": {"days": [], "startHour": 9, "endHour": 22},
        "payment": [],
        "extras": [],
    }
    client = _fake_client(fake_response)
    result = await parse_conditions("상관없음", "buyer", _client=client)
    assert result.location == []
    assert result.payment == []
