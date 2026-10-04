import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  ROBINHOOD_EXPLORER_URL,
  ROBINHOOD_USDG_ADDRESS,
} from '../src/config/robinhood.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readSrc(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8')
}

test('Robinhood OddsShift deployment pins chain 46630, USDG, and EventMarketV2', () => {
  const dep = readSrc('src/config/oddsShiftDeployments.ts')
  assert.match(dep, /export const ROBINHOOD_ODDS_SHIFT_DEPLOYMENT/)
  assert.match(dep, /chain: robinhoodTestnet/)
  assert.match(dep, /defaultMarketAddress: ROBINHOOD_EVENT_MARKET_V2_ADDRESS/)
  assert.match(dep, /expectedCollateralAddress: ROBINHOOD_USDG_ADDRESS/)
  assert.match(dep, /expectedCollateralSymbol: 'USDG'/)
  assert.match(dep, /faucetEnabled: false/)
  assert.equal(ROBINHOOD_EVENT_MARKET_V2_ADDRESS, '0x4F946Cca7f8da191168f76Fe12fbD6cfa1CAA26e')
  assert.equal(ROBINHOOD_USDG_ADDRESS, '0x7E955252E15c84f5768B83c41a71F9eba181802F')
  assert.equal(ROBINHOOD_CHAIN_ID, 46_630)
  assert.equal(ROBINHOOD_EXPLORER_URL, 'https://explorer.testnet.chain.robinhood.com')
})

test('Arc OddsShift deployment remains available and distinct from Robinhood', () => {
  const dep = readSrc('src/config/oddsShiftDeployments.ts')
  const app = readSrc('src/App.tsx')
  assert.match(dep, /export const ARC_ODDS_SHIFT_DEPLOYMENT/)
  assert.match(dep, /chain: arcTestnet/)
  assert.match(dep, /faucetEnabled: true/)
  assert.match(app, /path="\/oddsshift\/:contractAddress"/)
  assert.match(app, /path="\/hook"/)
  assert.match(app, /<OddsShiftPage \/>/)
})

test('/robinhood reuses OddsShiftPage trading — no parallel /trade stack', () => {
  const page = readSrc('src/pages/RobinhoodOddsShiftPage.tsx')
  const app = readSrc('src/App.tsx')

  assert.match(page, /OddsShiftPage/)
  assert.match(page, /ROBINHOOD_ODDS_SHIFT_DEPLOYMENT/)
  assert.match(page, /embedded/)
  assert.match(page, /marketAddress=\{marketAddr\}/)

  assert.equal(app.includes('path="/trade"'), false)
  assert.equal(page.includes('TradePage'), false)
  assert.equal(page.includes('VITE_ROBINHOOD_TRADE_MARKET_ADDRESS'), false)
})

test('OddsShift write path targets market address for buyYes/buyNo and USDG approve spender', () => {
  const os = readSrc('src/pages/OddsShiftPage.tsx')

  // Approval spender is the market (EventMarketV2), exact amount.
  assert.match(os, /functionName: 'approve'/)
  assert.match(os, /args: \[marketAddr, need\]/)

  // Buys target marketAddr with quote-derived minOut.
  assert.match(os, /functionName: side === 'YES' \? 'buyYes' : 'buyNo'/)
  assert.match(os, /args: \[amountWei, minOut\]/)
  assert.match(os, /address: marketAddr/)
  assert.match(os, /quoteYes/)
  assert.match(os, /quoteNo/)
  assert.match(os, /SLIPPAGE_BPS/)

  // Connect + switch network reuse the existing wagmi stack.
  assert.match(os, /useConnect/)
  assert.match(os, /Connect Wallet/)
  assert.match(os, /switchChain/)

  // No private-key workflow.
  assert.equal(os.includes('PRIVATE_KEY'), false)
  assert.equal(os.includes('privateKeyToAccount'), false)
})

test('Robinhood page keeps evidence sections under the interactive market', () => {
  const page = readSrc('src/pages/RobinhoodOddsShiftPage.tsx')
  for (const marker of [
    'LiveDeploymentHeader',
    'MechanismExplainer',
    'LiveAccounting',
    'FairScenarioCard',
    'ToxicScenarioCard',
    'ContributionProtectionCard',
    'OnchainEvidenceDrawer',
    'EngineeringEvidence',
    'Verified settlement snapshot',
    'Captured demo run',
  ]) {
    assert.match(page, new RegExp(marker))
  }
})

test('evidence narrative components remain free of write controls', () => {
  const scenario = readSrc('src/components/oddsshift/ScenarioCards.tsx')
  const header = readSrc('src/components/oddsshift/LiveDeploymentHeader.tsx')
  const evidence = readSrc('src/components/oddsshift/EvidenceExplorer.tsx')
  const accounting = readSrc('src/components/oddsshift/LiveAccounting.tsx')
  const bundle = [scenario, header, evidence, accounting].join('\n')

  for (const banned of [
    'writeContractAsync',
    "functionName: 'buyYes'",
    "functionName: 'buyNo'",
    'handleBuy',
    'FAUCET_ABI',
  ]) {
    assert.equal(bundle.includes(banned), false, `evidence surface must not include ${banned}`)
  }

  assert.match(accounting, /Captured demo run/)
  assert.match(accounting, /Verified settlement snapshot/)
  assert.match(accounting, /Snapshot trades/)
  assert.match(header, /Captured demo run/)
})
