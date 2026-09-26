import {
  LEARNING_STAGES,
  type LearningProposal,
  type LearningStage,
  type ProposalId,
  type Strategy,
  type StrategyRules,
  type StrategyVersion,
  type TradeId,
} from '../domain/contracts.js';
import { BoundaryViolationError, ContractValidationError, LifecycleError } from '../domain/errors.js';
import { assertContract, immutableCopy, requireNonEmpty, requireTimestamp, toId } from '../domain/guards.js';
import { validateStrategyRules } from './strategy.js';

export interface ProposalInput {
  readonly id: string;
  readonly proposedRules: Partial<StrategyRules>;
  readonly rationale: string;
  readonly evidenceTradeIds: readonly string[];
  readonly createdAt: string;
}

/** Learning proposes; it never mutates the active strategy. */
export function proposeStrategyChange(strategy: Strategy, input: ProposalInput): LearningProposal {
  assertContract(strategy, 'STRATEGY', 'Strategy', 'LEARNING');
  requireNonEmpty(input.rationale, 'rationale');
  requireTimestamp(input.createdAt, 'createdAt');
  if (input.evidenceTradeIds.length === 0) {
    throw new ContractValidationError('a learning proposal must cite ledger evidence');
  }
  return immutableCopy<LearningProposal>({
    layer: 'LEARNING',
    kind: 'LearningProposal',
    id: toId<ProposalId>(input.id, 'id'),
    strategyId: strategy.id,
    baseVersion: strategy.version,
    proposedRules: input.proposedRules,
    rationale: input.rationale,
    evidenceTradeIds: input.evidenceTradeIds as readonly TradeId[],
    stage: 'PROPOSE',
    stageHistory: [{ stage: 'PROPOSE', at: input.createdAt }],
    approvedBy: null,
    createdAt: input.createdAt,
  });
}

/** Advances PROPOSE → TEST → COMPARE → APPROVE. VERSION is reached only through versionStrategy. */
export function advanceProposal(
  proposal: LearningProposal,
  to: Exclude<LearningStage, 'PROPOSE' | 'VERSION'>,
  at: string,
  approvedBy?: string,
): LearningProposal {
  assertContract(proposal, 'LEARNING', 'LearningProposal', 'LEARNING');
  assertNextStage(proposal, to);
  requireTimestamp(at, 'at');
  if (to === 'APPROVE') requireNonEmpty(approvedBy, 'approvedBy');
  return immutableCopy<LearningProposal>({
    ...proposal,
    stage: to,
    stageHistory: [...proposal.stageHistory, { stage: to, at }],
    approvedBy: to === 'APPROVE' ? (approvedBy as string) : proposal.approvedBy,
  });
}

export interface VersionResult {
  readonly strategy: Strategy;
  readonly version: StrategyVersion;
  readonly proposal: LearningProposal;
}

/** Produces a new strategy version from an APPROVED proposal. The prior version is untouched. */
export function versionStrategy(strategy: Strategy, proposal: LearningProposal, at: string): VersionResult {
  assertContract(strategy, 'STRATEGY', 'Strategy', 'LEARNING');
  assertContract(proposal, 'LEARNING', 'LearningProposal', 'LEARNING');
  assertNextStage(proposal, 'VERSION');
  if (proposal.strategyId !== strategy.id || proposal.baseVersion !== strategy.version) {
    throw new BoundaryViolationError('proposal does not target this strategy version');
  }
  requireTimestamp(at, 'at');
  const rules: StrategyRules = { ...strategy.rules, ...proposal.proposedRules };
  validateStrategyRules(rules);
  const next = immutableCopy<Strategy>({ ...strategy, version: strategy.version + 1, rules, createdAt: at });
  const version = immutableCopy<StrategyVersion>({
    layer: 'LEARNING',
    kind: 'StrategyVersion',
    strategyId: next.id,
    version: next.version,
    rules: next.rules,
    sourceProposalId: proposal.id,
    approvedBy: proposal.approvedBy,
    createdAt: at,
  });
  const versioned = immutableCopy<LearningProposal>({
    ...proposal,
    stage: 'VERSION',
    stageHistory: [...proposal.stageHistory, { stage: 'VERSION', at }],
  });
  return { strategy: next, version, proposal: versioned };
}

function assertNextStage(proposal: LearningProposal, to: LearningStage): void {
  const expected = LEARNING_STAGES[LEARNING_STAGES.indexOf(proposal.stage) + 1];
  if (expected !== to) {
    throw new LifecycleError(`cannot move proposal from ${proposal.stage} to ${to}; next is ${expected ?? 'none'}`);
  }
}
