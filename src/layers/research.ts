import type { EvidenceItem, MarketContext, Metric, ResearchSnapshot, ResearchSnapshotId } from '../domain/contracts.js';
import { ContractValidationError } from '../domain/errors.js';
import { assertContract, immutableCopy, requireNonEmpty, requireTimestamp, toId } from '../domain/guards.js';
import { validateMetrics, validateSource } from './market.js';

export interface ResearchSnapshotInput {
  readonly id: string;
  readonly asset: string;
  readonly frozenAt: string;
  readonly metrics: Readonly<Record<string, Metric>>;
  readonly evidence: readonly EvidenceItem[];
}

/**
 * Research Engine: freezes an immutable evidence snapshot derived from a MarketContext.
 * This module deliberately exposes no order or execution capability.
 */
export function createResearchSnapshot(market: MarketContext, input: ResearchSnapshotInput): ResearchSnapshot {
  assertContract(market, 'MARKET', 'MarketContext', 'RESEARCH');
  if (!market.assets.includes(input.asset)) {
    throw new ContractValidationError(`asset ${input.asset} is not covered by MarketContext ${market.id}`);
  }
  requireTimestamp(input.frozenAt, 'frozenAt');
  validateMetrics(input.metrics, 'metrics');
  input.evidence.forEach((item, i) => {
    requireNonEmpty(item.claim, `evidence[${i}].claim`);
    validateSource(item.source, `evidence[${i}].source`);
  });
  return immutableCopy<ResearchSnapshot>({
    layer: 'RESEARCH',
    kind: 'ResearchSnapshot',
    id: toId<ResearchSnapshotId>(input.id, 'id'),
    marketContextId: market.id,
    asset: input.asset,
    frozenAt: input.frozenAt,
    metrics: input.metrics,
    evidence: input.evidence,
  });
}
