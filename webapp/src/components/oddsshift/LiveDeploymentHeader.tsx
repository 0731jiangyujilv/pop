import { useState } from 'react'
import {
  ROBINHOOD_SOURCIFY_VERIFICATION_ID,
  robinhoodAddressUrl,
  shortHash,
  sourcifyLookupUrl,
} from '@/config/robinhood'
import { LIVE_MARKET, LIVE_VERIFICATION } from '@/data/robinhoodLiveEvidence'

export function LiveDeploymentHeader({
  liveUnavailable,
  zeroLiability,
}: {
  liveUnavailable: boolean
  zeroLiability: boolean
}) {
  const [copied, setCopied] = useState(false)
  const marketUrl = robinhoodAddressUrl(LIVE_MARKET.marketAddress)
  const verifyUrl = sourcifyLookupUrl()

  async function copyVerificationId() {
    try {
      await navigator.clipboard.writeText(ROBINHOOD_SOURCIFY_VERIFICATION_ID)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="rh-card rh-header" aria-labelledby="rh-deploy-title">
      <div className="rh-badges" aria-label="Deployment badges">
        <span className="rh-badge rh-badge-live">LIVE</span>
        <span className="rh-badge rh-badge-net">ROBINHOOD TESTNET</span>
        <span className="rh-badge rh-badge-token">USDG</span>
        <span className="rh-badge rh-badge-verify">EXACT MATCH</span>
      </div>

      <div>
        <p className="rh-card-title" id="rh-deploy-title">
          Live on Robinhood Chain Testnet
        </p>
        <h2 className="rh-card-h">{LIVE_MARKET.question}</h2>
        <p className="rh-card-sub">
          OddsShift observes subsequent repricing after a jump — it does not claim to detect
          insider trading or know whether a trader holds private information.
        </p>
      </div>

      {zeroLiability ? (
        <div className="rh-status-ok" role="status">
          Captured demo run · verified settlement snapshot · zero pending liabilities
        </div>
      ) : liveUnavailable ? (
        <div className="rh-status-warn" role="status">
          Live RPC temporarily unavailable — verified settlement snapshot retained below
        </div>
      ) : (
        <div className="rh-status-warn" role="status">
          Live liabilities still open — compare against the captured demo run carefully
        </div>
      )}

      <div className="rh-meta">
        <div className="rh-meta-row">
          <span className="rh-meta-k">Network</span>
          <span className="rh-meta-v">
            {LIVE_MARKET.networkName} · chain {LIVE_MARKET.chainId}
          </span>
        </div>
        <div className="rh-meta-row">
          <span className="rh-meta-k">Collateral</span>
          <span className="rh-meta-v">{LIVE_MARKET.collateralName}</span>
        </div>
        <div className="rh-meta-row">
          <span className="rh-meta-k">EventMarketV2</span>
          <span className="rh-meta-v rh-mono">{LIVE_MARKET.marketAddress}</span>
        </div>
        <div className="rh-meta-row">
          <span className="rh-meta-k">Verification</span>
          <span className="rh-meta-v">
            Sourcify exact creation + runtime match
            <button
              type="button"
              className="rh-btn rh-copy"
              style={{ marginLeft: 8, padding: '4px 10px', fontSize: 11 }}
              onClick={() => void copyVerificationId()}
              aria-label="Copy Sourcify verification ID"
            >
              {copied ? 'Copied' : shortHash(LIVE_VERIFICATION.sourcifyVerificationId, 8, 4)}
            </button>
          </span>
        </div>
      </div>

      <div className="rh-actions">
        <a
          className="rh-btn rh-btn-primary"
          href={marketUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View Contract ↗
        </a>
        <a className="rh-btn" href={verifyUrl} target="_blank" rel="noopener noreferrer">
          View Verification ↗
        </a>
      </div>
      <p className="rh-note">
        Sourcify independently verified an exact creation and runtime match. Blockscout&apos;s
        downstream verification backend was unable to reproduce the verification.
      </p>
    </section>
  )
}
