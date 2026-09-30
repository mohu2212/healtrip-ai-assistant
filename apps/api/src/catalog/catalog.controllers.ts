import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  DoctorIdSchema,
  DoctorSearchQuerySchema,
  HospitalIdSchema,
  HospitalSearchQuerySchema,
  type DoctorDetailDto,
  type DoctorDto,
  type DoctorSearchFilters,
  type HospitalDto,
  type HospitalSearchFilters,
  type ItemResponse,
  type ListResponse,
  type SpecialtyDto,
} from '@healtrip/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  async list(): Promise<ListResponse<SpecialtyDto>> {
    const data = await this.catalog.listSpecialties();
    return { data, meta: { count: data.length } };
  }
}

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly catalog: CatalogService) {}

  /** e.g. `GET /api/doctors?specialty=cardiology&city=Cairo&offersSecondOpinion=true` */
  @Get()
  async search(
    @Query(new ZodValidationPipe(DoctorSearchQuerySchema)) filters: DoctorSearchFilters,
  ): Promise<ListResponse<DoctorDto>> {
    const data = await this.catalog.searchDoctors(filters);
    return { data, meta: { count: data.length, limit: filters.limit } };
  }

  @Get(':id')
  async get(
    @Param('id', new ZodValidationPipe(DoctorIdSchema)) id: string,
  ): Promise<ItemResponse<DoctorDetailDto>> {
    return { data: await this.catalog.getDoctor(id) };
  }
}

@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly catalog: CatalogService) {}

  /** e.g. `GET /api/hospitals?city=Dubai&hasEmergency=true&specialty=cardiology` */
  @Get()
  async search(
    @Query(new ZodValidationPipe(HospitalSearchQuerySchema)) filters: HospitalSearchFilters,
  ): Promise<ListResponse<HospitalDto>> {
    const data = await this.catalog.searchHospitals(filters);
    return { data, meta: { count: data.length, limit: filters.limit } };
  }

  @Get(':id')
  async get(
    @Param('id', new ZodValidationPipe(HospitalIdSchema)) id: string,
  ): Promise<ItemResponse<HospitalDto>> {
    return { data: await this.catalog.getHospital(id) };
  }
}
