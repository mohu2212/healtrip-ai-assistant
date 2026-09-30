import type {
  DoctorDetailDto,
  DoctorDto,
  HospitalDto,
  HospitalSummaryDto,
  SlotDto,
  SpecialtyDto,
} from '@healtrip/shared';
import type { DoctorRow, HospitalRow, SpecialtyRow } from './catalog.repository.js';

/** Pure DB-row → API-DTO mapping. Keeps Prisma types from leaking into the API contract. */

export const toSpecialtyDto = (s: SpecialtyRow): SpecialtyDto => ({
  code: s.code,
  name: { en: s.nameEn, ar: s.nameAr },
});

const toSlotDto = (slot: DoctorRow['availabilitySlots'][number]): SlotDto => ({
  startsAt: slot.startsAt.toISOString(),
  durationMin: slot.durationMin,
  mode: slot.mode,
});

const toHospitalSummaryDto = (h: DoctorRow['hospital']): HospitalSummaryDto => ({
  id: h.id,
  name: { en: h.nameEn, ar: h.nameAr },
  city: { en: h.city, ar: h.cityAr },
  country: h.country,
  hasEmergency: h.hasEmergency,
});

export const toHospitalDto = (h: HospitalRow): HospitalDto => ({
  ...toHospitalSummaryDto(h),
  emergencyPhone: h.emergencyPhone,
  phone: h.phone,
  accreditation: h.accreditation,
  rating: h.rating,
  specialties: h.specialties.map((hs) => toSpecialtyDto(hs.specialty)),
});

export const toDoctorDto = (d: DoctorRow): DoctorDto => ({
  id: d.id,
  name: { en: d.nameEn, ar: d.nameAr },
  title: { en: d.titleEn, ar: d.titleAr },
  specialty: toSpecialtyDto(d.specialty),
  subspecialty:
    d.subspecialtyEn && d.subspecialtyAr ? { en: d.subspecialtyEn, ar: d.subspecialtyAr } : null,
  hospital: toHospitalSummaryDto(d.hospital),
  languages: d.languages,
  yearsExperience: d.yearsExperience,
  rating: d.rating,
  consultationFeeUsd: d.consultationFeeUsd,
  offersSecondOpinion: d.offersSecondOpinion,
  offersTeleconsult: d.offersTeleconsult,
  nextAvailableSlot: d.availabilitySlots[0] ? toSlotDto(d.availabilitySlots[0]) : null,
});

export const toDoctorDetailDto = (d: DoctorRow): DoctorDetailDto => ({
  ...toDoctorDto(d),
  upcomingSlots: d.availabilitySlots.map(toSlotDto),
});
