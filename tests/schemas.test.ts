import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInput,
  saveGradeInput,
  createAssignmentInput,
  recordAttendanceInput,
  createSupportNoteInput,
} from '../src/packages/shared/schemas';

describe('parseInput', () => {
  test('returns typed data for valid input', () => {
    const result = parseInput(saveGradeInput, {
      submissionId: 'sub-1',
      score: '85',
      feedback: 'Nice work',
      actorId: 'user-1',
    });

    // Note the coercion: FormData gives strings, the action needs a number.
    assert.equal(result.score, 85);
    assert.equal(typeof result.score, 'number');
  });

  test('rejects a negative score', () => {
    // The <input min={0}> is browser-side only, and a Server Action is a public
    // POST endpoint. This is the check that actually holds.
    assert.throws(
      () => parseInput(saveGradeInput, { submissionId: 's', score: '-10', feedback: 'x', actorId: 'u' }),
      /cannot be negative/
    );
  });

  test('rejects a non-numeric score instead of silently producing NaN', () => {
    // Number('abc') is NaN, which passes a naive `> 0` check by being false.
    assert.throws(
      () => parseInput(saveGradeInput, { submissionId: 's', score: 'abc', feedback: 'x', actorId: 'u' }),
      /number/i
    );
  });

  test('rejects empty feedback', () => {
    assert.throws(
      () => parseInput(saveGradeInput, { submissionId: 's', score: '80', feedback: '', actorId: 'u' }),
      /Feedback is required/
    );
  });

  test('rejects an invalid date string', () => {
    // new Date('not a date') does NOT throw — it returns a Date whose time is
    // NaN, so an instanceof check passes and the bad value reaches Prisma.
    assert.throws(
      () =>
        parseInput(createAssignmentInput, {
          classSectionId: 'sec-1',
          title: 'Homework 1',
          description: '',
          type: 'Homework',
          pointsPossible: '100',
          dueDate: 'not a date',
          actorId: 'u',
        }),
      /valid date/
    );
  });

  test('rejects a status that is not in the enum', () => {
    // SQLite has no enum type, so 'Presnt' would persist happily and then never
    // match a filter again. This is the only layer that can catch it.
    assert.throws(
      () =>
        parseInput(recordAttendanceInput, {
          classSectionId: 'sec-1',
          date: '2026-05-01',
          records: [{ studentId: 'stu-1', status: 'Presnt' }],
          actorId: 'u',
        }),
      /status/
    );
  });

  test('rejects zero points possible', () => {
    assert.throws(
      () =>
        parseInput(createAssignmentInput, {
          classSectionId: 'sec-1',
          title: 'Homework 1',
          description: '',
          type: 'Homework',
          pointsPossible: '0',
          dueDate: '2026-05-01',
          actorId: 'u',
        }),
      /greater than zero/
    );
  });

  test('error messages name the field, and report every problem at once', () => {
    try {
      parseInput(createSupportNoteInput, {
        studentId: '',
        authorId: 'u',
        visibility: 'Everyone',
        noteType: 'Academic',
        content: '',
      });
      assert.fail('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      // A user sees this string, so it must not be a JSON dump of ZodIssues.
      assert.ok(message.includes('studentId'), message);
      assert.ok(message.includes('visibility'), message);
      assert.ok(message.includes('content'), message);
      assert.ok(!message.includes('{'), 'must not leak raw zod internals');
    }
  });
});
