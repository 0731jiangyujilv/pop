## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

部署 BetFactory 合约到 Base Sepolia 测试网：

```shell
# 设置环境变量
export PRIVATE_KEY=<your_private_key>
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
export BASESCAN_API_KEY=<your_basescan_api_key>

# 部署合约
forge create --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --etherscan-api-key $BASESCAN_API_KEY \
  --broadcast \
  --verify \
  src/BetFactory.sol:BetFactory
```

或者使用脚本部署：

```shell
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

### Initialize BetFactory

部署后需要配置 BetFactory 才能使用：

```shell
# 1. 设置支持的代币（USDC）
cast send $BET_FACTORY_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  "setSupportedToken(address,bool)" \
  0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  true

# 2. 设置价格源（BTC/USD）
cast send $BET_FACTORY_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  "setPriceFeed(string,address)" \
  "BTC/USD" \
  0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298

# 3. 设置价格源（ETH/USD）
cast send $BET_FACTORY_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  "setPriceFeed(string,address)" \
  "ETH/USD" \
  0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1

# 4. 设置费用（可选，默认为 0）
# 例如设置 2.5% 费用 (250 basis points)
cast send $BET_FACTORY_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  "setFee(uint256,address)" \
  250 \
  <fee_recipient_address>

# 5. 设置价格源（VIRTUAL/USD）
cast send $BET_FACTORY_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  "setPriceFeed(string,address)" \
  "VIRTUAL/USD" \
  <virtual_price_oracle_address>
```

### Verify

验证已部署的合约：

```shell
# 验证 BetFactory
forge verify-contract \
  --chain-id 84532 \
  --etherscan-api-key $BASESCAN_API_KEY \
  <contract_address> \
  src/BetFactory.sol:BetFactory

# 验证 Bet 合约（需要构造函数参数）
forge verify-contract \
  --chain-id 84532 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,uint256,uint256,uint256,uint256,address,address,uint256,address)" <token> <minAmount> <maxAmount> <duration> <bettingDeadline> <priceFeed> <creator> <feeBps> <feeRecipient>) \
  <contract_address> \
  src/Bet.sol:Bet
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
