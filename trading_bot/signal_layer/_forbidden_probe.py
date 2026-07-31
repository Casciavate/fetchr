"""Test-only probe proving strategy code cannot switch the system live.

This module exists solely so a test can call ``resolve_trading_mode`` from a
file that genuinely lives inside ``signal_layer`` and observe the call being
refused. It is never imported by any strategy, by the proposal cycle, or by
anything on the execution path.

``tests/test_layer_isolation.py`` allows this one module as a documented
exception to the "signal_layer must not import config.mode" rule, and asserts
that no other module in the package imports it.
"""

from __future__ import annotations

from ..config.mode import TradingMode, resolve_trading_mode


def probe_trading_mode() -> TradingMode:
    """Attempt to resolve the trading mode from inside signal_layer.

    Always raises ``ForbiddenCallerError``. If this function ever returns, the
    guard in ``config.mode`` has regressed.
    """
    return resolve_trading_mode()
