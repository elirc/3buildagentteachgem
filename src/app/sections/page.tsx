import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { recordAuditEvent } from '@/observability/audit';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function SectionsListPage() {
  const activeUser = await getActiveUser();

  // Create section action
  async function createSectionAction(formData: FormData) {
    'use server';
    const activeSession = await getActiveUser();
    const courseId = formData.get('courseId') as string;
    const teacherId = formData.get('teacherId') as string;
    const term = formData.get('term') as string;
    const room = formData.get('room') as string;
    const capacity = Number(formData.get('capacity'));

    const section = await db.classSection.create({
      data: {
        courseId,
        teacherId,
        term,
        room,
        capacity,
        scheduleJSON: JSON.stringify([]),
        status: 'Active',
      },
    });

    await recordAuditEvent({
      actorId: activeSession.id,
      action: 'section.create',
      entityType: 'ClassSection',
      entityId: section.id,
      after: section,
    });

    revalidatePath('/sections');
  }

  // Fetch sections with enrollment tallies
  const sections = await db.classSection.findMany({
    include: {
      course: true,
      teacher: true,
      enrollments: { where: { status: 'Enrolled' } },
    },
    orderBy: { term: 'asc' },
  });

  const courses = await db.course.findMany({ orderBy: { code: 'asc' } });
  const teachers = await db.teacher.findMany({ orderBy: { lastName: 'asc' } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Class Roster Sections
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Monitor daily classroom schedules, room configurations, assigned teacher allocations, and roster enrollment margins.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* SECTIONS LIST GRID */}
        <div style={{ flex: 2 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Class Section</th>
                  <th>Assigned Teacher</th>
                  <th>Schedule Term</th>
                  <th>Room Location</th>
                  <th>Seat Capacity</th>
                  <th>Roster Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => {
                  const filledCount = s.enrollments.length;
                  const isFull = filledCount >= s.capacity;
                  const pct = Math.round((filledCount / s.capacity) * 100);

                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/sections/${s.id}`} style={{ fontWeight: 600 }}>
                          {s.course.title} ({s.course.code})
                        </Link>
                      </td>
                      <td>{s.teacher.firstName} {s.teacher.lastName}</td>
                      <td>{s.term}</td>
                      <td><code>{s.room}</code></td>
                      <td>{filledCount} / {s.capacity} seats ({pct}%)</td>
                      <td>
                        <span className={`badge ${isFull ? 'badge-danger' : 'badge-success'}`}>
                          {isFull ? 'FULL' : 'OPEN'}
                        </span>
                      </td>
                      <td>
                        <Link href={`/sections/${s.id}`} className="btn btn-secondary btn-sm">
                          Gradebook & Attendance
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION CREATION FORM (RBAC restricted) */}
        {['Admin', 'SchoolManager'].includes(activeUser.role) ? (
          <div style={{ flex: 1 }}>
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>➕ Create Class Section</h3>
              <form action={createSectionAction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div className="form-group">
                  <label className="form-label">Syllabus Course</label>
                  <select name="courseId" className="form-control" required>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assigned Educator</label>
                  <select name="teacherId" className="form-control" required>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName} ({t.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Semester / Term</label>
                  <input name="term" className="form-control" placeholder="Fall 2026" defaultValue="Fall 2026" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Classroom Room</label>
                  <input name="room" className="form-control" placeholder="Room 101" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Seat Capacity Limit</label>
                  <input name="capacity" type="number" className="form-control" defaultValue={25} required min={1} max={50} />
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                  Open Section
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ backgroundColor: 'var(--color-bg)', borderStyle: 'dashed' }}>
              <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '8px' }}>🔐 Admin Panel</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                Creating new section records is restricted to administrative staff accounts. Switch your acting user in the header cockpit to <strong>SchoolManager</strong> to access this panel.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
