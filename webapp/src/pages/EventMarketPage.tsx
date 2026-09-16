import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { useWriteContractWithAttribution } from '@/hooks/useWriteContractWithAttribution'
import { ConnectWallet } from '@/components/ConnectWallet'
import { Logo } from '@/components/Logo'
import { SwapToUsdcModal } from '@/components/SwapToUsdcModal'
import { EVENT_BET_ABI, EventBetStatus, eventBetStatusLabel, ERC20_ABI, EventSide, getContractsForChain } from '@/config/contracts'
import { getChainConfig } from '@/config/chains'
import { formatUsdc, shareOnXUrl, shortenAddress } from '@/lib/utils'
import { simulateWrite } from '@/lib/simulateWrite'

type TxStep = 'idle' | 'approving' | 'placing' | 'placed' | 'claiming' | 'claimed' | 'error'

type Position = {
  player: `0x${string}`
  amount: bigint
}

export function EventMarketPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()
  const walletChainId = useChainId()
  const betChainId = Number(searchParams.get('chainId')) || walletChainId
  const publicClient = usePublicClient({ chainId: betChainId })
  const contracts = getContractsForChain(betChainId)
  const chainConfig = getChainConfig(betChainId)
  const explorerUrl = chainConfig?.explorerUrl || 'https://sepolia.basescan.org'
  const chainMismatch = isConnected && walletChainId !== betChainId
  const [txStep, setTxStep] = useState<TxStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [side, setSide] = useState<number>(searchParams.get('side') === 'no' ? EventSide.No : EventSide.Yes)
  const [amount, setAmount] = useState('50')

  const betAddr = contractAddress as `0x${string}`

  const { data: betInfo, refetch: refetchBetInfo, isLoading: isBetInfoLoading } = useReadContract({
    address: betAddr,
    abi: EVENT_BET_ABI,
    functionName: 'getEventBetInfo',
    chainId: betChainId,
  })

  const { data: question } = useReadContract({
    address: betAddr,
    abi: EVENT_BET_ABI,
    functionName: 'question',
    chainId: betChainId,
  })

  const { data: resolutionSource } = useReadContract({
    address: betAddr,
    abi: EVENT_BET_ABI,
    functionName: 'resolutionSource',
    chainId: betChainId,
  })
  console.log(resolutionSource)

  const { data: positionData, refetch: refetchPositions } = useReadContracts({
    contracts: [
      { address: betAddr, abi: EVENT_BET_ABI, functionName: 'getYesPositions', chainId: betChainId },
      { address: betAddr, abi: EVENT_BET_ABI, functionName: 'getNoPositions', chainId: betChainId },
    ],
  })

  const yesPositions = (positionData?.[0]?.result as Position[] | undefined) || []
  const noPositions = (positionData?.[1]?.result as Position[] | undefined) || []

  const { data: claimableAmount } = useReadContract({
    address: betAddr,
    abi: EVENT_BET_ABI,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    chainId: betChainId,
    query: { enabled: !!address && betInfo?.status === EventBetStatus.Settled },
  })

  const { data: hasClaimed } = useReadContract({
    address: betAddr,
    abi: EVENT_BET_ABI,
    functionName: 'hasClaimed',
    args: address ? [address] : undefined,
    chainId: betChainId,
    query: { enabled: !!address },
  })

  const myPosition = [...yesPositions, ...noPositions].find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const myYesPosition = yesPositions.find((p) => p.player?.toLowerCase() === address?.toLowerCase())
  const mySide = myYesPosition ? 'YES' : myPosition ? 'NO' : null
  const totalPlayers = yesPositions.length + noPositions.length
  const solePosition = totalPlayers === 1 ? (yesPositions[0] || noPositions[0]) : null
  const initiatorSide = totalPlayers === 1 ? (yesPositions.length === 1 ? EventSide.Yes : EventSide.No) : null
  const initiatorAmount = solePosition?.amount ?? 0n
  const isSecondBettorTurn = totalPlayers === 1 && !myPosition
  const requiredSecondSide = initiatorSide === EventSide.Yes ? EventSide.No : initiatorSide === EventSide.No ? EventSide.Yes : null

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: contracts.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, betAddr] : undefined,
    chainId: betChainId,
    query: { enabled: !!address },
  })

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: contracts.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: betChainId,
    query: { enabled: !!address },
  })

  const [swapOpen, setSwapOpen] = useState(false)

  const { writeContractAsync: writeApprove } = useWriteContractWithAttribution()
  const { writeContractAsync: writePlaceBet } = useWriteContractWithAttribution()
  const { writeContractAsync: writeClaim } = useWriteContractWithAttribution()

  const betStatus = betInfo?.status ?? 0
  const totalYes = betInfo?.totalYes ?? 0n
  const totalNo = betInfo?.totalNo ?? 0n
  const totalPool = totalYes + totalNo
  const minAmount = betInfo?.minAmount ?? 0n
  const maxAmount = betInfo?.maxAmount ?? 0n
  const closingTime = betInfo?.closingTime ? Number(betInfo.closingTime) : 0
  const isOpen = betStatus === EventBetStatus.Open
  const isSettled = betStatus === EventBetStatus.Settled
  const bettingDeadline = betInfo?.bettingDeadline ? Number(betInfo.bettingDeadline) : 0
  const now = Math.floor(Date.now() / 1000)
  const bettingOpen = isOpen && (bettingDeadline === 0 || bettingDeadline > now)
  const minSelectableAmount = initiatorAmount > minAmount ? initiatorAmount : minAmount
  const maxSelectableAmount = maxAmount > 0n
    ? (maxAmount >= minSelectableAmount ? maxAmount : minSelectableAmount)
    : (balance !== undefined && balance >= minSelectableAmount ? balance : minSelectableAmount)
  const minSliderValue = Number(minSelectableAmount / 1_000_000n)
  const maxSliderValue = Number(maxSelectableAmount / 1_000_000n)
  const usdcAmount = amount ? parseUnits(amount, 6) : 0n
  const needsApproval = allowance !== undefined && allowance < usdcAmount
  const hasEnoughBalance = balance !== undefined && balance >= usdcAmount
  const secondSideValid = !isSecondBettorTurn || requiredSecondSide === null || side === requiredSecondSide
  const secondAmountValid = !isSecondBettorTurn || usdcAmount >= initiatorAmount
  const sliderRangeValid = maxSelectableAmount >= minSelectableAmount
  const amountWithinRange = usdcAmount >= minSelectableAmount && usdcAmount <= maxSelectableAmount
  const placeBetBlocked = !hasEnoughBalance || !secondSideValid || !secondAmountValid || !sliderRangeValid || !amountWithinRange
  const secondBetDirectionLabel = requiredSecondSide === EventSide.Yes ? 'YES' : requiredSecondSide === EventSide.No ? 'NO' : null
  const settledWinningSide = isSettled && !betInfo?.isDraw ? betInfo?.winningSide : null

  useEffect(() => {
    if (!betInfo || minSliderValue <= 0 || maxSliderValue <= 0) return
    const currentValue = Number(amount)
    if (!Number.isFinite(currentValue)) {
      setAmount(String(minSliderValue))
      return
    }
    const clamped = Math.min(Math.max(currentValue, minSliderValue), maxSliderValue)
    if (clamped !== currentValue) {
      setAmount(String(clamped))
    }
  }, [betInfo, amount, minSliderValue, maxSliderValue])

  useEffect(() => {
    if (!isSecondBettorTurn || requiredSecondSide === null) return
    if (side !== requiredSecondSide) {
      setSide(requiredSecondSide)
    }
  }, [isSecondBettorTurn, requiredSecondSide, side])

  const shareUrl = useMemo(() => {
    if (!contractAddress || !window?.location?.origin) return ''
    return `${window.location.origin}/event/${contractAddress}?chainId=${betChainId}`
  }, [contractAddress, betChainId])

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message.slice(0, 180)
    return 'Transaction failed'
  }

  async function handlePlaceBet() {
    if (!amount || !address || !publicClient) return
    setErrorMsg('')
    if (!secondSideValid) {
      setTxStep('error')
      setErrorMsg(`The second participant must choose ${secondBetDirectionLabel}.`)
      return
    }
    if (!secondAmountValid) {
      setTxStep('error')
      setErrorMsg(`The second participant must contribute at least ${formatUsdc(initiatorAmount)} USDC.`)
      return
    }

    try {
      if (needsApproval) {
        setTxStep('approving')
        await simulateWrite(publicClient, {
          address: contracts.usdcAddress, abi: ERC20_ABI, functionName: 'approve',
          args: [betAddr, usdcAmount], account: address,
        })
        const approveTxHash = await writeApprove({
          address: contracts.usdcAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [betAddr, usdcAmount],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash })
        await refetchAllowance()
      }

      setTxStep('placing')
      await simulateWrite(publicClient, {
        address: betAddr, abi: EVENT_BET_ABI, functionName: 'placeBet',
        args: [side, usdcAmount], account: address,
      })
      const placeTxHash = await writePlaceBet({
        address: betAddr,
        abi: EVENT_BET_ABI,
        functionName: 'placeBet',
        args: [side, usdcAmount],
      })
      await publicClient.waitForTransactionReceipt({ hash: placeTxHash })

      setTxStep('placed')
      await Promise.all([refetchBetInfo(), refetchPositions(), refetchAllowance()])
    } catch (error) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(error))
    }
  }

  async function handleClaim() {
    if (!publicClient) return
    setErrorMsg('')
    try {
      setTxStep('claiming')
      await simulateWrite(publicClient, {
        address: betAddr, abi: EVENT_BET_ABI, functionName: 'claim',
        account: address!,
      })
      const claimTxHash = await writeClaim({
        address: betAddr,
        abi: EVENT_BET_ABI,
        functionName: 'claim',
      })
      await publicClient.waitForTransactionReceipt({ hash: claimTxHash })
      setTxStep('claimed')
      await refetchBetInfo()
    } catch (error) {
      setTxStep('error')
      setErrorMsg(getErrorMessage(error))
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,0,255,0.06),transparent_18%)]" />
      <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ConnectWallet />
        </header>

        <div className="mt-10 grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-cyan)]">Event Market</p>
              <h1 className={`mt-4 font-semibold tracking-tight ${isSettled ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl'}`}>
                {isSettled ? 'Market settled. Review the final outcome.' : 'Choose a side. Size your conviction.'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
                {isSettled
                  ? 'This event market has been resolved. You can review the result and claim if eligible.'
                  : 'Predict the outcome of a real-world event. Winners split the prize pool proportionally after fees.'}
              </p>
            </div>

            {betInfo && (
              <div className="glow-card rounded-[28px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.24em] ${
                      isSettled
                        ? 'border-[rgba(134,239,172,0.6)] bg-[rgba(134,239,172,0.16)] text-[#16a34a]'
                        : 'border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]'
                    }`}
                  >
                    {eventBetStatusLabel(betStatus)}
                  </span>
                  {mySide && (
                    <span className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[var(--color-cyan)]">
                      You are on {mySide}
                    </span>
                  )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <MetricCard
                    label={`YES Pool${settledWinningSide === EventSide.Yes ? ' 👑' : ''}`}
                    value={`${formatUsdc(totalYes)} USDC`}
                    accent="cyan"
                    highlighted={settledWinningSide === EventSide.Yes}
                    winnerStamp={settledWinningSide === EventSide.Yes ? 'WIN' : undefined}
                  />
                  <MetricCard
                    label={`NO Pool${settledWinningSide === EventSide.No ? ' 👑' : ''}`}
                    value={`${formatUsdc(totalNo)} USDC`}
                    accent="magenta"
                    highlighted={settledWinningSide === EventSide.No}
                    winnerStamp={settledWinningSide === EventSide.No ? 'WIN' : undefined}
                  />
                  <MetricCard label="Total Pool" value={`${formatUsdc(totalPool)} USDC`} accent="green" />
                </div>

              </div>
            )}

            {betInfo && (yesPositions.length > 0 || noPositions.length > 0) && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Participants</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <PositionList title="YES" positions={yesPositions} address={address} accent="cyan" />
                  <PositionList title="NO" positions={noPositions} address={address} accent="magenta" />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-6">
            {betInfo && (
              <div className="glow-card rounded-[28px] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Market Info</p>
                <div className="mt-4 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Title</span>
                    <span className="font-medium text-[var(--color-ink)] text-right max-w-[60%]">{question || '...'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Data Source</span>
                    <span className="font-medium text-[var(--color-ink)] text-right max-w-[60%]">Constellar</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Status</span>
                    <span className="font-medium text-[var(--color-ink)]">{eventBetStatusLabel(betStatus)}</span>
                  </div>
                  {closingTime > 0 && (
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">Resolution Time</span>
                      <span className="font-medium text-[var(--color-ink)]">{new Date(closingTime * 1000).toLocaleString()}</span>
                    </div>
                  )}
                  {isSettled && (
                    <div className="flex justify-between">
                      <span className="text-[var(--color-muted)]">Result</span>
                      <span className={`font-semibold ${betInfo.isDraw ? 'text-[var(--color-cyan)]' : 'text-[#3c8aff]'}`}>
                        {betInfo.isDraw
                          ? 'Draw'
                          : `${betInfo.outcome === 1 ? 'YES' : 'NO'} wins 👑`}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Participants</span>
                    <span className="font-medium text-[var(--color-ink)]">{totalPlayers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-muted)]">Chain</span>
                    <span className="font-medium text-[var(--color-ink)]">{chainConfig?.chain?.name || `Chain ${betChainId}`}</span>
                  </div>
                </div>
              </div>
            )}

            {isSettled && (
              <div className="pt-2">
                <Link
                  to={`/event/${contractAddress}/oracles?chainId=${betChainId}`}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-cyan)] hover:underline rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--color-ink)] shadow-[0_4px_12px_rgba(20,20,20,0.1)]"
                >
                  Powered by Constellar
                  <span aria-hidden>→</span>
                </Link>
              </div>
            )}

            {!isSettled && (
              <div className="glow-card rounded-[28px] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Action Panel</p>

              {isConnected && !betInfo && !isBetInfoLoading && (
                <div className="mt-5 rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.05)] p-4 text-sm text-[#dc2626]">
                  Failed to load market data. Please check the contract address and network.
                </div>
              )}

              {isConnected && chainMismatch && betInfo && (
                <div className="mt-5 rounded-2xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] p-4 text-sm text-[#d97706]">
                  Your wallet is on a different network. Please switch to <span className="font-semibold">{chainConfig?.chain?.name || `chain ${betChainId}`}</span> to interact with this market.
                </div>
              )}

              {isConnected && betInfo && bettingOpen && !myPosition && txStep === 'idle' && !chainMismatch && (
                <div className="mt-5 space-y-4">
                  {isSecondBettorTurn && secondBetDirectionLabel && (
                    <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                      This is the second prediction entry. You must choose <span className="font-semibold">{secondBetDirectionLabel}</span> and contribute at least <span className="font-semibold">{formatUsdc(initiatorAmount)} USDC</span>.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSide(EventSide.Yes)}
                      disabled={isSecondBettorTurn && requiredSecondSide === EventSide.No}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${side === EventSide.Yes ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] ring-1 ring-[rgba(34,197,94,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      YES
                    </button>
                    <button
                      onClick={() => setSide(EventSide.No)}
                      disabled={isSecondBettorTurn && requiredSecondSide === EventSide.Yes}
                      className={`rounded-2xl px-4 py-4 text-sm font-semibold transition ${side === EventSide.No ? 'bg-[rgba(239,68,68,0.12)] text-[#dc2626] ring-1 ring-[rgba(239,68,68,0.4)]' : 'bg-white text-[var(--color-muted)] ring-1 ring-[rgba(20,20,20,0.08)]'} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      NO
                    </button>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Prediction Amount</label>
                    <div className="mt-2 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                      <div className="flex items-end justify-between gap-3">
                        <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-muted)]">Selected</span>
                        <span className="text-2xl font-semibold text-[var(--color-ink)]">{amount} USDC</span>
                      </div>
                      <input
                        type="range"
                        min={minSliderValue}
                        max={maxSliderValue}
                        step={1}
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
                  <button
                    onClick={handlePlaceBet}
                    disabled={placeBetBlocked}
                    className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {needsApproval ? 'Approve USDC and Join Prediction' : 'Join Prediction'}
                  </button>
                  {!hasEnoughBalance && (
                    <div className="space-y-2">
                      <p className="text-sm text-[var(--color-cyan)]">Insufficient USDC balance for this prediction amount.</p>
                      {walletChainId === 8453 && betChainId === 8453 && (
                        <button
                          type="button"
                          onClick={() => setSwapOpen(true)}
                          className="w-full rounded-full border border-[var(--color-cyan)] bg-white px-5 py-3 text-sm font-semibold text-[var(--color-cyan)] transition hover:bg-[rgba(0,0,255,0.04)]"
                        >
                          Swap to USDC
                        </button>
                      )}
                    </div>
                  )}
                  {!sliderRangeValid && <p className="text-sm text-[var(--color-cyan)]">This market currently has no valid amount range to join.</p>}
                  {isSecondBettorTurn && !secondAmountValid && (
                    <p className="text-sm text-[var(--color-cyan)]">
                      The second participant must contribute at least {formatUsdc(initiatorAmount)} USDC.
                    </p>
                  )}
                </div>
              )}

              {isConnected && myPosition && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                  <p className="text-sm text-[var(--color-ink)]">You already joined this market on the {mySide} side.</p>
                </div>
              )}

              {!isConnected && (
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
                  <p className="text-sm text-[var(--color-muted)]">Connect a wallet to join or claim from this market.</p>
                </div>
              )}

              {txStep !== 'idle' && txStep !== 'placed' && txStep !== 'claimed' && txStep !== 'error' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {txStep === 'approving' && 'Waiting for USDC approval confirmation...'}
                  {txStep === 'placing' && 'Waiting for prediction confirmation...'}
                  {txStep === 'claiming' && 'Waiting for claim confirmation...'}
                </div>
              )}

              {(txStep === 'placed' || txStep === 'claimed') && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {txStep === 'placed' ? 'Prediction joined successfully.' : 'Claim completed successfully.'}
                </div>
              )}

              {txStep === 'error' && (
                <div className="mt-5 rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4 text-sm text-[var(--color-cyan)]">
                  {errorMsg}
                </div>
              )}

              {isConnected && betInfo && !bettingOpen && !myPosition && !chainMismatch && txStep === 'idle' && (
                <div className="mt-5 rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 text-sm text-[var(--color-muted)]">
                  {betStatus === EventBetStatus.Closed
                    ? 'This market is closed and awaiting resolution.'
                    : bettingDeadline > 0 && bettingDeadline <= now
                      ? 'The betting deadline for this market has passed.'
                      : `Market status: ${eventBetStatusLabel(betStatus)}`}
                </div>
              )}
              </div>
            )}

            {isSettled && isConnected && claimableAmount != null && claimableAmount > 0n && !hasClaimed && !chainMismatch && (
              <div className="glow-card rounded-[28px] p-6 space-y-4">
                <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Claim</p>
                <div className="rounded-2xl border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-cyan)]">Claimable</p>
                  <p className="mt-3 text-2xl font-semibold">{formatUsdc(claimableAmount)} USDC</p>
                </div>
                <button
                  onClick={handleClaim}
                  className="w-full rounded-full bg-[var(--color-cyan)] px-5 py-4 text-sm font-semibold text-white"
                >
                  Claim Payout
                </button>
              </div>
            )}
          </section>
        </div>
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
        <a
          href={shareOnXUrl('Join this live prediction market.', shareUrl || window.location.href)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-[rgba(0,0,255,0.16)] bg-[rgba(0,0,255,0.05)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-cyan)] shadow-[0_4px_12px_rgba(20,20,20,0.1)]"
        >
          Post on X
        </a>
      </div>

      <SwapToUsdcModal
        isOpen={swapOpen}
        onClose={() => setSwapOpen(false)}
        requiredUsdcAmount={usdcAmount}
        currentUsdcBalance={typeof balance === 'bigint' ? balance : 0n}
        onComplete={async () => {
          await refetchBalance()
          await refetchAllowance()
          setSwapOpen(false)
        }}
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent,
  highlighted = false,
  winnerStamp,
}: {
  label: string
  value: string
  accent: 'cyan' | 'magenta' | 'green'
  highlighted?: boolean
  winnerStamp?: string
}) {
  const accentMap = {
    cyan: 'bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]',
    magenta: 'bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]',
    green: 'bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)]',
  }
  const highlightedCardMap = {
    cyan: 'border-[rgba(60,138,255,0.45)] bg-[rgba(60,138,255,0.08)] ring-2 ring-[rgba(60,138,255,0.28)]',
    magenta: 'border-[rgba(60,138,255,0.45)] bg-[rgba(60,138,255,0.08)] ring-2 ring-[rgba(60,138,255,0.28)]',
    green: 'border-[rgba(60,138,255,0.45)] bg-[rgba(60,138,255,0.08)] ring-2 ring-[rgba(60,138,255,0.28)]',
  }
  const valueClass = highlighted ? 'bg-[rgba(60,138,255,0.12)] text-[#3c8aff]' : accentMap[accent]
  const cardClass = highlighted
    ? `rounded-2xl border p-4 transition ${highlightedCardMap[accent]}`
    : 'rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4 transition'

  return (
    <div className={`relative ${cardClass}`}>
      {winnerStamp && (
        <span className="absolute right-3 bottom-3 flex h-9 w-9 rotate-[-12deg] items-center justify-center rounded-full border-[1.5px] border-[rgba(60,138,255,0.55)] bg-[rgba(60,138,255,0.08)] text-[8px] font-extrabold tracking-[0.18em] text-[#3c8aff]">
          {winnerStamp}
        </span>
      )}
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">{label}</p>
      <p className={`mt-3 text-xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}

function PositionList({
  title,
  positions,
  address,
  accent,
}: {
  title: string
  positions: Position[]
  address?: string
  accent: 'cyan' | 'magenta'
}) {
  const titleClass = accent === 'cyan' ? 'text-[var(--color-cyan)]' : 'text-[var(--color-cyan)]'
  const valueClass = accent === 'cyan' ? 'text-[var(--color-cyan)]' : 'text-[var(--color-cyan)]'
  return (
    <div className="rounded-2xl border border-[rgba(20,20,20,0.08)] bg-[rgba(255,255,255,0.8)] p-4">
      <p className={`text-xs uppercase tracking-[0.24em] ${titleClass}`}>{title}</p>
      <div className="mt-4 space-y-3">
        {positions.length === 0 && <p className="text-sm text-[var(--color-muted)]">No positions yet.</p>}
        {positions.map((p, index: number) => (
          <div key={`${title}-${index}`} className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-ink)]">
              {shortenAddress(p.player)}
              {p.player?.toLowerCase() === address?.toLowerCase() && <span className="text-[var(--color-muted)]"> (you)</span>}
            </span>
            <span className={valueClass}>{formatUsdc(p.amount)} USDC</span>
          </div>
        ))}
      </div>
    </div>
  )
}
