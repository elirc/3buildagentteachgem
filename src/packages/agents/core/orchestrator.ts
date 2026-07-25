import { db } from '@/db';
import { AgentType, AgentTargetType, AgentOutput } from './types';
import { runStudentProgressSummaryAgent } from '../registry/StudentProgressSummaryAgent';
import { runAtRiskStudentDetectionAgent } from '../registry/AtRiskStudentDetectionAgent';
import { runAssignmentFeedbackAgent } from '../registry/AssignmentFeedbackAgent';
import { runAttendanceAnomalyAgent } from '../registry/AttendanceAnomalyAgent';
import { runTeacherWorkloadInsightAgent } from '../registry/TeacherWorkloadInsightAgent';
import { logger } from '@/observability/logging';
import { recordAuditEvent } from '@/observability/audit';
import { notifyAgentRecommendations } from '@/observability/notifications';
import { calculateSectionGrade } from '@/domain/rules/grades';

/**
 * Centrally orchestrates and records Heuristic Agent executions in the database.
 */
export async function executeAgentRun(params: {
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  createdById?: string;
}): Promise<string> {
  const { agentType, targetType, targetId, createdById } = params;

  // 1. Create a Pending Agent Run record in the database
  const runRecord = await db.agentRun.create({
    data: {
      agentType,
      targetType,
      targetId,
      status: 'Pending',
      inputSnapshotJSON: '{}',
      createdById: createdById || null,
    },
  });

  await logger.info({
    service: 'AgentEngine',
    message: `Initiated Agent Run [${runRecord.id}] of type [${agentType}] on target [${targetType}:${targetId}]`,
    entityType: 'AgentRun',
    entityId: runRecord.id,
    userId: createdById,
  });

  try {
    let inputSnapshot: Record<string, any> = {};
    let runResult: { output: AgentOutput; trace: string[] };

    // 2. Load context data according to Agent Target Type
    switch (agentType) {
      case 'StudentProgressSummary': {
        if (targetType !== 'Student') throw new Error(`Agent [${agentType}] expects target Student, got [${targetType}]`);

        // Fetch complete student facts
        const student = await db.student.findUniqueOrThrow({ where: { id: targetId } });
        const enrollments = await db.enrollment.findMany({
          where: { studentId: targetId },
          include: { classSection: { include: { course: true } } },
        });
        const submissions = await db.submission.findMany({
          where: { studentId: targetId },
          include: { assignment: { include: { classSection: { include: { course: true } } } } },
        });
        const attendance = await db.attendance.findMany({
          where: { studentId: targetId },
          include: { classSection: { include: { course: true } } },
        });
        const supportNotes = await db.supportNote.findMany({
          where: { studentId: targetId },
        });
        const interventionPlans = await db.interventionPlan.findMany({
          where: { studentId: targetId },
        });

        // Map inputs
        const agentInput = {
          student: {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            enrollmentStatus: student.enrollmentStatus,
          },
          enrollments: enrollments.map((e) => ({
            sectionId: e.classSectionId,
            courseCode: e.classSection.course.code,
            courseTitle: e.classSection.course.title,
            finalGrade: e.finalGrade,
          })),
          submissions: submissions.map((s) => ({
            assignmentId: s.assignmentId,
            assignmentTitle: s.assignment.title,
            courseCode: s.assignment.classSection.course.code,
            status: s.status,
            score: s.score,
            pointsPossible: s.assignment.pointsPossible,
            dueDate: s.assignment.dueDate.toISOString(),
          })),
          attendance: attendance.map((a) => ({
            courseCode: a.classSection.course.code,
            status: a.status,
            date: a.date.toISOString(),
          })),
          supportNotes: supportNotes.map((n) => ({
            noteType: n.noteType,
            content: n.content,
          })),
          interventionPlans: interventionPlans.map((p) => ({
            status: p.status,
            summary: p.summary,
          })),
        };

        inputSnapshot = agentInput;
        runResult = runStudentProgressSummaryAgent(agentInput);
        break;
      }

      case 'AtRiskStudentDetection': {
        if (targetType !== 'Student') throw new Error(`Agent [${agentType}] expects target Student, got [${targetType}]`);

        // Fetch student facts for risk scoring
        const student = await db.student.findUniqueOrThrow({ where: { id: targetId } });
        
        // Calculate current grade average
        const submissions = await db.submission.findMany({
          where: { studentId: targetId },
          include: { assignment: true },
        });
        const gradeCalc = calculateSectionGrade(
          submissions.map((s) => ({
            status: s.status,
            score: s.score,
            pointsPossible: s.assignment.pointsPossible,
          }))
        );

        // Fetch absences and tardies
        const absences = await db.attendance.count({ where: { studentId: targetId, status: 'Absent' } });
        const tardies = await db.attendance.count({ where: { studentId: targetId, status: 'Tardy' } });

        // Check active intervention
        const activePlan = await db.interventionPlan.count({
          where: { studentId: targetId, status: 'Active' },
        });

        // Notes and keyword matching
        const notes = await db.supportNote.findMany({ where: { studentId: targetId } });
        const textToSearch = notes.map((n) => n.content.toLowerCase()).join(' ');
        const keywords = ['absence', 'fail', 'struggling', 'missed', 'absent', 'behind', 'backlog'];
        const escalationKeywordsFound = keywords.some((kw) => textToSearch.includes(kw));

        const agentInput = {
          student: {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
          },
          gradeAverage: gradeCalc.percentage,
          missingAssignmentsCount: gradeCalc.missingCount,
          absencesCount: absences,
          tardiesCount: tardies,
          hasActiveIntervention: activePlan > 0,
          recentNotesCount: notes.length,
          recentEscalationKeywordsFound: escalationKeywordsFound,
        };

        inputSnapshot = agentInput;
        runResult = runAtRiskStudentDetectionAgent(agentInput);
        break;
      }

      case 'AssignmentFeedback': {
        if (targetType !== 'Submission') throw new Error(`Agent [${agentType}] expects target Submission, got [${targetType}]`);

        // Fetch submission facts
        const submission = await db.submission.findUniqueOrThrow({
          where: { id: targetId },
          include: { assignment: true },
        });

        const agentInput = {
          assignment: {
            id: submission.assignment.id,
            title: submission.assignment.title,
            type: submission.assignment.type,
            pointsPossible: submission.assignment.pointsPossible,
            dueDate: submission.assignment.dueDate.toISOString(),
          },
          submission: {
            id: submission.id,
            status: submission.status,
            score: submission.score,
            contentText: submission.contentText,
            submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
          },
        };

        inputSnapshot = agentInput;
        runResult = runAssignmentFeedbackAgent(agentInput);
        break;
      }

      case 'AttendanceAnomaly': {
        if (targetType !== 'Student' && targetType !== 'ClassSection') {
          throw new Error(`Agent [${agentType}] expects target Student or ClassSection, got [${targetType}]`);
        }

        let targetName = '';
        let records: Array<{ date: string; status: string; notes?: string | null }> = [];
        let sectionTotalStudents = 1;

        if (targetType === 'Student') {
          const student = await db.student.findUniqueOrThrow({ where: { id: targetId } });
          targetName = `${student.firstName} ${student.lastName}`;

          const dbRecords = await db.attendance.findMany({
            where: { studentId: targetId },
          });
          records = dbRecords.map((r) => ({
            date: r.date.toISOString(),
            status: r.status,
            notes: r.notes,
          }));
        } else {
          const section = await db.classSection.findUniqueOrThrow({
            where: { id: targetId },
            include: { course: true, enrollments: true },
          });
          targetName = `${section.course.title} (${section.course.code}) - ${section.term}`;
          sectionTotalStudents = section.enrollments.length;

          const dbRecords = await db.attendance.findMany({
            where: { classSectionId: targetId },
          });
          records = dbRecords.map((r) => ({
            date: r.date.toISOString(),
            status: r.status,
            notes: r.notes,
          }));
        }

        const agentInput = {
          targetName,
          targetType,
          records,
          sectionTotalStudents,
        };

        inputSnapshot = agentInput;
        runResult = runAttendanceAnomalyAgent(agentInput);
        break;
      }

      case 'TeacherWorkloadInsight': {
        if (targetType !== 'Teacher') throw new Error(`Agent [${agentType}] expects target Teacher, got [${targetType}]`);

        // Fetch teacher facts
        const teacher = await db.teacher.findUniqueOrThrow({ where: { id: targetId } });
        
        // Active sections assigned
        const activeSections = await db.classSection.findMany({
          where: { teacherId: targetId, status: 'Active' },
          include: { enrollments: true },
        });

        // Roster size capacity summation
        const totalCapacity = activeSections.reduce((sum, s) => sum + s.capacity, 0);

        // Ungraded submissions count
        const activeSectionIds = activeSections.map((s) => s.id);
        const ungradedCount = await db.submission.count({
          where: {
            status: 'Submitted',
            assignment: { classSectionId: { in: activeSectionIds } },
          },
        });

        // Count of enrolled at-risk students
        const studentEnrollments = await db.enrollment.findMany({
          where: { classSectionId: { in: activeSectionIds }, status: 'Enrolled' },
          select: { studentId: true },
        });
        const studentIds = [...new Set(studentEnrollments.map((se) => se.studentId))];
        
        let atRiskCount = 0;
        for (const sId of studentIds) {
          const subms = await db.submission.findMany({
            where: { studentId: sId },
            include: { assignment: true },
          });
          const gradeCalc = calculateSectionGrade(
            subms.map((s) => ({
              status: s.status,
              score: s.score,
              pointsPossible: s.assignment.pointsPossible,
            }))
          );
          if (gradeCalc.percentage < 70) {
            atRiskCount++;
          }
        }

        const agentInput = {
          teacher: {
            id: teacher.id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            department: teacher.department,
            employmentStatus: teacher.employmentStatus,
          },
          activeSectionsCount: activeSections.length,
          totalStudentsCapacity: totalCapacity,
          ungradedSubmissionsCount: ungradedCount,
          atRiskStudentsCount: atRiskCount,
        };

        inputSnapshot = agentInput;
        runResult = runTeacherWorkloadInsightAgent(agentInput);
        break;
      }

      default:
        throw new Error(`Unsupported Agent Type: ${agentType}`);
    }

    // Sort confidence rating, complete running transitions
    const finalConfidence = runResult.output.confidenceScore;

    // 3. Persist success state in the DB
    await db.agentRun.update({
      where: { id: runRecord.id },
      data: {
        status: 'Succeeded',
        inputSnapshotJSON: JSON.stringify(inputSnapshot),
        outputJSON: JSON.stringify(runResult.output),
        confidenceScore: finalConfidence,
        traceJSON: JSON.stringify(runResult.trace),
        completedAt: new Date(),
      },
    });

    // 4. Record audit events and system logs
    await recordAuditEvent({
      actorId: createdById || 'system',
      action: 'agent.run',
      entityType: 'AgentRun',
      entityId: runRecord.id,
      after: {
        agentType,
        targetType,
        targetId,
        status: 'Succeeded',
        confidenceScore: finalConfidence,
      },
    });

    await logger.info({
      service: 'AgentEngine',
      message: `Agent Run [${runRecord.id}] of type [${agentType}] completed successfully with confidence score [${finalConfidence}]`,
      entityType: 'AgentRun',
      entityId: runRecord.id,
    });

    // Fan urgent recommendations out to whoever owns them.
    //
    // Inside its own try/catch on purpose: a notification is an aside. The run
    // has already succeeded and been persisted, and failing it now because an
    // alert could not be delivered would throw away the analysis over a
    // side effect.
    try {
      await notifyAgentRecommendations({
        runId: runRecord.id,
        agentType,
        targetType,
        targetId,
        recommendations: runResult.output.recommendations,
        subjectName: (inputSnapshot as any)?.student
          ? `${(inputSnapshot as any).student.firstName} ${(inputSnapshot as any).student.lastName}`
          : (inputSnapshot as any)?.teacher
            ? `${(inputSnapshot as any).teacher.firstName} ${(inputSnapshot as any).teacher.lastName}`
            : undefined,
      });
    } catch (notifyError) {
      await logger.error({
        service: 'AgentEngine',
        message: `Agent Run [${runRecord.id}] succeeded but notification fan-out failed: ${(notifyError as Error).message}`,
        entityType: 'AgentRun',
        entityId: runRecord.id,
      });
    }

    return runRecord.id;
  } catch (err) {
    const errorMsg = (err as Error).message || String(err);
    console.error(`❌ Agent Run ${runRecord.id} failed:`, err);

    await db.agentRun.update({
      where: { id: runRecord.id },
      data: {
        status: 'Failed',
        errorMessage: errorMsg,
        completedAt: new Date(),
      },
    });

    await logger.error({
      service: 'AgentEngine',
      message: `Agent Run [${runRecord.id}] failed: ${errorMsg}`,
      entityType: 'AgentRun',
      entityId: runRecord.id,
      metadata: { error: (err as Error).stack },
    });

    return runRecord.id;
  }
}
