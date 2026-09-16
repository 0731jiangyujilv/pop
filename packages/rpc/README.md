# Shared RPC configuration

Bot workers, batch scripts, Oracle reputation reads, and wagmi use `@polypop/rpc`.
Default URLs and legacy environment aliases are defined only in `config.js`.
Client code uses `createRpcTransport(chainId, env, prefix)` from `index.js`.

## Configure endpoints

Set a comma- or whitespace-separated list of HTTP(S) endpoints for the **same chain**:

```dotenv
BASE_RPC_URLS=https://your-base-node-1,https://your-base-node-2
BASE_SEPOLIA_RPC_URLS=https://your-sepolia-node-1,https://your-sepolia-node-2
ARC_TESTNET_RPC_URLS=https://your-arc-node-1,https://your-arc-node-2
BSC_TESTNET_RPC_URLS=https://your-bsc-testnet-node-1,https://your-bsc-testnet-node-2
```

Use each service's `.env`. Frontend variables need the `VITE_` prefix and are
public in the browser bundle. Never put private backend RPC credentials there.
Lists take precedence over legacy `*_RPC_URL` variables. `BASE_MAINNET_*` and
`ARC_*` aliases remain supported. Empty configuration uses public defaults;
previous source-embedded Alchemy URLs should now be set explicitly in `.env`.
Restart services or rebuild the frontend after changing configuration.

## Selection and failures

Every request shuffles the chain's nodes, even when using a cached client.
Network errors, timeouts, HTTP 408/429/5xx, and RPC rate limits try the next node.
Each node is attempted at most once per transport request. Contract reverts,
invalid parameters, and rejected transactions stop immediately. Workers that
already retry whole read operations retain their existing retry budgets.

Filters and node-managed signing/submission are pinned to the first configured
node. Signed raw transactions may be sent to another node with the identical
signed payload. The caller remains responsible for nonce coordination between
concurrent transactions; nodes may have different views of pending transactions.

Contract npm commands use `forge.cjs`: one random endpoint is selected per Forge
invocation so simulation and broadcasting use the same node. Direct `forge`
commands still use Foundry's `rpc_endpoints` or an explicit `--rpc-url`.

## Development

This is a local file dependency. Keep `packages/rpc` in deployment build contexts.
Run `npm install` in `bot`, `oracles`, and `webapp` after updating this package;
their `.npmrc` files enable packed local dependencies for runtime resolution.
The frontend also records this dependency in its pnpm lockfile.

Run `npm run test:rpc` from the repository root. Tests mock HTTP responses and
never broadcast transactions or use real RPC credentials.
