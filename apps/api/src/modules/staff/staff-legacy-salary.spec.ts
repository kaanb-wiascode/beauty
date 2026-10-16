import { createStaffSchema } from './dto/create-staff.dto';
import { updateStaffSchema } from './dto/update-staff.dto';

describe('Staff legacy salary profile fields', () => {
  it('strips legacy salary fields from create payloads', () => {
    const parsed = createStaffSchema.parse({
      firstName: 'Test',
      lastName: 'Çalışan',
      profile: {
        bankName: 'Banka',
        iban: 'TR000000000000000000000000',
        salaryType: 'Aylık',
        salary: 50000,
      },
    });

    expect(parsed.profile).toEqual({
      bankName: 'Banka',
      iban: 'TR000000000000000000000000',
    });
  });

  it('strips legacy salary fields from update payloads', () => {
    const parsed = updateStaffSchema.parse({
      profile: {
        bankName: 'Yeni Banka',
        salaryType: 'Saatlik',
        salary: 250,
      },
    });

    expect(parsed.profile).toEqual({
      bankName: 'Yeni Banka',
    });
  });
});
