import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_CHAIN_SLUG,
  ROBINHOOD_CHAIN_SLUG_ALIAS,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_RPC_URL,
  getRobinhoodChainIdBySlug,
  resolveRobinhoodRpcUrl,
  robinhoodTestnet,
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
