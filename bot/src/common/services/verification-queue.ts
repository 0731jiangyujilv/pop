import { getAddress } from "viem"
import { prisma } from "../db"

type VerificationKind = "BET" | "PRICE_ORACLE" | "EVENT_BET"

export async function enqueueVerification(params: {
  contractAddress: string
  kind: VerificationKind
  txHash?: string | null
}) {
  const contractAddress = getAddress(params.contractAddress).toLowerCase()

  await (prisma as any).contractVerification.upsert({
    where: { contractAddress },
    update: {
      kind: params.kind,
      txHash: params.txHash || null,
      status: "PENDING",
      lastError: null,
    },
    create: {
      contractAddress,
      kind: params.kind,
      txHash: params.txHash || null,
    },
  })
}
