import { Link } from 'react-router-dom'
import { SUPPORTED_CHAINS } from '@/config/chains'
import { formatDuration } from '@/lib/utils'

export interface ExploreMarket {
  uuid: string
  chainId: number
  tweetId: string
  contractAddress: string | null
  creatorUsername: string | null
  creatorTgId: string
  status: 'PROPOSED' | 'OPEN' | 'LOCKED' | 'SETTLED' | 'CANCELLED' | 'EXPIRED'
  type: 'PRICE_BET' | 'EVENT_BET'
  asset: string
  duration: number
  question: string | null
  endTime: string | null
  createdAt: string | null
  totalUp: string
  totalDown: string
  totalYes: string
  totalNo: string
}

const FALLBACK_AVATAR =
  'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png'

function avatarUrl(username: string | null): string {
  if (!username) return FALLBACK_AVATAR
  return `https://unavatar.io/twitter/${encodeURIComponent(username)}?fallback=${encodeURIComponent(FALLBACK_AVATAR)}`
}

function marketHref(market: ExploreMarket): string {
  if (!market.contractAddress) {
    return `https://x.com/i/status/${market.tweetId}`
  }
  const base = market.type === 'EVENT_BET' ? '/event' : '/bet'
  return `${base}/${market.contractAddress}?chainId=${market.chainId}`
}

function PoolBar({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const total = a + b
  const aPct = total > 0 ? Math.round((a / total) * 100) : 50
  return (
    <div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#d5d5d5]">
        <div className="h-full rounded-full bg-[var(--color-cyan)]" style={{ width: `${aPct}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-muted)]">
        <span><span className="text-[var(--color-ink)]">{aPct}%</span> {labelA}</span>
        <span><span className="text-[var(--color-ink)]">{100 - aPct}%</span> {labelB}</span>
      </div>
    </div>
  )
}

export function ExploreMarketCard({ market }: { market: ExploreMarket }) {
  const chainName = SUPPORTED_CHAINS[market.chainId]?.chain.name ?? `Chain ${market.chainId}`
  const displayName = market.creatorUsername ?? 'anon'
  const isEvent = market.type === 'EVENT_BET'
  const isExternal = !market.contractAddress
  const href = marketHref(market)

  const up = parseFloat(market.totalUp || '0')
  const down = parseFloat(market.totalDown || '0')
  const yes = parseFloat(market.totalYes || '0')
  const no = parseFloat(market.totalNo || '0')
  const pool = isEvent ? yes + no : up + down

  const content = (
    <article className="flex h-full flex-col rounded-[28px] border border-[rgba(20,20,20,0.12)] bg-[#efefe9] p-6 transition hover:border-[rgba(0,82,255,0.35)] hover:bg-[#f3f3ed]">
      <header className="flex items-center gap-3">
        <img
          src={avatarUrl(market.creatorUsername)}
          alt={`${displayName} avatar`}
          className="h-12 w-12 flex-shrink-0 rounded-full bg-[rgba(0,82,255,0.12)] object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget
            if (img.src !== FALLBACK_AVATAR) img.src = FALLBACK_AVATAR
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-none tracking-[-0.01em]">@{displayName}</p>
          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
            {chainName} · {market.status}
          </p>
        </div>
      </header>

      <p className="mt-5 line-clamp-4 text-lg leading-snug tracking-[-0.01em]">
        {isEvent
          ? market.question ?? `${market.asset} event bet`
          : `${market.asset} price call · ${formatDuration(market.duration)}`}
      </p>

      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between text-sm text-[var(--color-muted)]">
          <span>
            <span className="text-[var(--color-ink)]">${pool.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> pooled
          </span>
          {market.endTime && (
            <span>Closes {new Date(market.endTime).toLocaleDateString()}</span>
          )}
        </div>
        {isEvent
          ? <PoolBar a={yes} b={no} labelA="Yes" labelB="No" />
          : <PoolBar a={up} b={down} labelA="Up" labelB="Down" />}
      </div>
    </article>
  )

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="group block h-full">
        {content}
      </a>
    )
  }

  return (
    <Link to={href} className="group block h-full">
      {content}
    </Link>
  )
}
