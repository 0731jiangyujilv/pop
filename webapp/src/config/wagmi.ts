import { http, createConfig } from 'wagmi'
import { baseSepolia, base, bscTestnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { arcTestnet } from './chains'

const BASE_RPC_URL = import.meta.env.VITE_BASE_RPC_URL || undefined
const BASE_SEPOLIA_RPC_URL = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || undefined
const BSC_TESTNET_RPC_URL = import.meta.env.VITE_BSC_TESTNET_RPC_URL || 'https://bnb-testnet.g.alchemy.com/v2/RZKLdozAv95H_gtPTsOm-'

// All chains the app supports — add more here as needed
const chains = [baseSepolia, base, arcTestnet, bscTestnet] as const

export const config = createConfig({
  chains,
  // Disable EIP-6963 auto-discovery: otherwise installed extensions announce
  // themselves AND our explicit connectors are listed, producing duplicate
  // "MetaMask"/"Coinbase Wallet" entries in the chooser. With discovery off,
  // only the two connectors below are offered.
  multiInjectedProviderDiscovery: false,
  // Only MetaMask and Coinbase Wallet are offered in the connect modal.
  // We use the lightweight `injected` connectors (browser-extension detection)
  // instead of the metaMask()/coinbaseWallet() SDK connectors, which pull in
  // heavy native deps (@metamask/sdk, @coinbase/wallet-sdk) that aren't
  // installed — that missing import was what broke the Connect Wallet button.
  connectors: [
    injected({ target: 'metaMask' }),
    injected({ target: 'coinbaseWallet' }),
  ],
  transports: {
    [baseSepolia.id]: http(BASE_SEPOLIA_RPC_URL),
    [base.id]: http(BASE_RPC_URL),
    [arcTestnet.id]: http(),
    [bscTestnet.id]: http(BSC_TESTNET_RPC_URL),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
