"""LLM-based natural language condition parser.

Calls NEAR AI Cloud (OpenAI-compatible) with structured output (json_schema)
to convert free-text trading conditions into ConditionStruct.

Korean district normalization:
  강남 → gangnam, 송파 → songpa, 홍대 → hongdae, 강서 → gangseo,
  마포 → mapo, 서초 → seocho, 잠실 → jamsil, 신촌 → sinchon,
  이태원 → itaewon, 종로 → jongno, 명동 → myeongdong

Day mapping:
  평일 → mon, tue, wed, thu, fri
  주말 → sat, sun

Hours: 24h KST. If not mentioned → defaults applied.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Literal

from openai import AsyncOpenAI

from .schemas import ConditionStruct, TimeWindow

DEFAULT_MODEL = "llama-v3p1-8b-instruct"
NEAR_AI_BASE_URL = "https://api.near.ai/v1"

_TIMEOUT_SECONDS = 8.0

_CONDITION_JSON_SCHEMA: dict[str, Any] = {
    "name": "condition_struct",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "location": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Normalized district names in lowercase English. "
                    "강남→gangnam, 송파→songpa, 홍대→hongdae, 강서→gangseo, "
                    "마포→mapo, 서초→seocho, 잠실→jamsil, 신촌→sinchon, "
                    "이태원→itaewon, 종로→jongno, 명동→myeongdong"
                ),
            },
            "timeWindow": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                        },
                        "description": (
                            "Days available. 평일→[mon,tue,wed,thu,fri], 주말→[sat,sun]. "
                            "Empty means no preference."
                        ),
                    },
                    "startHour": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 23,
                        "description": "Start hour in 24h KST. Default 9 if not mentioned.",
                    },
                    "endHour": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 24,
                        "description": "End hour in 24h KST (exclusive). Default 22 if not mentioned.",
                    },
                },
                "required": ["days", "startHour", "endHour"],
                "additionalProperties": False,
            },
            "payment": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["cash", "card", "transfer", "crypto"],
                },
                "description": "Accepted payment methods. Empty means no preference.",
            },
            "extras": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Free-form tags e.g. has-box, receipt-required, no-box.",
            },
        },
        "required": ["location", "timeWindow", "payment", "extras"],
        "additionalProperties": False,
    },
}

_SYSTEM_PROMPT = """\
You are a structured data extractor for a Korean/English peer-to-peer marketplace.
Extract trading conditions from user-provided free text and output ONLY valid JSON matching the schema.
No commentary, no markdown fences.

Rules:
- location: normalize Korean district names to lowercase English (강남→gangnam, 송파→songpa, etc.)
- days: map 평일→[mon,tue,wed,thu,fri], 주말→[sat,sun]; specific days like 금요일→[fri]
- hours: interpret in 24h KST; 오후 7시 → 19; if only start is given, endHour = startHour + 4 (capped at 24)
- payment: map 현금→cash, 카드→card, 계좌이체→transfer, 암호화폐→crypto
- extras: include anything like 박스 있음→has-box, 영수증→receipt-required, 박스 없음→no-box
- If a field is not mentioned: return empty array, or default startHour=9, endHour=22
"""


class LLMTimeoutError(Exception):
    """Raised when the LLM call exceeds the 8-second budget."""


def _make_client() -> AsyncOpenAI:
    api_key = os.environ.get("NEAR_AI_API_KEY", "test-key")
    return AsyncOpenAI(base_url=NEAR_AI_BASE_URL, api_key=api_key)


async def parse_conditions(
    text: str,
    role: Literal["seller", "buyer"],
    *,
    _client: AsyncOpenAI | None = None,
) -> ConditionStruct:
    """Parse free-text trading conditions into ConditionStruct.

    Args:
        text:    Raw natural-language string from the user.
        role:    'seller' or 'buyer' (used for prompt context).
        _client: Injectable AsyncOpenAI client (for testing).

    Returns:
        Validated ConditionStruct.

    Raises:
        LLMTimeoutError: if the LLM call exceeds 8 seconds.
        ValueError:      if the LLM returns invalid JSON or schema violation.
    """
    client = _client or _make_client()
    model = os.environ.get("NEAR_AI_MODEL", DEFAULT_MODEL)

    user_msg = f"Role: {role}\nConditions text: {text}"

    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(  # type: ignore[call-overload]
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": _CONDITION_JSON_SCHEMA,
                },
                temperature=0,
                max_tokens=512,
            ),
            timeout=_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        raise LLMTimeoutError("LLM call timed out after 8 seconds") from None

    content = response.choices[0].message.content
    if not content:
        raise ValueError("LLM returned empty response")

    raw: dict[str, Any] = json.loads(content)

    # Build and validate via Pydantic
    time_window = TimeWindow(
        days=raw["timeWindow"]["days"],
        startHour=raw["timeWindow"]["startHour"],
        endHour=raw["timeWindow"]["endHour"],
    )
    return ConditionStruct(
        location=raw["location"],
        timeWindow=time_window,
        payment=raw["payment"],
        extras=raw.get("extras", []),
    )
