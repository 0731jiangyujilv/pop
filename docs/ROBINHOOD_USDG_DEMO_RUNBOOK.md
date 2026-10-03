# Robinhood USDG Demo Runbook

This runbook covers the existing, window-based OddsShift mechanism. It does not describe or imply a three-checkpoint median design. All commands below are preparation instructions; none were broadcast or published while producing this repository state.

## 1. Prerequisites and funding

Use Node 22.21 or newer, pnpm 11, and Foundry 1.7.1 or compatible versions. Install the web dependencies from `webapp/` with `pnpm install --frozen-lockfile` and the Foundry dependencies from `contracts/` with `forge install`.

Configure these environment variables without committing them:

- `PRIVATE_KEY`: approved deployer key; never echo or place its literal value in a command.
- `ROBINHOOD_RPC_URL`: `https://rpc.testnet.chain.robinhood.com` or an approved override serving chain 46630.
- `USDG_ADDRESS`: official Robinhood Testnet USDG proxy address.
- `FEE_RECIPIENT`: nonzero platform fee recipient.
- `OS_INIT_LIQUIDITY`: positive USDG base-unit seed amount.
- Optional existing `OS_*` market parameters documented in the deployment plan.

Before using a key, fund the deployer with testnet ETH and USDG through the official Robinhood testnet faucet at <https://faucet.testnet.chain.robinhood.com/>. Confirm the faucet currently offers the required assets; never replace unavailable USDG with a mock. The repository must stop before deployment if the deployer lacks either asset.

## 2. Read-only checks and dry run

From `contracts/`, after explicit approval to use the configured key:

```bash
./script/prepare-robinhood-deployment.sh
```

The script verifies chain ID, fee recipient, liquidity, ETH, official USDG bytecode/metadata/balance, and its EIP-1967 implementation slot. It runs focused formatting, compilation, 11 deployment-guard tests, 27 USDG/OddsShift tests, and a Forge simulation. It deliberately has no `--broadcast` flag.

The equivalent final dry-run command is:

```bash
forge script script/DeployRobinhoodEventMarketV2.s.sol:DeployRobinhoodEventMarketV2 \
  --rpc-url "$ROBINHOOD_RPC_URL" \
  -vvv
```

Review the printed deployer, chain ID `46630`, USDG address, fee recipient, initial liquidity, question, fees, thresholds, window sizes, cooldown, gas estimate, and simulated market address. Any mismatch is a stop condition.

## 3. Proposed broadcast — NOT EXECUTED

Run only after explicit approval and a clean dry run:

```bash
forge script script/DeployRobinhoodEventMarketV2.s.sol:DeployRobinhoodEventMarketV2 \
  --rpc-url "$ROBINHOOD_RPC_URL" \
  --broadcast \
  -vvv
```

Record the deployment transaction, receipt, block, deployed market, seed-liquidity transfer, parameters, and post-deployment reads. Then set `VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS` to the verified market address for a local production build. Do not publish yet.

## 4. Blockscout verification — NOT EXECUTED

The repository compiles with Solidity 0.8.24, optimizer enabled for 200 runs, and `via_ir = true`. Obtain the constructor tuple from the dry-run/broadcast artifact and encode it exactly; do not change compiler settings or bytecode to make verification pass.

```bash
forge verify-contract "$VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS" \
  src/EventMarketV2.sol:EventMarketV2 \
  --chain-id 46630 \
  --verifier blockscout \
  --verifier-url 'https://explorer.testnet.chain.robinhood.com/api/' \
  --compiler-version 0.8.24 \
  --num-of-optimizations 200 \
  --via-ir \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --watch
```

Blockscout documents Foundry verification at <https://docs.blockscout.com/devs/verification/foundry-verification>. If the Robinhood instance rejects the endpoint or settings, capture the exact response and stop; do not recompile with different settings.

## 5. Local `/robinhood` demo

From `webapp/`:

```bash
VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS="$MARKET_ADDRESS" \
VITE_ROBINHOOD_RPC_URL="$ROBINHOOD_RPC_URL" \
pnpm build

pnpm preview
```

Open `/robinhood` and perform this sequence:

1. Confirm the page badge says Robinhood Chain Testnet, collateral says USDG, and the displayed market and collateral links open the Robinhood explorer.
2. Connect the demo wallet. If it is on another network, use `Switch to Robinhood Chain Testnet` and confirm chain ID 46630.
3. Confirm the wallet has ETH and USDG. The page must not show a token faucet button.
4. Enter a USDG trade and review the quoted outcome tokens, base fee retained for LPs, and refundable protection amount before confirming.
5. Open the transaction link and show the probability movement and escrowed amount.
6. Execute the current window mechanism's follow-up trades: a `lookback`-trade displacement opens a mark; the next `observeWindow` trades either bring price inside the threshold or leave it displaced.
7. For a reverted mark, show the trader's credited refund and claim it. For a toxic mark, show qualifying same-direction protection fees credited to LPs while correctors/minor trades are refunded, then claim the LP reward.
8. If the queue is quiet, wait for the configured cooldown and use the permissionless stale-resolution action.
9. Run only the supported admin resolution path after its deadline, then show pair redemption or final settlement payout and the related explorer links.

## 6. Frontend publishing — NOT EXECUTED

No hosting platform, frontend production domain, SPA rewrite file, or deployment workflow is present in this repository. `https://populab.xyz` is configured as a backend API URL and is not evidence of the frontend host. Before publishing:

1. Identify the existing frontend hosting project and domain outside the repository.
2. Set `VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS` and, if required, `VITE_ROBINHOOD_RPC_URL` in that project's build environment.
3. Configure the provider's SPA fallback so direct requests to `/robinhood` serve `webapp/index.html`; do not change DNS or ownership.
4. Build with the repository's locked pnpm dependencies and verify the generated bundle contains no secret values.
5. Preview the release at the provider's non-production URL and repeat the route checks.
6. After separate approval, publish through the existing provider workflow. The eventual URL is `https://<verified-existing-domain>/robinhood`.

## 7. Evidence and rollback

Complete the evidence checklist in `docs/ROBINHOOD_USDG_DEPLOYMENT_PLAN.md`. Before broadcast, rollback by unsetting environment variables or reverting the local commits. After broadcast, the contract cannot be removed; disable the frontend address and roll back the hosting release without changing DNS. Preserve all transaction and verification evidence.
