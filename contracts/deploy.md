# Deployment Guide

All deploy commands use Foundry (`forge script`). Before deploying, configure `contracts/.env` (see `.env.example`).

## Prerequisites

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Build contracts
forge build

# Copy and fill in env
cp .env.example .env
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `PRIVATE_KEY` | Deployer wallet private key | Yes |
| `USDC_ADDRESS` | USDC token address on target chain | Yes |
| `FEE_BPS` | Fee in basis points (default: 250 = 2.5%) | No |
| `FEE_RECIPIENT` | Address receiving fees | Yes |
| `PRICE_ORACLE_FACTORY_OWNER` | Oracle factory owner (default: deployer) | No |
| `DEFAULT_ORACLE_REPORTER` | Address allowed to push prices (default: owner) | No |
| `SEED_DEFAULT_ORACLES` | Auto-seed BTC/LINK/VIRTUAL oracles (default: true) | No |
| `BTC_PRICE_ORACLE_ADDRESS` | Existing BTC oracle (BetFactory-only deploy) | No |
| `LINK_PRICE_ORACLE_ADDRESS` | Existing LINK oracle (BetFactory-only deploy) | No |
| `VIRTUAL_PRICE_ORACLE_ADDRESS` | Existing VIRTUAL oracle (BetFactory-only deploy) | No |
| `FORWARDER_ADDRESS` | Forwarder address (BetPoR deploy only) | For PoR |

### Per-Chain USDC Addresses

| Chain | USDC Address |
|---|---|
| Base Sepolia (84532) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base Mainnet (8453) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Arc Testnet (5042002) | TBD |

---

## Deploy Scripts

There are 4 deployment scripts:

| Script | What it deploys |
|---|---|
| `DeployFullStack.s.sol` | PriceOracleFactory + BetFactory + seeds oracles + wires everything |
| `DeployBetFactory.s.sol` | BetFactory only (requires existing oracle addresses) |
| `DeployPriceOracleFactory.s.sol` | PriceOracleFactory only (optionally seeds default oracles) |
| `DeployBetPoR.s.sol` | BetPoR (Proof of Reserve) contract |

**For a fresh chain, use `DeployFullStack`** — it deploys everything in one go.

---

## Base Sepolia (Chain ID: 84532)

### Full Stack (recommended for first deploy)

```bash
# From repo root:
npm run contracts:deploy:full-stack:base-sepolia

# Or directly:
cd contracts && source .env && \
forge script script/DeployFullStack.s.sol:DeployFullStack \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 84532
```

### BetFactory Only (with existing oracles)

```bash
npm run contracts:deploy:base-sepolia

# Or directly:
cd contracts && source .env && \
forge script script/DeployBetFactory.s.sol:DeployBetFactory \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 84532
```

### PriceOracleFactory Only

```bash
npm run contracts:deploy:oracle-factory:base-sepolia

# Or directly:
cd contracts && source .env && \
forge script script/DeployPriceOracleFactory.s.sol:DeployPriceOracleFactory \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 84532
```

### BetPoR (Proof of Reserve)

```bash
npm run contracts:deploy:por:base-sepolia

# Or directly:
cd contracts && source .env && \
forge script script/DeployBetPoR.s.sol:DeployBetPoR \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 84532
```

### Verify Existing Contracts

```bash
# BetFactory
forge verify-contract \
  --chain-id 84532 \
  --verifier-url 'https://api.etherscan.io/v2/api?chainid=84532' \
  --etherscan-api-key $BASESCAN_API_KEY \
  <contract_address> \
  src/BetFactory.sol:BetFactory

# PriceOracleFactory (constructor: address owner)
forge verify-contract \
  --chain-id 84532 \
  --verifier-url 'https://api.etherscan.io/v2/api?chainid=84532' \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" <owner_address>) \
  <contract_address> \
  src/PriceOracleFactory.sol:PriceOracleFactory
```

---

## Base Mainnet (Chain ID: 8453)

> **Important:** This is mainnet — double-check your `.env` values. Use real USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).

### Full Stack

```bash
npm run contracts:deploy:full-stack:base-mainnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployFullStack.s.sol:DeployFullStack \
  --rpc-url $BASE_MAINNET_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 8453
```

### BetFactory Only

```bash
npm run contracts:deploy:base-mainnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployBetFactory.s.sol:DeployBetFactory \
  --rpc-url $BASE_MAINNET_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 8453
```

### PriceOracleFactory Only

```bash
npm run contracts:deploy:oracle-factory:base-mainnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployPriceOracleFactory.s.sol:DeployPriceOracleFactory \
  --rpc-url $BASE_MAINNET_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 8453
```

### BetPoR

```bash
npm run contracts:deploy:por:base-mainnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployBetPoR.s.sol:DeployBetPoR \
  --rpc-url $BASE_MAINNET_RPC_URL \
  --verify \
  --broadcast \
  --chain-id 8453
```

### Verify Existing Contracts

```bash
# BetFactory
forge verify-contract \
  --chain-id 8453 \
  --verifier-url 'https://api.etherscan.io/v2/api?chainid=8453' \
  --etherscan-api-key $BASESCAN_API_KEY \
  <contract_address> \
  src/BetFactory.sol:BetFactory

# PriceOracleFactory
forge verify-contract \
  --chain-id 8453 \
  --verifier-url 'https://api.etherscan.io/v2/api?chainid=8453' \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address)" <owner_address>) \
  <contract_address> \
  src/PriceOracleFactory.sol:PriceOracleFactory
```

---

## Arc Testnet (Chain ID: 5042002)

> **Note:** Arc Testnet is a custom/private testnet. RPC URL and explorer details TBD. No `--verify` flag since block explorer may not support it yet.

### Full Stack

```bash
npm run contracts:deploy:full-stack:arc-testnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployFullStack.s.sol:DeployFullStack \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  --chain-id 5042002
```

### BetFactory Only

```bash
npm run contracts:deploy:arc-testnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployBetFactory.s.sol:DeployBetFactory \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  --chain-id 5042002
```

### PriceOracleFactory Only

```bash
npm run contracts:deploy:oracle-factory:arc-testnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployPriceOracleFactory.s.sol:DeployPriceOracleFactory \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  --chain-id 5042002
```

### BetPoR

```bash
npm run contracts:deploy:por:arc-testnet

# Or directly:
cd contracts && source .env && \
forge script script/DeployBetPoR.s.sol:DeployBetPoR \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  --chain-id 5042002
```

### Verify (when explorer is available)

```bash
# Add Arc Testnet explorer to foundry.toml [etherscan] section, then:
forge verify-contract \
  --chain-id 5042002 \
  --verifier-url '<arc_explorer_api_url>' \
  --etherscan-api-key $ARC_EXPLORER_API_KEY \
  <contract_address> \
  src/BetFactory.sol:BetFactory
```

---

## Post-Deployment Checklist

After deploying to a new chain, update these config files:

1. **`contracts/.env`** — record deployed addresses
2. **`bot/.env`** — set `CHAIN_<ID>_BET_FACTORY_ADDRESS` and `CHAIN_<ID>_PRICE_ORACLE_FACTORY_ADDRESS`
3. **`webapp/.env`** — set `VITE_<CHAIN>_BET_FACTORY_ADDRESS`

### Manual Post-Deploy Config (if needed)

If you need to add oracles or tokens after deployment:

```bash
# Add a supported token
cast send <BET_FACTORY_ADDRESS> \
  --rpc-url <RPC_URL> \
  --private-key $PRIVATE_KEY \
  "setSupportedToken(address,bool)" <TOKEN_ADDRESS> true

# Add a price feed
cast send <BET_FACTORY_ADDRESS> \
  --rpc-url <RPC_URL> \
  --private-key $PRIVATE_KEY \
  "setPriceFeed(string,address)" "<ASSET_PAIR>" <ORACLE_ADDRESS>

# Set fees
cast send <BET_FACTORY_ADDRESS> \
  --rpc-url <RPC_URL> \
  --private-key $PRIVATE_KEY \
  "setFee(uint256,address)" <FEE_BPS> <FEE_RECIPIENT>

# Add an oracle reporter
cast send <PRICE_ORACLE_FACTORY_ADDRESS> \
  --rpc-url <RPC_URL> \
  --private-key $PRIVATE_KEY \
  "setOracleReporter(string,address,bool)" "<ASSET_PAIR>" <REPORTER_ADDRESS> true
```

---

## npm Scripts Summary

All available from the repo root:

| Script | Chain | What |
|---|---|---|
| `npm run contracts:deploy:full-stack:base-sepolia` | Base Sepolia | Full stack deploy |
| `npm run contracts:deploy:base-sepolia` | Base Sepolia | BetFactory only |
| `npm run contracts:deploy:oracle-factory:base-sepolia` | Base Sepolia | PriceOracleFactory only |
| `npm run contracts:deploy:por:base-sepolia` | Base Sepolia | BetPoR |
| `npm run contracts:deploy:full-stack:base-mainnet` | Base Mainnet | Full stack deploy |
| `npm run contracts:deploy:base-mainnet` | Base Mainnet | BetFactory only |
| `npm run contracts:deploy:oracle-factory:base-mainnet` | Base Mainnet | PriceOracleFactory only |
| `npm run contracts:deploy:por:base-mainnet` | Base Mainnet | BetPoR |
| `npm run contracts:deploy:full-stack:arc-testnet` | Arc Testnet | Full stack deploy |
| `npm run contracts:deploy:arc-testnet` | Arc Testnet | BetFactory only |
| `npm run contracts:deploy:oracle-factory:arc-testnet` | Arc Testnet | PriceOracleFactory only |
| `npm run contracts:deploy:por:arc-testnet` | Arc Testnet | BetPoR |
