import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { useAuth } from '@/hooks/useAuth'
import { SiteNav } from '@/components/SiteNav'
import { TxToast } from '@/components/TxToast'
import { InfoTooltip } from '@/components/InfoTooltip'
import {
  EVENT_MARKET_ABI,
  EventMarketStatus,
  eventMarketStatusLabel,
  ERC20_ABI,
  getContractsForChain,
} from '@/config/contracts'
import { getChainConfig, getChainIdBySlug, getChainSlug } from '@/config/chains'
import { eventMarketAddressOnChain, findEventMarketGroup } from '@/data/eventMarketDeployments'
import { getAuthToken } from '@/lib/api'
import { formatProbability, formatUsdc} from '@/lib/utils'
import { simulateWrite } from '@/lib/simulateWrite'
import { recordReferralTrade } from '@/lib/referrals'
import { POP_AMM_CSS } from './popAmmStyles'

type TradeMode = 'BUY' | 'SELL'
type Side = 'YES' | 'NO'
type TxStep =
  | 'idle'
  | 'approving'
  | 'buying' | 'bought'
  | 'selling' | 'sold'
  | 'claiming' | 'claimed'
  | 'error'

const SLIPPAGE_BPS = 200n

// MockUSDC.faucet(whole) mints `whole` USDC (6-decimal) to the caller.
const FAUCET_WHOLE = 100n
const MOCK_USDC_FAUCET_ABI = [
  { type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [{ name: 'whole', type: 'uint256' }], outputs: [] },
] as const

function clampSlip(quote: bigint): bigint {
  return (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n
}

export function EventMarketAmmPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { isAuthenticated, isSigningIn, signIn } = useAuth()
  const walletChainId = useChainId()
  const chainSlug = searchParams.get('chain')
  const marketChainId = getChainIdBySlug(chainSlug) ?? 0
  const unknownChain = marketChainId === 0
  const publicClient = usePublicClient({ chainId: marketChainId })
  const contracts = getContractsForChain(marketChainId)
  const chainConfig = getChainConfig(marketChainId)
  const explorerUrl = chainConfig?.explorerUrl || 'https://sepolia.basescan.org'
  const chainMismatch = isConnected && walletChainId !== marketChainId
  // Every chain we run these markets on (base-sepolia + arc-testnet) uses a
  // self-deployed, faucet-mintable MockUSDC as collateral — so the "Get USDC"
  // faucet should show on any testnet, not just Arc.
  const isTestnetChain = chainConfig?.isTestnet === true
  const marketAddr = contractAddress as `0x${string}`

  // Follow the wallet's network: if the user switches to a chain where this same
  // market is also deployed (at a different address), navigate to that chain's
  // contract so the URL and on-chain reads track the connected network.
  useEffect(() => {
    if (!isConnected || walletChainId === marketChainId) return
    const group = findEventMarketGroup(marketAddr)
    if (!group) return
    const target = eventMarketAddressOnChain(group, walletChainId)
    const targetSlug = getChainSlug(walletChainId)
    if (!target || !targetSlug) return
    if (target.toLowerCase() === marketAddr.toLowerCase()) return
    navigate(`/fifa/${target}?chain=${targetSlug}`, { replace: true })
  }, [isConnected, walletChainId, marketChainId, marketAddr, navigate])

  const [tradeMode, setTradeMode] = useState<TradeMode>('BUY')
  const [side, setSide] = useState<Side>('YES')
  const [buyAmount, setBuyAmount] = useState('')
  const [sellAmount, setSellAmount] = useState('')
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [toastTitle, setToastTitle] = useState('Transaction confirmed')
  const [toastShareEnabled, setToastShareEnabled] = useState(true)
  const [toastError, setToastError] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [faucetStatus, setFaucetStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [faucetMsg, setFaucetMsg] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const marketReads = useReadContracts({
    contracts: [
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'question',           chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'resolutionSource',   chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'bettingDeadline',    chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'resolveAfter',       chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'status',             chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'yesWins',            chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'isDraw',             chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'yesReserve',         chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'noReserve',          chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'totalCollateral',    chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'netUsdcPerYesToken', chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'netUsdcPerNoToken',  chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'yesProbability',     chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'usdc',               chainId: marketChainId },
    ],
  })
  const r = marketReads.data
  const question         = (r?.[0]?.result  as string  | undefined) ?? ''
  const resolutionSource = (r?.[1]?.result  as string  | undefined) ?? ''
  const bettingDeadline  = (r?.[2]?.result  as bigint  | undefined) ?? 0n
  const status          = Number(r?.[4]?.result ?? 0)
  const yesWins         = Boolean(r?.[5]?.result)
  const isDraw          = Boolean(r?.[6]?.result)
  const totalCollateral = (r?.[9]?.result  as bigint  | undefined) ?? 0n
  const netUsdcPerYes   = (r?.[10]?.result as bigint  | undefined) ?? 0n
  const netUsdcPerNo    = (r?.[11]?.result as bigint  | undefined) ?? 0n
  const yesProb         = (r?.[12]?.result as bigint  | undefined) ?? 0n
  // Read the collateral token straight from the market so approvals, balance
  // reads and the faucet always target the exact USDC this market uses —
  // independent of any per-chain config drift (base-sepolia's default config
  // USDC is Circle's, but our own markets use a faucet-mintable MockUSDC).
  // Falls back to the config address while the read is loading.
  const marketUsdc      = r?.[13]?.result as `0x${string}` | undefined
  const usdcToken       = (marketUsdc ?? contracts.usdcAddress) as `0x${string}`

  const isOpen     = status === EventMarketStatus.Open
  const isSettled  = status === EventMarketStatus.Settled
  const deadlinePassed = Number(bettingDeadline) > 0 && now >= Number(bettingDeadline)
  const tradeAllowed = isOpen && !deadlinePassed

  const userReads = useReadContracts({
    contracts: address ? [
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'yesBalanceOf', args: [address], chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'noBalanceOf',  args: [address], chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'lpShares',  args: [address], chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'lpClaimed', args: [address], chainId: marketChainId },
    ] : [],
    query: { enabled: !!address },
  })
  const u = userReads.data
  const yesBal     = (u?.[0]?.result as bigint | undefined) ?? 0n
  const noBal      = (u?.[1]?.result as bigint | undefined) ?? 0n
  const myLpShares = (u?.[2]?.result as bigint | undefined) ?? 0n
  const lpClaimed  = Boolean(u?.[3]?.result)

  const { refetch: refetchUsdcBal } = useReadContract({
    address: usdcToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: marketChainId,
    query: { enabled: !!address },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, marketAddr] : undefined,
    chainId: marketChainId,
    query: { enabled: !!address },
  })

  const buyUsdcAmount = useMemo(() => {
    try { return buyAmount && Number(buyAmount) > 0 ? parseUnits(buyAmount, 6) : 0n } catch { return 0n }
  }, [buyAmount])

  const sellTokenAmount = useMemo(() => {
    try { return sellAmount && Number(sellAmount) > 0 ? parseUnits(sellAmount, 6) : 0n } catch { return 0n }
  }, [sellAmount])

  const isBuy = tradeMode === 'BUY'
  const tradeActive = !isSettled

  const { data: quoteYesOut } = useReadContract({
    address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'quoteYes',
    args: [buyUsdcAmount], chainId: marketChainId,
    query: { enabled: buyUsdcAmount > 0n && tradeAllowed && isBuy && side === 'YES' && tradeActive },
  })
  const { data: quoteNoOut } = useReadContract({
    address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'quoteNo',
    args: [buyUsdcAmount], chainId: marketChainId,
    query: { enabled: buyUsdcAmount > 0n && tradeAllowed && isBuy && side === 'NO' && tradeActive },
  })
  const { data: quoteSellYesOut } = useReadContract({
    address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'quoteSellYes',
    args: [sellTokenAmount], chainId: marketChainId,
    query: { enabled: sellTokenAmount > 0n && tradeAllowed && !isBuy && side === 'YES' && tradeActive },
  })
  const { data: quoteSellNoOut } = useReadContract({
    address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'quoteSellNo',
    args: [sellTokenAmount], chainId: marketChainId,
    query: { enabled: sellTokenAmount > 0n && tradeAllowed && !isBuy && side === 'NO' && tradeActive },
  })
  const buyQuote: bigint  = side === 'YES' ? (quoteYesOut  ?? 0n) as bigint : (quoteNoOut  ?? 0n) as bigint
  const sellQuote: bigint = side === 'YES' ? (quoteSellYesOut ?? 0n) as bigint : (quoteSellNoOut ?? 0n) as bigint

  const needsApprovalForBuy = allowance === undefined || (allowance as bigint) < buyUsdcAmount
  const sellBalance = side === 'YES' ? yesBal : noBal

  const refetchAll = async () => {
    await Promise.all([marketReads.refetch(), userReads.refetch(), refetchUsdcBal(), refetchAllowance()])
  }
  async function handleAirdrop() {
    if (!publicClient || !address) return
    setFaucetStatus('loading')
    setFaucetMsg('')
    try {
      await simulateWrite(publicClient, {
        address: usdcToken, abi: MOCK_USDC_FAUCET_ABI, functionName: 'faucet',
        args: [FAUCET_WHOLE], account: address,
      })
      const hash = await writeContractAsync({
        address: usdcToken, abi: MOCK_USDC_FAUCET_ABI, functionName: 'faucet',
        args: [FAUCET_WHOLE], chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setFaucetStatus('done')
      setTxHash(hash)
      setToastTitle('100 test USDC received')
      setToastShareEnabled(false)
      setToastError(false)
      setToastOpen(true)
      await Promise.all([refetchUsdcBal(), refetchAllowance()])
    } catch (e) {
      setFaucetStatus('error')
      setFaucetMsg(errMsg(e, 'Faucet failed'))
    }
  }

  const { writeContractAsync } = useWriteContractWithAttribution()

  function errMsg(e: unknown, fallback: string) {
    if (e instanceof Error && e.message) return e.message.slice(0, 240)
    return fallback
  }

  // Surface trade/claim failures in the toast (same spot as the success toast)
  // rather than inline, so the card layout doesn't shift.
  function showError(msg: string) {
    setTxStep('error')
    setErrorMsg(msg)
    setToastTitle('Transaction failed')
    setToastError(true)
    setToastOpen(true)
  }

  function selectSide(nextSide: Side) {
    if (nextSide === side) return
    setSide(nextSide)
    setBuyAmount('')
  }

  async function ensureSignedInForReferral(): Promise<boolean> {
    if (isAuthenticated || getAuthToken()) return true
    await signIn()
    return Boolean(getAuthToken())
  }

  async function ensureAllowance(amount: bigint): Promise<void> {
    if (!publicClient || !address) return
    const current = (await publicClient.readContract({
      address: usdcToken, abi: ERC20_ABI, functionName: 'allowance',
      args: [address, marketAddr],
    })) as bigint
    if (current >= amount) return
    await approveUsdc(amount)
  }

  async function approveUsdc(amount: bigint) {
    if (!publicClient || !address) return
    setTxStep('approving')
    await simulateWrite(publicClient, {
      address: usdcToken, abi: ERC20_ABI, functionName: 'approve',
      args: [marketAddr, amount], account: address,
    })
    const hash = await writeContractAsync({
      address: usdcToken, abi: ERC20_ABI, functionName: 'approve',
      args: [marketAddr, amount], chainId: marketChainId,
    })
    await publicClient.waitForTransactionReceipt({ hash })
    await refetchAllowance()
  }

  async function handleBuy() {
    if (!publicClient || !address || buyUsdcAmount === 0n) return
    setErrorMsg('')
    try {
      if (!(await ensureSignedInForReferral())) {
        showError('Sign in with your wallet before trading.')
        return
      }
      await ensureAllowance(buyUsdcAmount)
      const minOut = clampSlip(buyQuote)
      setTxStep('buying')
      const fn = side === 'YES' ? 'buyYes' : 'buyNo'
      await simulateWrite(publicClient, {
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: fn,
        args: [buyUsdcAmount, minOut], account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: fn,
        args: [buyUsdcAmount, minOut], chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      void recordReferralTrade({ chainId: marketChainId, marketAddress: marketAddr, txHash: hash })
      setTxHash(hash)
      setTxStep('bought')
      setToastTitle('Transaction confirmed')
      setToastShareEnabled(true)
      setToastError(false)
      setToastOpen(true)
      await refetchAll()
    } catch (e) {
      showError(errMsg(e, 'Buy failed'))
    }
  }

  async function handleSell() {
    if (!publicClient || !address || sellTokenAmount === 0n) return
    setErrorMsg('')
    if (sellTokenAmount > sellBalance) {
      showError(`Max ${side}: ${formatUsdc(sellBalance)}`)
      return
    }
    try {
      if (!(await ensureSignedInForReferral())) {
        showError('Sign in with your wallet before trading.')
        return
      }
      const minOut = clampSlip(sellQuote)
      setTxStep('selling')
      const fn = side === 'YES' ? 'sellYes' : 'sellNo'
      await simulateWrite(publicClient, {
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: fn,
        args: [sellTokenAmount, minOut], account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: fn,
        args: [sellTokenAmount, minOut], chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      void recordReferralTrade({ chainId: marketChainId, marketAddress: marketAddr, txHash: hash })
      setTxHash(hash)
      setTxStep('sold')
      setToastTitle('Transaction confirmed')
      setToastShareEnabled(true)
      setToastError(false)
      setToastOpen(true)
      await refetchAll()
    } catch (e) {
      showError(errMsg(e, 'Sell failed'))
    }
  }

  async function handleClaimSide(claimSide: Side) {
    if (!publicClient || !address) return
    setErrorMsg('')
    const bal = claimSide === 'YES' ? yesBal : noBal
    if (bal === 0n) return
    try {
      setTxStep('claiming')
      const fn = claimSide === 'YES' ? 'redeemYes' : 'redeemNo'
      await simulateWrite(publicClient, {
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: fn,
        args: [bal], account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: fn,
        args: [bal], chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxHash(hash)
      setTxStep('claimed')
      setToastTitle('Transaction confirmed')
      setToastShareEnabled(true)
      setToastError(false)
      setToastOpen(true)
      await refetchAll()
    } catch (e) {
      showError(errMsg(e, 'Claim failed'))
    }
  }

  async function handleClaimLp() {
    if (!publicClient || !address) return
    setErrorMsg('')
    try {
      setTxStep('claiming')
      await simulateWrite(publicClient, {
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'claimLpPayout', account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'claimLpPayout', chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxHash(hash)
      setTxStep('claimed')
      setToastTitle('Transaction confirmed')
      setToastShareEnabled(true)
      setToastError(false)
      setToastOpen(true)
      await refetchAll()
    } catch (e) {
      showError(errMsg(e, 'LP claim failed'))
    }
  }

  const deadlineCountdown = useMemo(() => {
    const remaining = Number(bettingDeadline) - now
    if (remaining <= 0) return null
    const d = Math.floor(remaining / 86400)
    const h = Math.floor((remaining % 86400) / 3600)
    const m = Math.floor((remaining % 3600) / 60)
    const s = remaining % 60
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m ${s}s`
    return `${m}m ${s}s`
  }, [bettingDeadline, now])

  const shareUrl = useMemo(() => {
    if (!contractAddress || typeof window === 'undefined') return ''
    const slug = getChainSlug(marketChainId) ?? chainSlug ?? ''
    return `${window.location.origin}/fifa/${contractAddress}?chain=${slug}`
  }, [contractAddress, marketChainId, chainSlug])

  const isKickoffCountdown = tradeAllowed && !!deadlineCountdown
  const lockLabel = isKickoffCountdown
    ? `Kickoff ${deadlineCountdown}`
    : isSettled
      ? (isDraw ? 'Draw' : yesWins ? 'YES wins' : 'NO wins')
      : eventMarketStatusLabel(status)

  const yesPct = Number(formatProbability(yesProb))
  const noPct  = Number(formatProbability(BigInt(1e18) - yesProb))

  const txPending = isSigningIn || txStep === 'approving' || txStep === 'buying' || txStep === 'selling' || txStep === 'claiming'

  const lpLink = `/fifa/${contractAddress}/lp?chain=${chainSlug ?? ''}`

  if (unknownChain) {
    return (
      <div className="popamm">
        <style>{POP_AMM_CSS}</style>
        <SiteNav />
        <main className="pp-wrap">
          <section className="pp-card">
            <div className="pp-market">
              <div className="pp-title">Unknown chain</div>
              <p className="pp-label" style={{ marginTop: 10, lineHeight: 1.5 }}>
                This link is missing a valid <code>?chain=</code> parameter. Supported
                values are <b>base</b>, <b>base-sepolia</b>, and <b>arc-testnet</b>.
              </p>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="popamm">
      <style>{POP_AMM_CSS}</style>
      <SiteNav />
      <main className="pp-wrap">
        <div className="pp-stack">
          <h1 className="pp-hero">
            {question || 'Loading market…'}
            {resolutionSource && (
              <InfoTooltip text={resolutionSource} label="Resolution source" className="ml-[4px]" />
            )}
          </h1>

          <section className="pp-card">
            <div className="pp-cardhead">
              <div className={`pp-lock ${isKickoffCountdown ? 'pp-lock-countdown' : ''}`}>
                {isKickoffCountdown && <span className="pp-lock-icon" aria-hidden="true">⌛️</span>}
                {lockLabel}
              </div>
              <div className="pp-odds">
                <span className="pp-yesText">YES {yesPct}%</span>
                <div className="pp-bar"><div className="pp-yesbar" style={{ width: `${Math.min(100, Math.max(0, yesPct))}%` }} /></div>
                <span className="pp-noText">NO {noPct}%</span>
              </div>
            </div>

            <div className="pp-body">
              {isConnected && isTestnetChain && (
                <>
                  <div className="pp-claimrow pp-faucetrow" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="pp-coin" />
                      <div>
                        <div className="pp-faucet-title">Need test USDC?</div>
                      </div>
                    </div>
                    <button
                      className="pp-mini pp-faucet-btn"
                      onClick={handleAirdrop}
                      disabled={faucetStatus === 'loading'}
                    >
                      {faucetStatus === 'loading' ? 'Sending…' : 'Get USDC'}
                    </button>
                  </div>
                  {faucetStatus === 'error' && (
                    <div className="pp-note pp-note-err" style={{ marginBottom: 10 }}>
                      {faucetMsg || 'Faucet failed.'}
                    </div>
                  )}
                </>
              )}
              {isSettled ? (
                <ClaimPanel
                  yesBal={yesBal}
                  noBal={noBal}
                  netUsdcPerYes={netUsdcPerYes}
                  netUsdcPerNo={netUsdcPerNo}
                  myLpShares={myLpShares}
                  lpClaimed={lpClaimed}
                  claiming={txStep === 'claiming'}
                  onClaimSide={handleClaimSide}
                  onClaimLp={handleClaimLp}
                />
              ) : (
                <div>
                  <div className="pp-switch">
                    <button className={`pp-pill ${side === 'YES' ? 'pp-active pp-active-yes' : ''}`} onClick={() => selectSide('YES')}>YES</button>
                    <button className={`pp-pill ${side === 'NO' ? 'pp-active pp-active-no' : ''}`} onClick={() => selectSide('NO')}>NO</button>
                  </div>

                  <div className="pp-box">
                    <div className="pp-label">{isBuy ? 'Pay' : `Sell ${side}`}</div>
                    <div className="pp-amount">
                      <input
                        className="pp-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={isBuy ? buyAmount : sellAmount}
                        disabled={!tradeAllowed}
                        placeholder="0"
                        onChange={(e) => (isBuy ? setBuyAmount(e.target.value) : setSellAmount(e.target.value))}
                      />
                      {isBuy ? (
                        <div className="pp-token"><span className="pp-coin" />USDC</div>
                      ) : (
                        <div className="pp-token"><span className={`pp-coin ${side === 'YES' ? 'pp-yesCoin' : 'pp-noCoin'}`} />{side}</div>
                      )}
                    </div>
                    {!isBuy && (
                      <button
                        className="pp-maxbtn pp-lp-maxbtn"
                        onClick={() => setSellAmount(formatUnits(sellBalance, 6))}
                        disabled={sellBalance === 0n}
                      >
                        Max {formatUsdc(sellBalance)}
                      </button>
                    )}
                  </div>

                  <button
                    className="pp-arrow"
                    aria-label="Flip buy/sell"
                    title="Flip buy / sell"
                    onClick={() => setTradeMode(isBuy ? 'SELL' : 'BUY')}
                  >
                    ↓
                  </button>

                  <div className="pp-box">
                    <div className="pp-label">Receive</div>
                    <div className="pp-amount">
                      {isBuy ? (
                        <>
                          <div className="pp-out">{buyQuote > 0n ? formatUsdc(buyQuote) : '0'}</div>
                          <div className="pp-token"><span className={`pp-coin ${side === 'YES' ? 'pp-yesCoin' : 'pp-noCoin'}`} />{side}</div>
                        </>
                      ) : (
                        <>
                          <div className="pp-out">{sellQuote > 0n ? formatUsdc(sellQuote) : '0'}</div>
                          <div className="pp-token"><span className="pp-coin" />USDC</div>
                        </>
                      )}
                    </div>
                  </div>

                  {(isBuy ? buyQuote > 0n : sellQuote > 0n) && (
                    <div className="pp-review">
                      <div className="pp-review-row">
                        <span>Rate</span>
                        <span>
                          {isBuy
                            ? `1 USDC = ${(Number(buyQuote) / Number(buyUsdcAmount)).toFixed(4)} ${side}`
                            : `1 ${side} = ${(Number(sellQuote) / Number(sellTokenAmount)).toFixed(4)} USDC`}
                        </span>
                      </div>
                      <div className="pp-review-row">
                        <span>Min. received <span className="pp-review-hint">2% slippage</span></span>
                        <span>
                          {isBuy
                            ? `${formatUsdc(clampSlip(buyQuote))} ${side}`
                            : `${formatUsdc(clampSlip(sellQuote))} USDC`}
                        </span>
                      </div>
                      <div className="pp-review-row">
                        <span>Liquidity</span>
                        <span>${formatUsdc(totalCollateral)}</span>
                      </div>
                    </div>
                  )}

                  {!tradeAllowed && (
                    <div className="pp-note pp-note-muted">Trading closed at kickoff. Claim opens after settlement.</div>
                  )}

                  {renderAction(
                    isBuy ? (
                      <button
                        className="pp-cta pp-buy-cta"
                        onClick={handleBuy}
                        disabled={!tradeAllowed || buyUsdcAmount === 0n || txStep === 'buying' || txStep === 'approving' || isSigningIn}
                      >
                        {!isAuthenticated ? `Sign in & Buy ${side}` : needsApprovalForBuy ? `Approve & Buy ${side}` : `Buy ${side}`}
                      </button>
                    ) : (
                      <button
                        className="pp-cta"
                        onClick={handleSell}
                        disabled={!tradeAllowed || sellTokenAmount === 0n || txStep === 'selling' || isSigningIn}
                      >
                        {!isAuthenticated ? `Sign in & Sell ${side}` : `Sell ${side} → USDC`}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {txPending && (
              <div className="pp-note pp-note-info" style={{ marginTop: 6 }}>
                {txStep === 'approving' && 'Approving USDC…'}
                {txStep === 'buying' && 'Submitting buy…'}
                {txStep === 'selling' && 'Submitting sell…'}
                {txStep === 'claiming' && 'Claiming…'}
                {isSigningIn && 'Signing in…'}
              </div>
            )}

            <div className="pp-foot" style={{ marginTop: -8 }}>
              <Link to={lpLink}>Provide liquidity instead <span aria-hidden="true">→</span></Link>
            </div>
          </section>
        </div>
      </main>

      <TxToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        explorerUrl={explorerUrl}
        txHash={txHash}
        shareText="Predict the 2026 World Cup opener on POP."
        shareUrl={shareUrl || (typeof window !== 'undefined' ? window.location.href : '')}
        title={toastTitle}
        showShare={toastShareEnabled}
        error={toastError}
        message={errorMsg}
      />
    </div>
  )

  function renderAction(button: React.ReactNode) {
    if (!isConnected) return <div className="pp-note pp-note-muted">Connect a wallet to participate.</div>
    if (chainMismatch) {
      return (
        <div className="pp-note pp-note-warn">
          Wallet is on a different chain. Switch to {chainConfig?.chain?.name || `chain ${marketChainId}`} to interact.
        </div>
      )
    }
    return button
  }
}

function ClaimPanel({
  yesBal,
  noBal,
  netUsdcPerYes,
  netUsdcPerNo,
  myLpShares,
  lpClaimed,
  claiming,
  onClaimSide,
  onClaimLp,
}: {
  yesBal: bigint
  noBal: bigint
  netUsdcPerYes: bigint
  netUsdcPerNo: bigint
  myLpShares: bigint
  lpClaimed: boolean
  claiming: boolean
  onClaimSide: (side: Side) => void
  onClaimLp: () => void
}) {
  return (
    <div>
      <ClaimRow
        label="YES tokens"
        sub={`${formatUsdc(yesBal)} → ${formatUsdc((yesBal * netUsdcPerYes) / BigInt(1e18))} USDC`}
        coinClass="pp-yesCoin"
        onClick={() => onClaimSide('YES')}
        disabled={yesBal === 0n || netUsdcPerYes === 0n || claiming}
      />
      <ClaimRow
        label="NO tokens"
        sub={`${formatUsdc(noBal)} → ${formatUsdc((noBal * netUsdcPerNo) / BigInt(1e18))} USDC`}
        coinClass="pp-noCoin"
        onClick={() => onClaimSide('NO')}
        disabled={noBal === 0n || netUsdcPerNo === 0n || claiming}
      />
      <ClaimRow
        label="LP payout"
        sub={lpClaimed ? 'Already claimed' : myLpShares > 0n ? `${myLpShares.toString()} shares` : 'No LP shares'}
        coinClass="pp-lpCoin"
        onClick={onClaimLp}
        disabled={lpClaimed || myLpShares === 0n || claiming}
      />
    </div>
  )
}

function ClaimRow({
  label,
  sub,
  coinClass,
  onClick,
  disabled,
}: {
  label: string
  sub: string
  coinClass: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <div className="pp-claimrow">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={`pp-coin ${coinClass}`} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 850 }}>{label}</div>
          <div className="pp-label">{sub}</div>
        </div>
      </div>
      <button className="pp-mini" onClick={onClick} disabled={disabled}>Claim</button>
    </div>
  )
}
