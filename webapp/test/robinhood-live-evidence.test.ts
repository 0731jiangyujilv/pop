import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  ROBINHOOD_EVIDENCE_MARKET_ADDRESS,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_SOURCIFY_VERIFICATION_ID,
  ROBINHOOD_USDG_ADDRESS,
  robinhoodTxUrl,
  shortHash,
  sourcifyLookupUrl,
  txExplorerUrl,
} from '../src/config/robinhood.ts'
import {
  EVIDENCE_TXS,
  FAIR_PROBABILITY_PATH,
  FAIR_TXS,
  LIVE_ACCOUNTING,
  LIVE_MARKET,
  LIVE_PARAMETERS,
  LIVE_VERIFICATION,
  TOXIC_PROBABILITY_PATH,
  TOXIC_TXS,
  assertEvidenceIntegrity,
  evidenceByGroup,
  evidenceExplorerUrl,
  isZeroLiability,
} from '../src/data/robinhoodLiveEvidence.ts'

const HASH = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

test('Robinhood live deployment constants match verified testnet market', () => {
  assert.equal(LIVE_MARKET.chainId, 46_630)
  assert.equal(LIVE_MARKET.chainId, ROBINHOOD_CHAIN_ID)
  assert.notEqual(LIVE_MARKET.chainId, 4663)
  // Historical evidence stays on the captured FAIR/TOXIC market.
  assert.equal(LIVE_MARKET.marketAddress, ROBINHOOD_EVIDENCE_MARKET_ADDRESS)
  assert.equal(LIVE_MARKET.marketAddress, '0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e')
  // Interactive trading uses a distinct live market.
  assert.equal(ROBINHOOD_EVENT_MARKET_V2_ADDRESS, '0x5c70D71Bc29b883c0F10DEC5E8Aacd3F17B99a61')
  assert.notEqual(LIVE_MARKET.marketAddress, ROBINHOOD_EVENT_MARKET_V2_ADDRESS)
  assert.equal(LIVE_MARKET.usdgAddress, ROBINHOOD_USDG_ADDRESS)
  assert.match(LIVE_MARKET.marketAddress, ADDRESS)
  assert.equal(LIVE_MARKET.question, 'Will BTC close above $100k this week?')
  assert.equal(LIVE_MARKET.finalProbabilityPercent, 68.5)
})

test('explorer URL helpers target Robinhood testnet only', () => {
  const hash = FAIR_TXS.shock
  assert.equal(
    txExplorerUrl(ROBINHOOD_EXPLORER_URL, hash),
    `${ROBINHOOD_EXPLORER_URL}/tx/${hash}`,
  )
  assert.equal(robinhoodTxUrl(hash), `${ROBINHOOD_EXPLORER_URL}/tx/${hash}`)
  assert.equal(evidenceExplorerUrl({ hash }), `${ROBINHOOD_EXPLORER_URL}/tx/${hash}`)
  assert.ok(!evidenceExplorerUrl({ hash }).includes('4663/'))
  assert.equal(shortHash(hash), '0x0c3f…f0b2')
})

test('FAIR evidence mapping covers trades #0–#9 with shock and correction', () => {
  assert.equal(FAIR_TXS.trades.length, 10)
  assert.equal(FAIR_TXS.trades[4], FAIR_TXS.shock)
  assert.equal(FAIR_TXS.trades[5], FAIR_TXS.correction)
  assert.deepEqual(
    FAIR_PROBABILITY_PATH.map((p) => p.percent),
    [50, 51.4, 52.8, 54.2, 55.6, 57, 49.99],
  )
  const fairRows = evidenceByGroup('fair')
  assert.equal(fairRows.filter((r) => r.tradeIndex !== undefined).length, 10)
  assert.ok(fairRows.some((r) => r.highlight === 'shock' && r.hash === FAIR_TXS.shock))
  assert.ok(fairRows.some((r) => r.highlight === 'correction' && r.hash === FAIR_TXS.correction))
  assert.ok(fairRows.some((r) => r.highlight === 'rebate' && r.hash === FAIR_TXS.initialRebate))
})

test('TOXIC evidence mapping covers trades #10–#19 and sustained endpoint', () => {
  assert.equal(TOXIC_TXS.trades.length, 10)
  assert.equal(TOXIC_TXS.trades[9], TOXIC_TXS.finalToxic)
  assert.deepEqual(
    TOXIC_PROBABILITY_PATH.map((p) => p.percent),
    [53.5, 55, 56.5, 58, 59.5, 61, 62.5, 64, 65.5, 67, 68.5],
  )
  const toxicRows = evidenceByGroup('toxic')
  assert.equal(toxicRows.length, 10)
  assert.equal(toxicRows[0]?.tradeIndex, 10)
  assert.equal(toxicRows[9]?.tradeIndex, 19)
  assert.equal(toxicRows[9]?.hash, TOXIC_TXS.finalToxic)
})

test('exact live accounting values and zero-liability status', () => {
  assert.equal(LIVE_ACCOUNTING.totalTrades, 20)
  assert.equal(LIVE_ACCOUNTING.resolvedTrades, 20)
  assert.equal(LIVE_ACCOUNTING.totalShocks, 4)
  assert.equal(LIVE_ACCOUNTING.pendingTrades, 0)
  assert.equal(LIVE_ACCOUNTING.protectionRefundedUsdg, '0.251299')
  assert.equal(LIVE_ACCOUNTING.toxicProtectionToLpsUsdg, '0.284252')
  assert.equal(LIVE_ACCOUNTING.baseFeesToLpsUsdg, '0.229516')
  assert.equal(LIVE_ACCOUNTING.totalLpPayoutUsdg, '0.513768')
  assert.equal(isZeroLiability(), true)
})

test('OddsShift parameters match the live demo configuration', () => {
  assert.equal(LIVE_PARAMETERS.baseFeeBps, 30)
  assert.equal(LIVE_PARAMETERS.protectionFeeBps, 70)
  assert.equal(LIVE_PARAMETERS.totalFeeBps, 100)
  assert.equal(LIVE_PARAMETERS.jumpThresholdPoints, 5)
  assert.equal(LIVE_PARAMETERS.lookbackTrades, 5)
  assert.equal(LIVE_PARAMETERS.observeWindowTrades, 5)
  assert.equal(LIVE_PARAMETERS.contributionThresholdPoints, 1)
  assert.equal(LIVE_PARAMETERS.staleCooldownSeconds, 120)
})

test('verification evidence asserts Sourcify exact match, not Blockscout success', () => {
  assert.equal(LIVE_VERIFICATION.match, 'exact_match')
  assert.equal(LIVE_VERIFICATION.creationMatch, 'exact_match')
  assert.equal(LIVE_VERIFICATION.runtimeMatch, 'exact_match')
  assert.equal(LIVE_VERIFICATION.sourcifyVerificationId, ROBINHOOD_SOURCIFY_VERIFICATION_ID)
  assert.equal(LIVE_VERIFICATION.blockscoutForwarding, 'Fail - Unable to verify')
  assert.equal(LIVE_VERIFICATION.foundryTestsPassing, 133)
  assert.equal(LIVE_VERIFICATION.runtimeBytecodeBytes, 24_396)
  assert.match(sourcifyLookupUrl(), /sourcify\.dev/)
  assert.match(sourcifyLookupUrl(), /46630/)
  assert.match(sourcifyLookupUrl(), /0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e/)
})

test('evidence integrity: all hashes valid and grouped without fabrication', () => {
  const result = assertEvidenceIntegrity()
  assert.equal(result.ok, true)
  assert.ok(result.txCount >= 26)
  for (const tx of EVIDENCE_TXS) {
    assert.match(tx.hash, HASH)
    assert.ok(tx.action.length > 0)
    assert.ok(tx.result.length > 0)
    assert.ok(evidenceExplorerUrl(tx).startsWith(ROBINHOOD_EXPLORER_URL))
  }
  assert.equal(evidenceByGroup('deployment').length, 3)
  assert.equal(evidenceByGroup('settlement').length, 3)
})
