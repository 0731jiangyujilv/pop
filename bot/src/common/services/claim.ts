import { formatUnits, getAddress, type PublicClient, type WalletClient } from "viem"
import { config } from "../config"
import { BetAbi, getBetAddress, getBetCount } from "./blockchain"
import { getPublicClient, getWalletClient, SUPPORTED_CHAINS } from "../chains"
import { tryAcquireLease } from "./worker-lease"
import { simulateBeforeWrite } from "./simulate"
import { writeContractWithAttribution } from "./writeWithAttribution"

const POLL_INTERVAL_MS = config.SETTLEMENT_CRON_INTERVAL_MS
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

let txMutex: Promise<unknown> = Promise.resolve()
let runCounter = 0

function withTxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = txMutex.then(fn, fn)
  txMutex = next.catch(() => {})
  return next
}

export function startClaimCron() {
  const firstWallet = getWalletClient(Object.keys(SUPPORTED_CHAINS).map(Number)[0] ?? 84532)
  if (!firstWallet) {
    console.warn("💸 Claim worker disabled: BOT_PRIVATE_KEY is not configured")
    return
  }

  console.log(
    `💸 Claim worker started (every ${POLL_INTERVAL_MS}ms) with admin ${firstWallet.account!.address}`
  )

  const run = async () => {
    const runId = ++runCounter
    const startedAt = Date.now()
    try {
      console.log(`💸 Run #${runId}: tick started at ${new Date(startedAt).toISOString()}`)

      for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
        const leaseKey = `claim_worker_${chainCfg.chainId}`
        const acquired = await tryAcquireLease(leaseKey, LEASE_TTL_MS)
        if (!acquired) {
          console.log(`💸 Run #${runId}: chain ${chainCfg.chainId} skipped because lease was not acquired`)
          continue
        }
        try {
          await processClaimableBets(runId, chainCfg.chainId)
        } catch (error) {
          console.error(`💸 Run #${runId}: chain ${chainCfg.chainId} error:`, error)
        }
      }

      console.log(`💸 Run #${runId}: completed in ${Date.now() - startedAt}ms`)
    } catch (error) {
      console.error(`💸 Run #${runId}: claim worker error:`, error)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processClaimableBets(runId: number, chainId: number) {
  const client = getPublicClient(chainId) as PublicClient
  const wallet = getWalletClient(chainId) as WalletClient
  if (!wallet) return

  const betCount = Number(await getBetCount(chainId))
  let visited = 0
  let settledBets = 0
  let claimedPlayers = 0
  let unsettledBets = 0

  console.log(`💸 Run #${runId}: chain ${chainId} scanning ${betCount} bets for claimable players`)

  for (let onChainBetId = 0; onChainBetId < betCount; onChainBetId += 1) {
    const rawBetAddress = await getBetAddress(onChainBetId, chainId)
    if (!rawBetAddress || /^0x0{40}$/i.test(rawBetAddress)) {
      continue
    }

    visited += 1
    const contractAddress = getAddress(rawBetAddress)
    const betInfo = await client.readContract({
      address: contractAddress,
      abi: BetAbi,
      functionName: "getBetInfo",
    })

    if (Number(betInfo.status) !== 2) {
      unsettledBets += 1
      continue
    }

    settledBets += 1
    claimedPlayers += await claimForBet(runId, onChainBetId, contractAddress, client, wallet)
  }

  console.log(
    `💸 Run #${runId}: chain ${chainId} summary visited=${visited} unsettledBets=${unsettledBets} settledBets=${settledBets} autoClaims=${claimedPlayers}`
  )
}

async function claimForBet(
  runId: number,
  onChainBetId: number,
  contractAddress: `0x${string}`,
  client: PublicClient,
  wallet: WalletClient,
): Promise<number> {
  const [upPositions, downPositions] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi: BetAbi,
      functionName: "getUpPositions",
    }) as Promise<Array<{ player: string; amount: bigint }>>,
    client.readContract({
      address: contractAddress,
      abi: BetAbi,
      functionName: "getDownPositions",
    }) as Promise<Array<{ player: string; amount: bigint }>>,
  ])

  const uniquePlayers = new Set<`0x${string}`>()
  for (const position of [...upPositions, ...downPositions]) {
    uniquePlayers.add(getAddress(position.player))
  }

  let claimedPlayers = 0

  for (const player of uniquePlayers) {
    const [claimable, hasClaimed] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "claimable",
        args: [player],
      }) as Promise<bigint>,
      client.readContract({
        address: contractAddress,
        abi: BetAbi,
        functionName: "hasClaimed",
        args: [player],
      }) as Promise<boolean>,
    ])

    if (hasClaimed || claimable === 0n) {
      continue
    }

    await withTxMutex(async () => {
      await simulateBeforeWrite(client, wallet, {
        address: contractAddress,
        abi: BetAbi,
        functionName: "claimFor",
        args: [player],
      })

      const txHash = await writeContractWithAttribution(wallet, client, {
        address: contractAddress,
        abi: BetAbi,
        functionName: "claimFor",
        args: [player],
      })

      console.log(`💸 Run #${runId}: bet #${onChainBetId} player=${player} claimFor tx submitted: ${txHash}`)
      const receipt = await client.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== "success") {
        throw new Error(`claimFor reverted: ${txHash}`)
      }

      claimedPlayers += 1
      console.log(
        `💸 claimFor succeeded: bet=${contractAddress} player=${player} amount=${formatUnits(claimable, 6)}`
      )
    })
  }

  return claimedPlayers
}
