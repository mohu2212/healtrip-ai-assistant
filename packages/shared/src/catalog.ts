import { z } from 'zod';

// ─────────────────────────────── IDs ───────────────────────────────
// Catalog IDs carry a type prefix. Validating the prefix means a hospital ID can never be accepted
// where a doctor ID is expected — a cheap guard against an LLM mixing up references.

export const DoctorIdSchema = z.string().regex(/^doc_[a-z0-9]{1,32}$/, 'Invalid doctor ID');
export const HospitalIdSchema = z.string().regex(/^hosp_[a-z0-9]{1,32}$/, 'Invalid hospital ID');
export const SpecialtyCodeSchema = z.string().regex(/^[a-z_]{2,40}$/, 'Invalid specialty code');

export type DoctorId = z.infer<typeof DoctorIdSchema>;
export type HospitalId = z.infer<typeof HospitalIdSchema>;

// ─────────────────────────────── Search filters ───────────────────────────────
// A closed whitelist of typed filters. Nothing else reaches the database layer, so neither an
// API client nor the LLM can shape the query beyond these fields.

export const MAX_SEARCH_LIMIT = 20;

const CitySchema = z.string().trim().min(2).max(60);
const CountrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use an ISO-3166 alpha-2 country code, e.g. EG');
const LanguageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2}$/, 'Use an ISO-639-1 language code, e.g. ar');
const LimitSchema = z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(10);

export const DoctorSearchFiltersSchema = z.strictObject({
  specialty: SpecialtyCodeSchema.optional(),
  city: CitySchema.optional().describe('City name in English or Arabic, e.g. "Cairo" or "القاهرة"'),
  country: CountrySchema.optional(),
  language: LanguageSchema.optional().describe('Language the doctor speaks'),
  offersSecondOpinion: z.boolean().optional(),
  offersTeleconsult: z.boolean().optional(),
  maxFeeUsd: z.number().int().positive().optional(),
  hospitalId: HospitalIdSchema.optional(),
  ids: z.array(DoctorIdSchema).min(1).max(MAX_SEARCH_LIMIT).optional(),
  limit: LimitSchema,
});
export type DoctorSearchFilters = z.infer<typeof DoctorSearchFiltersSchema>;

export const HospitalSearchFiltersSchema = z.strictObject({
  specialty: SpecialtyCodeSchema.optional(),
  city: CitySchema.optional(),
  country: CountrySchema.optional(),
  hasEmergency: z.boolean().optional(),
  ids: z.array(HospitalIdSchema).min(1).max(MAX_SEARCH_LIMIT).optional(),
  limit: LimitSchema,
});
export type HospitalSearchFilters = z.infer<typeof HospitalSearchFiltersSchema>;

// HTTP query-string variants: parse strings, then pipe into the typed schemas above so there is
// exactly one set of validation rules. Repeated params (`?city=a&city=b`) arrive as arrays and are
// rejected (no parameter pollution).
const csv = z.string().transform((raw) =>
  raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean),
);
const queryNumber = z.coerce.number();

export const DoctorSearchQuerySchema = z
  .strictObject({
    specialty: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    language: z.string().optional(),
    offersSecondOpinion: z.stringbool().optional(),
    offersTeleconsult: z.stringbool().optional(),
    maxFeeUsd: queryNumber.optional(),
    hospitalId: z.string().optional(),
    ids: csv.optional(),
    limit: queryNumber.optional(),
  })
  .pipe(DoctorSearchFiltersSchema);

export const HospitalSearchQuerySchema = z
  .strictObject({
    specialty: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    hasEmergency: z.stringbool().optional(),
    ids: csv.optional(),
    limit: queryNumber.optional(),
  })
  .pipe(HospitalSearchFiltersSchema);

// ─────────────────────────────── Response DTOs ───────────────────────────────

export interface LocalizedText {
  en: string;
  ar: string;
}

export interface SpecialtyDto {
  code: string;
  name: LocalizedText;
}

export type ConsultationMode = 'IN_PERSON' | 'TELECONSULT';

export interface SlotDto {
  startsAt: string; // ISO-8601 (UTC)
  durationMin: number;
  mode: ConsultationMode;
}

export interface HospitalSummaryDto {
  id: HospitalId;
  name: LocalizedText;
  city: LocalizedText;
  country: string;
  hasEmergency: boolean;
}

export interface HospitalDto extends HospitalSummaryDto {
  emergencyPhone: string | null;
  phone: string;
  accreditation: string | null;
  rating: number;
  specialties: SpecialtyDto[];
}

export interface DoctorDto {
  id: DoctorId;
  name: LocalizedText;
  title: LocalizedText;
  specialty: SpecialtyDto;
  subspecialty: LocalizedText | null;
  hospital: HospitalSummaryDto;
  languages: string[];
  yearsExperience: number;
  rating: number;
  consultationFeeUsd: number;
  offersSecondOpinion: boolean;
  offersTeleconsult: boolean;
  nextAvailableSlot: SlotDto | null;
}

export interface DoctorDetailDto extends DoctorDto {
  upcomingSlots: SlotDto[];
}

export interface ListResponse<T> {
  data: T[];
  meta: { count: number; limit?: number };
}

export interface ItemResponse<T> {
  data: T;
}
