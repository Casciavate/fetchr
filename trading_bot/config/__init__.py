"""Configuration package: typed settings plus the paper/live mode gate."""

from .mode import (
    LIVE_CONFIRM_FILE_ENV,
    LIVE_ENV_VAR,
    REQUIRED_CONFIRM_PHRASE,
    ForbiddenCallerError,
    TradingMode,
    describe_mode_requirements,
    resolve_trading_mode,
)
from .settings import (
    DEFAULT_CONFIG_PATH,
    PACKAGE_ROOT,
    AccountConfig,
    Config,
    ConfigError,
    ExecutionConfig,
    RiskConfig,
    StrategyConfig,
    UniverseConfig,
    load_config,
)

__all__ = [
    "AccountConfig",
    "Config",
    "ConfigError",
    "DEFAULT_CONFIG_PATH",
    "ExecutionConfig",
    "ForbiddenCallerError",
    "LIVE_CONFIRM_FILE_ENV",
    "LIVE_ENV_VAR",
    "PACKAGE_ROOT",
    "REQUIRED_CONFIRM_PHRASE",
    "RiskConfig",
    "StrategyConfig",
    "TradingMode",
    "UniverseConfig",
    "describe_mode_requirements",
    "load_config",
    "resolve_trading_mode",
]
