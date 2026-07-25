import { AgentOutput, AgentRecommendation } from './types';

export interface ListDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface RecommendationDiff {
  added: AgentRecommendation[];
  removed: AgentRecommendation[];
  /** Same action, different urgency or owner — the change most worth seeing. */
  changed: Array<{ action: string; before: AgentRecommendation; after: AgentRecommendation }>;
}

export interface ScalarChange {
  key: string;
  before: unknown;
  after: unknown;
}

export interface AgentOutputDiff {
  confidenceDelta: number | null;
  summaryChanged: boolean;
  findings: ListDiff;
  concerns: ListDiff;
  strengths: ListDiff;
  limitations: ListDiff;
  recommendations: RecommendationDiff;
  metadata: ScalarChange[];
  hasAnyChange: boolean;
}

function diffStringList(before: string[] = [], after: string[] = []): ListDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  return {
    added: after.filter((s) => !beforeSet.has(s)),
    removed: before.filter((s) => !afterSet.has(s)),
    unchanged: after.filter((s) => beforeSet.has(s)),
  };
}

/**
 * Recommendations are matched on `action`.
 *
 * Matching on array position would report every recommendation as changed the
 * moment one is inserted in the middle. The action text is the closest thing
 * these objects have to an identity, so an urgency escalating from High to
 * Critical for the SAME action shows up as `changed` rather than as an
 * unrelated add plus remove — which is the single most useful line on the page.
 */
function diffRecommendations(
  before: AgentRecommendation[] = [],
  after: AgentRecommendation[] = []
): RecommendationDiff {
  const beforeByAction = new Map(before.map((r) => [r.action, r]));
  const afterByAction = new Map(after.map((r) => [r.action, r]));

  const added: AgentRecommendation[] = [];
  const changed: RecommendationDiff['changed'] = [];

  for (const [action, afterRec] of afterByAction) {
    const beforeRec = beforeByAction.get(action);
    if (!beforeRec) {
      added.push(afterRec);
    } else if (
      beforeRec.urgency !== afterRec.urgency ||
      beforeRec.recommendedOwner !== afterRec.recommendedOwner
    ) {
      changed.push({ action, before: beforeRec, after: afterRec });
    }
  }

  const removed = before.filter((r) => !afterByAction.has(r.action));

  return { added, removed, changed };
}

/**
 * Shallow scalar diff over metadata.
 *
 * Metadata shapes differ per agent (rawRiskScore, anomalyScore, workloadScore,
 * draftFeedback...), so this cannot be typed per key. Nested values are
 * summarised rather than recursed: "3 items -> 5 items" answers the question a
 * reader has without turning the page into a JSON diff viewer.
 */
function diffMetadata(before: Record<string, any> = {}, after: Record<string, any> = {}): ScalarChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes: ScalarChange[] = [];

  for (const key of keys) {
    const b = before[key];
    const a = after[key];

    if (Array.isArray(b) || Array.isArray(a)) {
      const bLen = Array.isArray(b) ? b.length : 0;
      const aLen = Array.isArray(a) ? a.length : 0;
      if (bLen !== aLen) changes.push({ key, before: `${bLen} items`, after: `${aLen} items` });
      continue;
    }

    if (typeof b === 'object' && b !== null) continue;
    if (typeof a === 'object' && a !== null) continue;

    if (b !== a) changes.push({ key, before: b, after: a });
  }

  return changes;
}

/**
 * Compares two agent outputs.
 *
 * Pure: parsing JSON is the caller's job, so this stays testable with plain
 * objects and cannot be broken by a malformed row.
 *
 * These agents are deterministic, so identical inputs produce identical
 * outputs. "No changes" is therefore the EXPECTED result of re-running against
 * unchanged data, and rendering that clearly is a feature — it is what proves
 * determinism to someone who does not believe it yet.
 */
export function diffAgentOutputs(before: AgentOutput, after: AgentOutput): AgentOutputDiff {
  const findings = diffStringList(before.findings, after.findings);
  const concerns = diffStringList(before.concerns, after.concerns);
  const strengths = diffStringList(before.strengths, after.strengths);
  const limitations = diffStringList(before.limitations, after.limitations);
  const recommendations = diffRecommendations(before.recommendations, after.recommendations);
  const metadata = diffMetadata(before.metadata, after.metadata);

  const confidenceDelta =
    typeof before.confidenceScore === 'number' && typeof after.confidenceScore === 'number'
      ? Math.round((after.confidenceScore - before.confidenceScore) * 100) / 100
      : null;

  const summaryChanged = before.summary !== after.summary;

  const hasAnyChange =
    summaryChanged ||
    (confidenceDelta !== null && confidenceDelta !== 0) ||
    findings.added.length + findings.removed.length > 0 ||
    concerns.added.length + concerns.removed.length > 0 ||
    strengths.added.length + strengths.removed.length > 0 ||
    limitations.added.length + limitations.removed.length > 0 ||
    recommendations.added.length + recommendations.removed.length + recommendations.changed.length > 0 ||
    metadata.length > 0;

  return {
    confidenceDelta,
    summaryChanged,
    findings,
    concerns,
    strengths,
    limitations,
    recommendations,
    metadata,
    hasAnyChange,
  };
}

/**
 * Diffs the two input snapshots.
 *
 * This is the *why* behind an output change, and it is the most valuable panel
 * on the page: "the risk score fell because absences went from 6 to 2" is an
 * explanation, whereas "the risk score fell" is only an observation.
 */
export function diffInputSnapshots(
  before: Record<string, any>,
  after: Record<string, any>
): ScalarChange[] {
  return diffMetadata(before, after);
}
