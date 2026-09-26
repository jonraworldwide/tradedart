import { ALLOWED_UPSTREAM, type Layer } from './contracts.js';
import { BoundaryViolationError, ContractValidationError } from './errors.js';

/** Recursively freezes a value. Domain objects are plain acyclic data. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
  }
  return value;
}

/** Detached, deeply frozen copy: later mutation of the input cannot reach the stored value. */
export function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

/**
 * Enforces the pipeline boundary: `consumer` may only accept a contract produced by its own
 * layer or by a layer listed in ALLOWED_UPSTREAM, and it must be the expected kind.
 */
export function assertContract(input: unknown, layer: Layer, kind: string, consumer: Layer): void {
  if (layer !== consumer && !ALLOWED_UPSTREAM[consumer].includes(layer)) {
    throw new BoundaryViolationError(`${consumer} layer is not permitted to consume ${layer} contracts`);
  }
  const candidate = input as { layer?: unknown; kind?: unknown } | null | undefined;
  if (candidate === null || typeof candidate !== 'object' || candidate.layer !== layer || candidate.kind !== kind) {
    const received =
      candidate !== null && typeof candidate === 'object'
        ? `${String(candidate.layer)}/${String(candidate.kind)}`
        : String(candidate);
    throw new BoundaryViolationError(`${consumer} layer requires ${layer}/${kind}; received ${received}`);
  }
}

export function requireNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ContractValidationError(`${field} must be a non-empty string`);
  }
}

export function requireNonEmptyList(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string' || v.trim() === '')) {
    throw new ContractValidationError(`${field} must be a non-empty list of non-empty strings`);
  }
}

export function requirePositive(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ContractValidationError(`${field} must be a positive finite number`);
  }
}

export function requireNonNegative(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ContractValidationError(`${field} must be a non-negative finite number`);
  }
}

export function requireTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ContractValidationError(`${field} must be an ISO-8601 timestamp`);
  }
}

export function toId<T extends string>(value: unknown, field: string): T {
  requireNonEmpty(value, field);
  return value as T;
}
