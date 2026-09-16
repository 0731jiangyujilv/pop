import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { decodeEventLog, formatUnits, parseUnits } from 'viem'
import { useAccount, useBalance, usePublicClient, useReadContract } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { SwapToUsdcModal } from '@/components/SwapToUsdcModal'
import { EVENT_BET_FACTORY_ABI, ERC20_ABI, EventSide } from '@/config/contracts'
import { getContractsForChain } from '@/config/contracts'
import { arcTestnet, getChainConfig, isSupportedChain } from '@/config/chains'
import { formatDuration, formatUsdc, shareOnXUrl } from '@/lib/utils'
import { BOT_API_URL, apiFetch } from '@/lib/api'
import { simulateWrite } from '@/lib/simulateWrite'

type TxStep = 'idle' | 'approving' | 'creating' | 'done' | 'error'

type EventProposalData = {
  id?: number
  source?: 'telegram' | 'x'
  contractAddress?: string | null
  creatorTgId?: string
  chainId?: number
  duration: number
  minAmount: string
  maxAmount: string
  question?: string | null
  dataSourceType?: string | null
  dataSourceConfig?: { username: string } | null
}

type EventBetCreatedEventArgs = {
  betContract: string
  betId?: bigint
}

export function EventMarketCreatePage() {
  const { betId } = useParams<{ betId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  // const { switchChain, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient()
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [betContract, setBetContract] = useState<string | null>(null)
  const [betData, setBetData] = useState<EventProposalData | null>(null)
  const [initiatorSide, setInitiatorSide] = useState<number>(EventSide.Yes)
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
    args: address ? [address, contracts.eventBetFactoryAddress] : undefined,
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
      .then((data: EventProposalData) => {
        setBetData(data)
        if (data.contractAddress) {
          const cid = data.chainId || chainId || 84532
          navigate(`/event/${data.contractAddress}?chainId=${cid}`, { replace: true })
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
    return `${window.location.origin}/event/${betContract}?chainId=${chainId || 84532}`
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

  const question = betData?.question || 'Loading...'

  // SWARM-resolved markets (no explicit data source) can only deploy on Arc
  // Testnet — the 5-oracle swarm + x402 Nanopayments infrastructure lives there.
  const requiresArc = betData?.dataSourceType === 'SWARM'
  const isOnArc = chainId === arcTestnet.id
  const chainBlockedBySwarm = requiresArc && isConnected && !isOnArc

  const dataSourceLabel = requiresArc
    ? '5-agent AI Swarm'
    : betData?.dataSourceConfig?.username
      ? `@${betData.dataSourceConfig.username}`
      : betData?.dataSourceType || '--'
  
  console.log(dataSourceLabel)

  async function handleCreate() {
    console.log('[handleCreate] called', { betData, address, publicClient: !!publicClient, chainId })
    if (!betData || !address || !publicClient) return

    if (!chainId || !isSupportedChain(chainId)) {
      setErrorMsg('Please switch to a supported network before creating a market.')
      setTxStep('error')
      return
    }

    if (requiresArc && chainId !== arcTestnet.id) {
      setErrorMsg('Swarm-resolved markets can only be deployed on Arc Testnet.')
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

    const duration = Math.max(betData.duration || 600, 600)
    const TX_CONFIRMATION_BUFFER = 60 // seconds — prevents InvalidClosingTime when minDuration === duration
    const closingTime = BigInt(Math.floor(Date.now() / 1000) + duration + TX_CONFIRMATION_BUFFER)
    const questionStr = betData.question || ''
    const resolutionSource = requiresArc
      ? '5-agent AI Swarm · Gemini + x402 Nanopayments on Arc'
      : betData.dataSourceConfig?.username
        ? `X posts from @${betData.dataSourceConfig.username}`
        : ''

    console.log('[handleCreate] resolved contract addresses', {
      usdcAddress: contracts.usdcAddress,
      eventBetFactoryAddress: contracts.eventBetFactoryAddress,
      chainId,
    })

    setErrorMsg('')
    try {
      console.log('[handleCreate] allowance check', {
        allowance: allowance?.toString(),
        initiatorAmountUnits: initiatorAmountUnits.toString(),
        needsApproval: (allowance ?? 0n) < initiatorAmountUnits,
      })
      if ((allowance ?? 0n) < initiatorAmountUnits) {
        setTxStep('approving')
        console.log('[handleCreate] simulating approve', {
          contract: contracts.usdcAddress,
          spender: contracts.eventBetFactoryAddress,
          amount: initiatorAmountUnits.toString(),
          account: address,
        })
        await simulateWrite(publicClient!, {
          address: contracts.usdcAddress, abi: ERC20_ABI, functionName: 'approve',
          args: [contracts.eventBetFactoryAddress, initiatorAmountUnits], account: address!,
        })
        console.log('[handleCreate] approve simulate OK — sending approve tx')
        const approveTxHash = await writeApprove({
          address: contracts.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contracts.eventBetFactoryAddress, initiatorAmountUnits],
        })
        console.log('[handleCreate] approve tx sent', { approveTxHash })
        await publicClient!.waitForTransactionReceipt({ hash: approveTxHash })
        console.log('[handleCreate] approve tx confirmed')
        await refetchAllowance()
      }

      setTxStep('creating')
      const createArgs = [
        contracts.usdcAddress,
        parseUnits(String(Number(betData.minAmount || 1)), 6),
        parseUnits(String(Number(betData.maxAmount || 1000)), 6),
        closingTime,
        questionStr,
        resolutionSource,
        initiatorSide,
        initiatorAmountUnits,
      ] as const

      console.log('[handleCreate] createEventBet args', {
        contract: contracts.eventBetFactoryAddress,
        args: {
          token: createArgs[0],
          minAmount: createArgs[1].toString(),
          maxAmount: createArgs[2].toString(),
          closingTime: createArgs[3].toString(),
          question: createArgs[4],
          resolutionSource: createArgs[5],
          initiatorSide: createArgs[6],
          initiatorAmount: createArgs[7].toString(),
        },
      })

      console.log('[handleCreate] simulating createEventBet...')
      await simulateWrite(publicClient!, {
        address: contracts.eventBetFactoryAddress, abi: EVENT_BET_FACTORY_ABI, functionName: 'createEventBet',
        args: createArgs, account: address!,
      })
      console.log('[handleCreate] simulate OK — sending createEventBet tx')
      const createTxHash = await writeCreate({
        address: contracts.eventBetFactoryAddress,
        abi: EVENT_BET_FACTORY_ABI,
        functionName: 'createEventBet',
        args: [...createArgs],
      })
      console.log('[handleCreate] createEventBet tx sent', { createTxHash })
      const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash })
      console.log('[handleCreate] createEventBet tx confirmed', {
        status: createReceipt.status,
        blockNumber: createReceipt.blockNumber.toString(),
        logsCount: createReceipt.logs.length,
      })

      const eventBetCreatedLog = createReceipt.logs.find((log) => {
        try {
          const decoded = decodeEventLog({
            abi: EVENT_BET_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          })
          return decoded.eventName === 'EventBetCreated'
        } catch {
          return false
        }
      })

      if (!eventBetCreatedLog) {
        throw new Error('Contract creation event not found in transaction receipt')
      }

      const decoded = decodeEventLog({
        abi: EVENT_BET_FACTORY_ABI,
        data: eventBetCreatedLog.data,
        topics: eventBetCreatedLog.topics,
      })
      const args = decoded.args as unknown as EventBetCreatedEventArgs
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
      console.error('[handleCreate] ERROR', error)
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
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Create Event Market</p>
            <h1 className="mt-4 max-w-2xl font-[var(--font-display)] text-2xl font-semibold tracking-[-0.05em] md:text-4xl">
              Confirm the event prediction and deploy it on-chain.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
              This page is part of the X bot flow. Choose YES or NO on the event question, stake your prediction, and deploy the contract. The bot will announce it on X and bring the crowd into the POP event prediction pool.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ['Question', question],
                ['Duration', betData ? formatDuration(Math.max(Number(betData.duration), 600)) + (Number(betData.duration) < 600 ? '' : '') : '...'],
                ['Data Source', "Constellar"],
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

                {/* {requiresArc && (
                  <div className={`mt-4 rounded-2xl border p-4 text-sm ${
                    isOnArc
                      ? 'border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.06)]'
                      : 'border-[rgba(255,100,0,0.35)] bg-[rgba(255,100,0,0.06)]'
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent-soft-strong)] text-xs font-bold text-[var(--color-cyan)]">
                        ⚡
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-[var(--color-ink)]">
                          Swarm-resolved market — Arc Testnet only
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
                          Resolution runs on 5 autonomous AI oracle agents paid per evidence via x402
                          Nanopayments. This infrastructure lives on Arc Testnet; other networks are
                          not supported for this market.
                        </p>
                        {!isOnArc && isConnected && (
                          <button
                            type="button"
                            onClick={() => switchChain({ chainId: arcTestnet.id })}
                            disabled={isSwitching}
                            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-cyan)] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSwitching ? 'Switching…' : `Switch to ${arcTestnet.name}`}
                          </button>
                        )}
                        {!isConnected && (
                          <p className="mt-2 text-xs text-[var(--color-cyan)]">
                            Connect a wallet to switch to {arcTestnet.name}.
                          </p>
                        )}
                        {isOnArc && (
                          <p className="mt-2 text-xs font-medium text-[#15803d]">
                            ✓ Connected to {arcTestnet.name} — ready to deploy.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )} */}
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
                      onClick={() => setInitiatorSide(EventSide.Yes)}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${initiatorSide === EventSide.Yes ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'}`}
                    >
                      YES
                    </button>
                    <button
                      onClick={() => setInitiatorSide(EventSide.No)}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${initiatorSide === EventSide.No ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'}`}
                    >
                      NO
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
                    The second participant must choose the opposite side (YES or NO) and contribute at least {formatUsdc(initiatorAmountUnits)} USDC.
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!sliderRangeValid || !amountWithinRange || needsSwap || chainBlockedBySwarm}
                  className="mt-6 w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {chainBlockedBySwarm ? `Switch to ${arcTestnet.name} to continue` : 'Create Event Prediction Market'}
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
                <h2 className="mt-3 text-2xl font-semibold">Event market deployed successfully.</h2>
                <div className="mt-5 rounded-2xl border border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Contract</p>
                  <p className="mt-2 break-all text-sm text-[var(--color-ink)]">{betContract}</p>
                </div>
                <div className="mt-5 grid gap-3">
                  <Link
                    to={`/event/${betContract}?chainId=${chainId || 84532}`}
                    className="rounded-full bg-[var(--color-cyan)] px-5 py-4 text-center text-sm font-semibold text-white"
                  >
                    Go to Event Prediction Page
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
                      href={shareOnXUrl('Your event prediction is live. Take a side here:', shareLink)}
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
