export class TradedartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A layer attempted to consume input it is not permitted to consume. */
export class BoundaryViolationError extends TradedartError {}

/** A contract failed validation at construction time. */
export class ContractValidationError extends TradedartError {}

/** A lifecycle transition was attempted out of order. */
export class LifecycleError extends TradedartError {}

/** Risk vetoed the action. Risk has absolute veto. */
export class RiskVetoError extends TradedartError {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`Risk veto: ${reasons.join('; ')}`);
    this.reasons = Object.freeze([...reasons]);
  }
}

/** LIVE execution is locked behind M8-LIVE-GATE. */
export class LiveExecutionDisabledError extends TradedartError {}

/** Historical records are append-only. */
export class ImmutableHistoryError extends TradedartError {}
