import type { SourceAttribution } from '../domain/contracts.js';
import { createExecutionEngine } from '../layers/execution.js';
import { TradeLedger, ledgerEntryFromExecution } from '../layers/ledger.js';
import { createMarketContext } from '../layers/market.js';
import { legacyMomentumPlugin } from '../layers/legacy-momentum.js';
import { createResearchSnapshot } from '../layers/research.js';
import { defineRiskLimits, evaluateRisk, type RiskContext } from '../layers/risk.js';
import { reconcilePaperEquity, updatePaperRisk } from '../layers/paper-portfolio.js';
import { type OrderIntentInput } from '../layers/strategy.js';
import { StrategyRegistry } from '../layers/strategy-plugins.js';
import { createChallenge, createThesis, createThesisSignal } from '../layers/thesis.js';

/** Deterministic paper fixture exercising every layer of the pipeline. No network access. */
const FIXTURE_SOURCE: SourceAttribution = {
  source: 'fixture:paper-demo',
  retrievedAt: '2026-01-01T00:00:00.000Z',
};

export const DEMO_INTENT_INPUT: OrderIntentInput = {
  id: 'INTENT-0001',
  asset: 'BTC',
  side: 'BUY',
  quantity: 0.02,
  limitPrice: 60000,
  createdAt: '2026-01-01T00:05:00.000Z',
};

export function demoRiskContext(overrides: Partial<RiskContext> = {}): RiskContext {
  const snapshot = reconcilePaperEquity({
    cashQuote: 10000, reservedQuote: 0, realizedPnlQuote: 0, positions: [], marks: {},
    openOrderIntentIds: [], asOf: '2026-01-01T00:05:00.000Z', maxMarkAgeMs: 60000,
  });
  return {
    decisionId: 'RISK-0001',
    decidedAt: '2026-01-01T00:06:00.000Z',
    limits: defineRiskLimits({
      maxDefinedLossQuote: 100,
      maxPositionNotionalQuote: 5000,
      humanApprovalAboveNotionalQuote: 2500,
      maxSlippageBps: 50,
      maxRiskPctEquity: 1,
      maxNotionalPctEquity: 25,
      dailyLossPct: 3,
      totalDrawdownPct: 8,
      maxAccountAgeMs: 900000,
    }),
    portfolio: { availableQuote: 10000, portfolioValueQuote: 10000, openOrderIntentIds: [], assetExposureQuote: {} },
    venueOperational: true,
    estimatedSlippageBps: 5,
    paperRisk: updatePaperRisk(snapshot, { dailyLossPct: 3, totalDrawdownPct: 8 }),
    ...overrides,
  };
}

export function buildDemoPipeline() {
  const market = createMarketContext({
    id: 'MKT-0001',
    asOf: '2026-01-01T00:00:00.000Z',
    assets: ['BTC', 'ETH'],
    regime: 'BTC_LED',
    metrics: {
      btcPrice: { status: 'AVAILABLE', value: 60000, source: FIXTURE_SOURCE },
      'BTC.price': { status: 'AVAILABLE', value: 60000, source: FIXTURE_SOURCE },
      'BTC.changePct': { status: 'AVAILABLE', value: 4, source: FIXTURE_SOURCE },
      fundingRate: { status: 'MISSING', reason: 'no attributable source in fixture' },
    },
    sources: [FIXTURE_SOURCE],
  });

  const research = createResearchSnapshot(market, {
    id: 'RES-0001',
    asset: 'BTC',
    frozenAt: '2026-01-01T00:01:00.000Z',
    metrics: {
      price: { status: 'AVAILABLE', value: 60000, source: FIXTURE_SOURCE },
      changePct: { status: 'AVAILABLE', value: 4, source: FIXTURE_SOURCE },
      feesToMarketCap: { status: 'MISSING', reason: 'no primary source' },
    },
    evidence: [{ claim: 'Fixture evidence item', source: FIXTURE_SOURCE }],
  });

  const thesis = createThesis(research, {
    id: 'THS-0001',
    createdAt: '2026-01-01T00:02:00.000Z',
    coreThesis: 'Fixture core thesis',
    whyNow: 'Fixture timing rationale',
    mispricingHypothesis: 'Fixture mispricing hypothesis',
    keyCatalysts: ['Fixture catalyst'],
    catalystTimeframe: '4-8 weeks',
    tokenValueCapture: 'Fixture value capture',
    competitiveAdvantage: 'Fixture advantage',
    biggestRisk: 'Fixture risk',
    invalidationConditions: ['Daily close below 57000'],
    metricsToMonitor: ['price'],
    whatWouldProveWrong: ['Fixture falsification condition'],
  });

  const challenge = createChallenge(thesis, {
    id: 'CHL-0001',
    createdAt: '2026-01-01T00:03:00.000Z',
    findings: [{ dimension: 'VALUATION', assessment: 'Fixture adversarial assessment', severity: 'MEDIUM' }],
    verdict: 'THESIS_SURVIVES',
  });

  const registry = new StrategyRegistry([legacyMomentumPlugin({
    strategyId: 'STRAT-BTC-0001', intentId: DEMO_INTENT_INPUT.id, asset: 'BTC',
    minMovePct: 3, desiredQuantity: 0.02, stopLossPct: 5, takeProfitPct: 10,
  })]);
  const signal = createThesisSignal(thesis, research);
  const proposal = registry.propose(['LEGACY_MOMENTUM'], { signal, thesis, challenge })[0];
  if (!proposal) throw new Error('paper fixture did not produce a strategy proposal');
  const { strategy, intent } = proposal;
  const riskContext = demoRiskContext();
  const decision = evaluateRisk(intent, strategy, riskContext);

  const engine = createExecutionEngine('PAPER');
  let execution = engine.preview(intent, strategy, { id: 'EXEC-0001', at: '2026-01-01T00:07:00.000Z' });
  execution = engine.preflight(execution, decision, '2026-01-01T00:08:00.000Z');
  execution = engine.approve(execution, '2026-01-01T00:09:00.000Z');
  execution = engine.submit(execution, '2026-01-01T00:10:00.000Z');
  execution = engine.acknowledge(execution, {
    price: 60010,
    quantity: 0.02,
    fees: 1.2,
    slippage: 0.2,
    filledAt: '2026-01-01T00:11:00.000Z',
  });
  execution = engine.reconcile(execution, intent, '2026-01-01T00:12:00.000Z');

  const ledger = new TradeLedger();
  const entry = ledger.append(
    ledgerEntryFromExecution(
      { execution, intent, strategy, thesis, research },
      {
        tradeId: 'TRADE-0001',
        entryReason: 'Strategy STRAT-BTC-0001 entry rule met',
        exitPrice: 63000,
        exitReason: 'Fixture exit',
        closedAt: '2026-01-02T00:00:00.000Z',
        recordedAt: '2026-01-02T00:00:01.000Z',
      },
    ),
  );

  return { market, research, thesis, signal, challenge, strategy, intent, riskContext, decision, engine, execution, ledger, entry };
}

export function runPaperPipelineDemo() {
  const d = buildDemoPipeline();
  return {
    mode: d.engine.mode,
    pipeline: [d.market.id, d.research.id, d.thesis.id, d.strategy.id, d.decision.id, d.execution.id, d.entry.tradeId],
    riskOutcome: d.decision.outcome,
    executionStages: d.execution.history.map((h) => h.stage),
    ledgerSize: d.ledger.size,
    realizedPnl: d.entry.realizedPnl,
  };
}
