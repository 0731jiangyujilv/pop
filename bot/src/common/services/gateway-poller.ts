import { prisma } from "../db"
import { getGatewayClient } from "./x402-client"
import { updateNanopay, type NanopayStatus } from "./swarm-registry"

/**
 * Poll Circle Gateway for the settlement status of pending nanopayments.
 *
 * Each ~30s we:
 *   1. pull DB rows with a transferId but non-terminal status,
 *   2. for each, ask Gateway `getTransferById(id)`,
 *   3. if the status advanced (received → batched → confirmed → completed),
 *      push an update through swarm-registry so the on-chain settlement tx
 *      hash and status ripple to DB + SSE subscribers.
 *
 * This is what makes the UI "看出是批量来": ~35 nanopays from one resolve
 * round share the same on-chain `settlementTxHash` once Gateway batches them.
 */

const POLL_INTERVAL_MS = 30_000
const MAX_ROWS_PER_TICK = 60
// Retry-stop thresholds so we don't poll forever on dead rows.
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours
const TERMINAL: ReadonlySet<NanopayStatus> = new Set(["completed", "failed"])

let started = false

type TransferLike = {
  id: string
  status?: string
  [key: string]: unknown
}

function parseStatus(raw: unknown): NanopayStatus | null {
  if (typeof raw !== "string") return null
  if (raw === "received" || raw === "batched" || raw === "confirmed" || raw === "completed" || raw === "failed") {
    return raw
  }
  return null
}

/**
 * Transfer responses may surface the on-chain settlement hash under a few
 * field names as the Circle API evolves. Try the likely ones.
 */
function extractSettlementHash(t: TransferLike): string | null {
  const candidates = [
    "settlementTxHash",
    "settlementTransaction",
    "onChainTxHash",
    "txHash",
    "transactionHash",
  ] as const
  for (const k of candidates) {
    const v = t[k]
    if (typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v)) return v
  }
  return null
}

async function tick() {
  const rows = await prisma.swarmNanopay.findMany({
    where: {
      transferId: { not: null },
      status: { notIn: ["completed", "failed"] },
      ts: { gt: new Date(Date.now() - MAX_AGE_MS) },
    },
    orderBy: { ts: "desc" },
    take: MAX_ROWS_PER_TICK,
  })
  if (rows.length === 0) return

  let client
  try {
    client = getGatewayClient()
  } catch (err: any) {
    // No BOT_PRIVATE_KEY → skip poller quietly (dev environments where the bot
    // hasn't been configured with a real Gateway wallet).
    console.warn("[gateway-poller] skipping: ", err?.message ?? err)
    return
  }

  for (const row of rows) {
    if (!row.transferId) continue
    let transfer: TransferLike
    try {
      transfer = (await client.getTransferById(row.transferId)) as TransferLike
    } catch (err: any) {
      // Transfer not yet known to Gateway (race) or transient error — retry next tick.
      if (err?.status !== 404) {
        console.warn(`[gateway-poller] getTransferById ${row.transferId} failed:`, err?.message ?? err)
      }
      continue
    }

    const nextStatus = parseStatus(transfer.status) ?? (row.status as NanopayStatus | null)
    const settlementTxHash = extractSettlementHash(transfer) ?? row.settlementTxHash

    const statusAdvanced = nextStatus && nextStatus !== row.status
    const hashLearned = settlementTxHash && settlementTxHash !== row.settlementTxHash
    if (!statusAdvanced && !hashLearned) continue

    updateNanopay({
      id: row.id,
      status: nextStatus ?? undefined,
      settlementTxHash: settlementTxHash ?? null,
    })

    if (nextStatus && TERMINAL.has(nextStatus)) {
      // Done — leave to ts filter / MAX_AGE_MS to stop reading this row.
    }
  }
}

export function startGatewayPoller() {
  if (started) return
  started = true
  // Kick off immediately on boot, then on interval. Wrap in try/catch so
  // poller errors never crash the service process.
  const run = () => {
    tick().catch((err) => {
      console.warn("[gateway-poller] tick error:", err?.message ?? err)
    })
  }
  run()
  const timer = setInterval(run, POLL_INTERVAL_MS)
  // Unref so it doesn't keep the event loop alive during shutdown.
  if (typeof timer.unref === "function") timer.unref()
  console.log(`[gateway-poller] started (interval=${POLL_INTERVAL_MS}ms, maxRows=${MAX_ROWS_PER_TICK})`)
}
