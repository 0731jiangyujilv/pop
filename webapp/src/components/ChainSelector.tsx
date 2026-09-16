import { useState } from 'react'
import { useChainId, useSwitchChain } from 'wagmi'
import { SUPPORTED_CHAINS, isSupportedChain } from '@/config/chains'

const CHAIN_COLORS: Record<number, string> = {
  84532: 'bg-[rgba(0,82,255,0.12)] text-[#FF335F]',
  8453: 'bg-[rgba(0,82,255,0.12)] text-[#FF335F]',
}

export function ChainSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()

  const currentChain = SUPPORTED_CHAINS[chainId]
  const isSupported = isSupportedChain(chainId)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
          isSupported
            ? 'border-[rgba(0,0,255,0.14)] bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)] hover:border-[rgba(0,0,255,0.28)]'
            : 'border-[rgba(255,100,0,0.3)] bg-[rgba(255,100,0,0.08)] text-[var(--color-orange)]'
        }`}
      >
        {isPending ? 'Switching...' : currentChain ? currentChain.chain.name : `Chain ${chainId}`}
        <span className="ml-1.5">&#9662;</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-2xl border border-[rgba(20,20,20,0.1)] bg-white p-2 shadow-[0_12px_32px_rgba(20,20,20,0.12)]">
            <p className="px-2 py-1 text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Switch network
            </p>
            {Object.values(SUPPORTED_CHAINS).map((cfg) => (
              <button
                key={cfg.chain.id}
                onClick={() => {
                  switchChain({ chainId: cfg.chain.id })
                  setIsOpen(false)
                }}
                disabled={isPending || cfg.chain.id === chainId}
                className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  cfg.chain.id === chainId
                    ? 'bg-[rgba(0,0,255,0.06)] font-medium text-[var(--color-cyan)]'
                    : 'text-[var(--color-ink)] hover:bg-[rgba(0,0,255,0.04)]'
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    CHAIN_COLORS[cfg.chain.id] || 'bg-[rgba(20,20,20,0.08)] text-[var(--color-ink)]'
                  }`}
                >
                  {cfg.chain.name.charAt(0)}
                </span>
                <span>{cfg.chain.name}</span>
                {cfg.isTestnet && (
                  <span className="ml-auto rounded-full bg-[rgba(255,165,0,0.1)] px-1.5 py-0.5 text-[10px] text-[var(--color-orange)]">
                    testnet
                  </span>
                )}
                {cfg.chain.id === chainId && (
                  <span className="ml-auto text-xs text-[var(--color-cyan)]">&#10003;</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
