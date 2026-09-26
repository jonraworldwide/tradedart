import {
  EXECUTION_LIFECYCLE,
  type ExecutionId,
  type ExecutionMode,
  type ExecutionStage,
  type HumanApproval,
  type OrderIntent,
  type PaperExecution,
  type PaperFill,
  type RiskDecision,
  type Strategy,
} from '../domain/contracts.js';
import {
  BoundaryViolationError,
  LifecycleError,
  LiveExecutionDisabledError,
  RiskVetoError,
} from '../domain/errors.js';
import {
  assertContract,
  immutableCopy,
  requireNonNegative,
  requirePositive,
  requireTimestamp,
  toId,
} from '../domain/guards.js';

/** LIVE execution is locked behind the separately authorized M8-LIVE-GATE. */
export const LIVE_EXECUTION_ENABLED = false as const;

export function createExecutionEngine(mode: ExecutionMode = 'PAPER'): PaperExecutionEngine {
  if (mode !== 'PAPER') {
    throw new LiveExecutionDisabledError('LIVE execution is locked (M8-LIVE-GATE); only PAPER execution is available');
  }
  return new PaperExecutionEngine();
}

/**
 * Paper-only execution. Lifecycle: PREVIEW → PREFLIGHT → APPROVAL → SUBMIT → ACKNOWLEDGE → RECONCILE.
 * Execution never alters strategy parameters and cannot proceed without a Strategy ID and a
 * PASS (or human-approved) risk decision.
 */
export class PaperExecutionEngine {
  readonly mode = 'PAPER' as const;

  preview(intent: OrderIntent, strategy: Strategy, input: { readonly id: string; readonly at: string }): PaperExecution {
    assertContract(intent, 'STRATEGY', 'OrderIntent', 'EXECUTION');
    assertContract(strategy, 'STRATEGY', 'Strategy', 'EXECUTION');
    if (typeof intent.strategyId !== 'string' || intent.strategyId.trim() === '') {
      throw new BoundaryViolationError('Execution requires a Strategy ID');
    }
    if (intent.strategyId !== strategy.id || intent.strategyVersion !== strategy.version) {
      throw new BoundaryViolationError('order intent does not belong to the supplied strategy version');
    }
    requireTimestamp(input.at, 'at');
    return immutableCopy<PaperExecution>({
      layer: 'EXECUTION',
      kind: 'PaperExecution',
      mode: 'PAPER',
      id: toId<ExecutionId>(input.id, 'id'),
      strategyId: intent.strategyId,
      orderIntentId: intent.id,
      riskDecisionId: null,
      riskOutcome: null,
      approvedBy: null,
      stage: 'PREVIEW',
      history: [{ stage: 'PREVIEW', at: input.at }],
      fill: null,
    });
  }

  preflight(execution: PaperExecution, decision: RiskDecision, at: string): PaperExecution {
    assertExecution(execution);
    assertNext(execution, 'PREFLIGHT');
    assertContract(decision, 'RISK', 'RiskDecision', 'EXECUTION');
    if (decision.orderIntentId !== execution.orderIntentId || decision.strategyId !== execution.strategyId) {
      throw new BoundaryViolationError('risk decision does not cover this order intent and Strategy ID');
    }
    if (decision.outcome === 'REJECT') throw new RiskVetoError(decision.reasons);
    return advance(execution, 'PREFLIGHT', at, { riskDecisionId: decision.id, riskOutcome: decision.outcome });
  }

  approve(execution: PaperExecution, at: string, approval?: HumanApproval): PaperExecution {
    assertExecution(execution);
    assertNext(execution, 'APPROVAL');
    let approvedBy: string;
    if (execution.riskOutcome === 'PASS') {
      approvedBy = 'RISK_ENGINE';
    } else if (execution.riskOutcome === 'NEEDS_HUMAN_APPROVAL') {
      if (approval === undefined) throw new RiskVetoError(['HUMAN_APPROVAL_REQUIRED: no approval supplied']);
      assertContract(approval, 'RISK', 'HumanApproval', 'EXECUTION');
      if (approval.riskDecisionId !== execution.riskDecisionId) {
        throw new BoundaryViolationError('human approval does not match the recorded risk decision');
      }
      approvedBy = approval.approvedBy;
    } else {
      throw new RiskVetoError(['NO_RISK_DECISION: execution has no PASS or approvable risk decision']);
    }
    return advance(execution, 'APPROVAL', at, { approvedBy });
  }

  submit(execution: PaperExecution, at: string): PaperExecution {
    assertExecution(execution);
    assertNext(execution, 'SUBMIT');
    if (execution.mode !== 'PAPER') throw new LiveExecutionDisabledError('only PAPER submissions are permitted');
    const riskApproved =
      execution.riskDecisionId !== null &&
      execution.approvedBy !== null &&
      (execution.riskOutcome === 'PASS' || execution.riskOutcome === 'NEEDS_HUMAN_APPROVAL');
    if (!riskApproved) throw new RiskVetoError(['NO_RISK_APPROVAL: submission requires PASS or approved risk state']);
    return advance(execution, 'SUBMIT', at);
  }

  acknowledge(execution: PaperExecution, fill: PaperFill): PaperExecution {
    assertExecution(execution);
    assertNext(execution, 'ACKNOWLEDGE');
    requirePositive(fill.price, 'fill.price');
    requirePositive(fill.quantity, 'fill.quantity');
    requireNonNegative(fill.fees, 'fill.fees');
    requireNonNegative(fill.slippage, 'fill.slippage');
    return advance(execution, 'ACKNOWLEDGE', fill.filledAt, { fill });
  }

  reconcile(execution: PaperExecution, intent: OrderIntent, at: string): PaperExecution {
    assertExecution(execution);
    assertNext(execution, 'RECONCILE');
    assertContract(intent, 'STRATEGY', 'OrderIntent', 'EXECUTION');
    if (intent.id !== execution.orderIntentId) throw new BoundaryViolationError('reconcile intent mismatch');
    if (execution.fill === null || execution.fill.quantity > intent.quantity) {
      throw new LifecycleError('paper fill does not reconcile against the order intent');
    }
    return advance(execution, 'RECONCILE', at);
  }
}

function assertExecution(execution: PaperExecution): void {
  assertContract(execution, 'EXECUTION', 'PaperExecution', 'EXECUTION');
}

function assertNext(execution: PaperExecution, to: ExecutionStage): void {
  const expected = EXECUTION_LIFECYCLE[EXECUTION_LIFECYCLE.indexOf(execution.stage) + 1];
  if (expected !== to) {
    throw new LifecycleError(`cannot move from ${execution.stage} to ${to}; next permitted stage is ${expected ?? 'none'}`);
  }
}

function advance(
  execution: PaperExecution,
  to: ExecutionStage,
  at: string,
  patch: Partial<PaperExecution> = {},
): PaperExecution {
  assertNext(execution, to);
  requireTimestamp(at, 'at');
  return immutableCopy<PaperExecution>({
    ...execution,
    ...patch,
    stage: to,
    history: [...execution.history, { stage: to, at }],
  });
}
