import type { HumanApproval, OrderIntent, RiskDecision, RiskDecisionId, RiskOutcome, Strategy } from '../domain/contracts.js';
import { BoundaryViolationError, ContractValidationError, RiskVetoError } from '../domain/errors.js';
import type { PaperRiskCheckpoint } from './paper-portfolio.js';
import {
  assertContract,
  immutableCopy,
  requireNonEmpty,
  requireNonNegative,
  requirePositive,
  requireTimestamp,
  toId,
} from '../domain/guards.js';

/** Risk limits are frozen at definition. There is no API to change them after losses. */
export interface RiskLimits {
  readonly maxDefinedLossQuote: number;
  readonly maxPositionNotionalQuote: number;
  readonly humanApprovalAboveNotionalQuote: number;
  readonly maxSlippageBps: number;
  readonly maxRiskPctEquity: number;
  readonly maxNotionalPctEquity: number;
  readonly dailyLossPct: number;
  readonly totalDrawdownPct: number;
  readonly maxAccountAgeMs: number;
}

export interface PortfolioState {
  readonly availableQuote: number;
  readonly portfolioValueQuote: number;
  readonly openOrderIntentIds: readonly string[];
  readonly assetExposureQuote: Readonly<Record<string, number>>;
}

export interface RiskContext {
  readonly decisionId: string;
  readonly decidedAt: string;
  readonly limits: RiskLimits;
  readonly portfolio: PortfolioState;
  readonly venueOperational: boolean;
  readonly estimatedSlippageBps: number;
  readonly paperRisk: PaperRiskCheckpoint;
}

export function defineRiskLimits(limits: RiskLimits): RiskLimits {
  requirePositive(limits.maxDefinedLossQuote, 'maxDefinedLossQuote');
  requirePositive(limits.maxPositionNotionalQuote, 'maxPositionNotionalQuote');
  requirePositive(limits.humanApprovalAboveNotionalQuote, 'humanApprovalAboveNotionalQuote');
  requireNonNegative(limits.maxSlippageBps, 'maxSlippageBps');
  for (const field of ['maxRiskPctEquity', 'maxNotionalPctEquity', 'dailyLossPct', 'totalDrawdownPct'] as const) {
    requirePositive(limits[field], field);
    if (limits[field] > 100) throw new BoundaryViolationError(`${field} cannot exceed 100%`);
  }
  requirePositive(limits.maxAccountAgeMs, 'maxAccountAgeMs');
  return immutableCopy(limits);
}

export interface PaperSizingInput {
  readonly side: 'BUY' | 'SELL';
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly desiredQuantity: number;
  readonly quantityStep: number;
  readonly minNotionalQuote: number;
}

/** Quotes a bounded paper quantity; never rounds upward to satisfy a venue minimum. */
export function sizePaperOrder(input: PaperSizingInput, checkpoint: PaperRiskCheckpoint, limits: RiskLimits): number {
  if (input.side !== 'BUY') throw new RiskVetoError(['SHORT_MARGIN_MODEL_UNAVAILABLE: paper sizing is long-only']);
  for (const field of ['entryPrice', 'stopLossPrice', 'desiredQuantity', 'quantityStep'] as const) {
    requirePositive(input[field], field);
  }
  requireNonNegative(input.minNotionalQuote, 'minNotionalQuote');
  if (checkpoint.freezeReason) throw new RiskVetoError([checkpoint.freezeReason]);
  const distance = input.side === 'BUY' ? input.entryPrice - input.stopLossPrice : input.stopLossPrice - input.entryPrice;
  if (!(distance > 0)) throw new ContractValidationError('stop must bound loss on the correct side of entry');
  const { equityQuote, availableQuote } = checkpoint.snapshot;
  const maxQuantity = Math.min(
    input.desiredQuantity,
    equityQuote * limits.maxRiskPctEquity / 100 / distance,
    equityQuote * limits.maxNotionalPctEquity / 100 / input.entryPrice,
    availableQuote / input.entryPrice,
    limits.maxDefinedLossQuote / distance,
    limits.maxPositionNotionalQuote / input.entryPrice,
  );
  const units = Math.floor(maxQuantity / input.quantityStep + 1e-10);
  const quantity = Number((units * input.quantityStep).toPrecision(12));
  if (!(quantity > 0) || quantity * input.entryPrice + 1e-9 < input.minNotionalQuote) {
    throw new RiskVetoError(['BELOW_MIN_NOTIONAL: risk-sized paper order cannot meet the minimum']);
  }
  return quantity;
}

/**
 * Risk Engine: absolute veto. Strategy parameters cannot override these checks.
 */
export function evaluateRisk(intent: OrderIntent, strategy: Strategy, ctx: RiskContext): RiskDecision {
  assertContract(intent, 'STRATEGY', 'OrderIntent', 'RISK');
  assertContract(strategy, 'STRATEGY', 'Strategy', 'RISK');
  requireTimestamp(ctx.decidedAt, 'decidedAt');
  const { limits, portfolio } = ctx;
  const checkpoint = ctx.paperRisk;
  const rejections: string[] = [];

  if (!checkpoint || !checkpoint.snapshot) {
    rejections.push('PAPER_ACCOUNT_MISSING: fresh reconciled paper equity is required');
  } else {
    const snapshot = checkpoint.snapshot;
    const age = Date.parse(ctx.decidedAt) - Date.parse(snapshot.asOf);
    if (!Number.isFinite(age) || age < 0 || age > limits.maxAccountAgeMs) {
      rejections.push('PAPER_ACCOUNT_STALE: paper valuation is not current');
    }
    if (!(snapshot.equityQuote > 0) || snapshot.equityQuote !== portfolio.portfolioValueQuote ||
        snapshot.availableQuote !== portfolio.availableQuote) {
      rejections.push('PAPER_ACCOUNT_MISMATCH: balances must match reconciled equity');
    }
    if (checkpoint.freezeReason === 'TOTAL_DRAWDOWN_LIMIT' || checkpoint.totalDrawdownPct >= limits.totalDrawdownPct) {
      rejections.push('TOTAL_DRAWDOWN_LIMIT: new entries are killed');
    } else if (checkpoint.freezeReason === 'DAILY_DRAWDOWN_LIMIT' || checkpoint.dailyDrawdownPct >= limits.dailyLossPct) {
      rejections.push('DAILY_DRAWDOWN_LIMIT: new entries are paused');
    }
  }

  if (typeof intent.strategyId !== 'string' || intent.strategyId === '' || intent.strategyId !== strategy.id) {
    rejections.push('STRATEGY_MISMATCH: order intent is not bound to this Strategy ID');
  } else if (intent.strategyVersion !== strategy.version) {
    rejections.push('STRATEGY_VERSION_MISMATCH: order intent targets a different strategy version');
  }

  const isBuy = intent.side === 'BUY';
  if (!isBuy) rejections.push('SHORT_MARGIN_MODEL_UNAVAILABLE: paper account has no short collateral model');
  const notional = intent.quantity * intent.limitPrice;
  const stopDistance = isBuy ? intent.limitPrice - intent.stopLossPrice : intent.stopLossPrice - intent.limitPrice;
  const targetDistance = isBuy ? intent.takeProfitPrice - intent.limitPrice : intent.limitPrice - intent.takeProfitPrice;
  const definedLoss = Math.max(stopDistance, 0) * intent.quantity;

  if (!(stopDistance > 0)) rejections.push('UNDEFINED_LOSS: stop does not bound loss on the correct side of entry');
  if (!(targetDistance > 0)) rejections.push('INVALID_TARGET: target is not on the profitable side of entry');
  if (definedLoss > limits.maxDefinedLossQuote) {
    rejections.push(`MAX_LOSS: defined loss ${definedLoss} exceeds limit ${limits.maxDefinedLossQuote}`);
  }
  if (checkpoint?.snapshot && definedLoss > checkpoint.snapshot.equityQuote * limits.maxRiskPctEquity / 100) {
    rejections.push('EQUITY_RISK_LIMIT: defined loss exceeds equity risk budget');
  }
  if (checkpoint?.snapshot && notional > checkpoint.snapshot.equityQuote * limits.maxNotionalPctEquity / 100) {
    rejections.push('EQUITY_NOTIONAL_LIMIT: order exceeds equity notional cap');
  }
  if (notional > portfolio.availableQuote) {
    rejections.push(`INSUFFICIENT_BALANCE: notional ${notional} exceeds available ${portfolio.availableQuote}`);
  }
  if (notional > limits.maxPositionNotionalQuote) {
    rejections.push(`POSITION_LIMIT: notional ${notional} exceeds limit ${limits.maxPositionNotionalQuote}`);
  }
  const exposurePct =
    (((portfolio.assetExposureQuote[intent.asset] ?? 0) + notional) / portfolio.portfolioValueQuote) * 100;
  if (!(exposurePct <= strategy.rules.maxPositionExposurePct)) {
    rejections.push(`EXPOSURE: position exposure ${exposurePct}% exceeds ${strategy.rules.maxPositionExposurePct}%`);
  }
  if (portfolio.openOrderIntentIds.includes(intent.id)) {
    rejections.push(`DUPLICATE_ORDER: order intent ${intent.id} is already open`);
  }
  if (ctx.estimatedSlippageBps > limits.maxSlippageBps) {
    rejections.push(`SLIPPAGE: estimated ${ctx.estimatedSlippageBps}bps exceeds ${limits.maxSlippageBps}bps`);
  }
  if (!ctx.venueOperational) rejections.push('VENUE_UNAVAILABLE: venue or network is not operational');

  let outcome: RiskOutcome;
  let reasons: string[];
  if (rejections.length > 0) {
    outcome = 'REJECT';
    reasons = rejections;
  } else if (notional > limits.humanApprovalAboveNotionalQuote) {
    outcome = 'NEEDS_HUMAN_APPROVAL';
    reasons = [`HUMAN_APPROVAL_REQUIRED: notional ${notional} exceeds ${limits.humanApprovalAboveNotionalQuote}`];
  } else {
    outcome = 'PASS';
    reasons = ['ALL_CHECKS_PASSED'];
  }

  return immutableCopy<RiskDecision>({
    layer: 'RISK',
    kind: 'RiskDecision',
    id: toId<RiskDecisionId>(ctx.decisionId, 'decisionId'),
    strategyId: intent.strategyId,
    orderIntentId: intent.id,
    outcome,
    reasons,
    decidedAt: ctx.decidedAt,
  });
}

/** Records an explicit human approval. Only valid for NEEDS_HUMAN_APPROVAL decisions. */
export function createHumanApproval(decision: RiskDecision, approvedBy: string, approvedAt: string): HumanApproval {
  assertContract(decision, 'RISK', 'RiskDecision', 'RISK');
  if (decision.outcome !== 'NEEDS_HUMAN_APPROVAL') {
    throw new BoundaryViolationError(`risk decision ${decision.id} is ${decision.outcome}; human approval not applicable`);
  }
  requireNonEmpty(approvedBy, 'approvedBy');
  requireTimestamp(approvedAt, 'approvedAt');
  return immutableCopy<HumanApproval>({
    layer: 'RISK',
    kind: 'HumanApproval',
    riskDecisionId: decision.id,
    approvedBy,
    approvedAt,
  });
}
