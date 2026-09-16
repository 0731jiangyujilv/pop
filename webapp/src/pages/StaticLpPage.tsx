import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SiteNav } from '@/components/SiteNav'
import { POP_AMM_CSS } from './popAmmStyles'
import { wcMatchBySlug, wcQuestion } from '@/data/worldCup2026'

type LpMode = 'ADD' | 'REMOVE'

export function StaticLpPage() {
  const { slug } = useParams<{ slug: string }>()
  const match = slug ? wcMatchBySlug(slug) : undefined
  const [lpMode, setLpMode] = useState<LpMode>('ADD')

  if (!match || !match.result) {
    return (
      <div className="popamm">
        <style>{POP_AMM_CSS}</style>
        <SiteNav />
        <main className="pp-wrap">
          <section className="pp-card">
            <div className="pp-market">
              <div className="pp-title">Result not found</div>
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
  const lockLabel = `${result.homeScore}–${result.awayScore} · ${result.isDraw ? 'Draw' : result.yesWins ? 'YES wins' : 'NO wins'}`

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
              <div className="pp-switch">
                <button className={`pp-pill ${lpMode === 'ADD' ? 'pp-active' : ''}`} onClick={() => setLpMode('ADD')}>Add</button>
                <button className={`pp-pill ${lpMode === 'REMOVE' ? 'pp-active' : ''}`} onClick={() => setLpMode('REMOVE')}>Remove</button>
              </div>

              {lpMode === 'ADD' ? (
                <>
                  <div className="pp-box">
                    <div className="pp-label">Deposit</div>
                    <div className="pp-amount">
                      <input className="pp-input" type="number" value="" disabled placeholder="0" onChange={() => {}} />
                      <div className="pp-token"><span className="pp-coin" />USDC</div>
                    </div>
                  </div>
                  <div className="pp-arrow">↓</div>
                  <div className="pp-box">
                    <div className="pp-label">Receive</div>
                    <div className="pp-amount">
                      <div className="pp-out">0</div>
                      <div className="pp-token"><span className="pp-coin pp-lpCoin" />LP</div>
                    </div>
                  </div>
                  <div className="pp-meta">
                    <span>Pool {home.name} / {away.name}</span>
                    <span>Share 0.00%</span>
                  </div>
                  <div className="pp-note pp-note-muted">Adding liquidity is disabled after kickoff.</div>
                  <button className="pp-cta" disabled>Add LP</button>
                </>
              ) : (
                <>
                  <div className="pp-box">
                    <div className="pp-label">Burn</div>
                    <div className="pp-amount">
                      <input className="pp-input" type="text" value="" disabled placeholder="0" onChange={() => {}} />
                      <div className="pp-token"><span className="pp-coin pp-lpCoin" />LP</div>
                    </div>
                    <button className="pp-maxbtn pp-lp-maxbtn" disabled>Max 0</button>
                  </div>
                  <div className="pp-arrow">↓</div>
                  <div className="pp-box">
                    <div className="pp-label">Withdraw</div>
                    <div className="pp-amount">
                      <div className="pp-out">0.00</div>
                      <div className="pp-token"><span className="pp-coin" />USDC</div>
                    </div>
                  </div>
                  <button className="pp-cta" disabled>Remove LP</button>
                </>
              )}
            </div>

            <div className="pp-foot">
              <Link to={`/result/${slug}`}>← Back</Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
