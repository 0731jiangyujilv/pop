import type { Address, Chain } from 'viem'
import { arcTestnet } from './chains'
import {
  ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  ROBINHOOD_USDG_ADDRESS,
  robinhoodTestnet,
} from './robinhood'

export type OddsShiftDeployment = {
  chain: Chain
  defaultMarketAddress?: string
  expectedCollateralAddress?: Address
  expectedCollateralSymbol?: string
  faucetEnabled: boolean
  routeLabel: string
}

export const ARC_ODDS_SHIFT_DEPLOYMENT: OddsShiftDeployment = {
  chain: arcTestnet,
  defaultMarketAddress: '0x618689f025C862Fa0D2570ECc0eD5F4b72725d33',
  faucetEnabled: true,
  routeLabel: 'Arc OddsShift',
}

/** Same OddsShift trading UI, pinned to the live Robinhood EventMarketV2 + USDG. */
export const ROBINHOOD_ODDS_SHIFT_DEPLOYMENT: OddsShiftDeployment = {
  chain: robinhoodTestnet,
  defaultMarketAddress: ROBINHOOD_EVENT_MARKET_V2_ADDRESS,
  expectedCollateralAddress: ROBINHOOD_USDG_ADDRESS,
  expectedCollateralSymbol: 'USDG',
  faucetEnabled: false,
  routeLabel: 'Robinhood',
}
