# TRADEDART Canonical Product Specification

## Purpose
TRADEDART is the intelligence and orchestration layer for a wallet-aware crypto research, portfolio and trading system. It does not chase momentum or manufacture bullish narratives.

## Process
DISCOVER → RESEARCH → CHALLENGE → PLAN → EXECUTE → RECORD → REVIEW → LEARN.

Every conclusion must be traceable to evidence. Every trade must be traceable to a strategy rule. Every strategy must be measurable.

## Market scope
BTC, ETH, SOL, AR, LINK, RNDR/RENDER, DOGE, UNI, ICP, NEAR, XRP, ADA and Cosmos ecosystem assets. The architecture must remain extensible.

## Market Brain
Construct continuous MarketContext snapshots with timestamps and source attribution. Track price, market cap, FDV, volume, BTC dominance, ETH/BTC, stablecoin liquidity, DEX volume, open interest, funding, liquidations, volatility, breadth, sector rotation and capital flows. Classifications may include risk expansion/contraction, high/low volatility, BTC-led, ETH-led, altcoin expansion, sector rotation and uncertain.

## Research
Investigate valuation, supply/unlocks/inflation, concentration, treasury, revenue/fees/TVL, transaction volume, users, development, ecosystem growth, liquidity, integrations, adoption and competition. Use meaningful ratios only. Prefer primary sources and verifiable on-chain data. Never fabricate unavailable metrics. Freeze immutable research snapshots.

## Thesis + challenge
Required fields: CORE THESIS; WHY NOW; MARKET MISPRICING HYPOTHESIS; KEY CATALYSTS; CATALYST TIMEFRAME; TOKEN VALUE CAPTURE; COMPETITIVE ADVANTAGE; BIGGEST RISK; INVALIDATION CONDITIONS; METRICS TO MONITOR; WHAT WOULD PROVE THIS THESIS WRONG?
Run a separate adversarial pass testing valuation, utility, unlocks, insiders, centralization, security, regulation, incentive quality, yield sustainability, user/revenue deterioration, competitors, narrative dependence and liquidity.

## Strategy
Approved theses become deterministic rules: entry, exit, stop, take profit, size, maximum position/portfolio exposure, timeframe, allowed assets and invalidation. Optional DCA, trailing stop, rebalance and profit routing. No executable trade without Strategy ID.

## Risk
Absolute veto. Verify balances, portfolio and strategy exposure, existing positions, duplicates, maximum permitted/defined loss, stop, target, slippage, fees, liquidity, network and venue status. Return PASS / REJECT / NEEDS_HUMAN_APPROVAL with explicit reasons. Risk limits do not auto-change after losses.

## Execution
Phase 1 is paper only. Prove market data, order simulation, accounting, fees/slippage, stops/targets, ledger and portfolio accounting. Future adapters may include Phantom, MetaMask, Jupiter, OKX, Bybit and Bitget. Never store seeds/private keys. Use wallet signatures/minimum-privilege API permissions; withdrawal permission prohibited.

Before any future LIVE action display asset, side, size, price/limit, estimated fees, estimated slippage, stop, target, strategy and maximum defined loss and require explicit authorization under the execution policy.

## Profit Router
Optional realized-profit routing to a user-controlled long-term basket. User controls retained trading capital, withdrawals, routed percentage and basket allocation. Unrealized gains are never distributable.

## Immutable ledger
Each trade records trade ID, strategy ID, asset, direction, entry, exit, size, fees, slippage, stop, target, P&L, market context, research/thesis snapshots, entry/exit reasons and timestamps. Never rewrite history; corrections are additive.

## Learning
Every 10 closed trades review win rate, average win/loss, expectancy, profit factor, drawdown, risk/reward, fees, slippage and performance by asset/regime/strategy. Learning proposes changes only through PROPOSE → TEST → COMPARE → APPROVE → VERSION.

## Product surface
Dashboard: PORTFOLIO VALUE, TODAY P&L, REALIZED P&L, AVAILABLE CAPITAL, MARKET STATE, POSITIONS, RESEARCH, OPPORTUNITIES, TRADE PLANS, PROFIT ROUTER, ACTIVITY.
Opportunity disclosure: ASSET → THESIS → EVIDENCE → BEAR CASE → CATALYSTS → TRADE PLAN → RISK → EXECUTION.
Avoid form-heavy infrastructure UX.

## Functionality to migrate/preserve
The consolidated build must accommodate prior TRADEDART functionality: multi-exchange architecture; authenticated portfolio state; Solana/Phantom read-only wallet support; public market feeds; portfolio aggregation; positions/orders; opportunity visualization; DCA/profit routing; and the preview/preflight/approval/submit/acknowledge/reconcile lifecycle. Each legacy capability must be verified against source code when migrated rather than assumed complete.

## Build milestones
M0 control plane; M1 foundation/state contracts; M2 unified data; M3 research/thesis; M4 strategy/risk; M5 paper execution/accounting; M6 profit router/learning; M7 responsive UI; M8 separately authorized live gate.
