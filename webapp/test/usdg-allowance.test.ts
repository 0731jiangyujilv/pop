import assert from 'node:assert/strict'
import test from 'node:test'
import { nextApprovalAmount, USDG_APPROVAL_CAP } from '../src/lib/usdgAllowance.ts'

const ONE_USDG = 1_000_000n
const TWENTY_USDG = 20_000_000n
const THIRTY_USDG = 30_000_000n

test('0 allowance + 1 USDG trade requests 25 USDG approval', () => {
  assert.equal(USDG_APPROVAL_CAP, 25_000_000n)
  assert.equal(nextApprovalAmount(0n, ONE_USDG), 25_000_000n)
})

test('20 USDG existing allowance + 1 USDG trade skips approval', () => {
  assert.equal(nextApprovalAmount(TWENTY_USDG, ONE_USDG), null)
})

test('trade above 25 USDG approves at least the requested amount', () => {
  const amount = nextApprovalAmount(0n, THIRTY_USDG)
  assert.notEqual(amount, null)
  assert.ok(amount! >= THIRTY_USDG)
  assert.equal(amount, THIRTY_USDG)
})
