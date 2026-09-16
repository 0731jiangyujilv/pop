import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount, useChainId, usePublicClient, useReadContracts, useSwitchChain } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { SiteNav } from '@/components/SiteNav'
import { TxToast } from '@/components/TxToast'
// import { InfoTooltip } from '@/components/InfoTooltip'
import { arcTestnet, getChainConfig } from '@/config/chains'
import {
  EVENT_MARKET_V2_ABI,
  PROB_SCALE,
  ShockOutcome,
  TradeOutcome,
  impactPoints,
  isRefunded,
  probToPercent,
  type OddsShiftInfo,
  type OddsShiftShock,
  type OddsShiftTrade,
  type OddsShiftUserState,
} from '@/config/abi/eventMarketV2'
import { ERC20_ABI } from '@/config/contracts'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { POP_AMM_CSS } from './popAmmStyles'
import { ODDS_SHIFT_CSS } from './oddsShiftStyles'

const MAX_TRADES = 500n
const MAX_SHOCKS = 200n
const FAUCET_WHOLE = 1_000n
/** Slippage guard on `minOut`, in basis points. */
const SLIPPAGE_BPS = 100n

/**
 * The demo faucet. `MockUSDT.sol` mints `whole * 10**decimals` to the caller;
 * real USDC has no such function, so the button simply reverts there.
 */
const FAUCET_ABI = [
  {
    type: 'function',
    name: 'faucet',
    inputs: [{ name: 'whole', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const fmtAmount = (v: bigint | undefined, decimals: number) =>
  v === undefined ? '—' : Number(formatUnits(v, decimals)).toFixed(2)
const pct = (p: bigint | number | undefined) =>
  p === undefined ? '—' : `${probToPercent(p).toFixed(1)}%`
/** A 1e6-fixed-point threshold rendered as probability POINTS ("5.0"). */
const points = (t: number | undefined) => (((t ?? 0) / PROB_SCALE) * 100).toFixed(1)
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`

type Fmt = (v: bigint | undefined) => string
type Side = 'YES' | 'NO'
/** A trade plus its on-chain id — `getTrades(0, …)` returns them in id order. */
type IdTrade = OddsShiftTrade & { id: number }

/** How the four terminal verdicts (plus Pending) read in the UI. */
const OUTCOME_META: Record<number, { label: string; cls: string }> = {
  [TradeOutcome.Pending]: { label: 'escrowed', cls: 'os-badge-neutral' },
  [TradeOutcome.RefundedNoShock]: { label: 'refunded · no jump', cls: 'os-badge-ok' },
  [TradeOutcome.RefundedReverted]: { label: 'refunded · price came back', cls: 'os-badge-ok' },
  [TradeOutcome.RefundedMinor]: { label: 'refunded · not a cause', cls: 'os-badge-info' },
  [TradeOutcome.Charged]: { label: 'charged → LPs', cls: 'os-badge-bad' },
}

/**
 * OddsShift demo page.
 *
 * The market address comes straight from the path — there is no registry, this
 * page targets whatever single V2 contract you deployed. See
 * `oddsshift_todos.md` for the mechanism and the demo script.
 *
 * Every counter here comes from `getOddsShiftInfo()` / `getUserOddsShift()` and
 * the two paged log readers: EIP-170 left the contract no room for per-field
 * getters, so there is nothing else to read.
 *
 * Visually this follows `EventMarketAmmPage` — the same `popamm` swap card, one
 * column wider so the probability path and the judgement log sit beside it.
 */
export function OddsShiftPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const marketAddr = (contractAddress ?? '0x618689f025C862Fa0D2570ECc0eD5F4b72725d33') as `0x${string}`
  const { address, isConnected } = useAccount()
  // This page is Arc-only: the OddsShift V2 market is deployed on Arc Testnet and
  // nowhere else, so reads AND writes are pinned there instead of following the
  // wallet. Without the pin, `useChainId()` hands back the first chain in the
  // wagmi config (base-sepolia) whenever the wallet is disconnected, and every
  // read on this page went to https://sepolia.base.org.
  const chainId = arcTestnet.id
  const walletChainId = useChainId()
  const chainMismatch = isConnected && walletChainId !== chainId
  const publicClient = usePublicClient({ chainId })
  const { writeContractAsync } = useWriteContractWithAttribution()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const explorerUrl = getChainConfig(chainId)?.explorerUrl || 'https://testnet.arcscan.app'

  const [side, setSide] = useState<Side>('YES')
  const [amount, setAmount] = useState('30')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  // Outcomes land in the same toast the FIFA page uses, so the card never
  // reflows underneath the button the user just pressed.
  const [txHash, setTxHash] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [toastTitle, setToastTitle] = useState('Transaction confirmed')
  const [toastShare, setToastShare] = useState(false)
  const [toastError, setToastError] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  const base = { address: marketAddr, abi: EVENT_MARKET_V2_ABI, chainId } as const

  const marketReads = useReadContracts({
    contracts: [
      { ...base, functionName: 'question' },
      { ...base, functionName: 'status' },
      { ...base, functionName: 'yesReserve' },
      { ...base, functionName: 'noReserve' },
      { ...base, functionName: 'usdc' },
      { ...base, functionName: 'getOddsShiftInfo' },
      { ...base, functionName: 'getTrades', args: [0n, MAX_TRADES] },
      { ...base, functionName: 'getShocks', args: [0n, MAX_SHOCKS] },
      { ...base, functionName: 'resolutionSource' },
    ],
    query: { enabled: Boolean(marketAddr), refetchInterval: 5000 },
  })

  // const question = marketReads.data?.[0]?.result as string | undefined
  const status = marketReads.data?.[1]?.result as number | undefined
  const yesReserve = marketReads.data?.[2]?.result as bigint | undefined
  const noReserve = marketReads.data?.[3]?.result as bigint | undefined
  const usdcAddr = marketReads.data?.[4]?.result as `0x${string}` | undefined
  const os = marketReads.data?.[5]?.result as OddsShiftInfo | undefined
  // Memoised so the derived series/markers don't rebuild on every poll tick.
  const marketData = marketReads.data
  const rawTrades = useMemo(
    () => (marketData?.[6]?.result ?? []) as readonly OddsShiftTrade[],
    [marketData],
  )
  const shocks = useMemo(
    () => (marketData?.[7]?.result ?? []) as readonly OddsShiftShock[],
    [marketData],
  )
  // const resolutionSource = (marketReads.data?.[8]?.result as string | undefined) ?? ''

  // The collateral token's own metadata. The demo may run against a mock with
  // decimals other than USDC's 6, so nothing here assumes a scale.
  const tokenReads = useReadContracts({
    contracts: [
      { address: usdcAddr ?? '0x0', abi: ERC20_ABI, chainId, functionName: 'decimals' },
      { address: usdcAddr ?? '0x0', abi: ERC20_ABI, chainId, functionName: 'symbol' },
    ],
    query: { enabled: Boolean(usdcAddr) },
  })
  const decimals = (tokenReads.data?.[0]?.result as number | undefined) ?? 6
  const symbol = (tokenReads.data?.[1]?.result as string | undefined) ?? 'USDC'
  const fmt = useCallback<Fmt>((v) => fmtAmount(v, decimals), [decimals])

  const userReads = useReadContracts({
    contracts: [
      { ...base, functionName: 'getUserOddsShift', args: [address ?? '0x0'] },
      { ...base, functionName: 'yesBalanceOf', args: [address ?? '0x0'] },
      { ...base, functionName: 'noBalanceOf', args: [address ?? '0x0'] },
      {
        address: usdcAddr ?? '0x0',
        abi: ERC20_ABI,
        chainId,
        functionName: 'balanceOf',
        args: [address ?? '0x0'],
      },
    ],
    query: { enabled: Boolean(marketAddr && address && usdcAddr), refetchInterval: 5000 },
  })

  const userState = userReads.data?.[0]?.result as OddsShiftUserState | undefined
  const yesBal = userReads.data?.[1]?.result as bigint | undefined
  const noBal = userReads.data?.[2]?.result as bigint | undefined
  const usdcBal = userReads.data?.[3]?.result as bigint | undefined

  // `getUserOddsShift` no longer returns the trades themselves — the whole log
  // is already here for the chart, so filtering it locally costs nothing.
  const trades = useMemo<IdTrade[]>(() => rawTrades.map((t, id) => ({ ...t, id })), [rawTrades])
  const myTrades = useMemo(() => {
    if (!address) return []
    const me = address.toLowerCase()
    return trades.filter((t) => t.trader.toLowerCase() === me)
  }, [trades, address])

  // Settled escrow, split the two ways it can end. Pending trades count as neither.
  const mySettled = useMemo(() => {
    let refunded = 0n
    let charged = 0n
    for (const t of myTrades) {
      if (isRefunded(t.outcome)) refunded += t.escrow
      else if (t.outcome === TradeOutcome.Charged) charged += t.escrow
    }
    return { refunded, charged }
  }, [myTrades])

  const amountWei = useMemo(() => {
    try {
      return parseUnits(amount || '0', decimals)
    } catch {
      return 0n
    }
  }, [amount, decimals])

  const quoteReads = useReadContracts({
    contracts: [
      { ...base, functionName: side === 'YES' ? 'quoteYes' : 'quoteNo', args: [amountWei] },
    ],
    query: { enabled: Boolean(marketAddr) && amountWei > 0n },
  })
  const quote = quoteReads.data?.[0]?.result as bigint | undefined
  const minOut = quote ? (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n : 0n

  // ── what this trade costs ───────────────────────────────────────────────────
  // The whole 1% is taken at the entry point (`lpSwapFeeBps` is deployed at 0),
  // so these two plus the curve amount account for the input exactly.
  const baseFeeBps = os?.baseFeeBps ?? 30
  const protectionFeeBps = os?.protectionFeeBps ?? 70
  const baseFee = (amountWei * BigInt(baseFeeBps)) / 10_000n
  const escrowFee = (amountWei * BigInt(protectionFeeBps)) / 10_000n

  const lookback = os?.lookback ?? 5
  const observeWindow = os?.observeWindow ?? 5
  const cooldown = os?.cooldown ?? 120
  const jump = os?.jumpThreshold ?? 50_000
  const pendingCount = Number(os?.pendingCount ?? 0n)

  // The window now forming: anchored at the pre-trade probability of the oldest
  // undecided trade, tripping at ±jumpThreshold from there.
  const anchor = os && pendingCount > 0 ? Number(os.windowAnchorProb) : undefined

  const openShock = os?.shockOpen ? shocks[Number(os.openShockId)] : undefined
  const observeLeft = openShock
    ? Math.max(
        0,
        observeWindow - Math.max(0, Number(os?.totalTrades ?? 0n) - (openShock.triggerId + 1)),
      )
    : 0

  // ── probability path ────────────────────────────────────────────────────────
  // Each trade stored the probability on both sides of itself, so the series is
  // exact and needs no log scanning: point `i + 1` is the price after trade `i`.
  const series = useMemo(() => {
    if (trades.length === 0) return [Number(os?.currentProb ?? PROB_SCALE / 2)]
    return [Number(trades[0].pBefore), ...trades.map((t) => Number(t.pAfter))]
  }, [trades, os?.currentProb])

  const markers = useMemo(
    () => shocks.map((s) => ({ at: s.triggerId + 1, outcome: s.outcome })),
    [shocks],
  )

  const lastTradeTs = trades.length ? Number(trades[trades.length - 1].ts) : 0
  const staleIn = lastTradeTs === 0 ? 0 : Math.max(0, lastTradeTs + cooldown - now)

  const yesPct = probToPercent(os?.currentProb ?? PROB_SCALE / 2)

  const refetchAll = useCallback(async () => {
    await Promise.all([
      marketReads.refetch(),
      userReads.refetch(),
      quoteReads.refetch(),
      tokenReads.refetch(),
    ])
  }, [marketReads, userReads, quoteReads, tokenReads])

  const run = useCallback(
    async (label: string, title: string, share: boolean, fn: () => Promise<`0x${string}`>) => {
      if (!publicClient) return
      // Every write targets the Arc market, so refuse to submit from another
      // network rather than letting wagmi fail mid-flight on the chain switch.
      if (chainMismatch) {
        setError(`Switch your wallet to ${arcTestnet.name} to interact with this market.`)
        return
      }
      setError('')
      setBusy(label)
      try {
        const hash = await fn()
        await publicClient.waitForTransactionReceipt({ hash })
        setTxHash(hash)
        setToastTitle(title)
        setToastShare(share)
        setToastError(false)
        setToastOpen(true)
        await refetchAll()
      } catch (e) {
        setError(e instanceof Error ? e.message.split('\n')[0] : String(e))
        setToastTitle('Transaction failed')
        setToastError(true)
        setToastOpen(true)
      } finally {
        setBusy(null)
      }
    },
    [publicClient, refetchAll, chainMismatch],
  )

  async function ensureAllowance(need: bigint) {
    if (!publicClient || !address || !usdcAddr) throw new Error('wallet not ready')
    const allowance = (await publicClient.readContract({
      address: usdcAddr,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, marketAddr],
    })) as bigint
    if (allowance >= need) return
    const hash = await writeContractAsync({
      address: usdcAddr,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [marketAddr, need],
      chainId,
    })
    await publicClient.waitForTransactionReceipt({ hash })
  }

  const handleBuy = () =>
    run('buy', 'Transaction confirmed', true, async () => {
      await ensureAllowance(amountWei)
      return writeContractAsync({
        address: marketAddr,
        abi: EVENT_MARKET_V2_ABI,
        functionName: side === 'YES' ? 'buyYes' : 'buyNo',
        args: [amountWei, minOut],
        chainId,
      })
    })

  const handleFaucet = () =>
    run('faucet', `${FAUCET_WHOLE} test ${symbol} received`, false, () =>
      writeContractAsync({
        address: usdcAddr as `0x${string}`,
        abi: FAUCET_ABI,
        functionName: 'faucet',
        args: [FAUCET_WHOLE],
        chainId,
      }),
    )

  /** The three no-argument OddsShift writes all look the same. */
  const write = (
    label: string,
    functionName: 'claimRebate' | 'claimLpReward' | 'resolveStale',
    title = 'Transaction confirmed',
  ) =>
    run(label, title, false, () =>
      writeContractAsync({
        address: marketAddr,
        abi: EVENT_MARKET_V2_ABI,
        functionName,
        args: [],
        chainId,
      }),
    )

  const statusLabel =
    status === 0 ? 'Open' : status === 1 ? 'Locked' : status === 2 ? 'Settled' : 'Loading…'
  const tradeAllowed = status === 0
  /** No write is available while one is in flight or the wallet is off Arc. */
  const writesBlocked = busy !== null || chainMismatch

  if (!marketAddr) {
    return (
      <div className="popamm">
        <style>{POP_AMM_CSS}</style>
        <style>{ODDS_SHIFT_CSS}</style>
        <SiteNav />
        <main className="pp-wrap">
          <section className="pp-card">
            <div className="pp-market">
              <div className="pp-title">No market in the URL</div>
              <p className="pp-label" style={{ marginTop: 10, lineHeight: 1.5 }}>
                Open <code>/oddsshift/&lt;market address&gt;</code> — this page targets a single
                EventMarketV2 contract straight from the path.
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
      <style>{ODDS_SHIFT_CSS}</style>
      <SiteNav />

      <main className="pp-wrap os-wrap">
        <div className="os-stack">
          <span className="os-brand">OddsShift</span>
          <h1 className="pp-hero os-hero">
            Will Fed cut rates in September 2026?
          </h1>
          <p className="os-lede">
            Every buy and sell pays <b>{((baseFeeBps + protectionFeeBps) / 100).toFixed(1)}%</b>:{' '}
            {(baseFeeBps / 100).toFixed(2)}% straight to the LPs and{' '}
            {(protectionFeeBps / 100).toFixed(2)}% <em>held in escrow</em>. The escrow is judged per{' '}
            window, not per trade — {lookback} consecutive trades that shift YES by {points(jump)}{' '}
            points get marked, and the mark only sticks if the next {observeWindow} trades fail to
            bring the price back.
          </p>

          <div className="os-grid">
            {/* ── price + judgement state ──────────────────────────────── */}
            <div className="os-col">
              <section className="pp-card os-card">
                <div className="os-h">
                  <div>
                    <div className="os-h-title">YES</div>
                    <div className="os-big" style={{ marginTop: 6 }}>
                      {pct(os?.currentProb)}
                    </div>
                  </div>
                  <div className="os-sub os-sub-r">
                    <div>
                      Pool {fmt(yesReserve)} YES / {fmt(noReserve)} NO
                    </div>
                    <div>
                      {Number(os?.totalTrades ?? 0n)} trades · {Number(os?.totalShocks ?? 0n)} marks
                    </div>
                  </div>
                </div>

                <div className="pp-odds" style={{ marginTop: 0, marginBottom: 4 }}>
                  <span className="pp-yesText">YES {yesPct.toFixed(1)}%</span>
                  <div className="pp-bar">
                    <div
                      className="pp-yesbar"
                      style={{ width: `${Math.min(100, Math.max(0, yesPct))}%` }}
                    />
                  </div>
                  <span className="pp-noText">NO {(100 - yesPct).toFixed(1)}%</span>
                </div>

                <ProbChart series={series} anchor={anchor} jump={jump} markers={markers} />

                <p className="os-sub" style={{ marginTop: 10 }}>
                  {anchor === undefined
                    ? 'No undecided trades — the next one anchors a fresh window.'
                    : `Window forming: anchored at ${pct(anchor)}, trips at ±${points(
                        jump,
                      )} points (${pendingCount}/${lookback} trades in).`}
                </p>
              </section>

              <section className="pp-card os-card">
                <div className="os-h">
                  <span className="os-h-title">Judgement queue</span>
                  <span className={`os-badge ${openShock ? 'os-badge-warn' : 'os-badge-neutral'}`}>
                    {openShock ? `mark #${Number(os?.openShockId ?? 0n)} open` : 'no open mark'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                  <span className="os-mid">{pendingCount}</span>
                  <span className="os-sub">
                    awaiting a verdict (max {lookback + observeWindow})
                  </span>
                </div>

                {openShock ? (
                  <div className="pp-note pp-note-warn" style={{ marginBottom: 10 }}>
                    Mark #{Number(os?.openShockId ?? 0n)} is under observation —{' '}
                    {observeLeft === 1 ? '1 more trade' : `${observeLeft} more trades`} to bring YES
                    back inside {pct(openShock.pAnchor)} ± {points(jump)} points.
                  </div>
                ) : (
                  <p className="os-sub" style={{ marginBottom: 10 }}>
                    Trades retire clean as they slide out of the {lookback}-trade window.
                  </p>
                )}

                <div className="pp-review">
                  <Row label="Escrowed, undecided" value={`${fmt(os?.pendingEscrow)} ${symbol}`} />
                  <Row label="Refunds owed" value={`${fmt(os?.totalRebateOwed)} ${symbol}`} />
                  <Row label="Owed to LPs" value={`${fmt(os?.totalLpRewardOwed)} ${symbol}`} />
                  <Row
                    label="Lifetime · LPs earned"
                    value={`${fmt((os?.cumBaseFee ?? 0n) + (os?.cumChargedFee ?? 0n))} ${symbol}`}
                  />
                  <Row label="Lifetime · refunded" value={`${fmt(os?.cumRebated)} ${symbol}`} />
                </div>

                <button
                  className="os-ghost"
                  onClick={() => write('stale', 'resolveStale', 'Queue settled')}
                  disabled={writesBlocked || pendingCount === 0 || staleIn > 0}
                >
                  {busy === 'stale'
                    ? 'Confirming…'
                    : staleIn > 0
                      ? `Settle the queue · ${staleIn}s`
                      : 'Settle the queue'}
                </button>
                <p className="os-sub" style={{ marginTop: 10 }}>
                  Permissionless, and only once the market has been quiet for {cooldown}s. Judges
                  the whole queue against the current price — the fallback for a partial window
                  nobody followed up on.
                </p>
              </section>

              <section className="pp-card os-card">
                <div className="os-h">
                  <span className="os-h-title">Marks</span>
                  <span className="os-badge os-badge-neutral">{shocks.length}</span>
                </div>
                {shocks.length === 0 ? (
                  <p className="os-empty">
                    Nothing marked yet — no {lookback}-trade window has shifted YES by{' '}
                    {points(jump)} points.
                  </p>
                ) : (
                  <ul className="os-list">
                    {shocks
                      .map((s, id) => ({ s, id }))
                      .reverse()
                      .map(({ s, id }) => (
                        <ShockRow
                          key={id}
                          id={id}
                          shock={s}
                          trades={trades}
                          totalTrades={Number(os?.totalTrades ?? 0n)}
                          observeWindow={observeWindow}
                          jump={jump}
                        />
                      ))}
                  </ul>
                )}
              </section>
            </div>

            {/* ── the swap card ────────────────────────────────────────── */}
            <div className="os-col os-col-trade">
              <section className="pp-card">
                <div className="pp-cardhead">
                  <div className="pp-lock">{statusLabel}</div>
                </div>

                <div className="pp-body">
                  {isConnected && usdcAddr && (
                    <div className="pp-claimrow pp-faucetrow" style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="pp-coin" />
                        <div className="pp-faucet-title">Need test {symbol}?</div>
                      </div>
                      <button
                        className="pp-mini pp-faucet-btn"
                        onClick={handleFaucet}
                        disabled={!address || writesBlocked}
                      >
                        {busy === 'faucet' ? 'Sending…' : `Get ${FAUCET_WHOLE}`}
                      </button>
                    </div>
                  )}

                  <div className="pp-switch">
                    {(['YES', 'NO'] as const).map((s) => (
                      <button
                        key={s}
                        className={`pp-pill ${
                          side === s ? `pp-active ${s === 'YES' ? 'pp-active-yes' : 'pp-active-no'}` : ''
                        }`}
                        onClick={() => setSide(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <div className="pp-box">
                    <div className="pp-label">Pay</div>
                    <div className="pp-amount">
                      <input
                        className="pp-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={amount}
                        disabled={!tradeAllowed}
                        placeholder="0"
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <div className="pp-token">
                        <span className="pp-coin" />
                        {symbol}
                      </div>
                    </div>
                    <button
                      className="pp-maxbtn pp-lp-maxbtn"
                      onClick={() => setAmount(formatUnits(usdcBal ?? 0n, decimals))}
                      disabled={(usdcBal ?? 0n) === 0n}
                    >
                      Max {fmt(usdcBal)}
                    </button>
                  </div>

                  <div className="pp-arrow">↓</div>

                  <div className="pp-box">
                    <div className="pp-label">Receive</div>
                    <div className="pp-amount">
                      <div className="pp-out">{quote !== undefined ? fmt(quote) : '0'}</div>
                      <div className="pp-token">
                        <span className={`pp-coin ${side === 'YES' ? 'pp-yesCoin' : 'pp-noCoin'}`} />
                        {side}
                      </div>
                    </div>
                  </div>

                  <div className="pp-review">
                    <Row
                      label={
                        <>
                          Base fee
                          <span className="pp-review-hint">
                            {(baseFeeBps / 100).toFixed(2)}% · never refunded
                          </span>
                        </>
                      }
                      value={`${fmt(baseFee)} ${symbol}`}
                    />
                    <Row
                      label={
                        <>
                          LP protection
                          <span className="pp-review-hint">
                            {(protectionFeeBps / 100).toFixed(2)}% · escrowed
                          </span>
                        </>
                      }
                      value={`${fmt(escrowFee)} ${symbol}`}
                    />
                    <Row
                      label="Into the curve"
                      value={`${fmt(amountWei - baseFee - escrowFee)} ${symbol}`}
                    />
                    <Row
                      label={
                        <>
                          Min. received
                          <span className="pp-review-hint">
                            {Number(SLIPPAGE_BPS) / 100}% slippage
                          </span>
                        </>
                      }
                      value={`${fmt(minOut)} ${side}`}
                      strong
                    />
                  </div>

                  {amountWei > 0n && (
                    <div className="pp-note pp-note-warn">
                      Your {fmt(escrowFee)} {symbol} comes back in full unless this trade lands in a{' '}
                      {lookback}-trade window that shifts YES by {points(jump)} points, the next{' '}
                      {observeWindow} trades fail to pull it back, and this trade itself pushed YES{' '}
                      {side === 'YES' ? 'up' : 'down'} by more than {points(os?.contribThreshold)}{' '}
                      points. Anything else costs you {(baseFeeBps / 100).toFixed(2)}%.
                    </div>
                  )}

                  {status !== undefined && !tradeAllowed && (
                    <div className="pp-note pp-note-muted">
                      Trading is closed — this market is {statusLabel.toLowerCase()}.
                    </div>
                  )}

                  {!isConnected ? (
                    <div className="pp-note pp-note-muted">Connect a wallet to trade.</div>
                  ) : chainMismatch ? (
                    <>
                      <div className="pp-note pp-note-warn">
                        This market only exists on {arcTestnet.name} — your wallet is on{' '}
                        {getChainConfig(walletChainId)?.chain.name || `chain ${walletChainId}`}. The
                        numbers above are read from Arc either way.
                      </div>
                      <button
                        className="pp-cta pp-buy-cta"
                        onClick={() => switchChain({ chainId: arcTestnet.id })}
                        disabled={isSwitching}
                      >
                        {isSwitching ? 'Switching…' : `Switch to ${arcTestnet.name}`}
                      </button>
                    </>
                  ) : (
                    <button
                      className="pp-cta pp-buy-cta"
                      onClick={handleBuy}
                      disabled={!address || amountWei === 0n || busy !== null || !tradeAllowed}
                    >
                      {busy === 'buy' ? 'Confirming…' : `Buy ${side}`}
                    </button>
                  )}
                </div>

                {busy !== null && (
                  <div className="pp-note pp-note-info" style={{ marginTop: 6 }}>
                    {busy === 'buy' && 'Submitting buy…'}
                    {busy === 'faucet' && 'Minting test tokens…'}
                    {busy === 'stale' && 'Settling the queue…'}
                    {busy === 'rebate' && 'Claiming your refund…'}
                    {busy === 'lp' && 'Claiming your LP reward…'}
                  </div>
                )}

                <div className="pp-foot" style={{ marginTop: -4 }}>
                  <span className="os-addr">{marketAddr}</span>
                </div>
              </section>

              <section className="pp-card os-card">
                <div className="os-h">
                  <span className="os-h-title">Your position</span>
                </div>
                <div className="pp-review">
                  <Row label="YES" value={fmt(yesBal)} />
                  <Row label="NO" value={fmt(noBal)} />
                  <Row label="Escrow pending" value={`${fmt(userState?.pendingEscrow)} ${symbol}`} />
                </div>

                <ClaimRow
                  label="Claim refund"
                  coinClass="pp-yesCoin"
                  amount={userState?.rebateClaimable}
                  busy={busy === 'rebate'}
                  disabled={writesBlocked}
                  fmt={fmt}
                  symbol={symbol}
                  onClick={() => write('rebate', 'claimRebate', 'Refund claimed')}
                />
                <ClaimRow
                  label="Claim LP reward"
                  coinClass="pp-lpCoin"
                  amount={userState?.lpRewardClaimable}
                  busy={busy === 'lp'}
                  disabled={writesBlocked}
                  fmt={fmt}
                  symbol={symbol}
                  onClick={() => write('lp', 'claimLpReward', 'LP reward claimed')}
                />
              </section>

              <section className="pp-card os-card">
                <div className="os-h">
                  <span className="os-h-title">Your escrows</span>
                  {(mySettled.refunded > 0n || mySettled.charged > 0n) && (
                    <span className="os-sub os-sub-r">
                      <span className="os-up">
                        {fmt(mySettled.refunded)} rebated
                      </span>{' '}
                      ·{' '}
                      <span className="os-down">
                        {fmt(mySettled.charged)} kept
                      </span>
                    </span>
                  )}
                </div>
                {myTrades.length === 0 ? (
                  <p className="os-empty">No trades yet.</p>
                ) : (
                  <ul className="os-list">
                    {[...myTrades].reverse().map((t) => (
                      <EscrowRow key={t.id} trade={t} fmt={fmt} symbol={symbol} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      <TxToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        explorerUrl={explorerUrl}
        txHash={txHash}
        shareText="Trading with OddsShift LP protection on POP."
        shareUrl={typeof window !== 'undefined' ? window.location.href : ''}
        title={toastTitle}
        showShare={toastShare && !toastError}
        error={toastError}
        message={error}
      />
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: React.ReactNode
  value: string
  strong?: boolean
}) {
  return (
    <div className="pp-review-row">
      <span>{label}</span>
      <span className={`os-num ${strong ? 'os-strong' : ''}`}>{value}</span>
    </div>
  )
}

/** A claimable balance, rendered as the same row the FIFA page claims from. */
function ClaimRow({
  label,
  coinClass,
  amount,
  busy,
  disabled,
  onClick,
  fmt,
  symbol,
}: {
  label: string
  coinClass: string
  amount: bigint | undefined
  busy: boolean
  disabled: boolean
  onClick: () => void
  fmt: Fmt
  symbol: string
}) {
  const has = (amount ?? 0n) > 0n
  return (
    <button
      className="pp-claimrow os-claimbtn"
      onClick={onClick}
      disabled={disabled || !has}
      style={{ marginTop: 8, marginBottom: 0 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={`pp-coin ${coinClass}`} />
        <span style={{ fontSize: 14, fontWeight: 800 }}>{busy ? 'Confirming…' : label}</span>
      </span>
      <span className="os-claim-amt">
        {fmt(amount ?? 0n)} {symbol}
      </span>
    </button>
  )
}

/**
 * One detected jump and what became of it. The charged trade ids are read back
 * out of the trade log rather than recomputed — the contract already wrote its
 * verdict into every `Trade.outcome`.
 */
function ShockRow({
  id,
  shock,
  trades,
  totalTrades,
  observeWindow,
  jump,
}: {
  id: number
  shock: OddsShiftShock
  trades: IdTrade[]
  totalTrades: number
  observeWindow: number
  jump: number
}) {
  const charged = trades
    .slice(shock.firstId, shock.triggerId + 1)
    .filter((t) => t.outcome === TradeOutcome.Charged)
  const open = shock.outcome === ShockOutcome.Open
  const left = Math.max(0, observeWindow - Math.max(0, totalTrades - (shock.triggerId + 1)))
  const anchor = Number(shock.pAnchor)

  const badge = open
    ? { label: `observing · ${left} left`, cls: 'os-badge-warn' }
    : shock.outcome === ShockOutcome.Reverted
      ? { label: 'reverted → all refunded', cls: 'os-badge-ok' }
      : { label: 'toxic → charged', cls: 'os-badge-bad' }

  return (
    <li className="os-item">
      <div className="os-item-head">
        <span>
          #{id} · trades {shock.firstId}–{shock.triggerId}
        </span>
        <span className={`os-badge ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="os-item-sub">
        {pct(anchor)} {shock.dir > 0 ? '↑' : '↓'} {pct(shock.pShock)}
        {open
          ? ` · back inside ${pct(Math.max(0, anchor - jump))}–${pct(
              Math.min(PROB_SCALE, anchor + jump),
            )} closes it`
          : ` · resolved at ${pct(shock.pEnd)}`}
      </div>
      {shock.outcome === ShockOutcome.Toxic && (
        <div className="os-item-note">
          {charged.length === 0
            ? 'no single trade moved YES by more than the contribution threshold — all refunded'
            : `charged: ${charged.map((t) => `#${t.id}`).join(', ')} · the rest refunded`}
        </div>
      )}
    </li>
  )
}

/** One of the caller's trades, with the verdict on its escrow. */
function EscrowRow({ trade, fmt, symbol }: { trade: IdTrade; fmt: Fmt; symbol: string }) {
  const impact = impactPoints(trade)
  const up = impact >= 0
  const meta = OUTCOME_META[trade.outcome] ?? OUTCOME_META[TradeOutcome.Pending]

  return (
    <li className="os-item">
      <div className="os-item-head">
        <span className={up ? 'os-up' : 'os-down'}>
          #{trade.id} · {up ? 'YES ↑' : 'YES ↓'} · {fmt(trade.escrow)} {symbol}
        </span>
        <span className={`os-badge ${meta.cls}`}>{meta.label}</span>
      </div>
      <div className="os-item-sub">
        {pct(trade.pBefore)} → {pct(trade.pAfter)} · own impact {signed(impact)} pts
      </div>
    </li>
  )
}

/**
 * The YES probability path, plus the window now forming: a dashed line at its
 * anchor and a band at ±`jump` around it — leave the band and the window gets
 * marked. Marks are drawn on the trade that tripped them, coloured by verdict.
 */
function ProbChart({
  series,
  anchor,
  jump,
  markers,
}: {
  series: number[]
  anchor?: number
  jump: number
  markers: { at: number; outcome: number }[]
}) {
  const W = 640
  const H = 190
  const pad = 10

  const band =
    anchor === undefined
      ? undefined
      : { lo: Math.max(0, anchor - jump), hi: Math.min(PROB_SCALE, anchor + jump) }

  const all = band ? [...series, band.lo, band.hi] : series
  const lo = Math.max(0, Math.min(...all) - 20_000)
  const hi = Math.min(PROB_SCALE, Math.max(...all) + 20_000)
  const span = Math.max(1, hi - lo)

  const x = (i: number) =>
    pad + (series.length <= 1 ? 0 : (i * (W - pad * 2)) / (series.length - 1))
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - lo) / span)

  const path = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  // Close the line down to the baseline so the accent gradient reads as an area.
  const area =
    series.length > 1 ? `${path} L${x(series.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z` : ''

  const mid = PROB_SCALE / 2
  const markerClass = (outcome: number) =>
    outcome === ShockOutcome.Open
      ? 'os-mark-open'
      : outcome === ShockOutcome.Reverted
        ? 'os-mark-reverted'
        : 'os-mark-toxic'

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="os-chart"
      role="img"
      aria-label="YES probability path"
    >
      <defs>
        <linearGradient id="os-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pp-accent)" stopOpacity="0.20" />
          <stop offset="100%" stopColor="var(--pp-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {mid >= lo && mid <= hi && (
        <line className="os-chart-grid" x1={pad} y1={y(mid)} x2={W - pad} y2={y(mid)} />
      )}

      {band && anchor !== undefined && (
        <>
          <rect
            className="os-chart-band"
            x={pad}
            y={y(band.hi)}
            width={W - pad * 2}
            height={Math.max(1, y(band.lo) - y(band.hi))}
          />
          <line className="os-chart-anchor" x1={pad} y1={y(anchor)} x2={W - pad} y2={y(anchor)} />
          <text className="os-chart-anchor-t" x={W - pad} y={y(anchor) - 7} textAnchor="end">
            window anchor {((anchor / PROB_SCALE) * 100).toFixed(1)}%
          </text>
        </>
      )}

      {area && <path className="os-chart-area" d={area} />}
      <path className="os-chart-line" d={path} />

      {markers
        .filter((m) => m.at < series.length)
        .map((m, i) => (
          <circle
            key={i}
            className={`os-mark ${markerClass(m.outcome)}`}
            cx={x(m.at)}
            cy={y(series[m.at])}
            r={5}
          />
        ))}
      {series.length > 0 && (
        <circle
          className="os-chart-dot"
          cx={x(series.length - 1)}
          cy={y(series[series.length - 1])}
          r={4.5}
        />
      )}
    </svg>
  )
}
