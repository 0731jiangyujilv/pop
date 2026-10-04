import type { ReactNode } from 'react'
import { ProbPath, ProbSparkline } from '@/components/oddsshift/ProbSparkline'
import { robinhoodTxUrl } from '@/config/robinhood'
import {
  FAIR_MARKERS,
  FAIR_PROBABILITY_PATH,
  FAIR_TXS,
  LIVE_PARAMETERS,
  SETTLEMENT_TXS,
  TOXIC_MARKERS,
  TOXIC_PROBABILITY_PATH,
  TOXIC_TXS,
} from '@/data/robinhoodLiveEvidence'

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="rh-btn" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export function FairScenarioCard() {
  return (
    <section className="rh-card rh-scenario rh-scenario-fair" aria-labelledby="rh-fair-title">
      <div>
        <p className="rh-card-title" id="rh-fair-title">
          FAIR scenario
        </p>
        <h2 className="rh-card-h">FAIR — Transient repricing</h2>
      </div>

      <ProbPath path={FAIR_PROBABILITY_PATH.slice(0, 6)} markAt={57} markClass="rh-path-step-mark" />
      <div className="rh-marker rh-marker-shock">At 57.00 · SHOCK DETECTED</div>

      <ProbPath
        path={[FAIR_PROBABILITY_PATH[5], FAIR_PROBABILITY_PATH[6]]}
        markAt={49.99}
        markClass="rh-path-step-ok"
      />
      <div className="rh-marker rh-marker-ok">At 49.99 · REVERTED</div>

      <ProbSparkline
        path={FAIR_PROBABILITY_PATH}
        markers={FAIR_MARKERS}
        tone="fair"
        label="FAIR probability path from 50% to shock and reversion"
      />

      <span className="rh-outcome rh-outcome-ok">Protection refunded</span>
      <p>
        The price moved enough to trigger the protection window, but subsequent flow returned the
        market toward its original anchor. The base fee stayed with LPs, while the protection
        portion was returned.
      </p>

      <div className="rh-actions">
        <ExtLink href={robinhoodTxUrl(FAIR_TXS.shock)}>View Shock Tx ↗</ExtLink>
        <ExtLink href={robinhoodTxUrl(FAIR_TXS.correction)}>View Correction Tx ↗</ExtLink>
        <ExtLink href={robinhoodTxUrl(FAIR_TXS.initialRebate)}>View Rebate Tx ↗</ExtLink>
      </div>
    </section>
  )
}

export function ToxicScenarioCard() {
  return (
    <section className="rh-card rh-scenario rh-scenario-toxic" aria-labelledby="rh-toxic-title">
      <div>
        <p className="rh-card-title" id="rh-toxic-title">
          TOXIC scenario
        </p>
        <h2 className="rh-card-h">TOXIC — Sustained causative repricing</h2>
      </div>

      <ProbPath
        path={TOXIC_PROBABILITY_PATH}
        markAt={68.5}
        markClass="rh-path-step-bad"
      />
      <div className="rh-marker rh-marker-bad">Displacement held · SUSTAINED REPRICING</div>

      <ProbSparkline
        path={TOXIC_PROBABILITY_PATH}
        markers={TOXIC_MARKERS}
        tone="toxic"
        label="TOXIC probability path from 53.5% to 68.5%"
      />

      <span className="rh-outcome rh-outcome-bad">Causative protection → LPs</span>
      <p>
        The repricing did not return toward the anchor during the observation window. Trades that
        materially contributed to the persistent move forfeited their protection escrow to LPs.
      </p>

      <div className="rh-actions">
        <ExtLink href={robinhoodTxUrl(TOXIC_TXS.finalToxic)}>View Final Toxic Tx ↗</ExtLink>
        <ExtLink href={robinhoodTxUrl(SETTLEMENT_TXS.resolveStale)}>View Resolution Tx ↗</ExtLink>
        <ExtLink href={robinhoodTxUrl(SETTLEMENT_TXS.lpRewardClaim)}>View LP Payout ↗</ExtLink>
      </div>
    </section>
  )
}

export function ContributionProtectionCard() {
  const threshold = LIVE_PARAMETERS.contributionThresholdPoints
  return (
    <section className="rh-card" aria-labelledby="rh-contrib-title">
      <div className="rh-card-head">
        <div>
          <p className="rh-card-title" id="rh-contrib-title">
            Contribution protection
          </p>
          <h2 className="rh-card-h">Not a naive volatility tax</h2>
          <p className="rh-card-sub">
            Four small FAIR tail trades were still pending when the later toxic repricing began.
            They were not blindly charged. Their individual contribution stayed below the{' '}
            {threshold}-point threshold, so they were refunded as non-causes while larger
            directional moves were charged.
          </p>
        </div>
      </div>

      <div className="rh-contrib">
        <div className="rh-contrib-flows">
          <div className="rh-contrib-col rh-flow-branch-ok">
            <h3 className="rh-card-h" style={{ fontSize: 15 }}>
              Small move &lt; {threshold} point
            </h3>
            <ol>
              <li>
                <span className="rh-step">Non-cause</span>
                <span className="rh-step-sub">Below contribution threshold</span>
              </li>
              <li>
                <span className="rh-step">→</span>
              </li>
              <li>
                <span className="rh-step" style={{ color: 'var(--pp-yes)' }}>
                  Refunded
                </span>
                <span className="rh-step-sub">Even if a later shock persists</span>
              </li>
            </ol>
          </div>
          <div className="rh-contrib-col rh-flow-branch-bad">
            <h3 className="rh-card-h" style={{ fontSize: 15 }}>
              Large causative move &gt; {threshold} point
            </h3>
            <ol>
              <li>
                <span className="rh-step">Cause</span>
                <span className="rh-step-sub">Material contribution to the jump</span>
              </li>
              <li>
                <span className="rh-step">→</span>
              </li>
              <li>
                <span className="rh-step" style={{ color: 'var(--pp-no)' }}>
                  Charged if shock persists
                </span>
                <span className="rh-step-sub">Protection escrow → LPs</span>
              </li>
            </ol>
          </div>
        </div>
        <p className="rh-note" style={{ margin: 0 }}>
          This cross-window live result shows OddsShift evaluates contribution rather than merely
          proximity to volatility. Do not present the flow as if FAIR had been fully drained before
          TOXIC — the small pending FAIR tails remained in the queue and were classified
          independently.
        </p>
      </div>
    </section>
  )
}
