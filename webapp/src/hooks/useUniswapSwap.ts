import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, usePublicClient, useSignTypedData } from 'wagmi'
import {
  fetchCheckApproval,
  fetchQuote,
  fetchSwap,
  UniswapApiError,
  type EIP712Payload,
  type QuoteResponse,
} from '@/lib/uniswapApi'
import { NATIVE_ETH_SENTINEL, QUOTE_STALE_MS, getUsdcAddress, type SwappableToken } from '@/config/uniswap'
import { useSendTransactionWithAttribution } from './useSendTransactionWithAttribution'

export type SwapStage =
  | 'idle'
  | 'quoting'
  | 'ready'
  | 'checking-approval'
  | 'approving'
  | 'signing-permit'
  | 'swapping'
  | 'done'
  | 'error'

export type UseUniswapSwapParams = {
  tokenIn: SwappableToken
  outputAmountBaseUnits: bigint
  enabled: boolean
  chainId: number
}

export type UseUniswapSwapResult = {
  stage: SwapStage
  quote: QuoteResponse | null
  quotedAt: number | null
  quoteError: string | null
  executionError: string | null
  isNativeIn: boolean
  execute: () => Promise<void>
  refreshQuote: () => Promise<void>
  reset: () => void
}

function messageFromError(err: unknown): string {
  if (err instanceof UniswapApiError) {
    if (err.status === 401 || err.status === 403) return 'Swap service is not authorized. Please sign in again.'
    if (err.status === 429) return 'Too many requests. Try again in a moment.'
    if (err.errorCode === 'NO_ROUTES_AVAILABLE' || err.errorCode === 'QUOTE_ERROR') {
      return 'No swap route found for this amount. Try a smaller amount or a different token.'
    }
    if (err.errorCode === 'UPSTREAM_TIMEOUT') return 'Swap service timed out. Please retry.'
    if (err.errorCode === 'UPSTREAM_UNREACHABLE' || err.errorCode === 'UPSTREAM_UNCONFIGURED') {
      return 'Swap service unavailable right now.'
    }
    return err.detail || err.message
  }
  if (err && typeof err === 'object' && 'shortMessage' in err) {
    const sm = (err as { shortMessage?: unknown }).shortMessage
    if (typeof sm === 'string') return sm
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

function isUserRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; code?: number; message?: string }
  if (e.name === 'UserRejectedRequestError') return true
  if (e.code === 4001) return true
  return typeof e.message === 'string' && /reject|denied/i.test(e.message)
}

export function useUniswapSwap({ tokenIn, outputAmountBaseUnits, enabled, chainId }: UseUniswapSwapParams): UseUniswapSwapResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { sendTransactionAsync: sendRaw } = useSendTransactionWithAttribution()
  const { signTypedDataAsync } = useSignTypedData()
  const usdcAddress = getUsdcAddress(chainId)

  const [stage, setStage] = useState<SwapStage>('idle')
  const [quote, setQuote] = useState<QuoteResponse | null>(null)
  const [quotedAt, setQuotedAt] = useState<number | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)

  const executingRef = useRef(false)
  const isNativeIn = tokenIn.address === NATIVE_ETH_SENTINEL

  const runQuote = useCallback(async (): Promise<QuoteResponse | null> => {
    if (!address || outputAmountBaseUnits <= 0n) return null
    setStage('quoting')
    setQuoteError(null)
    try {
      const q = await fetchQuote({
        tokenIn: tokenIn.address,
        tokenOut: usdcAddress,
        amount: outputAmountBaseUnits.toString(),
        swapper: address,
        type: 'EXACT_OUTPUT',
        chainId,
      })
      setQuote(q)
      setQuotedAt(Date.now())
      setStage('ready')
      return q
    } catch (err) {
      setQuote(null)
      setQuotedAt(null)
      setQuoteError(messageFromError(err))
      setStage('idle')
      return null
    }
  }, [address, tokenIn, outputAmountBaseUnits, chainId, usdcAddress])

  // Debounced auto-quote on input change
  useEffect(() => {
    if (!enabled) return
    if (!address || outputAmountBaseUnits <= 0n) {
      setQuote(null)
      setQuotedAt(null)
      setQuoteError(null)
      setStage('idle')
      return
    }
    const handle = setTimeout(() => { void runQuote() }, 400)
    return () => clearTimeout(handle)
  }, [enabled, address, outputAmountBaseUnits, tokenIn.address, runQuote])

  const reset = useCallback(() => {
    if (executingRef.current) return
    setStage('idle')
    setQuote(null)
    setQuotedAt(null)
    setQuoteError(null)
    setExecutionError(null)
  }, [])

  const execute = useCallback(async () => {
    if (!address || !publicClient) return
    if (executingRef.current) return
    executingRef.current = true
    setExecutionError(null)

    try {
      // Refresh quote if stale
      let active: QuoteResponse | null = quote
      const tooOld = !quotedAt || Date.now() - quotedAt > QUOTE_STALE_MS
      if (!active || tooOld) {
        active = await runQuote()
        if (!active) return
      }

      // Check approval / permit
      setStage('checking-approval')
      let permitSignature: string | undefined
      let permitData: EIP712Payload | null | undefined
      if (!isNativeIn) {
        const inputAmount = active.quote.input.amount
        const approval = await fetchCheckApproval({
          token: tokenIn.address,
          amount: inputAmount,
          walletAddress: address,
          chainId,
        })
        if (approval.approval) {
          setStage('approving')
          const approveHash = await sendRaw({
            to: approval.approval.to as `0x${string}`,
            data: approval.approval.data as `0x${string}`,
            value: approval.approval.value ? BigInt(approval.approval.value) : 0n,
          })
          await publicClient.waitForTransactionReceipt({ hash: approveHash })
        }
      }

      // Top-level quote response may contain an EIP-712 permit payload
      if (active.permitData) {
        setStage('signing-permit')
        const p = active.permitData
        permitSignature = await signTypedDataAsync({
          domain: p.domain as any,
          types: p.types as any,
          primaryType: p.primaryType || Object.keys(p.types).find((k) => k !== 'EIP712Domain') || 'PermitSingle',
          message: p.values as any,
        })
        permitData = p
      }

      // Build the swap transaction
      setStage('swapping')
      const swapRes = await fetchSwap({ quote: active.quote, signature: permitSignature, permitData })

      const swapHash = await sendRaw({
        to: swapRes.swap.to as `0x${string}`,
        data: swapRes.swap.data as `0x${string}`,
        value: swapRes.swap.value ? BigInt(swapRes.swap.value) : 0n,
      })
      await publicClient.waitForTransactionReceipt({ hash: swapHash })

      setStage('done')
    } catch (err) {
      if (isUserRejection(err)) {
        setExecutionError('Cancelled in wallet.')
      } else {
        setExecutionError(messageFromError(err))
      }
      setStage('error')
    } finally {
      executingRef.current = false
    }
  }, [address, publicClient, quote, quotedAt, isNativeIn, tokenIn.address, runQuote, sendRaw, signTypedDataAsync])

  return {
    stage,
    quote,
    quotedAt,
    quoteError,
    executionError,
    isNativeIn,
    execute,
    refreshQuote: async () => { await runQuote() },
    reset,
  }
}
