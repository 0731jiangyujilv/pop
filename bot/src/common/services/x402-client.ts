import { GatewayClient } from "@circle-fin/x402-batching/client"
import { config } from "../config"

// Install a fetch shim once — Circle's SDK discards `message`/`reason` from
// error bodies and surfaces only "Payment failed: <generic>", so we peek at
// every non-2xx response, log the raw body, AND stash the most recent
// payment-error body keyed by URL so x402Fetch can splice the underlying
// reason into the thrown error.
const lastPaymentError = new Map<string, { status: number; body: any; at: number }>()

let fetchShimInstalled = false
function installFetchShim() {
  if (fetchShimInstalled) return
  fetchShimInstalled = true
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const resp = await originalFetch(input, init)
    if (!resp.ok) {
      try {
        const clone = resp.clone()
        const text = await clone.text()
        const method = init?.method ?? "GET"
        const urlStr =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : String(input)
        console.warn(
          `[fetch-shim] ${method} ${urlStr} → ${resp.status}\n  body: ${text.slice(0, 600)}`,
        )
        // Stash the parsed body so the catch block in x402Fetch can pull
        // out the seller's `message` / `reason` (Circle's SDK swallows them).
        let parsed: any = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { raw: text.slice(0, 600) }
        }
        lastPaymentError.set(urlStr, { status: resp.status, body: parsed, at: Date.now() })
      } catch {
        // ignore shim failures
      }
    }
    return resp
  }) as typeof fetch
}

/**
 * Bot's buyer-side Circle Gateway client. Singleton — the SDK instance carries
 * the bot's deposited balance and signing key, both of which we want to share
 * across every x402Fetch call in the process.
 *
 * Before this process can make gasless payments, the bot wallet must have
 * deposited USDC into the Gateway Wallet contract (see scripts/gateway-deposit.ts).
 */
let cached: GatewayClient | null = null

export function getGatewayClient(): GatewayClient {
  if (cached) return cached
  if (!config.BOT_PRIVATE_KEY) {
    throw new Error(
      "BOT_PRIVATE_KEY is required for Circle Gateway buyer — set it in env and run `npm run gateway:deposit` once.",
    )
  }
  installFetchShim()
  cached = new GatewayClient({
    chain: "arcTestnet",
    privateKey: config.BOT_PRIVATE_KEY as `0x${string}`,
  })
  return cached
}

export type X402Response<T> = {
  data: T
  /**
   * Circle Gateway transfer id. In the immediate response this is the facilitator's
   * internal id — the actual Arc settlement tx hash is backfilled later by the
   * gateway-poller (status → completed).
   */
  transferId: string
  amountMicroUsdc: bigint
  /** HTTP status code from the resource (200 on success). */
  status: number
}

export type X402FetchInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
}

// Circle's testnet facilitator (gateway-api-testnet.circle.com) periodically
// returns HTML error pages (Cloudflare 429/502/503) under burst load. The SDK
// then tries `await resp.json()` and throws "Unexpected token '<'", which the
// seller surfaces as { error: "Payment processing error", message: "..." }.
// These are transient — retry with jitter recovers.
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504])
const TRANSIENT_BODY_RE = /<!doctype|Unexpected token '<'|<html|<\/html>/i
const TRANSIENT_NETWORK_RE = /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up/i

const X402_MAX_RETRIES = Number(process.env.X402_MAX_RETRIES ?? 4)
const X402_RETRY_BASE_MS = Number(process.env.X402_RETRY_BASE_MS ?? 1500)
// Global minimum spacing between any two x402Fetch calls in this process.
// Doesn't matter how many oracles run in parallel — Circle's testnet
// facilitator is the bottleneck, and it returns HTML 429/502 once you exceed
// roughly one verify+settle pair every ~1s. We serialise across the whole
// process so concurrency at higher levels can't break this contract.
const X402_MIN_INTERVAL_MS = Number(process.env.X402_MIN_INTERVAL_MS ?? 1500)
// After a transient failure, all subsequent calls back off for this long to
// give Circle's rate-limit window a chance to reset.
const X402_COOLDOWN_AFTER_TRANSIENT_MS = Number(
  process.env.X402_COOLDOWN_AFTER_TRANSIENT_MS ?? 5000,
)

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Global serialisation queue: chained promise ensures only one x402Fetch is
// hitting the facilitator at a time, with at least MIN_INTERVAL_MS spacing.
let lastCallAt = 0
let cooldownUntil = 0
let throttleChain: Promise<void> = Promise.resolve()

function acquireThrottleSlot(): Promise<void> {
  const next = throttleChain.then(async () => {
    const now = Date.now()
    const minWait = lastCallAt + X402_MIN_INTERVAL_MS - now
    const cooldownWait = cooldownUntil - now
    const wait = Math.max(minWait, cooldownWait, 0)
    if (wait > 0) await sleep(wait)
    lastCallAt = Date.now()
  })
  throttleChain = next.catch(() => {})
  return next
}

function noteTransient() {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + X402_COOLDOWN_AFTER_TRANSIENT_MS)
}

function isTransientPaymentError(err: any): boolean {
  if (!err) return false
  const sellerStatus = err.sellerStatus as number | undefined
  if (sellerStatus && TRANSIENT_HTTP_STATUSES.has(sellerStatus)) return true
  const bodyText = String(
    err.sellerBody?.message ?? err.sellerBody?.raw ?? err.sellerBody?.error ?? "",
  )
  if (TRANSIENT_BODY_RE.test(bodyText)) return true
  const msg = String(err.message ?? "")
  if (TRANSIENT_NETWORK_RE.test(msg)) return true
  // Generic "Payment processing error" alone is also worth one retry — by the
  // time we splice in sellerBody it usually carries the doctype hint, but the
  // SDK occasionally throws before our shim ran.
  if (msg.includes("Payment processing error")) return true
  return false
}

/**
 * Execute a gasless x402 payment against a Gateway-compatible resource URL.
 *
 * Under the hood, Circle's GatewayClient:
 *   1. issues the initial request,
 *   2. handles the 402 response,
 *   3. signs an EIP-3009 authorization against the Gateway Wallet contract
 *      (NOT the USDC token — signature targets Circle's batching wallet),
 *   4. retries with the signed header, and
 *   5. returns immediately once the facilitator accepts the authorization.
 *
 * The real on-chain batch settlement happens asynchronously on Circle's side;
 * we observe it through `GatewayClient.searchTransfers` in the poller.
 */
export async function x402Fetch<T>(
  url: string,
  init: X402FetchInit = {},
): Promise<X402Response<T>> {
  const c = getGatewayClient()

  // The SDK accepts `unknown` for body; if the caller pre-stringified JSON
  // (legacy pattern), parse it back so the SDK can serialize it itself and set
  // the right Content-Type.
  let body: unknown = init.body
  if (typeof body === "string") {
    try {
      body = JSON.parse(body)
    } catch {
      // leave as-is; SDK will pass through
    }
  }

  let attempt = 0
  for (;;) {
    // Global throttle: enforced regardless of how many callers are concurrent.
    // Honours the post-failure cooldown so the whole process pauses after
    // Circle's facilitator throws a transient HTML error, not just the call
    // that hit it.
    await acquireThrottleSlot()
    try {
      const result = await c.pay<T>(url, {
        method: init.method ?? "GET",
        body,
        headers: init.headers,
      })

      console.log(`x402Fetch pay url ${url} success: transferId=${result.transaction}, status=${result.status}`, result.data)

      return {
        data: result.data,
        transferId: result.transaction ?? "",
        amountMicroUsdc: BigInt(result.amount ?? 0n),
        status: result.status,
      }
    } catch (err: any) {
      // Circle's GatewayClient throws `Payment failed: <error.error>` and
      // discards the seller's `message` / `reason` fields. Splice them back in
      // from the fetch shim's stash so the thrown error is actually debuggable.
      const stashed = lastPaymentError.get(url)
      if (stashed && Date.now() - stashed.at < 30_000) {
        const body = stashed.body ?? {}
        const reason = body.reason ?? body.message ?? body.raw
        if (reason && typeof err?.message === "string" && !err.message.includes(reason)) {
          err.message = `${err.message} | seller(${stashed.status}): ${String(reason).slice(0, 400)}`
        }
        err.sellerStatus = stashed.status
        err.sellerBody = body
      }

      // Retry on transient facilitator hiccups (Circle's testnet returns HTML
      // under burst load). Exponential backoff with jitter — each retry also
      // clears the stashed body so the next attempt is judged on its own.
      if (attempt < X402_MAX_RETRIES && isTransientPaymentError(err)) {
        // Push the global cooldown window forward so EVERY in-flight or
        // queued x402Fetch in the process pauses, not just this one. Without
        // this, the next call (already past the throttle gate) would hit the
        // facilitator while it's still rate-limited.
        noteTransient()
        const delay = X402_RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 600)
        console.warn(
          `[x402Fetch] transient ${err?.sellerStatus ?? "?"} on ${init.method ?? "GET"} ${url} (attempt ${attempt + 1}/${X402_MAX_RETRIES + 1}) → sleeping ${delay}ms then retry`,
        )
        lastPaymentError.delete(url)
        await sleep(delay)
        attempt += 1
        continue
      }

      const details: Record<string, unknown> = {
        url,
        method: init.method ?? "GET",
        sellerStatus: err?.sellerStatus,
        sellerBody: err?.sellerBody,
        attempts: attempt + 1,
      }
      for (const k of [
        "status",
        "statusCode",
        "code",
        "cause",
        "response",
        "body",
        "data",
        "errorReason",
        "invalidReason",
      ]) {
        const v = err?.[k]
        if (v !== undefined) details[k] = typeof v === "object" ? safeJson(v) : v
      }
      console.warn("[x402Fetch] Gateway pay failed:", err?.message ?? err, details)
      throw err
    }
  }
}

function safeJson(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return String(v)
  }
}
