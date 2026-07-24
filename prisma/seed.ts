import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clean up existing database tables in reverse order of dependencies
  console.log('🧹 Cleaning up database tables...');
  await prisma.auditEvent.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.systemLog.deleteMany();
  await prisma.interventionPlan.deleteMany();
  await prisma.supportNote.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.classSection.deleteMany();
  await prisma.course.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Clean up complete.');

  // 2. Create Users
  console.log('👤 Creating users...');
  
  const userAdmin = await prisma.user.create({
    data: {
      username: 'admin',
      name: 'Arthur Pendragon',
      email: 'admin@academy.edu',
      role: 'Admin',
    },
  });

  const userManager = await prisma.user.create({
    data: {
      username: 'manager',
      name: 'Guinevere Vance',
      email: 'manager@academy.edu',
      role: 'SchoolManager',
    },
  });

  const userAdvisor = await prisma.user.create({
    data: {
      username: 'advisor_clara',
      name: 'Clara Vance',
      email: 'clara.vance@academy.edu',
      role: 'Advisor',
    },
  });

  const userTeacherMarcus = await prisma.user.create({
    data: {
      username: 'teacher_marcus',
      name: 'Marcus Aurelius',
      email: 'marcus.aurelius@academy.edu',
      role: 'Teacher',
    },
  });

  const userTeacherSarah = await prisma.user.create({
    data: {
      username: 'teacher_sarah',
      name: 'Sarah Connor',
      email: 'sarah.connor@academy.edu',
      role: 'Teacher',
    },
  });

  const userStudentMaya = await prisma.user.create({
    data: {
      username: 'student_maya',
      name: 'Maya Johnson',
      email: 'maya.johnson@example.com',
      role: 'Student',
    },
  });

  const userStudentJohn = await prisma.user.create({
    data: {
      username: 'student_john',
      name: 'John Connor',
      email: 'john.connor@example.com',
      role: 'Student',
    },
  });

  const userStudentAlice = await prisma.user.create({
    data: {
      username: 'student_alice',
      name: 'Alice Smith',
      email: 'alice.smith@example.com',
      role: 'Student',
    },
  });

  const userStudentBob = await prisma.user.create({
    data: {
      username: 'student_bob',
      name: 'Bob Jones',
      email: 'bob.jones@example.com',
      role: 'Student',
    },
  });

  const userGuardianLisa = await prisma.user.create({
    data: {
      username: 'guardian_lisa',
      name: 'Lisa Johnson',
      email: 'lisa.johnson@example.com',
      role: 'Parent',
    },
  });

  const userViewer = await prisma.user.create({
    data: {
      username: 'viewer_external',
      name: 'Bob Smith',
      email: 'bob.smith@external.org',
      role: 'Viewer',
    },
  });

  console.log('✅ Created 11 user accounts.');

  // 3. Create Teachers
  console.log('👨‍🏫 Creating teacher profiles...');
  const teacherMarcus = await prisma.teacher.create({
    data: {
      userId: userTeacherMarcus.id,
      firstName: 'Marcus',
      lastName: 'Aurelius',
      email: 'marcus.aurelius@academy.edu',
      department: 'Mathematics',
      employmentStatus: 'Active',
      subjectsJSON: JSON.stringify(['Algebra I', 'Calculus', 'Statistics']),
      officeLocation: 'Room 402, Building A',
    },
  });

  const teacherSarah = await prisma.teacher.create({
    data: {
      userId: userTeacherSarah.id,
      firstName: 'Sarah',
      lastName: 'Connor',
      email: 'sarah.connor@academy.edu',
      department: 'Science',
      employmentStatus: 'Active',
      subjectsJSON: JSON.stringify(['Biology', 'Chemistry', 'English Literature']),
      officeLocation: 'Lab 201, Building B',
    },
  });

  console.log('✅ Created 2 teacher profiles.');

  // 4. Create Students
  console.log('👨‍🎓 Creating student profiles...');
  const studentMaya = await prisma.student.create({
    data: {
      userId: userStudentMaya.id,
      firstName: 'Maya',
      lastName: 'Johnson',
      email: 'maya.johnson@example.com',
      gradeLevel: '9th Grade',
      enrollmentStatus: 'Active',
      studentNumber: 'STU-2026-0001',
      guardianName: 'Lisa Johnson',
      guardianEmail: 'lisa.johnson@example.com',
      advisorId: userAdvisor.id,
    },
  });

  const studentJohn = await prisma.student.create({
    data: {
      userId: userStudentJohn.id,
      firstName: 'John',
      lastName: 'Connor',
      email: 'john.connor@example.com',
      gradeLevel: '9th Grade',
      enrollmentStatus: 'Active',
      studentNumber: 'STU-2026-0002',
      guardianName: 'Sarah Connor',
      guardianEmail: 'sarah.connor@example.com',
      advisorId: userAdvisor.id,
    },
  });

  const studentAlice = await prisma.student.create({
    data: {
      userId: userStudentAlice.id,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice.smith@example.com',
      gradeLevel: '9th Grade',
      enrollmentStatus: 'Active',
      studentNumber: 'STU-2026-0003',
      guardianName: 'Robert Smith',
      guardianEmail: 'robert.smith@example.com',
      advisorId: userAdvisor.id,
    },
  });

  const studentBob = await prisma.student.create({
    data: {
      userId: userStudentBob.id,
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob.jones@example.com',
      gradeLevel: '9th Grade',
      enrollmentStatus: 'Active',
      studentNumber: 'STU-2026-0004',
      guardianName: 'Mary Jones',
      guardianEmail: 'mary.jones@example.com',
      advisorId: userAdvisor.id,
    },
  });

  console.log('✅ Created 4 student profiles.');

  // 5. Create Courses
  console.log('📚 Creating courses...');
  const courseCS = await prisma.course.create({
    data: {
      code: 'CS-101',
      title: 'Intro to Computer Science',
      description: 'Foundations of algorithms and coding concepts.',
      subject: 'Computer Science',
      gradeLevel: '9th Grade',
      creditHours: 1.0,
      status: 'Draft',
    },
  });

  const courseMath = await prisma.course.create({
    data: {
      code: 'MATH-101',
      title: 'Algebra I',
      description: 'Fundamental algebraic systems, equations, and graphing.',
      subject: 'Mathematics',
      gradeLevel: '9th Grade',
      creditHours: 1.0,
      status: 'Active',
    },
  });

  const courseBio = await prisma.course.create({
    data: {
      code: 'BIO-101',
      title: 'Biology',
      description: 'Cell structure, genetics, evolution, and basic biochemistry.',
      subject: 'Science',
      gradeLevel: '9th Grade',
      creditHours: 1.0,
      status: 'Active',
    },
  });

  const courseEng = await prisma.course.create({
    data: {
      code: 'ENG-101',
      title: 'English Literature',
      description: 'Critical analysis of historical literature and written essays.',
      subject: 'English',
      gradeLevel: '9th Grade',
      creditHours: 1.0,
      status: 'Active',
    },
  });

  console.log('✅ Created 4 courses.');

  // 6. Create Class Sections
  console.log('🏫 Creating class sections...');
  const sectionMath = await prisma.classSection.create({
    data: {
      courseId: courseMath.id,
      teacherId: teacherMarcus.id,
      term: 'Fall 2026',
      room: 'Room 301',
      scheduleJSON: JSON.stringify([
        { day: 'Monday', time: '10:00-11:30' },
        { day: 'Wednesday', time: '10:00-11:30' },
      ]),
      capacity: 20,
      status: 'Active',
    },
  });

  const sectionBio = await prisma.classSection.create({
    data: {
      courseId: courseBio.id,
      teacherId: teacherSarah.id,
      term: 'Fall 2026',
      room: 'Lab 102',
      scheduleJSON: JSON.stringify([
        { day: 'Tuesday', time: '09:00-10:30' },
        { day: 'Thursday', time: '09:00-10:30' },
      ]),
      capacity: 20,
      status: 'Active',
    },
  });

  const sectionEng = await prisma.classSection.create({
    data: {
      courseId: courseEng.id,
      teacherId: teacherSarah.id,
      term: 'Fall 2026',
      room: 'Room 105',
      scheduleJSON: JSON.stringify([
        { day: 'Monday', time: '13:00-14:30' },
        { day: 'Wednesday', time: '13:00-14:30' },
      ]),
      capacity: 20,
      status: 'Active',
    },
  });

  console.log('✅ Created 3 active class sections.');

  // 7. Create Enrollments
  console.log('📝 Enrolling students in class sections...');
  
  // Maya is enrolled in Algebra I, Biology, and English
  await prisma.enrollment.create({
    data: { studentId: studentMaya.id, classSectionId: sectionMath.id, status: 'Enrolled' },
  });
  await prisma.enrollment.create({
    data: { studentId: studentMaya.id, classSectionId: sectionBio.id, status: 'Enrolled' },
  });
  await prisma.enrollment.create({
    data: { studentId: studentMaya.id, classSectionId: sectionEng.id, status: 'Enrolled' },
  });

  // John is enrolled in Algebra I and Biology
  await prisma.enrollment.create({
    data: { studentId: studentJohn.id, classSectionId: sectionMath.id, status: 'Enrolled' },
  });
  await prisma.enrollment.create({
    data: { studentId: studentJohn.id, classSectionId: sectionBio.id, status: 'Enrolled' },
  });

  // Alice is enrolled in Algebra I
  await prisma.enrollment.create({
    data: { studentId: studentAlice.id, classSectionId: sectionMath.id, status: 'Enrolled' },
  });

  // Bob is enrolled in Algebra I
  await prisma.enrollment.create({
    data: { studentId: studentBob.id, classSectionId: sectionMath.id, status: 'Enrolled' },
  });

  console.log('✅ Rosters populated.');

  // 8. Create Assignments
  console.log('📋 Creating assignments...');
  
  // Algebra assignments
  const algHW1 = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Homework 1: Solving Linear Equations',
      description: 'Solve the exercises 1-10 on page 42 of the textbook.',
      type: 'Homework',
      status: 'Published',
      dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      pointsPossible: 100,
      createdById: userTeacherMarcus.id,
    },
  });

  const algQuiz1 = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Quiz 1: Variables and Functions',
      description: 'A brief assessment covering variable notation and functional models.',
      type: 'Quiz',
      status: 'Published',
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      pointsPossible: 100,
      createdById: userTeacherMarcus.id,
    },
  });

  const algHW2 = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Homework 2: Systems of Linear Equations',
      description: 'Exercises on graphical and substitution solutions to systems.',
      type: 'Homework',
      status: 'Published',
      dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      pointsPossible: 100,
      createdById: userTeacherMarcus.id,
    },
  });

  const algHW3 = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Homework 3: Quadratic Formulas',
      description: 'Apply the quadratic formula to solve polynomials 1-15.',
      type: 'Homework',
      status: 'Published',
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      pointsPossible: 100,
      createdById: userTeacherMarcus.id,
    },
  });

  const algHW4 = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Homework 4: Graphing Parabolas',
      description: 'Plot vertices and determine axis of symmetry for 5 quadratic equations.',
      type: 'Homework',
      status: 'Published',
      dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      pointsPossible: 100,
      createdById: userTeacherMarcus.id,
    },
  });

  const algHW5 = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Homework 5: Linear Inequalities',
      description: 'Solve inequalities and shade solution regions on Cartesian maps.',
      type: 'Homework',
      status: 'Published',
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      pointsPossible: 100,
      createdById: userTeacherMarcus.id,
    },
  });

  const algProject = await prisma.assignment.create({
    data: {
      classSectionId: sectionMath.id,
      title: 'Algebra Midterm Project: Real-world Mathematical Modeling',
      description: 'Design a system representing small-business revenues using linear functions.',
      type: 'Project',
      status: 'Published',
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days in the future
      pointsPossible: 200,
      createdById: userTeacherMarcus.id,
    },
  });

  // Biology assignments
  const bioLab1 = await prisma.assignment.create({
    data: {
      classSectionId: sectionBio.id,
      title: 'Biology Lab 1: Microscope Usage and Cell Mitosis',
      description: 'Observe onion root cells under microscope and sketch mitosis phases.',
      type: 'Lab',
      status: 'Published',
      dueDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), // 12 days ago
      pointsPossible: 100,
      createdById: userTeacherSarah.id,
    },
  });

  const bioQuiz1 = await prisma.assignment.create({
    data: {
      classSectionId: sectionBio.id,
      title: 'Biology Quiz 1: DNA Replication Structures',
      description: 'A quiz covering double-helix structures and nucleotide pairings.',
      type: 'Quiz',
      status: 'Published',
      dueDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      pointsPossible: 100,
      createdById: userTeacherSarah.id,
    },
  });

  const bioExam1 = await prisma.assignment.create({
    data: {
      classSectionId: sectionBio.id,
      title: 'Biology Exam 1: Introductory Biochemistry & Cells',
      description: 'Written exam covering amino acids, cell membranes, and active transport.',
      type: 'Exam',
      status: 'Published',
      dueDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      pointsPossible: 150,
      createdById: userTeacherSarah.id,
    },
  });

  console.log('✅ Created 10 assignments.');

  // 9. Create Submissions
  console.log('📝 Creating submissions...');

  // --- MAYA'S SUBMISSIONS (The core scenario) ---
  // Math: 2 low grades, 4 missing
  await prisma.submission.create({
    data: {
      assignmentId: algHW1.id,
      studentId: studentMaya.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      contentText: 'Answers to equations 1 to 10: 1. x=4, 2. x=-2, 3. y=9, 4. z=0.5... (incomplete work details)',
      score: 60.0,
      feedback: 'You solved equations 1 to 5 correctly, but skipped exercises 6 to 10 entirely. Please show your full algebraic operations.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: algQuiz1.id,
      studentId: studentMaya.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      contentText: 'Variables quiz answers submitted.',
      score: 55.0,
      feedback: 'Struggled with functional notation. Review independent versus dependent variables.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    },
  });

  // Missing homeworks
  await prisma.submission.create({
    data: { assignmentId: algHW2.id, studentId: studentMaya.id, status: 'Missing' },
  });
  await prisma.submission.create({
    data: { assignmentId: algHW3.id, studentId: studentMaya.id, status: 'Missing' },
  });
  await prisma.submission.create({
    data: { assignmentId: algHW4.id, studentId: studentMaya.id, status: 'Missing' },
  });
  await prisma.submission.create({
    data: { assignmentId: algHW5.id, studentId: studentMaya.id, status: 'Missing' },
  });

  // Bio: 3 Excellent grades
  await prisma.submission.create({
    data: {
      assignmentId: bioLab1.id,
      studentId: studentMaya.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      contentText: 'Mitosis observation report with sketches of anaphase and telophase.',
      score: 85.0,
      feedback: 'Very nice drawings and high-quality analysis of microscope imagery!',
      gradedById: userTeacherSarah.id,
      gradedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: bioQuiz1.id,
      studentId: studentMaya.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      contentText: 'DNA structures quiz answers.',
      score: 92.0,
      feedback: 'Outstanding understanding of base pairs and hydrogen bonds.',
      gradedById: userTeacherSarah.id,
      gradedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: bioExam1.id,
      studentId: studentMaya.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      contentText: 'Biochemistry written examination.',
      score: 142.5, // 95% of 150
      feedback: 'Excellent work, Maya. Your cell membrane explanation was exceptionally clear.',
      gradedById: userTeacherSarah.id,
      gradedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // --- JOHN CONNOR'S SUBMISSIONS (Good performance, late/backlog demo) ---
  await prisma.submission.create({
    data: {
      assignmentId: algHW1.id,
      studentId: studentJohn.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      contentText: 'John Connor Homework 1',
      score: 95.0,
      feedback: 'Superb operations.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    },
  });
  
  await prisma.submission.create({
    data: {
      assignmentId: algQuiz1.id,
      studentId: studentJohn.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      contentText: 'John Connor Quiz 1',
      score: 90.0,
      feedback: 'Very solid.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: algHW2.id,
      studentId: studentJohn.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      contentText: 'John Connor Homework 2',
      score: 88.0,
      feedback: 'Well done.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: algHW3.id,
      studentId: studentJohn.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      score: 85.0,
      feedback: 'Passed.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: algHW4.id,
      studentId: studentJohn.id,
      status: 'Graded',
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      score: 92.0,
      feedback: 'Passed.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  // John's HW5 is submitted, but UNGRADED (creates part of Marcus's backlog)
  await prisma.submission.create({
    data: {
      assignmentId: algHW5.id,
      studentId: studentJohn.id,
      status: 'Submitted',
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      contentText: 'John Connor Homework 5: Linear Inequalities. Shading finished on graph paper.',
    },
  });

  // --- GRADED BACKLOG SEEDING (Other students in Marcus's Algebra class) ---
  // Alice HW2 - Graded
  await prisma.submission.create({
    data: {
      assignmentId: algHW2.id,
      studentId: studentAlice.id,
      status: 'Graded',
      score: 82.0,
      feedback: 'Solid graph lines.',
      gradedById: userTeacherMarcus.id,
      gradedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Bob HW2 - Submitted but UNGRADED
  await prisma.submission.create({
    data: {
      assignmentId: algHW2.id,
      studentId: studentBob.id,
      status: 'Submitted',
      submittedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      contentText: 'Bob Jones Homework 2 submission.',
    },
  });

  // Alice HW5 - Submitted but UNGRADED
  await prisma.submission.create({
    data: {
      assignmentId: algHW5.id,
      studentId: studentAlice.id,
      status: 'Submitted',
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      contentText: 'Alice Smith Homework 5.',
    },
  });

  // Bob HW5 - Submitted but UNGRADED
  await prisma.submission.create({
    data: {
      assignmentId: algHW5.id,
      studentId: studentBob.id,
      status: 'Submitted',
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      contentText: 'Bob Jones Homework 5.',
    },
  });

  // Alice and Bob HW3 / HW4 are missing (for realism)
  await prisma.submission.create({
    data: { assignmentId: algHW3.id, studentId: studentAlice.id, status: 'Missing' },
  });
  await prisma.submission.create({
    data: { assignmentId: algHW4.id, studentId: studentAlice.id, status: 'Missing' },
  });
  await prisma.submission.create({
    data: { assignmentId: algHW3.id, studentId: studentBob.id, status: 'Missing' },
  });
  await prisma.submission.create({
    data: { assignmentId: algHW4.id, studentId: studentBob.id, status: 'Missing' },
  });

  console.log('✅ Created submissions and grading backlog.');

  // 10. Create Attendance Records
  console.log('📅 Recording attendance records...');
  const baseDate = new Date();
  
  // Maya's Algebra absences (5 absences, 3 presents)
  const mathDates = [
    { daysAgo: 14, status: 'Present' },
    { daysAgo: 12, status: 'Present' },
    { daysAgo: 10, status: 'Absent', notes: 'No notification received' },
    { daysAgo: 8, status: 'Absent', notes: 'Guardian reported illness' },
    { daysAgo: 6, status: 'Absent', notes: 'No notification' },
    { daysAgo: 4, status: 'Absent', notes: 'No notification' },
    { daysAgo: 2, status: 'Absent', notes: 'Missed morning transport' },
    { daysAgo: 0, status: 'Present' },
  ];

  for (const record of mathDates) {
    await prisma.attendance.create({
      data: {
        studentId: studentMaya.id,
        classSectionId: sectionMath.id,
        date: new Date(baseDate.getTime() - record.daysAgo * 24 * 60 * 60 * 1000),
        status: record.status,
        notes: record.notes,
        recordedById: userTeacherMarcus.id,
      },
    });
  }

  // Maya's Bio attendance (1 tardy, 7 presents)
  const bioDates = [
    { daysAgo: 13, status: 'Present' },
    { daysAgo: 11, status: 'Present' },
    { daysAgo: 9, status: 'Present' },
    { daysAgo: 7, status: 'Present' },
    { daysAgo: 5, status: 'Tardy', notes: 'Arrived 15 mins late due to traffic' },
    { daysAgo: 3, status: 'Present' },
    { daysAgo: 1, status: 'Present' },
  ];

  for (const record of bioDates) {
    await prisma.attendance.create({
      data: {
        studentId: studentMaya.id,
        classSectionId: sectionBio.id,
        date: new Date(baseDate.getTime() - record.daysAgo * 24 * 60 * 60 * 1000),
        status: record.status,
        notes: record.notes,
        recordedById: userTeacherSarah.id,
      },
    });
  }

  // John Connor's perfect attendance
  for (let i = 0; i < 8; i++) {
    await prisma.attendance.create({
      data: {
        studentId: studentJohn.id,
        classSectionId: sectionMath.id,
        date: new Date(baseDate.getTime() - i * 2 * 24 * 60 * 60 * 1000),
        status: 'Present',
        recordedById: userTeacherMarcus.id,
      },
    });
  }

  console.log('✅ Seeded class section attendance logs.');

  // 11. Create Support Notes
  console.log('📝 Seeding support notes (RBAC demo)...');
  
  await prisma.supportNote.create({
    data: {
      studentId: studentMaya.id,
      authorId: userTeacherSarah.id,
      visibility: 'Shared',
      noteType: 'Academic',
      content: 'Maya is showing exceptional interest in Biology and asks highly insightful questions during lab sessions. Her understanding of genetics has improved significantly, as shown in her 95% exam score.',
    },
  });

  await prisma.supportNote.create({
    data: {
      studentId: studentMaya.id,
      authorId: userTeacherMarcus.id,
      visibility: 'TeacherOnly',
      noteType: 'Attendance',
      content: 'Maya has missed several Algebra classes consecutively. I reached out to her by email but have not heard back yet. Her homework grades are dropping rapidly due to missing work.',
    },
  });

  await prisma.supportNote.create({
    data: {
      studentId: studentMaya.id,
      authorId: userAdvisor.id,
      visibility: 'AdvisorOnly',
      noteType: 'FamilyCommunication',
      content: 'Spoke with Maya\'s guardian Lisa Johnson regarding her recent absences and low Algebra performance. Lisa mentioned that Maya has been having trouble keeping up with the early morning schedule but promised to help support her at home and check on her homework daily.',
    },
  });

  console.log('✅ Created 3 support notes.');

  // 12. Create Support Intervention Plans
  console.log('🩹 Seeding intervention plans...');
  await prisma.interventionPlan.create({
    data: {
      studentId: studentMaya.id,
      createdById: userAdvisor.id,
      status: 'Active',
      riskArea: 'Grades',
      summary: 'Algebra Academic Support and Tutoring Plan',
      recommendedActions: '1. Enroll in weekly Algebra after-school tutoring on Wednesdays.\n2. Meet with academic advisor Clara Vance every Friday afternoon for check-in.\n3. Guardian Lisa Johnson will check homework completion daily in the evening.',
      followUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Active Intervention Plan created for Maya.');

  // 13. Create Background Jobs
  console.log('⚙️ Seeding background job logs...');
  
  await prisma.backgroundJob.create({
    data: {
      type: 'GuardianDigest',
      status: 'Succeeded',
      attempts: 1,
      maxAttempts: 3,
      payloadJSON: JSON.stringify({ studentId: studentMaya.id }),
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 4000),
    },
  });

  // The requested failed background job
  const failedJob = await prisma.backgroundJob.create({
    data: {
      type: 'AttendanceSummary',
      status: 'Failed',
      attempts: 1,
      maxAttempts: 3,
      payloadJSON: JSON.stringify({ sectionId: 'some-invalid-id', runDate: null }),
      errorMessage: "TypeError: Cannot read properties of null (reading 'toISOString') at attendanceSummaryJob (C:\\packages\\jobs\\attendance.ts:42:25)",
      startedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000 + 500),
      classSectionId: sectionMath.id,
    },
  });

  await prisma.backgroundJob.create({
    data: {
      type: 'GradeRecalculation',
      status: 'Queued',
      attempts: 0,
      maxAttempts: 3,
      payloadJSON: JSON.stringify({ sectionId: sectionMath.id }),
      classSectionId: sectionMath.id,
    },
  });

  console.log('✅ Seeded background jobs.');

  // 14. Create SystemLogs
  console.log('📝 Seeding structured system logs...');
  const logs = [
    {
      level: 'info',
      service: 'EnrollmentService',
      message: 'Student Maya Johnson enrolled in ClassSection MATH-101 (Algebra I)',
      fingerprint: 'student_enrolled_math',
      metadataJSON: JSON.stringify({ studentId: studentMaya.id, sectionId: sectionMath.id }),
    },
    {
      level: 'info',
      service: 'AssignmentService',
      message: 'Assignment "Algebra Homework 5: Linear Inequalities" published for Section MATH-101',
      fingerprint: 'assignment_published_hw5',
      metadataJSON: JSON.stringify({ assignmentId: algHW5.id }),
    },
    {
      level: 'warn',
      service: 'GradeService',
      message: 'Grade calculation warning: Student student_maya has 4 missing assignments in MATH-101',
      fingerprint: 'missing_assignments_warning',
      metadataJSON: JSON.stringify({ studentId: studentMaya.id, sectionId: sectionMath.id, missingCount: 4 }),
    },
    {
      level: 'error',
      service: 'NotificationService',
      message: 'Failed to send guardian digest email to lisa.johnson@example.com: Connection timeout after 5000ms',
      fingerprint: 'guardian_email_timeout',
      metadataJSON: JSON.stringify({ guardianEmail: 'lisa.johnson@example.com', studentId: studentMaya.id }),
    },
    {
      level: 'error',
      service: 'BackgroundJobRunner',
      message: `Job ${failedJob.id} failed: AttendanceSummary execution error`,
      fingerprint: 'attendance_summary_err',
      metadataJSON: JSON.stringify({ jobId: failedJob.id, error: "Cannot read properties of null (reading 'toISOString')" }),
    },
  ];

  for (const log of logs) {
    await prisma.systemLog.create({
      data: {
        level: log.level,
        service: log.service,
        message: log.message,
        environment: 'development',
        fingerprint: log.fingerprint,
        metadataJSON: log.metadataJSON,
        requestId: 'req-' + Math.random().toString(36).substring(7),
      },
    });
  }

  console.log('✅ System logs seeded.');

  // 15. Create Audit Events
  console.log('🔐 Seeding transactional audit events...');
  
  await prisma.auditEvent.create({
    data: {
      actorId: userTeacherMarcus.id,
      action: 'assignment.publish',
      entityType: 'Assignment',
      entityId: algHW5.id,
      afterJSON: JSON.stringify({
        id: algHW5.id,
        title: 'Algebra Homework 5: Linear Inequalities',
        status: 'Published',
        pointsPossible: 100,
      }),
      metadataJSON: JSON.stringify({ ip: '192.168.1.120', browser: 'Chrome/Windows' }),
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorId: userAdvisor.id,
      action: 'intervention.create',
      entityType: 'InterventionPlan',
      entityId: 'intervention-plan-1',
      afterJSON: JSON.stringify({
        studentId: studentMaya.id,
        status: 'Active',
        riskArea: 'Grades',
        summary: 'Algebra Academic Support and Tutoring Plan',
      }),
    },
  });

  console.log('✅ Audit logs seeded.');

  console.log('✨ Seed database completed successfully! 🎉');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
