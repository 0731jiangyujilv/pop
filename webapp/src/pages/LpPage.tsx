import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
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
import { formatProbability, formatUsdc } from '@/lib/utils'
import { simulateWrite } from '@/lib/simulateWrite'
import { POP_AMM_CSS } from './popAmmStyles'

type LpMode = 'ADD' | 'REMOVE'
type TxStep = 'idle' | 'approving' | 'adding' | 'added' | 'removing' | 'removed' | 'error'

// const SLIPPAGE_BPS = 200n

// function clampSlip(quote: bigint): bigint {
//   return (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n
// }

export function LpPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const walletChainId = useChainId()
  const chainSlug = searchParams.get('chain')
  const marketChainId = getChainIdBySlug(chainSlug) ?? 0
  const unknownChain = marketChainId === 0
  const publicClient = usePublicClient({ chainId: marketChainId })
  const contracts = getContractsForChain(marketChainId)
  const chainConfig = getChainConfig(marketChainId)
  const explorerUrl = chainConfig?.explorerUrl || 'https://sepolia.basescan.org'
  const chainMismatch = isConnected && walletChainId !== marketChainId
  const marketAddr = contractAddress as `0x${string}`

  // Follow the wallet's network: switching to a chain where this same market is
  // also deployed navigates to that chain's contract (keeping the /lp page).
  useEffect(() => {
    if (!isConnected || walletChainId === marketChainId) return
    const group = findEventMarketGroup(marketAddr)
    if (!group) return
    const target = eventMarketAddressOnChain(group, walletChainId)
    const targetSlug = getChainSlug(walletChainId)
    if (!target || !targetSlug) return
    if (target.toLowerCase() === marketAddr.toLowerCase()) return
    navigate(`/fifa/${target}/lp?chain=${targetSlug}`, { replace: true })
  }, [isConnected, walletChainId, marketChainId, marketAddr, navigate])

  const [lpMode, setLpMode] = useState<LpMode>('ADD')
  const [lpAmount, setLpAmount] = useState('100')
  const [removeShares, setRemoveShares] = useState('')
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [toastError, setToastError] = useState(false)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const marketReads = useReadContracts({
    contracts: [
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'question',         chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'resolutionSource', chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'bettingDeadline',  chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'status',          chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'yesWins',         chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'isDraw',          chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'totalCollateral', chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'totalLpShares',   chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'yesProbability',  chainId: marketChainId },
    ],
  })
  const r = marketReads.data
  const question        = (r?.[0]?.result as string | undefined) ?? ''
  const resolutionSource = (r?.[1]?.result as string | undefined) ?? ''
  const bettingDeadline = (r?.[2]?.result as bigint | undefined) ?? 0n
  const status          = Number(r?.[3]?.result ?? 0)
  const yesWins         = Boolean(r?.[4]?.result)
  const isDraw          = Boolean(r?.[5]?.result)
  const totalCollateral = (r?.[6]?.result as bigint | undefined) ?? 0n
  const totalLpShares   = (r?.[7]?.result as bigint | undefined) ?? 0n
  const yesProb         = (r?.[8]?.result as bigint | undefined) ?? 0n

  const isOpen    = status === EventMarketStatus.Open
  const isSettled = status === EventMarketStatus.Settled
  const deadlinePassed = Number(bettingDeadline) > 0 && now >= Number(bettingDeadline)
  const lpAllowed = isOpen && !deadlinePassed

  const userReads = useReadContracts({
    contracts: address ? [
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'lpShares',       args: [address], chainId: marketChainId },
      { address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'lockedLpShares', args: [address], chainId: marketChainId },
    ] : [],
    query: { enabled: !!address },
  })
  const u = userReads.data
  const myLpShares = (u?.[0]?.result as bigint | undefined) ?? 0n
  const myLockedLp = (u?.[1]?.result as bigint | undefined) ?? 0n
  const removableLp = myLpShares > myLockedLp ? myLpShares - myLockedLp : 0n

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contracts.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, marketAddr] : undefined,
    chainId: marketChainId,
    query: { enabled: !!address },
  })

  const lpUsdcAmount = useMemo(() => {
    try { return lpAmount && Number(lpAmount) > 0 ? parseUnits(lpAmount, 6) : 0n } catch { return 0n }
  }, [lpAmount])

  const removeSharesBig = useMemo(() => {
    try { return removeShares ? BigInt(removeShares) : 0n } catch { return 0n }
  }, [removeShares])

  const lpSharesEstimate = useMemo(() => {
    if (lpUsdcAmount === 0n) return 0n
    if (totalLpShares === 0n || totalCollateral === 0n) return lpUsdcAmount
    return (lpUsdcAmount * totalLpShares) / totalCollateral
  }, [lpUsdcAmount, totalLpShares, totalCollateral])

  const lpSharePct = useMemo(() => {
    const denom = totalLpShares + lpSharesEstimate
    if (denom === 0n) return 0
    return Number((lpSharesEstimate * 10000n) / denom) / 100
  }, [lpSharesEstimate, totalLpShares])

  const removeUsdcEst = useMemo(() => {
    if (removeSharesBig === 0n || totalLpShares === 0n) return 0n
    return (removeSharesBig * totalCollateral) / totalLpShares
  }, [removeSharesBig, totalCollateral, totalLpShares])

  const myUsdcValue = useMemo(() => {
    if (myLpShares === 0n || totalLpShares === 0n) return 0n
    return (myLpShares * totalCollateral) / totalLpShares
  }, [myLpShares, totalCollateral, totalLpShares])

  const mySharePct = useMemo(() => {
    if (myLpShares === 0n || totalLpShares === 0n) return 0
    return Number((myLpShares * 10_000n) / totalLpShares) / 100
  }, [myLpShares, totalLpShares])

  const needsApprovalForLp = allowance === undefined || (allowance as bigint) < lpUsdcAmount

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

  const yesPct = Number(formatProbability(yesProb))
  const noPct  = Number(formatProbability(BigInt(1e18) - yesProb))

  const isKickoffCountdown = lpAllowed && !!deadlineCountdown
  const lockLabel = isKickoffCountdown
    ? `Kickoff ${deadlineCountdown}`
    : isSettled
      ? (isDraw ? 'Draw' : yesWins ? 'YES wins' : 'NO wins')
      : eventMarketStatusLabel(status)

  const refetchAll = async () => {
    await Promise.all([marketReads.refetch(), userReads.refetch(), refetchAllowance()])
  }

  const { writeContractAsync } = useWriteContractWithAttribution()

  function errMsg(e: unknown, fallback: string) {
    if (e instanceof Error && e.message) return e.message.slice(0, 240)
    return fallback
  }

  // Surface failures in the toast (same spot as the success toast) rather than
  // inline, so the card layout doesn't shift.
  function showError(msg: string) {
    setTxStep('error')
    setErrorMsg(msg)
    setToastError(true)
    setToastOpen(true)
  }

  async function ensureAllowance(amount: bigint): Promise<void> {
    if (!publicClient || !address) return
    const current = (await publicClient.readContract({
      address: contracts.usdcAddress, abi: ERC20_ABI, functionName: 'allowance',
      args: [address, marketAddr],
    })) as bigint
    if (current >= amount) return
    setTxStep('approving')
    await simulateWrite(publicClient, {
      address: contracts.usdcAddress, abi: ERC20_ABI, functionName: 'approve',
      args: [marketAddr, amount], account: address,
    })
    const hash = await writeContractAsync({
      address: contracts.usdcAddress, abi: ERC20_ABI, functionName: 'approve',
      args: [marketAddr, amount], chainId: marketChainId,
    })
    await publicClient.waitForTransactionReceipt({ hash })
    await refetchAllowance()
  }

  async function handleAddLiquidity() {
    if (!publicClient || !address || lpUsdcAmount === 0n) return
    setErrorMsg('')
    try {
      await ensureAllowance(lpUsdcAmount)
      setTxStep('adding')
      await simulateWrite(publicClient, {
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'addLiquidity',
        args: [lpUsdcAmount], account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'addLiquidity',
        args: [lpUsdcAmount], chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxHash(hash)
      setTxStep('added')
      setToastError(false)
      setToastOpen(true)
      await refetchAll()
    } catch (e) {
      showError(errMsg(e, 'Add liquidity failed'))
    }
  }

  async function handleRemoveLiquidity() {
    if (!publicClient || !address) return
    setErrorMsg('')
    const shares = removeSharesBig
    if (shares === 0n) return
    if (shares > removableLp) {
      showError(`Max removable: ${removableLp.toString()} (${myLockedLp.toString()} locked)`)
      return
    }
    try {
      setTxStep('removing')
      await simulateWrite(publicClient, {
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'removeLiquidity',
        args: [shares], account: address,
      })
      const hash = await writeContractAsync({
        address: marketAddr, abi: EVENT_MARKET_ABI, functionName: 'removeLiquidity',
        args: [shares], chainId: marketChainId,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxHash(hash)
      setTxStep('removed')
      setToastError(false)
      setToastOpen(true)
      await refetchAll()
    } catch (e) {
      showError(errMsg(e, 'Remove liquidity failed'))
    }
  }

  const txPending = txStep === 'approving' || txStep === 'adding' || txStep === 'removing'
  const backLink = `/fifa/${contractAddress}?chain=${chainSlug ?? ''}`
  const statsLink = `/fifa/${contractAddress}/stats?chain=${chainSlug ?? ''}`

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
                This link is missing a valid <code>?chain=</code> parameter.
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
              {isConnected && myLpShares > 0n && (
                <div className="pp-position">
                  <div className="pp-position-label">My Position</div>
                  <div className="pp-position-value">
                    ${formatUsdc(myUsdcValue)}
                    <span className="pp-position-unit">USDC</span>
                  </div>
                  <div className="pp-position-row">
                    <span>{mySharePct.toFixed(2)}% of pool</span>
                    <span>{myLpShares.toString()} shares</span>
                    {myLockedLp > 0n && <span>{myLockedLp.toString()} locked</span>}
                  </div>
                </div>
              )}

              <div className="pp-switch">
                <button className={`pp-pill ${lpMode === 'ADD' ? 'pp-active' : ''}`} onClick={() => setLpMode('ADD')}>Add</button>
                <button className={`pp-pill ${lpMode === 'REMOVE' ? 'pp-active' : ''}`} onClick={() => setLpMode('REMOVE')}>Remove</button>
              </div>

              {lpMode === 'ADD' ? (
                <>
                  <div className="pp-box">
                    <div className="pp-label">Deposit</div>
                    <div className="pp-amount">
                      <input
                        className="pp-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={lpAmount}
                        disabled={!lpAllowed}
                        onChange={(e) => setLpAmount(e.target.value)}
                      />
                      <div className="pp-token"><span className="pp-coin" />USDC</div>
                    </div>
                  </div>
                  <div className="pp-arrow">↓</div>
                  <div className="pp-box">
                    <div className="pp-label">Receive</div>
                    <div className="pp-amount">
                      <div className="pp-out">{lpSharesEstimate.toString()}</div>
                      <div className="pp-token"><span className="pp-coin pp-lpCoin" />LP</div>
                    </div>
                  </div>
                  <div className="pp-meta">
                    <span className="inline-flex items-center gap-1">
                      Pool YES/NO
                      <Link
                        to={statsLink}
                        aria-label="View market stats"
                        title="View market stats"
                        className="inline-flex items-center justify-center text-[var(--color-muted)] opacity-50 transition hover:opacity-90"
                      >
                        <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                          <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
                          <circle cx="6" cy="3.125" r=".875" fill="currentColor" strokeWidth="0" />
                          <line x1="6" y1="8.5" x2="6" y2="5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
                        </svg>
                      </Link>
                    </span>
                    <span> Share {lpSharePct.toFixed(2)}%</span>
                  </div>
                  {!lpAllowed && (
                    <div className="pp-note pp-note-muted">Adding liquidity is disabled after kickoff.</div>
                  )}
                  {renderAction(
                    <button
                      className="pp-cta pp-buy-cta"
                      onClick={handleAddLiquidity}
                      disabled={!lpAllowed || lpUsdcAmount === 0n || txStep === 'adding' || txStep === 'approving'}
                    >
                      {needsApprovalForLp ? 'Approve & Add LP' : 'Add LP'}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="pp-box">
                    <div className="pp-label">Burn</div>
                    <div className="pp-amount">
                      <input
                        className="pp-input"
                        type="text"
                        inputMode="numeric"
                        value={removeShares}
                        disabled={isSettled || removableLp === 0n}
                        placeholder="0"
                        onChange={(e) => setRemoveShares(e.target.value)}
                      />
                      <div className="pp-token"><span className="pp-coin pp-lpCoin" />LP</div>
                    </div>
                    <button
                      className="pp-maxbtn pp-lp-maxbtn"
                      onClick={() => setRemoveShares(removableLp.toString())}
                      disabled={removableLp === 0n}
                    >
                      Max {removableLp.toString()}
                    </button>
                  </div>
                  <div className="pp-arrow">↓</div>
                  <div className="pp-box">
                    <div className="pp-label">Withdraw</div>
                    <div className="pp-amount">
                      <div className="pp-out">{formatUsdc(removeUsdcEst)}</div>
                      <div className="pp-token"><span className="pp-coin" />USDC</div>
                    </div>
                  </div>
                  {/* <div className="pp-meta">
                    <span>Pool exit</span>
                    <span>{myLockedLp > 0n ? `${myLockedLp.toString()} locked` : 'all removable'}</span>
                  </div> */}
                  {renderAction(
                    <button
                      className="pp-cta pp-buy-cta"
                      onClick={handleRemoveLiquidity}
                      disabled={isSettled || removableLp === 0n || removeSharesBig === 0n || txStep === 'removing'}
                    >
                      Remove LP
                    </button>
                  )}
                </>
              )}
            </div>

            {txPending && (
              <div className="pp-note pp-note-info" style={{ marginTop: 6 }}>
                {txStep === 'approving' && 'Approving USDC…'}
                {txStep === 'adding' && 'Adding liquidity…'}
                {txStep === 'removing' && 'Removing liquidity…'}
              </div>
            )}

            <div className="pp-foot" style={{ marginTop: -8 }}>
              <Link to={backLink}>← Trade</Link>
            </div>
          </section>
        </div>
      </main>

      <TxToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        explorerUrl={explorerUrl}
        txHash={txHash}
        shareText="Providing liquidity on POP."
        shareUrl={typeof window !== 'undefined' ? `${window.location.origin}${backLink}` : ''}
        title={toastError ? 'Transaction failed' : 'Transaction confirmed'}
        error={toastError}
        message={errorMsg}
      />
    </div>
  )
}
