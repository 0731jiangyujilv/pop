import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { decodeEventLog, formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { SwapToUsdcModal } from '@/components/SwapToUsdcModal'
import {
  PREDICTION_MARKET_FACTORY_ABI,
  ERC20_ABI,
  getContractsForChain,
} from '@/config/contracts'
import { getChainConfig, isSupportedChain, arcTestnet } from '@/config/chains'
import { formatUsdc } from '@/lib/utils'
import { simulateWrite } from '@/lib/simulateWrite'
import { apiFetch } from '@/lib/api'

type TxStep = 'idle' | 'approving' | 'creating' | 'done' | 'error'

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`

// Shape of POST /api/prediction-market/parse 200 response.
interface ParsedPrediction {
  asset: string
  threshold: number          // human-readable, frontend scales by oracleDecimals
  direction: 'above' | 'below'
  durationSeconds: number | null
  durationText: string | null
  priceFeed: `0x${string}`
  oracleDecimals: number
  confidence: number
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function formatSecondsHuman(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`
  return `${Math.round(seconds / 86_400)} d`
}

export function CreateMarketPage() {
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()

  const contracts = chainId ? getContractsForChain(chainId) : getContractsForChain(arcTestnet.id)
  const chainConfig = chainId ? getChainConfig(chainId) : undefined

  const factoryAddr = contracts.predictionMarketFactoryAddress
  const usdcAddr    = contracts.usdcAddress
  const factoryDeployed = factoryAddr !== ZERO_ADDR

  // ── Defaults / limits from factory ────────────────────────────────────────
  const { data: defaults } = useReadContracts({
    contracts: [
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'defaultLpSwapFeeBps' },
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'defaultPlatformFeeBps' },
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'defaultCreatorFeeBps' },
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'minDuration' },
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'maxDuration' },
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'minInitLiquidity' },
      { address: factoryAddr, abi: PREDICTION_MARKET_FACTORY_ABI, functionName: 'supportedTokens', args: [usdcAddr] },
    ],
    query: { enabled: factoryDeployed },
  })

  const lpFeeBps        = defaults?.[0]?.result as bigint | undefined
  const platformFeeBps  = defaults?.[1]?.result as bigint | undefined
  const creatorFeeBps   = defaults?.[2]?.result as bigint | undefined
  const minDuration     = defaults?.[3]?.result as bigint | undefined
  const maxDuration     = defaults?.[4]?.result as bigint | undefined
  const minInitLiquidity = defaults?.[5]?.result as bigint | undefined
  const usdcSupported   = defaults?.[6]?.result as boolean | undefined

  // ── Form state ────────────────────────────────────────────────────────────
  const [question, setQuestion] = useState('')
  const [parsed, setParsed] = useState<ParsedPrediction | null>(null)
  const [validating, setValidating] = useState(false)
  const [validateError, setValidateError] = useState('')

  // Editable copies of parsed fields so the user can tweak before submission.
  const [editAsset, setEditAsset] = useState('')
  const [editThreshold, setEditThreshold] = useState('')
  const [editDirection, setEditDirection] = useState<'above' | 'below'>('above')

  // Initiator's directional half-buy (§4). Defaults to YES; mirrors the doc.
  const [initialSide, setInitialSide] = useState<'YES' | 'NO'>('YES')

  const [closingDate, setClosingDate] = useState<string>(() =>
    toLocalDatetimeValue(new Date(Date.now() + 7 * 86_400_000))
  )
  const [initLiquidity, setInitLiquidity] = useState('25')
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [newMarket, setNewMarket] = useState<string | null>(null)
  const [swapOpen, setSwapOpen] = useState(false)

  const initLiquidityUnits = initLiquidity ? parseUnits(initLiquidity, 6) : 0n

  // datetime-local → unix seconds
  const closingUnix = useMemo(() => {
    if (!closingDate) return 0
    const t = new Date(closingDate).getTime()
    if (!Number.isFinite(t)) return 0
    return Math.floor(t / 1000)
  }, [closingDate])

  // ── Wallet balances & allowance ───────────────────────────────────────────
  const { data: usdcWalletBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: usdcAddr,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, factoryAddr] : undefined,
    query: { enabled: !!address && factoryDeployed },
  })

  const { data: nativeBalance, isLoading: isNativeBalanceLoading } = useBalance({
    address,
    query: { enabled: !!address },
  })

  // ── Validation ────────────────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000)
  const duration = closingUnix > now ? closingUnix - now : 0

  const durationOk =
    duration > 0 &&
    (!minDuration || BigInt(duration) >= minDuration) &&
    (!maxDuration || BigInt(duration) <= maxDuration)

  const liquidityOk =
    initLiquidityUnits > 0n &&
    (!minInitLiquidity || initLiquidityUnits >= minInitLiquidity)

  const thresholdNum = Number(editThreshold)
  const thresholdOk = parsed !== null && Number.isFinite(thresholdNum) && thresholdNum > 0
  const assetOk = parsed !== null && editAsset.trim().length > 0
  const enoughUsdc = typeof usdcWalletBalance === 'bigint' && usdcWalletBalance >= initLiquidityUnits
  const needsSwap =
    chainId === 8453 &&
    typeof usdcWalletBalance === 'bigint' &&
    initLiquidityUnits > 0n &&
    usdcWalletBalance < initLiquidityUnits

  const chainOk = !!chainId && isSupportedChain(chainId)
  const canSubmit =
    isConnected &&
    chainOk &&
    factoryDeployed &&
    usdcSupported === true &&
    parsed !== null &&
    assetOk &&
    thresholdOk &&
    durationOk &&
    liquidityOk &&
    enoughUsdc &&
    txStep === 'idle'

  // ── Derived display ───────────────────────────────────────────────────────
  const formatBalance = (value?: string) => {
    if (!value) return '--'
    const n = Number(value)
    if (!Number.isFinite(n)) return value
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }

  const networkLabel = !isConnected || !chainId
    ? 'Not connected'
    : chainOk
      ? (chainConfig?.chain.name || `Chain ${chainId}`)
      : `Unsupported (Chain ID: ${chainId})`

  const nativeBalanceLabel = !isConnected
    ? '--'
    : isNativeBalanceLoading
      ? 'Loading...'
      : `${formatBalance(nativeBalance ? formatUnits(nativeBalance.value, nativeBalance.decimals) : undefined)} ${nativeBalance?.symbol || 'ETH'}`

  const usdcBalanceLabel = !isConnected
    ? '--'
    : `${formatBalance(typeof usdcWalletBalance === 'bigint' ? formatUnits(usdcWalletBalance, 6) : undefined)} USDC`

  const explorerUrl = chainConfig?.explorerUrl || 'https://sepolia.basescan.org'
  const feesLabel =
    lpFeeBps !== undefined && platformFeeBps !== undefined && creatorFeeBps !== undefined
      ? `LP ${Number(lpFeeBps) / 100}% · Platform ${Number(platformFeeBps) / 100}% · Creator ${Number(creatorFeeBps) / 100}%`
      : '—'

  // ── Auto-clamp closingDate to factory limits once they load ──────────────
  useEffect(() => {
    if (!minDuration || !maxDuration) return
    const min = now + Number(minDuration)
    const max = now + Number(maxDuration)
    if (closingUnix > 0 && closingUnix < min) setClosingDate(toLocalDatetimeValue(new Date(min * 1000)))
    if (closingUnix > 0 && closingUnix > max) setClosingDate(toLocalDatetimeValue(new Date(max * 1000)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDuration, maxDuration])

  const { writeContractAsync: writeApprove } = useWriteContractWithAttribution()
  const { writeContractAsync: writeCreate }  = useWriteContractWithAttribution()

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 200)
    return 'Transaction failed'
  }

  async function handleValidate() {
    if (!question.trim()) return
    if (!chainId) {
      setValidateError('Connect a wallet to a supported chain first.')
      return
    }
    setValidating(true)
    setValidateError('')
    try {
      const res = await apiFetch('/api/prediction-market/parse', {
        method: 'POST',
        body: JSON.stringify({ question: question.trim(), chainId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.supported) {
        setValidateError(body.error || 'Could not parse this question.')
        setParsed(null)
        return
      }
      const p = body as ParsedPrediction
      setParsed(p)
      setEditAsset(p.asset)
      setEditThreshold(String(p.threshold))
      setEditDirection(p.direction)
      if (p.durationSeconds && p.durationSeconds > 0) {
        setClosingDate(toLocalDatetimeValue(new Date(Date.now() + p.durationSeconds * 1000)))
      }
    } catch (err) {
      setValidateError(getErrorMessage(err))
      setParsed(null)
    } finally {
      setValidating(false)
    }
  }

  function resetParse() {
    setParsed(null)
    setValidateError('')
    setEditAsset('')
    setEditThreshold('')
  }

  async function handleCreate() {
    if (!address || !publicClient) return
    if (!canSubmit || !parsed) return

    setErrorMsg('')
    try {
      // Scale threshold to the oracle's native decimals.
      const scaledThreshold = BigInt(Math.round(thresholdNum * Math.pow(10, parsed.oracleDecimals)))

      // 1. Approve if needed
      if ((allowance ?? 0n) < initLiquidityUnits) {
        setTxStep('approving')
        await simulateWrite(publicClient, {
          address: usdcAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [factoryAddr, initLiquidityUnits],
          account: address,
        })
        const approveTxHash = await writeApprove({
          address: usdcAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [factoryAddr, initLiquidityUnits],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash })
        await refetchAllowance()
      }

      // 2. createMarket
      setTxStep('creating')
      const params = {
        usdc: usdcAddr,
        question: question.trim(),
        closingTime: BigInt(closingUnix),
        initLiquidity: initLiquidityUnits,
        asset: editAsset.trim(),
        priceFeed: parsed.priceFeed,
        threshold: scaledThreshold,
        aboveWins: editDirection === 'above',
        initialSide: initialSide === 'YES',
      } as const

      await simulateWrite(publicClient, {
        address: factoryAddr,
        abi: PREDICTION_MARKET_FACTORY_ABI,
        functionName: 'createMarket',
        args: [params],
        account: address,
      })

      const createTxHash = await writeCreate({
        address: factoryAddr,
        abi: PREDICTION_MARKET_FACTORY_ABI,
        functionName: 'createMarket',
        args: [params],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash })

      // 3. Decode MarketCreated to get the deployed address
      let marketAddr: string | null = null
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: PREDICTION_MARKET_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'MarketCreated') {
            marketAddr = (decoded.args as { market: string }).market
            break
          }
        } catch {
          /* not our event */
        }
      }
      if (!marketAddr) throw new Error('MarketCreated event not found in receipt')

      setNewMarket(marketAddr)
      setTxStep('done')
      await refetchUsdcBalance()
    } catch (error) {
      console.error('[CreateMarketPage] create failed', error)
      setErrorMsg(getErrorMessage(error))
      setTxStep('error')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ConnectWallet />
        </header>

        <div className="mt-12 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          {/* ───── LEFT: copy + summary ───── */}
          <section>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Create Prediction Market</p>
            <h1 className="mt-4 max-w-2xl font-[var(--font-display)] text-2xl font-semibold tracking-[-0.05em] md:text-4xl">
              Spin up a YES/NO market with seeded liquidity.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
              Type a crypto price question. We check it against our on-chain oracles, extract the asset and threshold, and (after you confirm) deploy a fresh AMM pool seeded with your USDC. Settlement is fully on-chain via the oracle.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Default Fees</p>
                <p className="mt-3 text-base font-semibold text-[var(--color-ink)]">{feesLabel}</p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Min Liquidity</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">
                  {minInitLiquidity ? `${formatUsdc(minInitLiquidity)} USDC` : '—'}
                </p>
              </div>
              <div className="glow-card rounded-2xl p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Duration Range</p>
                <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">
                  {minDuration && maxDuration
                    ? `${formatSecondsHuman(Number(minDuration))} – ${formatSecondsHuman(Number(maxDuration))}`
                    : '—'}
                </p>
              </div>
            </div>
          </section>

          {/* ───── RIGHT: action card ───── */}
          <section className="glow-card rounded-[28px] p-6">
            {!factoryDeployed && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Unavailable on this network</p>
                <h2 className="mt-3 text-2xl font-semibold">Factory not deployed here</h2>
                <p className="mt-4 text-sm text-[var(--color-muted)]">
                  The prediction-market factory is currently only deployed on {arcTestnet.name}. Switch your wallet to {arcTestnet.name} to create a market.
                </p>
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Current Network</p>
                  <p className="mt-2 text-[var(--color-ink)]">{networkLabel}</p>
                </div>
              </div>
            )}

            {factoryDeployed && txStep === 'idle' && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Wallet Action</p>
                <h2 className="mt-3 text-2xl font-semibold">Deploy your market</h2>

                <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Connected Wallet</p>
                  <div className="mt-3 space-y-2 text-[var(--color-ink)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--color-muted)]">Network</span>
                      <span className="font-medium">{networkLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--color-muted)]">ETH Balance</span>
                      <span className="font-medium">{nativeBalanceLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--color-muted)]">USDC Balance</span>
                      <span className="font-medium">{usdcBalanceLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  {/* Question */}
                  <div>
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Question</label>
                    <textarea
                      value={question}
                      onChange={(e) => { setQuestion(e.target.value); if (parsed) resetParse() }}
                      rows={2}
                      placeholder="e.g. Will BTC break 150k before July 1?"
                      className="mt-2 w-full resize-none rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[rgba(0,82,255,0.25)]"
                    />
                    {!parsed && (
                      <button
                        type="button"
                        onClick={handleValidate}
                        disabled={validating || question.trim().length === 0 || !chainOk}
                        className="mt-3 w-full rounded-full border border-[var(--color-cyan)] bg-white px-5 py-3 text-sm font-semibold text-[var(--color-cyan)] transition hover:bg-[rgba(0,0,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {validating ? 'Validating…' : 'Validate Question'}
                      </button>
                    )}
                    {validateError && (
                      <p className="mt-3 rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)] p-3 text-sm text-[#dc2626]">
                        {validateError}
                      </p>
                    )}
                  </div>

                  {/* Parsed fields — only visible after validation succeeds */}
                  {parsed && (
                    <div className="rounded-2xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.06)] p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-[#15803d]">Parsed (editable)</p>
                        <button
                          type="button"
                          onClick={resetParse}
                          className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)] underline hover:text-[var(--color-ink)]"
                        >
                          Edit question
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Asset</label>
                          <input
                            type="text"
                            value={editAsset}
                            onChange={(e) => setEditAsset(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-[rgba(20,20,20,0.08)] bg-white px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-[rgba(0,82,255,0.25)]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">Direction</label>
                          <div className="mt-1 grid grid-cols-2 gap-2">
                            {(['above', 'below'] as const).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setEditDirection(d)}
                                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                  editDirection === d
                                    ? 'bg-[var(--color-cyan)] text-white'
                                    : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-muted)]">
                            Threshold ({parsed.asset.split('/')[1] || 'USD'})
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editThreshold}
                            onChange={(e) => setEditThreshold(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-[rgba(20,20,20,0.08)] bg-white px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-[rgba(0,82,255,0.25)]"
                          />
                        </div>
                      </div>

                      <p className="mt-3 text-xs text-[var(--color-muted)]">
                        YES wins iff {editAsset} {editDirection === 'above' ? '≥' : '≤'} {editThreshold || '?'} at closing time.
                        <br />
                        Oracle: <span className="font-mono">{parsed.priceFeed.slice(0, 10)}…</span> ({parsed.oracleDecimals} decimals)
                      </p>
                    </div>
                  )}

                  {/* Initiator's opening bet — half of init liquidity buys this side */}
                  {parsed && (
                    <div className="rounded-2xl border border-[rgba(0,82,255,0.16)] bg-[rgba(0,82,255,0.04)] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">Your Opening Bet</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(['YES', 'NO'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setInitialSide(s)}
                            className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                              initialSide === s
                                ? s === 'YES'
                                  ? 'bg-[#15803d] text-white'
                                  : 'bg-[#dc2626] text-white'
                                : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'
                            }`}
                          >
                            {s === 'YES' ? '✓ YES' : '✗ NO'}
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">
                        Half of your initial liquidity seeds the AMM pool as <span className="font-semibold">locked LP</span> until
                        settlement; the other half is immediately spent buying <span className="font-semibold">{initialSide}</span>,
                        so the market opens reflecting your view rather than a flat 50/50.
                      </p>
                    </div>
                  )}

                  {/* Closing time — always visible */}
                  <div>
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Closing Time</label>
                    <input
                      type="datetime-local"
                      value={closingDate}
                      onChange={(e) => setClosingDate(e.target.value)}
                      min={minDuration ? toLocalDatetimeValue(new Date((now + Number(minDuration)) * 1000)) : undefined}
                      max={maxDuration ? toLocalDatetimeValue(new Date((now + Number(maxDuration)) * 1000)) : undefined}
                      className="mt-2 w-full rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[rgba(0,82,255,0.25)]"
                    />
                    {duration > 0 && (
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        Duration ≈ {formatSecondsHuman(duration)} · settles 1 second after this time
                      </p>
                    )}
                  </div>

                  {/* Initial liquidity */}
                  <div>
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Initial Liquidity (USDC)</label>
                    <div className="mt-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                      <input
                        type="number"
                        min={minInitLiquidity ? Number(minInitLiquidity) / 1_000_000 : 1}
                        step="1"
                        value={initLiquidity}
                        onChange={(e) => setInitLiquidity(e.target.value)}
                        className="w-full bg-transparent text-2xl font-semibold text-[var(--color-ink)] outline-none"
                      />
                      <div className="mt-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        <span>
                          Min {minInitLiquidity ? formatUsdc(minInitLiquidity) : '—'} USDC
                        </span>
                        <span>You become the initial LP</span>
                      </div>
                    </div>
                  </div>

                  {/* Validation hints */}
                  {usdcSupported === false && (
                    <p className="rounded-2xl border border-[rgba(255,100,0,0.35)] bg-[rgba(255,100,0,0.06)] p-3 text-sm text-[#b45309]">
                      USDC is not whitelisted as collateral on this network. Ask the factory owner to add it.
                    </p>
                  )}
                  {duration > 0 && !durationOk && (
                    <p className="text-sm text-[var(--color-cyan)]">
                      Closing time must be within the allowed duration range.
                    </p>
                  )}
                  {initLiquidityUnits > 0n && minInitLiquidity && initLiquidityUnits < minInitLiquidity && (
                    <p className="text-sm text-[var(--color-cyan)]">
                      Initial liquidity must be at least {formatUsdc(minInitLiquidity)} USDC.
                    </p>
                  )}
                  {initLiquidityUnits > 0n && !enoughUsdc && (
                    <p className="text-sm text-[var(--color-cyan)]">
                      Not enough USDC in wallet ({usdcBalanceLabel}).
                    </p>
                  )}
                </div>

                <button
                  onClick={handleCreate}
                  disabled={!canSubmit}
                  className="mt-6 w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {parsed ? 'Create Prediction Market' : 'Validate Question First'}
                </button>

                {needsSwap && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setSwapOpen(true)}
                      className="w-full rounded-full border border-[var(--color-cyan)] bg-white px-5 py-3 text-sm font-semibold text-[var(--color-cyan)] transition hover:bg-[rgba(0,0,255,0.04)]"
                    >
                      Swap to USDC
                    </button>
                  </div>
                )}
              </div>
            )}

            {txStep === 'approving' && (
              <div className="py-10 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[var(--color-cyan)] border-r-[rgba(20,20,20,0.28)]" />
                <p className="mt-5 text-sm uppercase tracking-[0.22em] text-[var(--color-cyan)]">Approving USDC</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">Confirm the USDC approval in your wallet.</p>
              </div>
            )}

            {txStep === 'creating' && (
              <div className="py-10 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[var(--color-cyan)] border-r-[rgba(20,20,20,0.28)]" />
                <p className="mt-5 text-sm uppercase tracking-[0.22em] text-[var(--color-cyan)]">Deploying</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">Confirm the createMarket transaction in your wallet.</p>
              </div>
            )}

            {txStep === 'done' && newMarket && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Market Live</p>
                <h2 className="mt-3 text-2xl font-semibold">Your prediction market is deployed.</h2>
                <div className="mt-5 rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Contract</p>
                  <p className="mt-2 break-all text-sm text-[var(--color-ink)]">{newMarket}</p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/market/${newMarket}?chainId=${chainId}`)}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
                  >
                    Go to Market Page
                  </button>
                  <a
                    href={`${explorerUrl}/address/${newMarket}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                  >
                    View on Scan
                  </a>
                </div>
              </div>
            )}

            {txStep === 'error' && (
              <div className="rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">Deployment Failed</p>
                <p className="mt-3 break-words text-sm text-[var(--color-ink)]">{errorMsg}</p>
                <button
                  onClick={() => { setTxStep('idle'); setErrorMsg('') }}
                  className="mt-5 rounded-full bg-[var(--color-accent-soft-strong)] px-5 py-3 text-sm font-semibold text-[var(--color-cyan)]"
                >
                  Try Again
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="mt-12 text-center text-xs text-[var(--color-muted)]">
          <Link to="/" className="underline hover:text-[var(--color-ink)]">← Back to home</Link>
        </div>
      </div>

      <SwapToUsdcModal
        isOpen={swapOpen}
        onClose={() => setSwapOpen(false)}
        requiredUsdcAmount={initLiquidityUnits}
        currentUsdcBalance={typeof usdcWalletBalance === 'bigint' ? usdcWalletBalance : 0n}
        onComplete={async () => {
          await refetchUsdcBalance()
          await refetchAllowance()
          setSwapOpen(false)
        }}
      />
    </div>
  )
}
