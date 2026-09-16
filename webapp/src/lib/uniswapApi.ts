import { apiFetch } from './api'

// Uniswap Trading API proxy client — hits ${BOT_API_URL}/api/uniswap/* which
// forwards to https://trade-api.gateway.uniswap.org/v1 with the server-side
// API key and enforces auth + token/chain whitelist.

export type QuoteType = 'EXACT_INPUT' | 'EXACT_OUTPUT'

export type EIP712Payload = {
  domain: Record<string, unknown>
  types: Record<string, unknown>
  values: Record<string, unknown>
  primaryType?: string
}

export type QuoteResponse = {
  requestId?: string
  routing?: string
  quote: {
    chainId: number
    swapper: string
    input: { token: string; amount: string }
    output: { token: string; amount: string; recipient?: string }
    tradeType?: QuoteType
    gasFeeUSD?: string
    priceImpact?: string | number
    slippage?: string | number
    portionBips?: number
    portionAmount?: string
    portionRecipient?: string
    [key: string]: unknown
  }
  permitData?: EIP712Payload | null
  [key: string]: unknown
}

export type CheckApprovalResponse = {
  approval: { to: string; data: string; value?: string } | null
  cancel?: { to: string; data: string; value?: string } | null
  requestId?: string
}

export type SwapResponse = {
  requestId?: string
  swap: {
    to: string
    data: string
    value: string
    gasLimit?: string
    chainId?: number
    from?: string
  }
}

export class UniswapApiError extends Error {
  status: number
  errorCode?: string
  detail?: string
  constructor(message: string, status: number, errorCode?: string, detail?: string) {
    super(message)
    this.status = status
    this.errorCode = errorCode
    this.detail = detail
  }
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
  const text = await res.text()
  let parsed: any = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (!res.ok) {
    const code = parsed?.errorCode || parsed?.error || 'REQUEST_FAILED'
    const detail = parsed?.detail || parsed?.message || (typeof parsed === 'string' ? parsed : undefined)
    throw new UniswapApiError(`${path} failed: ${code}`, res.status, code, detail)
  }
  return parsed as T
}

export function fetchQuote(params: {
  tokenIn: string
  tokenOut: string
  amount: string
  swapper: string
  type: QuoteType
  chainId: number
}): Promise<QuoteResponse> {
  const chainIdStr = String(params.chainId)
  return call<QuoteResponse>('/api/uniswap/quote', {
    type: params.type,
    amount: params.amount,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    tokenInChainId: chainIdStr,
    tokenOutChainId: chainIdStr,
    swapper: params.swapper,
    slippageTolerance: 0.5,
    routingPreference: 'BEST_PRICE',
    spreadOptimization: 'EXECUTION',
    urgency: 'urgent',
    permitAmount: 'FULL',
    generatePermitAsTransaction: false,
  })
}

export function fetchCheckApproval(params: {
  token: string
  amount: string
  walletAddress: string
  chainId: number
}): Promise<CheckApprovalResponse> {
  return call<CheckApprovalResponse>('/api/uniswap/check_approval', {
    token: params.token,
    amount: params.amount,
    walletAddress: params.walletAddress,
    chainId: String(params.chainId),
  })
}

export function fetchSwap(params: { quote: QuoteResponse['quote']; signature?: string; permitData?: EIP712Payload | null }): Promise<SwapResponse> {
  const body: Record<string, unknown> = { quote: params.quote }
  if (params.signature) body.signature = params.signature
  if (params.permitData) body.permitData = params.permitData
  return call<SwapResponse>('/api/uniswap/swap', body)
}
