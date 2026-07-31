# Systematic trading system (IBKR)

A risk-managed, human-approved systematic trading framework for Interactive
Brokers. It screens a universe, generates signals from transparent rules, sizes
them, runs every resulting order through a risk gate the strategy code cannot
reach, and then **stops and waits for you**.

## Read this first

**This is not a money machine, and nothing here is evidence that it makes
money.** No system can be designed to reliably beat all markets, ETFs and
traders. Risk-adjusted outperformance is the hypothesis under test here — it is
not a property of this code.

As shipped, the honest status is:

- The machinery is built and covered by **173 passing tests**.
- It has **never been run against real market data** — the only data included is
  synthetic, and reports generated from it are stamped
  `*** SYNTHETIC DATA - NOT A VALID RESULT ***`.
- It has **never connected to a broker**, placed an order, or been paper traded.
- `universe.candidates` is **empty on purpose**. `propose` refuses to run until
  you define a universe you have verified against your account's permissions.

Before this is worth anything you need a real history vendor, a real backtest
across at least one bear market, and weeks of paper trading. See
[Rollout status](#rollout-status).

## Your account changes the defaults

The connected IBKR account was queried read-only during the build, and it is not
what the brief assumed. In short: it is a **live** (not paper) **Swiss cash
account**, base currency **CHF**, ~304k CHF net liquidation but only **29.6k CHF
of deployable cash**, holding seven European-listed ETFs across CHF, GBP and USD,
with **no margin** and **no non-CHF cash**.

That drove several defaults: leverage pinned at 1.0, shorting blocked, settled-cash-only
buying power, PDT rules off, FX rates that must be explicit, and the seven
existing holdings protected from the bot. The full findings, and the six
questions still blocking live use, are in
[`docs/ACCOUNT_CONTEXT.md`](docs/ACCOUNT_CONTEXT.md). **Read it before running
anything.**

## Safety model

Four independent controls. None is a configuration toggle; each is enforced
structurally and covered by tests that fail the build if the property regresses.

### 1. No order reaches IBKR without human approval

The only function that transmits is `IBKRExecutor.submit`, and it requires
*both* a `RiskClearance` and an `ApprovalToken`:

```
strategy → ProposedOrder → risk_gate.evaluate → propose
        → [ a human runs `review` and types approve ]
        → ApprovalToken → executor.submit → IBKR
```

An `ApprovalToken` is HMAC-signed, single-use, time-limited, and bound to the
order's fingerprint — a hash of symbol, side, quantity, limit price and order
type. Approving "buy 10 shares" and then submitting "buy 200 shares" fails,
because the fingerprints differ. Tests assert `place_order` is called from
exactly one file, that no `auto_approve`-style identifier exists anywhere, and
that the `token` parameter never acquires a default.

### 2. Risk limits live outside strategy code

`signal_layer` cannot import `risk_gate`, `approval_layer`, `execution_layer` or
the live-mode switch — asserted statically by parsing the import graph, so the
boundary cannot rot. Strategies emit opinions with no quantity, no currency and
no account context; they cannot size, clear or send anything.

The gate checks kill switch, latching halt, both loss breakers, asset-class
permissions, core-holding protection, order type, limit-price sanity, min/max
order notional, position and sector concentration, gross exposure, leverage,
settled-cash buying power, naked shorting, and the order rate — evaluated as a
*batch*, so ten individually-legal orders cannot add up to an illegal book.

### 3. Circuit breakers latch, and survive restarts

Daily loss (2%) and drawdown-from-peak (12%) breakers write a halt file that
**only a human can clear**, via `resume --operator <name> --note <why>`. Both
the halt and the order-rate budget persist to disk, so restarting the process
does not clear a breaker or hand a runaway loop a fresh budget. A corrupt halt
file is treated as halted (fail closed).

### 4. Live trading takes two independent factors

`LIVE_TRADING=true` **and** a confirmation file, outside the repo, containing an
exact phrase — plus a call-stack guard rejecting strategy/data/backtest callers.
Anything else resolves to paper. After connecting, the broker's reported account
is checked: a paper session attached to a non-`DU` account disconnects rather
than proceeding. `LIVE_TRADING` has exactly one reader in the codebase, asserted
by test.

Plus a **kill switch** any operator can trip from a bare shell with
`touch trading_bot/state/KILL_SWITCH` — no Python, no running process.

## Layout

```
config/           typed settings, validation, change auditing, paper/live gate
core/             shared value objects and position sizing (pure)
data_layer/       providers (CSV / in-memory / IBKR), universe screening, FX
signal_layer/     indicators and the three strategies - pure, no I/O
backtest_engine/  daily simulation with costs, metrics, benchmark comparison
risk_gate/        hard limits, latching breakers, kill switch, rate limiting
approval_layer/   proposals, human decisions, signed single-use tokens
execution_layer/  IBKR adapter, order-state tracking, reconciliation
monitoring/       structured journal, alerts, dashboard, daily summary
cycle.py          the autonomous half: screen → signal → size → risk → propose
cli.py            operator commands
```

`core/` is an addition to the brief's layout: sizing must be *identical* in the
backtest and the live cycle, so it lives in one place both can import without
either depending on the other.

## Quick start

```bash
pip install -r trading_bot/requirements.txt
python -m pytest trading_bot/tests -q          # 173 tests, no network needed

python -m trading_bot.cli doctor               # config + safety self-check
python -m trading_bot.cli backtest --benchmark BENCH   # synthetic demo
```

Real use:

```bash
# 1. Edit config/default_config.yaml: universe.candidates + universe.instruments
#    (verified IBKR conIds), and refresh account.fx_rates.
# 2. Backtest against real CSV history.
python -m trading_bot.cli backtest --data-dir /path/to/history --benchmark SPY --out report.json

# 3. Propose. Runs autonomously, then stops.
python -m trading_bot.cli propose --data-dir /path/to/history

# 4. Review. The only command that records an approval.
python -m trading_bot.cli review --operator yourname

# 5. Submit. The only command that transmits.
python -m trading_bot.cli submit --token <token-id>
```

`status`, `summary` and `audit` are read-only. Most commands accept `--offline`
to skip the broker entirely.

## Emergency runbook

```bash
# Stop everything now (works with no Python at all):
touch trading_bot/state/KILL_SWITCH

# Or, to also cancel working orders at IBKR:
python -m trading_bot.cli kill --reason "explain here" --operator yourname

python -m trading_bot.cli unkill --operator yourname          # clear it
python -m trading_bot.cli resume --operator yourname --note "why it is safe"
```

`resume` clears a latched circuit breaker and demands both an operator and a
note; it refuses blank values.

## Strategies

Three, each independently switchable via `strategies.<name>.enabled`, each a
pure function of price history with explicit entry, exit and ATR-based stop
rules:

- **Momentum** — cross-sectional 126-day return skipping the recent 21 days,
  filtered by a 200-day trend, top N ranked.
- **Mean reversion** — buys z-score dips ≤ −2.0 *only above* the 200-day average,
  so it does not catch falling knives.
- **Breakout** — 55-day high with volume confirmation. Ships **disabled** pending
  a reviewed backtest.

## Backtesting

The engine is purpose-built rather than wrapping a framework, and the brief
asked for that choice to be justified against current maintenance status.
Checked at build time: `backtrader`'s author stopped active development;
`zipline-reloaded` is maintained but built around US-equity bundles and a
single-currency ledger; open-source `vectorbt` vectorises in a way that makes
path-dependent stops awkward. None handles a multi-currency cash-account ledger
without significant adaptation, and all three would require rewriting the
strategies into their APIs — meaning the backtested code would no longer be the
code that trades. The trade-off is a smaller ecosystem in exchange for testing
the real thing.

It fills at the **next bar's open** (never the signal bar's close), charges
commission, slippage and half-spread, and reports CAGR, volatility, Sharpe,
Sortino, max drawdown, win rate, profit factor and performance versus a
buy-and-hold benchmark. Tests assert it cannot see future bars, that costs
genuinely reduce returns, and that it never spends cash it does not have.

## Rollout status

| Step | Status |
|---|---|
| 1. Unit tests for signal_layer and risk_gate | **Done** — 173 tests, no live connection |
| 2. Backtest ≥5 years incl. a bear market | **Not done** — needs a real history vendor |
| 3. Paper trade 4–8 weeks vs backtest | **Not started** |
| 4. Kill-switch test in paper mode | Covered by unit tests; **not yet exercised against live TWS** |
| 5. Start live with a small fraction | **Do not attempt** until 2–4 are complete |

## Things to be aware of

- FX rates in config are **static** and must be refreshed before each session;
  stale rates are a real source of sizing error.
- The system does **not** convert currency. With zero USD/GBP cash, a non-CHF
  buy will fail at the broker.
- The approval signing key is generated at `state/approval_signing.key` (mode
  0600) and is gitignored. It guards against accidental bypass, not against
  someone who can already run this code on your machine.
- Reconciliation *reports* drift between local and broker state; it does not
  silently correct it. A position you did not expect needs a human.
