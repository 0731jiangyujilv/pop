import { keccak256, toHex, toBytes, type Abi } from "viem"
import type { PerOracleResult } from "./oracle-aggregator"
import { getPublicClient, getWalletClient } from "./blockchain"

/**
 * Apply reputation deltas to each oracle on-chain after a swarm resolve.
 *
 * Matches-majority agents: +1 reputation.
 * Diverged agents: -1 reputation.
 * Errored agents: -2 reputation.
 *
 * This is the ERC-8004 "Reputation" primitive — on-chain, signed-score
 * accounting of agent performance, keyed by (eventHash, tokenId) so an
 * event can only be scored once per agent.
 *
 * No-op when:
 *   • ORACLE_REGISTRY_ADDRESS env is not set (registry not yet deployed)
 *   • REPUTATION_CHAIN_ID env is not set
 *   • any oracle lacks an agentTokenId (still unregistered)
 */

const ORACLE_REGISTRY_ABI = [
  {
    type: "function",
    name: "applyOutcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "eventKey", type: "bytes32" },
      { name: "tokenIds", type: "uint256[]" },
      { name: "deltas", type: "int256[]" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
] as const satisfies Abi

type AgentTokenMap = Record<string, number>

function readAgentTokenMap(): AgentTokenMap {
  return {
    "oracle-twitter-01": Number(process.env.AGENT_TOKEN_TWITTER ?? 0),
    "oracle-google-02":  Number(process.env.AGENT_TOKEN_GOOGLE  ?? 0),
    "oracle-news-03":    Number(process.env.AGENT_TOKEN_NEWS    ?? 0),
    "oracle-reddit-04":  Number(process.env.AGENT_TOKEN_REDDIT  ?? 0),
    "oracle-youtube-05": Number(process.env.AGENT_TOKEN_YOUTUBE ?? 0),
  }
}

/** Per-oracle delta keyed by `oracle.id` (e.g. `oracle-twitter-01`). */
export type ReputationDeltas = Record<string, number>

export type ApplyReputationResult = {
  txHash: string | null
  skipped?: string
  /** Deltas for ALL oracles in `perOracle`, regardless of whether they have a
   *  registered agentTokenId. Useful for UI surfaces that want to show the
   *  rule's verdict even for unregistered agents. */
  deltas: ReputationDeltas
}

function computeDelta(r: PerOracleResult, finalOutcome: "YES" | "NO"): number {
  if (r.error) return -2
  if (r.verdict === finalOutcome) return 1
  return -1
}

export async function applySwarmReputation(params: {
  eventKey: string
  finalOutcome: "YES" | "NO"
  perOracle: PerOracleResult[]
}): Promise<ApplyReputationResult> {
  // Compute deltas up-front for EVERY oracle so the UI can show what the rule
  // applied even when on-chain submission is skipped.
  const deltas: ReputationDeltas = {}
  for (const r of params.perOracle) {
    deltas[r.oracle.id] = computeDelta(r, params.finalOutcome)
  }

  const registry = process.env.ORACLE_REGISTRY_ADDRESS as `0x${string}` | undefined
  if (!registry || !/^0x[0-9a-fA-F]{40}$/.test(registry)) {
    return { txHash: null, skipped: "ORACLE_REGISTRY_ADDRESS not set", deltas }
  }

  const chainId = Number(process.env.REPUTATION_CHAIN_ID ?? 0)
  if (!chainId) return { txHash: null, skipped: "REPUTATION_CHAIN_ID not set", deltas }

  const publicClient = getPublicClient(chainId)
  const walletClient = getWalletClient(chainId)
  if (!walletClient) return { txHash: null, skipped: "bot wallet unavailable for chain", deltas }

  const tokenMap = readAgentTokenMap()
  const tokenIds: bigint[] = []
  const onChainDeltas: bigint[] = []

  for (const r of params.perOracle) {
    const id = tokenMap[r.oracle.id]
    if (!id) continue
    tokenIds.push(BigInt(id))
    onChainDeltas.push(BigInt(deltas[r.oracle.id]))
  }

  if (tokenIds.length === 0) return { txHash: null, skipped: "no registered agents", deltas }

  const eventKey = keccak256(toBytes(params.eventKey)) as `0x${string}`
  const reason = `swarm-resolve:${params.finalOutcome}`

  try {
    const { request } = await publicClient.simulateContract({
      address: registry,
      abi: ORACLE_REGISTRY_ABI,
      functionName: "applyOutcome",
      args: [eventKey, tokenIds, onChainDeltas, reason],
      account: walletClient.account!,
    })
    const txHash = await walletClient.writeContract(request)
    console.log(`🏷️  applyOutcome tx=${txHash} agents=${tokenIds.length} eventKey=${eventKey.slice(0, 14)}…`)
    return { txHash, deltas }
  } catch (err: any) {
    console.error(`🏷️  applyOutcome failed: ${err?.shortMessage ?? err?.message}`)
    return { txHash: null, skipped: `tx error: ${err?.shortMessage ?? err?.message}`, deltas }
  }
}

export function deriveEventKey(contractAddress: string, betId: number): string {
  return `eventbet:${contractAddress.toLowerCase()}:${betId}`
}

// Keep eventKey derivation visible via toHex for debugging
export function debugEventKey(eventKey: string): string {
  return toHex(toBytes(eventKey))
}
