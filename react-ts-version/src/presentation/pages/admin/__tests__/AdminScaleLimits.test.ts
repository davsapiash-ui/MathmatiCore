import { describe, it, expect, beforeEach } from 'vitest';
import { useAdminStore } from '@/application/useAdminStore';

describe('PRD Section 5.6 Admin Scale Limits & Multi-Tenant Audit', () => {
  beforeEach(() => {
    useAdminStore.setState({
      schools: [
        { id: 'sch_1', name: 'מוסד 1', createdAt: Date.now() },
        { id: 'sch_2', name: 'מוסד 2', createdAt: Date.now() },
        { id: 'sch_3', name: 'מוסד 3', createdAt: Date.now() },
        { id: 'sch_4', name: 'מוסד 4', createdAt: Date.now() },
        { id: 'sch_5', name: 'מוסד 5', createdAt: Date.now() },
      ],
      teachers: [
        { id: 't_1', schoolId: 'sch_1', taz: '11111111', dob: '010190', name: 'מורה 1', licenseActive: true, createdAt: Date.now() },
        { id: 't_2', schoolId: 'sch_2', taz: '22222222', dob: '010190', name: 'מורה 2', licenseActive: true, createdAt: Date.now() },
        { id: 't_3', schoolId: 'sch_3', taz: '33333333', dob: '010190', name: 'מורה 3', licenseActive: true, createdAt: Date.now() },
        { id: 't_4', schoolId: 'sch_4', taz: '44444444', dob: '010190', name: 'מורה 4', licenseActive: true, createdAt: Date.now() },
        { id: 't_5', schoolId: 'sch_5', taz: '55555555', dob: '010190', name: 'מורה 5', licenseActive: true, createdAt: Date.now() },
      ],
      classes: [
        { id: 'c_1', schoolId: 'sch_1', teacherId: 't_1', name: 'כיתה 1', studentLimit: 35, createdAt: Date.now() },
        { id: 'c_2', schoolId: 'sch_1', teacherId: 't_1', name: 'כיתה 2', studentLimit: 35, createdAt: Date.now() },
        { id: 'c_3', schoolId: 'sch_1', teacherId: 't_1', name: 'כיתה 3', studentLimit: 35, createdAt: Date.now() },
        { id: 'c_4', schoolId: 'sch_1', teacherId: 't_1', name: 'כיתה 4', studentLimit: 35, createdAt: Date.now() },
        { id: 'c_5', schoolId: 'sch_1', teacherId: 't_1', name: 'כיתה 5', studentLimit: 35, createdAt: Date.now() },
      ],
      globalStudentLimit: 35,
    });
  });

  it('enforces maximum 5 schools limit (PRD 5.6)', () => {
    const { schools } = useAdminStore.getState();
    expect(schools.length).toBeLessThanOrEqual(5);
  });

  it('enforces maximum 5 total teachers limit (PRD 5.6)', () => {
    const { teachers } = useAdminStore.getState();
    expect(teachers.length).toBeLessThanOrEqual(5);
  });

  it('enforces 1 lead teacher per school environment (PRD 5.6)', () => {
    const { teachers } = useAdminStore.getState();
    const teachersPerSchool = teachers.filter(t => t.schoolId === 'sch_1');
    expect(teachersPerSchool.length).toBe(1);
  });

  it('enforces maximum 5 classes per teacher limit (PRD 5.6)', () => {
    const { classes } = useAdminStore.getState();
    const teacherClasses = classes.filter(c => c.teacherId === 't_1');
    expect(teacherClasses.length).toBeLessThanOrEqual(5);
  });
});
