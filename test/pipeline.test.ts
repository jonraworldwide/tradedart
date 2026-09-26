import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ALLOWED_UPSTREAM,
  BoundaryViolationError,
  ContractValidationError,
  LifecycleError,
  PIPELINE,
  buildDemoPipeline,
  createChallenge,
  createResearchSnapshot,
  createStrategy,
  createThesis,
  ledgerEntryFromExecution,
  runPaperPipelineDemo,
} from '../src/index.js';
import { main } from '../src/main.js';

const AT = '2026-01-01T01:00:00.000Z';

describe('Pipeline contract', () => {
  test('canonical layer order', () => {
    assert.deepEqual(PIPELINE, ['MARKET', 'RESEARCH', 'THESIS', 'STRATEGY', 'RISK', 'EXECUTION', 'LEARNING']);
  });

  test('no layer is permitted to consume a downstream layer', () => {
    for (const consumer of PIPELINE) {
      for (const upstream of ALLOWED_UPSTREAM[consumer]) {
        assert.ok(PIPELINE.indexOf(upstream) < PIPELINE.indexOf(consumer), `${consumer} consumes ${upstream}`);
      }
    }
    assert.deepEqual(ALLOWED_UPSTREAM.RESEARCH, ['MARKET']);
    assert.deepEqual(ALLOWED_UPSTREAM.RISK, ['STRATEGY']);
  });

  test('each contract references its upstream contract', () => {
    const d = buildDemoPipeline();
    assert.equal(d.research.marketContextId, d.market.id);
    assert.equal(d.thesis.researchSnapshotId, d.research.id);
    assert.equal(d.challenge.thesisId, d.thesis.id);
    assert.equal(d.strategy.thesisId, d.thesis.id);
    assert.equal(d.strategy.challengeId, d.challenge.id);
    assert.equal(d.intent.strategyId, d.strategy.id);
    assert.equal(d.decision.orderIntentId, d.intent.id);
    assert.equal(d.execution.riskDecisionId, d.decision.id);
    assert.equal(d.entry.executionId, d.execution.id);
    assert.equal(d.entry.strategyId, d.strategy.id);
    assert.equal(d.entry.marketContextId, d.market.id);
    assert.equal(d.entry.realizedPnl, 58.6);
  });

  test('layers reject inputs that skip a stage', () => {
    const d = buildDemoPipeline();
    assert.throws(() => createResearchSnapshot(d.thesis as never, { ...d.research, id: 'R2' }), BoundaryViolationError);
    assert.throws(() => createThesis(d.market as never, { ...d.thesis, id: 'T2' }), BoundaryViolationError);
    assert.throws(
      () => createStrategy(d.thesis, d.research as never, { id: 'S2', createdAt: AT, rules: d.strategy.rules }),
      BoundaryViolationError,
    );
  });

  test('only a thesis that survives its challenge becomes a strategy', () => {
    const d = buildDemoPipeline();
    const rejected = createChallenge(d.thesis, {
      id: 'CHL-REJ',
      createdAt: AT,
      findings: [{ dimension: 'UNLOCKS', assessment: 'Supply overhang', severity: 'HIGH' }],
      verdict: 'THESIS_REJECTED',
    });
    assert.throws(
      () => createStrategy(d.thesis, rejected, { id: 'S3', createdAt: AT, rules: d.strategy.rules }),
      BoundaryViolationError,
    );
  });

  test('thesis requires every canonical field', () => {
    const d = buildDemoPipeline();
    assert.throws(() => createThesis(d.research, { ...d.thesis, id: 'T3', whatWouldProveWrong: [] }), ContractValidationError);
    assert.throws(() => createThesis(d.research, { ...d.thesis, id: 'T4', biggestRisk: ' ' }), ContractValidationError);
  });

  test('missing metrics remain explicitly missing', () => {
    const d = buildDemoPipeline();
    assert.equal(d.research.metrics.feesToMarketCap?.status, 'MISSING');
    assert.equal(d.market.metrics.fundingRate?.status, 'MISSING');
  });

  test('unreconciled executions cannot be recorded', () => {
    const d = buildDemoPipeline();
    const preview = d.engine.preview(d.intent, d.strategy, { id: 'E', at: AT });
    assert.throws(
      () =>
        ledgerEntryFromExecution(
          { execution: preview, intent: d.intent, strategy: d.strategy, thesis: d.thesis, research: d.research },
          { tradeId: 'T', entryReason: 'x', exitPrice: null, exitReason: null, closedAt: null, recordedAt: AT },
        ),
      LifecycleError,
    );
  });

  test('application scaffold runs end to end in paper mode', () => {
    const summary = runPaperPipelineDemo();
    assert.equal(summary.mode, 'PAPER');
    assert.equal(summary.riskOutcome, 'PASS');
    assert.equal(summary.ledgerSize, 1);
    assert.equal(summary.pipeline.length, PIPELINE.length);
    assert.doesNotThrow(() => main());
  });
});
