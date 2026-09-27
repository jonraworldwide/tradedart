import { ContractValidationError } from '../domain/errors.js';
import { immutableCopy, requireNonNegative, requirePositive, requireTimestamp } from '../domain/guards.js';

/** All values are quote currency. Cash already includes entry debits and paid fees. */
export interface PaperPosition {
  readonly asset: string;
  readonly quantity: number;
  readonly entryPrice: number;
}

export interface PaperMark {
  readonly price: number;
  readonly asOf: string;
  readonly source: string;
}

export interface PaperAccountInput {
  readonly cashQuote: number;
  readonly reservedQuote: number;
  readonly realizedPnlQuote: number;
  readonly positions: readonly PaperPosition[];
  readonly openOrderIntentIds: readonly string[];
  readonly marks: Readonly<Record<string, PaperMark>>;
  readonly asOf: string;
  readonly maxMarkAgeMs: number;
}

export interface PaperEquitySnapshot {
  readonly asOf: string;
  readonly cashQuote: number;
  readonly reservedQuote: number;
  readonly availableQuote: number;
  readonly equityQuote: number;
  readonly realizedPnlQuote: number;
  readonly unrealizedPnlQuote: number;
  readonly assetExposureQuote: Readonly<Record<string, number>>;
  readonly markEvidence: Readonly<Record<string, PaperMark>>;
  readonly openOrderIntentIds: readonly string[];
}

export interface PaperDrawdownLimits {
  readonly dailyLossPct: number;
  readonly totalDrawdownPct: number;
}

export interface PaperRiskCheckpoint {
  readonly snapshot: PaperEquitySnapshot;
  readonly day: string;
  readonly dayStartEquityQuote: number;
  readonly peakEquityQuote: number;
  readonly dailyDrawdownPct: number;
  readonly totalDrawdownPct: number;
  readonly freezeReason: 'DAILY_DRAWDOWN_LIMIT' | 'TOTAL_DRAWDOWN_LIMIT' | null;
  readonly frozenAt: string | null;
  readonly equityAtFreezeQuote: number | null;
}

/** A missing, stale or future mark refuses to value the account. There is no last-known-price fallback. */
export function reconcilePaperEquity(input: PaperAccountInput): PaperEquitySnapshot {
  requireTimestamp(input.asOf, 'asOf');
  requireNonNegative(input.cashQuote, 'cashQuote');
  requireNonNegative(input.reservedQuote, 'reservedQuote');
  if (!Number.isFinite(input.realizedPnlQuote)) throw new ContractValidationError('realizedPnlQuote must be finite');
  requirePositive(input.maxMarkAgeMs, 'maxMarkAgeMs');
  if (input.reservedQuote > input.cashQuote) throw new ContractValidationError('reservedQuote exceeds cashQuote');
  const exposure: Record<string, number> = {};
  const markEvidence: Record<string, PaperMark> = {};
  let unrealized = 0;
  for (const position of input.positions) {
    if (!position.asset) throw new ContractValidationError('position asset is required');
    requirePositive(position.quantity, 'position.quantity');
    requirePositive(position.entryPrice, 'position.entryPrice');
    const mark = input.marks[position.asset];
    if (!mark) throw new ContractValidationError(`MISSING_MARK: ${position.asset}`);
    requirePositive(mark.price, `marks.${position.asset}.price`);
    requireTimestamp(mark.asOf, `marks.${position.asset}.asOf`);
    if (!mark.source) throw new ContractValidationError(`MISSING_SOURCE: ${position.asset}`);
    const age = Date.parse(input.asOf) - Date.parse(mark.asOf);
    if (age < 0 || age > input.maxMarkAgeMs) throw new ContractValidationError(`STALE_MARK: ${position.asset}`);
    exposure[position.asset] = (exposure[position.asset] ?? 0) + position.quantity * mark.price;
    markEvidence[position.asset] = mark;
    unrealized += position.quantity * (mark.price - position.entryPrice);
  }
  if (new Set(input.openOrderIntentIds).size !== input.openOrderIntentIds.length || input.openOrderIntentIds.some((id) => !id)) {
    throw new ContractValidationError('open order intent IDs must be unique and nonempty');
  }
  const equity = input.cashQuote + Object.values(exposure).reduce((sum, value) => sum + value, 0);
  return immutableCopy({
    asOf: input.asOf,
    cashQuote: input.cashQuote,
    reservedQuote: input.reservedQuote,
    availableQuote: input.cashQuote - input.reservedQuote,
    equityQuote: equity,
    realizedPnlQuote: input.realizedPnlQuote,
    unrealizedPnlQuote: unrealized,
    assetExposureQuote: exposure,
    markEvidence,
    openOrderIntentIds: input.openOrderIntentIds,
  });
}

/** Pure checkpoint transition: callers persist the returned state with their paper event journal. */
export function updatePaperRisk(
  snapshot: PaperEquitySnapshot,
  limits: PaperDrawdownLimits,
  previous?: PaperRiskCheckpoint,
): PaperRiskCheckpoint {
  requireTimestamp(snapshot.asOf, 'snapshot.asOf');
  requireNonNegative(snapshot.equityQuote, 'snapshot.equityQuote');
  if (snapshot.equityQuote === 0 && !previous) {
    throw new ContractValidationError('first paper equity snapshot must have positive equity');
  }
  for (const [field, value] of Object.entries(limits)) {
    requirePositive(value, field);
    if (value > 100) throw new ContractValidationError(`${field} cannot exceed 100%`);
  }
  if (previous && Date.parse(snapshot.asOf) <= Date.parse(previous.snapshot.asOf)) {
    throw new ContractValidationError('paper equity snapshots must advance in time');
  }
  const day = snapshot.asOf.slice(0, 10); // asOf is required to be UTC for an unambiguous day boundary.
  if (!snapshot.asOf.endsWith('Z')) throw new ContractValidationError('paper risk timestamps must use UTC');
  const dayStart = previous?.day === day ? previous.dayStartEquityQuote : snapshot.equityQuote;
  const peak = Math.max(previous?.peakEquityQuote ?? snapshot.equityQuote, snapshot.equityQuote);
  const daily = dayStart > 0 ? Math.max(0, (dayStart - snapshot.equityQuote) / dayStart * 100) : 100;
  const total = Math.max(0, (peak - snapshot.equityQuote) / peak * 100);
  const latchedHard = previous?.freezeReason === 'TOTAL_DRAWDOWN_LIMIT';
  const hard = latchedHard || total >= limits.totalDrawdownPct;
  const dailyPaused = previous?.day === day && previous.freezeReason === 'DAILY_DRAWDOWN_LIMIT';
  const reason = hard ? 'TOTAL_DRAWDOWN_LIMIT' : dailyPaused || daily >= limits.dailyLossPct ? 'DAILY_DRAWDOWN_LIMIT' : null;
  const sameFreeze = reason !== null && reason === previous?.freezeReason;
  return immutableCopy({
    snapshot,
    day,
    dayStartEquityQuote: dayStart,
    peakEquityQuote: peak,
    dailyDrawdownPct: daily,
    totalDrawdownPct: total,
    freezeReason: reason,
    frozenAt: reason === null ? null : sameFreeze ? previous?.frozenAt ?? snapshot.asOf : snapshot.asOf,
    equityAtFreezeQuote: reason === null ? null : sameFreeze ? previous?.equityAtFreezeQuote ?? snapshot.equityQuote : snapshot.equityQuote,
  });
}
