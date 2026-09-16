import { config } from "./config"

const UNISWAP_TRADE_API_URL = "https://trade-api.gateway.uniswap.org/v1"
const TIMEOUT_MS = 30_000

export interface ProxyResult {
  status: number
  body: unknown
}

async function forward(path: "/quote" | "/check_approval" | "/swap", body: unknown): Promise<ProxyResult> {
  if (!config.UNISWAP_API_KEY) {
    return { status: 503, body: { errorCode: "UPSTREAM_UNCONFIGURED", detail: "Uniswap API key not configured" } }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${UNISWAP_TRADE_API_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.UNISWAP_API_KEY,
        "x-universal-router-version": "2.0",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text.length === 0 ? null : JSON.parse(text)
    } catch {
      // leave as raw text
    }
    return { status: res.status, body: parsed }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { status: 504, body: { errorCode: "UPSTREAM_TIMEOUT", detail: "Uniswap API timed out" } }
    }
    return { status: 502, body: { errorCode: "UPSTREAM_UNREACHABLE", detail: err?.message || "Uniswap API unreachable" } }
  } finally {
    clearTimeout(timer)
  }
}

export function quote(body: unknown): Promise<ProxyResult> {
  return forward("/quote", body)
}

export function checkApproval(body: unknown): Promise<ProxyResult> {
  return forward("/check_approval", body)
}

export function swap(body: unknown): Promise<ProxyResult> {
  return forward("/swap", body)
}
