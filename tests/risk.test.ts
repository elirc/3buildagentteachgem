import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStudentRisk,
  compareByRiskSeverity,
  isEscalationWorthy,
  RISK_LEVEL_SEVERITY,
  type StudentRiskInput,
  type RiskLevel,
} from '../src/packages/domain/rules/risk';

/** A student with nothing wrong. Override one field per test to isolate a rule. */
const healthy: StudentRiskInput = {
  gradeAverage: 95,
  missingAssignmentsCount: 0,
  absencesCount: 0,
  tardiesCount: 0,
};

const risk = (overrides: Partial<StudentRiskInput> = {}) =>
  calculateStudentRisk({ ...healthy, ...overrides });

describe('calculateStudentRisk — overall level', () => {
  test('a healthy student is Low risk with no primary area', () => {
    const result = risk();

    assert.equal(result.overallRiskLevel, 'Low');
    assert.equal(result.primaryRiskArea, 'None');
    assert.deepEqual(result.evidence, ['Student is meeting all academic and operational benchmarks.']);
  });

  test('one Medium area makes the student Medium', () => {
    // 2 missing assignments -> engagement Medium, nothing else triggered.
    const result = risk({ missingAssignmentsCount: 2 });

    assert.equal(result.engagementRisk, 'Medium');
    assert.equal(result.overallRiskLevel, 'Medium');
    assert.equal(result.primaryRiskArea, 'Engagement');
  });

  test('exactly one High area makes the student High', () => {
    // 59% is below the 60 threshold (High) but not below 55, so it does not
    // trip the Critical escalation on its own.
    const result = risk({ gradeAverage: 59 });

    assert.equal(result.gradesRisk, 'High');
    assert.equal(result.overallRiskLevel, 'High');
  });

  test('two High areas escalate to Critical', () => {
    const result = risk({ gradeAverage: 59, absencesCount: 5 });

    assert.equal(result.gradesRisk, 'High');
    assert.equal(result.attendanceRisk, 'High');
    assert.equal(result.overallRiskLevel, 'Critical');
  });

  test('a single catastrophic grade escalates to Critical on its own', () => {
    // gradesRisk High AND average < 55 is its own Critical path, even with
    // perfect attendance and no missing work.
    const result = risk({ gradeAverage: 50 });

    assert.equal(result.overallRiskLevel, 'Critical');
  });

  test('seven absences escalate to Critical on their own', () => {
    const result = risk({ absencesCount: 7 });

    assert.equal(result.attendanceRisk, 'High');
    assert.equal(result.overallRiskLevel, 'Critical');
  });
});

describe('calculateStudentRisk — attendance weighting', () => {
  test('tardies count as 0.3 of an absence', () => {
    // 10 tardies = 3.0 weighted, which is exactly the Medium threshold.
    assert.equal(risk({ tardiesCount: 10 }).attendanceRisk, 'Medium');

    // 9 tardies = 2.7 weighted, just under it.
    assert.equal(risk({ tardiesCount: 9 }).attendanceRisk, 'Low');

    // 17 tardies = 5.1 weighted, over the High threshold — with zero absences.
    assert.equal(risk({ tardiesCount: 17 }).attendanceRisk, 'High');
  });

  test('absences and tardies combine', () => {
    // 4 absences + 4 tardies = 4 + 1.2 = 5.2 -> High
    assert.equal(risk({ absencesCount: 4, tardiesCount: 4 }).attendanceRisk, 'High');
  });
});

describe('calculateStudentRisk — primary area precedence', () => {
  test('CHARACTERISATION: Grades outrank Attendance even when attendance is worse', () => {
    // gradesRisk is only Medium here while attendanceRisk is High, yet the
    // primary area is reported as Grades. The rule checks Grades first and
    // returns on the first match — it is a priority order, not a severity
    // ranking. Pinned because it reads like a bug and is not.
    const result = risk({ gradeAverage: 65, absencesCount: 6 });

    assert.equal(result.gradesRisk, 'Medium');
    assert.equal(result.attendanceRisk, 'High');
    assert.equal(result.primaryRiskArea, 'Grades');
  });

  test('Attendance outranks Engagement', () => {
    const result = risk({ absencesCount: 3, missingAssignmentsCount: 4 });

    assert.equal(result.primaryRiskArea, 'Attendance');
  });
});

describe('calculateStudentRisk — evidence', () => {
  test('a marginal grade produces evidence without raising the risk level', () => {
    // 75% is under 80 so it is worth mentioning, but gradesRisk stays Low.
    const result = risk({ gradeAverage: 75 });

    assert.equal(result.gradesRisk, 'Low');
    assert.equal(result.overallRiskLevel, 'Low');
    assert.ok(result.evidence.some((e) => e.includes('Marginal')));
  });

  test('evidence is never empty', () => {
    // The dashboard renders evidence directly. An empty list would render an
    // empty bullet list, which looks like a rendering bug to a user.
    assert.ok(risk().evidence.length > 0);
    assert.ok(risk({ gradeAverage: 20, absencesCount: 9 }).evidence.length > 0);
  });
});

describe('compareByRiskSeverity', () => {
  const at = (riskLevel: RiskLevel, gradeAverage = 50, absencesCount = 0) => ({
    riskLevel,
    gradeAverage,
    absencesCount,
  });

  test('orders most severe first', () => {
    const sorted = [at('Low'), at('Critical'), at('Medium'), at('High')].sort(compareByRiskSeverity);

    assert.deepEqual(
      sorted.map((s) => s.riskLevel),
      ['Critical', 'High', 'Medium', 'Low']
    );
  });

  test('breaks ties on the lower grade average', () => {
    const sorted = [at('High', 68), at('High', 42)].sort(compareByRiskSeverity);
    assert.equal(sorted[0].gradeAverage, 42);
  });

  test('breaks remaining ties on more absences', () => {
    const sorted = [at('High', 50, 2), at('High', 50, 9)].sort(compareByRiskSeverity);
    assert.equal(sorted[0].absencesCount, 9);
  });

  test('is deterministic: sorting an already-sorted list does not reorder it', () => {
    // The dashboard re-renders on every request (revalidate = 0). A comparator
    // that is not a total order would let the urgent-case banner flicker
    // between two students on reload.
    const input = [at('Critical', 30, 5), at('High', 40, 1), at('High', 40, 0), at('Low', 95)];
    const once = [...input].sort(compareByRiskSeverity);
    const twice = [...once].sort(compareByRiskSeverity);

    assert.deepEqual(once, twice);
  });

  test('severity ranking covers every level in the union', () => {
    const levels: RiskLevel[] = ['Low', 'Medium', 'High', 'Critical'];
    for (const level of levels) {
      assert.equal(typeof RISK_LEVEL_SEVERITY[level], 'number');
    }
  });
});

describe('isEscalationWorthy', () => {
  test('only High and Critical escalate', () => {
    assert.equal(isEscalationWorthy('Critical'), true);
    assert.equal(isEscalationWorthy('High'), true);
    // Medium is common and often self-resolving. Escalating it trains people
    // to ignore the escalation banner.
    assert.equal(isEscalationWorthy('Medium'), false);
    assert.equal(isEscalationWorthy('Low'), false);
  });
});
