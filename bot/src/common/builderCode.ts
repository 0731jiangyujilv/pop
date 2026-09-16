// Base Builder Code (ERC-8021) data suffix for transaction attribution
// Code: bc_g4ol9jca
// See: https://blog.base.dev/builder-codes-and-erc-8021-fixing-onchain-attribution
export const BASE_BUILDER_CODE_SUFFIX = '62635f67346f6c396a63610b0080218021802180218021802180218021';

// Base Builder Code is only recognized on Base mainnet and Base Sepolia.
export function isBaseChain(chainId: number | undefined): boolean {
  return chainId === 8453 || chainId === 84532;
}
