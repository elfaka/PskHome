"""백엔드 stocksim 공개 API 클라이언트 — **읽기 전용 (GET 만)**.

엔진이 네트워크를 쓰는 유일한 모듈이다 (tests/test_no_bypass.py 가 검사한다).
- 토스 키·토큰은 백엔드가 갖고 있다. 엔진은 키 없이 백엔드를 거쳐 실시세만 읽는다.
- stocksim 의 주문·초기화 경로는 호출하지 않는다 (테스트가 이 파일에 그 경로 문자열이 없는지 검사한다).

응답 숫자는 float 을 거치지 않도록 Decimal 로 파싱한다.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Any

import httpx

from trader.clock import ensure_utc

API_PREFIX = "/api/stocksim"
ALLOWED_PATHS = (
    "/trades/{symbol}",
    "/orderbook/{symbol}",
    "/stocks/{symbol}/investors/intraday",
    "/stocks/{symbol}/overview",
    "/market",
)


class StockSimError(Exception):
    """백엔드 응답 실패·형식 오류. 호출 측은 데이터 이상으로 다룬다."""


def parse_ts(raw: object) -> datetime:
    """오프셋이 있는 ISO-8601 만 받는다 (시간대를 추측하지 않는다)."""
    if not isinstance(raw, str):
        raise StockSimError(f"시각 형식 오류: {raw!r}")
    try:
        return ensure_utc(datetime.fromisoformat(raw))
    except ValueError as e:
        raise StockSimError(f"시각 형식 오류: {raw!r}") from e


def dec(raw: object) -> Decimal:
    if isinstance(raw, Decimal):
        return raw
    if isinstance(raw, int) and not isinstance(raw, bool):
        return Decimal(raw)
    if isinstance(raw, str):
        return Decimal(raw)
    raise StockSimError(f"숫자 형식 오류: {raw!r}")


def dec_or_none(raw: object) -> Decimal | None:
    return None if raw is None else dec(raw)


class StockSimClient:
    def __init__(
        self, base_url: str, *, timeout_s: float = 5.0, transport: httpx.AsyncBaseTransport | None = None
    ):
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + API_PREFIX,
            timeout=timeout_s,
            headers={"User-Agent": "pskhome-trader/0.1", "Accept": "application/json"},
            transport=transport,
            follow_redirects=False,
        )

    async def close(self) -> None:
        await self._http.aclose()

    async def _get(self, path: str, params: Mapping[str, str] | None = None) -> Any:
        try:
            res = await self._http.get(path, params=params)
        except httpx.HTTPError as e:
            raise StockSimError(f"GET {path}: {type(e).__name__}") from e
        if res.status_code != 200:
            raise StockSimError(f"GET {path}: HTTP {res.status_code}")
        try:
            return json.loads(res.text, parse_float=Decimal, parse_int=Decimal)
        except ValueError as e:
            raise StockSimError(f"GET {path}: JSON 형식 오류") from e

    async def trades(self, symbol: str) -> list[dict[str, Any]]:
        """당일 최근 체결 (최신순, 최대 50건). [{price, volume, time}]"""
        data = await self._get(f"/trades/{symbol}")
        if not isinstance(data, list):
            raise StockSimError("trades 응답이 배열이 아니다")
        return data

    async def orderbook(self, symbol: str) -> dict[str, Any]:
        """{timestamp, asks(높은 가격순), bids(높은 가격순)}"""
        data = await self._get(f"/orderbook/{symbol}")
        if not isinstance(data, dict):
            raise StockSimError("orderbook 응답 형식 오류")
        return data

    async def intraday_flows(self, symbol: str) -> dict[str, Any]:
        data = await self._get(f"/stocks/{symbol}/investors/intraday")
        if not isinstance(data, dict):
            raise StockSimError("intraday flows 응답 형식 오류")
        return data

    async def overview(self, symbol: str) -> dict[str, Any]:
        data = await self._get(f"/stocks/{symbol}/overview")
        if not isinstance(data, dict):
            raise StockSimError("overview 응답 형식 오류")
        return data

    async def market(self) -> dict[str, Any]:
        data = await self._get("/market")
        if not isinstance(data, dict):
            raise StockSimError("market 응답 형식 오류")
        return data
