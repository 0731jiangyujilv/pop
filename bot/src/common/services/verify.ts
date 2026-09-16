import { spawn } from "node:child_process"
import path from "node:path"
import { encodeAbiParameters, getAddress } from "viem"
import { config } from "../config"
import { prisma } from "../db"
import { publicClient } from "./blockchain"
import { tryAcquireLease } from "./worker-lease"

const POLL_INTERVAL_MS = config.VERIFY_POLL_INTERVAL_MS
const LEASE_KEY = "verify_worker"
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

const PRICE_ORACLE_VIEW_ABI = [
  { type: "function", name: "owner", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "description", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
] as const

const EVENT_BET_VIEW_ABI = [
  {
    type: "function",
    name: "getEventBetInfo",
    inputs: [],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "token", type: "address" },
          { name: "minAmount", type: "uint256" },
          { name: "maxAmount", type: "uint256" },
          { name: "closingTime", type: "uint256" },
          { name: "bettingDeadline", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "outcome", type: "uint8" },
          { name: "winningSide", type: "uint8" },
          { name: "isDraw", type: "bool" },
          { name: "totalYes", type: "uint256" },
          { name: "totalNo", type: "uint256" },
          { name: "prizePool", type: "uint256" },
          { name: "feeBps", type: "uint256" },
          { name: "feeRecipient", type: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
  { type: "function", name: "admin", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
] as const

const BET_VIEW_ABI = [
  {
    type: "function",
    name: "getBetInfo",
    inputs: [],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "token", type: "address" },
          { name: "minAmount", type: "uint256" },
          { name: "maxAmount", type: "uint256" },
          { name: "duration", type: "uint256" },
          { name: "bettingDeadline", type: "uint256" },
          { name: "priceFeed", type: "address" },
          { name: "startPrice", type: "int256" },
          { name: "endPrice", type: "int256" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "winningSide", type: "uint8" },
          { name: "isDraw", type: "bool" },
          { name: "totalUp", type: "uint256" },
          { name: "totalDown", type: "uint256" },
          { name: "prizePool", type: "uint256" },
          { name: "feeBps", type: "uint256" },
          { name: "feeRecipient", type: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
  { type: "function", name: "admin", inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
] as const

export function startVerifyCron() {
  if (!config.VERIFY_ENABLED) {
    console.warn("🔎 Verify worker disabled: VERIFY_ENABLED is false")
    return
  }

  if (!config.BASESCAN_API_KEY) {
    console.warn("🔎 Verify worker disabled: BASESCAN_API_KEY is not configured")
    return
  }

  const run = async () => {
    try {
      const acquired = await tryAcquireLease(LEASE_KEY, LEASE_TTL_MS)
      if (!acquired) return
      await processVerificationQueue()
    } catch (error) {
      console.error("🔎 Verify worker error:", error)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processVerificationQueue() {
  const pending = await (prisma as any).contractVerification.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "asc" },
    take: 10,
  }) as Array<{
    contractAddress: string
    kind: "BET" | "PRICE_ORACLE" | "EVENT_BET"
    verifyAttempts: number
  }>

  for (const item of pending) {
    await verifyOne(item.contractAddress, item.kind, item.verifyAttempts)
  }
}

async function verifyOne(contractAddress: string, kind: "BET" | "PRICE_ORACLE" | "EVENT_BET", attempts: number) {
  const normalized = getAddress(contractAddress)

  await (prisma as any).contractVerification.update({
    where: { contractAddress: normalized.toLowerCase() },
    data: {
      status: "VERIFYING",
      verifyAttempts: attempts + 1,
      lastError: null,
    },
  })

  try {
    const { contractId, constructorArgs } = await buildVerificationArgs(normalized, kind)
    await runForgeVerify(normalized, contractId, constructorArgs)

    await (prisma as any).contractVerification.update({
      where: { contractAddress: normalized.toLowerCase() },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        lastError: null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await (prisma as any).contractVerification.update({
      where: { contractAddress: normalized.toLowerCase() },
      data: {
        status: "FAILED",
        lastError: message.slice(0, 4000),
      },
    })
  }
}

async function buildVerificationArgs(contractAddress: `0x${string}`, kind: "BET" | "PRICE_ORACLE" | "EVENT_BET") {
  if (kind === "EVENT_BET") {
    const [info, admin] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: EVENT_BET_VIEW_ABI, functionName: "getEventBetInfo" }),
      publicClient.readContract({ address: contractAddress, abi: EVENT_BET_VIEW_ABI, functionName: "admin" }),
    ]) as [any, `0x${string}`]

    // EventBet constructor: token, minAmount, maxAmount, closingTime, creator, feeBps, feeRecipient, admin
    const constructorArgs = encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
      ],
      [
        getAddress(info.token),
        BigInt(info.minAmount),
        BigInt(info.maxAmount),
        BigInt(info.closingTime),
        getAddress(info.creator),
        BigInt(info.feeBps),
        getAddress(info.feeRecipient),
        getAddress(admin),
      ]
    )

    return {
      contractId: "src/EventBet.sol:EventBet",
      constructorArgs,
    }
  }

  if (kind === "PRICE_ORACLE") {
    const [owner, decimals, description] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: PRICE_ORACLE_VIEW_ABI, functionName: "owner" }),
      publicClient.readContract({ address: contractAddress, abi: PRICE_ORACLE_VIEW_ABI, functionName: "decimals" }),
      publicClient.readContract({ address: contractAddress, abi: PRICE_ORACLE_VIEW_ABI, functionName: "description" }),
    ])

    const constructorArgs = encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint8" },
        { type: "string" },
      ],
      [owner, decimals, description]
    )

    return {
      contractId: "src/PriceOracle.sol:PriceOracle",
      constructorArgs,
    }
  }

  const [info, admin] = await Promise.all([
    publicClient.readContract({ address: contractAddress, abi: BET_VIEW_ABI, functionName: "getBetInfo" }),
    publicClient.readContract({ address: contractAddress, abi: BET_VIEW_ABI, functionName: "admin" }),
  ]) as [any, `0x${string}`]

  const constructorArgs = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
    ],
    [
      getAddress(info.token),
      BigInt(info.minAmount),
      BigInt(info.maxAmount),
      BigInt(info.duration),
      getAddress(info.priceFeed),
      getAddress(info.creator),
      BigInt(info.feeBps),
      getAddress(info.feeRecipient),
      getAddress(admin),
    ]
  )

  return {
    contractId: "src/Bet.sol:Bet",
    constructorArgs,
  }
}

async function runForgeVerify(contractAddress: string, contractId: string, constructorArgs: `0x${string}`) {
  const cwd = path.resolve(process.cwd(), config.CONTRACTS_DIR)
  const args = [
    "verify-contract",
    "--chain-id",
    String(config.CHAIN_ID),
    "--verifier-url",
    config.VERIFIER_URL,
    "--etherscan-api-key",
    config.BASESCAN_API_KEY,
    "--constructor-args",
    constructorArgs,
    "--watch",
    contractAddress,
    contractId,
  ]

  await new Promise<void>((resolve, reject) => {
    const child = spawn("forge", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      output += chunk.toString()
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(output || `forge verify-contract exited with code ${code}`))
    })
  })
}
