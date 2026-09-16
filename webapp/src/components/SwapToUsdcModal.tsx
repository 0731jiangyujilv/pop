import { useEffect, useMemo, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, useChainId, useReadContracts } from 'wagmi'
import { ERC20_ABI } from '@/config/contracts'
import {
  ETH_GAS_BUFFER_WEI,
  HIGH_PRICE_IMPACT_PERCENT,
  NATIVE_ETH_SENTINEL,
  getSwappableTokens,
  isUniswapSupported,
  grossUpForFee,
  type SwappableToken,
} from '@/config/uniswap'
import { useUniswapSwap } from '@/hooks/useUniswapSwap'

type Props = {
  isOpen: boolean
  onClose: () => void
  requiredUsdcAmount: bigint
  currentUsdcBalance: bigint
  onComplete: () => Promise<void> | void
}

const USDC_DECIMALS = 6

function formatAmount(value: bigint, decimals: number, maxFrac = 6): string {
  const raw = formatUnits(value, decimals)
  const [intPart, fracPart = ''] = raw.split('.')
  const trimmed = fracPart.slice(0, maxFrac).replace(/0+$/, '')
  return trimmed ? `${intPart}.${trimmed}` : intPart
}

function parseUsdcInput(input: string): bigint {
  if (!input.trim()) return 0n
  try {
    return parseUnits(input.trim(), USDC_DECIMALS)
  } catch {
    return 0n
  }
}

export function SwapToUsdcModal({ isOpen, onClose, requiredUsdcAmount, currentUsdcBalance, onComplete }: Props) {
  const { address } = useAccount()
  const chainId = useChainId()
  const swappableTokens = useMemo(() => getSwappableTokens(chainId), [chainId])
  const uniswapAvailable = isUniswapSupported(chainId)

  const shortfall = requiredUsdcAmount > currentUsdcBalance ? requiredUsdcAmount - currentUsdcBalance : 0n
  const minGrossAmount = grossUpForFee(shortfall)

  const [tokenIn, setTokenIn] = useState<SwappableToken>(swappableTokens[0])
  const [targetInput, setTargetInput] = useState<string>('')

  // Reset tokenIn when chain switches
  useEffect(() => {
    setTokenIn(swappableTokens[0])
    setTargetInput('')
  }, [chainId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) setTargetInput('')
  }, [isOpen])

  const targetAmount = parseUsdcInput(targetInput)
  const belowShortfall = targetAmount < minGrossAmount
  const swapEnabled = isOpen && uniswapAvailable && !!address && targetAmount >= minGrossAmount && targetAmount > 0n

  const ethBalance = useBalance({ address, query: { enabled: isOpen && !!address } })
  const erc20Tokens = useMemo(() => swappableTokens.filter((t: SwappableToken) => !t.isNative), [swappableTokens])
  const erc20Balances = useReadContracts({
    contracts: erc20Tokens.map((t: SwappableToken) => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf' as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: isOpen && !!address },
  })

  const balanceFor = (token: SwappableToken): bigint | null => {
    if (token.isNative) return ethBalance.data?.value ?? null
    const idx = erc20Tokens.findIndex((t: SwappableToken) => t.address === token.address)
    const entry = erc20Balances.data?.[idx]
    if (!entry || entry.status !== 'success') return null
    return entry.result as bigint
  }

  const { stage, quote, quoteError, executionError, execute, reset } = useUniswapSwap({
    tokenIn,
    outputAmountBaseUnits: targetAmount,
    enabled: swapEnabled,
    chainId,
  })

  const inputAmountWei = quote ? BigInt(quote.quote.input.amount) : 0n
  const tokenInBalance = balanceFor(tokenIn)
  const ethBal = ethBalance.data?.value ?? 0n

  // Gas-buffer check when input is native ETH
  const gasBufferInsufficient =
    tokenIn.isNative && quote ? inputAmountWei > (ethBal > ETH_GAS_BUFFER_WEI ? ethBal - ETH_GAS_BUFFER_WEI : 0n) : false
  const balanceInsufficient =
    !tokenIn.isNative && quote && tokenInBalance !== null ? inputAmountWei > tokenInBalance : false
  const lowEthForGas = !tokenIn.isNative && ethBal < ETH_GAS_BUFFER_WEI / 2n

  const priceImpactNum = quote?.quote?.priceImpact != null ? Number(quote.quote.priceImpact) : null
  const priceImpactHigh = priceImpactNum !== null && !Number.isNaN(priceImpactNum) && priceImpactNum > HIGH_PRICE_IMPACT_PERCENT

  const actionDisabled =
    !swapEnabled ||
    stage === 'quoting' ||
    stage === 'checking-approval' ||
    stage === 'approving' ||
    stage === 'signing-permit' ||
    stage === 'swapping' ||
    stage === 'done' ||
    !quote ||
    belowShortfall ||
    gasBufferInsufficient ||
    balanceInsufficient

  const actionLabel = (() => {
    if (belowShortfall) return `Enter at least ${formatAmount(minGrossAmount, USDC_DECIMALS, 4)} USDC`
    switch (stage) {
      case 'quoting': return 'Getting quote...'
      case 'checking-approval': return 'Checking approval...'
      case 'approving': return 'Approving...'
      case 'signing-permit': return 'Signing permit...'
      case 'swapping': return 'Swapping...'
      case 'done': return 'Swap complete'
      default: return `Swap ${tokenIn.symbol} for USDC`
    }
  })()

  // Auto-close on successful swap
  useEffect(() => {
    if (stage === 'done') {
      const t = setTimeout(async () => {
        await onComplete()
      }, 200)
      return () => clearTimeout(t)
    }
  }, [stage, onComplete])

  // Escape key close
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const handleTokenChange = (addr: string) => {
    const next = swappableTokens.find((t: SwappableToken) => t.address === (addr as `0x${string}`))
    if (next) {
      setTokenIn(next)
      reset()
    }
  }

  if (!isOpen) return null

  const rateText = (() => {
    if (!quote) return null
    const outAmt = BigInt(quote.quote.output.amount)
    if (outAmt === 0n) return null
    const inDec = tokenIn.decimals
    const outHuman = Number(formatUnits(outAmt, USDC_DECIMALS))
    const inHuman = Number(formatUnits(inputAmountWei, inDec))
    if (!Number.isFinite(inHuman) || inHuman === 0) return null
    const rate = outHuman / inHuman
    return `1 ${tokenIn.symbol} ≈ ${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`
  })()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && stage !== 'approving' && stage !== 'swapping' && stage !== 'signing-permit') onClose() }}
    >
      <div className="glow-card w-full max-w-md rounded-[28px] bg-white p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">Swap to USDC</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="rounded-2xl border border-[rgba(0,0,255,0.12)] bg-[rgba(0,0,255,0.04)] p-3 text-xs text-[var(--color-muted)]">
          Need {formatAmount(requiredUsdcAmount, USDC_DECIMALS, 2)} USDC · Have {formatAmount(currentUsdcBalance, USDC_DECIMALS, 2)} USDC · Short {formatAmount(shortfall, USDC_DECIMALS, 2)} USDC
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Pay with</label>
            <div className="flex items-center gap-2">
              <select
                value={tokenIn.address}
                onChange={(e) => handleTokenChange(e.target.value)}
                className="rounded-xl border border-[rgba(0,0,255,0.16)] bg-white px-3 py-2 text-sm"
              >
                {swappableTokens.map((t: SwappableToken) => (
                  <option key={t.address} value={t.address}>{t.symbol}</option>
                ))}
              </select>
              <span className="text-xs text-[var(--color-muted)]">
                Balance: {tokenInBalance !== null ? formatAmount(tokenInBalance, tokenIn.decimals, 4) : '—'} {tokenIn.symbol}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Receive USDC</label>
            <input
              type="text"
              inputMode="decimal"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full rounded-xl border border-[rgba(0,0,255,0.16)] bg-white px-3 py-2 text-sm"
              placeholder={minGrossAmount > 0n ? `min ${formatAmount(minGrossAmount, USDC_DECIMALS, 4)}` : '0.0'}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.6)] p-4 text-sm text-[var(--color-ink)] space-y-1">
          {stage === 'quoting' && <p className="text-[var(--color-muted)]">Fetching quote...</p>}
          {quoteError && <p className="text-[var(--color-cyan)]">{quoteError}</p>}
          {!quoteError && quote && (
            <>
              <p>
                You pay up to <strong>{formatAmount(inputAmountWei, tokenIn.decimals, 6)}</strong> {tokenIn.symbol}
              </p>
              {rateText && <p className="text-xs text-[var(--color-muted)]">{rateText}</p>}
              {priceImpactNum !== null && !Number.isNaN(priceImpactNum) && (
                <p className={`text-xs ${priceImpactHigh ? 'text-[var(--color-cyan)]' : 'text-[var(--color-muted)]'}`}>
                  Price impact: {priceImpactNum.toFixed(2)}%
                </p>
              )}
            </>
          )}
        </div>

        {gasBufferInsufficient && (
          <p className="text-sm text-[var(--color-cyan)]">
            Your ETH won't cover this swap plus gas. Reduce the target amount, use WETH/DAI/USDT, or top up ETH.
          </p>
        )}
        {balanceInsufficient && (
          <p className="text-sm text-[var(--color-cyan)]">Not enough {tokenIn.symbol} for this swap.</p>
        )}
        {lowEthForGas && !tokenIn.isNative && (
          <p className="text-xs text-[var(--color-muted)]">Low ETH balance — you may need more for gas after the swap.</p>
        )}
        {executionError && stage === 'error' && (
          <p className="text-sm text-[var(--color-cyan)]">{executionError}</p>
        )}

        <button
          type="button"
          onClick={execute}
          disabled={actionDisabled}
          className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

export { NATIVE_ETH_SENTINEL }
