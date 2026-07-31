"""Config validation and the paper/live mode gate."""

from __future__ import annotations

import json

import pytest
import yaml

from trading_bot.config import (
    LIVE_CONFIRM_FILE_ENV,
    LIVE_ENV_VAR,
    REQUIRED_CONFIRM_PHRASE,
    TradingMode,
    resolve_trading_mode,
)
from trading_bot.config.settings import ConfigError, load_config


# ---------------------------------------------------------------------------
# Trading mode
# ---------------------------------------------------------------------------


def test_mode_defaults_to_paper_with_no_environment(monkeypatch):
    monkeypatch.delenv(LIVE_ENV_VAR, raising=False)
    monkeypatch.delenv(LIVE_CONFIRM_FILE_ENV, raising=False)
    assert resolve_trading_mode() is TradingMode.PAPER


def test_env_var_alone_is_not_enough_for_live(monkeypatch):
    monkeypatch.setenv(LIVE_ENV_VAR, "true")
    monkeypatch.delenv(LIVE_CONFIRM_FILE_ENV, raising=False)
    assert resolve_trading_mode() is TradingMode.PAPER


def test_confirmation_file_alone_is_not_enough_for_live(monkeypatch, tmp_path):
    confirm = tmp_path / "confirm.txt"
    confirm.write_text(REQUIRED_CONFIRM_PHRASE, encoding="utf-8")
    monkeypatch.delenv(LIVE_ENV_VAR, raising=False)
    monkeypatch.setenv(LIVE_CONFIRM_FILE_ENV, str(confirm))
    assert resolve_trading_mode() is TradingMode.PAPER


def test_wrong_phrase_in_confirmation_file_stays_paper(monkeypatch, tmp_path):
    confirm = tmp_path / "confirm.txt"
    confirm.write_text("yes please go live", encoding="utf-8")
    monkeypatch.setenv(LIVE_ENV_VAR, "true")
    monkeypatch.setenv(LIVE_CONFIRM_FILE_ENV, str(confirm))
    assert resolve_trading_mode() is TradingMode.PAPER


def test_truthy_variants_other_than_exact_true_stay_paper(monkeypatch, tmp_path):
    confirm = tmp_path / "confirm.txt"
    confirm.write_text(REQUIRED_CONFIRM_PHRASE, encoding="utf-8")
    monkeypatch.setenv(LIVE_CONFIRM_FILE_ENV, str(confirm))
    for value in ("1", "yes", "TRUE ", "on", "y"):
        monkeypatch.setenv(LIVE_ENV_VAR, value)
        mode = resolve_trading_mode()
        # "TRUE " normalises to "true"; the rest must not enable live trading.
        expected = TradingMode.LIVE if value.strip().lower() == "true" else TradingMode.PAPER
        assert mode is expected, f"{value!r} resolved to {mode}"


def test_both_factors_present_enables_live(monkeypatch, tmp_path):
    confirm = tmp_path / "confirm.txt"
    confirm.write_text(f"{REQUIRED_CONFIRM_PHRASE}\n", encoding="utf-8")
    monkeypatch.setenv(LIVE_ENV_VAR, "true")
    monkeypatch.setenv(LIVE_CONFIRM_FILE_ENV, str(confirm))
    assert resolve_trading_mode() is TradingMode.LIVE


def test_confirmation_file_inside_the_repo_is_rejected(monkeypatch):
    """A committed file must never be able to switch the system live."""
    from trading_bot.config.settings import PACKAGE_ROOT

    inside = PACKAGE_ROOT / "state" / "live_confirm_test.txt"
    inside.parent.mkdir(parents=True, exist_ok=True)
    inside.write_text(REQUIRED_CONFIRM_PHRASE, encoding="utf-8")
    try:
        monkeypatch.setenv(LIVE_ENV_VAR, "true")
        monkeypatch.setenv(LIVE_CONFIRM_FILE_ENV, str(inside))
        assert resolve_trading_mode() is TradingMode.PAPER
    finally:
        inside.unlink(missing_ok=True)


def test_strategy_code_cannot_resolve_the_trading_mode(monkeypatch, tmp_path):
    """Calls originating in signal_layer are refused outright."""
    from trading_bot.config.mode import ForbiddenCallerError
    from trading_bot.signal_layer import _mode_probe_for_tests

    confirm = tmp_path / "confirm.txt"
    confirm.write_text(REQUIRED_CONFIRM_PHRASE, encoding="utf-8")
    monkeypatch.setenv(LIVE_ENV_VAR, "true")
    monkeypatch.setenv(LIVE_CONFIRM_FILE_ENV, str(confirm))

    with pytest.raises(ForbiddenCallerError):
        _mode_probe_for_tests()


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------


def test_shipped_default_config_is_valid():
    config = load_config(audit=False)
    assert config.account.base_currency == "CHF"
    assert config.risk.max_leverage == 1.0


def test_percent_expressed_as_whole_number_is_rejected(make_config):
    """A limit of "5" meaning 5% would silently mean 500%."""
    with pytest.raises(ConfigError, match="fraction"):
        make_config({"risk": {"max_position_pct": 5}})


def test_leverage_above_one_rejected_for_cash_account(make_config):
    with pytest.raises(ConfigError, match="cash account"):
        make_config({"risk": {"max_leverage": 2.0}})


def test_position_cap_above_sector_cap_is_rejected(make_config):
    with pytest.raises(ConfigError, match="max_sector_pct"):
        make_config({"risk": {"max_position_pct": 0.30, "max_sector_pct": 0.25}})


def test_daily_loss_looser_than_drawdown_is_rejected(make_config):
    with pytest.raises(ConfigError, match="tighter"):
        make_config({"risk": {"max_daily_loss_pct": 0.20, "max_drawdown_pct": 0.12}})


def test_non_monotonic_rate_caps_are_rejected(make_config):
    with pytest.raises(ConfigError, match="non-decreasing"):
        make_config({"risk": {"max_orders_per_minute": 100, "max_orders_per_hour": 10}})


def test_typo_in_a_risk_key_is_rejected(make_config):
    """A misspelt limit must fail loudly, not silently keep the default."""
    with pytest.raises(ConfigError, match="Unknown key"):
        make_config({"risk": {"max_position_pc": 0.02}})


def test_zero_cost_backtest_config_is_rejected(make_config):
    with pytest.raises(ConfigError, match="fantasy backtest"):
        make_config({"costs": {"commission_bps": 0.0, "slippage_bps": 0.0}})


def test_all_strategies_disabled_is_rejected(make_config):
    with pytest.raises(ConfigError, match="No strategies are enabled"):
        make_config(
            {
                "strategies": {
                    "momentum": {"enabled": False},
                    "mean_reversion": {"enabled": False},
                    "breakout": {"enabled": False},
                }
            }
        )


def test_colliding_paper_and_live_ports_are_rejected(make_config):
    with pytest.raises(ConfigError, match="must all differ"):
        make_config({"execution": {"connection": {"paper_port": 7496}}})


def test_market_order_default_without_permission_is_rejected(make_config):
    with pytest.raises(ConfigError, match="allow_market_orders"):
        make_config({"execution": {"default_order_type": "MKT"}})


def test_empty_permissioned_asset_classes_is_rejected(make_config):
    with pytest.raises(ConfigError, match="permissioned_asset_classes"):
        make_config({"account": {"permissioned_asset_classes": []}})


# ---------------------------------------------------------------------------
# Config change auditing
# ---------------------------------------------------------------------------


def test_config_changes_are_audited_with_a_diff(tmp_path, raw_config, monkeypatch):
    from trading_bot.config import settings

    audit_log = tmp_path / "config_audit.log"
    monkeypatch.setattr(settings, "CONFIG_AUDIT_LOG", audit_log)

    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw_config), encoding="utf-8")
    load_config(path)

    tightened = dict(raw_config)
    tightened["risk"] = {**raw_config["risk"], "max_position_pct": 0.04}
    path.write_text(yaml.safe_dump(tightened), encoding="utf-8")
    load_config(path)

    entries = [json.loads(l) for l in audit_log.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(entries) == 2
    assert entries[1]["diff"]["risk.max_position_pct"] == {"from": 0.08, "to": 0.04}
    assert entries[1]["timestamp"]


def test_unchanged_config_is_not_re_audited(tmp_path, raw_config, monkeypatch):
    from trading_bot.config import settings

    audit_log = tmp_path / "config_audit.log"
    monkeypatch.setattr(settings, "CONFIG_AUDIT_LOG", audit_log)

    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw_config), encoding="utf-8")
    load_config(path)
    load_config(path)

    entries = [l for l in audit_log.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(entries) == 1
