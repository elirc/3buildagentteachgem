import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAssignmentTransition,
  validateAssignmentInput,
  ASSIGNMENT_TRANSITIONS,
  type AssignmentStatus,
} from '../src/packages/domain/rules/assignments';

describe('validateAssignmentTransition', () => {
  test('Draft may be published', () => {
    assert.equal(validateAssignmentTransition('Draft', 'Published').isValid, true);
  });

  test('Published may be closed', () => {
    assert.equal(validateAssignmentTransition('Published', 'Closed').isValid, true);
  });

  test('Closed is terminal', () => {
    // Not tidiness: publishing fans out one Submission per enrolled student, and
    // Submission has @@unique([assignmentId, studentId]). Re-publishing would
    // collide on that constraint. The rule protects the invariant so the
    // database never has to.
    const result = validateAssignmentTransition('Closed', 'Published');

    assert.equal(result.isValid, false);
    assert.ok(result.reason?.includes('final'));
  });

  test('a Draft cannot skip straight to Closed', () => {
    const result = validateAssignmentTransition('Draft', 'Closed');

    assert.equal(result.isValid, false);
    assert.ok(result.reason?.includes('Published'));
  });

  test('re-publishing an already-published assignment is rejected', () => {
    assert.equal(validateAssignmentTransition('Published', 'Published').isValid, false);
  });

  test('an unknown status is rejected rather than crashing', () => {
    // Assignment.status is a plain String column with no database enum, so a
    // typo or a bad import can put anything in there.
    const result = validateAssignmentTransition('Publsihed', 'Closed');

    assert.equal(result.isValid, false);
    assert.ok(result.reason?.includes('Unknown'));
  });

  test('every status in the map has an entry, including terminal ones', () => {
    const statuses: AssignmentStatus[] = ['Draft', 'Published', 'Closed'];
    for (const s of statuses) {
      assert.ok(Array.isArray(ASSIGNMENT_TRANSITIONS[s]), `${s} missing from transition map`);
    }
  });
});

describe('validateAssignmentInput', () => {
  const valid = {
    title: 'Algebra Homework 6',
    type: 'Homework',
    pointsPossible: 100,
    dueDate: new Date('2026-09-01T00:00:00.000Z'),
  };

  test('accepts a well-formed assignment', () => {
    const result = validateAssignmentInput(valid);

    assert.equal(result.isValid, true);
    assert.deepEqual(result.errors, []);
  });

  test('rejects a blank or whitespace-only title', () => {
    assert.equal(validateAssignmentInput({ ...valid, title: '' }).isValid, false);
    assert.equal(validateAssignmentInput({ ...valid, title: '   ' }).isValid, false);
  });

  test('rejects an unknown type', () => {
    const result = validateAssignmentInput({ ...valid, type: 'Homwork' });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Type must be one of')));
  });

  test('rejects zero or negative points', () => {
    // "Graded out of 0" is not renderable, and it contributes nothing to the
    // points-weighted average while still occupying a gradebook column.
    assert.equal(validateAssignmentInput({ ...valid, pointsPossible: 0 }).isValid, false);
    assert.equal(validateAssignmentInput({ ...valid, pointsPossible: -50 }).isValid, false);
  });

  test('rejects NaN points', () => {
    // Number(formData.get('points')) yields NaN for a non-numeric field, and
    // NaN passes a naive `> 0` check by being false rather than throwing.
    assert.equal(validateAssignmentInput({ ...valid, pointsPossible: NaN }).isValid, false);
  });

  test('rejects an invalid date', () => {
    // new Date('not a date') is a Date instance whose time is NaN — it does not
    // throw, so instanceof alone is not enough.
    const result = validateAssignmentInput({ ...valid, dueDate: new Date('not a date') });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('due date')));
  });

  test('reports every problem at once, not just the first', () => {
    // A form that fixes one error per submit round is a form people abandon.
    const result = validateAssignmentInput({
      title: '',
      type: 'Nonsense',
      pointsPossible: 0,
      dueDate: new Date('nope'),
    });

    assert.equal(result.errors.length, 4);
  });

  test('accepts a due date in the past', () => {
    // Deliberate: teachers backfill coursework that was set on paper. Story 16
    // (the coursework sweep) is what marks overdue work Missing, and it should
    // pick these up immediately rather than being blocked at creation time.
    assert.equal(
      validateAssignmentInput({ ...valid, dueDate: new Date('2020-01-01') }).isValid,
      true
    );
  });
});
