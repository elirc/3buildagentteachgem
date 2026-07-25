import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSectionGrade,
  classifyGradeScore,
  calculateClassAverage,
  type GradeSubmissionInput,
} from '../src/packages/domain/rules/grades';

/**
 * Note the import path: it is relative, not the "@/domain/..." alias used
 * everywhere in src/. The alias is resolved by Next.js and by the TypeScript
 * language service, but tsx running these files directly does not read
 * tsconfig "paths" by default. Tests live outside the bundler, so they address
 * the filesystem directly.
 *
 * Everything below runs without a database, a mock, or a server. That is the
 * entire payoff of the rule that @/domain imports nothing.
 */

const sub = (
  status: string,
  score: number | null,
  pointsPossible: number
): GradeSubmissionInput => ({ status, score, pointsPossible });

describe('classifyGradeScore', () => {
  // Boundaries are where classification bugs live. A rule stated as ">= 90" and
  // a rule stated as "> 89" behave identically for every value except one.
  const cases: Array<[number, string]> = [
    [100, 'Excellent'],
    [90, 'Excellent'],
    [89.9, 'Good'],
    [80, 'Good'],
    [79.9, 'Warning'],
    [70, 'Warning'],
    [69.9, 'At Risk'],
    [0, 'At Risk'],
  ];

  for (const [score, expected] of cases) {
    test(`${score}% is ${expected}`, () => {
      assert.equal(classifyGradeScore(score), expected);
    });
  }
});

describe('calculateSectionGrade', () => {
  test('averages graded work by points, not by assignment count', () => {
    // 90/100 and 30/50 is 120/150 = 80%, NOT the mean of 90% and 60% (75%).
    // Points-weighted is the correct reading; this test pins it down.
    const result = calculateSectionGrade([sub('Graded', 90, 100), sub('Graded', 30, 50)]);

    assert.equal(result.percentage, 80);
    assert.equal(result.totalPointsEarned, 120);
    assert.equal(result.totalPointsPossible, 150);
    assert.equal(result.gradedCount, 2);
  });

  test('Missing work counts as zero earned but still consumes points possible', () => {
    const result = calculateSectionGrade([sub('Graded', 80, 100), sub('Missing', null, 100)]);

    assert.equal(result.percentage, 40);
    assert.equal(result.missingCount, 1);
    assert.equal(result.totalPointsPossible, 200);
  });

  test('Returned work is graded work', () => {
    const result = calculateSectionGrade([sub('Returned', 45, 50)]);
    assert.equal(result.percentage, 90);
    assert.equal(result.gradedCount, 1);
  });

  test('a Graded row with a null score is treated as zero', () => {
    // The schema allows status='Graded' with score=null. Nothing prevents it,
    // so the rule has to have an answer.
    const result = calculateSectionGrade([sub('Graded', null, 100)]);
    assert.equal(result.percentage, 0);
  });

  test('submitted-but-ungraded work is excluded from both sides of the ratio', () => {
    // A student must not be punished for a teacher's grading backlog. The 100
    // ungraded points are added to the denominator and then subtracted again,
    // so only the graded 50 counts.
    const result = calculateSectionGrade([sub('Graded', 45, 50), sub('Submitted', null, 100)]);

    assert.equal(result.totalPointsPossible, 50);
    assert.equal(result.percentage, 90);
  });

  test('rounds to one decimal place', () => {
    // 1/3 = 33.333...% -> 33.3
    const result = calculateSectionGrade([sub('Graded', 1, 3)]);
    assert.equal(result.percentage, 33.3);
  });

  // ---------------------------------------------------------------------
  // CHARACTERISATION TESTS
  // These record what the code does today, not what it arguably should do.
  // They exist so that changing the behaviour is a deliberate act that breaks
  // a named test, rather than an accident nobody notices.
  // ---------------------------------------------------------------------

  test('CHARACTERISATION: a student with nothing graded scores 100%, not 0%', () => {
    // "Innocent until proven guilty" — but it means a brand-new student looks
    // perfect and is invisible to the risk engine until their first grade lands.
    // See fabledocs/02-codebase-gotchas.md B1.
    const result = calculateSectionGrade([]);

    assert.equal(result.percentage, 100);
    assert.equal(result.classification, 'Excellent');
    assert.equal(result.totalPointsPossible, 0);
  });

  test('CHARACTERISATION: a roster of only ungraded work also scores 100%', () => {
    const result = calculateSectionGrade([sub('Submitted', null, 100), sub('Submitted', null, 100)]);
    assert.equal(result.percentage, 100);
  });

  test('CHARACTERISATION: status "Draft" is skipped, though no Submission ever has it', () => {
    // grades.ts line 41 skips Draft rows. Submission.status is only ever
    // NotStarted/Submitted/Late/Missing/Graded/Returned, so this branch is dead
    // code today. Pinned so that if a Draft submission status is ever
    // introduced, the intended handling is already documented.
    const result = calculateSectionGrade([sub('Draft', 0, 100), sub('Graded', 90, 100)]);

    assert.equal(result.totalPointsPossible, 100);
    assert.equal(result.percentage, 90);
  });
});

describe('calculateClassAverage', () => {
  test('returns 0 for an empty class rather than NaN', () => {
    // The naive implementation divides by zero here. NaN would then be rendered
    // into the UI as "NaN%", which is the sort of thing that reaches production.
    assert.equal(calculateClassAverage([]), 0);
  });

  test('averages and rounds to one decimal', () => {
    assert.equal(calculateClassAverage([90, 80]), 85);
    assert.equal(calculateClassAverage([90, 80, 71]), 80.3);
  });
});
