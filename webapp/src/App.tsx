import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/config/wagmi'
import { AuthProvider } from '@/contexts/AuthContext'
import { useAuth } from '@/hooks/useAuth'
import { captureReferralCode, connectPendingReferral } from '@/lib/referrals'
// import { HomePage } from '@/pages/HomePage'
// import { ExploreMarketPage } from '@/pages/ExploreMarketPage'
import { FedMarketsPage } from '@/pages/FedMarketsPage'
import { CryptoMarketsPage } from '@/pages/CryptoMarketsPage'
import { MidtermMarketsPage } from '@/pages/MidtermMarketsPage'
import { NflCalendarPage } from '@/pages/NflCalendarPage'
// import { DocumentationPage } from '@/pages/DocumentationPage'
import { EventMarketAmmPage } from '@/pages/EventMarketAmmPage'
import { EventMarketStatsPage } from '@/pages/EventMarketStatsPage'
import { StaticResultPage } from '@/pages/StaticResultPage'
import { LpPage } from '@/pages/LpPage'
import { StaticLpPage } from '@/pages/StaticLpPage'
import { EventMarketDetailPage } from '@/pages/EventMarketDetailPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { ChampionPoolHistoryPage } from '@/pages/ChampionPoolHistoryPage'
import { OddsShiftPage } from '@/pages/OddsShiftPage'
// Other pages are parked while the app focuses on the FIFA AMM markets.
// import { CreateBetPage } from '@/pages/CreateBetPage'
// import { BetPage } from '@/pages/BetPage'
// import { StatsPage } from '@/pages/StatsPage'
// import { SharePage } from '@/pages/SharePage'
// import { EventMarketCreatePage } from '@/pages/EventMarketCreatePage'
// import { EventMarketPage } from '@/pages/EventMarketPage'
// import { EventOraclesPage } from '@/pages/EventOraclesPage'
// import { OracleSwarmPage } from '@/pages/OracleSwarmPage'
// import { MarketPage } from '@/pages/MarketPage'
// import { CreateMarketPage } from '@/pages/CreateMarketPage'

const queryClient = new QueryClient()

function ReferralTracker() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    captureReferralCode(location.search)
  }, [location.search])

  useEffect(() => {
    if (isAuthenticated) void connectPendingReferral()
  }, [isAuthenticated])

  return null
}

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ReferralTracker />
            <Routes>
              <Route path="/" element={<FedMarketsPage/>} />
              {/* <Route path="/explore" element={<ExploreMarketPage />} /> */}
              <Route path="/fed" element={<FedMarketsPage />} />
              <Route path="/crypto" element={<CryptoMarketsPage />} />
              <Route path="/midterm" element={<MidtermMarketsPage />} />
              <Route path="/nfl" element={<NflCalendarPage />} />
              <Route path="/champion-history" element={<ChampionPoolHistoryPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/stats" element={<EventMarketStatsPage />} />
              <Route path="/stats/:chainId/:address" element={<EventMarketStatsPage />} />
              {/* <Route path="/docs" element={<DocumentationPage />} /> */}
              {/* <Route path="/create/:betId" element={<CreateBetPage />} />
              <Route path="/bet/:contractAddress" element={<BetPage />} />
              <Route path="/share/:contractAddress" element={<SharePage />} />
              <Route path="/event/create/:betId" element={<EventMarketCreatePage />} />
              <Route path="/event/:contractAddress" element={<EventMarketPage />} />
              <Route path="/event/:contractAddress/oracles" element={<EventOraclesPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/swarm" element={<OracleSwarmPage />} />
              <Route path="/market/create" element={<CreateMarketPage />} />
              <Route path="/market/:contractAddress" element={<MarketPage />} /> */}
              <Route path="/fifa/:contractAddress" element={<EventMarketAmmPage />} />
              <Route path="/fifa/:contractAddress/lp" element={<LpPage />} />
              <Route path="/fifa/:contractAddress/stats" element={<EventMarketDetailPage />} />
              {/* OddsShift demo — address comes straight from the path, no registry. */}
              <Route path="/oddsshift/:contractAddress" element={<OddsShiftPage />} />
              <Route path="/hook" element={<OddsShiftPage />} />
              <Route path="/result/:slug" element={<StaticResultPage />} />
              <Route path="/result/:slug/lp" element={<StaticLpPage />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
