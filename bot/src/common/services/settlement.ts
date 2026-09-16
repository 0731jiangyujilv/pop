import { erc20Abi, parseUnits, getAddress, type PublicClient, type WalletClient } from "viem"
import { prisma } from "../db"
import { BetAbi, PriceOracleAbi, getBetAddress, getBetCount } from "./blockchain"
import { getPublicClient, getWalletClient, SUPPORTED_CHAINS } from "../chains"
import { config } from "../config"
import { fetchAssetPrice } from "./market-data"
import { simulateBeforeWrite } from "./simulate"
import { tryAcquireLease } from "./worker-lease"
import { writeContractWithAttribution } from "./writeWithAttribution"

const POLL_INTERVAL_MS = config.SETTLEMENT_CRON_INTERVAL_MS
const inFlight = new Set<string>()
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

// Must match Bet.sol ADMIN_GRACE_PERIOD.
const ADMIN_GRACE_SECONDS = 120

// Platform backstop policy: only these assets, only amounts in [1, 10] USDC.
const BACKSTOP_ASSETS = new Set(["BTC/USD", "ETH/USD"])
// USDC has 6 decimals — 1 USDC = 1_000_000, 10 USDC = 10_000_000.
const BACKSTOP_MIN_AMOUNT = 1_000_000n
const BACKSTOP_MAX_AMOUNT = 10_000_000n

enum Side {
  Up = 0,
  Down = 1,
}

let txMutex: Promise<unknown> = Promise.resolve()
let runCounter = 0

function withTxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = txMutex.then(fn, fn)
  txMutex = next.catch(() => {})
  return next
}

export function startSettlementCron() {
  const firstWallet = getWalletClient(Object.keys(SUPPORTED_CHAINS).map(Number)[0] ?? 84532)
  if (!firstWallet) {
    console.warn("⚖️ Settlement executor disabled: BOT_PRIVATE_KEY is not configured")
    return
  }

  console.log(
    `⚖️ Settlement executor started (every ${POLL_INTERVAL_MS}ms) with admin ${firstWallet.account!.address}`
  )

  const run = async () => {
    const runId = ++runCounter
    const startedAt = Date.now()
    try {
      console.log(`⚖️ Run #${runId}: tick started at ${new Date(startedAt).toISOString()}`)

      for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
        const leaseKey = `settlement_worker_${chainCfg.chainId}`
        const acquired = await tryAcquireLease(leaseKey, LEASE_TTL_MS)
        if (!acquired) {
          console.log(`⚖️ Run #${runId}: chain ${chainCfg.chainId} skipped because lease was not acquired`)
          continue
        }
        try {
          await processDueBets(runId, chainCfg.chainId)
        } catch (err) {
          console.error(`⚖️ Run #${runId}: chain ${chainCfg.chainId} error:`, err)
        }
      }

      console.log(`⚖️ Run #${runId}: completed in ${Date.now() - startedAt}ms`)
    } catch (err) {
      console.error(`⚖️ Run #${runId}: executor error:`, err)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processDueBets(runId: number, chainId: number) {
  const client = getPublicClient(chainId) as PublicClient
  const wallet = getWalletClient(chainId) as WalletClient
  if (!wallet) return

  const betCount = Number(await getBetCount(chainId))
  const now = Math.floor(Date.now() / 1000)
  let visited = 0
  let openWaiting = 0
  let lockQueued = 0
  let lockedWaiting = 0
  let settleQueued = 0
  let settled = 0

  console.log(`⚖️ Run #${runId}: scanning ${betCount} bets at now=${now} (${new Date(now * 1000).toISOString()})`)

  for (let onChainBetId = 0; onChainBetId < betCount; onChainBetId += 1) {
    const rawBetAddress = await getBetAddress(onChainBetId, chainId)
    if (!rawBetAddress || /^0x0{40}$/i.test(rawBetAddress)) {
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} skipped because factory returned zero address`)
      continue
    }

    visited += 1
    const contractAddress = getAddress(rawBetAddress)

    let info: any
    try {
      info = await client.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "getBetInfo",
      })
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err)
      console.error(`⚖️ Bet #${onChainBetId}: failed to read on-chain info: ${msg}`)
      continue
    }

    const onChainStatus = Number(info.status)
    const bettingDeadline = Number(info.bettingDeadline)
    const endTime = Number(info.endTime)
    const priceFeed = getAddress(info.priceFeed)
    const asset = String(
      await client.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "asset",
      })
    )

    console.log(
      `⚖️ Run #${runId}: bet #${onChainBetId} address=${contractAddress} asset=${asset} status=${onChainStatus} bettingDeadline=${bettingDeadline} endTime=${endTime} now=${now} totalUp=${info.totalUp?.toString?.() ?? "?"} totalDown=${info.totalDown?.toString?.() ?? "?"}`
    )

    await syncDbState({ onChainBetId, contractAddress }, info)

    if (onChainStatus === 0 && now >= bettingDeadline) {
      if (!asset) {
        console.error(`⚖️ Bet #${onChainBetId}: missing asset metadata, cannot lock`)
        continue
      }

      const totalUp = BigInt(info.totalUp ?? 0)
      const totalDown = BigInt(info.totalDown ?? 0)
      const bothSides = totalUp > 0n && totalDown > 0n
      const graceExpired = now >= bettingDeadline + ADMIN_GRACE_SECONDS

      if (bothSides && graceExpired) {
        lockQueued += 1
        console.log(
          `⚖️ Run #${runId}: bet #${onChainBetId} is due for lock (grace expired, both sides present)`
        )
        await executeTransition({
          runId,
          betId: onChainBetId,
          asset,
          contractAddress,
          oracleAddress: priceFeed,
          action: "lock",
          client,
          wallet,
        })
      } else if (!bothSides && !graceExpired) {
        // Inside the 2-minute admin grace window — try to backstop the unmatched side.
        await tryBackstop({
          runId,
          betId: onChainBetId,
          contractAddress,
          asset,
          totalUp,
          totalDown,
          client,
          wallet,
        })
      } else if (!bothSides && graceExpired) {
        lockQueued += 1
        console.log(
          `⚖️ Run #${runId}: bet #${onChainBetId} still single-sided after grace — expiring`
        )
        await executeTransition({
          runId,
          betId: onChainBetId,
          asset,
          contractAddress,
          oracleAddress: priceFeed,
          action: "expire",
          client,
          wallet,
        })
      } else {
        // bothSides && !graceExpired — wait out the grace window before locking
        openWaiting += 1
        console.log(
          `⚖️ Run #${runId}: bet #${onChainBetId} waiting ${bettingDeadline + ADMIN_GRACE_SECONDS - now}s for admin grace to elapse`
        )
      }
    } else if (onChainStatus === 1 && now >= endTime) {
      if (!asset) {
        console.error(`⚖️ Bet #${onChainBetId}: missing asset metadata, cannot settle`)
        continue
      }

      settleQueued += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} is due for settle because now=${now} >= endTime=${endTime}`
      )
      await executeTransition({
        runId,
        betId: onChainBetId,
        asset,
        contractAddress,
        oracleAddress: priceFeed,
        action: "settle",
        client,
        wallet,
      })
    } else if (onChainStatus === 0) {
      openWaiting += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} not ready to lock yet, waiting ${Math.max(0, bettingDeadline - now)}s until bettingDeadline`
      )
    } else if (onChainStatus === 1) {
      lockedWaiting += 1
      console.log(
        `⚖️ Run #${runId}: bet #${onChainBetId} not ready to settle yet, waiting ${Math.max(0, endTime - now)}s until endTime`
      )
    } else if (onChainStatus === 2) {
      settled += 1
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} already settled`)
    } else if (onChainStatus === 3) {
      settled += 1
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} already expired`)
    } else {
      console.log(`⚖️ Run #${runId}: bet #${onChainBetId} has unknown status=${onChainStatus}`)
    }
  }

  console.log(
    `⚖️ Run #${runId}: summary visited=${visited} openWaiting=${openWaiting} lockQueued=${lockQueued} lockedWaiting=${lockedWaiting} settleQueued=${settleQueued} settled=${settled}`
  )
}

async function executeTransition(params: {
  runId: number
  betId: number
  asset: string
  contractAddress: `0x${string}`
  oracleAddress: `0x${string}`
  action: "lock" | "settle" | "expire"
  client: PublicClient
  wallet: WalletClient
}) {
  const key = `${params.contractAddress}:${params.action}`
  if (inFlight.has(key)) {
    console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} skipped because ${key} is already in flight`)
    return
  }

  inFlight.add(key)
  console.log(
    `⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} queued with oracle=${params.oracleAddress} contract=${params.contractAddress}`
  )

  try {
    await withTxMutex(async () => {
      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} acquired tx mutex`)
      // expire() is a no-oracle refund path; lock/settle still need a fresh price report.
      if (params.action !== "expire") {
        const reportTx = await reportLatestOraclePrice(params.asset, params.oracleAddress, params.client, params.wallet)
        console.log(`⚖️ Bet #${params.betId}: reported latest ${params.asset} price, tx=${reportTx}`)
      }

      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} simulating ${params.action}`)
      try {
        await simulateBeforeWrite(params.client, params.wallet, {
          address: params.contractAddress,
          abi: BetAbi,
          functionName: params.action,
        })
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || String(err)
        throw new Error(`${params.action} simulation failed for bet #${params.betId} (contract=${params.contractAddress}): ${msg}`)
      }

      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} sending ${params.action} transaction`)
      const actionTx = await writeContractWithAttribution(params.wallet, params.client, {
        address: params.contractAddress,
        abi: BetAbi,
        functionName: params.action,
      })

      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} tx submitted: ${actionTx}`)
      const receipt = await params.client.waitForTransactionReceipt({ hash: actionTx })
      console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} receipt status=${receipt.status}`)
      if (receipt.status !== "success") {
        throw new Error(`${params.action} tx reverted: ${actionTx}`)
      }

      console.log(`⚖️ Bet #${params.betId}: ${params.action} succeeded, tx=${actionTx}`)

      const refreshedInfo = await params.client.readContract({
        address: params.contractAddress,
        abi: BetAbi,
        functionName: "getBetInfo",
      })

      await syncDbState(
        { onChainBetId: params.betId, contractAddress: params.contractAddress },
        refreshedInfo
      )
      console.log(
        `⚖️ Run #${params.runId}: bet #${params.betId} post-${params.action} status=${Number(refreshedInfo.status)} startTime=${Number(refreshedInfo.startTime)} endTime=${Number(refreshedInfo.endTime)} startPrice=${refreshedInfo.startPrice?.toString?.() ?? "?"} endPrice=${refreshedInfo.endPrice?.toString?.() ?? "?"}`
      )
    })
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err)
    console.error(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} failed: ${msg}`)
  } finally {
    inFlight.delete(key)
    console.log(`⚖️ Run #${params.runId}: bet #${params.betId} ${params.action} finished, removed in-flight key=${key}`)
  }
}

/**
 * Within the admin grace window, if the bet still has only one side populated and
 * the platform backstop policy applies, place an admin-funded counterparty bet
 * (same amount, opposite side) so the bet can lock instead of expiring.
 */
async function tryBackstop(params: {
  runId: number
  betId: number
  contractAddress: `0x${string}`
  asset: string
  totalUp: bigint
  totalDown: bigint
  client: PublicClient
  wallet: WalletClient
}) {
  const { runId, betId, contractAddress, asset, totalUp, totalDown, client, wallet } = params
  const key = `${contractAddress}:backstop`
  if (inFlight.has(key)) {
    console.log(`⚖️ Run #${runId}: bet #${betId} backstop skipped because ${key} is already in flight`)
    return
  }

  if (!BACKSTOP_ASSETS.has(asset)) {
    console.log(`⚖️ Run #${runId}: bet #${betId} ineligible for backstop (asset=${asset})`)
    return
  }

  const existingAmount = totalUp > 0n ? totalUp : totalDown
  if (existingAmount < BACKSTOP_MIN_AMOUNT || existingAmount > BACKSTOP_MAX_AMOUNT) {
    console.log(
      `⚖️ Run #${runId}: bet #${betId} ineligible for backstop (existing=${existingAmount} out of [${BACKSTOP_MIN_AMOUNT}, ${BACKSTOP_MAX_AMOUNT}])`
    )
    return
  }

  const adminAddress = wallet.account!.address
  const alreadyPlaced = (await client.readContract({
    address: contractAddress,
    abi: BetAbi,
    functionName: "hasPlaced",
    args: [adminAddress],
  })) as boolean
  if (alreadyPlaced) {
    console.log(`⚖️ Run #${runId}: bet #${betId} admin already backstopped`)
    return
  }

  const tokenAddress = (await client.readContract({
    address: contractAddress,
    abi: BetAbi,
    functionName: "token",
  })) as `0x${string}`

  const oppositeSide: Side = totalUp > 0n ? Side.Down : Side.Up

  inFlight.add(key)
  console.log(
    `⚖️ Run #${runId}: bet #${betId} backstopping side=${Side[oppositeSide]} amount=${existingAmount} admin=${adminAddress}`
  )

  try {
    await withTxMutex(async () => {
      // Ensure the bet contract has enough USDC allowance from the admin.
      const allowance = (await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [adminAddress, contractAddress],
      })) as bigint
      if (allowance < existingAmount) {
        console.log(`⚖️ Run #${runId}: bet #${betId} approving ${existingAmount} from admin (current=${allowance})`)
        const approveTx = await writeContractWithAttribution(wallet, client, {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [contractAddress, existingAmount],
        })
        const approveReceipt = await client.waitForTransactionReceipt({ hash: approveTx })
        if (approveReceipt.status !== "success") {
          throw new Error(`admin approve reverted: ${approveTx}`)
        }
      }

      try {
        await simulateBeforeWrite(client, wallet, {
          address: contractAddress,
          abi: BetAbi,
          functionName: "placeBet",
          args: [oppositeSide, existingAmount],
        })
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || String(err)
        throw new Error(`backstop placeBet simulation failed for bet #${betId}: ${msg}`)
      }

      const tx = await writeContractWithAttribution(wallet, client, {
        address: contractAddress,
        abi: BetAbi,
        functionName: "placeBet",
        args: [oppositeSide, existingAmount],
      })
      const receipt = await client.waitForTransactionReceipt({ hash: tx })
      if (receipt.status !== "success") {
        throw new Error(`backstop placeBet reverted: ${tx}`)
      }
      console.log(`⚖️ Run #${runId}: bet #${betId} backstop placeBet tx=${tx} confirmed`)
    })
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err)
    console.error(`⚖️ Run #${runId}: bet #${betId} backstop failed: ${msg}`)
  } finally {
    inFlight.delete(key)
  }
}

/**
 * Truncate a decimal string to at most `maxDecimals` fractional digits.
 * This prevents parseUnits from throwing when CoinGecko returns prices
 * with more fractional digits than the oracle's decimals (e.g. 15 digits
 * from JS float precision vs 8 oracle decimals).
 */
function truncateDecimals(value: string, maxDecimals: number): string {
  const dotIndex = value.indexOf(".")
  if (dotIndex === -1) return value
  const fractional = value.slice(dotIndex + 1)
  if (fractional.length <= maxDecimals) return value
  return value.slice(0, dotIndex + 1 + maxDecimals)
}

export async function reportLatestOraclePrice(asset: string, oracleAddress: `0x${string}`, client: PublicClient, wallet: WalletClient): Promise<`0x${string}`> {
  console.log(`⚖️ Oracle report: fetching price for asset=${asset} oracle=${oracleAddress}`)

  let rawPrice: string
  let decimals: number
  try {
    const [price, dec] = await Promise.all([
      fetchAssetPrice(asset),
      client.readContract({
        address: oracleAddress,
        abi: PriceOracleAbi,
        functionName: "decimals",
      }),
    ])
    rawPrice = price
    decimals = Number(dec)
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err)
    throw new Error(`Failed to fetch price or oracle decimals for ${asset}: ${msg}`)
  }

  const truncatedPrice = truncateDecimals(rawPrice, decimals)
  const scaledPrice = parseUnits(truncatedPrice, decimals)
  console.log(
    `⚖️ Oracle report: asset=${asset} oracle=${oracleAddress} rawPrice=${rawPrice} truncated=${truncatedPrice} decimals=${decimals} scaledPrice=${scaledPrice.toString()}`
  )

  try {
    await simulateBeforeWrite(client, wallet, {
      address: oracleAddress,
      abi: PriceOracleAbi,
      functionName: "reportPrice",
      args: [scaledPrice],
    })
  } catch (err: any) {
    const msg = err?.shortMessage || err?.message || String(err)
    throw new Error(`reportPrice simulation failed for ${asset} (oracle=${oracleAddress}, price=${scaledPrice}): ${msg}`)
  }

  const reportTx = await writeContractWithAttribution(wallet, client, {
    address: oracleAddress,
    abi: PriceOracleAbi,
    functionName: "reportPrice",
    args: [scaledPrice],
  })

  console.log(`⚖️ Oracle report submitted: asset=${asset} tx=${reportTx}`)
  const receipt = await client.waitForTransactionReceipt({ hash: reportTx })
  console.log(`⚖️ Oracle report receipt: asset=${asset} tx=${reportTx} status=${receipt.status}`)
  if (receipt.status !== "success") {
    throw new Error(`oracle report tx reverted: ${reportTx}`)
  }

  return reportTx
}

async function syncDbState(
  betRef: { onChainBetId: number; contractAddress: `0x${string}` },
  info: any
) {
  const statusMap: Record<number, "OPEN" | "LOCKED" | "SETTLED" | "EXPIRED"> = {
    0: "OPEN",
    1: "LOCKED",
    2: "SETTLED",
    3: "EXPIRED",
  }

  const nextStatus = statusMap[Number(info.status)]
  if (!nextStatus) return

  const result = await prisma.bet.updateMany({
    where: {
      OR: [
        { betId: betRef.onChainBetId },
        { contractAddress: betRef.contractAddress },
      ],
    },
    data: {
      status: nextStatus,
      startTime: Number(info.startTime) > 0 ? new Date(Number(info.startTime) * 1000) : null,
      endTime: Number(info.endTime) > 0 ? new Date(Number(info.endTime) * 1000) : null,
      startPrice: Number(info.startPrice) > 0 ? info.startPrice.toString() : null,
      endPrice: Number(info.endPrice) > 0 ? info.endPrice.toString() : null,
      totalUp: info.totalUp?.toString?.() ?? undefined,
      totalDown: info.totalDown?.toString?.() ?? undefined,
      winningSide:
        nextStatus === "SETTLED" && !info.isDraw ? (Number(info.winningSide) === 0 ? "UP" : "DOWN") : null,
      isDraw: Boolean(info.isDraw),
    },
  })

  console.log(
    `⚖️ DB sync: betId=${betRef.onChainBetId} contract=${betRef.contractAddress} matched=${result.count} status=${nextStatus} startTime=${Number(info.startTime)} endTime=${Number(info.endTime)} isDraw=${Boolean(info.isDraw)}`
  )
}
