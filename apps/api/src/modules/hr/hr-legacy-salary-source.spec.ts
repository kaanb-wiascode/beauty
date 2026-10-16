import { HrService } from './hr.service';

describe('HrService legacy salary source protection', () => {
  function service() {
    return new HrService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('does not accept new legacy salary values when no master salary exists', () => {
    const hr = service() as any;
    const values = hr.masterValues(
      {
        grossSalary: 75000,
        salary: 75000,
        salaryType: 'MONTHLY',
      },
      null,
      {
        salary: 50000,
        salaryType: 'MONTHLY',
      },
    );

    expect(values.grossSalary).toBeNull();
    expect(values.salaryType).toBeNull();
  });

  it('preserves an existing legacy master salary without allowing overwrite', () => {
    const hr = service() as any;
    const values = hr.masterValues(
      {
        grossSalary: 90000,
        salaryType: 'HOURLY',
      },
      {
        staffId: 'staff-a',
        employeeNumber: null,
        identityNumber: null,
        dateOfBirth: null,
        personalEmail: null,
        address: null,
        employmentType: null,
        hireDate: null,
        terminationDate: null,
        bankName: null,
        iban: null,
        grossSalary: '42000.50',
        salaryType: 'MONTHLY',
      },
      {},
    );

    expect(values.grossSalary).toBe(42000.5);
    expect(values.salaryType).toBe('MONTHLY');
  });
});
