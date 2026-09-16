import { Request, Response, NextFunction } from "express"
import { verifySessionToken, type SessionPayload } from "../services/auth"

declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload & { sessionId: string }
    }
  }
}

/**
 * Auth middleware — requires valid JWT in Authorization header.
 * Attaches req.user = { address, chainId, sessionId }
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" })
    return
  }

  const token = authHeader.slice(7)
  try {
    req.user = await verifySessionToken(token)
    next()
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" })
  }
}

/**
 * Optional auth middleware — attaches req.user if valid token present, but doesn't reject.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    next()
    return
  }

  const token = authHeader.slice(7)
  try {
    req.user = await verifySessionToken(token)
  } catch {
    // Ignore invalid tokens for optional auth
  }
  next()
}
