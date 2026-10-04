# POP

> **An AMM-native prediction market for Robinhood Chain, denominated in USDG.**

POP brings Uniswap-style continuous liquidity to prediction markets.

Instead of relying on an order book and dedicated market makers, POP lets users trade **YES / NO outcomes against onchain AMM liquidity**, turning market prices into continuously updating probabilities.

**Live demo:** https://populab.xyz/robinhood

For **Arbitrum Open House Singapore 2026**, POP is being adapted for **Robinhood Chain + USDG**, together with **OddsShift**, a conditional fee-rebate mechanism designed to protect passive liquidity during information shocks.

---

## Why POP

Prediction markets are markets for information.

But most prediction-market liquidity today still depends on one of two models:

- **Order books**, which depend on active market makers continuously quoting both sides.
- **Static pooled markets**, which make participation simple but provide a weaker continuous trading experience.

This becomes especially visible when important information arrives.

A market can move from:

```text
Will the Fed cut rates?

YES  50%
NO   50%
```

to:

```text
YES  70%
```

within minutes.

That repricing is exactly what a prediction market should allow.

But during the same move, market makers may widen spreads or pull quotes, while passive AMM liquidity continues quoting against traders who may already know that the old price is wrong.

POP explores a different market structure:

```text
event
  ↓
YES / NO market
  ↓
USDG liquidity
  ↓
AMM price discovery
  ↓
OddsShift liquidity protection
  ↓
resolution
  ↓
USDG settlement
```

---

## The Idea

POP treats a prediction market more like an AMM than a sportsbook.

Users can:

- trade YES or NO continuously
- enter and exit before resolution
- provide liquidity to a market
- observe probability directly from AMM prices
- settle winning positions onchain

The basic experience is:

```text
USDG
 ↓
POP Market
 ↓
YES / NO
 ↓
continuous trading
 ↓
market probability
 ↓
resolution
 ↓
USDG
```

A price of:

```text
YES = 0.63 USDG
```

can be interpreted as approximately:

```text
63% implied probability
```

The market itself becomes the probability engine.

---

# Built for Robinhood Chain

For Open House, POP is being extended toward **Robinhood Chain** with **USDG as the prediction-market collateral and settlement asset**.

This pairing is intentional.

Robinhood Chain provides an environment focused on bringing financial products onchain, while USDG gives POP a dollar-denominated base asset for liquidity, trading and settlement.

In the target architecture:

```text
                    POP

            ┌─────────────────┐
            │  Prediction     │
USDG ──────►│  Market AMM     │
            │                 │
            │   YES     NO    │
            └────────┬────────┘
                     │
               price discovery
                     │
                OddsShift
                     │
                  resolve
                     │
                    USDG
```

USDG is used for:

- market collateral
- AMM liquidity
- trading
- fees
- winning-position redemption

This makes the market economically legible without introducing another internal settlement token.

---

# OddsShift

Prediction markets have an unusual liquidity problem.

The most valuable trades often happen immediately after new information arrives.

Imagine the market is trading at:

```text
50%
```

News arrives.

A trader moves it:

```text
50% → 63%
```

If the market later continues toward 70%, the trader was helping the market discover a new probability — but they were also trading against liquidity still priced around the old information.

This creates tension between:

**price discovery for traders**

and

**sustainable liquidity for LPs.**

OddsShift is POP's experimental answer.

> **OddsShift is a conditional fee-rebate mechanism for AMM-based prediction markets during information shocks.**

Every trade provisionally pays:

```text
Base LP Fee          0.30%
LP Protection Fee    0.70%
                     ─────
Total                 1.00%
```

The 0.70% protection component is temporarily escrowed.

Then the market looks at what happens next.

### If the move persists

```text
50 → 57 → 60 → 63 → 67 → 70
```

the market interprets the move as genuine repricing.

Liquidity around the old probability was stale, so qualifying shock-causing flow can pay the additional protection fee to LPs.

### If the move reverses

```text
50 → 57 → 51
```

the move is treated as temporary impact rather than lasting information.

The provisional 0.70% is rebated.

The trader ultimately pays only the normal:

```text
0.30%
```

So the effective result is:

```text
fair flow        → 0.30%
shock-causing    → 1.00%
```

OddsShift does this **without a news oracle, external price feed or AI classifier**.

It uses subsequent market behavior to classify previous flow ex post.

Read the full mechanism:

[`oddsshift.md`](./oddsshift.md)

---

# How a POP Market Works

## 1. Create

A binary market is created around a resolvable question.

```text
Will the Fed cut rates?
```

Two outcome positions exist:

```text
YES
NO
```

---

## 2. Bootstrap Liquidity

USDG is deposited into the market.

Liquidity creates the initial pricing curve for YES and NO.

---

## 3. Trade

Users buy or sell outcomes against the AMM.

```text
USDG → YES
USDG → NO
```

No matching counterparty needs to be online for every trade.

---

## 4. Discover Probability

Trading changes the AMM state.

```text
50%
 ↓
56%
 ↓
63%
```

The market price continuously expresses the market's current implied probability.

---

## 5. Handle Information Shocks

When a sequence of trades rapidly reprices the market, OddsShift evaluates whether that move persists or reverses.

```text
                    repricing

                       63%
                      /   \
                     /     \
                  holds    reverts
                   /          \
             LP protection   rebate
```

This allows price discovery to remain open while making passive liquidity more resilient to stale-price trading.

---

## 6. Resolve

Once the real-world event is known, the market is resolved to:

```text
YES = 1
NO  = 0
```

or:

```text
YES = 0
NO  = 1
```

---

## 7. Redeem

Winning positions redeem back into USDG.

```text
winning outcome
      ↓
    USDG
```

---

# What We Built During Open House

The Open House work focuses on turning POP into a **Robinhood Chain / USDG-ready AMM prediction market implementation**.

### Prediction market contracts

The current contract suite includes the active EventMarket implementation and its V2 evolution, covering:

- YES / NO market lifecycle
- USDG-denominated collateral accounting
- AMM trading
- liquidity management
- market settlement
- payout flows

### Robinhood Chain preparation

The repository includes dedicated Robinhood deployment and configuration work, including:

- Robinhood Chain Testnet metadata
- Robinhood deployment preflight checks
- deployment scripts
- frontend Robinhood configuration
- contract-address validation

### OddsShift integration

OddsShift adds the experimental liquidity-protection layer:

- provisional protection fee
- escrow accounting
- trade-window detection
- persistent vs reverted move classification
- trader rebate accounting
- LP protection accounting
- permissionless queue settlement for inactive markets

### Frontend

The Open House frontend includes a Robinhood-focused market experience built with React, TypeScript, Wagmi and Viem.

### Release validation

A repository-level release gate verifies:

- Solidity formatting
- contract compilation
- Foundry tests
- focused Slither analysis
- frontend TypeScript
- active frontend linting
- production dependency audit
- Robinhood configuration tests

---

# Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                         POP                              │
└──────────────────────────────────────────────────────────┘

                         USER
                          │
                          ▼
                  ┌───────────────┐
                  │   React App   │
                  │ Wagmi / Viem  │
                  └───────┬───────┘
                          │
                          ▼
              ┌──────────────────────┐
              │    EventMarketV2     │
              │                      │
              │  YES / NO Markets    │
              │  AMM Pricing         │
              │  USDG Liquidity      │
              │  Settlement          │
              └──────────┬───────────┘
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
      ┌─────────────┐         ┌──────────────┐
      │  OddsShift  │         │ Resolution / │
      │             │         │ Operations   │
      │ fee escrow  │         │              │
      │ flow window │         │ backend      │
      │ rebates     │         │ workers      │
      │ LP protect  │         │ monitoring   │
      └─────────────┘         └──────────────┘

                         │
                         ▼

                  Robinhood Chain
                         │
                        USDG
```

---

# Why an AMM?

Prediction markets are particularly compatible with AMMs because every trade changes two things at once:

1. a user's economic exposure
2. the market's estimate of probability

An order-book market represents probability through the best available bids and asks.

An AMM can represent it continuously through the curve itself.

This gives POP several useful properties:

- always-available onchain liquidity
- transparent pricing
- permissionless LP participation
- deterministic execution
- composable positions
- continuous probability discovery

The tradeoff is that passive liquidity can become stale during sudden information changes.

That is the problem OddsShift is designed to explore.

---

# Repository

```text
.
├── contracts/
│   ├── src/                # Prediction-market contracts
│   ├── script/             # Deployment scripts
│   ├── test/               # Active Foundry test suite
│   └── legacy-tests/       # Preserved historical tests
│
├── webapp/
│   ├── src/                # React application
│   └── test/               # Frontend / chain configuration tests
│
├── bot/
│   └── src/                # API, workers and market operations
│
├── packages/
│   └── rpc/                # Shared RPC tooling
│
├── scripts/
│   ├── validate-release.sh
│   └── slither-focused.sh
│
├── submission-evidence/    # Open House submission evidence
├── docs/                   # Technical and security documentation
├── oddsshift.md             # OddsShift mechanism specification
└── README.md
```

---

# Tech Stack

### Smart Contracts

- Solidity `0.8.24`
- Foundry
- OpenZeppelin
- Slither

### Frontend

- React 19
- TypeScript
- Vite
- Wagmi
- Viem
- TanStack Query

### Backend

- TypeScript
- Node.js
- Express
- Prisma
- PostgreSQL

### Target Environment

- Robinhood Chain
- USDG

---

# Validation

The complete Open House release gate can be reproduced from the repository root:

```bash
./scripts/validate-release.sh
```

The validation pipeline checks the active submission surface rather than claiming historical code as current coverage.

### Contracts

```bash
cd contracts

forge fmt --check
forge build
forge test -vvv
```

The active suite covers the current EventMarket contracts, Robinhood deployment preparation and OddsShift flows.

### Security analysis

```bash
./scripts/slither-focused.sh
```

Focused static analysis covers the active Open House contract and deployment surface.

Security triage and accepted findings are documented under `docs/`.

### Frontend

```bash
cd webapp

pnpm install --frozen-lockfile
pnpm exec tsc -b --pretty false
pnpm run lint:active
pnpm build
pnpm audit --prod
pnpm test
```

The Robinhood configuration tests verify expected chain metadata and prevent invalid market-address configuration.

---

# Local Development

### Contracts

```bash
cd contracts
forge install
forge build
forge test
```

### Frontend

```bash
cd webapp
pnpm install
pnpm run dev
```

### Backend

```bash
cd bot
npm install
npm run dev
```

---

# Deployment Status

POP is actively being prepared and validated for the Robinhood Chain / USDG environment.

The repository contains Robinhood-specific configuration, deployment preflight logic and validation tooling.

Passing the local release gate verifies the implementation and configuration; it should not be interpreted by itself as proof of a live production deployment.

Deployment evidence, where applicable, is kept separately under:

[`submission-evidence/`](./submission-evidence/)

---

# Vision

Prediction markets compress disagreement into a price.

POP asks what happens if that market structure is built natively around:

**stablecoin liquidity + AMMs + programmable market microstructure.**

Robinhood Chain and USDG provide the financial base layer.

POP provides the prediction market.

OddsShift explores how its liquidity can survive the moments when information matters most.
