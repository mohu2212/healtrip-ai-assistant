import type { DoctorRow, HospitalRow, SpecialtyRow } from '../catalog.repository.js';

/** Minimal, typed DB rows for unit/e2e tests that don't hit a database. */

export const cardiologyRow: SpecialtyRow = {
  id: 'spec_cardiology',
  code: 'cardiology',
  nameEn: 'Cardiology',
  nameAr: 'أمراض القلب',
};

export const emergencyRow: SpecialtyRow = {
  id: 'spec_emergency_medicine',
  code: 'emergency_medicine',
  nameEn: 'Emergency Medicine',
  nameAr: 'طب الطوارئ',
};

export function hospitalRow(overrides: Partial<HospitalRow> = {}): HospitalRow {
  return {
    id: 'hosp_01',
    nameEn: 'Test Heart Institute',
    nameAr: 'معهد القلب التجريبي',
    city: 'Cairo',
    cityAr: 'القاهرة',
    country: 'EG',
    hasEmergency: true,
    emergencyPhone: '+20 000',
    phone: '+20 001',
    accreditation: 'JCI',
    rating: 4.7,
    specialties: [
      { hospitalId: 'hosp_01', specialtyId: cardiologyRow.id, specialty: cardiologyRow },
    ],
    ...overrides,
  };
}

export function doctorRow(overrides: Partial<DoctorRow> = {}): DoctorRow {
  const hospital = hospitalRow();
  return {
    id: 'doc_001',
    nameEn: 'Test Doctor',
    nameAr: 'طبيب تجريبي',
    titleEn: 'Consultant Cardiologist',
    titleAr: 'استشاري أمراض القلب',
    specialtyId: cardiologyRow.id,
    subspecialtyEn: 'Interventional Cardiology',
    subspecialtyAr: 'القسطرة القلبية',
    hospitalId: hospital.id,
    languages: ['ar', 'en'],
    yearsExperience: 18,
    rating: 4.8,
    consultationFeeUsd: 60,
    offersSecondOpinion: true,
    offersTeleconsult: true,
    specialty: cardiologyRow,
    hospital: {
      id: hospital.id,
      nameEn: hospital.nameEn,
      nameAr: hospital.nameAr,
      city: hospital.city,
      cityAr: hospital.cityAr,
      country: hospital.country,
      hasEmergency: hospital.hasEmergency,
    },
    availabilitySlots: [
      {
        id: 'slot_doc_001_001',
        doctorId: 'doc_001',
        startsAt: new Date('2026-10-02T08:00:00Z'),
        durationMin: 30,
        mode: 'IN_PERSON',
        isBooked: false,
      },
    ],
    ...overrides,
  };
}
