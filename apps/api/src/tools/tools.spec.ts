import type { CatalogService } from '../catalog/catalog.service.js';
import { toDoctorDetailDto, toDoctorDto, toHospitalDto } from '../catalog/catalog.mapper.js';
import { doctorRow, hospitalRow } from '../catalog/testing/catalog.fixtures.js';
import { AppError } from '../common/errors/app-error.js';
import { EvidenceRegistry } from './evidence.js';
import { createToolRegistry } from './tools.module.js';

describe('agent tools', () => {
  let catalog: { [K in keyof CatalogService]: ReturnType<typeof vi.fn> };
  let evidence: EvidenceRegistry;

  beforeEach(() => {
    catalog = {
      listSpecialties: vi
        .fn()
        .mockResolvedValue([{ code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } }]),
      searchDoctors: vi.fn().mockResolvedValue([toDoctorDto(doctorRow())]),
      getDoctor: vi.fn().mockResolvedValue(toDoctorDetailDto(doctorRow())),
      searchHospitals: vi.fn().mockResolvedValue([toHospitalDto(hospitalRow())]),
      getHospital: vi.fn(),
    };
    evidence = new EvidenceRegistry();
  });

  const run = async (name: string, input: unknown) => {
    const registry = createToolRegistry(catalog as unknown as CatalogService);
    const { result, execution } = await registry.execute({ id: 'c1', name, input }, { evidence });
    return { body: JSON.parse(result.content), isError: result.isError ?? false, execution };
  };

  it('registers the five tools in a fixed order', () => {
    const names = createToolRegistry(catalog as unknown as CatalogService)
      .definitions()
      .map((d) => d.name);
    expect(names).toEqual([
      'assess_urgency',
      'list_specialties',
      'search_doctors',
      'search_hospitals',
      'get_doctor_availability',
    ]);
  });

  describe('search_doctors', () => {
    it('passes validated filters and returns compact doctors', async () => {
      const { body, execution } = await run('search_doctors', {
        specialty: 'cardiology',
        city: 'Cairo',
        offersSecondOpinion: true,
      });
      expect(catalog.searchDoctors).toHaveBeenCalledWith({
        specialty: 'cardiology',
        city: 'Cairo',
        offersSecondOpinion: true,
        limit: 10,
      });
      expect(body.doctors[0]).toEqual({
        id: 'doc_001',
        name: { en: 'Test Doctor', ar: 'طبيب تجريبي' },
        title: 'Consultant Cardiologist',
        specialty: 'cardiology',
        subspecialty: 'Interventional Cardiology',
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
        nextAvailableSlot: '2026-10-02T08:00:00.000Z',
      });
      expect(execution.summary).toEqual({ count: 1, ids: ['doc_001'] });
    });

    it("records the doctor and the doctor's hospital as evidence", async () => {
      await run('search_doctors', { specialty: 'cardiology' });
      expect(evidence.doctorIds()).toEqual(['doc_001']);
      expect(evidence.hasHospital('hosp_01')).toBe(true);
      expect(evidence.hasDoctor('doc_999')).toBe(false);
    });

    it('returns an explicit no-match note instead of an empty silence', async () => {
      catalog.searchDoctors.mockResolvedValue([]);
      const { body, isError } = await run('search_doctors', {
        specialty: 'oncology',
        city: 'Dubai',
      });
      expect(isError).toBe(false);
      expect(body.doctors).toEqual([]);
      expect(body.note).toMatch(/Do not suggest any doctor/);
    });

    it('surfaces the catalog error for an unknown specialty so the model can correct itself', async () => {
      catalog.searchDoctors.mockRejectedValue(
        AppError.validation([
          { path: 'specialty', message: 'Unknown specialty. Valid values: cardiology' },
        ]),
      );
      const { body, isError } = await run('search_doctors', { specialty: 'dentistry' });
      expect(isError).toBe(true);
      expect(body.details[0].message).toContain('Valid values');
    });
  });

  it('search_hospitals records hospitals as evidence', async () => {
    const { body } = await run('search_hospitals', { hasEmergency: true, city: 'Cairo' });
    expect(body.hospitals[0]).toMatchObject({
      id: 'hosp_01',
      hasEmergency: true,
      specialties: ['cardiology'],
    });
    expect(evidence.hospitalIds()).toEqual(['hosp_01']);
  });

  it('get_doctor_availability returns slots, and a clear error for an unknown doctor', async () => {
    const ok = await run('get_doctor_availability', { doctorId: 'doc_001' });
    expect(ok.body.slots).toHaveLength(1);

    catalog.getDoctor.mockRejectedValue(AppError.notFound('Doctor'));
    const missing = await run('get_doctor_availability', { doctorId: 'doc_999' });
    expect(missing).toMatchObject({ isError: true, body: { error: 'NOT_FOUND' } });

    const wrongType = await run('get_doctor_availability', { doctorId: 'hosp_01' });
    expect(wrongType.body.error).toBe('INVALID_ARGUMENTS');
  });

  it('assess_urgency decides in code and records the triage result', async () => {
    const { body, execution } = await run('assess_urgency', {
      chiefComplaint: 'chest_pain',
      redFlagsScreened: true,
      redFlags: ['pain_radiating_arm_jaw_back'],
      onset: 'now_or_today',
      severity: 6,
      age: 52,
      riskFactors: [],
      hasExistingDiagnosis: false,
    });
    expect(body).toMatchObject({ level: 'emergency', nextStep: 'ER_NOW' });
    expect(evidence.mostUrgentTriage()?.nextStep).toBe('ER_NOW');
    expect(execution.summary).toEqual({
      level: 'emergency',
      nextStep: 'ER_NOW',
      rules: ['R1_RED_FLAG'],
    });
  });

  it('assess_urgency rejects free-text symptoms outside the closed enums', async () => {
    const { isError, body } = await run('assess_urgency', {
      chiefComplaint: 'my chest feels weird',
      redFlagsScreened: false,
      redFlags: [],
      onset: 'unknown',
      severity: null,
      age: null,
      riskFactors: [],
      hasExistingDiagnosis: false,
    });
    expect(isError).toBe(true);
    expect(body.issues[0].path).toBe('chiefComplaint');
  });
});

describe('EvidenceRegistry.mostUrgentTriage', () => {
  it('keeps the most severe result even if a later call is milder', () => {
    const evidence = new EvidenceRegistry();
    const base = { recommendedSpecialty: null, reasons: [], missingInfo: [] };
    evidence.recordTriage({ ...base, level: 'emergency', nextStep: 'ER_NOW' });
    evidence.recordTriage({ ...base, level: 'routine', nextStep: 'SPECIALIST' });
    expect(evidence.mostUrgentTriage()?.nextStep).toBe('ER_NOW');
  });
});
