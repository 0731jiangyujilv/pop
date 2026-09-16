import type { Transport } from 'viem'

export function parseRpcUrls(value?: string | readonly string[]): string[]
export function getRpcUrls(chainId: number, env?: Record<string, string | undefined>, prefix?: string): string[]
export function isRetryableRpcError(error: unknown): boolean
export function createRpcTransport(chainId: number, env?: Record<string, string | undefined> | readonly string[], prefix?: string): Transport
export function createRpcRetry(scope: string, options?: { retries?: number; delayMs?: number }):
  <T>(label: string, operation: () => Promise<T>) => Promise<T>
