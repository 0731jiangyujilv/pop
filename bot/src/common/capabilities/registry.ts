import type { Capability } from "./types"
import { xPostCapability } from "./x-post"

const capabilities = new Map<string, Capability>()

export function registerCapability(cap: Capability) {
  capabilities.set(cap.type, cap)
}

export function getCapability(type: string): Capability | undefined {
  return capabilities.get(type)
}

export function listCapabilities(): string[] {
  return Array.from(capabilities.keys())
}

// Register built-in capabilities
registerCapability(xPostCapability)
