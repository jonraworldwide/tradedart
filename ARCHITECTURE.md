# TRADEDART Architecture

## Invariant pipeline
Market Brain → Research Engine → Thesis Engine → Strategy Engine → Risk Engine → Execution Engine → Memory/Learning Engine.

No layer may bypass the layer below it. Research cannot execute. Strategy cannot override Risk. Execution cannot invent strategy. Learning cannot rewrite history.

## 1 Market Brain
Produces timestamped MarketContext objects from attributable data. Tracks supported assets, price/valuation, liquidity, derivatives, volatility, breadth, sector rotation and capital flows. Classification is descriptive and may be UNCERTAIN.

## 2 Research Engine
Creates immutable evidence snapshots. Prefer primary/on-chain evidence. Missing metrics remain missing; never fabricate them. Only economically meaningful ratios are permitted.

## 3 Thesis Engine
Creates bull thesis and separately inspectable adversarial challenge. Every thesis defines catalysts, timeframe, token value capture, risks, invalidation and metrics that could prove it wrong.

## 4 Strategy Engine
Converts an approved thesis into deterministic rules. Every executable plan requires a Strategy ID, entry/exit, stop, target, sizing, exposure limits, timeframe and invalidation.

## 5 Risk Engine
Absolute veto. Returns PASS, REJECT or NEEDS_HUMAN_APPROVAL with reasons after checking balances, exposures, duplicate orders, defined loss, stops, targets, slippage, fees, liquidity, network and venue status.

## 6 Execution Engine
Paper-only until the LIVE gate is separately authorized. Lifecycle: PREVIEW → PREFLIGHT → APPROVAL → SUBMIT → ACKNOWLEDGE → RECONCILE. Execution cannot change the strategy.

## 7 Memory / Learning Engine
Immutable trade ledger plus periodic review. Learning may PROPOSE → TEST → COMPARE → APPROVE → VERSION. It cannot silently mutate active rules or historical records.

## Cross-cutting rules
- Never store seed phrases, private keys or exchange passwords.
- Default integrations read-only. Withdrawal permission prohibited.
- Corrections to historical records are additive.
- Every conclusion traces to evidence; every trade traces to a Strategy ID.
- Code existence is not completion. Acceptance evidence is required.
- Stable milestones are checkpointed and regression-tested.
