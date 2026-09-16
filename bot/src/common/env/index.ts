import local from "./local"
import production from "./production"

export type ChainEntry = {
  name: string
  betFactoryAddress: string
  priceOracleFactoryAddress: string
  eventBetFactoryAddress: string
  predictionMarketFactoryAddress: string
  usdcAddress: string
  explorerUrl: string
  verifierUrl: string
  isTestnet: boolean
}

export type EnvConfig = {
  PORT: number
  X_PORT: number
  API_BASE_URL: string
  WEBAPP_URL: string
  PUBLIC_WEBAPP_URL: string
  CHAIN_ID: number
  BET_FACTORY_ADDRESS: string
  PRICE_ORACLE_FACTORY_ADDRESS: string
  CONTRACTS_DIR: string
  VERIFIER_URL: string
  VERIFY_ENABLED: boolean
  VERIFY_POLL_INTERVAL_MS: number
  BOT_X_USERNAME: string
  X_API_BASE_URL: string
  X_API_BOT_USER_ID: string
  POLL_INTERVAL_MS: number
  SETTLEMENT_CRON_INTERVAL_MS: number
  DEFAULT_MIN_AMOUNT: number
  DEFAULT_MAX_AMOUNT: number
  CREATOR_FEE_BPS: number
  TOTAL_FEE_BPS: number
  CHAINS: Record<number, ChainEntry>
}

const envConfigs: Record<string, EnvConfig> = { local, production }

const envName = process.env.NODE_ENV === "production" ? "production" : "local"

export const envConfig: EnvConfig = envConfigs[envName]

console.log(`[env] Using ${envName} config`)
