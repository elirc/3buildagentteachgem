import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime } from '@/shared';
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
