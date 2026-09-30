import {
  buildAvailabilitySlots,
  doctors,
  hospitalSpecialties,
  hospitals,
  specialties,
} from '../../prisma/seed-data.js';

/**
 * Guards the mock catalog the agent relies on. If the data drifts (e.g. a doctor at a hospital
 * that doesn't offer their specialty), the agent could recommend inconsistent options.
 */
describe('seed data integrity', () => {
  const hospitalById = new Map(hospitals.map((h) => [h.id, h]));
  const specialtyIds = new Set(specialties.map((s) => s.id));
  const cardiologyId = specialties.find((s) => s.code === 'cardiology')!.id;
  const cities = [...new Set(hospitals.map((h) => h.city))];

  it('has unique, correctly prefixed IDs', () => {
    const check = (ids: string[], prefix: RegExp) => {
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id).toMatch(prefix));
    };
    check(
      specialties.map((s) => s.id),
      /^spec_[a-z_]+$/,
    );
    check(
      hospitals.map((h) => h.id),
      /^hosp_\d{2}$/,
    );
    check(
      doctors.map((d) => d.id),
      /^doc_\d{3}$/,
    );
  });

  it('has valid foreign keys', () => {
    for (const d of doctors) {
      expect(hospitalById.has(d.hospitalId)).toBe(true);
      expect(specialtyIds.has(d.specialtyId)).toBe(true);
    }
    for (const hs of hospitalSpecialties) {
      expect(hospitalById.has(hs.hospitalId)).toBe(true);
      expect(specialtyIds.has(hs.specialtyId)).toBe(true);
    }
  });

  it("only places doctors at hospitals that offer the doctor's specialty", () => {
    const offered = new Set(hospitalSpecialties.map((hs) => `${hs.hospitalId}:${hs.specialtyId}`));
    for (const d of doctors) {
      expect(offered.has(`${d.hospitalId}:${d.specialtyId}`), d.id).toBe(true);
    }
  });

  it('is fully bilingual', () => {
    const arabic = /[؀-ۿ]/;
    for (const row of [...specialties, ...hospitals, ...doctors]) {
      expect(row.nameEn.trim(), row.id).not.toBe('');
      expect(row.nameAr, row.id).toMatch(arabic);
    }
    for (const h of hospitals) expect(h.cityAr).toMatch(arabic);
    for (const d of doctors) expect(d.titleAr).toMatch(arabic);
  });

  it('only uses ISO-639-1 language codes', () => {
    for (const d of doctors) {
      expect(d.languages).not.toHaveLength(0);
      for (const lang of d.languages as string[]) expect(lang).toMatch(/^[a-z]{2}$/);
    }
  });

  it.each(cities)('covers the chest-pain scenario in %s', (city) => {
    const cityHospitals = hospitals.filter((h) => h.city === city);
    const cityHospitalIds = new Set(cityHospitals.map((h) => h.id));
    // At least one emergency department…
    expect(cityHospitals.some((h) => h.hasEmergency)).toBe(true);
    // …and at least one cardiologist who offers second opinions.
    expect(
      doctors.some(
        (d) =>
          cityHospitalIds.has(d.hospitalId) &&
          d.specialtyId === cardiologyId &&
          d.offersSecondOpinion,
      ),
    ).toBe(true);
  });

  describe('buildAvailabilitySlots', () => {
    const from = new Date('2026-01-10T15:30:00Z');
    const slots = buildAvailabilitySlots(from);

    it('is deterministic', () => {
      expect(buildAvailabilitySlots(from)).toEqual(slots);
    });

    it('only creates future slots with unique IDs for every doctor', () => {
      expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
      for (const s of slots) expect(new Date(s.startsAt).getTime()).toBeGreaterThan(from.getTime());
      for (const d of doctors)
        expect(slots.some((s) => s.doctorId === d.id && !s.isBooked)).toBe(true);
    });

    it('only offers teleconsult slots for doctors who teleconsult', () => {
      const teleDoctors = new Set(doctors.filter((d) => d.offersTeleconsult).map((d) => d.id));
      for (const s of slots.filter((s) => s.mode === 'TELECONSULT')) {
        expect(teleDoctors.has(s.doctorId)).toBe(true);
      }
    });
  });
});
