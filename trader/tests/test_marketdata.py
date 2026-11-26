from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path

import pytest

from tests.fakes import T0, quote
from trader.clock import KST, SimClock, to_kst
from trader.marketdata.bars import BarAggregator
from trader.marketdata.base import FeedDataError
from trader.marketdata.csv_replay import CsvReplayFeed
from trader.marketdata.synthetic import SyntheticFeed

SAMPLE = Path(__file__).resolve().parent.parent / "data" / "sample_ticks.csv"


async def collect(feed: CsvReplayFeed | SyntheticFeed) -> list:  # type: ignore[type-arg]
    return [q async for q in feed.stream()]


async def test_csv_replay_reads_decimal_and_utc(tmp_path: Path) -> None:
    p = tmp_path / "t.csv"
    p.write_text(
        "ts,symbol,price,volume,bid,ask\n"
        "2026-11-26T09:00:00+09:00,005930,70000.5,10,,\n"
        "2026-11-26T09:00:01+09:00,005930,70100,5,70000,70100\n",
        encoding="utf-8",
    )
    qs = await collect(CsvReplayFeed(p))
    assert qs[0].price == Decimal("70000.5") and isinstance(qs[0].price, Decimal)
    assert qs[0].ts == datetime(2026, 11, 26, 0, 0, tzinfo=UTC)
    assert qs[0].bid is None and qs[1].ask == Decimal(70100)


@pytest.mark.parametrize(
    "rows, msg",
    [
        ("2026-11-26T09:00:00,005930,1,1", "시간대"),
        ("2026-11-26T09:00:00+09:00,005930,0,1", "0보다"),
        ("2026-11-26T09:00:00+09:00,005930,abc,1", "숫자"),
        ("2026-11-26T09:00:00+09:00,005930,1,-1", "음수"),
        ("2026-11-26T09:00:01+09:00,005930,1,1\n2026-11-26T09:00:00+09:00,005930,1,1", "뒤로"),
    ],
)
async def test_csv_replay_rejects_bad_data(tmp_path: Path, rows: str, msg: str) -> None:
    p = tmp_path / "bad.csv"
    p.write_text("ts,symbol,price,volume\n" + rows + "\n", encoding="utf-8")
    with pytest.raises(FeedDataError, match=msg):
        await collect(CsvReplayFeed(p))


async def test_sample_csv_is_valid() -> None:
    qs = await collect(CsvReplayFeed(SAMPLE))
    assert len(qs) > 100


def _synthetic(seed: int = 7, days: int = 1) -> SyntheticFeed:
    return SyntheticFeed(
        symbols=["005930", "000660"],
        seed=seed,
        start_price=Decimal(70000),
        tick_size=Decimal(100),
        tick_seconds=30,
        market_open=time(9, 0),
        market_close=time(15, 20),
        pace="fast",
        clock=SimClock(T0),
        start_date=date(2026, 11, 27),  # 금요일
        days=days,
    )


async def test_synthetic_is_deterministic_and_on_tick_grid() -> None:
    a, b = await collect(_synthetic()), await collect(_synthetic())
    assert [(q.symbol, q.ts, q.price) for q in a] == [(q.symbol, q.ts, q.price) for q in b]
    assert all(q.price % 100 == 0 and q.price > 0 for q in a)
    assert all(isinstance(q.price, Decimal) for q in a)
    first, last = to_kst(a[0].ts), to_kst(a[-1].ts)
    assert first == datetime(2026, 11, 27, 9, 0, tzinfo=KST)
    assert last.time() < time(15, 20)
    assert await collect(_synthetic(seed=8)) != a


async def test_synthetic_skips_weekend() -> None:
    qs = await collect(_synthetic(days=2))
    days = sorted({to_kst(q.ts).date() for q in qs})
    assert days == [date(2026, 11, 27), date(2026, 11, 30)]  # 금 → 월


def test_bar_aggregation_and_gap_detection() -> None:
    agg = BarAggregator(60)
    assert agg.add(quote(100, sec=0, volume=1)) is None
    assert agg.add(quote(105, sec=20, volume=2)) is None
    assert agg.add(quote(95, sec=40, volume=3)) is None
    done = agg.add(quote(101, sec=60, volume=1))
    assert done is not None
    b = done.bar
    assert (b.open, b.high, b.low, b.close, b.volume) == (100, 105, 95, 95, 6)
    assert b.start_ts == T0 and done.missing_before == 0
    # 3분 공백 후 틱 → 09:31 봉 완성, 그다음 09:35 봉이 완성될 때 공백 3개
    agg.add(quote(102, sec=60 * 5))
    done = agg.add(quote(103, sec=60 * 6))
    assert done is not None and done.bar.start_ts == T0 + timedelta(minutes=5)
    assert done.missing_before == 3
