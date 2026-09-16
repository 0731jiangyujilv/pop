import { hostname } from "node:os"
import { prisma } from "../db"

const WORKER_OWNER = `${hostname()}:${process.pid}`

export async function tryAcquireLease(key: string, ttlMs: number): Promise<boolean> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)

  const existing = await (prisma as any).workerLease.findUnique({ where: { key } }) as
    | { owner: string; expiresAt: Date }
    | null
  if (existing && existing.expiresAt > now && existing.owner !== WORKER_OWNER) {
    console.log(
      `🔒 Lease busy: key=${key} owner=${existing.owner} expiresAt=${existing.expiresAt.toISOString()} currentOwner=${WORKER_OWNER}`
    )
    return false
  }

  await (prisma as any).workerLease.upsert({
    where: { key },
    update: { owner: WORKER_OWNER, expiresAt },
    create: { key, owner: WORKER_OWNER, expiresAt },
  })

  console.log(
    `🔓 Lease acquired: key=${key} owner=${WORKER_OWNER} ttlMs=${ttlMs} expiresAt=${expiresAt.toISOString()}`
  )

  return true
}

export async function renewLease(key: string, ttlMs: number) {
  await (prisma as any).workerLease.update({
    where: { key },
    data: { owner: WORKER_OWNER, expiresAt: new Date(Date.now() + ttlMs) },
  })
}
