import { toDoctorDetailDto, toDoctorDto, toHospitalDto } from './catalog.mapper.js';
import { doctorRow, hospitalRow } from './testing/catalog.fixtures.js';

describe('catalog mapper', () => {
  it('maps a doctor row to a bilingual DTO with the next slot', () => {
    expect(toDoctorDto(doctorRow())).toEqual({
      id: 'doc_001',
      name: { en: 'Test Doctor', ar: 'طبيب تجريبي' },
      title: { en: 'Consultant Cardiologist', ar: 'استشاري أمراض القلب' },
      specialty: { code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } },
      subspecialty: { en: 'Interventional Cardiology', ar: 'القسطرة القلبية' },
      hospital: {
        id: 'hosp_01',
        name: { en: 'Test Heart Institute', ar: 'معهد القلب التجريبي' },
        city: { en: 'Cairo', ar: 'القاهرة' },
        country: 'EG',
        hasEmergency: true,
      },
      languages: ['ar', 'en'],
      yearsExperience: 18,
      rating: 4.8,
      consultationFeeUsd: 60,
      offersSecondOpinion: true,
      offersTeleconsult: true,
      nextAvailableSlot: {
        startsAt: '2026-10-02T08:00:00.000Z',
        durationMin: 30,
        mode: 'IN_PERSON',
      },
    });
  });

  it('handles no subspecialty and no free slots', () => {
    const dto = toDoctorDto(
      doctorRow({ subspecialtyEn: null, subspecialtyAr: null, availabilitySlots: [] }),
    );
    expect(dto.subspecialty).toBeNull();
    expect(dto.nextAvailableSlot).toBeNull();
  });

  it('includes all upcoming slots in the detail DTO', () => {
    expect(toDoctorDetailDto(doctorRow()).upcomingSlots).toHaveLength(1);
  });

  it('does not leak DB-only fields', () => {
    const dto = toDoctorDto(doctorRow()) as unknown as Record<string, unknown>;
    expect(dto).not.toHaveProperty('specialtyId');
    expect(dto).not.toHaveProperty('hospitalId');
    expect(dto).not.toHaveProperty('availabilitySlots');
  });

  it('maps a hospital with its specialties', () => {
    const dto = toHospitalDto(hospitalRow());
    expect(dto.specialties).toEqual([
      { code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } },
    ]);
    expect(dto).toMatchObject({ emergencyPhone: '+20 000', accreditation: 'JCI', rating: 4.7 });
  });
});
