# OddsShift

**The market reprices. The market also decides who pays for it.**

OddsShift uses future order flow to judge past flow. Every trade in a POP prediction
market pays a flat **1%**: `0.30%` is the ordinary LP fee and `0.70%` is a **Provisional
LP Protection Fee** that is escrowed rather than paid. OddsShift then judges the escrow
against what the market did next — not trade by trade, but **window by window**. If a
run of trades repriced the market and the repricing held, that flow was toxic to stale
LP liquidity and the protection fee protects LPs. If the market came back, the whole
0.70% is rebated and the trade cost the trader the standard 0.30%.

Price discovery stays open. Liquidity becomes more sustainable.


---

## Why OddsShift

Prediction markets exist to absorb new information into prices.

Imagine a market:

```
Will the Fed cut rates?

YES 50%
NO  50%
```

New information arrives and the market should quickly reprice toward:

```
YES 70%
```

The first trader may move the AMM:

```
50% → 63%
```

That trade is healthy price discovery.

But the LP is still quoting the old probability.

So the same trade can be:

```
good for the market, but toxic to the LP.
```

Here, **toxic flow does not mean malicious flow**. It means flow that trades against
stale LP liquidity during genuine information-driven repricing.

---

## How It Works

Every trade is charged provisionally, as if it were part of a shock.

```
Base LP Fee        0.30%   ← paid immediately, never refunded
LP Protection      0.70%   ← escrowed, not yet paid
                   ─────
Total              1.00%
```

The protection fee is not immediately paid to LPs. Instead, OddsShift watches what the
market does next.

```
                INFORMATION SHOCK
                        ↓
        FIVE CONSECUTIVE TRADES MOVE THE
        PROBABILITY BY 5 POINTS OR MORE
                        ↓
              THE WINDOW IS MARKED
                        ↓
               NEXT FIVE TRADES
                  ↙           ↘
            HOLDS          COMES BACK
              ↓                 ↓
         TOXIC FLOW         FAIR FLOW
              ↓                 ↓
     ONLY THE CAUSES PAY    FULL REBATE
              ↓
      SUSTAINABLE LIQUIDITY
```

The market decides.

```
No news oracle.
No external price feed.
No AI classifier.
```

---

## The Fee Lifecycle

This is the concrete mechanism. Three rules, no exceptions.

### 1. Every account pays 1% on every trade

There is no size filter and no whitelist. Every buy and every sell from every account
is charged the full **1.00%** at the moment of the trade.

```
BUY 100 USDC
     ↓
 0.30 USDC   →  LPs         (immediately, never refunded)
 0.70 USDC   →  ESCROW      (held, owner undecided)
99.00 USDC   →  MARKET      (mints YES/NO, moves the curve)
```

The escrow is real USDC sitting in the market contract, but it is **not** counted as
collateral and **not** added to the AMM reserves. The pool's `k`, its implied
probability, and its redemption math are untouched by money whose owner is still
undecided.

Every trade — including one too small to move the price — is appended to a log with the
implied probability on **both** sides of it:

```
pBefore  = 50.0%     (probability immediately before the trade)
pAfter   = 55.6%     (probability immediately after)
escrow   = 0.70 USDC
```

`pAfter − pBefore` is that trade's own contribution. The log has to be complete, or the
window anchors below would drift.

### 2. Five trades detect the jump; five more decide it

There are no clocks and no epochs. After every trade, OddsShift looks back over the
last **five** trades and compares where they ended to where they started:

```
        ┌──────── detection window: 5 trades ────────┐
anchor  │  t0     t1     t2     t3     t4            │
50.0% ──┤ +5.6   −1.6   +0.5   +0.4   +1.3           ├──► 57.3%
        └────────────────────────────────────────────┘
                 net displacement +7.3 points  ≥  5.0  →  MARK
```

The test is on the **net** displacement, so trades that push against each other cancel
out and a choppy window is never marked. If the net move stays under the threshold, the
oldest trade retires clean — its 0.70% is rebated — and the window slides forward one
trade. Splitting an order across the window changes nothing: in a CPMM the displacement
depends only on cumulative net inflow.

Once a window is marked, the next **five** trades decide it:

```
   MARK at 57.3%              observation window: 5 trades
   anchor 50.0% ± 5.0  ─────────────────────────────────────►
                        the first trade that brings the
                        probability back inside the band
                        closes the mark as FAIR, early
```

If any observation trade brings the probability back within 5 points of the anchor, the
mark is **reverted** on the spot. If all five go by with the market still displaced, the
mark is **toxic**. Either way the observation trades themselves are not judged yet —
they become the start of the next detection window, which re-anchors and never reaches
back across a settled mark.

A quiet market cannot deadlock the queue: once nothing has traded for the cooldown
period, anyone may settle the queue permissionlessly against the current probability.

### 3. Toxic charges only the causes

```
                 WINDOW ESCROW  (0.70% × 5 trades)
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
     TOXIC                                FAIR
   (still displaced)                   (came back)
        │                                   │
        ▼                                   ▼
  per-trade verdict                  every trade in the
        │                            window is rebated
        │                            in full → 0.30% cost
        ├─ pushed the market the SAME way
        │  as the mark, by more than 1 point
        │        → CHARGED, 0.70% to LPs   (1.00% total)
        │
        └─ pushed the other way, or moved
           less than 1 point
                 → REBATED               (0.30% total)
```

**A toxic window does not punish everyone in it.** Only the trades that actually caused
the displacement pay. Two groups are always rebated:

- **the correctors** — trades that pushed the probability *against* the mark's
  direction. Someone selling into a spike is doing the LPs a favour, however large
  their trade.
- **the passengers** — trades that moved the probability by less than one point in the
  mark's direction. They rode the repricing; they did not create it.

So the effective cost of trading is:

```
FAIR  flow   →  0.30%   (normal LP fee)
TOXIC cause  →  1.00%   (LP protection)
```

Rebates and LP rewards are both credited to claimable balances rather than pushed out,
so a trader with many settled windows claims once in a single onchain transaction. The
forfeited protection fees flow to LPs through the same accumulator as the base fee.

---

## Toxic Flow

Suppose five trades take the market:

```
50 → 56 → 54 → 55 → 55 → 57
```

Net displacement: **+7 points**, past the 5-point threshold. The window is marked at
57%, with an anchor of 50% and a direction of *up*.

Then the market continues:

```
57 → 60 → 63 → 65 → 67 → 70
```

Five observation trades go by and the probability never returns inside `50% ± 5%`. The
market has confirmed that the old 50% quote was stale. OddsShift classifies the window
**ex post** as toxic to LPs.

```
SHOCK CONFIRMED

FLOW QUALITY
TOXIC
```

The verdict is then applied trade by trade:

```
t0  +5.6 pts   up,   > 1 pt   →  CHARGED   1.00%
t1  −1.6 pts   down            →  REBATED   0.30%   (corrector)
t2  +0.5 pts   up,   ≤ 1 pt   →  REBATED   0.30%   (passenger)
t3  +0.4 pts   up,   ≤ 1 pt   →  REBATED   0.30%   (passenger)
t4  +1.3 pts   up,   > 1 pt   →  CHARGED   1.00%
```

Two traders pay for the repricing they caused. The other three pay the ordinary fee.

---

## Fair Flow

Now suppose the same window occurs:

```
50 → 57       marked, anchor 50%, direction up
```

But the very next trade reverses it:

```
57 → 51
```

That is inside `50% ± 5%`, so the mark closes immediately as reverted — the observation
window does not have to run out. The displacement was temporary market impact rather
than genuine repricing.

```
SHOCK REVERTED

FLOW QUALITY
FAIR
```

Result:

```
LP Protection Fee
    ↓
Full Rebate  (0.70% on every trade in the window)
    ↓
Traders
```

Every trade in the window — the one that moved the market 5.6 points included — ends up
paying exactly the base 0.30%. The trader claims the rebate onchain.

And the corrector? Its own escrow is still pending: it now anchors the next detection
window. Pulling the market back is never itself a punishable act.
