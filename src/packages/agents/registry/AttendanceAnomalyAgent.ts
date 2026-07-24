import { AgentOutput, AgentRecommendation } from '../core/types';

export interface AttendanceRecordInput {
  date: string;
  status: string; // 'Present', 'Absent', 'Tardy', 'Excused'
  notes?: string | null;
}

export interface AttendanceAnomalyInput {
  targetName: string; // Student name or Section name
  targetType: 'Student' | 'ClassSection';
  records: AttendanceRecordInput[];
  sectionTotalStudents?: number;
}

/**
 * Deterministic Attendance Anomaly Agent.
 * Analyzes logs for streaks, single-day class drops, and tardiness clusters.
 */
export function runAttendanceAnomalyAgent(input: AttendanceAnomalyInput): {
  output: AgentOutput;
  trace: string[];
} {
  const trace: string[] = [];
  const { targetName, targetType, records, sectionTotalStudents = 1 } = input;

  trace.push(`[1. Init] Initializing Attendance Anomaly Agent for [${targetType}]: "${targetName}"`);
  trace.push(`[2. Load Data] Loaded ${records.length} historical attendance records for analysis.`);

  let anomalyScore = 0;
  const evidence: string[] = [];
  const concerns: string[] = [];
  const strengths: string[] = [];
  const recommendations: AgentRecommendation[] = [];
  const limitations: string[] = [];
  let confidenceScore = 0.95;

  let suspectedCause = 'None';
  let advisorFollowUp = false;

  if (records.length === 0) {
    trace.push('[Data Alert] Zero attendance records detected. Flagging data quality warning.');
    limitations.push('Roster has zero attendance logs recorded. Anomaly scan aborted.');
    
    return {
      output: {
        summary: `No attendance records exist to analyze for "${targetName}".`,
        strengths,
        concerns: ['Roster lacks attendance logs.'],
        confidenceScore: 0.5,
        findings: ['Data quality warning: empty logs.'],
        recommendations: [{ action: 'Record initial attendance sheet.', recommendedOwner: 'Teacher', urgency: 'Medium' }],
        limitations,
        metadata: { anomalyScore: 0, suspectedCause: 'NoData', advisorFollowUp: false },
      },
      trace,
    };
  }

  // Sort records by date ascending
  const sortedRecords = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (targetType === 'Student') {
    trace.push('[3. Analysis: Student Streak] Checking for consecutive absence runs...');
    
    let consecutiveAbsences = 0;
    let maxConsecutiveAbsences = 0;

    for (const rec of sortedRecords) {
      if (rec.status === 'Absent') {
        consecutiveAbsences++;
        if (consecutiveAbsences > maxConsecutiveAbsences) {
          maxConsecutiveAbsences = consecutiveAbsences;
        }
      } else if (rec.status === 'Present' || rec.status === 'Tardy') {
        consecutiveAbsences = 0; // reset streak on presence
      }
    }

    trace.push(`Absence streak analysis complete. Longest unexcused streak: ${maxConsecutiveAbsences} sessions.`);

    if (maxConsecutiveAbsences >= 4) {
      anomalyScore += 65;
      suspectedCause = 'Chronic absenteeism / Engagement';
      evidence.push(`Critical: Student has a consecutive streak of ${maxConsecutiveAbsences} unexcused absences.`);
      concerns.push('Severe consecutive absence streak.');
      advisorFollowUp = true;
    } else if (maxConsecutiveAbsences >= 2) {
      anomalyScore += 30;
      suspectedCause = 'Localized Illness / Vacation';
      evidence.push(`Warning: Student has a streak of ${maxConsecutiveAbsences} consecutive absences.`);
      concerns.push('Short consecutive absence streak.');
    }

    // Check for high density of tardies
    const tardyCount = records.filter((r) => r.status === 'Tardy').length;
    trace.push(`Tardy checking: student has ${tardyCount} tardies in total.`);
    if (tardyCount >= 3) {
      anomalyScore += 20;
      evidence.push(`Tardy cluster: student has been late ${tardyCount} times.`);
      concerns.push('Frequent classroom tardiness.');
      if (suspectedCause === 'None') suspectedCause = 'Scheduling Conflict / Transport';
    }

    if (anomalyScore === 0) {
      strengths.push('Excellent presence consistency: no attendance anomalies detected.');
      trace.push('Perfect attendance streak. Stable.');
    }

  } else {
    // ClassSection wide checks
    trace.push('[3. Analysis: Section Metrics] Analyzing class-wide attendance trends...');

    // Group records by date to find if there is a single date with unusually high absences
    const dateGroups: Record<string, { total: number; absent: number }> = {};
    for (const rec of records) {
      const d = rec.date.split('T')[0];
      if (!dateGroups[d]) dateGroups[d] = { total: 0, absent: 0 };
      dateGroups[d].total++;
      if (rec.status === 'Absent') {
        dateGroups[d].absent++;
      }
    }

    let maxSingleDayAbsencePercent = 0;
    let anomalyDate = '';

    for (const [date, stats] of Object.entries(dateGroups)) {
      const pct = (stats.absent / stats.total) * 100;
      trace.push(`Section Date: ${date} - Absences: ${stats.absent}/${stats.total} (${Math.round(pct)}%)`);
      if (pct > maxSingleDayAbsencePercent && stats.total >= 3) {
        maxSingleDayAbsencePercent = pct;
        anomalyDate = date;
      }
    }

    if (maxSingleDayAbsencePercent >= 40) {
      anomalyScore += 50;
      suspectedCause = 'School Event / Technical Sync Failure';
      evidence.push(`Section-wide drop-off: On ${anomalyDate}, ${Math.round(maxSingleDayAbsencePercent)}% of enrolled students were marked Absent.`);
      concerns.push('High single-day section absenteeism.');
      
      recommendations.push({
        action: `Verify if a school-wide field trip or assembly took place on ${anomalyDate}.`,
        recommendedOwner: 'Admin',
        urgency: 'Medium',
      });
      recommendations.push({
        action: `Audit roster data integration logs for attendance recording anomalies on ${anomalyDate}.`,
        recommendedOwner: 'Admin',
        urgency: 'Low',
      });
    }

    if (anomalyScore === 0) {
      strengths.push('Stable roster compliance: section attendance matches expected distributions.');
    }
  }

  anomalyScore = Math.min(100, anomalyScore);

  if (advisorFollowUp) {
    recommendations.push({
      action: 'Initiate advisor intervention outreach to student and guardian.',
      recommendedOwner: 'Advisor',
      urgency: 'High',
    });
  } else if (anomalyScore >= 30 && targetType === 'Student') {
    recommendations.push({
      action: 'Send automated attendance notification alert to student and parent.',
      recommendedOwner: 'Teacher',
      urgency: 'Medium',
    });
  }

  const summary = `Attendance scan completed for "${targetName}". Anomaly score is ${anomalyScore}/100. Suspected cause: [${suspectedCause}]. ${recommendations.length > 0 ? 'Actionable operational alerts have been triggered.' : 'No anomalies detected.'}`;

  trace.push('[4. Finalized] Attendance anomaly scan completed.');

  return {
    output: {
      summary,
      strengths,
      concerns,
      confidenceScore,
      findings: evidence,
      recommendations,
      limitations,
      metadata: {
        anomalyScore,
        suspectedCause,
        advisorFollowUp,
        targetType,
      },
    },
    trace,
  };
}
