/**
 * Non-sensitive configuration for production.
 * Selected when Vite mode === "production" (i.e. `npm run build`).
 */

export interface WebappChainEntry {
  betFactoryAddress: string
  usdcAddress: string
  eventBetFactoryAddress: string
  priceOracleFactoryAddress: string
  predictionMarketFactoryAddress: string
  explorerUrl: string
  isTestnet: boolean
}

export type WebappEnvConfig = {
  botApiUrl: string
  betPorAddress: `0x${string}`
  chains: Record<number, WebappChainEntry>
}

const config: WebappEnvConfig = {
  botApiUrl: "https://populab.xyz",
  betPorAddress: "0x0000000000000000000000000000000000000000",

  chains: {
    84532: {
      betFactoryAddress: "0xa548BD2E738b157Ee4fFc3Ee9A3444C1B8056a00",
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      eventBetFactoryAddress: "0x21A1e04521Ac467eb053419D791ac9F7d401daAA",
      priceOracleFactoryAddress: "0xc3f06B9D116B2F3522F7731d5Eed7B63714AAA2F",
      predictionMarketFactoryAddress: "0xf14474Bb2Db1d1433531aE6Bf67BD401aC0D2403",
      explorerUrl: "https://sepolia.basescan.org",
      isTestnet: true,
    },
    8453: {
      betFactoryAddress: "0x2Aa1ABd3598e21DcA0a9412ba55E0e6fA100d9C6",
      eventBetFactoryAddress: "0x0000000000000000000000000000000000000000",
      priceOracleFactoryAddress: "0xa8873f14788cd94eF6b364994a1574bD7F4D678E",
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      predictionMarketFactoryAddress: "0x0000000000000000000000000000000000000000",
      explorerUrl: "https://basescan.org",
      isTestnet: false,
    },
    // Uncomment when Arc Testnet contracts are deployed:
    5042002: {
      betFactoryAddress: "0xb9757A465EbA11ADf184e8F9F3744765cf0e0eb3",
      usdcAddress: "0x465F603C113645b8d2086BAA85B3B513a928fb5B", // MockUSDC (faucet-mintable)
      eventBetFactoryAddress: "0x201d6eFDC97a45419490D3F28c9d0Cbb4a603F6F",
      priceOracleFactoryAddress: "0x7193499abD9E27C46Ded1eDbcaeca786D7a1535a",
      predictionMarketFactoryAddress: "0x4b1F79B0DDd327C6e517d6243d82355FF28F3C56",
      explorerUrl: "https://testnet.arcscan.app/",
      isTestnet: true,
    },
    // 97: {
    //   betFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   usdcAddress: "0x49758E29b06cB7EeD00D21416dfb62c06B0503C7",
    //   eventBetFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   priceOracleFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   predictionMarketFactoryAddress: "0x0000000000000000000000000000000000000000",
    //   explorerUrl: "https://testnet.bscscan.com",
    //   isTestnet: true,
    // },
  },
}

export default config
