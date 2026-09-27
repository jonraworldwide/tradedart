import type {
  OrderIntent, Strategy, StrategyRules, ThesisChallenge, ThesisSnapshot, ThesisSignal,
} from '../domain/contracts.js';
import { BoundaryViolationError, ContractValidationError } from '../domain/errors.js';
import { assertContract, immutableCopy, requireNonEmpty } from '../domain/guards.js';
import { createOrderIntent, createStrategy, type OrderIntentInput } from './strategy.js';

export interface StrategyContext {
  readonly signal: ThesisSignal;
  readonly thesis: ThesisSnapshot;
  readonly challenge: ThesisChallenge;
}

export interface StrategyCandidate {
  readonly strategyId: string;
  readonly createdAt: string;
  readonly rules: StrategyRules;
  readonly intent: OrderIntentInput;
}

export interface PaperPositionView {
  readonly asset: string;
  readonly quantity: number;
  readonly entryPrice: number;
}

/** A management suggestion cannot close a position or submit an order by itself. */
export interface ManagementProposal {
  readonly asset: string;
  readonly action: 'HOLD' | 'PROPOSE_EXIT';
  readonly reason: string;
}

/** Plugins receive frozen snapshots and may only propose. They receive no risk or execution capability. */
export interface StrategyPlugin {
  readonly key: string;
  readonly version: number;
  generate(context: StrategyContext): readonly StrategyCandidate[];
  manage(position: PaperPositionView, signal: ThesisSignal): readonly ManagementProposal[];
}

export interface RegisteredProposal {
  readonly pluginKey: string;
  readonly strategy: Strategy;
  readonly intent: OrderIntent;
}

export class StrategyRegistry {
  readonly #plugins = new Map<string, StrategyPlugin>();

  constructor(plugins: readonly StrategyPlugin[]) {
    for (const plugin of plugins) {
      requireNonEmpty(plugin.key, 'plugin.key');
      if (!Number.isSafeInteger(plugin.version) || plugin.version < 1) {
        throw new ContractValidationError('plugin.version must be a positive integer');
      }
      if (this.#plugins.has(plugin.key)) throw new ContractValidationError(`duplicate plugin: ${plugin.key}`);
      this.#plugins.set(plugin.key, plugin);
    }
  }

  /** Explicit allowlist; nothing is imported by file discovery or enabled implicitly. */
  propose(enabledKeys: readonly string[], context: StrategyContext): readonly RegisteredProposal[] {
    assertContract(context.signal, 'THESIS', 'ThesisSignal', 'STRATEGY');
    assertContract(context.thesis, 'THESIS', 'ThesisSnapshot', 'STRATEGY');
    assertContract(context.challenge, 'THESIS', 'ThesisChallenge', 'STRATEGY');
    if (context.challenge.thesisId !== context.thesis.id || context.challenge.verdict !== 'THESIS_SURVIVES') {
      throw new BoundaryViolationError('strategy plugin requires a surviving, challenged thesis');
    }
    if (context.signal.thesisId !== context.thesis.id || context.signal.asset !== context.thesis.asset ||
        context.signal.researchSnapshotId !== context.thesis.researchSnapshotId) {
      throw new BoundaryViolationError('strategy signal is not linked to the approved thesis and research');
    }
    const results: RegisteredProposal[] = [];
    for (const key of enabledKeys) {
      const plugin = this.#plugins.get(key);
      if (!plugin) throw new ContractValidationError(`strategy plugin ${key} is not registered`);
      const candidates = plugin.generate(immutableCopy(context));
      if (!Array.isArray(candidates)) throw new ContractValidationError(`strategy plugin ${key} returned no candidate list`);
      for (const candidate of candidates) {
        if (candidate.intent.asset !== context.thesis.asset) {
          throw new BoundaryViolationError('plugin candidate asset differs from approved thesis');
        }
        const strategy = createStrategy(context.thesis, context.challenge, {
          id: candidate.strategyId, createdAt: candidate.createdAt, rules: candidate.rules, version: plugin.version,
        });
        const intent = createOrderIntent(strategy, candidate.intent);
        results.push(immutableCopy({ pluginKey: key, strategy, intent }));
      }
    }
    return Object.freeze(results);
  }

  manage(key: string, position: PaperPositionView, signal: ThesisSignal): readonly ManagementProposal[] {
    const plugin = this.#plugins.get(key);
    if (!plugin) throw new ContractValidationError(`strategy plugin ${key} is not registered`);
    assertContract(signal, 'THESIS', 'ThesisSignal', 'STRATEGY');
    if (signal.asset !== position.asset) throw new BoundaryViolationError('position asset differs from thesis signal');
    const proposals = plugin.manage(immutableCopy(position), immutableCopy(signal));
    for (const proposal of proposals) {
      if (proposal.asset !== position.asset || !['HOLD', 'PROPOSE_EXIT'].includes(proposal.action) || !proposal.reason) {
        throw new ContractValidationError('invalid position management proposal');
      }
    }
    return immutableCopy(proposals);
  }
}
