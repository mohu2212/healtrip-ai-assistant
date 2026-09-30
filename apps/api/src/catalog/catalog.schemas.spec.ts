import {
  DoctorIdSchema,
  DoctorSearchFiltersSchema,
  DoctorSearchQuerySchema,
  HospitalIdSchema,
  HospitalSearchQuerySchema,
} from '@healtrip/shared';

/** The shared contract is the whitelist between clients/LLM and the database — test it hard. */
describe('catalog schemas (shared contract)', () => {
  describe('IDs', () => {
    it('enforce the type prefix', () => {
      expect(DoctorIdSchema.safeParse('doc_001').success).toBe(true);
      expect(DoctorIdSchema.safeParse('hosp_01').success).toBe(false);
      expect(HospitalIdSchema.safeParse('doc_001').success).toBe(false);
      expect(DoctorIdSchema.safeParse("doc_1' OR 1=1").success).toBe(false);
    });
  });

  describe('DoctorSearchQuerySchema (HTTP query strings)', () => {
    it('converts strings into typed filters', () => {
      expect(
        DoctorSearchQuerySchema.parse({
          specialty: 'cardiology',
          country: ' eg ',
          language: 'AR',
          offersSecondOpinion: 'false',
          maxFeeUsd: '100',
          ids: 'doc_001, doc_002,',
          limit: '5',
        }),
      ).toEqual({
        specialty: 'cardiology',
        country: 'EG',
        language: 'ar',
        offersSecondOpinion: false, // not coerced to true like Boolean("false")
        maxFeeUsd: 100,
        ids: ['doc_001', 'doc_002'],
        limit: 5,
      });
    });

    it('defaults the limit', () => {
      expect(DoctorSearchQuerySchema.parse({})).toEqual({ limit: 10 });
    });

    it.each([
      [{ limit: '21' }, 'limit'],
      [{ limit: '0' }, 'limit'],
      [{ maxFeeUsd: 'cheap' }, 'maxFeeUsd'],
      [{ offersTeleconsult: 'maybe' }, 'offersTeleconsult'],
      [{ country: 'Egypt' }, 'country'],
      [{ ids: 'hosp_01' }, 'ids'],
      [{ city: ['Cairo', 'Dubai'] }, 'city'], // repeated param → parameter pollution
      [{ orderBy: 'fee' }, ''], // unknown key
    ])('rejects %j', (query, path) => {
      const result = DoctorSearchQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
      expect(result.error!.issues[0].path.join('.').startsWith(path)).toBe(true);
    });
  });

  describe('DoctorSearchFiltersSchema (typed input, e.g. from agent tools)', () => {
    it('is strict about unknown keys', () => {
      expect(
        DoctorSearchFiltersSchema.safeParse({ specialty: 'cardiology', raw: 'x' }).success,
      ).toBe(false);
    });
  });

  it('HospitalSearchQuerySchema parses booleans and ids', () => {
    expect(
      HospitalSearchQuerySchema.parse({ hasEmergency: 'true', ids: 'hosp_01,hosp_02' }),
    ).toEqual({ hasEmergency: true, ids: ['hosp_01', 'hosp_02'], limit: 10 });
  });
});
