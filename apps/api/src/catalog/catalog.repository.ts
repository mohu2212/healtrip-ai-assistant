import { Injectable } from '@nestjs/common';
import type { DoctorSearchFilters, HospitalSearchFilters } from '@healtrip/shared';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const hospitalSummarySelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  city: true,
  cityAr: true,
  country: true,
  hasEmergency: true,
} satisfies Prisma.HospitalSelect;

const doctorInclude = (now: Date, slotCount: number) =>
  ({
    specialty: true,
    hospital: { select: hospitalSummarySelect },
    availabilitySlots: {
      where: { isBooked: false, startsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      take: slotCount,
    },
  }) satisfies Prisma.DoctorInclude;

const hospitalInclude = {
  specialties: { include: { specialty: true }, orderBy: { specialty: { code: 'asc' } } },
} satisfies Prisma.HospitalInclude;

export type DoctorRow = Prisma.DoctorGetPayload<{ include: ReturnType<typeof doctorInclude> }>;
export type HospitalRow = Prisma.HospitalGetPayload<{ include: typeof hospitalInclude }>;
export type SpecialtyRow = Prisma.SpecialtyGetPayload<object>;

/** Matches a city by its English name (case-insensitive) or its Arabic name. */
const cityWhere = (city: string): Prisma.HospitalWhereInput => ({
  OR: [{ city: { equals: city, mode: 'insensitive' } }, { cityAr: city }],
});

/** Stable ranking so the same filters always return the same order (reproducible agent runs). */
const DOCTOR_ORDER: Prisma.DoctorOrderByWithRelationInput[] = [
  { rating: 'desc' },
  { yearsExperience: 'desc' },
  { id: 'asc' },
];
const HOSPITAL_ORDER: Prisma.HospitalOrderByWithRelationInput[] = [
  { rating: 'desc' },
  { id: 'asc' },
];

/**
 * The only place that queries catalog tables. Every filter is a typed field mapped to a
 * parameterized Prisma `where` — no raw SQL, no caller-controlled field names.
 */
@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSpecialties(): Promise<SpecialtyRow[]> {
    return this.prisma.specialty.findMany({ orderBy: { code: 'asc' } });
  }

  findDoctors(filters: DoctorSearchFilters, now: Date): Promise<DoctorRow[]> {
    const hospital: Prisma.HospitalWhereInput = {
      ...(filters.city ? cityWhere(filters.city) : {}),
      ...(filters.country ? { country: filters.country } : {}),
    };
    return this.prisma.doctor.findMany({
      where: {
        ...(filters.ids ? { id: { in: filters.ids } } : {}),
        ...(filters.specialty ? { specialty: { code: filters.specialty } } : {}),
        ...(filters.hospitalId ? { hospitalId: filters.hospitalId } : {}),
        ...(filters.language ? { languages: { has: filters.language } } : {}),
        ...(filters.maxFeeUsd !== undefined
          ? { consultationFeeUsd: { lte: filters.maxFeeUsd } }
          : {}),
        ...(filters.offersSecondOpinion !== undefined
          ? { offersSecondOpinion: filters.offersSecondOpinion }
          : {}),
        ...(filters.offersTeleconsult !== undefined
          ? { offersTeleconsult: filters.offersTeleconsult }
          : {}),
        ...(Object.keys(hospital).length ? { hospital } : {}),
      },
      include: doctorInclude(now, 1),
      orderBy: DOCTOR_ORDER,
      take: filters.limit,
    });
  }

  findDoctorById(id: string, now: Date, slotCount: number): Promise<DoctorRow | null> {
    return this.prisma.doctor.findUnique({ where: { id }, include: doctorInclude(now, slotCount) });
  }

  findHospitals(filters: HospitalSearchFilters): Promise<HospitalRow[]> {
    return this.prisma.hospital.findMany({
      where: {
        ...(filters.ids ? { id: { in: filters.ids } } : {}),
        ...(filters.city ? cityWhere(filters.city) : {}),
        ...(filters.country ? { country: filters.country } : {}),
        ...(filters.hasEmergency !== undefined ? { hasEmergency: filters.hasEmergency } : {}),
        ...(filters.specialty
          ? { specialties: { some: { specialty: { code: filters.specialty } } } }
          : {}),
      },
      include: hospitalInclude,
      orderBy: HOSPITAL_ORDER,
      take: filters.limit,
    });
  }

  findHospitalById(id: string): Promise<HospitalRow | null> {
    return this.prisma.hospital.findUnique({ where: { id }, include: hospitalInclude });
  }
}
