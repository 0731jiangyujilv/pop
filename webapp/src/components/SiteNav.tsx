import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { ConnectWallet } from '@/components/ConnectWallet'

type NavItem = { label: string; to?: string; href?: string }

// Single source of truth for the primary navigation, shared between the desktop
// inline bar and the mobile bottom-sheet drawer.
// Portfolio lives inside the wallet account popover (see ConnectWallet), not here.
const NAV_ITEMS: NavItem[] = [
  // { label: 'Trade', to: '/' },
  // { label: 'FIFA 2026', to: '/' },
  { label: 'Crypto', to: '/crypto' },
  { label: 'Fed', to: '/fed' },
  { label: 'Midterms', to: '/midterm' },
  // { label: 'Pool Odds', to: '/champion-history' },
  { label: 'NFL 2026', to: '/nfl' },
  { label: 'Docs', href: 'https://docs.populab.xyz/' },
]

const DRAWER_CSS = `
@keyframes sn-slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes sn-fade{from{opacity:0}to{opacity:1}}
`

function isActive(item: NavItem, pathname: string) {
  if (!item.to) return false
  if (item.to === '/') return pathname === '/' || pathname.startsWith('/fifa')
  return pathname.startsWith(item.to)
}

function NavLink({ item, pathname, onNavigate, drawer }: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
  drawer?: boolean
}) {
  const active = isActive(item, pathname)
  const external = Boolean(item.href)
  const base = drawer
    ? `flex items-center justify-between border-b border-[rgba(20,20,20,0.05)] py-4 text-lg font-semibold ${active ? 'text-[var(--color-cyan)]' : external ? 'text-[var(--color-muted)]' : 'text-[var(--color-ink)]'}`
    : `inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${active ? 'bg-[rgba(0,82,255,0.06)] text-[var(--color-cyan)]' : external ? 'border border-[rgba(20,20,20,0.08)] bg-white/70 text-[var(--color-muted)] hover:border-[rgba(20,20,20,0.16)] hover:text-[var(--color-ink)]' : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'}`

  if (item.to) {
    return <Link to={item.to} className={base} onClick={onNavigate}>{item.label}{drawer && <span aria-hidden>›</span>}</Link>
  }
  return (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={base} onClick={onNavigate}>
      <span>{item.label}</span>
      <ExternalLink aria-hidden className={drawer ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2.2} />
    </a>
  )
}

export function SiteNav() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  return (
    <header className="relative z-20 flex w-full items-center justify-between gap-4 px-6 py-5 md:px-10">
      <style>{DRAWER_CSS}</style>

      <div className="flex items-center gap-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.label} item={item} pathname={pathname} />
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:block">
          <ConnectWallet />
        </div>
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="flex h-11 w-11 flex-col items-center justify-center gap-[5px] rounded-xl border border-[rgba(20,20,20,0.12)] bg-white md:hidden"
        >
          <span className="h-0.5 w-5 rounded bg-[var(--color-ink)]" />
          <span className="h-0.5 w-5 rounded bg-[var(--color-ink)]" />
          <span className="h-0.5 w-5 rounded bg-[var(--color-ink)]" />
        </button>
      </div>

      {/* Mobile bottom-sheet drawer */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[rgba(20,20,20,0.35)] md:hidden"
          style={{ animation: 'sn-fade .15s ease' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full rounded-t-[24px] bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-20px_60px_rgba(20,20,20,0.18)]"
            style={{ animation: 'sn-slideup .22s ease' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3.5 mt-1.5 h-[5px] w-10 rounded-full bg-[rgba(20,20,20,0.16)]" />
            <p className="mx-0.5 my-2 text-[13px] font-semibold text-[var(--color-muted)]">Menu</p>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.label} item={item} pathname={pathname} drawer onNavigate={() => setOpen(false)} />
            ))}
            <div className="mt-5">
              <ConnectWallet variant="drawer" />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
