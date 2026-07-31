"""Real-time alerting on the events that need a human immediately.

Alert kinds, matching ``monitoring.alerts.alert_on`` in config:

    circuit_breaker   a loss or drawdown breaker latched
    kill_switch       the kill switch was activated
    connection_loss   the IBKR connection dropped
    order_rejected    the broker or the approval layer refused an order
    risk_block        the risk gate blocked a proposal, or reconciliation drifted

The console channel is the default because it needs no credentials and cannot
leak anything. Slack is opt-in and reads its webhook from the environment - the
URL is a secret and must never be committed to the config file.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

SLACK_WEBHOOK_ENV = "SLACK_WEBHOOK_URL"


@dataclass(frozen=True)
class Alert:
    kind: str
    message: str
    at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def render(self) -> str:
        return f"[{self.at.isoformat()}] {self.kind.upper()}: {self.message}"


class Alerter(ABC):
    """Base class handling the 'which events do we care about' filter."""

    def __init__(self, alert_on: list[str] | None = None) -> None:
        self.alert_on = set(alert_on or [])
        self.sent: list[Alert] = []

    def send(self, kind: str, message: str) -> Alert | None:
        if self.alert_on and kind not in self.alert_on:
            logger.debug("Suppressing %s alert (not in alert_on): %s", kind, message)
            return None
        alert = Alert(kind=kind, message=message)
        self.sent.append(alert)
        try:
            self._deliver(alert)
        except Exception as exc:  # noqa: BLE001
            # A failed alert must never take down the trading process; the
            # journal and the console still have the event.
            logger.error("Alert delivery failed (%s): %s", type(exc).__name__, exc)
        return alert

    @abstractmethod
    def _deliver(self, alert: Alert) -> None: ...


class ConsoleAlerter(Alerter):
    """Writes alerts to the log at WARNING. Safe default, no credentials."""

    def _deliver(self, alert: Alert) -> None:
        logger.warning("ALERT %s", alert.render())
        print(f"\n!!! {alert.render()}\n", flush=True)


class SlackAlerter(Alerter):
    """Posts to a Slack incoming webhook read from the environment."""

    def __init__(self, alert_on: list[str] | None = None, *, webhook_url: str | None = None) -> None:
        super().__init__(alert_on)
        self.webhook_url = webhook_url or os.environ.get(SLACK_WEBHOOK_ENV, "")
        if not self.webhook_url:
            raise ValueError(
                f"Slack alerting is configured but {SLACK_WEBHOOK_ENV} is not set. "
                "Export the webhook URL; do not put it in the config file."
            )

    def _deliver(self, alert: Alert) -> None:
        payload = json.dumps({"text": alert.render()}).encode("utf-8")
        request = urllib.request.Request(
            self.webhook_url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 300:
                raise RuntimeError(f"Slack returned HTTP {response.status}")


class NullAlerter(Alerter):
    """Records alerts without delivering them. Used in tests."""

    def _deliver(self, alert: Alert) -> None:
        return None


def build_alerter(config) -> Alerter:
    channel = config.monitoring.alerts.channel.lower()
    alert_on = list(config.monitoring.alerts.alert_on)
    if channel == "slack":
        return SlackAlerter(alert_on)
    if channel == "none":
        return NullAlerter(alert_on)
    if channel != "console":
        logger.warning("Unknown alert channel %r; falling back to console", channel)
    return ConsoleAlerter(alert_on)
