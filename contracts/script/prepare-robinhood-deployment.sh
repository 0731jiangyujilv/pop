#!/usr/bin/env bash
set -euo pipefail

# Read-only preparation plus Forge simulation. This script never passes
# --broadcast and never publishes the web app.
required=(PRIVATE_KEY ROBINHOOD_RPC_URL USDG_ADDRESS FEE_RECIPIENT OS_INIT_LIQUIDITY)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
done

if [[ "${FEE_RECIPIENT}" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "FEE_RECIPIENT must not be the zero address" >&2
  exit 1
fi
if [[ "${USDG_ADDRESS}" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "USDG_ADDRESS must not be the zero address" >&2
  exit 1
fi
official_usdg="0x7E955252E15c84f5768B83c41a71F9eba181802F"
if [[ "${USDG_ADDRESS,,}" != "${official_usdg,,}" ]]; then
  echo "USDG_ADDRESS does not match the official Paxos Robinhood Testnet deployment" >&2
  exit 1
fi
if [[ ! "${OS_INIT_LIQUIDITY}" =~ ^[1-9][0-9]*$ ]]; then
  echo "OS_INIT_LIQUIDITY must be a positive integer in USDG base units" >&2
  exit 1
fi

chain_id="$(cast chain-id --rpc-url "${ROBINHOOD_RPC_URL}")"
if [[ "${chain_id}" != "46630" ]]; then
  echo "Wrong RPC chain ID: expected 46630, received ${chain_id}" >&2
  exit 1
fi

deployer="$(cast wallet address --private-key "${PRIVATE_KEY}")"
gas_balance="$(cast balance "${deployer}" --rpc-url "${ROBINHOOD_RPC_URL}")"
if [[ "${gas_balance}" == "0" ]]; then
  echo "Deployer has no ETH for gas" >&2
  exit 1
fi

code="$(cast code "${USDG_ADDRESS}" --rpc-url "${ROBINHOOD_RPC_URL}")"
if [[ "${code}" == "0x" ]]; then
  echo "USDG_ADDRESS has no contract bytecode" >&2
  exit 1
fi

symbol="$(cast call "${USDG_ADDRESS}" 'symbol()(string)' --rpc-url "${ROBINHOOD_RPC_URL}" | tr -d '"')"
decimals="$(cast call "${USDG_ADDRESS}" 'decimals()(uint8)' --rpc-url "${ROBINHOOD_RPC_URL}" | awk '{print $1}')"
usdg_balance="$(cast call "${USDG_ADDRESS}" 'balanceOf(address)(uint256)' "${deployer}" --rpc-url "${ROBINHOOD_RPC_URL}" | awk '{print $1}')"
if [[ "${symbol}" != "USDG" ]]; then
  echo "Collateral symbol is ${symbol}, not USDG" >&2
  exit 1
fi
if [[ "${decimals}" != "6" ]]; then
  echo "USDG decimals are ${decimals}, expected 6" >&2
  exit 1
fi
if (( usdg_balance < OS_INIT_LIQUIDITY )); then
  echo "Deployer USDG balance is below OS_INIT_LIQUIDITY" >&2
  exit 1
fi

implementation_slot="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
implementation_word="$(cast storage "${USDG_ADDRESS}" "${implementation_slot}" --rpc-url "${ROBINHOOD_RPC_URL}")"
implementation="0x${implementation_word: -40}"
implementation_code="$(cast code "${implementation}" --rpc-url "${ROBINHOOD_RPC_URL}")"
if [[ "${implementation}" == "0x0000000000000000000000000000000000000000" || "${implementation_code}" == "0x" ]]; then
  echo "USDG proxy implementation slot is empty or has no bytecode" >&2
  exit 1
fi

echo "Robinhood deployment preflight"
echo "  deployer:          ${deployer}"
echo "  chain ID:          ${chain_id}"
echo "  collateral:        ${USDG_ADDRESS} (${symbol}, ${decimals} decimals)"
echo "  proxy implementation: ${implementation}"
echo "  initial liquidity: ${OS_INIT_LIQUIDITY}"
echo "  fee recipient:     ${FEE_RECIPIENT}"
echo "  gas balance wei:   ${gas_balance}"
echo "  USDG balance:      ${usdg_balance}"

forge fmt --check \
  src/deployment/RobinhoodDeploymentPreflight.sol \
  script/DeployRobinhoodEventMarketV2.s.sol \
  test/RobinhoodDeploymentPreflight.t.sol

stale_tests=(
  test/Bet.t.sol
  test/BetFactory.t.sol
  test/BetPoR.t.sol
  test/EventBet.t.sol
  test/PredictionMarket.t.sol
  test/PriceOracleFactory.t.sol
  test/UpDownMarket.t.sol
)
skip_args=()
for path in "${stale_tests[@]}"; do
  skip_args+=(--skip "${path}")
done

forge build "${skip_args[@]}"
forge test --match-path 'test/RobinhoodDeploymentPreflight.t.sol' "${skip_args[@]}" -vv
forge test --match-path 'test/EventMarketV2.t.sol' "${skip_args[@]}" -vvv

forge script script/DeployRobinhoodEventMarketV2.s.sol:DeployRobinhoodEventMarketV2 \
  --rpc-url "${ROBINHOOD_RPC_URL}" \
  -vvv

echo "Dry run complete. No transaction was broadcast."
