"""Shared fixtures. No test in this suite opens a network connection."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import yaml

from trading_bot.config.settings import DEFAULT_CONFIG_PATH, load_config
from trading_bot.core.types import (
    AccountSnapshot,
    Instrument,
    OrderType,
    Position,
    ProposedOrder,
    Side,
)

BASE_TIME = datetime(2026, 3, 2, 14, 30, tzinfo=timezone.utc)


class FakeClock:
    """Deterministic, manually advanced clock."""

    def __init__(self, start: datetime = BASE_TIME) -> None:
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs) -> datetime:
        self.now += timedelta(**kwargs)
        return self.now


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def raw_config() -> dict:
    return yaml.safe_load(DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"))


@pytest.fixture
def make_config(tmp_path: Path, raw_config: dict):
    """Build a Config with all state files redirected into a temp directory.

    ``overrides`` is a nested dict merged over the shipped defaults, so each
    test states only the limit it cares about.
    """

    def _merge(base: dict, extra: dict) -> dict:
        for key, value in extra.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                _merge(base[key], value)
            else:
                base[key] = value
        return base

    def _factory(overrides: dict | None = None):
        data = copy.deepcopy(raw_config)
        state = tmp_path / "state"
        state.mkdir(parents=True, exist_ok=True)
        data["risk"]["kill_switch_file"] = str(state / "KILL_SWITCH")
        data["risk"]["halt_state_file"] = str(state / "halt_state.json")
        data["risk"]["rate_limit_state_file"] = str(state / "rate_limit.json")
        data["risk"]["equity_peak_file"] = str(state / "equity_peak.json")
        data["approval"]["approval_store"] = str(state / "approvals.db")
        if overrides:
            _merge(data, overrides)
        path = tmp_path / "config.yaml"
        path.write_text(yaml.safe_dump(data), encoding="utf-8")
        return load_config(path, audit=False)

    return _factory


@pytest.fixture
def config(make_config):
    return make_config()


def make_instrument(
    symbol: str = "SPY",
    *,
    exchange: str = "SMART",
    currency: str = "CHF",
    asset_class: str = "STK",
    sector: str = "BROAD_EQUITY",
) -> Instrument:
    return Instrument(
        symbol=symbol,
        exchange=exchange,
        currency=currency,
        asset_class=asset_class,
        sector=sector,
        contract_id=abs(hash(symbol)) % 1_000_000,
    )


def make_order(
    symbol: str = "SPY",
    *,
    side: Side = Side.BUY,
    quantity: float = 10,
    price: float = 100.0,
    limit_price: float | None = None,
    fx: float = 1.0,
    strategy: str = "momentum",
    order_type: OrderType = OrderType.LIMIT,
    sector: str = "BROAD_EQUITY",
    asset_class: str = "STK",
    currency: str = "CHF",
    exchange: str = "SMART",
) -> ProposedOrder:
    return ProposedOrder(
        instrument=make_instrument(
            symbol,
            exchange=exchange,
            currency=currency,
            asset_class=asset_class,
            sector=sector,
        ),
        side=side,
        quantity=quantity,
        limit_price=price if (limit_price is None and order_type is OrderType.LIMIT) else limit_price,
        order_type=order_type,
        strategy=strategy,
        fx_rate_to_base=fx,
        reference_price=price,
        created_at=BASE_TIME,
    )


def make_position(
    symbol: str = "IWDC",
    *,
    quantity: float = 100,
    price: float = 90.0,
    market_value_base: float | None = None,
    sector: str = "BROAD_EQUITY",
    currency: str = "CHF",
) -> Position:
    value = market_value_base if market_value_base is not None else quantity * price
    return Position(
        instrument=make_instrument(symbol, currency=currency, sector=sector),
        quantity=quantity,
        avg_price=price,
        market_price=price,
        market_value_base=value,
        unrealized_pnl_base=0.0,
    )


def make_snapshot(
    *,
    equity: float = 300_000.0,
    cash: float = 30_000.0,
    settled_cash: float | None = None,
    positions: list[Position] | None = None,
    day_start_equity: float | None = None,
    peak_equity: float | None = None,
    account_type: str = "cash",
    timestamp: datetime = BASE_TIME,
) -> AccountSnapshot:
    positions = positions or []
    return AccountSnapshot(
        timestamp=timestamp,
        base_currency="CHF",
        equity=equity,
        cash=cash,
        settled_cash=cash if settled_cash is None else settled_cash,
        positions={p.instrument.symbol: p for p in positions},
        day_start_equity=day_start_equity if day_start_equity is not None else equity,
        peak_equity=peak_equity if peak_equity is not None else equity,
        account_type=account_type,
    )


@pytest.fixture
def snapshot() -> AccountSnapshot:
    return make_snapshot()
