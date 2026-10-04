import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_CHAIN_SLUG,
  ROBINHOOD_CHAIN_SLUG_ALIAS,
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_RPC_URL,
  ROBINHOOD_SOURCIFY_VERIFICATION_ID,
  addressExplorerUrl,
  getRobinhoodChainIdBySlug,
  isWalletOnWrongChain,
  resolveRobinhoodMarketAddress,
  resolveRobinhoodRpcUrl,
  robinhoodTestnet,
  robinhoodTxUrl,
  shortHash,
  shouldShowTokenFaucet,
  sourcifyLookupUrl,
  txExplorerUrl,
  validatedAddress,
} from '../src/config/robinhood.ts'

test('Robinhood chain metadata is pinned to the official testnet', () => {
  assert.equal(robinhoodTestnet.id, ROBINHOOD_CHAIN_ID)
  assert.equal(robinhoodTestnet.rpcUrls.default.http[0], ROBINHOOD_RPC_URL)
  assert.equal(robinhoodTestnet.blockExplorers?.default.url, ROBINHOOD_EXPLORER_URL)
})

test('Robinhood slug mapping is reversible', () => {
  assert.equal(getRobinhoodChainIdBySlug(ROBINHOOD_CHAIN_SLUG), ROBINHOOD_CHAIN_ID)
  assert.equal(getRobinhoodChainIdBySlug(ROBINHOOD_CHAIN_SLUG_ALIAS), ROBINHOOD_CHAIN_ID)
  assert.equal(getRobinhoodChainIdBySlug('arc-testnet'), undefined)
})

test('RPC override uses valid HTTP URLs and otherwise selects the official RPC', () => {
  assert.equal(resolveRobinhoodRpcUrl('https://rpc.example.test'), 'https://rpc.example.test')
  assert.equal(resolveRobinhoodRpcUrl(undefined), ROBINHOOD_RPC_URL)
  assert.equal(resolveRobinhoodRpcUrl('not a url'), ROBINHOOD_RPC_URL)
  assert.equal(resolveRobinhoodRpcUrl('file:///tmp/rpc'), ROBINHOOD_RPC_URL)
})

test('production address validation rejects missing, malformed, and zero values', () => {
  assert.equal(validatedAddress(undefined), undefined)
  assert.equal(validatedAddress('0x1234'), undefined)
  assert.equal(validatedAddress('0x0000000000000000000000000000000000000000'), undefined)
  assert.equal(
    validatedAddress('0x7E955252E15c84f5768B83c41a71F9eba181802F'),
    '0x7E955252E15c84f5768B83c41a71F9eba181802F',
  )
})

test('Robinhood market resolution never falls back from an explicit invalid address', () => {
  const configured = '0x1111111111111111111111111111111111111111'
  const explicit = '0x2222222222222222222222222222222222222222'
  assert.equal(resolveRobinhoodMarketAddress(undefined, configured), configured)
  assert.equal(resolveRobinhoodMarketAddress(explicit, configured), explicit)
  assert.equal(resolveRobinhoodMarketAddress('0x1234', configured), undefined)
  assert.equal(resolveRobinhoodMarketAddress(undefined, undefined), undefined)
})

test('wrong-chain detection and explorer links are deterministic', () => {
  const address = '0x2222222222222222222222222222222222222222'
  const tx = '0x0c3f6abb3db4415f9d628a135a2451aa87429a06d4ba852d0d462409ef73f0b2'
  assert.equal(isWalletOnWrongChain(false, 1, ROBINHOOD_CHAIN_ID), false)
  assert.equal(isWalletOnWrongChain(true, 1, ROBINHOOD_CHAIN_ID), true)
  assert.equal(isWalletOnWrongChain(true, ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_ID), false)
  assert.equal(
    addressExplorerUrl(`${ROBINHOOD_EXPLORER_URL}/`, address),
    `${ROBINHOOD_EXPLORER_URL}/address/${address}`,
  )
  assert.equal(txExplorerUrl(ROBINHOOD_EXPLORER_URL, tx), `${ROBINHOOD_EXPLORER_URL}/tx/${tx}`)
  assert.equal(robinhoodTxUrl(tx), `${ROBINHOOD_EXPLORER_URL}/tx/${tx}`)
  assert.equal(shortHash(tx), '0x0c3f…f0b2')
  assert.equal(ROBINHOOD_EVENT_MARKET_V2_ADDRESS, '0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e')
  assert.equal(ROBINHOOD_SOURCIFY_VERIFICATION_ID, 'e81be92a-9950-4d1e-a453-753456c39434')
  assert.match(sourcifyLookupUrl(), /full_match\/46630\//)
})

test('real USDG routes never expose the mock-token faucet', () => {
  const usdg = '0x7E955252E15c84f5768B83c41a71F9eba181802F'
  assert.equal(shouldShowTokenFaucet(false, true, usdg), false)
  assert.equal(shouldShowTokenFaucet(true, true, usdg), true)
})
