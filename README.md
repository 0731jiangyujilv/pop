# POP

> **An AMM-native prediction market for Robinhood Chain, denominated in USDG.**

POP brings Uniswap-style continuous liquidity to prediction markets.

Instead of relying on an order book and dedicated market makers, POP lets users trade **YES / NO outcomes against onchain AMM liquidity**, turning market prices into continuously updating probabilities.

**Live demo:** https://populab.xyz/robinhood

For **Arbitrum Open House Singapore 2026**, POP is being adapted for **Robinhood Chain + USDG**, together with **OddsShift**, a conditional fee-rebate mechanism designed to protect passive liquidity during information shocks.

---

## Architecture

![POP Architecture](./images/pop_architecture.svg)

---

## Why POP

Prediction markets are markets for information, but most liquidity still depends on active market makers and order books.

When new information arrives, odds can move quickly. Order-book liquidity may widen or disappear, while passive AMM liquidity can remain exposed to stale prices.

POP explores a simpler market structure:

```text
USDG
  ↓
YES / NO AMM
  ↓
continuous trading
  ↓
live market probability
  ↓
resolution
  ↓
USDG settlement
```

Users can trade continuously, enter or exit before resolution, provide liquidity, and redeem winning positions onchain.

---

## Built for Robinhood Chain

For Open House, POP uses **Robinhood Chain** as the target execution environment and **USDG** as the market's collateral and settlement asset.

USDG is used for:

- market collateral
- AMM liquidity
- trading
- fees
- winning-position redemption

A YES price of `0.63 USDG` represents roughly **63% implied probability**.

---

## OddsShift

Prediction markets are especially vulnerable to information shocks: moments when new information rapidly reprices the market.

**OddsShift** is a conditional fee-rebate mechanism designed for these moments.

Every trade provisionally pays:

```text
Base LP fee          0.30%
Protection fee       0.70%
                     -----
Total                1.00%
```

If the price move persists, the protection fee is retained for LPs.

If the move reverses, the 0.70% protection fee is rebated to the trader.

```text
persistent move  → LP protection
reverted move    → trader rebate
```

The mechanism classifies flow **ex post from subsequent market behavior**, without relying on a news oracle or external price feed.

More details: [`oddsshift.md`](./oddsshift.md)

---

## How It Works

1. **Create** — launch a binary YES / NO market.
2. **Bootstrap** — seed the market with USDG liquidity.
3. **Trade** — users buy or sell outcomes against the AMM.
4. **Discover** — prices continuously express implied probability.
5. **Protect liquidity** — OddsShift evaluates rapid repricing.
6. **Resolve** — the final outcome is settled onchain.
7. **Redeem** — winning positions redeem into USDG.

---

## What We Built During Open House

- Robinhood Chain configuration and deployment preparation
- USDG-denominated market flows
- AMM-based YES / NO trading
- liquidity management and settlement
- OddsShift fee escrow and rebate logic
- Robinhood-focused frontend
- Foundry tests and release validation
- focused Slither security analysis

---

## Tech Stack

**Contracts**
- Solidity `0.8.24`
- Foundry
- OpenZeppelin

**Frontend**
- React
- TypeScript
- Wagmi
- Viem

**Backend**
- Node.js
- TypeScript
- Express
- Prisma
- PostgreSQL

**Target**
- Robinhood Chain
- USDG

---

## Run Locally

### Contracts

```bash
cd contracts
forge build
forge test
```

### Frontend

```bash
cd webapp
pnpm install
pnpm run dev
```

### Release Validation

```bash
./scripts/validate-release.sh
```

---

## Vision

Prediction markets compress disagreement into a price.

POP combines **stablecoin liquidity, AMM price discovery, and programmable market microstructure** to make prediction markets continuously tradable onchain.

Robinhood Chain provides the execution layer.  
USDG provides the settlement asset.  
POP provides the market.  
OddsShift protects liquidity when information matters most.
