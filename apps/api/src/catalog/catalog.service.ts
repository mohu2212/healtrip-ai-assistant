import { Injectable } from '@nestjs/common';
import type {
  DoctorDetailDto,
  DoctorDto,
  DoctorSearchFilters,
  HospitalDto,
  HospitalSearchFilters,
  SpecialtyDto,
} from '@healtrip/shared';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors/app-error.js';
import { toDoctorDetailDto, toDoctorDto, toHospitalDto, toSpecialtyDto } from './catalog.mapper.js';
import { CatalogRepository } from './catalog.repository.js';

const SPECIALTIES_TTL_MS = 5 * 60 * 1000;
const UPCOMING_SLOTS = 10;

/**
 * Read-only access to the catalog. Used by the HTTP controllers and — directly, not over HTTP —
 * by the agent's tools, so both apply the same rules.
 *
 * Filters must already be parsed with the shared zod schemas.
 */
@Injectable()
export class CatalogService {
  private specialtiesCache?: { value: SpecialtyDto[]; expiresAt: number };

  constructor(
    private readonly repo: CatalogRepository,
    private readonly clock: Clock,
  ) {}

  /** Reference data that changes only on re-seed, so it is cached in-process for a few minutes. */
  async listSpecialties(): Promise<SpecialtyDto[]> {
    const now = this.clock.now().getTime();
    if (this.specialtiesCache && this.specialtiesCache.expiresAt > now) {
      return this.specialtiesCache.value;
    }
    const value = (await this.repo.findSpecialties()).map(toSpecialtyDto);
    this.specialtiesCache = { value, expiresAt: now + SPECIALTIES_TTL_MS };
    return value;
  }

  async searchDoctors(filters: DoctorSearchFilters): Promise<DoctorDto[]> {
    await this.assertKnownSpecialty(filters.specialty);
    const rows = await this.repo.findDoctors(filters, this.clock.now());
    return rows.map(toDoctorDto);
  }

  async getDoctor(id: string): Promise<DoctorDetailDto> {
    const row = await this.repo.findDoctorById(id, this.clock.now(), UPCOMING_SLOTS);
    if (!row) throw AppError.notFound('Doctor');
    return toDoctorDetailDto(row);
  }

  async searchHospitals(filters: HospitalSearchFilters): Promise<HospitalDto[]> {
    await this.assertKnownSpecialty(filters.specialty);
    const rows = await this.repo.findHospitals(filters);
    return rows.map(toHospitalDto);
  }

  async getHospital(id: string): Promise<HospitalDto> {
    const row = await this.repo.findHospitalById(id);
    if (!row) throw AppError.notFound('Hospital');
    return toHospitalDto(row);
  }

  /**
   * An unknown specialty is an error, not an empty result: "no doctors found" would be a
   * misleading answer (and an LLM could relay it to a patient as fact). The error lists the
   * valid codes so the caller — or the agent — can correct itself.
   */
  private async assertKnownSpecialty(code: string | undefined): Promise<void> {
    if (!code) return;
    const known = (await this.listSpecialties()).map((s) => s.code);
    if (!known.includes(code)) {
      throw AppError.validation([
        { path: 'specialty', message: `Unknown specialty. Valid values: ${known.join(', ')}` },
      ]);
    }
  }
}
