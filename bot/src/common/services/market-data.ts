import { config } from "../config"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const COINS_LIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const COINS_LIST_CACHE_FILE_PATH = path.resolve(process.cwd(), ".cache/coingecko-coins-list.json")
const ASSET_ID_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ASSET_ID_CACHE_FILE_PATH = path.resolve(process.cwd(), ".cache/coingecko-asset-id-map.json")

interface CoinGeckoCoin {
  id: string
  symbol: string
}

interface CoinsListCacheFile {
  fetchedAt: number
  coins: CoinGeckoCoin[]
}

interface AssetIdResolution {
  coinGeckoId: string
  resolvedAt: number
}

interface AssetIdCacheFile {
  updatedAt: number
  mappings: Record<string, AssetIdResolution>
}

const MANUAL_COINGECKO_ID_OVERRIDES_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  LINK: "chainlink",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  UNI: "uniswap",
  GAME: "game-by-virtuals"
}

let coinsListCache: CoinGeckoCoin[] | null = null
let coinsListFetchedAt = 0
let assetIdCache: Record<string, AssetIdResolution> | null = null

function isLikelyDerivativeId(coinId: string, symbolLower: string): boolean {
  return coinId.startsWith(`${symbolLower}-`)
    || coinId.endsWith(`-${symbolLower}`)
    || coinId.includes("wrapped")
}

function pickBestSymbolMatch(symbolLower: string, matched: CoinGeckoCoin[]): CoinGeckoCoin | null {
  if (matched.length === 0) return null
  if (matched.length === 1) return matched[0]

  const sorted = [...matched]
    .map((coin) => {
      let score = 0
      if (coin.id === symbolLower) score += 100
      if (coin.id.startsWith(`${symbolLower}-`)) score += 70
      if (coin.id.includes(symbolLower)) score += 20
      if (isLikelyDerivativeId(coin.id, symbolLower)) score -= 25
      return { coin, score }
    })
    .sort((a, b) => b.score - a.score || a.coin.id.localeCompare(b.coin.id))

  const best = sorted[0]
  const second = sorted[1]
  if (!best) return null
  if (!second || best.score > second.score) return best.coin
  return null
}

function normalizeAssetPair(asset: string): string {
  return asset.trim().toUpperCase()
}

function extractSymbolFromUsdPair(asset: string): string {
  const normalizedAsset = normalizeAssetPair(asset)
  const [symbol, quote] = normalizedAsset.split("/")
  if (!symbol || quote !== "USD") {
    throw new Error(`Unsupported asset format for CoinGecko price reporting: ${asset}. Expected SYMBOL/USD`)
  }

  return symbol
}

function buildCoinsListUrl() {
  const url = new URL("https://pro-api.coingecko.com/api/v3/coins/list")
  url.searchParams.set("include_platform", "true")
  if (config.COINGECKO_API_KEY) {
    url.searchParams.set("x_cg_pro_api_key", config.COINGECKO_API_KEY)
  }
  return url
}

function isCacheFresh(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < COINS_LIST_CACHE_TTL_MS
}

async function readCoinsListCacheFile(): Promise<CoinsListCacheFile | null> {
  try {
    const raw = await readFile(COINS_LIST_CACHE_FILE_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<CoinsListCacheFile>
    if (!parsed || typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.coins)) {
      return null
    }

    const coins = parsed.coins
      .filter((coin): coin is CoinGeckoCoin => typeof coin?.id === "string" && typeof coin?.symbol === "string")
      .map((coin) => ({ id: coin.id, symbol: coin.symbol }))

    return {
      fetchedAt: parsed.fetchedAt,
      coins,
    }
  } catch {
    return null
  }
}

async function writeCoinsListCacheFile(payload: CoinsListCacheFile): Promise<void> {
  await mkdir(path.dirname(COINS_LIST_CACHE_FILE_PATH), { recursive: true })
  await writeFile(COINS_LIST_CACHE_FILE_PATH, JSON.stringify(payload), "utf8")
}

async function readAssetIdCacheFile(): Promise<AssetIdCacheFile | null> {
  try {
    const raw = await readFile(ASSET_ID_CACHE_FILE_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<AssetIdCacheFile>
    if (!parsed || typeof parsed.updatedAt !== "number" || typeof parsed.mappings !== "object" || parsed.mappings === null) {
      return null
    }

    const mappings = Object.entries(parsed.mappings)
      .filter((entry): entry is [string, AssetIdResolution] => {
        const [asset, value] = entry
        return typeof asset === "string"
          && typeof value?.coinGeckoId === "string"
          && typeof value?.resolvedAt === "number"
      })
      .reduce<Record<string, AssetIdResolution>>((acc, [asset, value]) => {
        acc[asset] = value
        return acc
      }, {})

    return {
      updatedAt: parsed.updatedAt,
      mappings,
    }
  } catch {
    return null
  }
}

async function writeAssetIdCacheFile(mappings: Record<string, AssetIdResolution>): Promise<void> {
  await mkdir(path.dirname(ASSET_ID_CACHE_FILE_PATH), { recursive: true })
  const payload: AssetIdCacheFile = {
    updatedAt: Date.now(),
    mappings,
  }
  await writeFile(ASSET_ID_CACHE_FILE_PATH, JSON.stringify(payload), "utf8")
}

async function getAssetIdCache(): Promise<Record<string, AssetIdResolution>> {
  if (assetIdCache) return assetIdCache
  const cached = await readAssetIdCacheFile()
  assetIdCache = cached?.mappings || {}
  return assetIdCache
}

async function upsertAssetIdResolution(asset: string, coinGeckoId: string): Promise<void> {
  const mappings = await getAssetIdCache()
  mappings[asset] = {
    coinGeckoId,
    resolvedAt: Date.now(),
  }
  await writeAssetIdCacheFile(mappings)
}

async function fetchCoinsList(): Promise<CoinGeckoCoin[]> {
  const now = Date.now()
  if (coinsListCache && isCacheFresh(coinsListFetchedAt, now)) {
    return coinsListCache
  }

  const localCache = await readCoinsListCacheFile()
  if (localCache) {
    coinsListCache = localCache.coins
    coinsListFetchedAt = localCache.fetchedAt
    if (isCacheFresh(localCache.fetchedAt, now)) {
      return coinsListCache
    }
  }

  try {
    const response = await fetch(buildCoinsListUrl().toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "betsys-bot/1.0",
      },
    })

    if (!response.ok) {
      throw new Error(`CoinGecko coins list request failed: ${buildCoinsListUrl().toString()} ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as Array<Partial<CoinGeckoCoin>>
    coinsListCache = data
      .filter((coin): coin is CoinGeckoCoin => typeof coin?.id === "string" && typeof coin?.symbol === "string")
      .map((coin) => ({ id: coin.id, symbol: coin.symbol }))
    coinsListFetchedAt = now

    await writeCoinsListCacheFile({ fetchedAt: coinsListFetchedAt, coins: coinsListCache })
    return coinsListCache
  } catch (error) {
    if (coinsListCache && coinsListCache.length > 0) {
      return coinsListCache
    }

    throw error
  }
}

export async function resolveCoinGeckoIdForAsset(asset: string, overrideCoinGeckoId?: string): Promise<string> {
  const normalizedAsset = normalizeAssetPair(asset)
  const symbol = extractSymbolFromUsdPair(normalizedAsset)
  const symbolLower = symbol.toLowerCase()
  const coins = await fetchCoinsList()
  const now = Date.now()

  if (overrideCoinGeckoId) {
    const trimmed = overrideCoinGeckoId.trim()
    if (!trimmed) {
      throw new Error(`Invalid coinGeckoId override for ${normalizedAsset}`)
    }
    if (!coins.some((coin) => coin.id === trimmed)) {
      throw new Error(`CoinGecko id '${trimmed}' not found in coins list for ${normalizedAsset}`)
    }
    await upsertAssetIdResolution(normalizedAsset, trimmed)
    return trimmed
  }

  const assetMappings = await getAssetIdCache()
  const cachedMapping = assetMappings[normalizedAsset]
  if (cachedMapping && now - cachedMapping.resolvedAt < ASSET_ID_CACHE_TTL_MS) {
    if (coins.some((coin) => coin.id === cachedMapping.coinGeckoId)) {
      return cachedMapping.coinGeckoId
    }
  }

  const preferredId = MANUAL_COINGECKO_ID_OVERRIDES_BY_SYMBOL[symbol]
  if (preferredId && coins.some((coin) => coin.id === preferredId)) {
    await upsertAssetIdResolution(normalizedAsset, preferredId)
    return preferredId
  }

  const matched = coins.filter((coin) => coin.symbol.toLowerCase() === symbolLower)

  if (matched.length === 0) {
    throw new Error(`CoinGecko coin not found for asset: ${asset}`)
  }

  const preferred = pickBestSymbolMatch(symbolLower, matched)
  if (!preferred) {
    const previewIds = matched.slice(0, 8).map((coin) => coin.id).join(", ")
    throw new Error(`Ambiguous CoinGecko symbol match for ${normalizedAsset}. Candidates: ${previewIds}. Pass --coingecko-id <id> to disambiguate.`)
  }

  await upsertAssetIdResolution(normalizedAsset, preferred.id)
  return preferred.id
}

export async function fetchAssetPriceQuote(asset: string): Promise<{ asset: string; coinGeckoId: string; price: string }> {
  const normalizedAsset = normalizeAssetPair(asset)
  const coinGeckoId = await resolveCoinGeckoIdForAsset(normalizedAsset)

  const url = new URL("https://pro-api.coingecko.com/api/v3/simple/price")
  url.searchParams.set("vs_currencies", "usd")
  url.searchParams.set("ids", coinGeckoId)
  if (config.COINGECKO_API_KEY) {
    url.searchParams.set("x_cg_pro_api_key", config.COINGECKO_API_KEY)
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "betsys-bot/1.0",
    },
  })

  if (!response.ok) {
    throw new Error(`CoinGecko price request failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as Record<string, { usd?: number }>
  const usdPrice = data[coinGeckoId]?.usd
  if (typeof usdPrice !== "number" || usdPrice <= 0) {
    throw new Error(`CoinGecko returned invalid price for ${normalizedAsset}`)
  }

  return {
    asset: normalizedAsset,
    coinGeckoId,
    price: usdPrice.toString(),
  }
}

export async function fetchAssetPrice(asset: string): Promise<string> {
  const quote = await fetchAssetPriceQuote(asset)
  return quote.price
}
