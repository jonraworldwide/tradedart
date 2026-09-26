/**
 * TRADEDART canonical state contracts.
 *
 * Pipeline: Market → Research → Thesis → Strategy → Risk → Execution → Memory/Learning.
 * Every contract carries its producing `layer` and a `kind` discriminator, and every
 * downstream contract references the ID of the upstream contract it was derived from.
 */

export const PIPELINE = ['MARKET', 'RESEARCH', 'THESIS', 'STRATEGY', 'RISK', 'EXECUTION', 'LEARNING'] as const;
export type Layer = (typeof PIPELINE)[number];

/**
 * Layers each consumer may read from (in addition to continuing its own layer's objects).
 * No entry references a downstream layer. LEARNING (memory) reads upstream snapshots only
 * to record references in the immutable ledger.
 */
export const ALLOWED_UPSTREAM: Readonly<Record<Layer, readonly Layer[]>> = Object.freeze({
  MARKET: Object.freeze([]),
  RESEARCH: Object.freeze(['MARKET']),
  THESIS: Object.freeze(['RESEARCH']),
  STRATEGY: Object.freeze(['THESIS']),
  RISK: Object.freeze(['STRATEGY']),
  EXECUTION: Object.freeze(['STRATEGY', 'RISK']),
  LEARNING: Object.freeze(['EXECUTION', 'STRATEGY', 'THESIS', 'RESEARCH']),
}) as Readonly<Record<Layer, readonly Layer[]>>;

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type MarketContextId = Brand<string, 'MarketContextId'>;
export type ResearchSnapshotId = Brand<string, 'ResearchSnapshotId'>;
export type ThesisId = Brand<string, 'ThesisId'>;
export type ChallengeId = Brand<string, 'ChallengeId'>;
export type StrategyId = Brand<string, 'StrategyId'>;
export type OrderIntentId = Brand<string, 'OrderIntentId'>;
export type RiskDecisionId = Brand<string, 'RiskDecisionId'>;
export type ExecutionId = Brand<string, 'ExecutionId'>;
export type TradeId = Brand<string, 'TradeId'>;
export type ProposalId = Brand<string, 'ProposalId'>;

/** ISO-8601 timestamp. */
export type ISOTimestamp = string;
export type AssetSymbol = string;

export interface SourceAttribution {
  readonly source: string;
  readonly retrievedAt: ISOTimestamp;
  readonly reference?: string;
}

/** A metric is either attributable or explicitly missing. Missing metrics are never fabricated. */
export type Metric =
  | { readonly status: 'AVAILABLE'; readonly value: number; readonly source: SourceAttribution }
  | { readonly status: 'MISSING'; readonly reason: string };

// ─── 1 Market Brain ──────────────────────────────────────────────────────────

export type MarketRegime =
  | 'RISK_EXPANSION'
  | 'RISK_CONTRACTION'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'BTC_LED'
  | 'ETH_LED'
  | 'ALTCOIN_EXPANSION'
  | 'SECTOR_ROTATION'
  | 'UNCERTAIN';

export interface MarketContext {
  readonly layer: 'MARKET';
  readonly kind: 'MarketContext';
  readonly id: MarketContextId;
  readonly asOf: ISOTimestamp;
  readonly assets: readonly AssetSymbol[];
  readonly regime: MarketRegime;
  readonly metrics: Readonly<Record<string, Metric>>;
  readonly sources: readonly SourceAttribution[];
}

// ─── 2 Research Engine ───────────────────────────────────────────────────────

export interface EvidenceItem {
  readonly claim: string;
  readonly source: SourceAttribution;
}

export interface ResearchSnapshot {
  readonly layer: 'RESEARCH';
  readonly kind: 'ResearchSnapshot';
  readonly id: ResearchSnapshotId;
  readonly marketContextId: MarketContextId;
  readonly asset: AssetSymbol;
  readonly frozenAt: ISOTimestamp;
  readonly metrics: Readonly<Record<string, Metric>>;
  readonly evidence: readonly EvidenceItem[];
}

// ─── 3 Thesis Engine ─────────────────────────────────────────────────────────

export interface ThesisSnapshot {
  readonly layer: 'THESIS';
  readonly kind: 'ThesisSnapshot';
  readonly id: ThesisId;
  readonly researchSnapshotId: ResearchSnapshotId;
  readonly asset: AssetSymbol;
  readonly createdAt: ISOTimestamp;
  readonly coreThesis: string;
  readonly whyNow: string;
  readonly mispricingHypothesis: string;
  readonly keyCatalysts: readonly string[];
  readonly catalystTimeframe: string;
  readonly tokenValueCapture: string;
  readonly competitiveAdvantage: string;
  readonly biggestRisk: string;
  readonly invalidationConditions: readonly string[];
  readonly metricsToMonitor: readonly string[];
  readonly whatWouldProveWrong: readonly string[];
}

export type ChallengeDimension =
  | 'VALUATION'
  | 'UTILITY'
  | 'UNLOCKS'
  | 'INSIDERS'
  | 'CENTRALIZATION'
  | 'SECURITY'
  | 'REGULATION'
  | 'INCENTIVE_QUALITY'
  | 'YIELD_SUSTAINABILITY'
  | 'USER_REVENUE_DETERIORATION'
  | 'COMPETITORS'
  | 'NARRATIVE_DEPENDENCE'
  | 'LIQUIDITY';

export interface ChallengeFinding {
  readonly dimension: ChallengeDimension;
  readonly assessment: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export type ChallengeVerdict = 'THESIS_SURVIVES' | 'THESIS_REJECTED' | 'INCONCLUSIVE';

/** Separately inspectable adversarial pass against a thesis. */
export interface ThesisChallenge {
  readonly layer: 'THESIS';
  readonly kind: 'ThesisChallenge';
  readonly id: ChallengeId;
  readonly thesisId: ThesisId;
  readonly createdAt: ISOTimestamp;
  readonly findings: readonly ChallengeFinding[];
  readonly verdict: ChallengeVerdict;
}

// ─── 4 Strategy Engine ───────────────────────────────────────────────────────

export interface StrategyRules {
  readonly entry: string;
  readonly exit: string;
  readonly stopLossPrice: number;
  readonly takeProfitPrice: number;
  readonly positionSizeQuote: number;
  readonly maxPositionExposurePct: number;
  readonly maxPortfolioExposurePct: number;
  readonly timeframe: string;
  readonly allowedAssets: readonly AssetSymbol[];
  readonly invalidation: readonly string[];
}

export interface Strategy {
  readonly layer: 'STRATEGY';
  readonly kind: 'Strategy';
  readonly id: StrategyId;
  readonly version: number;
  readonly thesisId: ThesisId;
  readonly challengeId: ChallengeId;
  readonly rules: StrategyRules;
  readonly createdAt: ISOTimestamp;
}

export type OrderSide = 'BUY' | 'SELL';

/** The only order-shaped object in the domain. Only the Strategy layer can produce it. */
export interface OrderIntent {
  readonly layer: 'STRATEGY';
  readonly kind: 'OrderIntent';
  readonly id: OrderIntentId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: number;
  readonly asset: AssetSymbol;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly limitPrice: number;
  readonly stopLossPrice: number;
  readonly takeProfitPrice: number;
  readonly createdAt: ISOTimestamp;
}

// ─── 5 Risk Engine ───────────────────────────────────────────────────────────

export type RiskOutcome = 'PASS' | 'REJECT' | 'NEEDS_HUMAN_APPROVAL';

export interface RiskDecision {
  readonly layer: 'RISK';
  readonly kind: 'RiskDecision';
  readonly id: RiskDecisionId;
  readonly strategyId: StrategyId;
  readonly orderIntentId: OrderIntentId;
  readonly outcome: RiskOutcome;
  readonly reasons: readonly string[];
  readonly decidedAt: ISOTimestamp;
}

export interface HumanApproval {
  readonly layer: 'RISK';
  readonly kind: 'HumanApproval';
  readonly riskDecisionId: RiskDecisionId;
  readonly approvedBy: string;
  readonly approvedAt: ISOTimestamp;
}

// ─── 6 Execution Engine ──────────────────────────────────────────────────────

export type ExecutionMode = 'PAPER' | 'LIVE';

export const EXECUTION_LIFECYCLE = ['PREVIEW', 'PREFLIGHT', 'APPROVAL', 'SUBMIT', 'ACKNOWLEDGE', 'RECONCILE'] as const;
export type ExecutionStage = (typeof EXECUTION_LIFECYCLE)[number];

export interface PaperFill {
  readonly price: number;
  readonly quantity: number;
  readonly fees: number;
  readonly slippage: number;
  readonly filledAt: ISOTimestamp;
}

export interface PaperExecution {
  readonly layer: 'EXECUTION';
  readonly kind: 'PaperExecution';
  readonly mode: 'PAPER';
  readonly id: ExecutionId;
  readonly strategyId: StrategyId;
  readonly orderIntentId: OrderIntentId;
  readonly riskDecisionId: RiskDecisionId | null;
  readonly riskOutcome: RiskOutcome | null;
  readonly approvedBy: string | null;
  readonly stage: ExecutionStage;
  readonly history: readonly { readonly stage: ExecutionStage; readonly at: ISOTimestamp }[];
  readonly fill: PaperFill | null;
}

// ─── 7 Memory / Learning Engine ──────────────────────────────────────────────

export type TradeDirection = 'LONG' | 'SHORT';

export interface TradeLedgerEntry {
  readonly layer: 'LEARNING';
  readonly kind: 'TradeLedgerEntry';
  readonly tradeId: TradeId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: number;
  readonly executionId: ExecutionId;
  readonly asset: AssetSymbol;
  readonly direction: TradeDirection;
  readonly entryPrice: number;
  readonly exitPrice: number | null;
  readonly size: number;
  readonly fees: number;
  readonly slippage: number;
  readonly stopLossPrice: number;
  readonly takeProfitPrice: number;
  readonly realizedPnl: number | null;
  readonly marketContextId: MarketContextId;
  readonly researchSnapshotId: ResearchSnapshotId;
  readonly thesisId: ThesisId;
  readonly entryReason: string;
  readonly exitReason: string | null;
  readonly openedAt: ISOTimestamp;
  readonly closedAt: ISOTimestamp | null;
  readonly recordedAt: ISOTimestamp;
}

export type CorrectableField = 'exitPrice' | 'fees' | 'slippage' | 'realizedPnl' | 'exitReason' | 'closedAt';

/** Corrections to history are additive records; the original entry is never rewritten. */
export interface LedgerCorrection {
  readonly layer: 'LEARNING';
  readonly kind: 'LedgerCorrection';
  readonly correctionId: string;
  readonly correctsTradeId: TradeId;
  readonly reason: string;
  readonly amendments: Readonly<Partial<Pick<TradeLedgerEntry, CorrectableField>>>;
  readonly recordedAt: ISOTimestamp;
}

export type LedgerRecord = TradeLedgerEntry | LedgerCorrection;

export const LEARNING_STAGES = ['PROPOSE', 'TEST', 'COMPARE', 'APPROVE', 'VERSION'] as const;
export type LearningStage = (typeof LEARNING_STAGES)[number];

export interface LearningProposal {
  readonly layer: 'LEARNING';
  readonly kind: 'LearningProposal';
  readonly id: ProposalId;
  readonly strategyId: StrategyId;
  readonly baseVersion: number;
  readonly proposedRules: Readonly<Partial<StrategyRules>>;
  readonly rationale: string;
  readonly evidenceTradeIds: readonly TradeId[];
  readonly stage: LearningStage;
  readonly stageHistory: readonly { readonly stage: LearningStage; readonly at: ISOTimestamp }[];
  readonly approvedBy: string | null;
  readonly createdAt: ISOTimestamp;
}

export interface StrategyVersion {
  readonly layer: 'LEARNING';
  readonly kind: 'StrategyVersion';
  readonly strategyId: StrategyId;
  readonly version: number;
  readonly rules: StrategyRules;
  readonly sourceProposalId: ProposalId | null;
  readonly approvedBy: string | null;
  readonly createdAt: ISOTimestamp;
}
