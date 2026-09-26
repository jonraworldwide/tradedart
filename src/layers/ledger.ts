import type {
  CorrectableField,
  LedgerCorrection,
  LedgerRecord,
  OrderIntent,
  PaperExecution,
  ResearchSnapshot,
  Strategy,
  ThesisSnapshot,
  TradeId,
  TradeLedgerEntry,
} from '../domain/contracts.js';
import { BoundaryViolationError, ImmutableHistoryError, LifecycleError } from '../domain/errors.js';
import { assertContract, immutableCopy, requireNonEmpty, requirePositive, requireTimestamp, toId } from '../domain/guards.js';

export interface TradeSources {
  readonly execution: PaperExecution;
  readonly intent: OrderIntent;
  readonly strategy: Strategy;
  readonly thesis: ThesisSnapshot;
  readonly research: ResearchSnapshot;
}

export interface TradeDetails {
  readonly tradeId: string;
  readonly entryReason: string;
  readonly exitPrice: number | null;
  readonly exitReason: string | null;
  readonly closedAt: string | null;
  readonly recordedAt: string;
}

const round = (n: number): number => Math.round(n * 1e8) / 1e8;

/** Builds a ledger entry from a reconciled paper execution and its full evidence chain. */
export function ledgerEntryFromExecution(sources: TradeSources, details: TradeDetails): TradeLedgerEntry {
  const { execution, intent, strategy, thesis, research } = sources;
  assertContract(execution, 'EXECUTION', 'PaperExecution', 'LEARNING');
  assertContract(intent, 'STRATEGY', 'OrderIntent', 'LEARNING');
  assertContract(strategy, 'STRATEGY', 'Strategy', 'LEARNING');
  assertContract(thesis, 'THESIS', 'ThesisSnapshot', 'LEARNING');
  assertContract(research, 'RESEARCH', 'ResearchSnapshot', 'LEARNING');
  if (execution.stage !== 'RECONCILE' || execution.fill === null) {
    throw new LifecycleError('only reconciled executions can be recorded in the ledger');
  }
  if (
    execution.orderIntentId !== intent.id ||
    execution.strategyId !== strategy.id ||
    intent.strategyId !== strategy.id ||
    strategy.thesisId !== thesis.id ||
    thesis.researchSnapshotId !== research.id
  ) {
    throw new BoundaryViolationError('trade evidence chain is inconsistent');
  }
  requireNonEmpty(details.entryReason, 'entryReason');
  requireTimestamp(details.recordedAt, 'recordedAt');
  const { fill } = execution;
  let realizedPnl: number | null = null;
  if (details.exitPrice !== null) {
    requirePositive(details.exitPrice, 'exitPrice');
    const gross = intent.side === 'BUY' ? details.exitPrice - fill.price : fill.price - details.exitPrice;
    realizedPnl = round(gross * fill.quantity - fill.fees);
  }
  return immutableCopy<TradeLedgerEntry>({
    layer: 'LEARNING',
    kind: 'TradeLedgerEntry',
    tradeId: toId<TradeId>(details.tradeId, 'tradeId'),
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    executionId: execution.id,
    asset: intent.asset,
    direction: intent.side === 'BUY' ? 'LONG' : 'SHORT',
    entryPrice: fill.price,
    exitPrice: details.exitPrice,
    size: fill.quantity,
    fees: fill.fees,
    slippage: fill.slippage,
    stopLossPrice: intent.stopLossPrice,
    takeProfitPrice: intent.takeProfitPrice,
    realizedPnl,
    marketContextId: research.marketContextId,
    researchSnapshotId: research.id,
    thesisId: thesis.id,
    entryReason: details.entryReason,
    exitReason: details.exitReason,
    openedAt: fill.filledAt,
    closedAt: details.closedAt,
    recordedAt: details.recordedAt,
  });
}

export interface CorrectionInput {
  readonly correctionId: string;
  readonly correctsTradeId: string;
  readonly reason: string;
  readonly amendments: Partial<Pick<TradeLedgerEntry, CorrectableField>>;
  readonly recordedAt: string;
}

/**
 * Append-only trade ledger. Stored records are detached, deeply frozen copies held in a
 * private field. The API exposes no update, delete or replace operation; corrections are
 * additive records.
 */
export class TradeLedger {
  readonly #records: LedgerRecord[] = [];

  append(entry: TradeLedgerEntry): TradeLedgerEntry {
    assertContract(entry, 'LEARNING', 'TradeLedgerEntry', 'LEARNING');
    requireNonEmpty(entry.strategyId, 'strategyId');
    if (this.get(entry.tradeId) !== undefined) {
      throw new ImmutableHistoryError(`trade ${entry.tradeId} already recorded; use appendCorrection`);
    }
    const stored = immutableCopy(entry);
    this.#records.push(stored);
    return stored;
  }

  appendCorrection(input: CorrectionInput): LedgerCorrection {
    requireNonEmpty(input.reason, 'reason');
    requireTimestamp(input.recordedAt, 'recordedAt');
    if (this.get(input.correctsTradeId) === undefined) {
      throw new ImmutableHistoryError(`cannot correct unknown trade ${input.correctsTradeId}`);
    }
    if (this.#records.some((r) => r.kind === 'LedgerCorrection' && r.correctionId === input.correctionId)) {
      throw new ImmutableHistoryError(`correction ${input.correctionId} already recorded`);
    }
    const stored = immutableCopy<LedgerCorrection>({
      layer: 'LEARNING',
      kind: 'LedgerCorrection',
      correctionId: toId<string>(input.correctionId, 'correctionId'),
      correctsTradeId: input.correctsTradeId as TradeId,
      reason: input.reason,
      amendments: input.amendments,
      recordedAt: input.recordedAt,
    });
    this.#records.push(stored);
    return stored;
  }

  get(tradeId: string): TradeLedgerEntry | undefined {
    return this.#records.find((r): r is TradeLedgerEntry => r.kind === 'TradeLedgerEntry' && r.tradeId === tradeId);
  }

  /** Current view of a trade: original entry with corrections applied, as a new frozen object. */
  effective(tradeId: string): TradeLedgerEntry | undefined {
    const original = this.get(tradeId);
    if (original === undefined) return undefined;
    const amendments = this.#records
      .filter((r): r is LedgerCorrection => r.kind === 'LedgerCorrection' && r.correctsTradeId === tradeId)
      .map((c) => c.amendments);
    return immutableCopy<TradeLedgerEntry>(Object.assign({}, original, ...amendments));
  }

  records(): readonly LedgerRecord[] {
    return Object.freeze([...this.#records]);
  }

  get size(): number {
    return this.#records.length;
  }
}
