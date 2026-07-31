"""Strategy logic: pure functions from price history to signals.

This layer must never import ``risk_gate``, ``approval_layer``,
``execution_layer`` or ``config.mode``. It has no idea whether the process is
connected to a paper account, a live account, or nothing at all - which is
precisely why it cannot be made to bypass a limit or send an order.
"""

from .indicators import (
    atr,
    average_dollar_volume,
    realised_volatility,
    rolling_high,
    rolling_low,
    sma,
    total_return,
    validate_ohlcv,
    zscore,
)
from .signals import Signal, SignalAction
from .strategies import (
    BreakoutStrategy,
    MeanReversionStrategy,
    MomentumStrategy,
    Strategy,
    build_enabled_strategies,
    build_strategy,
)

__all__ = [
    "BreakoutStrategy",
    "MeanReversionStrategy",
    "MomentumStrategy",
    "Signal",
    "SignalAction",
    "Strategy",
    "atr",
    "average_dollar_volume",
    "build_enabled_strategies",
    "build_strategy",
    "realised_volatility",
    "rolling_high",
    "rolling_low",
    "sma",
    "total_return",
    "validate_ohlcv",
    "zscore",
]


def _mode_probe_for_tests():
    """Indirection used by ``test_config_and_mode`` - see ``_forbidden_probe``."""
    from ._forbidden_probe import probe_trading_mode

    return probe_trading_mode()
