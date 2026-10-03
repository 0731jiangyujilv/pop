# Robinhood Chain Testnet USDG Deployment Plan

Retrieved and verified on 2026-10-03. This plan prepares POP's existing, window-based OddsShift implementation for a Robinhood Chain Testnet demo. It does not deploy a contract, broadcast a transaction, publish the web app, change DNS, replace the backend URL, or change the OddsShift mechanism.

## Scope

- Add Robinhood Chain Testnet as a first-class web and Foundry target without changing the default chain for unrelated pages.
- Use the official Robinhood Testnet USDG token as market collateral, liquidity collateral, refundable-fee escrow, trader refunds, and LP-protection payouts.
- Add `/robinhood` and `/robinhood/:contractAddress` while preserving `/oddsshift/:contractAddress` and every existing route.
- Make reads route-pinned, require chain 46630 for writes, and fail closed when the configured market address is absent or invalid.
- Prepare repeatable preflight, dry-run, verification, and demo instructions. Broadcasting and publishing remain separate, explicitly approved actions.

## Verified network and USDG facts

Robinhood's official network documentation lists chain ID `46630`, RPC `https://rpc.testnet.chain.robinhood.com`, explorer `https://explorer.testnet.chain.robinhood.com`, and ETH as the native gas token:

- <https://docs.robinhood.com/chain/add-network-to-wallet/>
- <https://robinhood.com/us/en/support/articles/robinhood-chain-testnet/>

Paxos' official test-network registry lists Robinhood Testnet USDG at `0x7E955252E15c84f5768B83c41a71F9eba181802F`:

- <https://docs.paxos.com/guides/stablecoin/usdg/testnet>

Read-only RPC validation on 2026-10-03 established that the address has bytecode, returns `USDG` from `symbol()`, returns `6` from `decimals()`, and supports `totalSupply`, `balanceOf`, `allowance`, `approve`, `transfer`, and `transferFrom`. The deployed bytecode is an EIP-1967 proxy. Its implementation slot points to `0xF0863D7A29a55d0c4263c11bFac754312ff078DF`.

The token address may be used by deployment tooling only after the same preflight is rerun against the selected RPC. A dry run and broadcast must additionally prove that the selected deployer has nonzero ETH and at least `OS_INIT_LIQUIDITY` USDG. Those wallet-dependent checks cannot be completed while preparing the repository and must remain hard deployment gates.

## Contract deployment flow

1. Load `ROBINHOOD_RPC_URL`, `USDG_ADDRESS`, `FEE_RECIPIENT`, `OS_INIT_LIQUIDITY`, and the existing `OS_*` market parameters. Keep `PRIVATE_KEY` outside source control and logs.
2. Derive the deployer address in-memory. Do not print the key.
3. Require RPC chain ID 46630, nonzero fee recipient, nonzero initial liquidity, and a nonzero USDG address with bytecode.
4. Require token symbol `USDG`, supported decimals, working ERC-20 reads, sufficient deployer USDG, and nonzero deployer ETH.
5. Run formatting, build, and relevant tests before simulation.
6. Simulate `DeployEventMarketV2` without `--broadcast`. The script deploys one market, transfers the configured USDG seed to it, and initializes the existing accounting.
7. Review the simulated deployer, chain ID, collateral, liquidity, fee recipient, market parameters, and gas estimate.
8. Only after separate user approval, run the documented command containing `--broadcast`. Verification is a separate step and must use the exact compiler settings in `contracts/foundry.toml`.

`EventMarketV2` retains its existing `usdc` immutable and accounting identifiers to avoid unnecessary bytecode and behavior changes. Robinhood deployment inputs and user-facing text use generic collateral terminology or USDG. All collateral, liquidity, fee escrow, rebates, LP rewards, redemptions, and settlement continue to flow through that single immutable ERC-20.

## Frontend routing flow

- `/oddsshift/:contractAddress` remains the Arc Testnet demo and may retain its mock-only faucet.
- `/robinhood` resolves its market only from `VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS`.
- `/robinhood/:contractAddress` permits explicit address testing but still pins every read and write to chain 46630.
- Missing, malformed, or zero market addresses render a deployment-not-configured state and issue no contract reads.
- The Robinhood route shows USDG and market addresses, explorer links, USDG wallet balance, probability, trade quote, refundable and retained amounts, and settlement status.
- A mismatched wallet gets a `Switch to Robinhood Chain Testnet` action. Reads never follow the wallet and never fall back to Arc or another configured chain.
- No mock `faucet()` action is rendered or invoked on the Robinhood route.
- Existing backend configuration, including `https://populab.xyz`, is unchanged because it is an API URL rather than proof of the frontend domain.

## Environment variables

Contract preparation:

- `PRIVATE_KEY`: deployer key, supplied only to an explicitly approved dry run or broadcast environment; never committed.
- `ROBINHOOD_RPC_URL`: optional override of the official public RPC.
- `USDG_ADDRESS`: official collateral token address; the preflight rejects missing, malformed, zero, non-contract, or wrong-metadata values.
- `FEE_RECIPIENT`: nonzero platform fee recipient.
- `OS_INIT_LIQUIDITY`: nonzero amount in USDG base units.
- Existing `OS_BASE_FEE_BPS`, `OS_PROTECTION_FEE_BPS`, `OS_JUMP_THRESHOLD`, `OS_CONTRIB_THRESHOLD`, `OS_LOOKBACK`, `OS_OBSERVE_WINDOW`, `OS_COOLDOWN`, `OS_BETTING_HOURS`, and `OS_QUESTION` variables.

Web app:

- `VITE_ROBINHOOD_RPC_URL`: optional browser RPC override.
- `VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS`: deployed market; left unset until an approved deployment is complete.

## Security checks

- Reject chain IDs other than 46630 and all missing, malformed, or zero production addresses.
- Validate collateral bytecode, symbol, decimals, ERC-20 behavior, balances, and the proxy implementation relationship before deployment.
- Require sufficient ETH and USDG before simulation or broadcast.
- Preserve SafeERC20 transfers, reentrancy protection, fee limits, accounting invariants, and the current OddsShift economics.
- Run contract unit, fuzz, and invariant checks; frontend type checking, lint, and production build; Slither and dependency audit when available; and source/generated-output secret scans.
- Never log a private key, commit `.env`, label a mock as USDG, or weaken a check to make deployment pass.

## Stop conditions

Stop and request explicit approval before using a private key, broadcasting any transaction, deploying real or mock tokens, deploying the market, publishing the web app, modifying DNS or a production domain, pushing, merging, opening a pull request, changing remote Git state, weakening an invariant/security check, changing the OddsShift mechanism, or overwriting unrelated work.

Also stop before deployment if the official USDG address cannot be revalidated, the deployer lacks ETH or sufficient USDG, an address is unset/invalid, simulation or tests fail, or the target hosting platform/domain remains unverified. In those cases the web route must stay visibly unconfigured rather than use a mock or unrelated market.

## Rollback

Before broadcast, rollback means reverting only the local Robinhood commits or unsetting the Robinhood environment variables. No chain action exists to undo.

After an approved deployment, contracts are immutable: rollback means remove or replace `VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS`, rebuild, and publish only after separate approval. Preserve the deployed address and transaction evidence for audit. If a frontend release must be rolled back, restore the previous hosting release using the hosting provider's native rollback; do not change DNS. Never present an abandoned deployment as active.

## Post-deployment evidence checklist

- Approved deployer address; preflight timestamp; chain ID 46630; ETH and USDG balances.
- USDG proxy and implementation addresses, bytecode checks, symbol, decimals, and authoritative source URL.
- Deployment transaction, receipt status, block, gas used, deployed market address, constructor inputs, and initial-liquidity transfer.
- Market reads showing its USDG address, initial reserves/collateral, configured fee recipient, and OddsShift parameters.
- Explorer links for USDG, implementation, market, deployment, liquidity, trade, refund, LP payout, redemption, and settlement transactions.
- Contract verification result using Solidity 0.8.24, optimizer 200 runs, and `via_ir = true`.
- Final contract and frontend test outputs, secret scan, dependency audit, and artifact/build provenance.
- Direct navigation evidence for `https://<verified-existing-domain>/robinhood`, wrong-chain switching, no Arc fallback, no faucet, and the missing-config state.
- Written confirmation of exactly what was broadcast and published, by whom, and under which explicit approval.
