import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ImmutableHistoryError, TradeLedger, buildDemoPipeline, type LedgerRecord, type TradeLedgerEntry } from '../src/index.js';

const AT = '2026-01-03T00:00:00.000Z';

describe('Immutable trade ledger', () => {
  test('returned entries are frozen and cannot be reassigned or deleted', () => {
    const { entry, ledger } = buildDemoPipeline();
    assert.ok(Object.isFrozen(entry));
    assert.throws(() => {
      (entry as { realizedPnl: number | null }).realizedPnl = 1e9;
    }, TypeError);
    assert.throws(() => {
      delete (entry as { fees?: number }).fees;
    }, TypeError);
    const stored = ledger.get(entry.tradeId);
    assert.ok(stored);
    assert.throws(() => {
      (stored as { exitPrice: number | null }).exitPrice = 1;
    }, TypeError);
    assert.equal(ledger.get(entry.tradeId)?.realizedPnl, 58.6);
  });

  test('records() cannot be used to rewrite history', () => {
    const { ledger, entry } = buildDemoPipeline();
    const records = ledger.records();
    assert.throws(() => (records as LedgerRecord[]).push(entry), TypeError);
    assert.throws(() => (records as LedgerRecord[]).splice(0, 1), TypeError);
    assert.throws(() => {
      (records as LedgerRecord[])[0] = { ...entry, realizedPnl: 0 };
    }, TypeError);
    assert.equal(ledger.size, 1);
    assert.equal(ledger.get(entry.tradeId)?.realizedPnl, 58.6);
  });

  test('mutating the input after append does not reach the stored entry', () => {
    const { entry } = buildDemoPipeline();
    const ledger = new TradeLedger();
    const draft = { ...entry } as { -readonly [K in keyof TradeLedgerEntry]: TradeLedgerEntry[K] };
    ledger.append(draft);
    draft.realizedPnl = -1;
    assert.equal(ledger.get(entry.tradeId)?.realizedPnl, 58.6);
  });

  test('an existing trade cannot be re-appended/overwritten', () => {
    const { ledger, entry } = buildDemoPipeline();
    assert.throws(() => ledger.append({ ...entry, realizedPnl: 0 }), ImmutableHistoryError);
    assert.equal(ledger.size, 1);
  });

  test('domain API exposes no update, delete or replace operation', () => {
    const methods = Object.getOwnPropertyNames(TradeLedger.prototype);
    const forbidden = methods.filter((m) => /update|delete|remove|set|replace|clear|splice|edit|mutate/i.test(m));
    assert.deepEqual(forbidden, []);
    const { ledger } = buildDemoPipeline();
    assert.deepEqual(Object.keys(ledger), []);
  });

  test('corrections are additive and leave the original entry intact', () => {
    const { ledger, entry } = buildDemoPipeline();
    const correction = ledger.appendCorrection({
      correctionId: 'COR-0001',
      correctsTradeId: entry.tradeId,
      reason: 'Venue fee schedule reconciliation',
      amendments: { fees: 1.5, realizedPnl: 58.3 },
      recordedAt: AT,
    });
    assert.ok(Object.isFrozen(correction));
    assert.equal(ledger.size, 2);
    assert.equal(ledger.get(entry.tradeId)?.fees, 1.2);
    assert.equal(ledger.effective(entry.tradeId)?.fees, 1.5);
    assert.equal(ledger.effective(entry.tradeId)?.realizedPnl, 58.3);
    assert.throws(
      () =>
        ledger.appendCorrection({
          correctionId: 'COR-0002',
          correctsTradeId: 'UNKNOWN',
          reason: 'x',
          amendments: {},
          recordedAt: AT,
        }),
      ImmutableHistoryError,
    );
  });
});
