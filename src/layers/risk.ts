import type { HumanApproval, OrderIntent, RiskDecision, RiskDecisionId, RiskOutcome, Strategy } from '../domain/contracts.js';
import { BoundaryViolationError } from '../domain/errors.js';
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
}

export function defineRiskLimits(limits: RiskLimits): RiskLimits {
  requirePositive(limits.maxDefinedLossQuote, 'maxDefinedLossQuote');
  requirePositive(limits.maxPositionNotionalQuote, 'maxPositionNotionalQuote');
  requirePositive(limits.humanApprovalAboveNotionalQuote, 'humanApprovalAboveNotionalQuote');
  requireNonNegative(limits.maxSlippageBps, 'maxSlippageBps');
  return immutableCopy(limits);
}

/**
 * Risk Engine: absolute veto. Strategy parameters cannot override these checks.
 */
export function evaluateRisk(intent: OrderIntent, strategy: Strategy, ctx: RiskContext): RiskDecision {
  assertContract(intent, 'STRATEGY', 'OrderIntent', 'RISK');
  assertContract(strategy, 'STRATEGY', 'Strategy', 'RISK');
  requireTimestamp(ctx.decidedAt, 'decidedAt');
  const { limits, portfolio } = ctx;
  const rejections: string[] = [];

  if (typeof intent.strategyId !== 'string' || intent.strategyId === '' || intent.strategyId !== strategy.id) {
    rejections.push('STRATEGY_MISMATCH: order intent is not bound to this Strategy ID');
  } else if (intent.strategyVersion !== strategy.version) {
    rejections.push('STRATEGY_VERSION_MISMATCH: order intent targets a different strategy version');
  }

  const isBuy = intent.side === 'BUY';
  const notional = intent.quantity * intent.limitPrice;
  const stopDistance = isBuy ? intent.limitPrice - intent.stopLossPrice : intent.stopLossPrice - intent.limitPrice;
  const targetDistance = isBuy ? intent.takeProfitPrice - intent.limitPrice : intent.limitPrice - intent.takeProfitPrice;
  const definedLoss = Math.max(stopDistance, 0) * intent.quantity;

  if (!(stopDistance > 0)) rejections.push('UNDEFINED_LOSS: stop does not bound loss on the correct side of entry');
  if (!(targetDistance > 0)) rejections.push('INVALID_TARGET: target is not on the profitable side of entry');
  if (definedLoss > limits.maxDefinedLossQuote) {
    rejections.push(`MAX_LOSS: defined loss ${definedLoss} exceeds limit ${limits.maxDefinedLossQuote}`);
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
