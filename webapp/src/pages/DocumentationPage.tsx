import { SiteNav } from '@/components/SiteNav'

// ── Sidebar table of contents ───────────────────────────────────────────────
const SECTIONS: { id: string; title: string }[] = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'how-it-works', title: 'How it works' },
  { id: 'outcome-tokens', title: 'Outcome tokens' },
  { id: 'amm-pricing', title: 'AMM & pricing' },
  { id: 'liquidity', title: 'Providing liquidity' },
  { id: 'fees', title: 'Fees' },
  { id: 'lifecycle', title: 'Market lifecycle' },
  { id: 'trading', title: 'Trading guide' },
  { id: 'resolution', title: 'Resolution & settlement' },
  { id: 'deployments', title: 'Deployments' },
  { id: 'faq', title: 'FAQ' },
]

// Uniswap-style deployment registry. The opener market is the only contract
// live on the demo; other networks are reserved for the production rollout.
const DEPLOYMENTS: { network: string; chainId: string; contract: string; address: string }[] = [
  { network: 'Base', chainId: '8453', contract: 'EventMarketFactory', address: 'Coming soon' },
  { network: 'Base Sepolia', chainId: '84532', contract: 'EventMarket (opener)', address: '0x5F2768818149c2017b61aC941b72981D970Ab06E' },
  { network: 'Arc Testnet', chainId: '5042002', contract: 'EventMarketFactory', address: 'Coming soon' },
]

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 pt-12 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
      {children}
    </h2>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 text-lg font-semibold tracking-[-0.01em]">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15px] leading-7 text-[var(--color-muted)]">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-[rgba(0,82,255,0.06)] px-1.5 py-0.5 text-[0.9em] text-[var(--color-cyan)]">
      {children}
    </code>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-[rgba(0,82,255,0.18)] bg-[rgba(0,82,255,0.04)] p-4 text-[15px] leading-7 text-[var(--color-ink)]">
      {children}
    </div>
  )
}

export function DocumentationPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-0)] text-[var(--color-ink)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,82,255,0.08),transparent_24%),radial-gradient(circle_at_85%_20%,rgba(0,82,255,0.06),transparent_18%)]" />
      <SiteNav />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 md:px-10">
        <div className="mt-6 grid gap-10 md:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="hidden md:block">
            <div className="sticky top-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Docs</p>
              <nav className="mt-4 space-y-1">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="block rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] transition hover:bg-[rgba(0,82,255,0.05)] hover:text-[var(--color-cyan)]"
                  >
                    {s.title}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <article className="min-w-0 max-w-[760px] pb-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-cyan)]">POP Protocol</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Documentation
            </h1>
            <P>
              POP turns any real-world question into a live, onchain prediction market. This guide
              explains how markets are priced, how to trade and provide liquidity, and how outcomes are
              resolved. It is written for both traders and developers integrating the protocol.
            </P>

            <H2 id="introduction">Introduction</H2>
            <P>
              A POP market is a binary market: every question resolves to either <Code>YES</Code> or
              <Code> NO</Code>. Each market is an independent smart contract that mints two outcome tokens,
              holds an automated market maker (AMM) for them, and pays out in USDC once the result is known.
            </P>
            <P>
              Unlike an order book, there is no counterparty to match. You always trade against a shared
              liquidity pool, so a market can be created and traded instantly with no waiting for a maker on
              the other side.
            </P>

            <H2 id="how-it-works">How it works</H2>
            <P>
              When a market is created, the initiator seeds it with USDC. That collateral mints an equal
              number of YES and NO tokens, which are deposited into a constant-product pool. Traders buy the
              side they believe in; the AMM adjusts the price along the curve as one side is bought up.
            </P>
            <P>
              Because YES and NO are always backed 1:1 by collateral, holding one YES <em>and</em> one NO is
              always worth exactly 1 USDC. This invariant is what lets the AMM quote a fair, self-balancing
              price and what guarantees winners can be paid at settlement.
            </P>

            <H2 id="outcome-tokens">Outcome tokens</H2>
            <P>
              Every market has two fungible outcome tokens with 6 decimals, matching USDC:
            </P>
            <H3>YES token</H3>
            <P>Redeems for 1 USDC each if the market resolves YES, and 0 otherwise.</P>
            <H3>NO token</H3>
            <P>Redeems for 1 USDC each if the market resolves NO, and 0 otherwise.</P>
            <Callout>
              1 YES + 1 NO = 1 USDC, always. You can mint or burn a balanced pair at any time before
              settlement via <Code>redeemPair</Code>, independent of the AMM price.
            </Callout>

            <H2 id="amm-pricing">AMM &amp; pricing</H2>
            <P>
              Prices come from a constant-product market maker over the YES and NO reserves. The implied
              probability of YES is simply its share of the pool:
            </P>
            <P>
              <Code>price(YES) = noReserve / (yesReserve + noReserve)</Code>
            </P>
            <P>
              Buying YES removes YES tokens from the pool and adds USDC-backed NO, pushing the YES price up
              and the NO price down — exactly mirroring how new information should move the odds. Each quote
              is available onchain through <Code>quoteYes</Code> and <Code>quoteNo</Code>, and every buy
              accepts a <Code>minOut</Code> for slippage protection.
            </P>

            <H2 id="liquidity">Providing liquidity</H2>
            <P>
              Liquidity providers (LPs) deposit USDC and receive LP shares representing their portion of the
              pool. LPs earn the swap fee on every trade and can withdraw their share at any time while the
              market is open.
            </P>
            <P>
              When you remove liquidity, the symmetric portion of your position returns as USDC and any
              imbalance returns as YES or NO tokens, which you can hold, pair-redeem, or sell back. Note that
              a market initiator&apos;s seed liquidity may be partially locked until settlement to keep the
              market solvent.
            </P>

            <H2 id="fees">Fees</H2>
            <P>There are two fee types, both expressed in basis points (1 bp = 0.01%):</P>
            <H3>Swap fee</H3>
            <P>
              Charged on each trade (<Code>lpSwapFeeBps</Code>) and kept in the pool, accruing to LPs as
              extra collateral.
            </P>
            <H3>Protocol &amp; creator fee</H3>
            <P>
              Taken once at settlement (<Code>platformFeeBps</Code> + <Code>creatorFeeBps</Code>) from the
              winning side&apos;s payout. The per-token net redemption rates are exposed as
              <Code> netUsdcPerYesToken</Code> and <Code>netUsdcPerNoToken</Code>.
            </P>

            <H2 id="lifecycle">Market lifecycle</H2>
            <P>A market moves through three states:</P>
            <H3>Open</H3>
            <P>Trading, adding/removing liquidity, and pair redemption are all available.</P>
            <H3>Locked</H3>
            <P>
              Reached at the betting deadline (e.g. kickoff). Buying and adding liquidity stop, but holders
              can still pair-redeem YES+NO for USDC while awaiting the result.
            </P>
            <H3>Settled</H3>
            <P>
              The outcome is finalized. Winning tokens become redeemable for USDC at their net rate, and LPs
              claim their final payout.
            </P>

            <H2 id="trading">Trading guide</H2>
            <P>The market page exposes four actions:</P>
            <H3>Swap</H3>
            <P>Pick YES or NO, enter a USDC amount, and buy outcome tokens at the live AMM quote.</P>
            <H3>LP</H3>
            <P>Add USDC to mint LP shares, or burn LP shares to withdraw your share of the pool.</P>
            <H3>Redeem</H3>
            <P>Burn an equal amount of YES and NO to recover USDC 1:1 — available any time pre-settlement.</P>
            <H3>Claim</H3>
            <P>After settlement, redeem winning outcome tokens and claim your LP payout.</P>

            <H2 id="resolution">Resolution &amp; settlement</H2>
            <P>
              Each market specifies a resolution source and a <Code>resolveAfter</Code> timestamp. Once the
              real-world result is known and the window has passed, the market is resolved to YES or NO. In
              rare unresolvable cases a market may settle as a draw, in which case YES and NO redeem at the
              same rate and no side is favored.
            </P>

            <H2 id="deployments">Deployments</H2>
            <P>Core contract addresses by network:</P>
            <div className="mt-5 overflow-x-auto rounded-2xl border border-[rgba(20,20,20,0.12)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[rgba(20,20,20,0.03)] text-[var(--color-muted)]">
                    <th className="px-4 py-3 font-semibold">Network</th>
                    <th className="px-4 py-3 font-semibold">Chain ID</th>
                    <th className="px-4 py-3 font-semibold">Contract</th>
                    <th className="px-4 py-3 font-semibold">Address</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPLOYMENTS.map((d) => (
                    <tr key={d.network} className="border-t border-[rgba(20,20,20,0.08)]">
                      <td className="px-4 py-3 font-medium">{d.network}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{d.chainId}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{d.contract}</td>
                      <td className="px-4 py-3">
                        {d.address.startsWith('0x') ? (
                          <span className="break-all font-mono text-xs text-[var(--color-cyan)]">{d.address}</span>
                        ) : (
                          <span className="text-[var(--color-muted)]">{d.address}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H2 id="faq">FAQ</H2>
            <H3>Do I need to find someone to take the other side?</H3>
            <P>No. You trade against the pool, so a market is liquid the moment it is created.</P>
            <H3>What happens if I hold the losing side?</H3>
            <P>Losing outcome tokens redeem for 0 at settlement. To exit early, sell back into the pool or pair-redeem.</P>
            <H3>Can I lose money providing liquidity?</H3>
            <P>
              LPs are exposed to the market outcome and to imbalance in the pool. You earn swap fees, but the
              value of your share moves with the odds, so returns are not guaranteed.
            </P>
            <H3>What collateral do markets use?</H3>
            <P>USDC. All prices, deposits, and payouts are denominated in USDC with 6 decimals.</P>
          </article>
        </div>
      </div>
    </div>
  )
}
