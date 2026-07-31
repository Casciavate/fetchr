"""Static enforcement of the architectural boundaries.

The safety properties this system claims rest on a layering rule: strategy code
cannot reach the risk gate, the approval store, the broker connection, or the
live-mode switch. A comment saying so is worth nothing six months from now, so
the rule is asserted here by parsing the import graph.

These tests read source with ``ast``; they never import the modules under test,
so they cannot be fooled by import-time side effects.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_NAME = PACKAGE_ROOT.name

#: The one module allowed to break the signal_layer rule, because its entire
#: purpose is to prove the runtime guard still fires. See its docstring.
PROBE_MODULE = PACKAGE_ROOT / "signal_layer" / "_forbidden_probe.py"


def _modules_in(layer: str) -> list[Path]:
    return sorted(p for p in (PACKAGE_ROOT / layer).rglob("*.py"))


def _imports_of(path: Path) -> set[str]:
    """Absolute dotted module names imported by ``path``, relatives resolved."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    package_parts = [PACKAGE_NAME, *path.relative_to(PACKAGE_ROOT).parts[:-1]]
    found: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0:
                base = node.module or ""
            else:
                anchor = package_parts[: len(package_parts) - (node.level - 1)]
                base = ".".join([*anchor, *( [node.module] if node.module else [])])
            found.add(base)
            for alias in node.names:
                found.add(f"{base}.{alias.name}" if base else alias.name)
    return found


def _touches(imports: set[str], target: str) -> bool:
    full = f"{PACKAGE_NAME}.{target}"
    return any(name == full or name.startswith(full + ".") for name in imports)


# ---------------------------------------------------------------------------
# signal_layer is sealed off from everything that can act
# ---------------------------------------------------------------------------


FORBIDDEN_FOR_SIGNALS = ("risk_gate", "approval_layer", "execution_layer", "config.mode")


@pytest.mark.parametrize("forbidden", FORBIDDEN_FOR_SIGNALS)
def test_signal_layer_does_not_import_acting_layers(forbidden):
    offenders = []
    for module in _modules_in("signal_layer"):
        if module == PROBE_MODULE:
            continue
        if _touches(_imports_of(module), forbidden):
            offenders.append(module.relative_to(PACKAGE_ROOT))
    assert not offenders, (
        f"signal_layer must not import {forbidden}; offending module(s): {offenders}. "
        "Strategies propose - they must not be able to size, clear or send anything."
    )


def test_signal_layer_does_not_touch_the_network_or_filesystem():
    """Strategies are pure: no sockets, no requests, no broker SDK, no open()."""
    banned = {"socket", "requests", "urllib", "httpx", "ib_async", "ib_insync", "ibapi"}
    offenders = []
    for module in _modules_in("signal_layer"):
        imports = _imports_of(module)
        hits = {name for name in imports if name.split(".")[0] in banned}
        if hits:
            offenders.append((module.relative_to(PACKAGE_ROOT), sorted(hits)))
    assert not offenders, f"signal_layer performs I/O: {offenders}"


def test_probe_module_is_not_imported_by_production_code():
    """The forbidden-caller probe must stay confined to tests."""
    offenders = []
    for module in PACKAGE_ROOT.rglob("*.py"):
        if module == PROBE_MODULE or "tests" in module.relative_to(PACKAGE_ROOT).parts:
            continue
        if module.name == "__init__.py" and module.parent.name == "signal_layer":
            continue  # documented test-only indirection
        if any("_forbidden_probe" in name for name in _imports_of(module)):
            offenders.append(module.relative_to(PACKAGE_ROOT))
    assert not offenders, f"_forbidden_probe leaked into production code: {offenders}"


# ---------------------------------------------------------------------------
# The risk gate answers to nobody below it
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("forbidden", ["signal_layer", "execution_layer", "backtest_engine"])
def test_risk_gate_does_not_depend_on_the_layers_it_polices(forbidden):
    offenders = [
        module.relative_to(PACKAGE_ROOT)
        for module in _modules_in("risk_gate")
        if _touches(_imports_of(module), forbidden)
    ]
    assert not offenders, (
        f"risk_gate must not import {forbidden}; offending module(s): {offenders}. "
        "The gate cannot be allowed to depend on what it is gating."
    )


def test_data_and_backtest_layers_cannot_reach_execution():
    for layer in ("data_layer", "backtest_engine"):
        for module in _modules_in(layer):
            imports = _imports_of(module)
            assert not _touches(imports, "execution_layer"), (
                f"{module.relative_to(PACKAGE_ROOT)} imports execution_layer"
            )


# ---------------------------------------------------------------------------
# The execution layer is bound to both gates
# ---------------------------------------------------------------------------


def test_execution_layer_depends_on_risk_gate_and_approval_layer():
    """Positive check: the submit path must be wired to both controls."""
    imports: set[str] = set()
    for module in _modules_in("execution_layer"):
        imports |= _imports_of(module)
    assert _touches(imports, "risk_gate"), "execution_layer must import risk_gate"
    assert _touches(imports, "approval_layer"), "execution_layer must import approval_layer"


def test_only_config_mode_reads_the_live_trading_env_var():
    """``LIVE_TRADING`` must be read in exactly one place."""
    offenders = []
    for module in PACKAGE_ROOT.rglob("*.py"):
        relative = module.relative_to(PACKAGE_ROOT)
        if relative.parts[0] == "tests" or relative.as_posix() == "config/mode.py":
            continue
        source = module.read_text(encoding="utf-8")
        # The name may legitimately appear in prose; flag only executable reads.
        for node in ast.walk(ast.parse(source, filename=str(module))):
            if isinstance(node, ast.Constant) and node.value == "LIVE_TRADING":
                offenders.append(relative)
                break
    assert not offenders, (
        f"LIVE_TRADING is referenced outside config/mode.py: {offenders}. "
        "The live switch must have exactly one reader."
    )
