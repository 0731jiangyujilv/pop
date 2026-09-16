import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { decodeEventLog, formatUnits, getAddress, type Hash } from "viem"
import { prisma } from "../db"
import { getPublicClient, isSupportedChain } from "../chains"
import { publicWebappUrl } from "../config"

const USDC_DECIMALS = 6
const BPS = 10_000
const REFERRAL_REWARD_RATE_BPS = 1_000 // 10% of the trade fee

const TRADE_EVENT_ABI = [
  {
    type: "event",
    name: "BoughtYes",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "usdcIn", type: "uint256", indexed: false },
      { name: "yesOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BoughtNo",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "usdcIn", type: "uint256", indexed: false },
      { name: "noOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SoldYes",
    inputs: [
      { name: "seller", type: "address", indexed: true },
      { name: "yesIn", type: "uint256", indexed: false },
      { name: "usdcOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SoldNo",
    inputs: [
      { name: "seller", type: "address", indexed: true },
      { name: "noIn", type: "uint256", indexed: false },
      { name: "usdcOut", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "lpSwapFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const

type ReferralSummary = {
  code: string
  inviteUrl: string
  connectedWallets: number
  tradingUsers: number
  tradeCount: number
  totalVolumeUsdc: number
  totalFeeUsdc: number
  totalRewardUsdc: number
  pendingRewardUsdc: number
}

type DecodedTrade = {
  action: "BUY" | "SELL"
  side: "YES" | "NO"
  traderAddress: string
  volumeRaw: bigint
}

function normalizeAddress(address: string): string {
  return getAddress(address).toLowerCase()
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function makeReferralCode(): string {
  return `POP${crypto.randomBytes(5).toString("hex").toUpperCase()}`
}

function inviteUrl(code: string): string {
  const base = publicWebappUrl.replace(/\/+$/, "")
  return `${base}/?ref=${encodeURIComponent(code)}`
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? value.toNumber() : 0
}

function decodeReferralTrade(log: { address: string; topics: readonly `0x${string}`[]; data: `0x${string}` }): DecodedTrade | null {
  if (log.topics.length === 0) return null
  try {
    const decoded = decodeEventLog({
      abi: TRADE_EVENT_ABI,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    })
    const args = decoded.args as Record<string, unknown>
    switch (decoded.eventName) {
      case "BoughtYes":
        return {
          action: "BUY",
          side: "YES",
          traderAddress: normalizeAddress(String(args.buyer)),
          volumeRaw: BigInt(String(args.usdcIn)),
        }
      case "BoughtNo":
        return {
          action: "BUY",
          side: "NO",
          traderAddress: normalizeAddress(String(args.buyer)),
          volumeRaw: BigInt(String(args.usdcIn)),
        }
      case "SoldYes":
        return {
          action: "SELL",
          side: "YES",
          traderAddress: normalizeAddress(String(args.seller)),
          volumeRaw: BigInt(String(args.usdcOut)),
        }
      case "SoldNo":
        return {
          action: "SELL",
          side: "NO",
          traderAddress: normalizeAddress(String(args.seller)),
          volumeRaw: BigInt(String(args.usdcOut)),
        }
      default:
        return null
    }
  } catch {
    return null
  }
}

export async function getOrCreateReferralAccount(rawAddress: string) {
  const address = normalizeAddress(rawAddress)
  const existing = await prisma.referralAccount.findUnique({ where: { address } })
  if (existing) return existing

  for (let i = 0; i < 5; i += 1) {
    try {
      return await prisma.referralAccount.create({
        data: { address, code: makeReferralCode() },
      })
    } catch (err: any) {
      if (err?.code !== "P2002") throw err
      const raced = await prisma.referralAccount.findUnique({ where: { address } })
      if (raced) return raced
    }
  }

  throw new Error("Failed to create referral code")
}

export async function connectReferral(rawReferredAddress: string, rawCode: string, source?: string) {
  const referredAddress = normalizeAddress(rawReferredAddress)
  const referralCode = normalizeCode(rawCode)
  if (!referralCode) throw new Error("Referral code required")

  const referrer = await prisma.referralAccount.findUnique({ where: { code: referralCode } })
  if (!referrer) throw new Error("Invalid referral code")
  if (referrer.address === referredAddress) throw new Error("Cannot use your own referral code")

  await getOrCreateReferralAccount(referredAddress)

  const existing = await prisma.referralConnection.findUnique({ where: { referredAddress } })
  if (existing) return { connection: existing, alreadyConnected: true }

  const connection = await prisma.referralConnection.create({
    data: {
      referredAddress,
      referrerAddress: referrer.address,
      referralCode,
      source: source?.slice(0, 64),
    },
  })

  return { connection, alreadyConnected: false }
}

export async function getReferralSummary(rawAddress: string): Promise<ReferralSummary> {
  const account = await getOrCreateReferralAccount(rawAddress)

  const [connectedWallets, tradingUsers, tradeCount, aggregates] = await Promise.all([
    prisma.referralConnection.count({ where: { referrerAddress: account.address } }),
    prisma.referralConnection.count({
      where: { referrerAddress: account.address, firstTradeAt: { not: null } },
    }),
    prisma.referralTrade.count({ where: { referrerAddress: account.address } }),
    prisma.referralTrade.aggregate({
      where: { referrerAddress: account.address },
      _sum: {
        volumeUsdc: true,
        feeUsdc: true,
        rewardUsdc: true,
      },
    }),
  ])

  const totalRewardUsdc = decimalToNumber(aggregates._sum.rewardUsdc)
  return {
    code: account.code,
    inviteUrl: inviteUrl(account.code),
    connectedWallets,
    tradingUsers,
    tradeCount,
    totalVolumeUsdc: decimalToNumber(aggregates._sum.volumeUsdc),
    totalFeeUsdc: decimalToNumber(aggregates._sum.feeUsdc),
    totalRewardUsdc,
    pendingRewardUsdc: totalRewardUsdc,
  }
}

export async function recordReferralTrade(params: {
  traderAddress: string
  chainId: number
  marketAddress: string
  txHash: string
}) {
  if (!isSupportedChain(params.chainId)) throw new Error(`Unsupported chain: ${params.chainId}`)

  const traderAddress = normalizeAddress(params.traderAddress)
  const marketAddress = normalizeAddress(params.marketAddress)
  const txHash = params.txHash as Hash

  const connection = await prisma.referralConnection.findUnique({
    where: { referredAddress: traderAddress },
  })
  if (!connection) {
    return { recorded: false, reason: "NO_REFERRER" as const }
  }

  const existing = await prisma.referralTrade.findUnique({
    where: {
      chainId_marketAddress_txHash: {
        chainId: params.chainId,
        marketAddress,
        txHash,
      },
    },
  })
  if (existing) return { recorded: true, trade: existing, duplicate: true }

  const client = getPublicClient(params.chainId)
  const receipt = await client.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== "success") throw new Error("Transaction did not succeed")

  const trade = receipt.logs
    .filter((log) => log.address.toLowerCase() === marketAddress)
    .map((log) => decodeReferralTrade(log))
    .find((decoded) => decoded?.traderAddress === traderAddress)

  if (!trade) throw new Error("No matching trade event found for this wallet and market")

  const feeBpsRaw = await client.readContract({
    address: getAddress(marketAddress),
    abi: TRADE_EVENT_ABI,
    functionName: "lpSwapFeeBps",
  })
  const feeBps = Number(feeBpsRaw)
  const volumeUsdc = new Prisma.Decimal(formatUnits(trade.volumeRaw, USDC_DECIMALS))
  const feeUsdc = volumeUsdc.mul(feeBps).div(BPS)
  const rewardUsdc = feeUsdc.mul(REFERRAL_REWARD_RATE_BPS).div(BPS)

  const saved = await prisma.$transaction(async (tx) => {
    await tx.referralConnection.update({
      where: { referredAddress: traderAddress },
      data: { firstTradeAt: connection.firstTradeAt ?? new Date() },
    })

    return tx.referralTrade.create({
      data: {
        chainId: params.chainId,
        marketAddress,
        txHash,
        traderAddress,
        referrerAddress: connection.referrerAddress,
        side: trade.side,
        action: trade.action,
        volumeUsdc,
        feeBps,
        feeUsdc,
        rewardRateBps: REFERRAL_REWARD_RATE_BPS,
        rewardUsdc,
        blockNumber: receipt.blockNumber,
      },
    })
  })

  return { recorded: true, trade: saved, duplicate: false }
}
