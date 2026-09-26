import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ContractValidationError,
  LifecycleError,
  advanceProposal,
  buildDemoPipeline,
  proposeStrategyChange,
  versionStrategy,
} from '../src/index.js';

const AT = '2026-02-01T00:00:00.000Z';

function proposal() {
  const d = buildDemoPipeline();
  const p = proposeStrategyChange(d.strategy, {
    id: 'PROP-0001',
    proposedRules: { takeProfitPrice: 65000 },
    rationale: 'Targets rarely reached in review window',
    evidenceTradeIds: [d.entry.tradeId],
    createdAt: AT,
  });
  return { d, p };
}

describe('Learning proposes, never mutates', () => {
  test('proposals must cite ledger evidence', () => {
    const d = buildDemoPipeline();
    assert.throws(
      () =>
        proposeStrategyChange(d.strategy, { id: 'P', proposedRules: {}, rationale: 'r', evidenceTradeIds: [], createdAt: AT }),
      ContractValidationError,
    );
  });

  test('PROPOSE → TEST → COMPARE → APPROVE → VERSION cannot be skipped', () => {
    const { d, p } = proposal();
    assert.throws(() => advanceProposal(p, 'APPROVE', AT, 'operator'), LifecycleError);
    assert.throws(() => versionStrategy(d.strategy, p, AT), LifecycleError);
    const compared = advanceProposal(advanceProposal(p, 'TEST', AT), 'COMPARE', AT);
    assert.throws(() => versionStrategy(d.strategy, compared, AT), LifecycleError);
    assert.throws(() => advanceProposal(compared, 'APPROVE', AT), ContractValidationError);
  });

  test('versioning creates a new strategy version and leaves the active one untouched', () => {
    const { d, p } = proposal();
    const approved = advanceProposal(advanceProposal(advanceProposal(p, 'TEST', AT), 'COMPARE', AT), 'APPROVE', AT, 'operator');
    const result = versionStrategy(d.strategy, approved, AT);
    assert.equal(result.strategy.id, d.strategy.id);
    assert.equal(result.strategy.version, 2);
    assert.equal(result.strategy.rules.takeProfitPrice, 65000);
    assert.equal(result.version.sourceProposalId, approved.id);
    assert.equal(result.version.approvedBy, 'operator');
    assert.equal(result.proposal.stage, 'VERSION');
    assert.equal(d.strategy.version, 1);
    assert.equal(d.strategy.rules.takeProfitPrice, 66000);
    assert.ok(Object.isFrozen(d.strategy.rules));
    assert.equal(d.ledger.get(d.entry.tradeId)?.strategyVersion, 1);
  });

  test('the same approved proposal cannot be versioned against a newer strategy', () => {
    const { d, p } = proposal();
    const approved = advanceProposal(advanceProposal(advanceProposal(p, 'TEST', AT), 'COMPARE', AT), 'APPROVE', AT, 'operator');
    const { strategy: v2 } = versionStrategy(d.strategy, approved, AT);
    assert.throws(() => versionStrategy(v2, approved, AT));
  });
});
