import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime, canPerformAction } from '@/shared';
import { diffAgentOutputs, diffInputSnapshots } from '@/agents/core/diff';
import { runAgentAction } from '../../actions';
import type { AgentType, AgentTargetType } from '@/agents/core/types';
import Link from 'next/link';

export const revalidate = 0;

export default async function AgentRunDetailPage({ params }: { params: { id: string } }) {
  const runId = params.id;
  const activeUser = await getActiveUser();

  // Fetch the agent run
  const run = await db.agentRun.findUniqueOrThrow({
    where: { id: runId },
    include: { createdByUser: true },
  });

  const inputs = JSON.parse(run.inputSnapshotJSON || '{}');
  const outputs = run.outputJSON ? JSON.parse(run.outputJSON) : null;
  const trace: string[] = run.traceJSON ? JSON.parse(run.traceJSON) : [];

  // The previous SUCCEEDED run of the same agent against the same target.
  // Failed runs are excluded because they have no output to compare against —
  // they still appear in the history strip below, marked.
  const previous = await db.agentRun.findFirst({
    where: {
      agentType: run.agentType,
      targetId: run.targetId,
      status: 'Succeeded',
      createdAt: { lt: run.createdAt },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Older rows may carry '{}' as their snapshot: the orchestrator writes that
  // at creation and only fills it in on success.
  let previousOutput: any = null;
  let previousInputs: any = {};
  try {
    previousOutput = previous?.outputJSON ? JSON.parse(previous.outputJSON) : null;
    previousInputs = previous?.inputSnapshotJSON ? JSON.parse(previous.inputSnapshotJSON) : {};
  } catch {
    previousOutput = null;
  }

  const outputDiff = previousOutput && outputs ? diffAgentOutputs(previousOutput, outputs) : null;
  const inputDiff = previousOutput && outputs ? diffInputSnapshots(previousInputs, inputs) : [];

  const history = await db.agentRun.findMany({
    where: { agentType: run.agentType, targetId: run.targetId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, confidenceScore: true, status: true },
    take: 20,
  });

  const canRerun = canPerformAction(activeUser.role, 'agent.run.student');

  async function handleRerun() {
    'use server';
    await runAgentAction({
      agentType: run.agentType as AgentType,
      targetType: run.targetType as AgentTargetType,
      targetId: run.targetId,
      createdById: activeUser.id,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Detail Header */}
      <div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          <Link href="/agent-runs">Agent Execution History</Link>
          <span>/</span>
          <span style={{ color: 'var(--color-text-main)' }}>Run Trace Viewer</span>
        </div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Reasoning Trace: {run.agentType.replace(/([A-Z])/g, ' $1').trim()}
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Audit active execution logs, evaluate mock LLM telemetry, and check dynamic heuristics reasoning.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* LEFT COLUMN: INTERACTIVE REASONING TRACE TIMELINE */}
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* TIMELINE CARD */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🧠 Inner Chain-of-Thought Telemetry Trace</span>
            </h3>
            
            {trace.length === 0 ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem'
              }}>
                No thought steps were logged during this run. Status: <strong>{run.status}</strong>
                {run.errorMessage && (
                  <pre style={{
                    color: 'var(--color-danger-text)',
                    backgroundColor: 'var(--color-risk-critical-bg)',
                    padding: '12px',
                    borderRadius: '4px',
                    marginTop: '12px',
                    whiteSpace: 'pre-wrap',
                    textAlign: 'left'
                  }}>{run.errorMessage}</pre>
                )}
              </div>
            ) : (
              <div className="timeline" style={{ paddingLeft: '24px' }}>
                {trace.map((step, idx) => (
                  <div key={idx} className="timeline-item active" style={{ marginBottom: '20px' }}>
                    <div className="timeline-time">Telemetric Step {idx + 1}</div>
                    <p style={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      color: 'var(--color-text-main)',
                      margin: 0,
                      backgroundColor: 'var(--color-bg)',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      borderLeft: '3px solid var(--color-primary)'
                    }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COMPARISON WITH THE PREVIOUS RUN */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Compared with the previous run</h3>
              {canRerun && (
                <form action={handleRerun}>
                  <button type="submit" className="btn btn-secondary btn-sm">Re-run this agent</button>
                </form>
              )}
            </div>

            {!previous ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                This is the first successful run for this target. Re-run the agent to start building a
                history — the comparison is where an intervention proves it is working.
              </p>
            ) : !outputDiff ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                The previous run has no stored output to compare against.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Previous run: {formatDateTime(previous.createdAt)} ·{' '}
                  <Link href={`/agent-runs/${previous.id}`} style={{ textDecoration: 'underline' }}>open it</Link>
                </div>

                {!outputDiff.hasAnyChange ? (
                  <div style={{
                    padding: '12px', backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border)',
                  }}>
                    <strong>No changes.</strong> These agents are deterministic, so identical inputs
                    produce identical outputs. This is the expected result of re-running against
                    unchanged data, and it is what lets you trust the differences when they do appear.
                  </div>
                ) : (
                  <>
                    {outputDiff.confidenceDelta !== null && outputDiff.confidenceDelta !== 0 && (
                      <div>
                        <strong>Confidence:</strong>{' '}
                        <span style={{
                          color: outputDiff.confidenceDelta > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                          fontWeight: 700,
                        }}>
                          {outputDiff.confidenceDelta > 0 ? '+' : ''}
                          {Math.round(outputDiff.confidenceDelta * 100)}%
                        </span>
                      </div>
                    )}

                    {outputDiff.metadata.length > 0 && (
                      <div>
                        <strong>Metrics</strong>
                        <ul style={{ paddingLeft: '18px', margin: '4px 0 0 0' }}>
                          {outputDiff.metadata.map((m) => (
                            <li key={m.key}>
                              <code>{m.key}</code>: {String(m.before)} to <strong>{String(m.after)}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {outputDiff.recommendations.changed.length > 0 && (
                      <div>
                        <strong style={{ color: 'var(--color-danger-text)' }}>
                          Recommendations that changed urgency or owner
                        </strong>
                        <ul style={{ paddingLeft: '18px', margin: '4px 0 0 0' }}>
                          {outputDiff.recommendations.changed.map((c, i) => (
                            <li key={i}>
                              {c.action} — {c.before.urgency}/{c.before.recommendedOwner} to{' '}
                              <strong>{c.after.urgency}/{c.after.recommendedOwner}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {([
                      ['Findings', outputDiff.findings],
                      ['Concerns', outputDiff.concerns],
                      ['Strengths', outputDiff.strengths],
                      ['Limitations', outputDiff.limitations],
                    ] as const).map(([label, d]) =>
                      d.added.length + d.removed.length === 0 ? null : (
                        <div key={label}>
                          <strong>{label}</strong>
                          <ul style={{ paddingLeft: '18px', margin: '4px 0 0 0' }}>
                            {d.added.map((s, i) => (
                              <li key={`a${i}`} style={{ color: 'var(--color-success)' }}>+ {s}</li>
                            ))}
                            {d.removed.map((s, i) => (
                              <li key={`r${i}`} style={{ color: 'var(--color-danger)', textDecoration: 'line-through' }}>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    )}

                    {outputDiff.recommendations.added.length > 0 && (
                      <div>
                        <strong>New recommendations</strong>
                        <ul style={{ paddingLeft: '18px', margin: '4px 0 0 0' }}>
                          {outputDiff.recommendations.added.map((r, i) => (
                            <li key={i} style={{ color: 'var(--color-success)' }}>
                              + [{r.urgency}] {r.action} ({r.recommendedOwner})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {/* WHY it changed. An explanation rather than an observation —
                    the most valuable panel on this page. */}
                <div style={{
                  padding: '12px', backgroundColor: 'var(--color-primary-light)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-primary)',
                }}>
                  <strong>What changed in the inputs</strong>
                  {inputDiff.length === 0 ? (
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem' }}>
                      No scalar input differences. Any output change came from nested data such as
                      submission or attendance lists rather than a headline metric.
                    </p>
                  ) : (
                    <ul style={{ paddingLeft: '18px', margin: '4px 0 0 0', fontSize: '0.8rem' }}>
                      {inputDiff.map((c) => (
                        <li key={c.key}>
                          <code>{c.key}</code>: {String(c.before)} to <strong>{String(c.after)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RUN HISTORY STRIP */}
          {history.length > 1 && (
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Confidence across runs</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '90px' }}>
                {history.map((h) => {
                  const pct = h.confidenceScore ? Math.round(h.confidenceScore * 100) : 0;
                  const failed = h.status !== 'Succeeded';
                  return (
                    <Link
                      key={h.id}
                      href={`/agent-runs/${h.id}`}
                      title={`${formatDate(h.createdAt)} — ${failed ? h.status : `${pct}% confidence`}`}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        justifyContent: 'flex-end', height: '100%', textDecoration: 'none',
                      }}
                    >
                      <div style={{
                        height: failed ? '100%' : `${Math.max(6, pct)}%`,
                        backgroundColor: failed
                          ? 'var(--color-danger)'
                          : h.id === run.id ? 'var(--color-primary)' : 'var(--color-border)',
                        borderRadius: '3px 3px 0 0',
                        opacity: failed ? 0.35 : 1,
                      }} />
                    </Link>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '8px', marginBottom: 0 }}>
                Oldest to newest; the current run is highlighted. Failed runs are shown faded rather
                than hidden, because a gap in a chart is itself information.
              </p>
            </div>
          )}

          {/* INPUT SNAPSHOT FORM */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>📥 Telemetric Input Data Snapshot</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              The exact database facts injected into the agent prompt environment at the moment of execution.
            </p>
            <pre style={{
              fontSize: '0.75rem',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text-main)',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              overflowX: 'auto',
              maxHeight: '400px',
              fontFamily: 'monospace'
            }}>
              {JSON.stringify(inputs, null, 2)}
            </pre>
          </div>

        </div>

        {/* RIGHT COLUMN: RUN METRICS AND SYNTHESIZED OUTPUTS */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* RUN PROFILE CARD */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>📋 Run Profile</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Status:</span>
                <span className={`badge ${run.status === 'Succeeded' ? 'badge-success' : 'badge-danger'}`}>{run.status}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Confidence Rating:</span>
                <strong>{run.confidenceScore ? Math.round(run.confidenceScore * 100) + '%' : 'N/A'}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Target Entity:</span>
                <code>{run.targetType}:{run.targetId.substring(0, 8)}</code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Initiated By:</span>
                <span>{run.createdByUser?.name || '💻 System Engine'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Timestamp:</span>
                <span>{formatDateTime(run.createdAt)}</span>
              </div>

            </div>
          </div>

          {/* SYNTHESIZED RESULTS */}
          {outputs && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>✨ Synthesized Narrative Summary</h3>
                <p style={{
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  margin: 0,
                  color: 'var(--color-text-main)',
                  backgroundColor: 'var(--color-bg)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--color-success)',
                  fontWeight: 500
                }}>
                  {outputs.summary}
                </p>
              </div>

              {/* Strengths & Concerns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {outputs.strengths?.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--color-success)', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      Identified Strengths
                    </h4>
                    <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--color-text-main)' }}>
                      {outputs.strengths.map((s: string, i: number) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {outputs.concerns?.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--color-danger)', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      Isolated Concerns
                    </h4>
                    <ul style={{ paddingLeft: '16px', fontSize: '0.8rem', color: 'var(--color-text-main)' }}>
                      {outputs.concerns.map((c: string, i: number) => (
                        <li key={i} style={{ marginBottom: '4px' }}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Recommendations */}
              {outputs.recommendations?.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    Actionable Recommendations
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {outputs.recommendations.map((rec: any, i: number) => {
                      const urg = rec.urgency === 'Critical' || rec.urgency === 'High' ? 'badge-danger' : 'badge-warning';
                      return (
                        <div key={i} style={{
                          padding: '10px',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: '#ffffff',
                          fontSize: '0.8rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600 }}>
                            <span>Owner: {rec.recommendedOwner}</span>
                            <span className={`badge ${urg}`} style={{ fontSize: '0.55rem' }}>{rec.urgency}</span>
                          </div>
                          <div style={{ color: 'var(--color-text-main)' }}>{rec.action}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Limitations */}
              {outputs.limitations?.length > 0 && (
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-warning-bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-warning)'
                }}>
                  <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-warning-text)', margin: 0, fontWeight: 700 }}>
                    Self-Reported Data Limitations
                  </h4>
                  <ul style={{ paddingLeft: '14px', fontSize: '0.75rem', color: 'var(--color-text-main)', marginTop: '4px', margin: 0 }}>
                    {outputs.limitations.map((lim: string, i: number) => (
                      <li key={i} style={{ marginBottom: '2px' }}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
