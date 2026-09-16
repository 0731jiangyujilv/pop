// All built-in endpoints and environment aliases live here. Never add API keys.
const CHAINS = {
  8453: { names: ['BASE', 'BASE_MAINNET'], urls: ['https://mainnet.base.org'] },
  84532: { names: ['BASE_SEPOLIA'], urls: ['https://sepolia.base.org', 'https://base-sepolia-public.nodies.app'] },
  5042002: { names: ['ARC_TESTNET', 'ARC'], urls: ['https://arc-testnet.drpc.org'] },
  97: { names: ['BSC_TESTNET'], urls: ['https://data-seed-prebsc-1-s1.bnbchain.org:8545'] },
}

function parseRpcUrls(value) {
  const urls = [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\s,]+/))
    .map(url => url.trim()).filter(Boolean))]
  for (const url of urls) {
    let parsed
    try { parsed = new URL(url) } catch { throw new Error('Invalid RPC URL') }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('RPC URLs must use HTTP or HTTPS')
  }
  return urls
}

function getRpcUrls(chainId, env = {}, prefix = '') {
  const chain = CHAINS[chainId]
  if (!chain) throw new Error(`Unsupported RPC chain: ${chainId}`)
  // A configured list takes precedence over legacy single-URL aliases.
  for (const suffix of ['RPC_URLS', 'RPC_URL']) {
    for (const name of chain.names) {
      const urls = parseRpcUrls(env[`${prefix}${name}_${suffix}`])
      if (urls.length) return urls
    }
  }
  return [...chain.urls]
}

exports.parseRpcUrls = parseRpcUrls
exports.getRpcUrls = getRpcUrls
