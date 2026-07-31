"""Systematic, risk-managed trading system for Interactive Brokers.

Layering (imports flow downward only):

    config  ->  core  ->  data_layer  ->  signal_layer  ->  backtest_engine
                                   \\
                                    ->  risk_gate  ->  approval_layer  ->  execution_layer

Two invariants are enforced by tests rather than convention:

* ``signal_layer`` never imports ``risk_gate``, ``execution_layer``,
  ``approval_layer`` or the live-mode switch.
* ``execution_layer`` cannot transmit an order without both a ``RiskClearance``
  from ``risk_gate`` and an ``ApprovalToken`` from ``approval_layer``.
"""

__version__ = "0.1.0"
