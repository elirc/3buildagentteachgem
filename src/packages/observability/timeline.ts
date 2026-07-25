import { db } from '@/db';

export type TimelineKind = 'grade' | 'attendance' | 'enrollment' | 'support' | 'agent';

export interface TimelineEntry {
  at: Date;
  kind: TimelineKind;
  icon: string;
  title: string;
  detail: string;
  actorName: string;
  href?: string;
}

/**
 * Reconstructs "everything that has happened to this student" as one stream.
 *
 * This is harder than it looks, and the reason is a schema decision worth
 * understanding: AuditEvent and SystemLog have NO foreign keys into the academic
 * graph. They store entityType and entityId as loose strings. That is what makes
 * them able to record events about anything without the schema knowing every
 * table in advance — and it is why reading them back means collecting the ids
 * you care about first and querying by `in`.
 *
 * That trade (cheap writes, expensive reads) is the classic shape of an
 * append-only audit log, and it is why real systems put a projection or a search
 * index in front of one.
 */
export async function buildStudentTimeline(studentId: string, limit = 30): Promise<TimelineEntry[]> {
  // 1. Collect every id that "belongs to" this student, so audit rows can be
  //    matched by entityId rather than by scanning JSON blobs for a name.
  const [enrollments, submissions, notes, plans] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId },
      select: { id: true, classSection: { select: { course: { select: { code: true } } } } },
    }),
    db.submission.findMany({
      where: { studentId },
      select: { id: true, assignment: { select: { title: true, pointsPossible: true, classSectionId: true } } },
    }),
    db.supportNote.findMany({ where: { studentId }, select: { id: true, noteType: true } }),
    db.interventionPlan.findMany({ where: { studentId }, select: { id: true, summary: true } }),
  ]);

  const relatedIds = [
    studentId,
    ...enrollments.map((e) => e.id),
    ...submissions.map((s) => s.id),
    ...notes.map((n) => n.id),
    ...plans.map((p) => p.id),
  ];

  const submissionById = new Map(submissions.map((s) => [s.id, s]));
  const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));
  const planById = new Map(plans.map((p) => [p.id, p]));

  // 2. The three event sources.
  const [auditEvents, agentRuns, attendance] = await Promise.all([
    db.auditEvent.findMany({
      where: { entityId: { in: relatedIds } },
      orderBy: { createdAt: 'desc' },
      take: limit * 2, // over-fetch: some rows are filtered out below
    }),
    db.agentRun.findMany({
      where: { targetType: 'Student', targetId: studentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db.attendance.findMany({
      where: { studentId, status: { in: ['Absent', 'Tardy'] } },
      include: { classSection: { include: { course: { select: { code: true } } } } },
      orderBy: { date: 'desc' },
      take: limit,
    }),
  ]);

  // 3. Resolve actor names in ONE query. Doing this inside the map below would
  //    be a findUnique per row — the N+1 that every timeline implementation
  //    grows if nobody looks.
  const actorIds = [...new Set(auditEvents.map((e) => e.actorId).filter((id) => id !== 'system'))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  const nameFor = (actorId: string) =>
    actorId === 'system' ? '💻 System' : actorName.get(actorId) ?? 'Unknown user';

  const entries: TimelineEntry[] = [];

  // ---- Audit events ------------------------------------------------------
  for (const evt of auditEvents) {
    // beforeJSON/afterJSON are nullable (creates have no before) and are plain
    // TEXT, so a malformed value must not take down the page.
    let after: any = null;
    try {
      after = evt.afterJSON ? JSON.parse(evt.afterJSON) : null;
    } catch {
      after = null;
    }

    const base = { at: evt.createdAt, actorName: nameFor(evt.actorId) };

    switch (evt.action) {
      case 'submission.grade': {
        const sub = submissionById.get(evt.entityId);
        entries.push({
          ...base,
          kind: 'grade',
          icon: '✍️',
          title: `Graded ${sub?.assignment.title ?? 'an assignment'}`,
          detail:
            after?.score !== undefined && sub
              ? `${after.score}/${sub.assignment.pointsPossible}${after.feedback ? ` — "${after.feedback}"` : ''}`
              : 'Score recorded',
          href: sub ? `/sections/${sub.assignment.classSectionId}/gradebook` : undefined,
        });
        break;
      }

      case 'enrollment.create':
      case 'enrollment.waitlist':
      case 'enrollment.promote':
      case 'enrollment.drop': {
        const enr = enrollmentById.get(evt.entityId);
        const verb =
          evt.action === 'enrollment.drop' ? 'Dropped from'
            : evt.action === 'enrollment.waitlist' ? 'Waitlisted for'
              : evt.action === 'enrollment.promote' ? 'Promoted from the waitlist into'
                : 'Enrolled in';
        entries.push({
          ...base,
          kind: 'enrollment',
          icon: evt.action === 'enrollment.drop' ? '🚪' : '📖',
          title: `${verb} ${enr?.classSection.course.code ?? 'a class section'}`,
          detail: after?.status ? `Enrolment status is now ${after.status}` : '',
        });
        break;
      }

      case 'supportNote.create': {
        entries.push({
          ...base,
          kind: 'support',
          icon: '📝',
          title: `Support note added (${after?.noteType ?? 'note'})`,
          detail: after?.content
            ? String(after.content).slice(0, 140)
            : 'Note recorded',
        });
        break;
      }

      case 'intervention.create':
      case 'intervention.complete': {
        const plan = planById.get(evt.entityId);
        entries.push({
          ...base,
          kind: 'support',
          icon: evt.action === 'intervention.complete' ? '✅' : '🩹',
          title:
            evt.action === 'intervention.complete'
              ? `Intervention plan closed`
              : `Intervention plan opened`,
          detail: after?.summary ?? plan?.summary ?? '',
          href: '/interventions',
        });
        break;
      }

      default:
        // Unrecognised actions are skipped rather than rendered as raw action
        // codes. A timeline is for humans; "student.update" tells them nothing.
        break;
    }
  }

  // ---- Agent runs --------------------------------------------------------
  for (const run of agentRuns) {
    let output: any = null;
    try {
      output = run.outputJSON ? JSON.parse(run.outputJSON) : null;
    } catch {
      output = null;
    }

    entries.push({
      at: run.createdAt,
      kind: 'agent',
      icon: '🤖',
      title: `${run.agentType.replace(/([A-Z])/g, ' $1').trim()} ran`,
      detail: output?.summary ?? run.errorMessage ?? `Status: ${run.status}`,
      actorName: '💻 System',
      href: `/agent-runs/${run.id}`,
    });
  }

  // ---- Attendance --------------------------------------------------------
  for (const record of attendance) {
    entries.push({
      at: record.date,
      kind: 'attendance',
      icon: record.status === 'Absent' ? '🚫' : '⏰',
      title: `${record.status} — ${record.classSection.course.code}`,
      detail: record.notes || '',
      actorName: '💻 System',
    });
  }

  // 4. One stream, newest first.
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
