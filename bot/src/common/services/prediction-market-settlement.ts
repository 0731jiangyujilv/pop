import { getAddress, type PublicClient, type WalletClient } from "viem"
import {
  PredictionMarketAbi,
  getPredictionMarketCount,
  getPredictionMarketAddress,
  getPublicClient,
  getWalletClient,
  SUPPORTED_CHAINS,
} from "./blockchain"
import { config } from "../config"
import { reportLatestOraclePrice } from "./settlement"
import { simulateBeforeWrite } from "./simulate"
import { tryAcquireLease } from "./worker-lease"
import { writeContractWithAttribution } from "./writeWithAttribution"

// PredictionMarket.status: Open=0, Resolved=1
const STATUS_OPEN = 0

const POLL_INTERVAL_MS = config.SETTLEMENT_CRON_INTERVAL_MS
const LEASE_TTL_MS = POLL_INTERVAL_MS * 2

const inFlight = new Set<string>()
let txMutex: Promise<unknown> = Promise.resolve()
let runCounter = 0

function withTxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const next = txMutex.then(fn, fn)
  txMutex = next.catch(() => {})
  return next
}

export function startPredictionMarketSettlementCron() {
  const firstChainId = Object.keys(SUPPORTED_CHAINS).map(Number)[0] ?? 84532
  const firstWallet = getWalletClient(firstChainId)
  if (!firstWallet) {
    console.warn("🪙 Prediction-market settlement disabled: BOT_PRIVATE_KEY is not configured")
    return
  }

  console.log(
    `🪙 Prediction-market settlement started (every ${POLL_INTERVAL_MS}ms) with bot ${firstWallet.account!.address}`,
  )

  const run = async () => {
    const runId = ++runCounter
    const startedAt = Date.now()
    try {
      console.log(`🪙 Run #${runId}: tick started at ${new Date(startedAt).toISOString()}`)

      for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
        if (!chainCfg.predictionMarketFactoryAddress ||
            /^0x0{40}$/i.test(chainCfg.predictionMarketFactoryAddress)) {
          continue
        }

        const leaseKey = `prediction_market_settlement_${chainCfg.chainId}`
        const acquired = await tryAcquireLease(leaseKey, LEASE_TTL_MS)
        if (!acquired) continue

        try {
          await processPredictionMarkets(runId, chainCfg.chainId)
        } catch (err) {
          console.error(`🪙 Run #${runId}: chain ${chainCfg.chainId} error:`, err)
        }
      }

      console.log(`🪙 Run #${runId}: completed in ${Date.now() - startedAt}ms`)
    } catch (err) {
      console.error(`🪙 Run #${runId}: executor error:`, err)
    }
  }

  run()
  setInterval(run, POLL_INTERVAL_MS)
}

async function processPredictionMarkets(runId: number, chainId: number) {
  const client = getPublicClient(chainId) as PublicClient
  const wallet = getWalletClient(chainId) as WalletClient
  if (!wallet) return

  let marketCount: number
  try {
    marketCount = Number(await getPredictionMarketCount(chainId))
  } catch {
    return
  }

  const now = Math.floor(Date.now() / 1000)
  console.log(`🪙 Run #${runId}: scanning ${marketCount} prediction markets on chain ${chainId}`)

  for (let marketId = 0; marketId < marketCount; marketId++) {
    const rawAddr = await getPredictionMarketAddress(marketId, chainId).catch(() => null)
    if (!rawAddr || /^0x0{40}$/i.test(rawAddr)) continue

    const marketAddr = getAddress(rawAddr)

    let status: number
    let closingTime: number
    try {
      const [s, ct] = await Promise.all([
        client.readContract({
          address: marketAddr,
          abi: PredictionMarketAbi,
          functionName: "status",
        }) as Promise<number>,
        client.readContract({
          address: marketAddr,
          abi: PredictionMarketAbi,
          functionName: "closingTime",
        }) as Promise<bigint>,
      ])
      status = Number(s)
      closingTime = Number(ct)
    } catch (err: any) {
      console.error(`🪙 Market #${marketId} (${marketAddr}): failed to read state: ${err?.shortMessage ?? err?.message}`)
      continue
    }

    if (status !== STATUS_OPEN) continue
    if (closingTime === 0) continue // open-ended markets stay manual
    if (now < closingTime) continue

    await executeResolve({ runId, marketId, marketAddr, chainId, client, wallet })
  }
}

async function executeResolve(params: {
  runId: number
  marketId: number
  marketAddr: `0x${string}`
  chainId: number
  client: PublicClient
  wallet: WalletClient
}) {
  const key = `${params.marketAddr}:resolve`
  if (inFlight.has(key)) return
  inFlight.add(key)

  try {
    await withTxMutex(async () => {
      // 1. Read the oracle wiring straight from the market.
      const [asset, priceFeed] = await Promise.all([
        params.client.readContract({
          address: params.marketAddr,
          abi: PredictionMarketAbi,
          functionName: "asset",
        }) as Promise<string>,
        params.client.readContract({
          address: params.marketAddr,
          abi: PredictionMarketAbi,
          functionName: "priceFeed",
        }) as Promise<`0x${string}`>,
      ])

      console.log(
        `🪙 Market #${params.marketId} (${params.marketAddr.slice(0, 8)}…): resolving via oracle — asset=${asset} feed=${priceFeed}`,
      )

      // 2. Push a fresh price into the oracle. The PriceOracle helper is the
      //    same one the Bet settlement worker uses; it scales the CoinGecko
      //    price to the oracle's decimals and submits reportPrice().
      const reportTx = await reportLatestOraclePrice(asset, getAddress(priceFeed), params.client, params.wallet)
      console.log(`🪙 Market #${params.marketId}: reported latest ${asset} price, tx=${reportTx}`)

      // 3. Trigger the on-chain self-resolve. resolveByOracle reads the feed,
      //    compares to the stored threshold, and decides yesWins.
      await simulateBeforeWrite(params.client, params.wallet, {
        address: params.marketAddr,
        abi: PredictionMarketAbi,
        functionName: "resolveByOracle",
      })

      const tx = await writeContractWithAttribution(params.wallet, params.client, {
        address: params.marketAddr,
        abi: PredictionMarketAbi,
        functionName: "resolveByOracle",
      })

      const receipt = await params.client.waitForTransactionReceipt({ hash: tx })
      if (receipt.status !== "success") {
        throw new Error(`resolveByOracle reverted: ${tx}`)
      }

      const [yesWins, settledPrice] = await Promise.all([
        params.client.readContract({
          address: params.marketAddr,
          abi: PredictionMarketAbi,
          functionName: "yesWins",
        }) as Promise<boolean>,
        params.client.readContract({
          address: params.marketAddr,
          abi: PredictionMarketAbi,
          functionName: "settledPrice",
        }) as Promise<bigint>,
      ])

      console.log(
        `🪙 Market #${params.marketId}: resolved yesWins=${yesWins} settledPrice=${settledPrice.toString()} tx=${tx}`,
      )
    })
  } catch (err: any) {
    // Sub-spread fallback path: if resolveByOracle reverts (stale oracle,
    // misconfigured feed, etc.), the factory owner can still call
    // factory.resolveMarket(marketId, yesWins, "manual: …") to unblock.
    console.error(
      `🪙 Market #${params.marketId}: resolve failed:`,
      err?.shortMessage ?? err?.message ?? err,
    )
  } finally {
    inFlight.delete(key)
  }
}
