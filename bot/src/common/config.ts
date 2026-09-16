import "dotenv/config"
import { z } from "zod"
import { envConfig } from "./env"

// Zod schema for secrets only — everything else comes from env config files
const secretsSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BOT_PRIVATE_KEY: z.string().default(""),
  JWT_SECRET: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  COINGECKO_API_KEY: z.string().default(""),
  BASESCAN_API_KEY: z.string().default(""),
  X_API_BEARER_TOKEN: z.string().default(""),
  X_API_ACCESS_TOKEN: z.string().default(""),
  X_API_CONSUMER_KEY: z.string().default(""),
  X_API_CONSUMER_SECRET: z.string().default(""),
  X_API_ACCESS_TOKEN_SECRET: z.string().default(""),
  UNISWAP_API_KEY: z.string().default(""),
  UNISWAP_FEE_BPS: z.coerce.number().int().min(0).max(250).default(0),
  UNISWAP_FEE_RECIPIENT: z.string().default(""),
})

const secrets = secretsSchema.parse(process.env)

// Merge secrets + env config into a single config object (same shape as before)
export const config = {
  ...envConfig,
  ...secrets,
}

export const publicWebappUrl = envConfig.PUBLIC_WEBAPP_URL || envConfig.WEBAPP_URL
