import type { Metric } from '../domain/contracts.js';
import type { StrategyCandidate, StrategyPlugin } from './strategy-plugins.js';

export interface LegacyMomentumConfig {
  readonly strategyId: string;
  readonly intentId: string;
  readonly asset: string;
  readonly minMovePct: number;
  readonly desiredQuantity: number;
  readonly stopLossPct: number;
  readonly takeProfitPct: number;
}

function observed(metric: Metric | undefined): number | null {
  return metric?.status === 'AVAILABLE' && Number.isFinite(metric.value) ? metric.value : null;
}

/** Legacy directional heuristic retained as a paper comparison. No profitability claim. */
export function legacyMomentumPlugin(config: LegacyMomentumConfig): StrategyPlugin {
  return {
    key: 'LEGACY_MOMENTUM',
    version: 1,
    generate({ signal, thesis }): readonly StrategyCandidate[] {
      if (thesis.asset !== config.asset) return [];
      const price = observed(signal.metrics.price);
      const change = observed(signal.metrics.changePct);
      if (price === null || price <= 0 || change === null || change < config.minMovePct) return [];
      const stop = price * (1 - config.stopLossPct / 100);
      const target = price * (1 + config.takeProfitPct / 100);
      return [{
        strategyId: config.strategyId,
        createdAt: signal.asOf,
        rules: {
          entry: `Paper heuristic: ${config.asset} move >= ${config.minMovePct}%`,
          exit: 'Paper stop, target or thesis invalidation',
          stopLossPrice: stop,
          takeProfitPrice: target,
          positionSizeQuote: price * config.desiredQuantity,
          maxPositionExposurePct: 20,
          maxPortfolioExposurePct: 50,
          timeframe: 'paper fixture',
          allowedAssets: [config.asset],
          invalidation: ['Thesis invalidation or stale market observation'],
        },
        intent: {
          id: config.intentId,
          asset: config.asset,
          side: 'BUY',
          quantity: config.desiredQuantity,
          limitPrice: price,
          createdAt: signal.asOf,
        },
      }];
    },
    manage(position, signal) {
      const price = observed(signal.metrics.price);
      return [{
        asset: position.asset,
        action: price === null ? 'PROPOSE_EXIT' as const : 'HOLD' as const,
        reason: price === null ? 'Mark unavailable; risk review required' : 'No exit rule fired',
      }];
    },
  };
}
