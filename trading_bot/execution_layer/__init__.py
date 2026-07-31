"""IBKR order placement and order-state tracking.

Built last, on purpose: the brief asks for risk and backtesting to be in place
before anything can trade. Nothing here decides *whether* to trade - it only
carries out an order that the risk gate cleared and a human approved.
"""

from .broker import BrokerClient, BrokerError, IBKRBroker, OrderAck
from .executor import (
    IBKRExecutor,
    PositionDrift,
    ReconciliationReport,
    TrackedOrder,
)
from .fake_broker import FakeBroker

__all__ = [
    "BrokerClient",
    "BrokerError",
    "FakeBroker",
    "IBKRBroker",
    "IBKRExecutor",
    "OrderAck",
    "PositionDrift",
    "ReconciliationReport",
    "TrackedOrder",
]
