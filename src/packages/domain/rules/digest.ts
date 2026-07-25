export interface DigestInput {
  student: { firstName: string; lastName: string; guardianName: string };
  periodStart: Date;
  periodEnd: Date;
  sections: Array<{ courseCode: string; courseTitle: string; finalGrade: number | null }>;
  newGrades: Array<{ assignmentTitle: string; courseCode: string; score: number | null; pointsPossible: number }>;
  absences: number;
  tardies: number;
  missingAssignments: Array<{ assignmentTitle: string; courseCode: string }>;
  upcoming: Array<{ assignmentTitle: string; courseCode: string; dueDate: Date }>;
  /**
   * ONLY notes with visibility 'Shared'. The caller filters; this type exists
   * to make that contract visible at the boundary rather than relying on a
   * comment somewhere upstream.
   */
  sharedNotes: Array<{ noteType: string; content: string }>;
  activePlan: { summary: string; followUpDate: Date } | null;
}

export interface DigestOutput {
  subject: string;
  bodyText: string;
  metrics: {
    sectionCount: number;
    newGradeCount: number;
    absences: number;
    tardies: number;
    missingCount: number;
    upcomingCount: number;
    hasActivePlan: boolean;
    isQuietWeek: boolean;
  };
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Composes a guardian-facing weekly digest.
 *
 * A pure function: data in, strings out. No database, no formatting library,
 * no clock. That means the wording — the part a parent actually reads and the
 * part most likely to need revision — can be iterated on and tested without a
 * seeded database or a running server.
 *
 * The tone rules are deliberate. This message goes to a family, so it opens
 * with what went well, states problems plainly without editorialising, and
 * never implies a judgement the data does not support.
 */
export function composeGuardianDigest(input: DigestInput): DigestOutput {
  const {
    student, periodStart, periodEnd, sections, newGrades,
    absences, tardies, missingAssignments, upcoming, sharedNotes, activePlan,
  } = input;

  const name = student.firstName;
  const lines: string[] = [];

  const isQuietWeek =
    newGrades.length === 0 &&
    absences === 0 &&
    tardies === 0 &&
    missingAssignments.length === 0;

  lines.push(`Hello ${student.guardianName},`);
  lines.push('');
  lines.push(
    `Here is ${name} ${student.lastName}'s weekly summary for ${formatDay(periodStart)} to ${formatDay(periodEnd)}.`
  );
  lines.push('');

  if (isQuietWeek) {
    // A quiet week still gets a message. Silence reads as "the school is not
    // paying attention", and a guardian who only ever hears bad news learns to
    // dread the email.
    lines.push(`There were no new grades, absences or missing assignments recorded for ${name} this week.`);
    lines.push('');
  }

  if (sections.length > 0) {
    lines.push('CURRENT AVERAGES');
    for (const s of sections) {
      lines.push(
        `  ${s.courseCode} — ${s.courseTitle}: ${s.finalGrade !== null ? `${s.finalGrade}%` : 'not yet graded'}`
      );
    }
    lines.push('');
  }

  if (newGrades.length > 0) {
    lines.push('NEW GRADES THIS WEEK');
    for (const g of newGrades) {
      lines.push(`  ${g.courseCode} — ${g.assignmentTitle}: ${g.score ?? 0}/${g.pointsPossible}`);
    }
    lines.push('');
  }

  if (absences > 0 || tardies > 0) {
    lines.push('ATTENDANCE');
    lines.push(`  Absences: ${absences}    Late arrivals: ${tardies}`);
    if (absences >= 3) {
      lines.push('  Please contact the school office if there is something we should know about.');
    }
    lines.push('');
  }

  if (missingAssignments.length > 0) {
    lines.push(`OUTSTANDING WORK (${missingAssignments.length})`);
    for (const m of missingAssignments) {
      lines.push(`  ${m.courseCode} — ${m.assignmentTitle}`);
    }
    lines.push('');
  }

  if (upcoming.length > 0) {
    lines.push('DUE IN THE NEXT WEEK');
    for (const u of upcoming) {
      lines.push(`  ${formatDay(u.dueDate)} — ${u.courseCode}: ${u.assignmentTitle}`);
    }
    lines.push('');
  }

  if (sharedNotes.length > 0) {
    lines.push('NOTES FROM STAFF');
    for (const n of sharedNotes) {
      lines.push(`  (${n.noteType}) ${n.content}`);
    }
    lines.push('');
  }

  if (activePlan) {
    lines.push('SUPPORT PLAN');
    lines.push(`  ${activePlan.summary}`);
    lines.push(`  Next review: ${formatDay(activePlan.followUpDate)}`);
    lines.push('');
  }

  lines.push('You can reply to this message to reach the school office.');

  // The subject line carries the one fact a guardian needs before opening.
  const headline = isQuietWeek
    ? 'no changes this week'
    : missingAssignments.length > 0
      ? `${missingAssignments.length} outstanding assignment${missingAssignments.length === 1 ? '' : 's'}`
      : absences > 0
        ? `${absences} absence${absences === 1 ? '' : 's'}`
        : `${newGrades.length} new grade${newGrades.length === 1 ? '' : 's'}`;

  return {
    subject: `${name}'s weekly update — ${headline}`,
    bodyText: lines.join('\n'),
    metrics: {
      sectionCount: sections.length,
      newGradeCount: newGrades.length,
      absences,
      tardies,
      missingCount: missingAssignments.length,
      upcomingCount: upcoming.length,
      hasActivePlan: !!activePlan,
      isQuietWeek,
    },
  };
}

/**
 * Normalises a date to the Monday 00:00 UTC of its week.
 *
 * The unique constraint is [studentId, periodStart], so two generations in the
 * same week must produce a byte-identical periodStart or the upsert becomes an
 * insert and duplicates pile up.
 */
export function startOfWeekUTC(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}
