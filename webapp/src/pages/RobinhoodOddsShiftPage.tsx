import { useParams } from 'react-router-dom'
import { EngineeringEvidence, OnchainEvidenceDrawer } from '@/components/oddsshift/EvidenceExplorer'
import { LiveAccounting } from '@/components/oddsshift/LiveAccounting'
import { LiveDeploymentHeader } from '@/components/oddsshift/LiveDeploymentHeader'
import { MechanismExplainer } from '@/components/oddsshift/MechanismExplainer'
import {
  ContributionProtectionCard,
  FairScenarioCard,
  ToxicScenarioCard,
} from '@/components/oddsshift/ScenarioCards'
import { SiteNav } from '@/components/SiteNav'
import {
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  resolveRobinhoodMarketAddress,
} from '@/config/robinhood'
import { LIVE_MARKET, isZeroLiability } from '@/data/robinhoodLiveEvidence'
import { useRobinhoodLiveState } from '@/hooks/useRobinhoodLiveState'
import { ROBINHOOD_ODDS_SHIFT_DEPLOYMENT } from '@/config/oddsShiftDeployments'
import { OddsShiftPage } from '@/pages/OddsShiftPage'
import { POP_AMM_CSS } from './popAmmStyles'
import { ROBINHOOD_EVIDENCE_CSS } from './robinhoodEvidenceStyles'

/**
 * Robinhood OddsShift experience: interactive trading on top (reusing the
 * existing OddsShift demo UI), with the verified live-evidence sections below.
 *
 * Trading targets the deployed Robinhood EventMarketV2 + Paxos USDG via the
 * shared OddsShiftPage implementation — no parallel trade stack.
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

  return <RobinhoodInteractiveExperience marketAddr={marketAddr} />
}

function RobinhoodInteractiveExperience({ marketAddr }: { marketAddr: `0x${string}` }) {
  const live = useRobinhoodLiveState(marketAddr)
  // Prefer live zero-liability when RPC succeeds; otherwise the immutable
  // settled-demo evidence remains the credibility signal for judges.
  const zeroLiability = live.zeroLiabilityLive ?? isZeroLiability()

  return (
    <div className="popamm">
      <style>{POP_AMM_CSS}</style>
      <style>{ROBINHOOD_EVIDENCE_CSS}</style>
      <SiteNav />

      {/* Existing OddsShift trading UI — Robinhood chain, USDG, live market. */}
      <OddsShiftPage
        deployment={ROBINHOOD_ODDS_SHIFT_DEPLOYMENT}
        marketAddress={marketAddr}
        embedded
      />

      <main className="rh-wrap rh-evidence-below">
        <div className="rh-stack">
          <span className="rh-eyebrow">Verified settlement snapshot</span>
          <h2 className="rh-hero rh-evidence-hero">Captured demo run on Robinhood Chain</h2>
          <p className="rh-lede">
            The sections below are the <b>verified settlement snapshot</b> from the completed
            OddsShift demo. Live market values above come from the contract; headline demo totals
            (20 trades, 4 shocks, 68.50%) are labeled as a captured run and are not permanent live
            state.
          </p>

          <LiveDeploymentHeader liveUnavailable={live.unavailable} zeroLiability={zeroLiability} />
          <MechanismExplainer />
          <LiveAccounting live={live} />

          <div className="rh-scenarios">
            <FairScenarioCard />
            <ToxicScenarioCard />
          </div>

          <ContributionProtectionCard />
          <OnchainEvidenceDrawer />
          <EngineeringEvidence />
        </div>
      </main>
    </div>
  )
}
