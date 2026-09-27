import type {
  ChallengeFinding,
  ChallengeId,
  ChallengeVerdict,
  ResearchSnapshot,
  ThesisChallenge,
  ThesisId,
  ThesisSnapshot,
  ThesisSignal,
} from '../domain/contracts.js';
import { ContractValidationError } from '../domain/errors.js';
import {
  assertContract,
  immutableCopy,
  requireNonEmpty,
  requireNonEmptyList,
  requireTimestamp,
  toId,
} from '../domain/guards.js';

export type ThesisInput = Omit<ThesisSnapshot, 'layer' | 'kind' | 'id' | 'researchSnapshotId' | 'asset'> & {
  readonly id: string;
};

const TEXT_FIELDS = [
  'coreThesis',
  'whyNow',
  'mispricingHypothesis',
  'catalystTimeframe',
  'tokenValueCapture',
  'competitiveAdvantage',
  'biggestRisk',
] as const;
const LIST_FIELDS = ['keyCatalysts', 'invalidationConditions', 'metricsToMonitor', 'whatWouldProveWrong'] as const;

/** Thesis Engine: every required canonical thesis field must be present. */
export function createThesis(research: ResearchSnapshot, input: ThesisInput): ThesisSnapshot {
  assertContract(research, 'RESEARCH', 'ResearchSnapshot', 'THESIS');
  requireTimestamp(input.createdAt, 'createdAt');
  for (const field of TEXT_FIELDS) requireNonEmpty(input[field], field);
  for (const field of LIST_FIELDS) requireNonEmptyList(input[field], field);
  return immutableCopy<ThesisSnapshot>({
    ...input,
    layer: 'THESIS',
    kind: 'ThesisSnapshot',
    id: toId<ThesisId>(input.id, 'id'),
    researchSnapshotId: research.id,
    asset: research.asset,
  });
}

export interface ChallengeInput {
  readonly id: string;
  readonly createdAt: string;
  readonly findings: readonly ChallengeFinding[];
  readonly verdict: ChallengeVerdict;
}

/** Adversarial pass, stored separately from the thesis so it stays independently inspectable. */
export function createChallenge(thesis: ThesisSnapshot, input: ChallengeInput): ThesisChallenge {
  assertContract(thesis, 'THESIS', 'ThesisSnapshot', 'THESIS');
  requireTimestamp(input.createdAt, 'createdAt');
  if (input.findings.length === 0) throw new ContractValidationError('challenge requires at least one finding');
  input.findings.forEach((f, i) => requireNonEmpty(f.assessment, `findings[${i}].assessment`));
  return immutableCopy<ThesisChallenge>({
    layer: 'THESIS',
    kind: 'ThesisChallenge',
    id: toId<ChallengeId>(input.id, 'id'),
    thesisId: thesis.id,
    createdAt: input.createdAt,
    findings: input.findings,
    verdict: input.verdict,
  });
}

/** Propagates attributed research observations through the thesis boundary for strategy evaluation. */
export function createThesisSignal(thesis: ThesisSnapshot, research: ResearchSnapshot): ThesisSignal {
  assertContract(thesis, 'THESIS', 'ThesisSnapshot', 'THESIS');
  assertContract(research, 'RESEARCH', 'ResearchSnapshot', 'THESIS');
  if (thesis.researchSnapshotId !== research.id || thesis.asset !== research.asset) {
    throw new ContractValidationError('thesis signal must reference the approved research snapshot and asset');
  }
  return immutableCopy<ThesisSignal>({
    layer: 'THESIS', kind: 'ThesisSignal', thesisId: thesis.id,
    researchSnapshotId: research.id, asset: thesis.asset, asOf: research.frozenAt, metrics: research.metrics,
  });
}
