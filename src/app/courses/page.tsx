import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { canPerformAction, lockMessage } from '@/shared';
import { recordAuditEvent } from '@/observability/audit';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function CoursesListPage() {
  const activeUser = await getActiveUser();

  // Create new course
  async function createCourseAction(formData: FormData) {
    'use server';
    const activeSession = await getActiveUser();
    const code = formData.get('code') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const credits = Number(formData.get('credits'));

    const course = await db.course.create({
      data: {
        code,
        title,
        description,
        subject: 'General',
        gradeLevel: 'High School',
        creditHours: credits,
        status: 'Active',
      },
    });

    await recordAuditEvent({
      actorId: activeSession.id,
      action: 'course.create',
      entityType: 'Course',
      entityId: course.id,
      after: course,
    });

    revalidatePath('/courses');
  }

  const courses = await db.course.findMany({
    orderBy: { code: 'asc' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Course Catalog
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Browse official catalog listings, syllabus descriptions, credit valuations, and register future curriculum items.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* COURSES LIST TABLE */}
        <div style={{ flex: 2 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Title</th>
                  <th>Syllabus Description</th>
                  <th>Credit Units</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.code}</code></td>
                    <td style={{ fontWeight: 600 }}>{c.title}</td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{c.description}</td>
                    <td>{c.creditHours} Credits</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* REGISTRATION FORM PANEL (RBAC Restricted) */}
        {canPerformAction(activeUser.role, 'course.create') ? (
          <div style={{ flex: 1 }}>
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>➕ Create Course Syllabus</h3>
              <form action={createCourseAction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div className="form-group">
                  <label className="form-label">Course Code</label>
                  <input name="code" className="form-control" placeholder="MATH-102" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Course Title</label>
                  <input name="title" className="form-control" placeholder="Geometry & Trigonometry" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Credit Units</label>
                  <input name="credits" type="number" className="form-control" placeholder="3" defaultValue={3} required min={1} max={5} />
                </div>

                <div className="form-group">
                  <label className="form-label">Syllabus Description</label>
                  <textarea name="description" className="form-control" placeholder="Course outline and primary learning goals..." rows={4} required style={{ resize: 'none' }} />
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                  Register Course
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ backgroundColor: 'var(--color-bg)', borderStyle: 'dashed' }}>
              <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '8px' }}>🔐 Admin Panel</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                Syllabus additions are restricted to administration roles. Switch your active acting account to <strong>SchoolManager</strong> in the header select box.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
