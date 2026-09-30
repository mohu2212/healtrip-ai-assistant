/**
 * Mock catalog for the prototype.
 *
 * ⚠️ All hospitals, doctors, phone numbers and ratings are FICTIONAL and exist only to demo the
 * assistant. Any resemblance to real people or institutions is coincidental.
 *
 * This module is pure data (no DB access) so tests can import it. Types come from the generated
 * Prisma client, so a schema change that breaks the seed fails at compile time.
 */
import type { Prisma } from '../src/generated/prisma/client.js';

export const SPECIALTY_CODES = [
  'cardiology',
  'emergency_medicine',
  'internal_medicine',
  'pulmonology',
  'gastroenterology',
  'orthopedics',
  'neurology',
  'oncology',
] as const;
export type SpecialtyCode = (typeof SPECIALTY_CODES)[number];

export const specialtyId = (code: SpecialtyCode) => `spec_${code}`;

const SPECIALTY_NAMES: Record<SpecialtyCode, { en: string; ar: string }> = {
  cardiology: { en: 'Cardiology', ar: 'أمراض القلب' },
  emergency_medicine: { en: 'Emergency Medicine', ar: 'طب الطوارئ' },
  internal_medicine: { en: 'Internal Medicine', ar: 'الباطنة العامة' },
  pulmonology: { en: 'Pulmonology', ar: 'الأمراض الصدرية' },
  gastroenterology: { en: 'Gastroenterology', ar: 'الجهاز الهضمي والكبد' },
  orthopedics: { en: 'Orthopedics', ar: 'جراحة العظام' },
  neurology: { en: 'Neurology', ar: 'المخ والأعصاب' },
  oncology: { en: 'Oncology', ar: 'الأورام' },
};

export const specialties: Prisma.SpecialtyCreateManyInput[] = SPECIALTY_CODES.map((code) => ({
  id: specialtyId(code),
  code,
  nameEn: SPECIALTY_NAMES[code].en,
  nameAr: SPECIALTY_NAMES[code].ar,
}));

// ─────────────────────────────── Hospitals ───────────────────────────────

type HospitalSeed = Prisma.HospitalCreateManyInput & { specialtyCodes: SpecialtyCode[] };

const hospitalSeeds: HospitalSeed[] = [
  {
    id: 'hosp_01',
    nameEn: 'Nile Heart & Vascular Institute',
    nameAr: 'معهد النيل للقلب والأوعية الدموية',
    city: 'Cairo',
    cityAr: 'القاهرة',
    country: 'EG',
    hasEmergency: true,
    emergencyPhone: '+20 2 5550 0100',
    phone: '+20 2 5550 0101',
    accreditation: 'JCI',
    rating: 4.7,
    specialtyCodes: ['cardiology', 'emergency_medicine', 'internal_medicine', 'pulmonology'],
  },
  {
    id: 'hosp_02',
    nameEn: 'Cairo Care General Hospital',
    nameAr: 'مستشفى القاهرة كير العام',
    city: 'Cairo',
    cityAr: 'القاهرة',
    country: 'EG',
    hasEmergency: true,
    emergencyPhone: '+20 2 5550 0200',
    phone: '+20 2 5550 0201',
    accreditation: null,
    rating: 4.3,
    specialtyCodes: [
      'cardiology',
      'emergency_medicine',
      'internal_medicine',
      'gastroenterology',
      'orthopedics',
      'neurology',
    ],
  },
  {
    id: 'hosp_03',
    nameEn: 'Bosphorus Medical Center',
    nameAr: 'مركز البوسفور الطبي',
    city: 'Istanbul',
    cityAr: 'إسطنبول',
    country: 'TR',
    hasEmergency: true,
    emergencyPhone: '+90 212 555 0300',
    phone: '+90 212 555 0301',
    accreditation: 'JCI',
    rating: 4.8,
    specialtyCodes: ['cardiology', 'emergency_medicine', 'neurology', 'orthopedics', 'oncology'],
  },
  {
    id: 'hosp_04',
    nameEn: 'Anatolia Specialist Clinic',
    nameAr: 'عيادة الأناضول التخصصية',
    city: 'Istanbul',
    cityAr: 'إسطنبول',
    country: 'TR',
    hasEmergency: false,
    emergencyPhone: null,
    phone: '+90 216 555 0401',
    accreditation: null,
    rating: 4.5,
    specialtyCodes: ['cardiology', 'oncology', 'gastroenterology'],
  },
  {
    id: 'hosp_05',
    nameEn: 'Gulf Specialist Hospital',
    nameAr: 'مستشفى الخليج التخصصي',
    city: 'Dubai',
    cityAr: 'دبي',
    country: 'AE',
    hasEmergency: true,
    emergencyPhone: '+971 4 555 0500',
    phone: '+971 4 555 0501',
    accreditation: 'JCI',
    rating: 4.6,
    specialtyCodes: [
      'cardiology',
      'emergency_medicine',
      'internal_medicine',
      'pulmonology',
      'orthopedics',
      'neurology',
    ],
  },
  {
    id: 'hosp_06',
    nameEn: 'Marina Heart & Wellness Clinic',
    nameAr: 'عيادة مارينا للقلب والعافية',
    city: 'Dubai',
    cityAr: 'دبي',
    country: 'AE',
    hasEmergency: false,
    emergencyPhone: null,
    phone: '+971 4 555 0601',
    accreditation: null,
    rating: 4.4,
    specialtyCodes: ['cardiology', 'internal_medicine', 'gastroenterology'],
  },
];

export const hospitals: Prisma.HospitalCreateManyInput[] = hospitalSeeds.map(
  ({ specialtyCodes: _codes, ...hospital }) => hospital,
);

export const hospitalSpecialties: Prisma.HospitalSpecialtyCreateManyInput[] = hospitalSeeds.flatMap(
  (h) => h.specialtyCodes.map((code) => ({ hospitalId: h.id, specialtyId: specialtyId(code) })),
);

// ─────────────────────────────── Doctors ───────────────────────────────

type DoctorSeed = Omit<Prisma.DoctorCreateManyInput, 'specialtyId'> & {
  specialtyCode: SpecialtyCode;
};

const doctorSeeds: DoctorSeed[] = [
  // Cairo — Nile Heart & Vascular Institute
  {
    id: 'doc_001',
    nameEn: 'Ahmed Mansour',
    nameAr: 'أحمد منصور',
    titleEn: 'Consultant Cardiologist',
    titleAr: 'استشاري أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Interventional Cardiology',
    subspecialtyAr: 'القسطرة القلبية التداخلية',
    hospitalId: 'hosp_01',
    languages: ['ar', 'en'],
    yearsExperience: 18,
    rating: 4.8,
    consultationFeeUsd: 60,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  {
    id: 'doc_002',
    nameEn: 'Mona El-Sayed',
    nameAr: 'منى السيد',
    titleEn: 'Consultant Cardiologist',
    titleAr: 'استشارية أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Cardiac Imaging',
    subspecialtyAr: 'تصوير القلب',
    hospitalId: 'hosp_01',
    languages: ['ar', 'en', 'fr'],
    yearsExperience: 14,
    rating: 4.7,
    consultationFeeUsd: 55,
    offersSecondOpinion: true,
    offersTeleconsult: false,
  },
  {
    id: 'doc_003',
    nameEn: 'Karim Fawzy',
    nameAr: 'كريم فوزي',
    titleEn: 'Emergency Medicine Consultant',
    titleAr: 'استشاري طب الطوارئ',
    specialtyCode: 'emergency_medicine',
    subspecialtyEn: null,
    subspecialtyAr: null,
    hospitalId: 'hosp_01',
    languages: ['ar', 'en'],
    yearsExperience: 12,
    rating: 4.6,
    consultationFeeUsd: 40,
    offersSecondOpinion: false,
    offersTeleconsult: false,
  },
  {
    id: 'doc_004',
    nameEn: 'Hoda Ramzy',
    nameAr: 'هدى رمزي',
    titleEn: 'Consultant Pulmonologist',
    titleAr: 'استشارية الأمراض الصدرية',
    specialtyCode: 'pulmonology',
    subspecialtyEn: null,
    subspecialtyAr: null,
    hospitalId: 'hosp_01',
    languages: ['ar', 'en'],
    yearsExperience: 13,
    rating: 4.5,
    consultationFeeUsd: 45,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  // Cairo — Cairo Care General Hospital
  {
    id: 'doc_005',
    nameEn: 'Hany Adel',
    nameAr: 'هاني عادل',
    titleEn: 'Specialist Cardiologist',
    titleAr: 'أخصائي أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Electrophysiology',
    subspecialtyAr: 'كهرباء القلب',
    hospitalId: 'hosp_02',
    languages: ['ar'],
    yearsExperience: 9,
    rating: 4.3,
    consultationFeeUsd: 30,
    offersSecondOpinion: false,
    offersTeleconsult: true,
  },
  {
    id: 'doc_006',
    nameEn: 'Salma Hassan',
    nameAr: 'سلمى حسن',
    titleEn: 'Consultant Internal Medicine',
    titleAr: 'استشارية الباطنة العامة',
    specialtyCode: 'internal_medicine',
    subspecialtyEn: null,
    subspecialtyAr: null,
    hospitalId: 'hosp_02',
    languages: ['ar', 'en'],
    yearsExperience: 16,
    rating: 4.5,
    consultationFeeUsd: 25,
    offersSecondOpinion: false,
    offersTeleconsult: true,
  },
  {
    id: 'doc_007',
    nameEn: 'Youssef Nabil',
    nameAr: 'يوسف نبيل',
    titleEn: 'Consultant Gastroenterologist',
    titleAr: 'استشاري الجهاز الهضمي والكبد',
    specialtyCode: 'gastroenterology',
    subspecialtyEn: 'Hepatology',
    subspecialtyAr: 'أمراض الكبد',
    hospitalId: 'hosp_02',
    languages: ['ar', 'en'],
    yearsExperience: 20,
    rating: 4.4,
    consultationFeeUsd: 35,
    offersSecondOpinion: true,
    offersTeleconsult: false,
  },
  // Istanbul — Bosphorus Medical Center
  {
    id: 'doc_008',
    nameEn: 'Mehmet Yilmaz',
    nameAr: 'محمد يلماز',
    titleEn: 'Professor of Cardiology',
    titleAr: 'أستاذ أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Heart Failure',
    subspecialtyAr: 'قصور القلب',
    hospitalId: 'hosp_03',
    languages: ['tr', 'en'],
    yearsExperience: 25,
    rating: 4.9,
    consultationFeeUsd: 150,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  {
    id: 'doc_009',
    nameEn: 'Elif Demir',
    nameAr: 'إليف دمير',
    titleEn: 'Consultant Cardiologist',
    titleAr: 'استشارية أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Interventional Cardiology',
    subspecialtyAr: 'القسطرة القلبية التداخلية',
    hospitalId: 'hosp_03',
    languages: ['tr', 'en', 'de'],
    yearsExperience: 15,
    rating: 4.7,
    consultationFeeUsd: 120,
    offersSecondOpinion: true,
    offersTeleconsult: false,
  },
  {
    id: 'doc_010',
    nameEn: 'Omar Khalil',
    nameAr: 'عمر خليل',
    titleEn: 'Consultant Neurologist',
    titleAr: 'استشاري المخ والأعصاب',
    specialtyCode: 'neurology',
    subspecialtyEn: 'Stroke Medicine',
    subspecialtyAr: 'السكتات الدماغية',
    hospitalId: 'hosp_03',
    languages: ['ar', 'tr', 'en'],
    yearsExperience: 13,
    rating: 4.6,
    consultationFeeUsd: 110,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  {
    id: 'doc_011',
    nameEn: 'Can Aydin',
    nameAr: 'جان آيدن',
    titleEn: 'Consultant Orthopedic Surgeon',
    titleAr: 'استشاري جراحة العظام',
    specialtyCode: 'orthopedics',
    subspecialtyEn: 'Joint Replacement',
    subspecialtyAr: 'تغيير المفاصل',
    hospitalId: 'hosp_03',
    languages: ['tr', 'en'],
    yearsExperience: 17,
    rating: 4.5,
    consultationFeeUsd: 130,
    offersSecondOpinion: true,
    offersTeleconsult: false,
  },
  // Istanbul — Anatolia Specialist Clinic (no emergency department)
  {
    id: 'doc_012',
    nameEn: 'Zeynep Kaya',
    nameAr: 'زينب كايا',
    titleEn: 'Professor of Medical Oncology',
    titleAr: 'أستاذة علاج الأورام',
    specialtyCode: 'oncology',
    subspecialtyEn: 'Breast Cancer',
    subspecialtyAr: 'أورام الثدي',
    hospitalId: 'hosp_04',
    languages: ['tr', 'en', 'ar'],
    yearsExperience: 22,
    rating: 4.9,
    consultationFeeUsd: 180,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  {
    id: 'doc_013',
    nameEn: 'Burak Sahin',
    nameAr: 'بوراك شاهين',
    titleEn: 'Consultant Cardiologist',
    titleAr: 'استشاري أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Structural Heart Disease',
    subspecialtyAr: 'أمراض القلب الهيكلية',
    hospitalId: 'hosp_04',
    languages: ['tr', 'en'],
    yearsExperience: 19,
    rating: 4.6,
    consultationFeeUsd: 140,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  // Dubai — Gulf Specialist Hospital
  {
    id: 'doc_014',
    nameEn: 'Layla Al-Mansoori',
    nameAr: 'ليلى المنصوري',
    titleEn: 'Consultant Cardiologist',
    titleAr: 'استشارية أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Preventive Cardiology',
    subspecialtyAr: 'الوقاية من أمراض القلب',
    hospitalId: 'hosp_05',
    languages: ['ar', 'en'],
    yearsExperience: 16,
    rating: 4.8,
    consultationFeeUsd: 200,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  {
    id: 'doc_015',
    nameEn: 'Rajesh Menon',
    nameAr: 'راجيش مينون',
    titleEn: 'Consultant Interventional Cardiologist',
    titleAr: 'استشاري القسطرة القلبية',
    specialtyCode: 'cardiology',
    subspecialtyEn: 'Interventional Cardiology',
    subspecialtyAr: 'القسطرة القلبية التداخلية',
    hospitalId: 'hosp_05',
    languages: ['en', 'hi'],
    yearsExperience: 21,
    rating: 4.7,
    consultationFeeUsd: 220,
    offersSecondOpinion: false,
    offersTeleconsult: false,
  },
  {
    id: 'doc_016',
    nameEn: 'Faisal Rahman',
    nameAr: 'فيصل رحمن',
    titleEn: 'Emergency Medicine Consultant',
    titleAr: 'استشاري طب الطوارئ',
    specialtyCode: 'emergency_medicine',
    subspecialtyEn: null,
    subspecialtyAr: null,
    hospitalId: 'hosp_05',
    languages: ['ar', 'en', 'ur'],
    yearsExperience: 11,
    rating: 4.5,
    consultationFeeUsd: 90,
    offersSecondOpinion: false,
    offersTeleconsult: false,
  },
  {
    id: 'doc_017',
    nameEn: 'Nour Haddad',
    nameAr: 'نور حداد',
    titleEn: 'Consultant Pulmonologist',
    titleAr: 'استشارية الأمراض الصدرية',
    specialtyCode: 'pulmonology',
    subspecialtyEn: 'Sleep Medicine',
    subspecialtyAr: 'طب النوم',
    hospitalId: 'hosp_05',
    languages: ['ar', 'en', 'fr'],
    yearsExperience: 14,
    rating: 4.6,
    consultationFeeUsd: 180,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  // Dubai — Marina Heart & Wellness Clinic (no emergency department)
  {
    id: 'doc_018',
    nameEn: 'Sara Williams',
    nameAr: 'سارة ويليامز',
    titleEn: 'Specialist Cardiologist',
    titleAr: 'أخصائية أمراض القلب',
    specialtyCode: 'cardiology',
    subspecialtyEn: null,
    subspecialtyAr: null,
    hospitalId: 'hosp_06',
    languages: ['en'],
    yearsExperience: 8,
    rating: 4.4,
    consultationFeeUsd: 160,
    offersSecondOpinion: true,
    offersTeleconsult: true,
  },
  {
    id: 'doc_019',
    nameEn: 'Tarek Aziz',
    nameAr: 'طارق عزيز',
    titleEn: 'Consultant Internal Medicine',
    titleAr: 'استشاري الباطنة العامة',
    specialtyCode: 'internal_medicine',
    subspecialtyEn: null,
    subspecialtyAr: null,
    hospitalId: 'hosp_06',
    languages: ['ar', 'en'],
    yearsExperience: 15,
    rating: 4.5,
    consultationFeeUsd: 120,
    offersSecondOpinion: false,
    offersTeleconsult: true,
  },
];

export const doctors: Prisma.DoctorCreateManyInput[] = doctorSeeds.map(
  ({ specialtyCode, ...doctor }) => ({ ...doctor, specialtyId: specialtyId(specialtyCode) }),
);

// ─────────────────────────────── Availability ───────────────────────────────

const DAYS_AHEAD = 14;
const IN_PERSON_HOURS_UTC = [8, 11, 14];
const TELECONSULT_HOUR_UTC = 17;
const SLOT_MINUTES = 30;

/**
 * Deterministic availability for the next {@link DAYS_AHEAD} days, relative to `from`.
 * Deterministic (no Math.random) so seeds and tests are reproducible; relative to "now" so the
 * demo always has future slots (re-run the seed to refresh them). Times are UTC — timezone
 * handling is out of scope for the prototype.
 */
export function buildAvailabilitySlots(from: Date): Prisma.AvailabilitySlotCreateManyInput[] {
  const startOfTomorrow = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate() + 1,
  );
  const slots: Prisma.AvailabilitySlotCreateManyInput[] = [];

  doctors.forEach((doctor, doctorIndex) => {
    let n = 0;
    for (let day = 0; day < DAYS_AHEAD; day++) {
      // Each doctor works a different subset of days.
      if ((doctorIndex + day) % 3 === 0) continue;

      const hours = [...IN_PERSON_HOURS_UTC];
      if (doctor.offersTeleconsult) hours.push(TELECONSULT_HOUR_UTC);

      for (const hour of hours) {
        n++;
        slots.push({
          id: `slot_${doctor.id}_${String(n).padStart(3, '0')}`,
          doctorId: doctor.id,
          startsAt: new Date(startOfTomorrow + (day * 24 + hour) * 60 * 60 * 1000),
          durationMin: SLOT_MINUTES,
          mode: hour === TELECONSULT_HOUR_UTC ? 'TELECONSULT' : 'IN_PERSON',
          isBooked: (doctorIndex * 7 + day * 3 + hour) % 5 === 0,
        });
      }
    }
  });

  return slots;
}
