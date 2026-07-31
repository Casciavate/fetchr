"""Typed configuration loading, validation, and change auditing.

Every tunable parameter in the system is loaded through here. Two properties
matter:

* **Validation happens at load time.** A nonsensical risk limit (negative,
  >100%, leverage above 1 on a cash account) fails loudly at startup rather
  than silently permitting a bad trade later.
* **Changes are audited.** Each load hashes the resolved config and appends a
  timestamped, field-level diff to ``state/config_audit.log`` when it differs
  from the previous load. Risk limits should not change without a trace.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import MISSING, dataclass, field, fields, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import yaml

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = PACKAGE_ROOT / "config" / "default_config.yaml"
CONFIG_AUDIT_LOG = PACKAGE_ROOT / "state" / "config_audit.log"


class ConfigError(ValueError):
    """Raised when configuration is missing, malformed, or unsafe."""


# --------------------------------------------------------------------------
# Section dataclasses
# --------------------------------------------------------------------------


def _build(cls: type, data: Mapping[str, Any], section: str):
    """Instantiate a dataclass from a mapping, rejecting unknown keys.

    Unknown keys are an error rather than a warning: a typo in a risk limit
    (``max_position_pc``) would otherwise silently leave the real limit at its
    default while the operator believes they tightened it.
    """
    known = {f.name for f in fields(cls)}
    unknown = set(data) - known
    if unknown:
        raise ConfigError(
            f"Unknown key(s) in [{section}]: {sorted(unknown)}. "
            f"Valid keys: {sorted(known)}"
        )
    missing = {
        f.name
        for f in fields(cls)
        if f.default is MISSING and f.default_factory is MISSING
    } - set(data)
    if missing:
        raise ConfigError(f"Missing required key(s) in [{section}]: {sorted(missing)}")
    return cls(**data)


@dataclass(frozen=True)
class AccountConfig:
    base_currency: str
    account_type: str
    permissioned_asset_classes: list[str]
    starting_equity: float
    starting_cash: float
    pdt_rules_apply: bool
    pdt_equity_threshold: float
    enforce_settled_cash_only: bool
    fx_rates: dict[str, float]

    def validate(self) -> None:
        if self.account_type not in {"cash", "margin"}:
            raise ConfigError("account.account_type must be 'cash' or 'margin'")
        base = self.base_currency.upper()
        rates = {k.upper(): v for k, v in self.fx_rates.items()}
        if rates.get(base) != 1.0:
            raise ConfigError(
                f"account.fx_rates must map the base currency {base} to exactly 1.0"
            )
        for currency, rate in rates.items():
            if not isinstance(rate, (int, float)) or isinstance(rate, bool) or rate <= 0:
                raise ConfigError(
                    f"account.fx_rates[{currency}] must be a positive number, got {rate!r}"
                )
        if not self.permissioned_asset_classes:
            raise ConfigError(
                "account.permissioned_asset_classes is empty - the risk gate "
                "would reject every order."
            )
        if self.starting_equity <= 0:
            raise ConfigError("account.starting_equity must be positive")


@dataclass(frozen=True)
class RiskConfig:
    max_position_pct: float
    max_sector_pct: float
    max_order_notional_pct: float
    min_order_notional: float
    max_gross_exposure_pct: float
    max_leverage: float
    max_daily_loss_pct: float
    daily_loss_action: str
    max_drawdown_pct: float
    max_orders_per_minute: int
    max_orders_per_hour: int
    max_orders_per_day: int
    kill_switch_file: str
    halt_state_file: str
    rate_limit_state_file: str
    equity_peak_file: str

    def validate(self, account: AccountConfig) -> None:
        fractions = {
            "max_position_pct": self.max_position_pct,
            "max_sector_pct": self.max_sector_pct,
            "max_order_notional_pct": self.max_order_notional_pct,
            "max_daily_loss_pct": self.max_daily_loss_pct,
            "max_drawdown_pct": self.max_drawdown_pct,
        }
        for name, value in fractions.items():
            if not 0 < value <= 1:
                raise ConfigError(
                    f"risk.{name} must be a fraction in (0, 1]; got {value!r}. "
                    "Percentages are expressed as 0.05, not 5."
                )
        if self.max_gross_exposure_pct <= 0:
            raise ConfigError("risk.max_gross_exposure_pct must be positive")
        if self.max_leverage < 1:
            raise ConfigError("risk.max_leverage must be >= 1.0 (1.0 means no leverage)")
        if account.account_type == "cash" and self.max_leverage > 1.0:
            raise ConfigError(
                "risk.max_leverage > 1.0 is invalid for a cash account. "
                "Cash accounts cannot borrow; leave max_leverage at 1.0."
            )
        if self.max_position_pct > self.max_sector_pct:
            raise ConfigError(
                "risk.max_position_pct exceeds risk.max_sector_pct - the sector "
                "cap would be unreachable and therefore meaningless."
            )
        if self.daily_loss_action not in {"halt", "flatten"}:
            raise ConfigError("risk.daily_loss_action must be 'halt' or 'flatten'")
        if self.max_daily_loss_pct >= self.max_drawdown_pct:
            raise ConfigError(
                "risk.max_daily_loss_pct should be tighter than "
                "risk.max_drawdown_pct; otherwise the drawdown breaker can "
                "never trip first."
            )
        rates = (
            self.max_orders_per_minute,
            self.max_orders_per_hour,
            self.max_orders_per_day,
        )
        if any(r <= 0 for r in rates):
            raise ConfigError("risk.max_orders_per_* must all be positive")
        if not (
            self.max_orders_per_minute <= self.max_orders_per_hour <= self.max_orders_per_day
        ):
            raise ConfigError(
                "risk order-rate caps must be non-decreasing: "
                "per_minute <= per_hour <= per_day"
            )
        if self.min_order_notional < 0:
            raise ConfigError("risk.min_order_notional must be >= 0")


@dataclass(frozen=True)
class UniverseConfig:
    min_avg_daily_dollar_volume: float
    avg_dollar_volume_lookback_days: int
    min_price: float
    min_history_days: int
    max_spread_bps: float
    allowed_asset_classes: list[str]
    allowed_exchanges: list[str]
    allowed_currencies: list[str]
    exclude_symbols: list[str]
    candidates: list[str]
    instruments: dict[str, dict]
    core_holdings: list[str]
    trade_core_holdings: bool

    def validate(self) -> None:
        if self.min_avg_daily_dollar_volume < 0:
            raise ConfigError("universe.min_avg_daily_dollar_volume must be >= 0")
        if self.avg_dollar_volume_lookback_days < 1:
            raise ConfigError("universe.avg_dollar_volume_lookback_days must be >= 1")
        if self.min_history_days < 1:
            raise ConfigError("universe.min_history_days must be >= 1")


@dataclass(frozen=True)
class PortfolioConfig:
    sleeve_pct_of_equity: float
    max_open_positions: int
    target_position_volatility: float
    rebalance_frequency: str

    def validate(self) -> None:
        if not 0 < self.sleeve_pct_of_equity <= 1:
            raise ConfigError("portfolio.sleeve_pct_of_equity must be in (0, 1]")
        if self.max_open_positions < 1:
            raise ConfigError("portfolio.max_open_positions must be >= 1")
        if self.rebalance_frequency not in {"daily", "weekly"}:
            raise ConfigError("portfolio.rebalance_frequency must be 'daily' or 'weekly'")


@dataclass(frozen=True)
class CostsConfig:
    commission_bps: float
    min_commission: float
    slippage_bps: float
    half_spread_bps: float

    def validate(self) -> None:
        values = (
            self.commission_bps,
            self.min_commission,
            self.slippage_bps,
            self.half_spread_bps,
        )
        if any(v < 0 for v in values):
            raise ConfigError("costs.* must all be >= 0")
        if self.commission_bps == 0 and self.slippage_bps == 0:
            raise ConfigError(
                "Zero commissions and zero slippage produce a fantasy backtest. "
                "Set realistic costs before trusting any result."
            )


@dataclass(frozen=True)
class ConnectionConfig:
    host: str
    paper_port: int
    live_port: int
    gateway_paper_port: int
    gateway_live_port: int
    use_gateway: bool
    client_id: int
    connect_timeout_seconds: int
    readonly_probe_on_connect: bool


@dataclass(frozen=True)
class ExecutionConfig:
    connection: ConnectionConfig
    default_order_type: str
    allow_market_orders: bool
    max_slippage_bps: float
    limit_offset_bps: float
    time_in_force: str
    outside_rth: bool
    reconcile_every_cycle: bool
    max_position_drift_tolerance: float

    def validate(self) -> None:
        # YAML 1.1 parses `1e-6` as a string, which would make the drift
        # comparison raise at reconciliation time instead of here.
        if isinstance(self.max_position_drift_tolerance, bool) or not isinstance(
            self.max_position_drift_tolerance, (int, float)
        ):
            raise ConfigError(
                "execution.max_position_drift_tolerance must be a number; got "
                f"{self.max_position_drift_tolerance!r}. Write exponents with an "
                "explicit decimal point (1.0e-6, not 1e-6)."
            )
        if self.max_position_drift_tolerance < 0:
            raise ConfigError("execution.max_position_drift_tolerance must be >= 0")
        if self.default_order_type not in {"LMT", "MKT"}:
            raise ConfigError("execution.default_order_type must be 'LMT' or 'MKT'")
        if self.default_order_type == "MKT" and not self.allow_market_orders:
            raise ConfigError(
                "execution.default_order_type is MKT but allow_market_orders is false"
            )
        if self.max_slippage_bps <= 0:
            raise ConfigError("execution.max_slippage_bps must be positive")
        ports = {
            self.connection.paper_port,
            self.connection.live_port,
            self.connection.gateway_paper_port,
            self.connection.gateway_live_port,
        }
        if len(ports) != 4:
            raise ConfigError(
                "execution.connection paper/live ports must all differ - a "
                "collision risks routing paper orders to the live account."
            )


@dataclass(frozen=True)
class ApprovalConfig:
    proposal_ttl_minutes: int
    token_ttl_minutes: int
    approval_store: str
    require_per_order_approval: bool

    def validate(self) -> None:
        if self.proposal_ttl_minutes <= 0 or self.token_ttl_minutes <= 0:
            raise ConfigError("approval TTLs must be positive")


@dataclass(frozen=True)
class AlertConfig:
    channel: str
    alert_on: list[str]


@dataclass(frozen=True)
class MonitoringConfig:
    log_dir: str
    structured_log_file: str
    daily_summary_file: str
    log_level: str
    alerts: AlertConfig


@dataclass(frozen=True)
class StrategyConfig:
    name: str
    enabled: bool
    weight: float
    params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Config:
    account: AccountConfig
    risk: RiskConfig
    universe: UniverseConfig
    portfolio: PortfolioConfig
    costs: CostsConfig
    execution: ExecutionConfig
    approval: ApprovalConfig
    monitoring: MonitoringConfig
    strategies: dict[str, StrategyConfig]
    source_path: Path
    checksum: str

    def enabled_strategies(self) -> dict[str, StrategyConfig]:
        return {n: s for n, s in self.strategies.items() if s.enabled}

    def path_for(self, relative: str) -> Path:
        """Resolve a config-declared relative path against the package root."""
        p = Path(relative)
        return p if p.is_absolute() else PACKAGE_ROOT / p

    def fx_rate(self, currency: str) -> float:
        """FX rate into the base currency. Raises rather than guessing."""
        rates = {k.upper(): float(v) for k, v in self.account.fx_rates.items()}
        key = currency.upper()
        if key not in rates:
            raise ConfigError(
                f"No FX rate configured for {key}->{self.account.base_currency}. "
                "Add it under account.fx_rates; the system will not assume 1.0."
            )
        return rates[key]

    def instrument_for(self, symbol: str):
        """Build an ``Instrument`` from ``universe.instruments`` metadata."""
        from ..core.types import Instrument

        meta = self.universe.instruments.get(symbol)
        if meta is None:
            raise ConfigError(
                f"No contract metadata for {symbol!r}. Add it under "
                "universe.instruments with at least an exchange and a currency; "
                "trading a symbol whose venue and currency are unknown is unsafe."
            )
        missing = [k for k in ("exchange", "currency") if not meta.get(k)]
        if missing:
            raise ConfigError(
                f"universe.instruments[{symbol}] is missing {missing}"
            )
        return Instrument(
            symbol=symbol,
            exchange=str(meta["exchange"]),
            currency=str(meta["currency"]).upper(),
            asset_class=str(meta.get("asset_class", "STK")),
            sector=str(meta.get("sector", "UNKNOWN")),
            contract_id=meta.get("contract_id"),
        )

    def sector_map(self) -> dict[str, str]:
        return {
            symbol: str(meta.get("sector", "UNKNOWN"))
            for symbol, meta in self.universe.instruments.items()
        }

    def validate(self) -> None:
        self.account.validate()
        self.risk.validate(self.account)
        self.universe.validate()
        self.portfolio.validate()
        self.costs.validate()
        self.execution.validate()
        self.approval.validate()
        if not self.enabled_strategies():
            raise ConfigError("No strategies are enabled - the system would do nothing.")
        for name, strat in self.strategies.items():
            if strat.enabled and strat.weight <= 0:
                raise ConfigError(f"strategies.{name}.weight must be > 0 when enabled")


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------


def _flatten(obj: Any, prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    if is_dataclass(obj) and not isinstance(obj, type):
        obj = {f.name: getattr(obj, f.name) for f in fields(obj)}
    if isinstance(obj, Mapping):
        for key, value in obj.items():
            out.update(_flatten(value, f"{prefix}.{key}" if prefix else str(key)))
    elif isinstance(obj, (list, tuple)):
        out[prefix] = json.dumps(list(obj), default=str)
    else:
        out[prefix] = obj
    return out


def _checksum(raw: Mapping[str, Any]) -> str:
    canonical = json.dumps(raw, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _audit(raw: Mapping[str, Any], checksum: str, path: Path) -> None:
    """Append a field-level diff to the audit log when the config changes."""
    CONFIG_AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)

    previous: dict[str, Any] | None = None
    if CONFIG_AUDIT_LOG.exists():
        for line in reversed(CONFIG_AUDIT_LOG.read_text(encoding="utf-8").splitlines()):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("checksum") == checksum:
                return  # Unchanged since the last recorded load.
            previous = entry.get("snapshot")
            break

    flat_new = _flatten(raw)
    diff: dict[str, Any] = {}
    if previous is not None:
        flat_old = _flatten(previous)
        for key in sorted(set(flat_old) | set(flat_new)):
            old, new = flat_old.get(key, "<absent>"), flat_new.get(key, "<absent>")
            if old != new:
                diff[key] = {"from": old, "to": new}

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": str(path),
        "checksum": checksum,
        "diff": diff,
        "snapshot": raw,
    }
    with CONFIG_AUDIT_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, default=str) + "\n")


def load_config(path: str | Path | None = None, *, audit: bool = True) -> Config:
    """Load, validate and audit the configuration.

    Raises ``ConfigError`` on anything malformed or unsafe. Callers should not
    catch it - a bad risk config must stop the process.
    """
    config_path = Path(path) if path else Path(
        os.environ.get("TRADING_CONFIG", DEFAULT_CONFIG_PATH)
    )
    if not config_path.is_file():
        raise ConfigError(f"Config file not found: {config_path}")

    raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ConfigError(f"Config root must be a mapping, got {type(raw).__name__}")

    required = {
        "account",
        "risk",
        "universe",
        "portfolio",
        "costs",
        "execution",
        "approval",
        "monitoring",
        "strategies",
    }
    missing = required - set(raw)
    if missing:
        raise ConfigError(f"Config is missing section(s): {sorted(missing)}")

    exec_raw = dict(raw["execution"])
    conn_raw = exec_raw.pop("connection", None)
    if conn_raw is None:
        raise ConfigError("execution.connection section is required")

    mon_raw = dict(raw["monitoring"])
    alerts_raw = mon_raw.pop("alerts", None)
    if alerts_raw is None:
        raise ConfigError("monitoring.alerts section is required")

    strategies: dict[str, StrategyConfig] = {}
    for name, body in (raw["strategies"] or {}).items():
        body = dict(body)
        strategies[name] = StrategyConfig(
            name=name,
            enabled=bool(body.pop("enabled", False)),
            weight=float(body.pop("weight", 1.0)),
            params=body,
        )

    checksum = _checksum(raw)
    config = Config(
        account=_build(AccountConfig, raw["account"], "account"),
        risk=_build(RiskConfig, raw["risk"], "risk"),
        universe=_build(UniverseConfig, raw["universe"], "universe"),
        portfolio=_build(PortfolioConfig, raw["portfolio"], "portfolio"),
        costs=_build(CostsConfig, raw["costs"], "costs"),
        execution=_build(
            ExecutionConfig,
            {**exec_raw, "connection": _build(ConnectionConfig, conn_raw, "execution.connection")},
            "execution",
        ),
        approval=_build(ApprovalConfig, raw["approval"], "approval"),
        monitoring=_build(
            MonitoringConfig,
            {**mon_raw, "alerts": _build(AlertConfig, alerts_raw, "monitoring.alerts")},
            "monitoring",
        ),
        strategies=strategies,
        source_path=config_path,
        checksum=checksum,
    )
    config.validate()

    if audit:
        _audit(raw, checksum, config_path)
    return config
