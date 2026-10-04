import {
  ROBINHOOD_SOURCIFY_VERIFICATION_ID,
  shortHash,
} from '@/config/robinhood'
import {
  EVIDENCE_GROUPS,
  LIVE_VERIFICATION,
  evidenceByGroup,
  evidenceExplorerUrl,
} from '@/data/robinhoodLiveEvidence'

export function OnchainEvidenceDrawer() {
  return (
    <details className="rh-details">
      <summary>View on-chain evidence</summary>
      <div className="rh-details-body">
        {EVIDENCE_GROUPS.map((group) => {
          const rows = evidenceByGroup(group.id)
          return (
            <div key={group.id} className="rh-ev-group">
              <h3>{group.title}</h3>
              <p>{group.description}</p>
              <table className="rh-ev-table">
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Tx</th>
                    <th scope="col">Result</th>
                    <th scope="col">Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tx) => (
                    <tr
                      key={tx.id}
                      className={tx.highlight ? `rh-ev-hi-${tx.highlight}` : undefined}
                    >
                      <td className="rh-ev-action">{tx.action}</td>
                      <td className="rh-ev-hash">{shortHash(tx.hash)}</td>
                      <td className="rh-ev-result">{tx.result}</td>
                      <td>
                        <a
                          className="rh-ev-link"
                          href={evidenceExplorerUrl(tx)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </details>
  )
}

export function EngineeringEvidence() {
  const v = LIVE_VERIFICATION
  return (
    <details className="rh-details">
      <summary>Engineering evidence</summary>
      <div className="rh-details-body">
        <div className="rh-eng-grid">
          <div className="rh-eng-item">
            <div className="rh-eng-k">Sourcify</div>
            <div className="rh-eng-v">Exact creation + runtime match</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Verification ID</div>
            <div className="rh-eng-v rh-mono">{ROBINHOOD_SOURCIFY_VERIFICATION_ID}</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Compiler</div>
            <div className="rh-eng-v">Solidity 0.8.24</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Optimizer</div>
            <div className="rh-eng-v">{v.optimizerRuns} runs · viaIR {String(v.viaIR)}</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Tests</div>
            <div className="rh-eng-v">{v.foundryTestsPassing} passing</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Runtime size</div>
            <div className="rh-eng-v">{v.runtimeBytecodeBytes.toLocaleString()} bytes</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Slither</div>
            <div className="rh-eng-v">{v.slitherGate}</div>
          </div>
          <div className="rh-eng-item">
            <div className="rh-eng-k">Blockscout forwarding</div>
            <div className="rh-eng-v">{v.blockscoutForwarding}</div>
          </div>
        </div>
        <p className="rh-note">
          The deployed contract has an exact creation and runtime match independently verified by
          Sourcify. Blockscout&apos;s downstream verification backend was unable to reproduce the
          verification. Security and release signals are secondary to the product story above.
        </p>
      </div>
    </details>
  )
}
