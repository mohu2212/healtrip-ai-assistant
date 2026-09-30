import { AppError } from '../common/errors/app-error.js';
import type { Clock } from '../common/clock.js';
import type { CatalogRepository } from './catalog.repository.js';
import { CatalogService } from './catalog.service.js';
import { cardiologyRow, doctorRow, emergencyRow, hospitalRow } from './testing/catalog.fixtures.js';

describe('CatalogService', () => {
  const NOW = new Date('2026-10-01T12:00:00Z');
  let clockNow: Date;
  let repo: { [K in keyof CatalogRepository]: ReturnType<typeof vi.fn> };
  let service: CatalogService;

  beforeEach(() => {
    clockNow = NOW;
    repo = {
      findSpecialties: vi.fn().mockResolvedValue([cardiologyRow, emergencyRow]),
      findDoctors: vi.fn().mockResolvedValue([doctorRow()]),
      findDoctorById: vi.fn().mockResolvedValue(doctorRow()),
      findHospitals: vi.fn().mockResolvedValue([hospitalRow()]),
      findHospitalById: vi.fn().mockResolvedValue(hospitalRow()),
    };
    const clock: Clock = { now: () => clockNow };
    service = new CatalogService(repo as unknown as CatalogRepository, clock);
  });

  it('passes typed filters and the clock time to the repository', async () => {
    const filters = { specialty: 'cardiology', city: 'Cairo', limit: 10 };
    const result = await service.searchDoctors(filters);
    expect(repo.findDoctors).toHaveBeenCalledWith(filters, NOW);
    expect(result.map((d) => d.id)).toEqual(['doc_001']);
  });

  it('rejects an unknown specialty with the list of valid codes instead of returning nothing', async () => {
    const error = await service
      .searchDoctors({ specialty: 'dentistry', limit: 10 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details[0].message).toContain('cardiology, emergency_medicine');
    expect(repo.findDoctors).not.toHaveBeenCalled();
  });

  it('applies the same specialty rule to hospital search', async () => {
    await expect(service.searchHospitals({ specialty: 'dentistry', limit: 10 })).rejects.toThrow(
      AppError,
    );
  });

  it('throws NOT_FOUND for unknown doctor / hospital IDs', async () => {
    repo.findDoctorById.mockResolvedValue(null);
    repo.findHospitalById.mockResolvedValue(null);
    await expect(service.getDoctor('doc_999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Doctor not found',
    });
    await expect(service.getHospital('hosp_99')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requests up to 10 upcoming slots for the doctor detail', async () => {
    await service.getDoctor('doc_001');
    expect(repo.findDoctorById).toHaveBeenCalledWith('doc_001', NOW, 10);
  });

  it('caches specialties for 5 minutes', async () => {
    await service.listSpecialties();
    await service.searchDoctors({ specialty: 'cardiology', limit: 10 });
    expect(repo.findSpecialties).toHaveBeenCalledTimes(1);

    clockNow = new Date(NOW.getTime() + 5 * 60 * 1000 + 1);
    await service.listSpecialties();
    expect(repo.findSpecialties).toHaveBeenCalledTimes(2);
  });
});
