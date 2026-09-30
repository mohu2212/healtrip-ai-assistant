import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CatalogRepository } from '../src/catalog/catalog.repository.js';
import { cardiologyRow, doctorRow, hospitalRow } from '../src/catalog/testing/catalog.fixtures.js';
import { createTestApp } from './create-test-app.js';

/** HTTP contract of the catalog endpoints, with the repository faked (no database). */
describe('Catalog API (e2e)', () => {
  let app: NestExpressApplication;
  const repo = {
    findSpecialties: vi.fn(),
    findDoctors: vi.fn(),
    findDoctorById: vi.fn(),
    findHospitals: vi.fn(),
    findHospitalById: vi.fn(),
  };

  beforeAll(async () => {
    ({ app } = await createTestApp({
      overrides: [{ provide: CatalogRepository, useValue: repo }],
    }));
  });
  afterAll(() => app.close());

  beforeEach(() => {
    vi.resetAllMocks();
    repo.findSpecialties.mockResolvedValue([cardiologyRow]);
    repo.findDoctors.mockResolvedValue([doctorRow()]);
    repo.findDoctorById.mockResolvedValue(doctorRow());
    repo.findHospitals.mockResolvedValue([hospitalRow()]);
    repo.findHospitalById.mockResolvedValue(hospitalRow());
  });

  const http = () => request(app.getHttpServer());

  it('GET /api/specialties → list envelope', async () => {
    const res = await http().get('/api/specialties').expect(200);
    expect(res.body).toEqual({
      data: [{ code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } }],
      meta: { count: 1 },
    });
  });

  it('GET /api/doctors parses the query into typed filters', async () => {
    const res = await http()
      .get('/api/doctors')
      .query({ specialty: 'cardiology', city: 'Cairo', offersSecondOpinion: 'true', limit: '3' })
      .expect(200);

    expect(repo.findDoctors).toHaveBeenCalledWith(
      { specialty: 'cardiology', city: 'Cairo', offersSecondOpinion: true, limit: 3 },
      expect.any(Date),
    );
    expect(res.body.meta).toEqual({ count: 1, limit: 3 });
    expect(res.body.data[0]).toMatchObject({ id: 'doc_001', hospital: { id: 'hosp_01' } });
  });

  it.each([
    ['/api/doctors?limit=100', 'limit'],
    ['/api/doctors?offersTeleconsult=maybe', 'offersTeleconsult'],
    ['/api/doctors?orderBy=fee', 'orderBy'],
    ['/api/doctors?city=Cairo&city=Dubai', 'city'],
    ['/api/doctors?specialty=dentistry', 'specialty'],
    ['/api/doctors/hosp_01', 'id'],
    ['/api/hospitals/doc_001', 'id'],
  ])('GET %s → 400 VALIDATION_FAILED on "%s"', async (url, path) => {
    const res = await http().get(url).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toBe(path);
    expect(repo.findDoctors).not.toHaveBeenCalled();
  });

  it('GET /api/doctors/:id → detail with upcoming slots', async () => {
    const res = await http().get('/api/doctors/doc_001').expect(200);
    expect(res.body.data).toMatchObject({ id: 'doc_001', upcomingSlots: [expect.any(Object)] });
  });

  it('GET /api/doctors/:id → 404 when missing', async () => {
    repo.findDoctorById.mockResolvedValue(null);
    const res = await http().get('/api/doctors/doc_999').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Doctor not found' });
  });

  it('GET /api/hospitals and /api/hospitals/:id', async () => {
    const list = await http().get('/api/hospitals?hasEmergency=true').expect(200);
    expect(repo.findHospitals).toHaveBeenCalledWith({ hasEmergency: true, limit: 10 });
    expect(list.body.data[0]).toMatchObject({
      id: 'hosp_01',
      specialties: [{ code: 'cardiology' }],
    });

    const one = await http().get('/api/hospitals/hosp_01').expect(200);
    expect(one.body.data.id).toBe('hosp_01');
  });
});
