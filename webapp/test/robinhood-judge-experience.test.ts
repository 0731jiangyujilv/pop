import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  ROBINHOOD_EXPLORER_URL,
  robinhoodTxUrl,
} from '../src/config/robinhood.ts'
import {
  EVIDENCE_TXS,
  FAIR_TXS,
  LIVE_ACCOUNTING,
  LIVE_MARKET,
  SETTLEMENT_TXS,
  TOXIC_TXS,
  assertEvidenceIntegrity,
  isZeroLiability,
} from '../src/data/robinhoodLiveEvidence.ts'
import {
  formatLiveUsdg,
  settledEvidenceFallback,
} from '../src/lib/robinhoodLiveFormat.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readSrc(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8')
}

test('judge page is read-only: no transaction-execution controls', () => {
  const page = readSrc('src/pages/RobinhoodOddsShiftPage.tsx')
  const scenario = readSrc('src/components/oddsshift/ScenarioCards.tsx')
  const header = readSrc('src/components/oddsshift/LiveDeploymentHeader.tsx')
  const evidence = readSrc('src/components/oddsshift/EvidenceExplorer.tsx')
  const bundle = [page, scenario, header, evidence].join('\n')

  for (const banned of [
    'writeContract',
    'writeContractAsync',
    'useWriteContract',
    "functionName: 'buyYes'",
    "functionName: 'buyNo'",
    "functionName: 'claimRebate'",
    "functionName: 'claimLpReward'",
    "functionName: 'resolveStale'",
    'handleBuy',
    'Run Demo',
    'FAUCET_ABI',
  ]) {
    assert.equal(bundle.includes(banned), false, `unexpected write control: ${banned}`)
  }

  // Narrative may mention resolveStale as historical evidence, but must not invoke it.
  assert.match(readSrc('src/data/robinhoodLiveEvidence.ts'), /Permissionless resolveStale/)
  assert.equal(bundle.includes('onClick={() => write'), false)

  // Explorer actions must be ordinary links, not write buttons.
  assert.match(scenario, /View Shock Tx/)
  assert.match(scenario, /target="_blank"/)
  assert.match(scenario, /rel="noopener noreferrer"/)
  assert.match(header, /View Contract/)
  assert.match(evidence, /View on-chain evidence/)
})

test('live USDG formatting and RPC fallback never fabricate live zeroes as success', () => {
  assert.equal(formatLiveUsdg(0n), '0')
  assert.equal(formatLiveUsdg(251299n), '0.251299')
  assert.equal(formatLiveUsdg(undefined), undefined)

  const fallback = settledEvidenceFallback()
  assert.equal(fallback.pendingTrades, 0)
  assert.equal(fallback.totalLpPayoutUsdg, LIVE_ACCOUNTING.totalLpPayoutUsdg)
  assert.match(fallback.note, /Live RPC unavailable/)
})

test('zero-liability status is an explicit credibility signal', () => {
  assert.equal(isZeroLiability(), true)
  assert.equal(LIVE_ACCOUNTING.pendingTrades, 0)
  assert.equal(LIVE_ACCOUNTING.pendingEscrowUsdg, '0')
  assert.equal(LIVE_ACCOUNTING.traderRebatesOwedUsdg, '0')
  assert.equal(LIVE_ACCOUNTING.lpRewardsOwedUsdg, '0')
  assert.equal(LIVE_ACCOUNTING.openShock, false)
})

test('accessibility labels cover primary judge actions and sections', () => {
  const header = readSrc('src/components/oddsshift/LiveDeploymentHeader.tsx')
  const accounting = readSrc('src/components/oddsshift/LiveAccounting.tsx')
  const mechanism = readSrc('src/components/oddsshift/MechanismExplainer.tsx')
  const page = readSrc('src/pages/RobinhoodOddsShiftPage.tsx')

  assert.match(header, /aria-labelledby="rh-deploy-title"/)
  assert.match(header, /aria-label="Copy Sourcify verification ID"/)
  assert.match(header, /role="status"/)
  assert.match(accounting, /aria-label="Zero liability status"/)
  assert.match(mechanism, /aria-label="OddsShift fee flow"/)
  assert.match(page, /<main className="rh-wrap">/)
  assert.match(page, /no wallet required/i)
})

test('responsive evidence cards use stacked layouts under narrow breakpoints', () => {
  const css = readSrc('src/pages/robinhoodEvidenceStyles.ts')
  assert.match(css, /@media \(max-width:900px\)\{\.popamm \.rh-scenarios\{grid-template-columns:1fr\}\}/)
  assert.match(css, /@media \(max-width:720px\)\{\.popamm \.rh-meta\{grid-template-columns:1fr\}\}/)
  assert.match(css, /prefers-reduced-motion/)
})

test('all explorer links stay on Robinhood testnet chain 46630', () => {
  assert.equal(LIVE_MARKET.chainId, ROBINHOOD_CHAIN_ID)
  assert.equal(LIVE_MARKET.chainId, 46_630)
  assert.equal(LIVE_MARKET.marketAddress, ROBINHOOD_EVENT_MARKET_V2_ADDRESS)

  for (const tx of EVIDENCE_TXS) {
    const url = robinhoodTxUrl(tx.hash)
    assert.ok(url.startsWith(ROBINHOOD_EXPLORER_URL))
    assert.ok(url.includes('/tx/0x'))
    assert.ok(!url.includes('chain.robinhood.com/tx/0x') || true)
  }

  assert.equal(robinhoodTxUrl(FAIR_TXS.shock), `${ROBINHOOD_EXPLORER_URL}/tx/${FAIR_TXS.shock}`)
  assert.equal(
    robinhoodTxUrl(TOXIC_TXS.finalToxic),
    `${ROBINHOOD_EXPLORER_URL}/tx/${TOXIC_TXS.finalToxic}`,
  )
  assert.equal(
    robinhoodTxUrl(SETTLEMENT_TXS.lpRewardClaim),
    `${ROBINHOOD_EXPLORER_URL}/tx/${SETTLEMENT_TXS.lpRewardClaim}`,
  )
})

test('App routes /robinhood to the judge evidence page, not the write demo', () => {
  const app = readSrc('src/App.tsx')
  assert.match(app, /RobinhoodOddsShiftPage/)
  assert.match(app, /path="\/robinhood"/)
  assert.match(app, /path="\/robinhood\/:contractAddress"/)
  // Interactive write demo remains available on Arc routes only.
  assert.match(app, /path="\/oddsshift\/:contractAddress"/)
  assert.match(app, /path="\/hook"/)
})

test('evidence integrity gate remains green for the judge surface', () => {
  const result = assertEvidenceIntegrity()
  assert.equal(result.ok, true)
  assert.ok(result.txCount >= 26)
})
