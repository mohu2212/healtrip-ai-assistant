import type { DoctorDto, HospitalDto } from '@healtrip/shared';

/**
 * Token-lean views of catalog records for the model. The UI never renders these — it fetches the
 * full records by ID — so they only need what the model reasons about.
 */

export const REFERENCE_BY_ID =
  'Refer to doctors and hospitals only by the IDs returned here; never invent names, IDs or details.';

export const NO_MATCH_NOTE =
  'No match in the HealTrip network. Do not suggest any doctor or hospital that is not returned by a tool. ' +
  'You may search again with fewer filters (e.g. without the city), or tell the patient none is available.';

export function compactDoctor(d: DoctorDto) {
  return {
    id: d.id,
    name: d.name,
    title: d.title.en,
    specialty: d.specialty.code,
    subspecialty: d.subspecialty?.en ?? null,
    hospital: {
      id: d.hospital.id,
      name: d.hospital.name,
      city: d.hospital.city,
      country: d.hospital.country,
      hasEmergency: d.hospital.hasEmergency,
    },
    languages: d.languages,
    yearsExperience: d.yearsExperience,
    rating: d.rating,
    consultationFeeUsd: d.consultationFeeUsd,
    offersSecondOpinion: d.offersSecondOpinion,
    offersTeleconsult: d.offersTeleconsult,
    nextAvailableSlot: d.nextAvailableSlot?.startsAt ?? null,
  };
}

export function compactHospital(h: HospitalDto) {
  return {
    id: h.id,
    name: h.name,
    city: h.city,
    country: h.country,
    hasEmergency: h.hasEmergency,
    emergencyPhone: h.emergencyPhone,
    accreditation: h.accreditation,
    rating: h.rating,
    specialties: h.specialties.map((s) => s.code),
  };
}
