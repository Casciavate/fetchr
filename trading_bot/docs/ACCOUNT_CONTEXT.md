# Account context and open questions

The build brief said to confirm account size, buying power and instrument
permissions before writing any order-execution code. Rather than guess, the
connected IBKR account was queried read-only at build time. What it returned
differs from the brief's assumptions in ways that change the design, so this
document records both the observations and the questions they raise.

**No orders were placed, and no order-placing tool was called, at any point
during this build.**

## Observed account state (read-only snapshot, build time)

| Metric | Value |
|---|---|
| Base currency | **CHF** |
| Net liquidation value | 304,246.88 CHF |
| Total cash / settled cash | 29,638.75 CHF |
| Gross position value | 274,606.77 CHF |
| Initial margin / maintenance margin | 0 / 0 |
| Buying power | 29,638.75 CHF (equal to cash) |
| Reported leverage | 0.9 |

Holdings, all asset class `STK`:

| Symbol | Venue | Currency | Market value | Notes |
|---|---|---|---|---|
| IWDC | EBS (SIX Swiss) | CHF | 113,135 | World equity, CHF-hedged |
| AGGS | EBS | CHF | 51,742 | Global aggregate bonds |
| WORLD | EBS | CHF | 49,378 | World equity |
| TI5G | LSEETF | GBP | 24,958 | Short-dated treasuries |
| PHAU | LSE | USD | 21,742 | Physical gold |
| CHCORP | EBS | CHF | 11,078 | Swiss corporate bonds |
| WLDS | LSEETF | GBP | 2,745 | World small cap |

Cash by currency: **CHF 29,638.75; USD 0; GBP 0.**

## What this implies, and how the system was built around it

1. **This is a live, invested account — not a paper account.** Every default in
   this system therefore points at the paper port, and live trading needs two
   independent factors plus a post-connection check that the broker-reported
   account really is a paper (`DU…`) account. See `config/mode.py`.

2. **It is a cash account, not a margin account.** Initial and maintenance
   margin are both zero and buying power equals cash exactly. So:
   `max_leverage` is pinned at 1.0 (config validation *rejects* anything higher
   while `account_type: cash`), shorting is blocked outright, and only
   **settled** cash counts toward buying power, since reusing unsettled
   proceeds in a cash account is a good-faith violation.

3. **The brief's US-equity framing does not fit.** The brief describes US
   equities/ETFs, a `$10M` average-dollar-volume screen, and Pattern Day Trader
   rules. PDT is a FINRA rule applying to margin accounts at US brokers; this is
   a cash account holding Swiss- and London-listed ETFs, so it does not apply.
   `pdt_rules_apply` is therefore `false` — flip it (and re-check the current
   FINRA threshold) only if the account ever becomes a US margin account.

4. **Multi-currency is a first-class correctness problem, not a detail.**
   Positions are quoted in CHF, GBP and USD while risk is measured in CHF.
   Nothing in the system defaults an unknown FX rate to 1.0; an unknown currency
   raises. Treating a GBP price as CHF would understate a position by roughly
   10% and corrupt every downstream limit.

5. **Only about 29.6k CHF is actually deployable, ~10% of the portfolio**, and
   there is zero USD and zero GBP cash — so any non-CHF purchase needs an FX
   conversion first, which this system does **not** do. The systematic sleeve is
   configured at `sleeve_pct_of_equity: 0.10` and the seven existing holdings are
   listed as `core_holdings` with `trade_core_holdings: false`, so the bot
   cannot churn the long-term buy-and-hold portfolio.

6. **Net liquidation (304k CHF) exceeds the brief's stated $25k–$250k band.**
   Worth confirming this is the intended account.

7. **Only `STK` is evidenced.** No options, futures or forex positions appear, so
   `permissioned_asset_classes: [STK]` and the risk gate rejects anything else.
   Holdings are not proof of permissions — confirm against the account's actual
   trading permissions page.

## Questions that still need your answer

These could not be resolved by reading the account, and several block live use:

1. **Is this the account you intend to trade systematically?** It currently looks
   like a long-term passive portfolio, which is a strange base for a momentum /
   mean-reversion sleeve.
2. **Confirm cash vs margin** on the account page. The inference above is strong
   but indirect.
3. **Which asset classes are actually permissioned**, and which **market-data
   subscriptions** are active? Without a subscription, live quotes and history
   for a venue simply will not arrive.
4. **What should the tradeable universe be?** `universe.candidates` ships empty
   and `propose` refuses to run until it is populated. Candidates must be
   instruments you can trade on this account, with verified IBKR `conId`s.
5. **How is FX handled?** There is no non-CHF cash. Either restrict the universe
   to CHF-quoted instruments, or decide explicitly how conversions happen —
   this system will not convert currency on your behalf.
6. **Which real history vendor?** IBKR's `reqHistoricalData` is pacing-limited
   and its lookback varies by bar size, so it is a poor source for the 5–10 year
   backtest the brief asks for. The backtest engine reads CSVs via `--data-dir`;
   the vendor is your choice.

Until 1–6 are answered, the honest status is: **the machinery is built and
tested, and it has never been pointed at real data or a real account.**
