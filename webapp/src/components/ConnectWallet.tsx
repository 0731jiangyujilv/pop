import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { shortenAddress } from '@/lib/utils'
import { isSupportedChain, SUPPORTED_CHAINS, SUPPORTED_CHAIN_LIST } from '@/config/chains'
import { useAuth } from '@/hooks/useAuth'

// Per-chain logo, keyed by chainId. Chains without one fall back to a colored initial.
const CHAIN_LOGOS: Record<number, string> = {
  5042002: '/icons/arc.svg',
  84532: '/icons/base.svg',
  97: '/icons/bnb.svg',
}

function ChainBadge({ chainId, name, size = 'md' }: { chainId: number; name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const logo = CHAIN_LOGOS[chainId]

  if (logo) {
    return <img src={logo} alt={name} className={`${dim} shrink-0 rounded-full`} />
  }

  return (
    <span className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full bg-[rgba(20,20,20,0.08)] font-bold text-[var(--color-ink)] ${size === 'sm' ? 'text-[10px]' : 'text-[11px]'}`}>
      {name.charAt(0)}
    </span>
  )
}

function getConnectorLogoMeta(name: string) {
  const normalized = name.toLowerCase()

  if (normalized.includes('metamask')) {
    return { label: '\u{1F98A}', className: 'bg-[rgba(241,135,0,0.14)] text-[#f18700]' }
  }

  if (normalized.includes('coinbase')) {
    return { label: 'C', className: 'bg-[rgba(0,82,255,0.14)] text-[#FF335F]' }
  }

  if (normalized.includes('walletconnect')) {
    return { label: 'W', className: 'bg-[rgba(59,130,246,0.14)] text-[#2563eb]' }
  }

  if (normalized.includes('injected')) {
    return { label: 'I', className: 'bg-[rgba(20,20,20,0.08)] text-[var(--color-ink)]' }
  }

  return { label: name.charAt(0).toUpperCase() || '?', className: 'bg-[rgba(20,20,20,0.08)] text-[var(--color-ink)]' }
}

// Full account details shown inside the popover / drawer: full address, network
// switcher, sign-in status, portfolio link and disconnect.
function AccountPanel({ address, onNavigate }: { address: `0x${string}`; onNavigate?: () => void }) {
  const [copied, setCopied] = useState(false)
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { isAuthenticated, isSigningIn, signIn, signOut } = useAuth()

  const isWrongNetwork = !isSupportedChain(chainId)
  const currentChain = SUPPORTED_CHAINS[chainId]

  const copyAddress = () => {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Account header */}
      <div className="flex items-center gap-3">
        <ChainBadge chainId={chainId} name={currentChain ? currentChain.chain.name : `#${chainId}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
            {shortenAddress(address).toLocaleLowerCase()}
          </p>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {currentChain ? currentChain.chain.name : `Chain ${chainId}`}
          </p>
        </div>
        <button
          onClick={copyAddress}
          className="rounded-full border border-[rgba(20,20,20,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-cyan)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Sign-in status */}
      {!isAuthenticated && !isWrongNetwork && (
        <button
          onClick={signIn}
          disabled={isSigningIn}
          className="w-full rounded-full bg-[var(--color-cyan)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isSigningIn ? 'Signing...' : 'Sign In'}
        </button>
      )}
      {isAuthenticated && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[rgba(0,200,83,0.1)] px-3 py-1.5 text-xs font-medium text-[#00c853]">
          Signed In
        </span>
      )}

      {/* Portfolio link (moved out of the top nav) */}
      <Link
        to="/portfolio"
        onClick={onNavigate}
        className="flex items-center justify-between rounded-xl border border-[rgba(20,20,20,0.1)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[rgba(0,0,255,0.28)] hover:text-[var(--color-cyan)]"
      >
        View portfolio <span aria-hidden>→</span>
      </Link>

      {/* Network switcher */}
      <div>
        <p className="mb-1.5 px-1 text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
          {isWrongNetwork ? 'Unsupported network — switch' : 'Network'}
        </p>
        <div className="space-y-1">
          {SUPPORTED_CHAIN_LIST.map((cfg) => (
            <button
              key={cfg.chain.id}
              onClick={() => switchChain({ chainId: cfg.chain.id })}
              disabled={isSwitching || cfg.chain.id === chainId}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                cfg.chain.id === chainId
                  ? 'bg-[rgba(0,0,255,0.06)] font-medium text-[var(--color-cyan)]'
                  : 'text-[var(--color-ink)] hover:bg-[rgba(0,0,255,0.04)]'
              }`}
            >
              <ChainBadge chainId={cfg.chain.id} name={cfg.chain.name} size="sm" />
              <span>{cfg.chain.name}</span>
              {cfg.isTestnet && (
                <span className="ml-auto rounded-full bg-[rgba(255,165,0,0.1)] px-1.5 py-0.5 text-[10px] text-[var(--color-orange)]">
                  testnet
                </span>
              )}
              {cfg.chain.id === chainId && (
                <span className={`text-xs text-[var(--color-cyan)] ${cfg.isTestnet ? 'ml-1.5' : 'ml-auto'}`}>&#10003;</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          signOut()
          disconnect()
          onNavigate?.()
        }}
        className="w-full rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[rgba(0,0,255,0.28)] hover:text-[var(--color-cyan)]"
      >
        Disconnect
      </button>
    </div>
  )
}

export function ConnectWallet({ variant = 'bar' }: { variant?: 'bar' | 'drawer' }) {
  const [isChooserOpen, setIsChooserOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const chainId = useChainId()
  const { isAuthenticated } = useAuth()

  const isWrongNetwork = isConnected && !isSupportedChain(chainId)
  const currentChain = SUPPORTED_CHAINS[chainId]

  if (isConnected && address) {
    // In the mobile drawer the panel renders inline (no floating popover).
    if (variant === 'drawer') {
      return <AccountPanel address={address} onNavigate={() => setIsAccountOpen(false)} />
    }

    return (
      <div className="relative">
        {/* Compact chip: chain icon + shortened address (Uniswap-style) */}
        <button
          onClick={() => setIsAccountOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition ${
            isWrongNetwork
              ? 'border-[rgba(255,100,0,0.3)] bg-[rgba(255,100,0,0.08)] text-[var(--color-orange)]'
              : 'border-[rgba(0,0,255,0.14)] bg-[rgba(0,0,255,0.05)] text-[var(--color-cyan)] hover:border-[rgba(0,0,255,0.28)]'
          }`}
        >
          <ChainBadge chainId={chainId} name={currentChain ? currentChain.chain.name : `#${chainId}`} />
          <span>{shortenAddress(address).toLocaleLowerCase()}</span>
          {isAuthenticated && !isWrongNetwork && (
            <span className="h-2 w-2 rounded-full bg-[#00c853]" title="Signed in" />
          )}
        </button>

        {isAccountOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsAccountOpen(false)} />
            <div className="absolute right-0 top-full z-40 mt-3 w-80 rounded-2xl border border-[rgba(20,20,20,0.1)] bg-white p-4 shadow-[0_18px_44px_rgba(20,20,20,0.14)]">
              <AccountPanel address={address} onNavigate={() => setIsAccountOpen(false)} />
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-3">
      <button
        onClick={() => setIsChooserOpen(true)}
        disabled={isPending || connectors.length === 0}
        className="rounded-full border border-[rgba(0,0,255,0.18)] bg-[rgba(0,0,255,0.06)] px-5 py-3 text-sm font-semibold text-[var(--color-cyan)] transition hover:bg-[rgba(0,0,255,0.1)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? 'Connecting...' : 'Connect Wallet'}
      </button>

      {isChooserOpen && (
        <div className="absolute right-0 top-full z-30 mt-3 w-72 rounded-2xl border border-[rgba(20,20,20,0.1)] bg-white p-3 shadow-[0_18px_44px_rgba(20,20,20,0.14)]">
          <p className="px-2 py-1 text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Choose wallet</p>
          <div className="mt-1 space-y-2">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector })
                  setIsChooserOpen(false)
                }}
                disabled={isPending}
                className="w-full rounded-xl border border-[rgba(20,20,20,0.1)] bg-white px-4 py-3 text-left text-sm font-medium text-[var(--color-ink)] transition hover:border-[rgba(0,0,255,0.28)] hover:text-[var(--color-cyan)] disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${getConnectorLogoMeta(connector.name).className}`}
                  >
                    {getConnectorLogoMeta(connector.name).label}
                  </span>
                  <span>{connector.name}</span>
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsChooserOpen(false)}
            className="mt-3 w-full rounded-xl bg-[rgba(0,0,255,0.06)] px-4 py-2 text-sm font-medium text-[var(--color-cyan)] transition hover:bg-[rgba(0,0,255,0.1)]"
          >
            Cancel
          </button>
        </div>
      )}

      {connectors.length === 0 && (
        <button
          disabled
          className="rounded-full border border-[rgba(20,20,20,0.14)] bg-white px-5 py-3 text-sm text-[var(--color-muted)]"
        >
          No wallet connectors available
        </button>
      )}
    </div>
  )
}
