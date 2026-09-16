/**
 * Non-sensitive configuration for local development.
 * Selected when NODE_ENV !== "production".
 */
export default {
  // Server
  PORT: 3000,
  X_PORT: 3100,
  API_BASE_URL: "http://localhost:3000",

  // Web app URLs
  WEBAPP_URL: "http://localhost:5173",
  PUBLIC_WEBAPP_URL: "http://localhost:5173",

  // Blockchain defaults (backward compat)
  CHAIN_ID: 84532,
  BET_FACTORY_ADDRESS: "0x7d2b18a988c38b027420B6F162C1685c4c815e3A",
  PRICE_ORACLE_FACTORY_ADDRESS: "0xb4f67d7A5d4f04Cc29fE34Fca2A1E73d9aBFbeFe",

  // Contract verification
  CONTRACTS_DIR: "../contracts",
  VERIFIER_URL: "https://api.etherscan.io/v2/api?chainid=84532",
  VERIFY_ENABLED: false,
  VERIFY_POLL_INTERVAL_MS: 60_000,

  // X (Twitter) bot
  BOT_X_USERNAME: "_POP",
  X_API_BASE_URL: "https://api.x.com",
  X_API_BOT_USER_ID: "1434000620042665992",

  // Polling & timing
  POLL_INTERVAL_MS: 15_000,
  SETTLEMENT_CRON_INTERVAL_MS: 60_000,

  // Bet defaults
  DEFAULT_MIN_AMOUNT: 1,
  DEFAULT_MAX_AMOUNT: 1000,
  CREATOR_FEE_BPS: 30,
  TOTAL_FEE_BPS: 100,

  // Multi-chain configuration
  // Only chains listed here will be active. Add a chain entry to enable it.
  CHAINS: {
    84532: {
      name: "Base Sepolia",
      betFactoryAddress: "0x7d2b18a988c38b027420B6F162C1685c4c815e3A",
      priceOracleFactoryAddress: "0xb4f67d7A5d4f04Cc29fE34Fca2A1E73d9aBFbeFe",
      eventBetFactoryAddress: "0x0000000000000000000000000000000000000000", // TODO: deploy
      predictionMarketFactoryAddress: "0xf14474Bb2Db1d1433531aE6Bf67BD401aC0D2403",
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      explorerUrl: "https://sepolia.basescan.org",
      verifierUrl: "https://api.etherscan.io/v2/api?chainid=84532",
      isTestnet: true,
    },
    5042002: {
      name: "Arc Testnet",
      betFactoryAddress: "0x7f1CCFB34D3a28e523806Efd960599031e4011E7",
      priceOracleFactoryAddress: "0x7D4089369c704687f10cC14c7fFB6de24eBb81Df",
      eventBetFactoryAddress: "0x0000000000000000000000000000000000000000", // TODO: deploy
      predictionMarketFactoryAddress: "0x4b1F79B0DDd327C6e517d6243d82355FF28F3C56",
      usdcAddress: "0x465F603C113645b8d2086BAA85B3B513a928fb5B", // MockUSDC (faucet-mintable)
      explorerUrl: "https://testnet.arcscan.app/",
      verifierUrl: "https://sourcify.dev/server/v2/verify",
      isTestnet: true,
    },
    97: {
      name: "BSC Testnet",
      betFactoryAddress: "0x0000000000000000000000000000000000000000",
      priceOracleFactoryAddress: "0x0000000000000000000000000000000000000000",
      eventBetFactoryAddress: "0x0000000000000000000000000000000000000000",
      predictionMarketFactoryAddress: "0x0000000000000000000000000000000000000000",
      usdcAddress: "0x0000000000000000000000000000000000000000",
      explorerUrl: "https://testnet.bscscan.com",
      verifierUrl: "https://api.etherscan.io/v2/api?chainid=97",
      isTestnet: true,
    },
  },
}
