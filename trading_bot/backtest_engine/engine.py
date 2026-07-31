"""Event-driven daily backtester.

Why a purpose-built engine rather than an off-the-shelf framework
----------------------------------------------------------------
The build brief asked for a real framework and for its maintenance status to be
verified first. Checked at build time: ``backtrader``'s original author stopped
active development and it survives on community forks; ``zipline-reloaded`` is
maintained but is built around US-equity data bundles and a single-currency
ledger; the open-source ``vectorbt`` is vectorised in a way that makes
path-dependent stop-loss logic awkward.

The account this system targets is a Swiss cash account holding ETFs quoted in
CHF, GBP and USD. None of the three handles multi-currency ledgers or cash-
account settlement without significant adaptation, and all three would need the
strategies rewritten into their APIs - which would mean the backtested code and
the live code were no longer the same code.

So this engine is deliberately small and explicit, and it calls the *same*
``Strategy.generate`` and ``size_position`` functions the live cycle calls.
What it gives up is the ecosystem; what it buys is that a passing backtest is a
test of the code that actually trades. Its own correctness is covered by
``tests/test_backtest_engine.py``, including a test that a zero-cost run beats
a realistic-cost run and one that the engine cannot see future bars.

Fill model
----------
Signals are generated from data up to and including bar *t*, and orders fill at
bar *t+1*'s open, adjusted for half-spread and slippage. Filling at bar *t*'s
close - which several naive backtests do - would let the strategy trade on a
price it could not have known.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

from ..config.settings import Config
from ..core.sizing import size_position
from ..data_layer.synthetic import SYNTHETIC_MARKER
from ..signal_layer.indicators import realised_volatility
from ..signal_layer.signals import Signal, SignalAction
from ..signal_layer.strategies import Strategy

logger = logging.getLogger(__name__)

TRADING_DAYS = 252


@dataclass(frozen=True)
class Fill:
    timestamp: pd.Timestamp
    symbol: str
    side: str
    quantity: float
    price: float
    commission: float
    slippage_cost: float
    strategy: str
    reason: str

    @property
    def gross_value(self) -> float:
        return self.quantity * self.price

    @property
    def total_cost(self) -> float:
        return self.commission + self.slippage_cost


@dataclass
class _Holding:
    quantity: float
    cost_basis: float
    stop_price: float | None
    strategy: str
    entry_date: pd.Timestamp

    @property
    def avg_price(self) -> float:
        return self.cost_basis / self.quantity if self.quantity else 0.0


@dataclass(frozen=True)
class RoundTrip:
    symbol: str
    strategy: str
    entry_date: pd.Timestamp
    exit_date: pd.Timestamp
    quantity: float
    entry_price: float
    exit_price: float
    pnl: float
    costs: float
    exit_reason: str

    @property
    def return_pct(self) -> float:
        basis = self.entry_price * self.quantity
        return self.pnl / basis if basis else 0.0

    @property
    def is_win(self) -> bool:
        return self.pnl > 0


@dataclass(frozen=True)
class BacktestReport:
    equity_curve: pd.Series
    benchmark_curve: pd.Series | None
    fills: tuple[Fill, ...]
    round_trips: tuple[RoundTrip, ...]
    initial_capital: float
    config_checksum: str
    strategies: tuple[str, ...]
    data_is_synthetic: bool
    start: pd.Timestamp
    end: pd.Timestamp
    total_costs: float

    # -- metrics ---------------------------------------------------------

    @property
    def years(self) -> float:
        days = (self.end - self.start).days
        return max(days / 365.25, 1e-9)

    @property
    def final_equity(self) -> float:
        return float(self.equity_curve.iloc[-1]) if len(self.equity_curve) else self.initial_capital

    @property
    def total_return(self) -> float:
        return self.final_equity / self.initial_capital - 1.0

    @property
    def cagr(self) -> float:
        if self.initial_capital <= 0 or self.final_equity <= 0:
            return float("nan")
        return (self.final_equity / self.initial_capital) ** (1 / self.years) - 1.0

    @property
    def daily_returns(self) -> pd.Series:
        return self.equity_curve.pct_change().dropna()

    @property
    def volatility(self) -> float:
        returns = self.daily_returns
        return float(returns.std(ddof=1) * np.sqrt(TRADING_DAYS)) if len(returns) > 1 else 0.0

    @property
    def sharpe(self) -> float:
        returns = self.daily_returns
        if len(returns) < 2 or returns.std(ddof=1) == 0:
            return float("nan")
        return float(returns.mean() / returns.std(ddof=1) * np.sqrt(TRADING_DAYS))

    @property
    def sortino(self) -> float:
        returns = self.daily_returns
        downside = returns[returns < 0]
        if len(returns) < 2 or downside.empty or downside.std(ddof=1) == 0:
            return float("nan")
        return float(returns.mean() / downside.std(ddof=1) * np.sqrt(TRADING_DAYS))

    @property
    def max_drawdown(self) -> float:
        if self.equity_curve.empty:
            return 0.0
        peak = self.equity_curve.cummax()
        return float(((peak - self.equity_curve) / peak).max())

    @property
    def win_rate(self) -> float:
        if not self.round_trips:
            return float("nan")
        return sum(1 for t in self.round_trips if t.is_win) / len(self.round_trips)

    @property
    def profit_factor(self) -> float:
        gains = sum(t.pnl for t in self.round_trips if t.pnl > 0)
        losses = -sum(t.pnl for t in self.round_trips if t.pnl < 0)
        if losses == 0:
            return float("inf") if gains > 0 else float("nan")
        return gains / losses

    # -- benchmark comparison ---------------------------------------------

    @property
    def benchmark_total_return(self) -> float | None:
        if self.benchmark_curve is None or self.benchmark_curve.empty:
            return None
        return float(self.benchmark_curve.iloc[-1] / self.benchmark_curve.iloc[0] - 1.0)

    @property
    def benchmark_cagr(self) -> float | None:
        total = self.benchmark_total_return
        if total is None:
            return None
        return (1 + total) ** (1 / self.years) - 1.0

    @property
    def benchmark_max_drawdown(self) -> float | None:
        if self.benchmark_curve is None or self.benchmark_curve.empty:
            return None
        peak = self.benchmark_curve.cummax()
        return float(((peak - self.benchmark_curve) / peak).max())

    @property
    def excess_cagr(self) -> float | None:
        bench = self.benchmark_cagr
        return None if bench is None else self.cagr - bench

    @property
    def beats_benchmark(self) -> bool | None:
        excess = self.excess_cagr
        return None if excess is None else excess > 0

    def summary(self) -> dict:
        return {
            "start": str(self.start.date()),
            "end": str(self.end.date()),
            "years": round(self.years, 2),
            "strategies": list(self.strategies),
            "initial_capital": self.initial_capital,
            "final_equity": round(self.final_equity, 2),
            "total_return": self.total_return,
            "cagr": self.cagr,
            "volatility": self.volatility,
            "sharpe": self.sharpe,
            "sortino": self.sortino,
            "max_drawdown": self.max_drawdown,
            "win_rate": self.win_rate,
            "profit_factor": self.profit_factor,
            "round_trips": len(self.round_trips),
            "fills": len(self.fills),
            "total_costs": round(self.total_costs, 2),
            "benchmark_cagr": self.benchmark_cagr,
            "benchmark_max_drawdown": self.benchmark_max_drawdown,
            "excess_cagr": self.excess_cagr,
            "beats_benchmark": self.beats_benchmark,
            "data_is_synthetic": self.data_is_synthetic,
            "config_checksum": self.config_checksum,
        }

    def render(self) -> str:
        s = self.summary()

        def pct(value) -> str:
            return "n/a" if value is None or (isinstance(value, float) and math.isnan(value)) else f"{value:>8.2%}"

        def num(value) -> str:
            return "n/a" if value is None or (isinstance(value, float) and math.isnan(value)) else f"{value:>8.2f}"

        lines = [
            "=" * 68,
            "BACKTEST REPORT",
            "=" * 68,
            f"Period            : {s['start']} to {s['end']}  ({s['years']} years)",
            f"Strategies        : {', '.join(s['strategies'])}",
            f"Initial capital   : {s['initial_capital']:>12,.2f}",
            f"Final equity      : {s['final_equity']:>12,.2f}",
            "-" * 68,
            f"Total return      : {pct(s['total_return'])}",
            f"CAGR              : {pct(s['cagr'])}",
            f"Volatility (ann.) : {pct(s['volatility'])}",
            f"Sharpe            : {num(s['sharpe'])}",
            f"Sortino           : {num(s['sortino'])}",
            f"Max drawdown      : {pct(s['max_drawdown'])}",
            f"Win rate          : {pct(s['win_rate'])}  ({s['round_trips']} round trips)",
            f"Profit factor     : {num(s['profit_factor'])}",
            f"Total costs paid  : {s['total_costs']:>12,.2f}",
            "-" * 68,
            "BENCHMARK (buy and hold)",
            f"Benchmark CAGR    : {pct(s['benchmark_cagr'])}",
            f"Benchmark max DD  : {pct(s['benchmark_max_drawdown'])}",
            f"Excess CAGR       : {pct(s['excess_cagr'])}",
            f"Beats benchmark   : {s['beats_benchmark']}",
            "=" * 68,
        ]
        if self.data_is_synthetic:
            lines += [
                "",
                "*** SYNTHETIC DATA - NOT A VALID RESULT ***",
                "This run used generated price series. It demonstrates that the",
                "engine works; it says nothing whatsoever about whether these",
                "strategies make money. Re-run against real vendor history",
                "covering at least one bear market before reviewing.",
                "",
            ]
        return "\n".join(lines)


class BacktestEngine:
    """Simulates the live cycle bar by bar, with costs and no lookahead."""

    def __init__(
        self,
        config: Config,
        strategies: Sequence[Strategy],
        *,
        initial_capital: float | None = None,
        benchmark_symbol: str | None = None,
        warmup_bars: int | None = None,
    ) -> None:
        if not strategies:
            raise ValueError("A backtest needs at least one strategy")
        self.config = config
        self.strategies = list(strategies)
        self.initial_capital = (
            initial_capital
            if initial_capital is not None
            else config.account.starting_equity
        )
        self.benchmark_symbol = benchmark_symbol
        self.costs = config.costs
        self.portfolio = config.portfolio
        self.warmup_bars = warmup_bars or max(s.min_history() for s in strategies) + 5

    # -- costs -----------------------------------------------------------

    def _fill_price(self, raw_price: float, *, is_buy: bool) -> tuple[float, float]:
        """Apply half-spread and slippage. Returns (fill price, cost per share)."""
        adverse_bps = self.costs.half_spread_bps + self.costs.slippage_bps
        adjustment = raw_price * (adverse_bps / 10_000.0)
        fill = raw_price + adjustment if is_buy else raw_price - adjustment
        return max(fill, 0.01), abs(adjustment)

    def _commission(self, quantity: float, price: float) -> float:
        value = quantity * price
        return max(value * (self.costs.commission_bps / 10_000.0), self.costs.min_commission)

    # -- main loop --------------------------------------------------------

    def run(
        self,
        history: Mapping[str, pd.DataFrame],
        *,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> BacktestReport:
        if not history:
            raise ValueError("No price history supplied to the backtest")

        tradeable = {
            s: f for s, f in history.items() if s != self.benchmark_symbol
        }
        if not tradeable:
            raise ValueError("No tradeable symbols left after excluding the benchmark")

        calendar = sorted({stamp for frame in history.values() for stamp in frame.index})
        calendar = [
            d
            for d in calendar
            if (start is None or d >= pd.Timestamp(start))
            and (end is None or d <= pd.Timestamp(end))
        ]
        if len(calendar) <= self.warmup_bars + 1:
            raise ValueError(
                f"Need more than {self.warmup_bars + 1} bars to run; got {len(calendar)}. "
                "Extend the history or reduce the strategy lookbacks."
            )

        cash = self.initial_capital
        holdings: dict[str, _Holding] = {}
        fills: list[Fill] = []
        round_trips: list[RoundTrip] = []
        equity_points: list[tuple[pd.Timestamp, float]] = []
        pending: list[tuple[str, str, float, float | None, str, str]] = []
        total_costs = 0.0

        rebalance_weekly = self.portfolio.rebalance_frequency == "weekly"

        for index in range(self.warmup_bars, len(calendar)):
            today = calendar[index]

            # 1. Execute orders decided on the previous bar, at today's open.
            for symbol, side, quantity, stop, strategy_name, reason in pending:
                frame = tradeable.get(symbol)
                if frame is None or today not in frame.index:
                    continue
                open_price = float(frame.loc[today, "open"])
                is_buy = side == "BUY"
                price, per_share_cost = self._fill_price(open_price, is_buy=is_buy)

                if is_buy:
                    commission = self._commission(quantity, price)
                    cost = quantity * price + commission
                    if cost > cash:
                        affordable = math.floor((cash - commission) / price) if price > 0 else 0
                        if affordable <= 0:
                            continue
                        quantity = float(affordable)
                        commission = self._commission(quantity, price)
                        cost = quantity * price + commission
                    cash -= cost
                    total_costs += commission + per_share_cost * quantity
                    existing = holdings.get(symbol)
                    if existing:
                        existing.quantity += quantity
                        existing.cost_basis += quantity * price
                        existing.stop_price = stop or existing.stop_price
                    else:
                        holdings[symbol] = _Holding(
                            quantity=quantity,
                            cost_basis=quantity * price,
                            stop_price=stop,
                            strategy=strategy_name,
                            entry_date=today,
                        )
                else:
                    holding = holdings.get(symbol)
                    if not holding:
                        continue
                    quantity = min(quantity, holding.quantity)
                    if quantity <= 0:
                        continue
                    commission = self._commission(quantity, price)
                    proceeds = quantity * price - commission
                    cash += proceeds
                    total_costs += commission + per_share_cost * quantity
                    entry_price = holding.avg_price
                    pnl = quantity * (price - entry_price) - commission
                    round_trips.append(
                        RoundTrip(
                            symbol=symbol,
                            strategy=holding.strategy,
                            entry_date=holding.entry_date,
                            exit_date=today,
                            quantity=quantity,
                            entry_price=entry_price,
                            exit_price=price,
                            pnl=pnl,
                            costs=commission,
                            exit_reason=reason,
                        )
                    )
                    holding.quantity -= quantity
                    holding.cost_basis -= quantity * entry_price
                    if holding.quantity <= 1e-9:
                        holdings.pop(symbol, None)

                fills.append(
                    Fill(
                        timestamp=today,
                        symbol=symbol,
                        side=side,
                        quantity=quantity,
                        price=price,
                        commission=commission,
                        slippage_cost=per_share_cost * quantity,
                        strategy=strategy_name,
                        reason=reason,
                    )
                )
            pending = []

            # 2. Mark to market.
            equity = cash
            for symbol, holding in holdings.items():
                frame = tradeable.get(symbol)
                if frame is None:
                    continue
                window = frame.loc[frame.index <= today]
                if window.empty:
                    continue
                equity += holding.quantity * float(window["close"].iloc[-1])
            equity_points.append((today, equity))

            # 3. Stop losses, checked against today's low.
            for symbol, holding in list(holdings.items()):
                if holding.stop_price is None:
                    continue
                frame = tradeable.get(symbol)
                if frame is None or today not in frame.index:
                    continue
                if float(frame.loc[today, "low"]) <= holding.stop_price:
                    pending.append(
                        (symbol, "SELL", holding.quantity, None, holding.strategy, "stop_loss")
                    )

            stopped = {p[0] for p in pending}

            # 4. Generate signals from data up to and including today.
            is_rebalance_day = (not rebalance_weekly) or today.weekday() == 0
            if not is_rebalance_day:
                continue

            visible = {
                symbol: frame.loc[frame.index <= today]
                for symbol, frame in tradeable.items()
            }
            visible = {s: f for s, f in visible.items() if len(f)}

            signals: list[Signal] = []
            for strategy in self.strategies:
                signals.extend(strategy.generate(visible, as_of=today.to_pydatetime()))

            # 5. Exits first, so capital is freed before entries are sized.
            exit_symbols = {
                s.symbol for s in signals if s.action is SignalAction.EXIT_LONG
            }
            for symbol in sorted(exit_symbols & set(holdings) - stopped):
                holding = holdings[symbol]
                pending.append(
                    (symbol, "SELL", holding.quantity, None, holding.strategy, "signal_exit")
                )

            leaving = {p[0] for p in pending}
            open_after_exits = len(holdings) - len(leaving & set(holdings))
            slots = self.portfolio.max_open_positions - open_after_exits
            if slots <= 0:
                continue

            # 6. Entries, strongest first, one position per symbol.
            entries = [
                s
                for s in signals
                if s.action is SignalAction.ENTER_LONG
                and s.symbol not in holdings
                and s.symbol not in leaving
            ]
            entries.sort(key=lambda s: s.strength, reverse=True)

            for signal in entries[:slots]:
                frame = visible.get(signal.symbol)
                if frame is None or len(frame) < 25:
                    continue
                vol = realised_volatility(frame["close"], 20).dropna()
                sized = size_position(
                    price=signal.reference_price,
                    fx_rate_to_base=1.0,
                    equity=equity,
                    sleeve_pct=self.portfolio.sleeve_pct_of_equity,
                    max_positions=self.portfolio.max_open_positions,
                    max_position_pct=self.config.risk.max_position_pct,
                    target_volatility=self.portfolio.target_position_volatility,
                    realised_volatility=float(vol.iloc[-1]) if len(vol) else None,
                )
                if not sized.is_tradeable:
                    continue
                if sized.notional_base > cash:
                    continue
                pending.append(
                    (
                        signal.symbol,
                        "BUY",
                        sized.quantity,
                        signal.stop_price,
                        signal.strategy,
                        "signal_entry",
                    )
                )

        equity_curve = pd.Series(
            [value for _, value in equity_points],
            index=pd.DatetimeIndex([stamp for stamp, _ in equity_points]),
            name="equity",
        )

        benchmark_curve = self._benchmark_curve(history, equity_curve.index)
        synthetic = any(
            frame.attrs.get(SYNTHETIC_MARKER, False) for frame in history.values()
        )

        return BacktestReport(
            equity_curve=equity_curve,
            benchmark_curve=benchmark_curve,
            fills=tuple(fills),
            round_trips=tuple(round_trips),
            initial_capital=self.initial_capital,
            config_checksum=self.config.checksum,
            strategies=tuple(s.name for s in self.strategies),
            data_is_synthetic=synthetic,
            start=equity_curve.index[0],
            end=equity_curve.index[-1],
            total_costs=total_costs,
        )

    def _benchmark_curve(
        self, history: Mapping[str, pd.DataFrame], index: pd.DatetimeIndex
    ) -> pd.Series | None:
        """Buy and hold the benchmark, scaled to the same starting capital."""
        if not self.benchmark_symbol or self.benchmark_symbol not in history:
            return None
        closes = history[self.benchmark_symbol]["close"].reindex(index).ffill().dropna()
        if closes.empty:
            return None
        shares = self.initial_capital / float(closes.iloc[0])
        return (closes * shares).rename("benchmark")
