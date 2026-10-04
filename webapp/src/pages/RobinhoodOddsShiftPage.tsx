import { useParams } from 'react-router-dom'
import { SiteNav } from '@/components/SiteNav'
import { LiveAccounting } from '@/components/oddsshift/LiveAccounting'
import { LiveDeploymentHeader } from '@/components/oddsshift/LiveDeploymentHeader'
import { MechanismExplainer } from '@/components/oddsshift/MechanismExplainer'
import {
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  resolveRobinhoodMarketAddress,
} from '@/config/robinhood'
import { LIVE_MARKET, isZeroLiability } from '@/data/robinhoodLiveEvidence'
import { useRobinhoodLiveState } from '@/hooks/useRobinhoodLiveState'
import { POP_AMM_CSS } from './popAmmStyles'
import { ROBINHOOD_EVIDENCE_CSS } from './robinhoodEvidenceStyles'

/**
 * Judge-facing Robinhood OddsShift live-evidence experience.
 *
 * Read-only: no wallet-required trading, claiming, or resolve controls.
 * Historical FAIR/TOXIC narration comes from immutable evidence; counters may
 * refresh from the live contract when RPC is available.
 */
export function RobinhoodOddsShiftPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>()
  const marketAddr = resolveRobinhoodMarketAddress(
    contractAddress,
    import.meta.env.VITE_ROBINHOOD_ODDSHIFT_MARKET_ADDRESS || ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  )

  if (!marketAddr) {
    return (
      <div className="popamm">
        <style>{POP_AMM_CSS}</style>
        <style>{ROBINHOOD_EVIDENCE_CSS}</style>
        <SiteNav />
        <main className="rh-wrap">
          <section className="rh-card">
            <h1 className="rh-card-h">Robinhood market not configured</h1>
            <p className="rh-card-sub">
              No valid EventMarketV2 address is available for {LIVE_MARKET.networkName}.
            </p>
          </section>
        </main>
      </div>
    )
  }

  return <RobinhoodEvidenceExperience marketAddr={marketAddr} />
}

function RobinhoodEvidenceExperience({ marketAddr }: { marketAddr: `0x${string}` }) {
  const live = useRobinhoodLiveState(marketAddr)
  const zeroLiability =
    live.zeroLiabilityLive === true || (live.unavailable && isZeroLiability()) || isZeroLiability()

  return (
    <div className="popamm">
      <style>{POP_AMM_CSS}</style>
      <style>{ROBINHOOD_EVIDENCE_CSS}</style>
      <SiteNav />

      <main className="rh-wrap">
        <div className="rh-stack">
          <span className="rh-eyebrow">OddsShift · Robinhood live evidence</span>
          <h1 className="rh-hero">Protect LPs from sustained causative flow</h1>
          <p className="rh-lede">
            OddsShift escrows a protection fee, then uses <b>observable subsequent repricing</b> to
            decide whether that escrow is refunded or transferred to LPs. This page is the settled
            Robinhood Chain Testnet proof — no wallet required.
          </p>

          <LiveDeploymentHeader liveUnavailable={live.unavailable} zeroLiability={zeroLiability} />
          <MechanismExplainer />
          <LiveAccounting live={live} />
        </div>
      </main>
    </div>
  )
}
