# POP Protocol

POP Protocol is a prediction-market platform for creating, trading, and resolving event-based yes/no markets onchain. The project combines a Solidity smart-contract system, a TypeScript backend, a React web app, and supporting documentation to enable a market-making flow for event outcomes, liquidity provision, and automated settlement.

This repository contains the core platform logic and the surrounding tooling used to operate it in a multi-chain environment.

## Judge validation (October 4 submission)

A fresh clone can reproduce the active release gate from the repository root. The same commands are what CI runs. They do **not** deploy, broadcast, verify a contract, publish the frontend, or imply that Robinhood/USDG production deployment has occurred.

```bash
./scripts/validate-release.sh
```

The script fails immediately on the first failed check. Equivalently, run the steps below by hand.

### 1. Active / default Foundry suite

From `contracts/`:

```bash
forge fmt --check
forge build
forge test -vvv
```

This is the only executable Solidity suite. It currently covers EventMarket V1, EventMarketV2, Robinhood deployment preflight, the Robinhood deploy script, and OddsShift flow scripts. Default `forge test -vvv` must report zero failures and zero skipped tests.

### 2. Preserved historical legacy tests

Seven removed-module suites live under `contracts/legacy-tests/` and are documented in `contracts/legacy-tests/README.md` and `docs/FOUNDRY_TEST_BASELINE.md`. They are **not** part of the default suite and **do not pass**: the production contracts they import were removed before this release gate. Do not treat them as green coverage.

### 3. Security / static analysis

```bash
./scripts/slither-focused.sh
```

The focused scan covers `EventMarketV2`, `RobinhoodDeploymentPreflight`, and `DeployRobinhoodEventMarketV2`. Triage, including accepted rounding and false-positive detectors, is in `docs/EVENT_MARKET_V2_SECURITY_TRIAGE.md`.

### 4. Frontend validation

From `webapp/`:

```bash
pnpm install --frozen-lockfile
pnpm exec tsc -b --pretty false
pnpm run lint:active
pnpm build
pnpm audit --prod
```

`pnpm lint` is the full-repository ESLint command. Historical pages that are not reachable from `/robinhood` can fail it. The release gate uses `pnpm run lint:active`, which lints the `/robinhood` import graph: `src/main.tsx`, shared shell modules, the OddsShift page, every file those modules import, Robinhood configuration, and `test/robinhood-config.test.ts`.

### 5. Robinhood configuration validation

```bash
cd webapp
pnpm test
```

These tests pin Robinhood Chain Testnet metadata and reject an invalid or zero market address. They do not talk to a live chain.

## Overview

The system is built around the idea of turning real-world questions into live, onchain markets:

- Users can create or trade yes/no markets around events and assets
- Liquidity providers can supply USDG to market pools and earn fees
- Prices are derived from AMM logic rather than an order book
- Markets resolve to a final outcome and settle winners in USDG
- Backend services monitor chain state, oracles, referrals, and user activity

The repo is organized into four main parts:

- `contracts/` — Solidity market contracts and deployment scripts
- `bot/` — TypeScript backend, API, workers, and chain integrations
- `webapp/` — React + Vite frontend for the user interface
- `documentation/` — product docs and concept notes

## Core Product Concepts

### Event markets

Markets are modeled as AMM-based yes/no tokens backed by USDG. A market can be created with a question, schedule, and collateral. The contract structure allows:

- trading YES and NO positions
- adding or removing liquidity
- reading live market state and statistics
- settling a winner and distributing payouts

### OddsShift

The project also includes a market-design note in [oddsshift.md](oddsshift.md) describing a fee and protection model for toxic flow and stale liquidity. The concept centers on dynamically assessing whether prior trades were harmful to LPs and adjusting settlement behavior accordingly.

### Multi-chain readiness

The backend is configured to support multiple supported chains, including Base Sepolia and Arc Testnet. Chain configuration is centralized and can be extended for additional deployment environments.

## Repository Structure

```text
.
├── bot/                          # Backend service and automation
│   ├── src/                      # TypeScript application code
│   ├── prisma/                   # Prisma schema and migrations
│   ├── config/                   # Market configuration data
│   ├── scripts/                  # Operational scripts
│   ├── package.json              # Backend dependencies and scripts
│   └── tsconfig*.json            # TypeScript project config
├── contracts/                    # Solidity contracts and Foundry setup
│   ├── src/                      # Market and factory contracts
│   ├── script/                   # Deployment scripts
│   ├── test/                     # Foundry tests
│   ├── foundry.toml              # Foundry configuration
│   └── README.md                 # Foundry usage notes
├── webapp/                       # Frontend application
│   ├── src/                      # React app source
│   ├── public/                   # Static assets
│   ├── package.json              # Frontend dependencies and scripts
│   └── vite.config.ts            # Vite configuration
├── documentation/                # Docs site content and guides
├── packages/                     # Shared RPC utilities / package helpers
├── oddsshift.md                  # Market mechanism concept note
├── .gitmodules                   # Submodule config
├── README.md                     # Project overview
└── ...
```

## Tech Stack

### Smart contracts

- Solidity 0.8.24
- Foundry
- OpenZeppelin contracts
- Multi-chain deployment support

### Backend

- TypeScript
- Node.js
- Express
- Prisma ORM
- PostgreSQL
- Viem for blockchain interaction
- Telegram/X integration support
- SIWE-based wallet authentication

### Frontend

- React 19
- Vite
- TypeScript
- React Router
- Web3 wallet tooling via Wagmi and Viem
- TanStack Query

## Key Features

- Onchain prediction markets backed by USDG
- Liquidity provision and AMM-based pricing
- Market settlement and payout flows
- Wallet authentication and session handling
- Referral and attribution tracking
- Portfolio analytics and user P&L history
- Multi-chain configuration and operational tooling
- Telegram/X bot support for market creation and user interactions
- Oracle registry and verification workflow for market data feeds

## Smart Contract Layer

The Solidity system is centered on event-based market contracts and factory patterns.

Important contract areas include:

- `EventMarket.sol` — main event market contract
- `EventMarketFactory.sol` — factory for market deployment
- additional contract modules for prediction markets, price oracles, and market infrastructure

These contracts implement the pricing, liquidity, settlement, and admin logic used by the platform.

## Backend Responsibilities

The TypeScript backend in `bot/` provides the operational layer behind the platform. It is responsible for:

- serving the API for webapp requests
- tracking blockchain state
- connecting to supported chains
- handling auth and signed sessions
- reading and aggregating market data
- monitoring settlements and verification jobs
- integrating with Telegram/X automation flows
- storing state in PostgreSQL via Prisma

The API includes endpoints for:

- health checks
- chain metadata
- auth and signer verification
- portfolio aggregation
- referral tracking
- swarm/oracle-related telemetry

## Frontend Responsibilities

The React app in `webapp/` is the user-facing dashboard and market interface. It supports:

- market browsing by category
- wallet-aware auth flow
- portfolio tracking
- market stats and detail views
- liquidity pages and result views
- route-based navigation for multiple market types

## Setup and Local Development

### 1. Install dependencies

Backend:

```bash
cd bot
npm install
```

Frontend:

```bash
cd webapp
npm install
```

Contracts:

```bash
cd contracts
forge install
forge build
```

### 2. Configure environment variables

The backend reads configuration from `bot/src/common/env` and expects environment secrets such as:

- `DATABASE_URL`
- `BOT_PRIVATE_KEY`
- `JWT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `BASESCAN_API_KEY`
- `X_API_BEARER_TOKEN`
- `X_API_ACCESS_TOKEN`
- `X_API_CONSUMER_KEY`
- `X_API_CONSUMER_SECRET`
- `X_API_ACCESS_TOKEN_SECRET`

A local config example is defined in `bot/src/common/env/local.ts`.

### 3. Initialize the database

```bash
cd bot
npm run db:generate
npm run db:push
```

You may also use Prisma migrations when preparing a fresh database setup:

```bash
npm run db:migrate
```

### 4. Run the services

Start the backend service:

```bash
cd bot
npm run dev
```

Start the frontend:

```bash
cd webapp
npm run dev
```

Build the backend:

```bash
cd bot
npm run build
```

Build the frontend:

```bash
cd webapp
npm run build
```

### 5. Run contracts tests

```bash
cd contracts
forge test
```

## Operational Notes

- The project is designed for a multi-chain deployment model with chain identifiers and contract addresses configured centrally.
- Verification, settlement, monitoring, and oracle tasks are handled by background workers and scripts.
- The platform includes both event-driven and polling-based job execution patterns.
- The app has explicit support for auth, referral attribution, and user-specific portfolio history.

## Documentation

Additional details can be found in the project docs under the `documentation/` folder and in the concept notes such as [oddsshift.md](oddsshift.md).

## License

This repository currently appears to be a proprietary or closed project, and no explicit license file is present in the root of the workspace. Please confirm the intended license before public distribution or commercial reuse.

## Summary

POP Protocol is a full-stack prediction-market platform combining blockchain contracts, a background service layer, and a user-facing app to enable transparent event trading, AMM-based pricing, and onchain settlement. The project is structured for extensibility across multiple chains and supports both market operations and ecosystem automation.
