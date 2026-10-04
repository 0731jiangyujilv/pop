import { InfoTooltip } from '@/components/InfoTooltip'
import { LIVE_PARAMETERS } from '@/data/robinhoodLiveEvidence'

export function MechanismExplainer() {
  const p = LIVE_PARAMETERS
  return (
    <section className="rh-card" aria-labelledby="rh-mechanism-title">
      <div className="rh-card-head">
        <div>
          <p className="rh-card-title" id="rh-mechanism-title">
            Mechanism
          </p>
          <h2 className="rh-card-h">Every trade pays 1.00%</h2>
          <p className="rh-card-sub">
            0.30% base fee goes to LPs immediately. 0.70% protection fee sits in escrow until
            subsequent order flow classifies the move as reverted or sustained.
          </p>
        </div>
      </div>

      <div className="rh-flow" aria-label="OddsShift fee flow">
        <div className="rh-flow-node">Every trade</div>
        <div className="rh-flow-arrow" aria-hidden>
          ↓
        </div>
        <div className="rh-flow-node">1.00% trading fee</div>
        <div className="rh-flow-arrow" aria-hidden>
          ↓
        </div>
        <div className="rh-flow-split">
          <div className="rh-flow-branch rh-flow-branch-ok">
            <h4>
              0.30% BASE
              <span className="rh-tip">
                <InfoTooltip text="Non-refundable. Paid to LPs on every trade regardless of later repricing." />
              </span>
            </h4>
            <p>Transferred to LPs immediately.</p>
          </div>
          <div className="rh-flow-branch">
            <h4>
              0.70% PROTECTION
              <span className="rh-tip">
                <InfoTooltip text="Held in protection escrow and judged from observable market behavior after a detected jump." />
              </span>
            </h4>
            <p>Escrowed → observe subsequent repricing</p>
          </div>
        </div>
        <div className="rh-flow-arrow" aria-hidden>
          ↓
        </div>
        <div className="rh-flow-split">
          <div className="rh-flow-branch rh-flow-branch-ok">
            <h4>Reverts</h4>
            <p>Protection refunded to traders. Base fee stays with LPs.</p>
          </div>
          <div className="rh-flow-branch rh-flow-branch-bad">
            <h4>Persists</h4>
            <p>Causative protection transferred to LPs. Sub-threshold trades remain refundable.</p>
          </div>
        </div>
      </div>

      <div className="rh-params" aria-label="Live OddsShift parameters">
        <span className="rh-param">
          {p.lookbackTrades} trades lookback
          <InfoTooltip text="Detection looks back across this many consecutive trades for a jump." />
        </span>
        <span className="rh-param">
          {p.jumpThresholdPoints}-point jump
          <InfoTooltip text="A shock is marked when probability moves this many points within the lookback window." />
        </span>
        <span className="rh-param">
          {p.observeWindowTrades}-trade observation
          <InfoTooltip text="After a mark, the next window of trades decides whether the move reverts or persists." />
        </span>
        <span className="rh-param">
          {p.contributionThresholdPoints}-point contribution
          <InfoTooltip text="Only trades that move probability by at least this much can be charged as causes." />
        </span>
        <span className="rh-param">
          {p.staleCooldownSeconds}s stale timeout
          <InfoTooltip text="Permissionless resolveStale can finalize a quiet queue after this cooldown." />
        </span>
      </div>
    </section>
  )
}
