import local from "./local"
import production from "./production"
import type { WebappEnvConfig } from "./local"

const envConfigs: Record<string, WebappEnvConfig> = { local, production }

const mode = import.meta.env.MODE === "production" ? "production" : "local"

export const envConfig: WebappEnvConfig = envConfigs[mode]

export type { WebappEnvConfig, WebappChainEntry } from "./local"
