// CommonJS works in the bot, ESM oracles, and Vite's dependency bundler.
const { createTransport, http } = require('viem')

const { parseRpcUrls, getRpcUrls } = require('./config')

function isRetryableRpcError(error) {
  for (let current = error, depth = 0; current && depth < 8; depth++, current = current.cause) {
    const status = current.status ?? current.statusCode
    const code = Number(current.code)
    // Contract reverts, bad arguments, and rejected transactions are final.
    if ([3, -32600, -32602, 4001].includes(code)) return false
    const message = [current.message, current.shortMessage, current.details, current.name].filter(Boolean).join(' ')
    if (/execution reverted|insufficient funds|nonce too low|user rejected/i.test(message)) return false
    if (status === 408 || status === 429 || (status >= 500 && status <= 599) || code === -32005 || code === 19) return true
    if (/rate limit|too many requests|timeout|timed out|TimeoutError|temporary internal error|service unavailable|bad gateway|fetch failed|failed to fetch|network|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|status:\s*(429|5\d\d)|http\s*(429|5\d\d)/i.test(message)) return true
  }
  return false
}

function createRpcTransport(chainId, env = {}, prefix = '') {
  const urls = Array.isArray(env) ? parseRpcUrls(env) : getRpcUrls(chainId, env, prefix)
  if (!urls.length) throw new Error('At least one RPC URL is required')
  return (options) => {
    if (options.chain && options.chain.id !== chainId) throw new Error('RPC transport chain mismatch')
    const nodes = urls.map(url => http(url, { retryCount: 0 })({ ...options, retryCount: 0 }))
    return createTransport({
      key: 'randomRpc', name: 'Random RPC pool', type: 'randomRpc', retryCount: 0,
      async request(args) {
        const order = [...nodes]
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[order[i], order[j]] = [order[j], order[i]]
        }
        // Filters and node-managed signing hold node-local state. Keep them on
        // one node; a retry of eth_sendTransaction could submit a second tx.
        const pinned = /^(eth_(new.*Filter|uninstallFilter|getFilter.*|sendTransaction|sign.*)|wallet_.*|personal_.*)$/.test(args.method)
        const candidates = pinned ? [nodes[0]] : order
        for (let i = 0; i < candidates.length; i++) {
          try { return await candidates[i].request(args) }
          catch (error) {
            if (i === candidates.length - 1 || !isRetryableRpcError(error)) throw error
          }
        }
      },
    })
  }
}

function createRpcRetry(scope, { retries = 4, delayMs = 5000 } = {}) {
  return async (label, operation) => {
    for (let retry = 0; ; retry++) {
      try { return await operation() }
      catch (error) {
        if (retry >= retries || !isRetryableRpcError(error)) throw error
        const waitMs = delayMs * 2 ** retry
        console.warn(`[${scope}] ${label}: transient RPC error; retry ${retry + 1}/${retries} in ${Math.ceil(waitMs / 1000)}s`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
      }
    }
  }
}

exports.parseRpcUrls = parseRpcUrls
exports.getRpcUrls = getRpcUrls
exports.isRetryableRpcError = isRetryableRpcError
exports.createRpcTransport = createRpcTransport
exports.createRpcRetry = createRpcRetry
