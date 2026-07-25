import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTeacherWorkload,
  type TeacherWorkloadInput,
} from '../src/packages/domain/rules/workload';

const base: TeacherWorkloadInput = {
  activeSectionsCount: 0,
  totalStudentsCapacity: 0,
  ungradedSubmissionsCount: 0,
  atRiskStudentsCount: 0,
  teacherStatus: 'Active',
};

const load = (overrides: Partial<TeacherWorkloadInput> = {}) =>
  calculateTeacherWorkload({ ...base, ...overrides });

describe('calculateTeacherWorkload — scoring', () => {
  test('each active section is worth 20 points', () => {
    assert.equal(load({ activeSectionsCount: 1 }).workloadScore, 20);
    assert.equal(load({ activeSectionsCount: 3 }).workloadScore, 60);
  });

  test('each seat of capacity is worth half a point', () => {
    assert.equal(load({ totalStudentsCapacity: 40 }).workloadScore, 20);
  });

  test('each ungraded submission is worth 2 points', () => {
    assert.equal(load({ ungradedSubmissionsCount: 5 }).workloadScore, 10);
  });

  test('each at-risk student is worth 5 points', () => {
    // Pastoral load is weighted heavily relative to class size: one at-risk
    // student costs as much as ten extra seats.
    assert.equal(load({ atRiskStudentsCount: 4 }).workloadScore, 20);
  });

  test('components add up', () => {
    // 2 sections (40) + 40 seats (20) + 6 ungraded (12) + 2 at-risk (10) = 82
    const result = load({
      activeSectionsCount: 2,
      totalStudentsCapacity: 40,
      ungradedSubmissionsCount: 6,
      atRiskStudentsCount: 2,
    });

    assert.equal(result.workloadScore, 82);
  });

  test('the score is rounded to a whole number', () => {
    // 25 seats * 0.5 = 12.5 -> 13
    assert.equal(load({ totalStudentsCapacity: 25 }).workloadScore, 13);
  });
});

describe('calculateTeacherWorkload — status bands', () => {
  const bands: Array<[string, Partial<TeacherWorkloadInput>, string]> = [
    ['an empty timetable', {}, 'Underloaded'],
    ['just under the Optimal floor', { totalStudentsCapacity: 78 }, 'Underloaded'], // 39
    ['exactly at the Optimal floor', { totalStudentsCapacity: 80 }, 'Optimal'], // 40
    ['at the top of Optimal', { totalStudentsCapacity: 150 }, 'Optimal'], // 75
    ['just over into Overloaded', { totalStudentsCapacity: 152 }, 'Overloaded'], // 76
    ['at the top of Overloaded', { totalStudentsCapacity: 200 }, 'Overloaded'], // 100
    ['over into Critical', { totalStudentsCapacity: 202 }, 'Critically Overloaded'], // 101
  ];

  for (const [label, overrides, expected] of bands) {
    test(`${label} is ${expected}`, () => {
      assert.equal(load(overrides).status, expected);
    });
  }

  test('isOverloaded covers both overloaded bands and nothing else', () => {
    assert.equal(load({ totalStudentsCapacity: 80 }).isOverloaded, false);
    assert.equal(load({ totalStudentsCapacity: 152 }).isOverloaded, true);
    assert.equal(load({ totalStudentsCapacity: 202 }).isOverloaded, true);
  });
});

describe('calculateTeacherWorkload — employment status', () => {
  test('an Inactive teacher short-circuits to a zero score', () => {
    // Scoring the workload of someone who does not work here produces a number
    // that would be acted on. Returning zero with a warning is the honest answer.
    const result = calculateTeacherWorkload({
      activeSectionsCount: 5,
      totalStudentsCapacity: 200,
      ungradedSubmissionsCount: 40,
      atRiskStudentsCount: 10,
      teacherStatus: 'Inactive',
    });

    assert.equal(result.workloadScore, 0);
    assert.equal(result.status, 'Underloaded');
    assert.equal(result.isOverloaded, false);
    assert.ok(result.warnings.some((w) => w.includes('Inactive')));
  });

  test('a teacher on leave with sections assigned is penalised hard', () => {
    // 30 points per section on top of the normal 20 — a staffing alarm, not a
    // workload measurement. Someone is on leave and still owns live classes.
    const onLeave = load({ activeSectionsCount: 2, teacherStatus: 'OnLeave' });
    const active = load({ activeSectionsCount: 2, teacherStatus: 'Active' });

    assert.equal(active.workloadScore, 40);
    assert.equal(onLeave.workloadScore, 100); // 40 + (2 * 30)
    assert.ok(onLeave.warnings.some((w) => w.includes('CRITICAL')));
  });

  test('a teacher on leave with no sections is only noted, not penalised', () => {
    const result = load({ teacherStatus: 'OnLeave' });

    assert.equal(result.workloadScore, 0);
    assert.ok(result.warnings.some((w) => w.includes('On Leave')));
    assert.ok(!result.warnings.some((w) => w.includes('CRITICAL')));
  });
});

describe('calculateTeacherWorkload — warnings', () => {
  test('warns about a grading backlog at 5 submissions', () => {
    assert.ok(!load({ ungradedSubmissionsCount: 4 }).warnings.some((w) => w.includes('backlog')));
    assert.ok(load({ ungradedSubmissionsCount: 5 }).warnings.some((w) => w.includes('backlog')));
  });

  test('warns about pastoral burden at 3 at-risk students', () => {
    assert.ok(!load({ atRiskStudentsCount: 2 }).warnings.some((w) => w.includes('pastoral')));
    assert.ok(load({ atRiskStudentsCount: 3 }).warnings.some((w) => w.includes('pastoral')));
  });

  test('warns about a high course load above 3 sections', () => {
    assert.ok(!load({ activeSectionsCount: 3 }).warnings.some((w) => w.includes('High course load')));
    assert.ok(load({ activeSectionsCount: 4 }).warnings.some((w) => w.includes('High course load')));
  });

  test('an overloaded teacher gets an explicit redistribution warning', () => {
    const result = load({ activeSectionsCount: 4, totalStudentsCapacity: 100 });

    assert.equal(result.isOverloaded, true);
    assert.ok(result.warnings.some((w) => w.includes('redistribution')));
  });

  test('a comfortable teacher has no warnings at all', () => {
    assert.deepEqual(load({ activeSectionsCount: 2, totalStudentsCapacity: 40 }).warnings, []);
  });
});
