import type { MarketContext, MarketContextId, MarketRegime, Metric, SourceAttribution } from '../domain/contracts.js';
import { ContractValidationError } from '../domain/errors.js';
import { immutableCopy, requireNonEmpty, requireTimestamp, toId } from '../domain/guards.js';

export interface MarketContextInput {
  readonly id: string;
  readonly asOf: string;
  readonly assets: readonly string[];
  readonly regime: MarketRegime;
  readonly metrics: Readonly<Record<string, Metric>>;
  readonly sources: readonly SourceAttribution[];
}

export function validateMetrics(metrics: Readonly<Record<string, Metric>>, field: string): void {
  for (const [name, metric] of Object.entries(metrics)) {
    if (metric.status === 'AVAILABLE') {
      if (!Number.isFinite(metric.value)) {
        throw new ContractValidationError(`${field}.${name} must be finite when AVAILABLE`);
      }
      validateSource(metric.source, `${field}.${name}.source`);
    } else if (metric.status === 'MISSING') {
      requireNonEmpty(metric.reason, `${field}.${name}.reason`);
    } else {
      throw new ContractValidationError(`${field}.${name} has unknown status`);
    }
  }
}

export function validateSource(source: SourceAttribution, field: string): void {
  requireNonEmpty(source?.source, `${field}.source`);
  requireTimestamp(source.retrievedAt, `${field}.retrievedAt`);
}

/** Market Brain: produces a timestamped, source-attributed MarketContext. */
export function createMarketContext(input: MarketContextInput): MarketContext {
  requireTimestamp(input.asOf, 'asOf');
  if (input.assets.length === 0) throw new ContractValidationError('MarketContext requires at least one asset');
  if (input.sources.length === 0) throw new ContractValidationError('MarketContext requires source attribution');
  input.sources.forEach((s, i) => validateSource(s, `sources[${i}]`));
  validateMetrics(input.metrics, 'metrics');
  return immutableCopy<MarketContext>({
    layer: 'MARKET',
    kind: 'MarketContext',
    id: toId<MarketContextId>(input.id, 'id'),
    asOf: input.asOf,
    assets: input.assets,
    regime: input.regime,
    metrics: input.metrics,
    sources: input.sources,
  });
}
