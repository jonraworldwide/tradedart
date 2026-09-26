import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildDemoPipeline,
  createOrderIntent,
  demoRiskContext,
  evaluateRisk,
  reconcilePaperEquity,
  sizePaperOrder,
  updatePaperRisk,
  type PaperAccountInput,
} from '../src/index.js';

const AT = '2026-01-01T00:05:00.000Z';
const LIMITS = { dailyLossPct: 3, totalDrawdownPct: 8 };

function account(cashQuote: number, asOf = AT, overrides: Partial<PaperAccountInput> = {}) {
  return reconcilePaperEquity({
    cashQuote, reservedQuote: 0, realizedPnlQuote: 0, positions: [], marks: {},
    openOrderIntentIds: [], asOf, maxMarkAgeMs: 60000, ...overrides,
  });
}

describe('Reconciled paper equity', () => {
  test('marks open positions, distinguishes unrealized from realized P&L and reserves pending cash', () => {
    const snapshot = account(3900, AT, {
      reservedQuote: 400, realizedPnlQuote: 12,
      positions: [{ asset: 'BTC', quantity: 0.1, entryPrice: 60000 }],
      marks: { BTC: { price: 61000, source: 'fixture:mark', asOf: AT } },
      openOrderIntentIds: ['OPEN-1'],
    });
    assert.equal(snapshot.equityQuote, 10000);
    assert.equal(snapshot.availableQuote, 3500);
    assert.equal(snapshot.unrealizedPnlQuote, 100);
    assert.equal(snapshot.realizedPnlQuote, 12);
    assert.equal(snapshot.markEvidence.BTC?.source, 'fixture:mark');
    assert.deepEqual(snapshot.openOrderIntentIds, ['OPEN-1']);
  });

  test('never prices positions with missing, stale or future marks', () => {
    const pos = [{ asset: 'BTC', quantity: 1, entryPrice: 100 }];
    assert.throws(() => account(100, AT, { positions: pos }), /MISSING_MARK/);
    assert.throws(() => account(100, AT, { positions: pos, marks: {
      BTC: { price: 100, source: 'test', asOf: '2026-01-01T00:03:00.000Z' },
    } }), /STALE_MARK/);
    assert.throws(() => account(100, AT, { positions: pos, marks: {
      BTC: { price: 100, source: 'test', asOf: '2026-01-01T00:06:00.000Z' },
    } }), /STALE_MARK/);
  });
});

describe('Paper risk checkpoint and execution veto', () => {
  test('unrealized position loss contributes to daily drawdown', () => {
    const position = [{ asset: 'BTC', quantity: 0.1, entryPrice: 60000 }];
    const start = account(3900, AT, {
      positions: position, marks: { BTC: { price: 61000, asOf: AT, source: 'fixture:mark' } },
    });
    const laterAt = '2026-01-01T00:07:00.000Z';
    const later = account(3900, laterAt, {
      positions: position, marks: { BTC: { price: 57900, asOf: laterAt, source: 'fixture:mark' } },
    });
    const checkpoint = updatePaperRisk(later, LIMITS, updatePaperRisk(start, LIMITS));
    assert.equal(checkpoint.freezeReason, 'DAILY_DRAWDOWN_LIMIT');
    assert.equal(checkpoint.equityAtFreezeQuote, 9690);
    assert.equal(later.unrealizedPnlQuote, -210);
  });

  test('daily loss pauses new entries, records the freeze and clears only on the next UTC day', () => {
    const first = updatePaperRisk(account(10000), LIMITS);
    const loss = updatePaperRisk(account(9699, '2026-01-01T00:07:00.000Z'), LIMITS, first);
    assert.equal(loss.freezeReason, 'DAILY_DRAWDOWN_LIMIT');
    assert.equal(loss.equityAtFreezeQuote, 9699);
    assert.equal(loss.frozenAt, '2026-01-01T00:07:00.000Z');
    const d = buildDemoPipeline();
    const veto = evaluateRisk(d.intent, d.strategy, demoRiskContext({
      decidedAt: '2026-01-01T00:08:00.000Z', paperRisk: loss,
      portfolio: { ...demoRiskContext().portfolio, portfolioValueQuote: 9699, availableQuote: 9699 },
    }));
    assert.equal(veto.outcome, 'REJECT');
    assert.ok(veto.reasons.some((r) => r.startsWith('DAILY_DRAWDOWN_LIMIT')));
    const preview = d.engine.preview(d.intent, d.strategy, { id: 'PAUSED', at: '2026-01-01T00:08:00.000Z' });
    assert.throws(() => d.engine.preflight(preview, veto, '2026-01-01T00:09:00.000Z'), /Risk veto/);
    const still = updatePaperRisk(account(9900, '2026-01-01T00:10:00.000Z'), LIMITS, loss);
    assert.equal(still.freezeReason, 'DAILY_DRAWDOWN_LIMIT');
    assert.equal(still.equityAtFreezeQuote, 9699);
    const next = updatePaperRisk(account(9900, '2026-01-02T00:01:00.000Z'), LIMITS, still);
    assert.equal(next.freezeReason, null);
    assert.equal(next.dayStartEquityQuote, 9900);
  });

  test('lifetime high-water kill stays latched after a new day and after restart serialization', () => {
    const first = updatePaperRisk(account(10000), LIMITS);
    const peak = updatePaperRisk(account(11000, '2026-01-01T00:06:00.000Z'), LIMITS, first);
    const killed = updatePaperRisk(account(10100, '2026-01-01T00:07:00.000Z'), LIMITS, peak);
    assert.equal(killed.freezeReason, 'TOTAL_DRAWDOWN_LIMIT');
    assert.equal(killed.peakEquityQuote, 11000);
    const restored = JSON.parse(JSON.stringify(killed)) as typeof killed;
    const tomorrow = updatePaperRisk(account(11000, '2026-01-02T00:08:00.000Z'), LIMITS, restored);
    assert.equal(tomorrow.freezeReason, 'TOTAL_DRAWDOWN_LIMIT');
    assert.equal(tomorrow.equityAtFreezeQuote, 10100);
    const wiped = updatePaperRisk(account(0, '2026-01-03T00:08:00.000Z'), LIMITS, tomorrow);
    assert.equal(wiped.freezeReason, 'TOTAL_DRAWDOWN_LIMIT');
    assert.equal(wiped.totalDrawdownPct, 100);
  });

  test('equity, available funds and stop distance cap size without rounding up to venue minimum', () => {
    const d = buildDemoPipeline();
    const risk = demoRiskContext();
    const sized = sizePaperOrder({
      side: 'BUY', entryPrice: 100, stopLossPrice: 95, desiredQuantity: 20,
      quantityStep: 0.01, minNotionalQuote: 5,
    }, risk.paperRisk, risk.limits);
    assert.equal(sized, 20); // 20 units * $5 stop distance = the 1% risk budget of $100.
    const small = updatePaperRisk(account(17.32), LIMITS);
    assert.throws(() => sizePaperOrder({
      side: 'BUY', entryPrice: 100, stopLossPrice: 99, desiredQuantity: 1,
      quantityStep: 0.01, minNotionalQuote: 5,
    }, small, risk.limits), /BELOW_MIN_NOTIONAL/);
    const oversized = createOrderIntent(d.strategy, { ...d.intent, id: 'OVERSIZE', quantity: 0.05 });
    const decision = evaluateRisk(oversized, d.strategy, risk);
    assert.ok(decision.reasons.some((r) => r.startsWith('EQUITY_NOTIONAL_LIMIT')));
    assert.equal(decision.outcome, 'REJECT');
    assert.throws(() => sizePaperOrder({
      side: 'SELL', entryPrice: 100, stopLossPrice: 105, desiredQuantity: 1,
      quantityStep: 0.01, minNotionalQuote: 5,
    }, risk.paperRisk, risk.limits), /SHORT_MARGIN_MODEL_UNAVAILABLE/);
  });

  test('stale or contradictory portfolio input is rejected even when a strategy signal passes', () => {
    const d = buildDemoPipeline();
    const stale = evaluateRisk(d.intent, d.strategy, demoRiskContext({ decidedAt: '2026-01-02T00:06:00.000Z' }));
    assert.ok(stale.reasons.some((r) => r.startsWith('PAPER_ACCOUNT_STALE')));
    const mismatch = evaluateRisk(d.intent, d.strategy, demoRiskContext({
      portfolio: { ...demoRiskContext().portfolio, portfolioValueQuote: 20000 },
    }));
    assert.ok(mismatch.reasons.some((r) => r.startsWith('PAPER_ACCOUNT_MISMATCH')));
  });
});
