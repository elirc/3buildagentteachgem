import { AgentOutput, AgentRecommendation } from '../core/types';

export interface AssignmentFeedbackInput {
  assignment: {
    id: string;
    title: string;
    type: string; // 'Homework', 'Quiz', 'Exam', 'Project', 'Discussion', 'Lab'
    pointsPossible: number;
    dueDate: string;
  };
  submission: {
    id: string;
    status: string; // 'Submitted', 'Graded', 'Late', 'Missing', 'Returned'
    score: number | null;
    contentText: string | null;
    submittedAt: string | null;
  };
}

/**
 * Deterministic Assignment Feedback Agent.
 * Generates high-quality drafted student feedback and grading compliance checks.
 */
export function runAssignmentFeedbackAgent(input: AssignmentFeedbackInput): {
  output: AgentOutput;
  trace: string[];
} {
  const trace: string[] = [];
  const { assignment, submission } = input;

  trace.push(`[1. Init] Starting Assignment Feedback Agent for Submission ID: "${submission.id}"`);
  trace.push(`[2. Load Parameters] Assignment: "${assignment.title}" (${assignment.type}), Points Possible: ${assignment.pointsPossible}`);

  const strengths: string[] = [];
  const concerns: string[] = [];
  const findings: string[] = [];
  const recommendations: AgentRecommendation[] = [];
  const limitations: string[] = [];
  let confidenceScore = 0.95;

  let studentFeedbackDraft = '';
  let teacherGradingNotes = '';

  // 1. Check if Missing
  if (submission.status === 'Missing' || (!submission.contentText && submission.status !== 'Graded')) {
    trace.push('[Status Alert] Submission is Missing or contains empty content.');
    studentFeedbackDraft = `Hi, your submission for "${assignment.title}" is currently marked as missing. Please complete the required work and submit it as soon as possible. Check the course syllabus regarding late work policies or reach out to me during office hours if you are struggling with the topic.`;
    teacherGradingNotes = 'ACTION REQUIRED: Student has not turned in this assignment. Marked as Missing (0 score impact).';
    concerns.push('Assignment is missing.');
    recommendations.push({
      action: 'Reach out to student regarding missing coursework.',
      recommendedOwner: 'Teacher',
      urgency: 'Medium',
    });

    return {
      output: {
        summary: 'Incomplete or missing assignment submission.',
        strengths,
        concerns,
        confidenceScore: 0.9,
        findings: ['No content was uploaded for review.'],
        recommendations,
        limitations,
        metadata: {
          draftFeedback: studentFeedbackDraft,
          teacherNotes: teacherGradingNotes,
          isMissing: true,
        },
      },
      trace,
    };
  }

  // 2. Timeliness check
  const isLate = submission.status === 'Late' || 
    (submission.submittedAt && new Date(submission.submittedAt).getTime() > new Date(assignment.dueDate).getTime());
  
  if (isLate) {
    trace.push('[Timeliness Alert] Submission is flagged as LATE.');
    findings.push('Submission was uploaded after the scheduled due date.');
    concerns.push('Late submission.');
  } else {
    trace.push('Submission received on-time.');
    strengths.push('On-time submission compliance.');
  }

  // 3. Score-based feedback heuristics
  const scorePercent = submission.score !== null ? (submission.score / assignment.pointsPossible) * 100 : null;
  trace.push(`[3. Heuristic: Grades] Graded status: ${submission.status}, score percent: ${scorePercent !== null ? scorePercent + '%' : 'ungraded'}`);

  if (scorePercent !== null) {
    if (scorePercent >= 90) {
      trace.push('Excellent grade detected (>=90%). Drafting reinforcing praise.');
      strengths.push(`High mastery of topic: scored ${scorePercent}% on assessment.`);
      
      studentFeedbackDraft = `Excellent work! You demonstrated an outstanding understanding of the topic in this ${assignment.type.toLowerCase()}. Your responses show clear structure and a high attention to detail. Keep up this fantastic level of work!`;
      teacherGradingNotes = `Student completed the assignment with high proficiency (${submission.score}/${assignment.pointsPossible}). Recommend standard positive reinforcement.`;
    } else if (scorePercent >= 75) {
      trace.push('Good/Stable grade detected (75-89%). Drafting developmental encouragement.');
      strengths.push('Stable understanding of core elements.');
      
      studentFeedbackDraft = `Good job on this ${assignment.type.toLowerCase()}! You have captured the main concepts successfully. There are a few minor areas where your explanations could be expanded, but overall, you are on the right track. Please review the graded rubric details.`;
      teacherGradingNotes = `Student performed well (${submission.score}/${assignment.pointsPossible}). Minor concept reviews suggested.`;
    } else {
      trace.push('Low grade detected (<75%). Drafting remediation guidance.');
      concerns.push(`Struggling with core concepts: scored ${scorePercent}% on assessment.`);
      
      studentFeedbackDraft = `Thank you for submitting your work. On this ${assignment.type.toLowerCase()}, you have captured some fundamental ideas, but there are significant gaps in key areas. I strongly encourage you to review the chapter slides, check the correct solutions, and visit my office hours so we can go over these questions together. Let's work to build your confidence here!`;
      teacherGradingNotes = `Student is struggling with this material (${submission.score}/${assignment.pointsPossible}). Needs targeted tutoring or a concept review meeting.`;

      recommendations.push({
        action: 'Schedule 10-minute office hour review meeting with student.',
        recommendedOwner: 'Teacher',
        urgency: 'Medium',
      });
    }
  } else {
    // Ungraded paper backlog
    trace.push('Submission is currently UNGRADED. Drafting grading assist guidelines.');
    findings.push('Submission is awaiting teacher grading evaluation.');
    
    studentFeedbackDraft = 'Thank you for your submission. Your teacher is currently reviewing your work and will post grades and comments shortly.';
    teacherGradingNotes = 'BACKLOG TASK: This submission is ungraded. Quick assessment: Content is uploaded and contains text. Review against grading rubrics.';
    
    confidenceScore -= 0.1;
    limitations.push('Numeric score is unavailable. Drafted student feedback is static and lacks quantitative depth.');
  }

  // 4. Customize by assignment type
  trace.push(`[4. Heuristic: Type Specific] Customizing suggestions for type: ${assignment.type}`);
  const contentLen = submission.contentText?.length || 0;
  
  if (assignment.type === 'Lab' || assignment.type === 'Project') {
    if (contentLen < 150 && submission.status !== 'Graded') {
      concerns.push('Scientific documentation appears sparse or extremely brief.');
      teacherGradingNotes += ' Warning: Submission content is extremely short for a project/lab. Check for complete data and analysis charts.';
    }
    recommendations.push({
      action: 'Check rubric compliance for scientific methodology sketches and data tables.',
      recommendedOwner: 'Teacher',
      urgency: 'Low',
    });
  }

  const summary = `Submission analysis for "${assignment.title}". The student's work is ${submission.status.toLowerCase()} and reflects a ${scorePercent !== null ? Math.round(scorePercent) + '%' : 'pending'} score standard. Customized feedback drafts have been generated for teacher inspection.`;

  trace.push('[5. Complete] Assignment feedback analysis compiled.');

  return {
    output: {
      summary,
      strengths,
      concerns,
      confidenceScore,
      findings,
      recommendations,
      limitations,
      metadata: {
        draftFeedback: studentFeedbackDraft,
        teacherNotes: teacherGradingNotes,
        isLate,
        contentLength: contentLen,
      },
    },
    trace,
  };
}
