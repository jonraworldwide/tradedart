import type { SourceAttribution } from '../domain/contracts.js';
import { createExecutionEngine } from '../layers/execution.js';
import { TradeLedger, ledgerEntryFromExecution } from '../layers/ledger.js';
import { createMarketContext } from '../layers/market.js';
import { createResearchSnapshot } from '../layers/research.js';
import { defineRiskLimits, evaluateRisk, type RiskContext } from '../layers/risk.js';
import { createOrderIntent, createStrategy, type OrderIntentInput } from '../layers/strategy.js';
import { createChallenge, createThesis } from '../layers/thesis.js';

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
  return {
    decisionId: 'RISK-0001',
    decidedAt: '2026-01-01T00:06:00.000Z',
    limits: defineRiskLimits({
      maxDefinedLossQuote: 100,
      maxPositionNotionalQuote: 5000,
      humanApprovalAboveNotionalQuote: 2500,
      maxSlippageBps: 50,
    }),
    portfolio: { availableQuote: 10000, portfolioValueQuote: 10000, openOrderIntentIds: [], assetExposureQuote: {} },
    venueOperational: true,
    estimatedSlippageBps: 5,
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

  const strategy = createStrategy(thesis, challenge, {
    id: 'STRAT-BTC-0001',
    createdAt: '2026-01-01T00:04:00.000Z',
    rules: {
      entry: 'Limit buy at 60000',
      exit: 'Exit at target, stop or invalidation',
      stopLossPrice: 57000,
      takeProfitPrice: 66000,
      positionSizeQuote: 1200,
      maxPositionExposurePct: 20,
      maxPortfolioExposurePct: 50,
      timeframe: '4-8 weeks',
      allowedAssets: ['BTC'],
      invalidation: ['Daily close below 57000'],
    },
  });

  const intent = createOrderIntent(strategy, DEMO_INTENT_INPUT);
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

  return { market, research, thesis, challenge, strategy, intent, riskContext, decision, engine, execution, ledger, entry };
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
