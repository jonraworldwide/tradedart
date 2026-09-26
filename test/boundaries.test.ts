import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import * as researchLayer from '../src/layers/research.js';
import {
  BoundaryViolationError,
  LIVE_EXECUTION_ENABLED,
  LifecycleError,
  LiveExecutionDisabledError,
  PaperExecutionEngine,
  RiskVetoError,
  buildDemoPipeline,
  createExecutionEngine,
  createHumanApproval,
  createOrderIntent,
  createStrategy,
  demoRiskContext,
  DEMO_INTENT_INPUT,
  evaluateRisk,
  type PaperExecution,
  type Strategy,
  type StrategyId,
} from '../src/index.js';

const AT = '2026-01-01T01:00:00.000Z';

describe('Research cannot create an order', () => {
  test('research module exposes only snapshot creation', () => {
    assert.deepEqual(Object.keys(researchLayer), ['createResearchSnapshot']);
  });

  test('ResearchSnapshot is rejected at compile time and at runtime by the order constructor', () => {
    const d = buildDemoPipeline();
    assert.throws(
      () =>
        // @ts-expect-error a ResearchSnapshot is not a Strategy: compile-time boundary
        createOrderIntent(d.research, DEMO_INTENT_INPUT),
      BoundaryViolationError,
    );
  });

  test('ResearchSnapshot cannot stand in for a thesis to mint a strategy', () => {
    const d = buildDemoPipeline();
    assert.throws(
      () => createStrategy(d.research as never, d.challenge, { id: 'X', createdAt: AT, rules: d.strategy.rules }),
      BoundaryViolationError,
    );
  });

  test('ResearchSnapshot cannot be previewed for execution or evaluated by risk', () => {
    const d = buildDemoPipeline();
    assert.throws(() => d.engine.preview(d.research as never, d.strategy, { id: 'E', at: AT }), BoundaryViolationError);
    assert.throws(() => evaluateRisk(d.research as never, d.strategy, demoRiskContext()), BoundaryViolationError);
  });
});

describe('Execution requires Strategy ID and PASS/approved risk state', () => {
  test('missing Strategy ID is refused', () => {
    const d = buildDemoPipeline();
    const orphan = { ...d.intent, strategyId: '' as StrategyId };
    assert.throws(() => d.engine.preview(orphan, d.strategy, { id: 'E', at: AT }), /Strategy ID/);
  });

  test('order intent for another strategy is refused', () => {
    const d = buildDemoPipeline();
    const other: Strategy = { ...d.strategy, id: 'STRAT-OTHER' as StrategyId };
    assert.throws(() => d.engine.preview(d.intent, other, { id: 'E', at: AT }), BoundaryViolationError);
  });

  test('risk stage cannot be skipped', () => {
    const d = buildDemoPipeline();
    const preview = d.engine.preview(d.intent, d.strategy, { id: 'E', at: AT });
    assert.throws(() => d.engine.approve(preview, AT), LifecycleError);
    assert.throws(() => d.engine.submit(preview, AT), LifecycleError);
  });

  test('forged APPROVAL state without a risk decision cannot submit', () => {
    const d = buildDemoPipeline();
    const preview = d.engine.preview(d.intent, d.strategy, { id: 'E', at: AT });
    const forged: PaperExecution = { ...preview, stage: 'APPROVAL', approvedBy: 'someone' };
    assert.throws(() => d.engine.submit(forged, AT), RiskVetoError);
  });

  test('risk decision for a different order intent is refused', () => {
    const d = buildDemoPipeline();
    const preview = d.engine.preview(d.intent, d.strategy, { id: 'E', at: AT });
    const foreign = { ...d.decision, orderIntentId: 'INTENT-OTHER' as typeof d.decision.orderIntentId };
    assert.throws(() => d.engine.preflight(preview, foreign, AT), BoundaryViolationError);
  });

  test('NEEDS_HUMAN_APPROVAL blocks until an explicit approval is supplied', () => {
    const d = buildDemoPipeline();
    const big = createOrderIntent(d.strategy, { ...DEMO_INTENT_INPUT, id: 'INTENT-BIG', quantity: 0.03 });
    const lenient = demoRiskContext({
      decisionId: 'RISK-BIG',
      limits: { ...demoRiskContext().limits, humanApprovalAboveNotionalQuote: 1000 },
    });
    const decision = evaluateRisk(big, d.strategy, lenient);
    assert.equal(decision.outcome, 'NEEDS_HUMAN_APPROVAL');
    let exec = d.engine.preview(big, d.strategy, { id: 'E-BIG', at: AT });
    exec = d.engine.preflight(exec, decision, AT);
    assert.throws(() => d.engine.approve(exec, AT), RiskVetoError);
    const approval = createHumanApproval(decision, 'operator', AT);
    const approved = d.engine.approve(exec, AT, approval);
    assert.equal(approved.approvedBy, 'operator');
    assert.equal(d.engine.submit(approved, AT).stage, 'SUBMIT');
  });

  test('human approval cannot be attached to PASS or REJECT decisions', () => {
    const d = buildDemoPipeline();
    assert.throws(() => createHumanApproval(d.decision, 'operator', AT), BoundaryViolationError);
  });

  test('PASS decision allows the full paper lifecycle', () => {
    const d = buildDemoPipeline();
    assert.equal(d.decision.outcome, 'PASS');
    assert.deepEqual(
      d.execution.history.map((h) => h.stage),
      ['PREVIEW', 'PREFLIGHT', 'APPROVAL', 'SUBMIT', 'ACKNOWLEDGE', 'RECONCILE'],
    );
    assert.equal(d.execution.strategyId, d.strategy.id);
    assert.equal(d.execution.riskDecisionId, d.decision.id);
  });
});

describe('Risk can veto', () => {
  const cases: Array<[string, (d: ReturnType<typeof buildDemoPipeline>) => ReturnType<typeof evaluateRisk>, RegExp]> = [
    [
      'insufficient balance',
      (d) =>
        evaluateRisk(d.intent, d.strategy, demoRiskContext({ portfolio: { ...demoRiskContext().portfolio, availableQuote: 100 } })),
      /INSUFFICIENT_BALANCE/,
    ],
    [
      'duplicate order',
      (d) =>
        evaluateRisk(
          d.intent,
          d.strategy,
          demoRiskContext({ portfolio: { ...demoRiskContext().portfolio, openOrderIntentIds: [d.intent.id] } }),
        ),
      /DUPLICATE_ORDER/,
    ],
    [
      'defined loss above limit',
      (d) =>
        evaluateRisk(
          createOrderIntent(d.strategy, { ...DEMO_INTENT_INPUT, quantity: 0.05 }),
          d.strategy,
          demoRiskContext({ portfolio: { ...demoRiskContext().portfolio, portfolioValueQuote: 100000 } }),
        ),
      /MAX_LOSS/,
    ],
    ['venue unavailable', (d) => evaluateRisk(d.intent, d.strategy, demoRiskContext({ venueOperational: false })), /VENUE/],
    ['excess slippage', (d) => evaluateRisk(d.intent, d.strategy, demoRiskContext({ estimatedSlippageBps: 500 })), /SLIPPAGE/],
    [
      'stop on the wrong side of entry',
      (d) => evaluateRisk(createOrderIntent(d.strategy, { ...DEMO_INTENT_INPUT, limitPrice: 56000 }), d.strategy, demoRiskContext()),
      /UNDEFINED_LOSS/,
    ],
  ];

  for (const [name, evaluate, reason] of cases) {
    test(`REJECT on ${name}, and execution honours the veto`, () => {
      const d = buildDemoPipeline();
      const decision = evaluate(d);
      assert.equal(decision.outcome, 'REJECT');
      assert.ok(decision.reasons.some((r) => reason.test(r)), decision.reasons.join('; '));
      const intent = d.intent.id === decision.orderIntentId ? d.intent : createOrderIntent(d.strategy, DEMO_INTENT_INPUT);
      const preview = d.engine.preview(intent, d.strategy, { id: 'E', at: AT });
      assert.throws(() => d.engine.preflight(preview, decision, AT), RiskVetoError);
    });
  }

  test('strategy exposure settings cannot override risk limits', () => {
    const d = buildDemoPipeline();
    const permissive = createStrategy(d.thesis, d.challenge, {
      id: 'STRAT-PERMISSIVE',
      createdAt: AT,
      rules: { ...d.strategy.rules, maxPositionExposurePct: 100, maxPortfolioExposurePct: 100 },
    });
    const intent = createOrderIntent(permissive, { ...DEMO_INTENT_INPUT, quantity: 0.1 });
    const decision = evaluateRisk(intent, permissive, demoRiskContext());
    assert.equal(decision.outcome, 'REJECT');
    assert.ok(decision.reasons.some((r) => r.startsWith('POSITION_LIMIT')));
  });

  test('risk limits are frozen once defined', () => {
    const limits = demoRiskContext().limits;
    assert.throws(() => {
      (limits as { maxDefinedLossQuote: number }).maxDefinedLossQuote = 1e9;
    }, TypeError);
  });
});

describe('Live execution is disabled', () => {
  test('LIVE flag is hard false', () => {
    assert.equal(LIVE_EXECUTION_ENABLED, false);
  });

  test('requesting a LIVE engine throws, even with environment overrides', () => {
    assert.throws(() => createExecutionEngine('LIVE'), LiveExecutionDisabledError);
    process.env.TRADEDART_LIVE_EXECUTION = 'true';
    try {
      assert.throws(() => createExecutionEngine('LIVE'), LiveExecutionDisabledError);
    } finally {
      delete process.env.TRADEDART_LIVE_EXECUTION;
    }
  });

  test('execution engine is paper-only and exposes no live operation', () => {
    const engine = createExecutionEngine();
    assert.equal(engine.mode, 'PAPER');
    const methods = Object.getOwnPropertyNames(PaperExecutionEngine.prototype);
    assert.ok(!methods.some((m) => /live/i.test(m)), methods.join(','));
    assert.equal(buildDemoPipeline().execution.mode, 'PAPER');
  });

  test('BUILD_STATE keeps PAPER_ONLY mode and the live gate locked', () => {
    const state = JSON.parse(readFileSync(join(process.cwd(), 'BUILD_STATE.json'), 'utf8'));
    assert.equal(state.mode, 'PAPER_ONLY');
    assert.equal(state.live_execution_enabled, false);
    assert.equal(state.invariants.withdrawals_disabled, true);
    assert.equal(state.milestones.find((m: { id: string }) => m.id === 'M8-LIVE-GATE').status, 'LOCKED');
  });
});
