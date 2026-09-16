/**
 * Non-sensitive configuration for production.
 * Selected when NODE_ENV === "production".
 */
export default {
  // Server
  PORT: 3200,
  X_PORT: 3100,
  API_BASE_URL: "https://populab.xyz",

  // Web app URLs
  WEBAPP_URL: "https://populab.xyz",
  PUBLIC_WEBAPP_URL: "https://populab.xyz",

  // Blockchain defaults (backward compat — first chain)
  CHAIN_ID: 84532,
  BET_FACTORY_ADDRESS: "0x49758E29b06cB7EeD00D21416dfb62c06B0503C7",
  PRICE_ORACLE_FACTORY_ADDRESS: "0xc3f06B9D116B2F3522F7731d5Eed7B63714AAA2F",

  // Contract verification
  CONTRACTS_DIR: "../contracts",
  VERIFIER_URL: "https://api.etherscan.io/v2/api?chainid=84532",
  VERIFY_ENABLED: true,
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
  CHAINS: {
    84532: {
      name: "Base Sepolia",
      betFactoryAddress: "0xa548BD2E738b157Ee4fFc3Ee9A3444C1B8056a00",
      priceOracleFactoryAddress: "0xc3f06B9D116B2F3522F7731d5Eed7B63714AAA2F",
      eventBetFactoryAddress: "0x21A1e04521Ac467eb053419D791ac9F7d401daAA", // TODO: deploy
      predictionMarketFactoryAddress: "0xc007600Bfc63450082d6565CFA8E2D7529bCAFB1",
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      explorerUrl: "https://sepolia.basescan.org",
      verifierUrl: "https://api.etherscan.io/v2/api?chainid=84532",
      isTestnet: true,
    },
    // Uncomment when Base Mainnet contracts are deployed:
    8453: {
      name: "Base",
      betFactoryAddress: "0x2Aa1ABd3598e21DcA0a9412ba55E0e6fA100d9C6",
      priceOracleFactoryAddress: "0xa8873f14788cd94eF6b364994a1574bD7F4D678E",
      eventBetFactoryAddress: "0x0000000000000000000000000000000000000000", // TODO: deploy
      predictionMarketFactoryAddress: "0x0000000000000000000000000000000000000000", // TODO: deploy
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      explorerUrl: "https://basescan.org",
      verifierUrl: "https://api.etherscan.io/v2/api?chainid=8453",
      isTestnet: false,
    },
    // Uncomment when Arc Testnet contracts are deployed:
    5042002: {
      name: "Arc Testnet",
      betFactoryAddress: "0xb9757A465EbA11ADf184e8F9F3744765cf0e0eb3",
      priceOracleFactoryAddress: "0x7193499abD9E27C46Ded1eDbcaeca786D7a1535a",
      eventBetFactoryAddress: "0x201d6eFDC97a45419490D3F28c9d0Cbb4a603F6F", // TODO: deploy
      predictionMarketFactoryAddress: "0x4b1F79B0DDd327C6e517d6243d82355FF28F3C56",
      usdcAddress: "0x465F603C113645b8d2086BAA85B3B513a928fb5B", // MockUSDC (faucet-mintable)
      explorerUrl: "https://testnet.arcscan.app/",
      verifierUrl: "https://sourcify.dev/server/v2/verify",
      isTestnet: true,
    },
    // 97: {
    //   name: "BSC Testnet",
    //   betFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   priceOracleFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   eventBetFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   predictionMarketFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   usdcAddress: "0x0000000000000000000000000000000000000000",
    //   explorerUrl: "https://testnet.bscscan.com",
    //   verifierUrl: "https://api.etherscan.io/v2/api?chainid=97",
    //   isTestnet: true,
    // },
  },
}
