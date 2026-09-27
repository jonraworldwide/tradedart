import type {
  OrderIntent,
  OrderIntentId,
  OrderSide,
  Strategy,
  StrategyId,
  StrategyRules,
  ThesisChallenge,
  ThesisSnapshot,
} from '../domain/contracts.js';
import { BoundaryViolationError, ContractValidationError } from '../domain/errors.js';
import {
  assertContract,
  immutableCopy,
  requireNonEmpty,
  requireNonEmptyList,
  requirePositive,
  requireTimestamp,
  toId,
} from '../domain/guards.js';

export function validateStrategyRules(rules: StrategyRules): void {
  requireNonEmpty(rules.entry, 'rules.entry');
  requireNonEmpty(rules.exit, 'rules.exit');
  requirePositive(rules.stopLossPrice, 'rules.stopLossPrice');
  requirePositive(rules.takeProfitPrice, 'rules.takeProfitPrice');
  requirePositive(rules.positionSizeQuote, 'rules.positionSizeQuote');
  for (const field of ['maxPositionExposurePct', 'maxPortfolioExposurePct'] as const) {
    requirePositive(rules[field], `rules.${field}`);
    if (rules[field] > 100) throw new ContractValidationError(`rules.${field} must not exceed 100`);
  }
  requireNonEmpty(rules.timeframe, 'rules.timeframe');
  requireNonEmptyList(rules.allowedAssets, 'rules.allowedAssets');
  requireNonEmptyList(rules.invalidation, 'rules.invalidation');
}

export interface StrategyInput {
  readonly id: string;
  readonly createdAt: string;
  readonly rules: StrategyRules;
  readonly version?: number;
}

/** Strategy Engine: only a thesis that survived its adversarial challenge becomes a strategy. */
export function createStrategy(thesis: ThesisSnapshot, challenge: ThesisChallenge, input: StrategyInput): Strategy {
  assertContract(thesis, 'THESIS', 'ThesisSnapshot', 'STRATEGY');
  assertContract(challenge, 'THESIS', 'ThesisChallenge', 'STRATEGY');
  if (challenge.thesisId !== thesis.id) {
    throw new BoundaryViolationError('challenge does not belong to the supplied thesis');
  }
  if (challenge.verdict !== 'THESIS_SURVIVES') {
    throw new BoundaryViolationError(`thesis ${thesis.id} is not approved (challenge verdict ${challenge.verdict})`);
  }
  requireTimestamp(input.createdAt, 'createdAt');
  validateStrategyRules(input.rules);
  if (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 1)) {
    throw new ContractValidationError('strategy version must be a positive integer');
  }
  if (!input.rules.allowedAssets.includes(thesis.asset)) {
    throw new ContractValidationError(`strategy must allow thesis asset ${thesis.asset}`);
  }
  return immutableCopy<Strategy>({
    layer: 'STRATEGY',
    kind: 'Strategy',
    id: toId<StrategyId>(input.id, 'id'),
    version: input.version ?? 1,
    thesisId: thesis.id,
    challengeId: challenge.id,
    rules: input.rules,
    createdAt: input.createdAt,
  });
}

export interface OrderIntentInput {
  readonly id: string;
  readonly asset: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly limitPrice: number;
  readonly createdAt: string;
}

/**
 * The only constructor for order-shaped objects. Requires a Strategy; stop and target are
 * taken from the strategy rules so downstream layers cannot invent them.
 */
export function createOrderIntent(strategy: Strategy, input: OrderIntentInput): OrderIntent {
  assertContract(strategy, 'STRATEGY', 'Strategy', 'STRATEGY');
  const strategyId = toId<StrategyId>(strategy.id, 'strategy.id');
  if (!strategy.rules.allowedAssets.includes(input.asset)) {
    throw new BoundaryViolationError(`asset ${input.asset} is not allowed by strategy ${strategyId}`);
  }
  if (input.side !== 'BUY' && input.side !== 'SELL') throw new ContractValidationError('side must be BUY or SELL');
  requirePositive(input.quantity, 'quantity');
  requirePositive(input.limitPrice, 'limitPrice');
  requireTimestamp(input.createdAt, 'createdAt');
  return immutableCopy<OrderIntent>({
    layer: 'STRATEGY',
    kind: 'OrderIntent',
    id: toId<OrderIntentId>(input.id, 'id'),
    strategyId,
    strategyVersion: strategy.version,
    asset: input.asset,
    side: input.side,
    quantity: input.quantity,
    limitPrice: input.limitPrice,
    stopLossPrice: strategy.rules.stopLossPrice,
    takeProfitPrice: strategy.rules.takeProfitPrice,
    createdAt: input.createdAt,
  });
}
