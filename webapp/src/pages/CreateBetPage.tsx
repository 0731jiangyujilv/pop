import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { decodeEventLog, formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, usePublicClient, useReadContract } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { SwapToUsdcModal } from '@/components/SwapToUsdcModal'
import { BET_FACTORY_ABI, ERC20_ABI, Side } from '@/config/contracts'
import { getContractsForChain } from '@/config/contracts'
import { getChainConfig, isSupportedChain } from '@/config/chains'
import { formatDuration, formatUsdc, shareOnXUrl } from '@/lib/utils'
import { BOT_API_URL, apiFetch } from '@/lib/api'
import { simulateWrite } from '@/lib/simulateWrite'

type TxStep = 'idle' | 'approving' | 'creating' | 'done' | 'error'

type BetProposalData = {
  id?: number
  source?: 'telegram' | 'x'
  contractAddress?: string | null
  creatorTgId?: string
  chainId?: number
  asset: string
  minAmount: string
  maxAmount: string
  duration: number
}

type BetCreatedEventArgs = {
  betContract: string
  betId?: bigint
}

export function CreateBetPage() {
  const { betId } = useParams<{ betId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [betContract, setBetContract] = useState<string | null>(null)
  const [betData, setBetData] = useState<BetProposalData | null>(null)
  const [livePrice, setLivePrice] = useState<string | null>(null)
  const [initiatorSide, setInitiatorSide] = useState<number>(Side.Up)
  const [initiatorAmount, setInitiatorAmount] = useState('50')

  // Resolve contract addresses for current chain
  const contracts = chainId ? getContractsForChain(chainId) : getContractsForChain(84532)
  const chainConfig = chainId ? getChainConfig(chainId) : undefined

  const initiatorAmountUnits = initiatorAmount ? parseUnits(initiatorAmount, 6) : 0n
  const minAmountUnits = betData ? parseUnits(String(Number(betData.minAmount || 1)), 6) : 0n
  const maxAmountUnits = betData ? parseUnits(String(Number(betData.maxAmount || 1000)), 6) : 0n
  const minSliderValue = Number(minAmountUnits / 1_000_000n)
  const maxSliderValue = Number(maxAmountUnits / 1_000_000n)
  const sliderRangeValid = betData ? maxAmountUnits >= minAmountUnits : false
  const amountWithinRange = initiatorAmountUnits >= minAmountUnits && initiatorAmountUnits <= maxAmountUnits

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contracts.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, contracts.betFactoryAddress] : undefined,
    query: { enabled: !!address },
  })

  const { data: usdcWalletBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: contracts.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const [swapOpen, setSwapOpen] = useState(false)
  const needsSwap =
    chainId === 8453 &&
    typeof usdcWalletBalance === 'bigint' &&
    initiatorAmountUnits > 0n &&
    usdcWalletBalance < initiatorAmountUnits

  useEffect(() => {
    if (!betId) return
    const source = searchParams.get('source') === 'x' ? 'x' : 'telegram'
    const isUUID = betId.includes('-')
    const endpoint = source === 'x'
      ? (isUUID ? `/api/x/bet/uuid/${betId}` : `/api/x/bet/${betId}`)
      : (isUUID ? `/api/bet/uuid/${betId}` : `/api/bet/${betId}`)

    fetch(`${BOT_API_URL}${endpoint}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then((r) => r.json())
      .then((data: BetProposalData) => {
        setBetData(data)
        if (data.contractAddress) {
          const cid = data.chainId || chainId || 84532
          navigate(`/bet/${data.contractAddress}?chainId=${cid}`, { replace: true })
        }
      })
      .catch(() => {})
  }, [betId, navigate, searchParams])

  useEffect(() => {
    if (!isConnected || !address || !betData?.creatorTgId) return
    const walletEndpoint = betData?.source === 'x' ? '/api/x/register-wallet' : '/api/register-wallet'
    apiFetch(walletEndpoint, {
      method: 'POST',
      body: JSON.stringify({ tgId: betData.creatorTgId, walletAddress: address }),
    }).catch(() => {})
  }, [isConnected, address, betData])

  useEffect(() => {
    if (!betData?.asset) return

    let active = true

    const loadPrice = async () => {
      try {
        const response = await fetch(`${BOT_API_URL}/api/price/${encodeURIComponent(betData.asset)}`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        })
        if (!response.ok) throw new Error('Failed to load live price')
        const data = await response.json()
        if (active) {
          setLivePrice(typeof data?.price === 'string' ? data.price : null)
        }
      } catch {
        if (active) {
          setLivePrice(null)
        }
      }
    }

    loadPrice()
    const interval = setInterval(loadPrice, 5000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [betData?.asset])

  useEffect(() => {
    if (!betData || !sliderRangeValid) return
    const currentValue = Number(initiatorAmount)
    if (!Number.isFinite(currentValue)) {
      setInitiatorAmount(String(minSliderValue))
      return
    }
    const clamped = Math.min(Math.max(currentValue, minSliderValue), maxSliderValue)
    if (clamped !== currentValue) {
      setInitiatorAmount(String(clamped))
    }
  }, [betData, initiatorAmount, minSliderValue, maxSliderValue, sliderRangeValid])

  const { writeContractAsync: writeCreate } = useWriteContractWithAttribution()
  const { writeContractAsync: writeApprove } = useWriteContractWithAttribution()
  const { data: nativeBalance, isLoading: isNativeBalanceLoading } = useBalance({
    address,
    query: { enabled: !!address },
  })

  const shareLink = useMemo(() => {
    if (!betContract || !window?.location?.origin) return null
    return `${window.location.origin}/bet/${betContract}?chainId=${chainId || 84532}`
  }, [betContract, chainId])

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 200)
    return 'Transaction failed'
  }

  function formatBalance(value?: string) {
    if (!value) return '--'
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return value
    return numericValue.toLocaleString(undefined, { maximumFractionDigits: 4 })
  }

  function formatLivePrice(value: string | null) {
    if (!value) return 'Loading...'
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return value
    return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
  }

  const networkLabel = !isConnected || !chainId
    ? 'Not connected'
    : isSupportedChain(chainId)
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

  async function handleCreate() {
    if (!betData || !address || !publicClient) return

    if (!chainId || !isSupportedChain(chainId)) {
      setErrorMsg('Please switch to a supported network before creating a market.')
      setTxStep('error')
      return
    }

    const min = Number(betData.minAmount || 1)
    const max = Number(betData.maxAmount || 0)
    const amount = Number(initiatorAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Enter a valid initial prediction amount.')
      setTxStep('error')
      return
    }

    if (amount < min) {
      setErrorMsg(`Initial prediction amount must be at least ${min} USDC.`)
      setTxStep('error')
      return
    }

    if (max > 0 && amount > max) {
      setErrorMsg(`Initial prediction amount must be no more than ${max} USDC.`)
      setTxStep('error')
      return
    }

    setErrorMsg('')
    try {
      // ──────────── DEBUG ────────────
      // eslint-disable-next-line no-console
      console.groupCollapsed('[createBet] preparing call')
      // eslint-disable-next-line no-console
      console.log('chainId:', chainId)
      // eslint-disable-next-line no-console
      console.log('caller:', address)
      // eslint-disable-next-line no-console
      console.log('contracts:', contracts)
      // eslint-disable-next-line no-console
      console.log('betData:', betData)
      // eslint-disable-next-line no-console
      console.log('allowance (raw bigint):', allowance)
      // eslint-disable-next-line no-console
      console.log('usdcWalletBalance (raw bigint):', usdcWalletBalance)
      // eslint-disable-next-line no-console
      console.log('initiatorAmountUnits:', initiatorAmountUnits.toString())
      // eslint-disable-next-line no-console
      console.log('initiatorSide:', initiatorSide)
      // eslint-disable-next-line no-console
      console.groupEnd()
      // ───────────────────────────────

      if ((allowance ?? 0n) < initiatorAmountUnits) {
        setTxStep('approving')
        await simulateWrite(publicClient!, {
          address: contracts.usdcAddress, abi: ERC20_ABI, functionName: 'approve',
          args: [contracts.betFactoryAddress, initiatorAmountUnits], account: address!,
        })
        const approveTxHash = await writeApprove({
          address: contracts.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contracts.betFactoryAddress, initiatorAmountUnits],
        })
        await publicClient!.waitForTransactionReceipt({ hash: approveTxHash })
        await refetchAllowance()
      }

      setTxStep('creating')
      const createArgs = [
        contracts.usdcAddress,
        parseUnits(String(Number(betData.minAmount || 1)), 6),
        parseUnits(String(Number(betData.maxAmount || 1000)), 6),
        BigInt(Math.max(betData.duration || 600, 600)),
        betData.asset || 'BTC/USDC',
        initiatorSide,
        initiatorAmountUnits,
      ] as const

      // ──────────── DEBUG ────────────
      // eslint-disable-next-line no-console
      console.groupCollapsed('[createBet] simulating/sending')
      // eslint-disable-next-line no-console
      console.log('factory:', contracts.betFactoryAddress)
      // eslint-disable-next-line no-console
      console.log('args (decoded):', {
        token: createArgs[0],
        minAmount: createArgs[1].toString(),
        maxAmount: createArgs[2].toString(),
        duration: createArgs[3].toString(),
        asset: createArgs[4],
        initiatorSide: createArgs[5],
        initiatorAmount: createArgs[6].toString(),
      })
      // Serialize bigints for easy copy-paste into `cast call`:
      // eslint-disable-next-line no-console
      console.log('args (cast-style):', [
        createArgs[0],
        createArgs[1].toString(),
        createArgs[2].toString(),
        createArgs[3].toString(),
        createArgs[4],
        String(createArgs[5]),
        createArgs[6].toString(),
      ])
      // eslint-disable-next-line no-console
      console.groupEnd()
      // ───────────────────────────────

      try {
        await simulateWrite(publicClient!, {
          address: contracts.betFactoryAddress, abi: BET_FACTORY_ABI, functionName: 'createBet',
          args: createArgs, account: address!,
        })
      } catch (simErr) {
        // eslint-disable-next-line no-console
        console.error('[createBet] simulate revert:', simErr)
        throw simErr
      }
      const createTxHash = await writeCreate({
        address: contracts.betFactoryAddress,
        abi: BET_FACTORY_ABI,
        functionName: 'createBet',
        args: [...createArgs],
      })
      const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash })

      const betCreatedLog = createReceipt.logs.find((log) => {
        try {
          const decoded = decodeEventLog({
            abi: BET_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          })
          return decoded.eventName === 'BetCreated'
        } catch {
          return false
        }
      })

      if (!betCreatedLog) {
        throw new Error('Contract creation event not found in transaction receipt')
      }

      const decoded = decodeEventLog({
        abi: BET_FACTORY_ABI,
        data: betCreatedLog.data,
        topics: betCreatedLog.topics,
      })
      const args = decoded.args as unknown as BetCreatedEventArgs
      const newContract = args.betContract as string
      const onChainBetId = args.betId?.toString()

      setBetContract(newContract)
      setTxStep('done')

      if (betData?.id) {
        const dbId = betData.id
        const createEndpoint = betData?.source === 'x'
          ? `/api/x/bet/${dbId}/on-chain-created`
          : `/api/bet/${dbId}/on-chain-created`

        apiFetch(createEndpoint, {
          method: 'POST',
          body: JSON.stringify({
            contractAddress: newContract,
            onChainBetId,
            txHash: createTxHash,
            chainId,
          }),
        }).catch(() => {})
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[createBet] failure:', error)
      // eslint-disable-next-line no-console
      console.error('[createBet] failure cause chain:', (error as any)?.cause, (error as any)?.cause?.cause)
      setErrorMsg(getErrorMessage(error))
      setTxStep('error')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle_at_top, rgba(var(--color-accent-rgb), 0.08), transparent 26%), radial-gradient(circle_at_75%_25%, rgba(var(--color-accent-rgb), 0.06), transparent 18%)`,
        }}
      />
      <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ConnectWallet />
        </header>

        <div className="mt-12 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <section>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Create Market</p>
            <h1 className="mt-4 max-w-2xl font-[var(--font-display)] text-2xl font-semibold tracking-[-0.05em] md:text-4xl">
              Confirm the market and deploy it on-chain.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
              This page is part of the X bot flow. Once the contract goes live, the bot can detect it automatically, announce it back on X, and bring the crowd into the POP prediction pool.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ['Asset', betData?.asset ? betData.asset + "C" : 'Loading...'],
                ['Duration', betData ? formatDuration(Math.max(Number(betData.duration), 600)) + (Number(betData.duration) < 600 ? ' ' : '') : '...'],
                ['Live price', formatLivePrice(livePrice)],
              ].map(([label, value]) => (
                <div key={label} className="glow-card rounded-2xl p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</p>
                  <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="glow-card rounded-[28px] p-6">
            {!betData && (
              <div className="py-12 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[var(--color-cyan)] border-r-[rgba(20,20,20,0.28)]" />
                <p className="mt-5 text-sm text-[var(--color-muted)]">Loading proposal...</p>
              </div>
            )}

            {betData && txStep === 'idle' && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Wallet Action</p>
                <h2 className="mt-3 text-2xl font-semibold">Deploy the contract</h2>
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
                <div className="mt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setInitiatorSide(Side.Up)}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${initiatorSide === Side.Up ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'}`}
                    >
                      UP
                    </button>
                    <button
                      onClick={() => setInitiatorSide(Side.Down)}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${initiatorSide === Side.Down ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'}`}
                    >
                      DOWN
                    </button>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Initial Prediction Amount (USDC)</label>
                    <div className="mt-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Selected</span>
                        <span className="text-2xl font-semibold text-[var(--color-ink)]">{initiatorAmount} USDC</span>
                      </div>
                      <input
                        type="range"
                        min={minSliderValue}
                        max={maxSliderValue}
                        step={1}
                        value={initiatorAmount}
                        onChange={(e) => setInitiatorAmount(e.target.value)}
                        disabled={!sliderRangeValid}
                        className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-accent-soft-strong)] accent-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        <span>{minSliderValue} USDC</span>
                        <span>{maxSliderValue} USDC</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-muted)]">
                    The second participant must choose the opposite side and contribute at least {formatUsdc(initiatorAmountUnits)} USDC.
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!sliderRangeValid || !amountWithinRange || needsSwap}
                  className="mt-6 w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Create Prediction Market
                </button>
                {!sliderRangeValid && <p className="text-sm text-[var(--color-cyan)]">This market currently has no valid amount range to create.</p>}
                {needsSwap && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-[var(--color-cyan)]">Not enough USDC to create this market.</p>
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

            {txStep === 'creating' && (
              <div className="py-10 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[var(--color-cyan)] border-r-[rgba(20,20,20,0.28)]" />
                <p className="mt-5 text-sm uppercase tracking-[0.22em] text-[var(--color-cyan)]">Signing</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">Confirm the deployment in your wallet.</p>
              </div>
            )}

            {txStep === 'approving' && (
              <div className="py-10 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[var(--color-cyan)] border-r-[rgba(20,20,20,0.28)]" />
                <p className="mt-5 text-sm uppercase tracking-[0.22em] text-[var(--color-cyan)]">Approving USDC</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">Confirm the USDC approval in your wallet before the market can be created.</p>
              </div>
            )}

            {txStep === 'done' && betContract && (
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Contract Live</p>
                <h2 className="mt-3 text-2xl font-semibold">Market deployed successfully.</h2>
                <div className="mt-5 rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Contract</p>
                  <p className="mt-2 break-all text-sm text-[var(--color-ink)]">{betContract}</p>
                </div>
                <div className="mt-5 grid gap-3">
                  <Link
                    to={`/bet/${betContract}?chainId=${chainId || 84532}`}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
                  >
                    Go to Prediction Page
                  </Link>
                  <a
                    href={`${explorerUrl}/address/${betContract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-4 text-center text-sm font-semibold text-[var(--color-ink)]"
                  >
                    View on Scan
                  </a>
                  {shareLink && (
                    <a
                      href={shareOnXUrl('Your claim is live. Take a side here:', shareLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] px-5 py-4 text-center text-sm font-semibold text-[var(--color-cyan)]"
                    >
                      Share on X
                    </a>
                  )}
                </div>
              </div>
            )}

            {txStep === 'error' && (
              <div className="rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">Deployment Failed</p>
                <p className="mt-3 text-sm text-[var(--color-ink)]">{errorMsg}</p>
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
      </div>
      <SwapToUsdcModal
        isOpen={swapOpen}
        onClose={() => setSwapOpen(false)}
        requiredUsdcAmount={initiatorAmountUnits}
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
