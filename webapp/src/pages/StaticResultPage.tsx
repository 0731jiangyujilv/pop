import { Link, useParams } from 'react-router-dom'
import { SiteNav } from '@/components/SiteNav'
import { getChainConfig, getChainIdBySlug } from '@/config/chains'
import { shareOnXUrl } from '@/lib/utils'
import { POP_AMM_CSS } from './popAmmStyles'
import { wcMatchBySlug, wcQuestion, WC_CHAIN_SLUG } from '@/data/worldCup2026'

export function StaticResultPage() {
  const { slug } = useParams<{ slug: string }>()
  const match = slug ? wcMatchBySlug(slug) : undefined

  const chainId = getChainIdBySlug(WC_CHAIN_SLUG) ?? 0
  const explorerUrl = getChainConfig(chainId)?.explorerUrl || 'https://testnet.arcscan.app'

  if (!match || !match.result) {
    return (
      <div className="popamm">
        <style>{POP_AMM_CSS}</style>
        <SiteNav />
        <main className="pp-wrap">
          <section className="pp-card">
            <div className="pp-market">
              <div className="pp-title">Result not found</div>
              <p className="pp-label" style={{ marginTop: 10, lineHeight: 1.5 }}>
                No finished match matches this link.
              </p>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const { home, away, result } = match
  const question = wcQuestion(match)

  const yesPct = result.isDraw ? 50 : result.yesWins ? 100 : 0
  const noPct = 100 - yesPct

  const outcomeLabel = result.isDraw ? 'Draw' : result.yesWins ? 'YES wins' : 'NO wins'
  const lockLabel = `${result.homeScore}–${result.awayScore} · ${outcomeLabel}`

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <div className="popamm">
      <style>{POP_AMM_CSS}</style>
      <SiteNav />
      <main className="pp-wrap">
        <div className="pp-stack">
          <h1 className="pp-hero">{question}</h1>

          <section className="pp-card">
            <div className="pp-cardhead">
              <div className="pp-lock">{lockLabel}</div>
              <div className="pp-odds">
                <span className="pp-yesText">YES {yesPct}%</span>
                <div className="pp-bar"><div className="pp-yesbar" style={{ width: `${yesPct}%` }} /></div>
                <span className="pp-noText">NO {noPct}%</span>
              </div>
            </div>

            <div className="pp-body">
              <StaticClaimRow
                label="YES tokens"
                sub={`${home.flag} ${home.name}${result.yesWins ? ' — winning side' : ''}`}
                coinClass="pp-yesCoin"
              />
              <StaticClaimRow
                label="NO tokens"
                sub={`${away.flag} ${away.name} / draw${!result.yesWins ? ' — winning side' : ''}`}
                coinClass="pp-noCoin"
              />
              <StaticClaimRow label="LP payout" sub="No LP shares" coinClass="pp-lpCoin" />
              <div className="pp-note pp-note-muted" style={{ marginTop: 6 }}>
                Settled from the official FIFA full-time result. Connect a wallet to claim winnings.
              </div>
            </div>

            <div className="pp-foot">
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer">View on Scan</a>
              <span style={{ color: 'var(--pp-line)' }}>·</span>
              <Link to={`/result/${slug}/lp`}>LP</Link>
              <span style={{ color: 'var(--pp-line)' }}>·</span>
              <a
                href={shareOnXUrl(
                  `${home.name} ${result.homeScore}-${result.awayScore} ${away.name} — settled on POP.`,
                  shareUrl,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share on X
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function StaticClaimRow({ label, sub, coinClass }: { label: string; sub: string; coinClass: string }) {
  return (
    <div className="pp-claimrow">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className={`pp-coin ${coinClass}`} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 850 }}>{label}</div>
          <div className="pp-label">{sub}</div>
        </div>
      </div>
      <button className="pp-mini" disabled>Claim</button>
    </div>
  )
}
