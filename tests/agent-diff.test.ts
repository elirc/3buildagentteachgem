import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diffAgentOutputs, diffInputSnapshots } from '../src/packages/agents/core/diff';
import type { AgentOutput } from '../src/packages/agents/core/types';

const output = (overrides: Partial<AgentOutput> = {}): AgentOutput => ({
  summary: 'Student is stable.',
  strengths: ['Good attendance'],
  concerns: [],
  confidenceScore: 0.95,
  findings: ['Average is 82%'],
  recommendations: [],
  limitations: [],
  metadata: { rawRiskScore: 20, riskLevel: 'Low' },
  ...overrides,
});

describe('diffAgentOutputs', () => {
  test('reports no change for identical outputs', () => {
    // These agents are deterministic, so this is the EXPECTED result of
    // re-running against unchanged data. Rendering it clearly is the feature —
    // it proves determinism to someone who does not yet believe it.
    const result = diffAgentOutputs(output(), output());

    assert.equal(result.hasAnyChange, false);
    assert.equal(result.confidenceDelta, 0);
    assert.deepEqual(result.findings.added, []);
  });

  test('computes a signed confidence delta', () => {
    const result = diffAgentOutputs(
      output({ confidenceScore: 0.95 }),
      output({ confidenceScore: 0.7 })
    );

    assert.equal(result.confidenceDelta, -0.25);
    assert.equal(result.hasAnyChange, true);
  });

  test('splits list changes into added and removed', () => {
    const result = diffAgentOutputs(
      output({ concerns: ['Missing work', 'Absences'] }),
      output({ concerns: ['Absences', 'Late submissions'] })
    );

    assert.deepEqual(result.concerns.added, ['Late submissions']);
    assert.deepEqual(result.concerns.removed, ['Missing work']);
    assert.deepEqual(result.concerns.unchanged, ['Absences']);
  });

  test('matches recommendations on action, so reordering is not a change', () => {
    // Matching on array position would report everything as changed the moment
    // one recommendation is inserted in the middle.
    const a = { action: 'Call home', recommendedOwner: 'Advisor' as const, urgency: 'High' as const };
    const b = { action: 'Book tutoring', recommendedOwner: 'Teacher' as const, urgency: 'Medium' as const };

    const result = diffAgentOutputs(
      output({ recommendations: [a, b] }),
      output({ recommendations: [b, a] })
    );

    assert.deepEqual(result.recommendations.added, []);
    assert.deepEqual(result.recommendations.removed, []);
    assert.deepEqual(result.recommendations.changed, []);
    assert.equal(result.hasAnyChange, false);
  });

  test('an escalation of the same action is a CHANGE, not an add plus a remove', () => {
    // The single most useful line on the comparison page: the same action, now
    // more urgent. Reported as add+remove it would read as two unrelated events.
    const result = diffAgentOutputs(
      output({ recommendations: [{ action: 'Call home', recommendedOwner: 'Advisor', urgency: 'Medium' }] }),
      output({ recommendations: [{ action: 'Call home', recommendedOwner: 'Advisor', urgency: 'Critical' }] })
    );

    assert.equal(result.recommendations.changed.length, 1);
    assert.equal(result.recommendations.changed[0].before.urgency, 'Medium');
    assert.equal(result.recommendations.changed[0].after.urgency, 'Critical');
    assert.deepEqual(result.recommendations.added, []);
  });

  test('detects a genuinely new recommendation', () => {
    const result = diffAgentOutputs(
      output({ recommendations: [] }),
      output({ recommendations: [{ action: 'Escalate to case conference', recommendedOwner: 'Admin', urgency: 'Critical' }] })
    );

    assert.equal(result.recommendations.added.length, 1);
  });

  test('reports scalar metadata changes', () => {
    const result = diffAgentOutputs(
      output({ metadata: { rawRiskScore: 20, riskLevel: 'Low' } }),
      output({ metadata: { rawRiskScore: 78, riskLevel: 'High' } })
    );

    const score = result.metadata.find((m) => m.key === 'rawRiskScore');
    assert.deepEqual(score, { key: 'rawRiskScore', before: 20, after: 78 });
    assert.equal(result.metadata.length, 2);
  });

  test('summarises array metadata rather than recursing into it', () => {
    // "3 items -> 5 items" answers the reader's question without turning the
    // page into a JSON diff viewer.
    const result = diffAgentOutputs(
      output({ metadata: { flags: [1, 2, 3] } }),
      output({ metadata: { flags: [1, 2, 3, 4, 5] } })
    );

    assert.deepEqual(result.metadata[0], { key: 'flags', before: '3 items', after: '5 items' });
  });

  test('handles missing confidence without crashing', () => {
    const result = diffAgentOutputs(
      output({ confidenceScore: undefined as any }),
      output({ confidenceScore: 0.8 })
    );

    assert.equal(result.confidenceDelta, null);
  });

  test('tolerates outputs with missing list fields', () => {
    // An older persisted run may lack a field a later agent version added.
    const sparse = { summary: 'x', confidenceScore: 0.5 } as unknown as AgentOutput;
    const result = diffAgentOutputs(sparse, output());

    assert.equal(typeof result.hasAnyChange, 'boolean');
  });
});

describe('diffInputSnapshots', () => {
  test('explains WHY an output changed', () => {
    // The most valuable panel on the page: "the risk score fell because
    // absences went 6 -> 2" is an explanation; "the risk score fell" is only
    // an observation.
    const changes = diffInputSnapshots(
      { gradeAverage: 58, absencesCount: 6, tardiesCount: 1 },
      { gradeAverage: 74, absencesCount: 2, tardiesCount: 1 }
    );

    assert.equal(changes.length, 2);
    assert.deepEqual(
      changes.map((c) => c.key).sort(),
      ['absencesCount', 'gradeAverage']
    );
  });

  test('reports nothing when the inputs are identical', () => {
    const snapshot = { gradeAverage: 80, absencesCount: 0 };
    assert.deepEqual(diffInputSnapshots(snapshot, { ...snapshot }), []);
  });
});
