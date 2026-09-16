import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import {
  PREDICTION_MARKET_ABI,
  OUTCOME_TOKEN_ABI,
  ERC20_ABI,
  MarketStatus,
  getContractsForChain,
} from '@/config/contracts'
import { getChainConfig } from '@/config/chains'
import { formatUsdc, formatProbability } from '@/lib/utils'
import { simulateWrite } from '@/lib/simulateWrite'

type Side = 'YES' | 'NO'
type TxStep =
  | 'idle'
  | 'approving'
  | 'buying'        | 'bought'
  | 'redeeming'     | 'redeemed'
  | 'claiming'      | 'claimed'
  | 'addingLp'      | 'addedLp'
  | 'removingLp'    | 'removedLp'
  | 'redeemingPair' | 'redeemedPair'
  | 'error'

const SLIPPAGE_BPS = 98n // 2 % slippage: minOut = quote * 98 / 100
const DEFAULT_SLIDER_MAX = 100
const DEFAULT_SLIDER_MIN = 0.1
const SLIDER_STEP = 0.1

export function MarketPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()
  const walletChainId = useChainId()
  const betChainId = Number(searchParams.get('chainId')) || walletChainId
  const publicClient = usePublicClient({ chainId: betChainId })

  const contracts  = getContractsForChain(betChainId)
  const chainConfig = getChainConfig(betChainId)
  const explorerUrl = chainConfig?.explorerUrl ?? 'https://sepolia.basescan.org'
  const chainMismatch = isConnected && walletChainId !== betChainId

  const [side, setSide]       = useState<Side>('YES')
  const [amount, setAmount]   = useState('10')
  const [txStep, setTxStep]   = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // v2 panel inputs
  const [addLpAmount, setAddLpAmount] = useState('5')         // USDC
  const [removeShares, setRemoveShares] = useState('')       // LP share units (USDC scale)
  const [pairAmount, setPairAmount] = useState('')           // outcome-token units (USDC scale)

  const marketAddr = contractAddress as `0x${string}`
  const usdcAddr   = contracts.usdcAddress

  // ── Market reads ──────────────────────────────────────────────────────────
  const { data: md, refetch: refetchMarket } = useReadContracts({
    contracts: [
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'question',        chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'closingTime',     chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'status',          chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'yesWins',         chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'yesProbability',  chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'noProbability',   chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'totalCollateral', chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'netUsdcPerToken', chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'yesId',           chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'noId',            chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'outcomeToken',    chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'lpSwapFeeBps',    chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'reasoning',       chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'asset',           chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'threshold',       chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'aboveWins',       chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'settledPrice',    chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'priceFeed',       chainId: betChainId },
    ],
  })

  const question         = md?.[0]?.result  as string | undefined
  const closingTime      = md?.[1]?.result  as bigint | undefined
  const status           = md?.[2]?.result  as number | undefined
  const yesWins          = md?.[3]?.result  as boolean | undefined
  const yesProbability   = md?.[4]?.result  as bigint | undefined
  const noProbability    = md?.[5]?.result  as bigint | undefined
  const totalCollateral  = md?.[6]?.result  as bigint | undefined
  const netUsdcPerToken  = md?.[7]?.result  as bigint | undefined
  const yesId            = md?.[8]?.result  as bigint | undefined
  const noId             = md?.[9]?.result  as bigint | undefined
  const outcomeTokenAddr = md?.[10]?.result as `0x${string}` | undefined
  const lpSwapFeeBps     = md?.[11]?.result as bigint | undefined
  const reasoning        = md?.[12]?.result as string | undefined
  const asset            = md?.[13]?.result as string | undefined
  const threshold        = md?.[14]?.result as bigint | undefined
  const aboveWins        = md?.[15]?.result as boolean | undefined
  const settledPrice     = md?.[16]?.result as bigint | undefined
  const priceFeed        = md?.[17]?.result as `0x${string}` | undefined

  const isOpen     = status === MarketStatus.Open
  const isResolved = status === MarketStatus.Resolved

  // ── Quote ─────────────────────────────────────────────────────────────────
  const usdcAmount = amount ? parseUnits(amount, 6) : 0n

  const { data: quoteYes, refetch: refetchQuoteYes } = useReadContract({
    address: marketAddr,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'quoteYes',
    args: [usdcAmount],
    chainId: betChainId,
    query: { enabled: usdcAmount > 0n && isOpen },
  })

  const { data: quoteNo, refetch: refetchQuoteNo } = useReadContract({
    address: marketAddr,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'quoteNo',
    args: [usdcAmount],
    chainId: betChainId,
    query: { enabled: usdcAmount > 0n && isOpen },
  })

  const quote = (side === 'YES' ? quoteYes : quoteNo) as bigint | undefined

  // ── User balances ──────────────────────────────────────────────────────────
  const zero = '0x0000000000000000000000000000000000000000' as `0x${string}`
  const { data: userBal, refetch: refetchBalances } = useReadContracts({
    contracts: [
      { address: outcomeTokenAddr ?? zero, abi: OUTCOME_TOKEN_ABI, functionName: 'balanceOf', args: [address ?? zero, yesId ?? 0n], chainId: betChainId },
      { address: outcomeTokenAddr ?? zero, abi: OUTCOME_TOKEN_ABI, functionName: 'balanceOf', args: [address ?? zero, noId  ?? 0n], chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'lpShares',       args: [address ?? zero], chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'lockedLpShares', args: [address ?? zero], chainId: betChainId },
      { address: marketAddr, abi: PREDICTION_MARKET_ABI, functionName: 'lpClaimed',      args: [address ?? zero], chainId: betChainId },
      { address: usdcAddr,   abi: ERC20_ABI,             functionName: 'balanceOf',      args: [address ?? zero], chainId: betChainId },
      { address: usdcAddr,   abi: ERC20_ABI,             functionName: 'allowance',      args: [address ?? zero, marketAddr], chainId: betChainId },
    ],
    query: { enabled: !!address && !!outcomeTokenAddr },
  })

  const yesBalance         = userBal?.[0]?.result as bigint | undefined
  const noBalance          = userBal?.[1]?.result as bigint | undefined
  const userLpShares       = userBal?.[2]?.result as bigint | undefined
  const userLockedLpShares = userBal?.[3]?.result as bigint | undefined
  const userLpClaimed      = userBal?.[4]?.result as boolean | undefined
  const usdcBalance        = userBal?.[5]?.result as bigint | undefined
  const usdcAllowance      = userBal?.[6]?.result as bigint | undefined

  const needsApproval = usdcAllowance !== undefined && usdcAllowance < usdcAmount
  const hasEnough     = usdcBalance   !== undefined && usdcBalance   >= usdcAmount

  // Derived LP state for the v2 panels.
  const userAvailableLp = userLpShares !== undefined && userLockedLpShares !== undefined
    ? userLpShares - userLockedLpShares
    : undefined
  const pairMax = yesBalance !== undefined && noBalance !== undefined
    ? (yesBalance < noBalance ? yesBalance : noBalance)
    : 0n

  const winningBalance  = isResolved ? (yesWins ? yesBalance : noBalance) : undefined
  const redeemEstimate  = winningBalance && netUsdcPerToken ? (winningBalance * netUsdcPerToken) / BigInt(1e18) : undefined

  // ── Slider bounds (USDC, integer) ─────────────────────────────────────────
  const balanceUsdc = usdcBalance !== undefined ? Number(usdcBalance / 1_000_000n) : 0
  const minSliderValue = DEFAULT_SLIDER_MIN
  const maxSliderValue = Math.max(balanceUsdc, DEFAULT_SLIDER_MAX)

  // Clamp amount into slider range whenever bounds change
  useEffect(() => {
    const current = Number(amount)
    if (!Number.isFinite(current)) {
      setAmount(String(minSliderValue))
      return
    }
    const clamped = Math.min(Math.max(current, minSliderValue), maxSliderValue)
    if (clamped !== current) setAmount(String(clamped))
  }, [amount, minSliderValue, maxSliderValue])

  // ── Writes ────────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContractWithAttribution()

  const [buyTxHash,        setBuyTxHash]        = useState<`0x${string}` | undefined>()
  const [redeemTxHash,     setRedeemTxHash]     = useState<`0x${string}` | undefined>()
  const [lpClaimTxHash,    setLpClaimTxHash]    = useState<`0x${string}` | undefined>()
  const [addLpTxHash,      setAddLpTxHash]      = useState<`0x${string}` | undefined>()
  const [removeLpTxHash,   setRemoveLpTxHash]   = useState<`0x${string}` | undefined>()
  const [redeemPairTxHash, setRedeemPairTxHash] = useState<`0x${string}` | undefined>()

  function getErrorMessage(e: unknown, fallback: string) {
    return (e as Error)?.message?.slice(0, 200) || fallback
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function waitWithHeartbeat(hash: `0x${string}`, label: string) {
    if (!publicClient) throw new Error('publicClient missing')
    const start = Date.now()
    const heartbeat = setInterval(() => {
      console.log(`[MarketPage] ${label}: still waiting for receipt`, {
        hash,
        elapsedMs: Date.now() - start,
        publicClientChain: publicClient.chain?.id,
      })
    }, 5000)
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      return receipt
    } finally {
      clearInterval(heartbeat)
    }
  }

  async function execBuy(currentQuote: bigint) {
    console.log('[MarketPage] execBuy: start', {
      side,
      usdcAmount: usdcAmount.toString(),
      currentQuote: currentQuote.toString(),
      walletChainId,
      betChainId,
    })
    if (!publicClient || !address) {
      console.warn('[MarketPage] execBuy: missing publicClient/address', { hasPublicClient: !!publicClient, address })
      return
    }
    const minOut = (currentQuote * SLIPPAGE_BPS) / 100n
    const functionName = side === 'YES' ? 'buyYes' : 'buyNo'
    setTxStep('buying')
    try {
      console.log('[MarketPage] execBuy: simulating', functionName)
      await simulateWrite(publicClient, {
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName,
        args: [usdcAmount, minOut],
        account: address,
      })
      console.log('[MarketPage] execBuy: sending tx (chainId=', betChainId, ')')
      const hash = await writeContractAsync({
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName,
        args: [usdcAmount, minOut],
        chainId: betChainId,
      })
      console.log('[MarketPage] execBuy: tx submitted', hash)
      setBuyTxHash(hash)
      const receipt = await waitWithHeartbeat(hash, 'execBuy')
      console.log('[MarketPage] execBuy: receipt', receipt.status)
      setTxStep('bought')
      await Promise.all([refetchMarket(), refetchBalances(), refetchQuoteYes(), refetchQuoteNo()])
    } catch (e: unknown) {
      console.error('[MarketPage] execBuy: error', e)
      setTxStep('error')
      setErrorMsg(getErrorMessage(e, 'Buy failed'))
    }
  }

  async function handleBuy() {
    console.log('[MarketPage] handleBuy: click', {
      amount,
      usdcAmount: usdcAmount.toString(),
      side,
      needsApproval,
      usdcAllowance: usdcAllowance?.toString(),
      hasQuote: !!quote,
      walletChainId,
      betChainId,
      publicClientChain: publicClient?.chain?.id,
      chainMismatch,
    })
    if (!amount || usdcAmount === 0n) return
    if (!publicClient || !address) {
      console.warn('[MarketPage] handleBuy: missing publicClient/address')
      return
    }
    if (chainMismatch) {
      console.warn('[MarketPage] handleBuy: chain mismatch, blocking', { walletChainId, betChainId })
      setTxStep('error')
      setErrorMsg(`Wallet is on chain ${walletChainId}, market is on chain ${betChainId}. Switch wallet first.`)
      return
    }
    if (!quote) {
      setTxStep('error')
      setErrorMsg('Quote not ready, please try again.')
      return
    }
    setErrorMsg('')

    if (needsApproval) {
      console.log('[MarketPage] handleBuy: approve params', {
        functionName: 'approve',
        tokenAddress: usdcAddr,
        spender: marketAddr,
        amount: usdcAmount.toString(),
        amountHex: `0x${usdcAmount.toString(16)}`,
        account: address,
        betChainId,
        walletChainId,
        publicClientChain: publicClient.chain?.id,
        publicClientTransport: publicClient.transport?.type,
        chainsEqual: walletChainId === betChainId,
      })
      setTxStep('approving')
      try {
        console.log('[MarketPage] handleBuy: simulating approve …')
        const simResult = await simulateWrite(publicClient, {
          address: usdcAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [marketAddr, usdcAmount],
          account: address,
        })
        console.log('[MarketPage] handleBuy: approve simulate result', simResult)
        console.log('[MarketPage] handleBuy: approve sendTransaction args', {
          to: usdcAddr,
          chainId: betChainId,
        })
        const hash = await writeContractAsync({
          address: usdcAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [marketAddr, usdcAmount],
          chainId: betChainId,
        })
        console.log('[MarketPage] handleBuy: approve tx submitted', hash)
        const receipt = await waitWithHeartbeat(hash, 'handleBuy.approve')
        console.log('[MarketPage] handleBuy: approve receipt', receipt.status)
        const refetched = await refetchBalances()
        const newAllowance = refetched.data?.[5]?.result as bigint | undefined
        console.log('[MarketPage] handleBuy: refetched allowance', newAllowance?.toString())
      } catch (e: unknown) {
        console.error('[MarketPage] handleBuy: approve error', e)
        setTxStep('error')
        setErrorMsg(getErrorMessage(e, 'Approve failed'))
        return
      }
    }

    console.log('[MarketPage] handleBuy: proceeding to execBuy')
    await execBuy(quote)
  }

  async function handleRedeem() {
    if (!winningBalance || winningBalance === 0n) return
    if (!publicClient || !address) return
    setErrorMsg('')
    setTxStep('redeeming')
    try {
      await simulateWrite(publicClient, {
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'redeem',
        args: [winningBalance],
        account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'redeem',
        args: [winningBalance],
        chainId: betChainId,
      })
      setRedeemTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStep('redeemed')
      await refetchBalances()
    } catch (e: unknown) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(e, 'Redeem failed'))
    }
  }

  async function handleAddLiquidity() {
    if (!publicClient || !address) return
    const usdc = parseUnits(addLpAmount || '0', 6)
    if (usdc === 0n) return
    if (usdcBalance !== undefined && usdcBalance < usdc) {
      setTxStep('error')
      setErrorMsg(`Insufficient USDC (have ${formatUsdc(usdcBalance)}).`)
      return
    }
    setErrorMsg('')

    try {
      if ((usdcAllowance ?? 0n) < usdc) {
        setTxStep('approving')
        await simulateWrite(publicClient, {
          address: usdcAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [marketAddr, usdc],
          account: address,
        })
        const approveHash = await writeContractAsync({
          address: usdcAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [marketAddr, usdc],
          chainId: betChainId,
        })
        await waitWithHeartbeat(approveHash, 'handleAddLiquidity.approve')
        await refetchBalances()
      }

      setTxStep('addingLp')
      await simulateWrite(publicClient, {
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'addLiquidity',
        args: [usdc],
        account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'addLiquidity',
        args: [usdc],
        chainId: betChainId,
      })
      setAddLpTxHash(hash)
      await waitWithHeartbeat(hash, 'handleAddLiquidity')
      setTxStep('addedLp')
      await Promise.all([refetchMarket(), refetchBalances()])
    } catch (e: unknown) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(e, 'Add liquidity failed'))
    }
  }

  async function handleRemoveLiquidity() {
    if (!publicClient || !address) return
    if (!removeShares) return
    const shares = parseUnits(removeShares, 6)
    if (shares === 0n) return
    if (userAvailableLp !== undefined && shares > userAvailableLp) {
      setTxStep('error')
      setErrorMsg('Cannot remove more than your unlocked LP shares.')
      return
    }
    setErrorMsg('')
    setTxStep('removingLp')
    try {
      await simulateWrite(publicClient, {
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'removeLiquidity',
        args: [shares],
        account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'removeLiquidity',
        args: [shares],
        chainId: betChainId,
      })
      setRemoveLpTxHash(hash)
      await waitWithHeartbeat(hash, 'handleRemoveLiquidity')
      setTxStep('removedLp')
      await Promise.all([refetchMarket(), refetchBalances()])
    } catch (e: unknown) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(e, 'Remove liquidity failed'))
    }
  }

  async function handleRedeemPair() {
    if (!publicClient || !address) return
    if (!pairAmount) return
    const tokens = parseUnits(pairAmount, 6)
    if (tokens === 0n) return
    if (tokens > pairMax) {
      setTxStep('error')
      setErrorMsg(`Cannot pair-redeem more than min(YES, NO) = ${formatUsdc(pairMax)}.`)
      return
    }
    setErrorMsg('')
    setTxStep('redeemingPair')
    try {
      await simulateWrite(publicClient, {
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'redeemPair',
        args: [tokens],
        account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'redeemPair',
        args: [tokens],
        chainId: betChainId,
      })
      setRedeemPairTxHash(hash)
      await waitWithHeartbeat(hash, 'handleRedeemPair')
      setTxStep('redeemedPair')
      await Promise.all([refetchMarket(), refetchBalances()])
    } catch (e: unknown) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(e, 'Pair redeem failed'))
    }
  }

  async function handleLpClaim() {
    if (!publicClient || !address) return
    setErrorMsg('')
    setTxStep('claiming')
    try {
      await simulateWrite(publicClient, {
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimLpPayout',
        args: [],
        account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimLpPayout',
        args: [],
        chainId: betChainId,
      })
      setLpClaimTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setTxStep('claimed')
      await refetchBalances()
    } catch (e: unknown) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(e, 'LP claim failed'))
    }
  }

  // ── Derived display ────────────────────────────────────────────────────────
  const yesPct   = yesProbability ? formatProbability(yesProbability) : '50.00'
  const noPct    = noProbability  ? formatProbability(noProbability)  : '50.00'
  const yesWidth = yesProbability ? Number((yesProbability * 100n) / BigInt(1e18)) : 50

  // Oracle wiring is stored in the market itself. Probe the priceFeed for its
  // decimals so we can render the threshold and settledPrice as human numbers.
  const { data: oracleDecimalsBn } = useReadContract({
    address: priceFeed,
    abi: [{ type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' }] as const,
    functionName: 'decimals',
    chainId: betChainId,
    query: { enabled: !!priceFeed && priceFeed !== '0x0000000000000000000000000000000000000000' },
  })
  const oracleDecimals = oracleDecimalsBn !== undefined ? Number(oracleDecimalsBn) : 8

  function formatScaledInt(v: bigint, decimals: number): string {
    const neg = v < 0n
    const u = neg ? -v : v
    const s = u.toString().padStart(decimals + 1, '0')
    const whole = s.slice(0, s.length - decimals)
    const frac  = decimals > 0 ? s.slice(s.length - decimals).replace(/0+$/, '') : ''
    const w = Number(whole).toLocaleString()
    return (neg ? '-' : '') + (frac.length > 0 ? `${w}.${frac}` : w)
  }

  const thresholdHuman    = threshold !== undefined ? formatScaledInt(threshold, oracleDecimals) : null
  const settledPriceHuman =
    settledPrice !== undefined && settledPrice !== 0n
      ? formatScaledInt(settledPrice, oracleDecimals)
      : null
  const directionLabel = aboveWins === undefined ? null : aboveWins ? 'above' : 'below'

  if (!contractAddress) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-0)] text-[var(--color-ink)]">
        <p className="text-[#dc2626]">Invalid address</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ConnectWallet />
        </header>

        {chainMismatch && (
          <div className="mt-6 rounded-2xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] p-4 text-sm text-[#d97706]">
            ⚠️ Your wallet is on a different network. Please switch to <span className="font-semibold">{chainConfig?.chain?.name || `chain ${betChainId}`}</span> to interact with this market.
          </div>
        )}

        {!question && (
          <div className="mt-16 text-center">
            <div className="animate-spin text-3xl">⏳</div>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Loading market…</p>
          </div>
        )}

        {question && (
          <div className="mt-10 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
            {/* ── Left column ──────────────────────────────────────────── */}
            <section className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Prediction Market</p>
                <h1 className={`mt-4 font-semibold tracking-tight ${isResolved ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'}`}>
                  {question}
                </h1>
                {asset && thresholdHuman && directionLabel && (
                  <p className="mt-3 text-sm font-medium text-[var(--color-ink)]">
                    📊 YES wins iff <span className="font-mono">{asset}</span> {directionLabel === 'above' ? '≥' : '≤'}{' '}
                    <span className="font-mono">{thresholdHuman}</span> at closing
                  </p>
                )}
                {closingTime && (
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
                    {isOpen ? '⏰ Closes' : '⏰ Closed'}: {new Date(Number(closingTime) * 1000).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Status + probability */}
              <div className="glow-card rounded-[28px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em] ${
                      isResolved
                        ? 'border-[rgba(134,239,172,0.6)] bg-[rgba(134,239,172,0.16)] text-[#16a34a]'
                        : 'border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]'
                    }`}
                  >
                    {isOpen ? '● Open' : '● Resolved'}
                  </span>
                  {isResolved && (
                    <span
                      className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em] ${
                        yesWins
                          ? 'border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.12)] text-[#15803d]'
                          : 'border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.12)] text-[#dc2626]'
                      }`}
                    >
                      {yesWins ? '✓ YES wins' : '✓ NO wins'}
                    </span>
                  )}
                </div>

                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-[#15803d]">YES {yesPct}%</span>
                    <span className="text-[#dc2626]">NO {noPct}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[rgba(239,68,68,0.18)]">
                    <div
                      className="h-full bg-[#15803d] transition-all duration-500"
                      style={{ width: `${yesWidth}%` }}
                    />
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <MetricCard label="USDC Pool" value={totalCollateral ? `${formatUsdc(totalCollateral)} USDC` : '—'} />
                  <MetricCard label="LP Fee" value={lpSwapFeeBps !== undefined ? `${Number(lpSwapFeeBps) / 100}%` : '—'} />
                </div>

                {isResolved && settledPriceHuman && asset && thresholdHuman && directionLabel && (
                  <div className="mt-6 rounded-2xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] p-4 text-sm text-[var(--color-ink)]">
                    Settled at <span className="font-mono font-semibold">{settledPriceHuman}</span>{' '}
                    {directionLabel === 'above' ? '≥' : '≤'} threshold{' '}
                    <span className="font-mono">{thresholdHuman}</span> →{' '}
                    <span className="font-semibold">{yesWins ? 'YES wins' : 'NO wins'}</span>
                  </div>
                )}

                {isResolved && reasoning && reasoning.length > 0 && (
                  <details className="mt-6 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-ink)]">
                    <summary className="cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-ink)]">
                      🧠 Resolution reasoning
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap break-words leading-6">{reasoning}</p>
                  </details>
                )}
              </div>

              {/* My positions */}
              {isConnected && address && ((yesBalance ?? 0n) > 0n || (noBalance ?? 0n) > 0n || (userLpShares ?? 0n) > 0n) && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">My Position</p>
                  <div className="mt-5 space-y-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
                    {yesBalance !== undefined && yesBalance > 0n && (
                      <Row label="YES tokens" value={formatUsdc(yesBalance)} color="text-[#15803d]" />
                    )}
                    {noBalance !== undefined && noBalance > 0n && (
                      <Row label="NO tokens" value={formatUsdc(noBalance)} color="text-[#dc2626]" />
                    )}
                    {userLpShares !== undefined && userLpShares > 0n && (
                      <Row label="LP shares (total)" value={formatUsdc(userLpShares)} color="text-[var(--color-cyan)]" />
                    )}
                    {userLockedLpShares !== undefined && userLockedLpShares > 0n && (
                      <Row label="LP shares (locked)" value={formatUsdc(userLockedLpShares)} color="text-[#d97706]" />
                    )}
                    {userAvailableLp !== undefined && userAvailableLp > 0n && (
                      <Row label="LP shares (available)" value={formatUsdc(userAvailableLp)} color="text-[var(--color-cyan)]" bold />
                    )}
                  </div>
                  {userLockedLpShares !== undefined && userLockedLpShares > 0n && (
                    <p className="mt-3 text-xs text-[var(--color-muted)]">
                      Locked shares are the Initiator's cold-start commitment and only release at settlement via{' '}
                      <span className="font-mono">claimLpPayout</span>.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── Right column ─────────────────────────────────────────── */}
            <section className="space-y-6">
              {/* Market info */}
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Market Info</p>
                <div className="mt-4 space-y-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Status</span>
                    <span className="font-medium text-[var(--color-ink)]">{isOpen ? 'Open' : 'Resolved'}</span>
                  </div>
                  {closingTime && (
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">Resolution Time</span>
                      <span className="font-medium text-[var(--color-ink)]">{new Date(Number(closingTime) * 1000).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Chain</span>
                    <span className="font-medium text-[var(--color-ink)]">{chainConfig?.chain?.name || `Chain ${betChainId}`}</span>
                  </div>
                  {totalCollateral !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">Total Pool</span>
                      <span className="font-medium text-[var(--color-ink)]">{formatUsdc(totalCollateral)} USDC</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action panel */}
              {!isConnected && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Action Panel</p>
                  <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-muted)]">
                    Connect a wallet to trade or claim from this market.
                  </div>
                </div>
              )}

              {/* BUY */}
              {isConnected && isOpen && txStep === 'idle' && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Buy Outcome</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {(['YES', 'NO'] as Side[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSide(s)}
                        className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${
                          side === s
                            ? s === 'YES'
                              ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]'
                              : 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]'
                            : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'
                        }`}
                      >
                        {s === 'YES' ? '✓ YES' : '✗ NO'}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Amount</label>
                    <div className="mt-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Selected</span>
                        <span className="text-2xl font-semibold text-[var(--color-ink)]">{amount} USDC</span>
                      </div>
                      <input
                        type="range"
                        min={minSliderValue}
                        max={maxSliderValue}
                        step={SLIDER_STEP}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(0,0,255,0.12)] accent-[var(--color-cyan)]"
                      />
                      <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        <span>{minSliderValue} USDC</span>
                        <span>{maxSliderValue} USDC</span>
                      </div>
                    </div>
                  </div>

                  {quote !== undefined && usdcAmount > 0n && (
                    <div className="mt-4 space-y-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-xs">
                      <Row label="You spend" value={`${amount} USDC`} />
                      <Row
                        label="You receive ~"
                        value={`${formatUsdc(quote)} ${side}`}
                        color={side === 'YES' ? 'text-[#15803d]' : 'text-[#dc2626]'}
                        bold
                      />
                      <Row label="Min (2% slippage)" value={`${formatUsdc((quote * SLIPPAGE_BPS) / 100n)} ${side}`} />
                    </div>
                  )}

                  {!hasEnough && amount && usdcAmount > 0n && (
                    <div className="mt-4 rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] p-3 text-center text-xs text-[#dc2626]">
                      ❌ Insufficient USDC{usdcBalance !== undefined ? ` (have ${formatUsdc(usdcBalance)})` : ''}
                    </div>
                  )}

                  {hasEnough && usdcAmount > 0n && (
                    <button
                      onClick={handleBuy}
                      className={`mt-4 w-full rounded-full px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 ${
                        side === 'YES' ? 'bg-[#15803d]' : 'bg-[#dc2626]'
                      }`}
                    >
                      {needsApproval ? 'Approve & ' : ''}Buy {side} for {amount} USDC
                    </button>
                  )}
                </div>
              )}

              {/* ── v2: Add Liquidity ────────────────────────────────────── */}
              {isConnected && isOpen && txStep === 'idle' && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Add Liquidity</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
                    Deposit USDC symmetrically into both pool reserves and earn a share of every swap fee.
                  </p>
                  <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                    <div className="flex items-end justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">USDC</span>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={addLpAmount}
                        onChange={(e) => setAddLpAmount(e.target.value)}
                        className="w-32 bg-transparent text-right text-xl font-semibold text-[var(--color-ink)] outline-none"
                      />
                    </div>
                    <div className="mt-2 text-right text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      Balance {usdcBalance !== undefined ? `${formatUsdc(usdcBalance)} USDC` : '—'}
                    </div>
                  </div>
                  <button
                    onClick={handleAddLiquidity}
                    disabled={!addLpAmount || Number(addLpAmount) <= 0}
                    className="mt-4 w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {(() => {
                      const usdc = addLpAmount ? parseUnits(addLpAmount, 6) : 0n
                      const needs = (usdcAllowance ?? 0n) < usdc
                      return needs ? 'Approve & Add Liquidity' : 'Add Liquidity'
                    })()}
                  </button>
                </div>
              )}

              {/* ── v2: Redeem Pair (Trader early exit) ──────────────────── */}
              {isConnected && isOpen && txStep === 'idle' && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Redeem Pair</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
                    Burn equal amounts of YES and NO to walk away with 1:1 USDC — no fee, your pool position is unchanged.
                  </p>
                  {pairMax === 0n ? (
                    <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.6)] p-4 text-xs text-[var(--color-muted)]">
                      You hold YES <span className="font-mono">{formatUsdc(yesBalance ?? 0n)}</span> and NO{' '}
                      <span className="font-mono">{formatUsdc(noBalance ?? 0n)}</span>. Acquire both sides first
                      (buy the opposing token, or pull a pair out via Remove Liquidity) to enable this exit.
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                        <div className="flex items-end justify-between gap-3">
                          <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Pairs</span>
                          <input
                            type="number"
                            min={0}
                            step="0.000001"
                            max={Number(pairMax) / 1_000_000}
                            value={pairAmount}
                            onChange={(e) => setPairAmount(e.target.value)}
                            placeholder="0"
                            className="w-40 bg-transparent text-right text-xl font-semibold text-[var(--color-ink)] outline-none"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                          <span>Max {formatUsdc(pairMax)}</span>
                          <button
                            type="button"
                            onClick={() => setPairAmount(String(Number(pairMax) / 1_000_000))}
                            className="underline hover:text-[var(--color-ink)]"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={handleRedeemPair}
                        disabled={!pairAmount || Number(pairAmount) <= 0}
                        className="mt-4 w-full rounded-full bg-[var(--color-ink)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Redeem {pairAmount || '0'} YES + NO for {pairAmount || '0'} USDC
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── v2: Remove Liquidity ─────────────────────────────────── */}
              {isConnected && isOpen && txStep === 'idle' && userLpShares !== undefined && userLpShares > 0n && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Remove Liquidity</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
                    Burn unlocked LP shares to pull pro-rata YES/NO out of the pool. Symmetric portion returns as USDC;
                    the rest comes back as outcome tokens.
                  </p>
                  {(userAvailableLp ?? 0n) === 0n ? (
                    <div className="mt-4 rounded-2xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] p-4 text-xs text-[#d97706]">
                      🔒 All <span className="font-mono">{formatUsdc(userLpShares)}</span> of your LP shares are locked
                      until settlement (Initiator cold-start commitment). They release automatically via{' '}
                      <span className="font-mono">Claim LP Payout</span> after the market resolves.
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                        <div className="flex items-end justify-between gap-3">
                          <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Shares</span>
                          <input
                            type="number"
                            min={0}
                            step="0.000001"
                            max={Number(userAvailableLp ?? 0n) / 1_000_000}
                            value={removeShares}
                            onChange={(e) => setRemoveShares(e.target.value)}
                            placeholder="0"
                            className="w-40 bg-transparent text-right text-xl font-semibold text-[var(--color-ink)] outline-none"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                          <span>Available {formatUsdc(userAvailableLp ?? 0n)}</span>
                          <button
                            type="button"
                            onClick={() => setRemoveShares(String(Number(userAvailableLp ?? 0n) / 1_000_000))}
                            className="underline hover:text-[var(--color-ink)]"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={handleRemoveLiquidity}
                        disabled={!removeShares || Number(removeShares) <= 0}
                        className="mt-4 w-full rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[rgba(0,82,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove {removeShares || '0'} LP shares
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* REDEEM */}
              {isConnected && isResolved && winningBalance !== undefined && winningBalance > 0n && txStep === 'idle' && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Redeem Winnings</p>
                  <div className="mt-4 space-y-2 rounded-2xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] p-4 text-xs">
                    <Row label="Winning tokens" value={`${formatUsdc(winningBalance)} ${yesWins ? 'YES' : 'NO'}`} color="text-[#15803d]" />
                    {redeemEstimate && <Row label="You receive ~" value={`${formatUsdc(redeemEstimate)} USDC`} color="text-[#15803d]" bold />}
                  </div>
                  <button
                    onClick={handleRedeem}
                    className="mt-4 w-full rounded-full bg-[#15803d] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    💰 Redeem {formatUsdc(winningBalance)} {yesWins ? 'YES' : 'NO'}
                  </button>
                </div>
              )}

              {/* LP CLAIM */}
              {isConnected && isResolved && userLpShares !== undefined && userLpShares > 0n && !userLpClaimed && txStep === 'idle' && (
                <div className="glow-card rounded-[28px] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">LP Payout</p>
                  <p className="mt-4 text-sm text-[var(--color-muted)]">
                    Claim your share of the winning pool reserve. This single call releases <strong>all</strong> of
                    your LP shares — both unlocked and Initiator-locked.
                  </p>
                  {userLockedLpShares !== undefined && userLockedLpShares > 0n && (
                    <div className="mt-3 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-3 text-xs">
                      <Row label="Total LP shares"  value={formatUsdc(userLpShares)}       color="text-[var(--color-ink)]" bold />
                      <Row label="Locked"           value={formatUsdc(userLockedLpShares)} color="text-[#d97706]" />
                      <Row label="Unlocked"        value={formatUsdc((userLpShares ?? 0n) - (userLockedLpShares ?? 0n))} color="text-[var(--color-cyan)]" />
                    </div>
                  )}
                  <button
                    onClick={handleLpClaim}
                    className="mt-4 w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90"
                  >
                    🏦 Claim LP Payout
                  </button>
                </div>
              )}

              {isConnected && isResolved && userLpClaimed && (
                <p className="text-center text-xs text-[var(--color-muted)]">✅ LP payout already claimed</p>
              )}

              {isConnected && isResolved && winningBalance === 0n && (!userLpShares || userLpShares === 0n) && (
                <div className="glow-card rounded-[28px] p-6">
                  <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] p-4 text-center text-sm text-[#dc2626]">
                    😔 Your {yesWins ? 'NO' : 'YES'} tokens did not win this market.
                  </div>
                </div>
              )}

              {/* Tx status */}
              {(txStep === 'approving' || txStep === 'buying' || txStep === 'redeeming' || txStep === 'claiming' ||
                txStep === 'addingLp' || txStep === 'removingLp' || txStep === 'redeemingPair') && (
                <div className="glow-card rounded-[28px] p-6">
                  <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                    <span className="mr-2 inline-block animate-spin">⏳</span>
                    {txStep === 'approving' && 'Approving USDC… Confirm in wallet.'}
                    {txStep === 'buying' && `Buying ${side}… Confirm in wallet.`}
                    {txStep === 'redeeming' && 'Redeeming tokens… Confirm in wallet.'}
                    {txStep === 'claiming' && 'Claiming LP payout… Confirm in wallet.'}
                    {txStep === 'addingLp' && 'Adding liquidity… Confirm in wallet.'}
                    {txStep === 'removingLp' && 'Removing liquidity… Confirm in wallet.'}
                    {txStep === 'redeemingPair' && 'Redeeming pair… Confirm in wallet.'}
                  </div>
                </div>
              )}

              {txStep === 'bought' && (
                <SuccessCard txHash={buyTxHash} explorerUrl={explorerUrl} onContinue={() => setTxStep('idle')}>
                  ✅ Bought {side} tokens!
                </SuccessCard>
              )}
              {txStep === 'redeemed' && (
                <SuccessCard txHash={redeemTxHash} explorerUrl={explorerUrl} onContinue={() => setTxStep('idle')}>
                  ✅ Redeemed! USDC sent to your wallet.
                </SuccessCard>
              )}
              {txStep === 'claimed' && (
                <SuccessCard txHash={lpClaimTxHash} explorerUrl={explorerUrl} onContinue={() => setTxStep('idle')}>
                  ✅ LP payout claimed!
                </SuccessCard>
              )}
              {txStep === 'addedLp' && (
                <SuccessCard txHash={addLpTxHash} explorerUrl={explorerUrl} onContinue={() => { setTxStep('idle'); setAddLpAmount('5') }}>
                  ✅ Liquidity added to the pool!
                </SuccessCard>
              )}
              {txStep === 'removedLp' && (
                <SuccessCard txHash={removeLpTxHash} explorerUrl={explorerUrl} onContinue={() => { setTxStep('idle'); setRemoveShares('') }}>
                  ✅ Liquidity removed — USDC + outcome tokens sent to your wallet.
                </SuccessCard>
              )}
              {txStep === 'redeemedPair' && (
                <SuccessCard txHash={redeemPairTxHash} explorerUrl={explorerUrl} onContinue={() => { setTxStep('idle'); setPairAmount('') }}>
                  ✅ Pair redeemed — USDC sent to your wallet.
                </SuccessCard>
              )}

              {txStep === 'error' && (
                <div className="glow-card rounded-[28px] p-6">
                  <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] p-4 text-sm text-[#dc2626]">
                    <p>❌ {errorMsg}</p>
                    <button
                      onClick={() => { setTxStep('idle'); setErrorMsg('') }}
                      className="mt-3 block text-xs underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="fixed bottom-4 right-4 z-30 flex gap-2">
        <a
          href={`${explorerUrl}/address/${contractAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--color-ink)] shadow-[0_4px_12px_rgba(20,20,20,0.1)]"
        >
          View on Scan
        </a>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-3 text-xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  )
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className={`font-mono ${bold ? 'font-semibold' : ''} ${color ?? 'text-[var(--color-ink)]'}`}>{value}</span>
    </div>
  )
}

function SuccessCard({
  children,
  txHash,
  explorerUrl,
  onContinue,
}: {
  children: React.ReactNode
  txHash?: `0x${string}`
  explorerUrl: string
  onContinue?: () => void
}) {
  return (
    <div className="glow-card rounded-[28px] p-6">
      <div className="space-y-2 rounded-2xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] p-4 text-center text-sm text-[#15803d]">
        <div>{children}</div>
        {txHash && (
          <a href={`${explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="block text-xs underline">
            View transaction ↗
          </a>
        )}
        {onContinue && (
          <button
            type="button"
            onClick={onContinue}
            className="mt-2 inline-flex items-center justify-center rounded-full border border-[rgba(34,197,94,0.4)] bg-white px-4 py-2 text-xs font-semibold text-[#15803d] transition hover:bg-[rgba(34,197,94,0.08)]"
          >
            ↻ Continue
          </button>
        )}
      </div>
    </div>
  )
}
