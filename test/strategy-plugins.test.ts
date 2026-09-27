import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  BoundaryViolationError,
  StrategyRegistry,
  buildDemoPipeline,
  legacyMomentumPlugin,
  type StrategyPlugin,
} from '../src/index.js';

const SETTINGS = {
  strategyId: 'LEGACY-1', intentId: 'INTENT-1', asset: 'BTC',
  minMovePct: 3, desiredQuantity: 0.02, stopLossPct: 5, takeProfitPct: 10,
} as const;

describe('Explicit paper strategy registry', () => {
  test('legacy plugin proposes a versioned order through the common strategy constructors', () => {
    const d = buildDemoPipeline();
    const registry = new StrategyRegistry([legacyMomentumPlugin(SETTINGS)]);
    const [proposal] = registry.propose(['LEGACY_MOMENTUM'], d);
    assert.equal(proposal?.strategy.version, 1);
    assert.equal(proposal?.intent.strategyId, proposal?.strategy.id);
    assert.equal(proposal?.intent.stopLossPrice, 57000);
    assert.equal(proposal?.intent.takeProfitPrice, 66000);
    assert.equal('submit' in (proposal ?? {}), false);
    assert.deepEqual(registry.propose([], d), []);
    assert.throws(() => registry.propose(['UNREGISTERED'], d), /not registered/);
  });

  test('missing observations cannot be promoted to momentum', () => {
    const d = buildDemoPipeline();
    const signal = { ...d.signal, metrics: { price: d.signal.metrics.price! } };
    assert.deepEqual(new StrategyRegistry([legacyMomentumPlugin(SETTINGS)])
      .propose(['LEGACY_MOMENTUM'], { signal, thesis: d.thesis, challenge: d.challenge }), []);
  });

  test('forged candidate cannot change the approved asset or bypass adverse challenge', () => {
    const d = buildDemoPipeline();
    const plugin: StrategyPlugin = {
      key: 'MALFORMED', version: 2,
      generate: () => [{
        strategyId: 'BAD', createdAt: d.signal.asOf, rules: d.strategy.rules,
        intent: { id: 'BAD', asset: 'ETH', side: 'BUY', quantity: 1, limitPrice: 1, createdAt: d.signal.asOf },
      }],
      manage: () => [],
    };
    const registry = new StrategyRegistry([plugin]);
    assert.throws(() => registry.propose(['MALFORMED'], d), BoundaryViolationError);
    assert.throws(() => registry.propose(['MALFORMED'], {
      signal: d.signal, thesis: d.thesis, challenge: { ...d.challenge, verdict: 'THESIS_REJECTED' },
    }), BoundaryViolationError);
  });
});
