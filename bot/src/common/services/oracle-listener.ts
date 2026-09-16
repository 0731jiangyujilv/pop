import { getAddress, type PublicClient } from "viem"
import { config } from "../config"
import { prisma } from "../db"
import { PriceOracleFactoryAbi } from "./blockchain"
import { getPublicClient, SUPPORTED_CHAINS } from "../chains"
import { enqueueVerification } from "./verification-queue"

const POLL_INTERVAL_MS = config.POLL_INTERVAL_MS

export async function startOracleListener() {
  // Sync all chains that have a price oracle factory configured
  for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
    if (!chainCfg.priceOracleFactoryAddress) continue
    try {
      await syncOracleRegistryFromChain(chainCfg.chainId)
    } catch (error) {
      console.error(`[oracle-listener] chain ${chainCfg.chainId} initial sync error:`, error)
    }
  }

  const run = async () => {
    for (const chainCfg of Object.values(SUPPORTED_CHAINS)) {
      if (!chainCfg.priceOracleFactoryAddress) continue
      try {
        await pollOracleFactoryEvents(chainCfg.chainId)
      } catch (error) {
        console.error(`[oracle-listener] chain ${chainCfg.chainId} error:`, error)
      }
    }
  }

  await run()
  setInterval(run, POLL_INTERVAL_MS)
}

export async function syncOracleRegistryFromChain(chainId: number) {
  const chainCfg = SUPPORTED_CHAINS[chainId]
  if (!chainCfg?.priceOracleFactoryAddress) return

  const client = getPublicClient(chainId) as PublicClient
  const factoryAddress = getAddress(chainCfg.priceOracleFactoryAddress)

  const count = await client.readContract({
    address: factoryAddress,
    abi: PriceOracleFactoryAbi as any,
    functionName: "getOracleCount",
  } as any) as bigint

  const activeAssets = new Set<string>()

  for (let i = 0n; i < count; i++) {
    const info = await client.readContract({
      address: factoryAddress,
      abi: PriceOracleFactoryAbi as any,
      functionName: "getOracleInfoAt",
      args: [i],
    } as any) as { asset: string; oracle: string; decimals: number; description: string }

    activeAssets.add(info.asset)

    await prisma.oracleRegistry.upsert({
      where: { chainId_asset: { chainId, asset: info.asset } },
      update: {
        oracleAddress: String(info.oracle).toLowerCase(),
        decimals: Number(info.decimals),
        description: info.description,
        isActive: true,
      },
      create: {
        chainId,
        asset: info.asset,
        oracleAddress: String(info.oracle).toLowerCase(),
        decimals: Number(info.decimals),
        description: info.description,
        isActive: true,
      },
    })

    await enqueueVerification({
      contractAddress: String(info.oracle),
      kind: "PRICE_ORACLE",
    })
  }

  // Mark oracles not found on-chain as inactive for this chain
  await prisma.oracleRegistry.updateMany({
    where: { chainId, asset: { notIn: [...activeAssets] } },
    data: { isActive: false },
  })
}

async function pollOracleFactoryEvents(chainId: number) {
  const chainCfg = SUPPORTED_CHAINS[chainId]
  if (!chainCfg?.priceOracleFactoryAddress) return

  const client = getPublicClient(chainId) as PublicClient
  const factoryAddress = getAddress(chainCfg.priceOracleFactoryAddress)
  const cursorKey = `oracle_listener_last_block_${chainId}`

  const cursor = await prisma.cursor.findUnique({ where: { key: cursorKey } })
  const currentBlock = await client.getBlockNumber()
  const fromBlock = cursor ? BigInt(cursor.value) + 1n : currentBlock

  if (fromBlock > currentBlock) return

  const logs = await client.getLogs({
    address: factoryAddress,
    fromBlock,
    toBlock: currentBlock,
    events: [
      {
        type: "event",
        name: "OracleAdded",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oracle", type: "address", indexed: true },
        ],
      },
      {
        type: "event",
        name: "OracleUpdated",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oldOracle", type: "address", indexed: true },
          { name: "newOracle", type: "address", indexed: true },
        ],
      },
      {
        type: "event",
        name: "OracleRemoved",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oracle", type: "address", indexed: true },
        ],
      },
      {
        type: "event",
        name: "OracleDescriptionUpdated",
        inputs: [
          { name: "asset", type: "string", indexed: false },
          { name: "oracle", type: "address", indexed: true },
          { name: "description", type: "string", indexed: false },
        ],
      },
    ],
  })

  if (logs.length > 0) {
    await syncOracleRegistryFromChain(chainId)
  }

  await prisma.cursor.upsert({
    where: { key: cursorKey },
    update: { value: currentBlock.toString() },
    create: { key: cursorKey, value: currentBlock.toString() },
  })
}
