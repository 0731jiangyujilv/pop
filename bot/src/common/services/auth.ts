import { SiweMessage } from "siwe"
import crypto from "crypto"

// jose is ESM-only; use dynamic import
let _jose: any = null
async function getJose() {
  if (!_jose) _jose = await import("jose")
  return _jose as { SignJWT: any; jwtVerify: any }
}
import { prisma } from "../db"
import { isSupportedChain } from "../chains"

const NONCE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// JWT secret — derived from BOT_PRIVATE_KEY or a dedicated env var
const JWT_SECRET_RAW = process.env.JWT_SECRET || process.env.BOT_PRIVATE_KEY || "dev-jwt-secret-change-me"
const JWT_SECRET = new TextEncoder().encode(
  crypto.createHash("sha256").update(JWT_SECRET_RAW).digest("hex")
)

export type SessionPayload = {
  address: string
  chainId: number
}

export async function generateNonce(): Promise<string> {
  const nonce = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + NONCE_EXPIRY_MS)

  await prisma.siweNonce.create({
    data: { nonce, expiresAt },
  })

  // Clean up expired nonces opportunistically
  await prisma.siweNonce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => {})

  return nonce
}

export async function verifySiweMessage(
  message: string,
  signature: string
): Promise<{ address: string; chainId: number }> {
  const siweMessage = new SiweMessage(message)

  // Verify the signature
  const result = await siweMessage.verify({ signature })
  if (!result.success) {
    throw new Error("Invalid SIWE signature")
  }

  const { address, chainId, nonce } = siweMessage

  // Verify the nonce exists and hasn't expired
  const storedNonce = await prisma.siweNonce.findUnique({
    where: { nonce },
  })

  if (!storedNonce) {
    throw new Error("Invalid or expired nonce")
  }

  if (storedNonce.expiresAt < new Date()) {
    await prisma.siweNonce.delete({ where: { nonce } }).catch(() => {})
    throw new Error("Nonce expired")
  }

  // Delete the nonce (one-time use)
  await prisma.siweNonce.delete({ where: { nonce } }).catch(() => {})

  // Verify chainId is supported
  if (!isSupportedChain(chainId)) {
    throw new Error(`Unsupported chain: ${chainId}`)
  }

  return { address: address.toLowerCase(), chainId }
}

export async function createSessionToken(
  address: string,
  chainId: number
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS)

  // Store session in DB
  const session = await prisma.session.create({
    data: {
      address: address.toLowerCase(),
      chainId,
      expiresAt,
    },
  })

  // Create JWT
  const jose = await getJose()
  const token = await new jose.SignJWT({
    sub: address.toLowerCase(),
    chainId,
    sid: session.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .sign(JWT_SECRET)

  return { token, expiresAt }
}

export async function verifySessionToken(token: string): Promise<SessionPayload & { sessionId: string }> {
  try {
    const jose = await getJose()
    const { payload } = await jose.jwtVerify(token, JWT_SECRET)

    const address = payload.sub as string
    const chainId = payload.chainId as number
    const sessionId = payload.sid as string

    if (!address || !chainId) {
      throw new Error("Invalid token payload")
    }

    // Verify session still exists and hasn't expired
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    })

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
      }
      throw new Error("Session expired")
    }

    return { address, chainId, sessionId }
  } catch (err: any) {
    throw new Error(`Invalid session: ${err.message}`)
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
}

export async function deleteAllSessionsForAddress(address: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { address: address.toLowerCase() },
  })
}
