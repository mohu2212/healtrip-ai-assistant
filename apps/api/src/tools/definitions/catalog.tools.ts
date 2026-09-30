import {
  DoctorIdSchema,
  DoctorSearchFiltersSchema,
  HospitalSearchFiltersSchema,
} from '@healtrip/shared';
import { z } from 'zod';
import type { CatalogService } from '../../catalog/catalog.service.js';
import type { AgentTool } from '../tool.types.js';
import { defineTool } from '../tool.types.js';
import { compactDoctor, compactHospital, NO_MATCH_NOTE, REFERENCE_BY_ID } from './compact.js';

const idsSummary = (key: 'doctors' | 'hospitals') => (output: unknown) => {
  const list = (output as Record<string, { id: string }[]>)[key] ?? [];
  return { count: list.length, ids: list.map((x) => x.id) };
};

/** Tools backed by the catalog. They call CatalogService directly — same rules as the HTTP API. */
export function createCatalogTools(catalog: CatalogService): AgentTool[] {
  return [
    defineTool({
      name: 'list_specialties',
      description:
        'Lists the medical specialties available in the HealTrip network (codes and names). ' +
        'Use the codes as the `specialty` filter of the search tools.',
      inputSchema: z.strictObject({}),
      async run() {
        const specialties = await catalog.listSpecialties();
        return { specialties: specialties.map((s) => ({ code: s.code, name: s.name.en })) };
      },
      summarize: (output) => ({
        count: (output as { specialties: unknown[] }).specialties.length,
      }),
    }),

    defineTool({
      name: 'search_doctors',
      description:
        'Searches doctors in the HealTrip network. This is the ONLY source of doctors you may ' +
        'recommend. Filter by specialty code, city (English or Arabic), country (ISO-2), spoken ' +
        'language (ISO-639-1), second-opinion or teleconsult availability, and maximum fee. ' +
        'Results are ordered by rating. ' +
        REFERENCE_BY_ID,
      inputSchema: DoctorSearchFiltersSchema,
      async run(filters, { evidence }) {
        const doctors = await catalog.searchDoctors(filters);
        evidence.recordDoctors(doctors);
        return doctors.length
          ? { doctors: doctors.map(compactDoctor) }
          : { doctors: [], note: NO_MATCH_NOTE };
      },
      summarize: idsSummary('doctors'),
    }),

    defineTool({
      name: 'search_hospitals',
      description:
        'Searches hospitals in the HealTrip network by specialty code, city, country, and whether ' +
        'they have a 24/7 emergency department (hasEmergency). Use hasEmergency=true when the ' +
        'patient needs emergency care. ' +
        REFERENCE_BY_ID,
      inputSchema: HospitalSearchFiltersSchema,
      async run(filters, { evidence }) {
        const hospitals = await catalog.searchHospitals(filters);
        evidence.recordHospitals(hospitals);
        return hospitals.length
          ? { hospitals: hospitals.map(compactHospital) }
          : { hospitals: [], note: NO_MATCH_NOTE };
      },
      summarize: idsSummary('hospitals'),
    }),

    defineTool({
      name: 'get_doctor_availability',
      description:
        'Returns the next free appointment slots (UTC) of one doctor, by doctor ID from a previous ' +
        'search. Never state appointment times that did not come from this tool.',
      inputSchema: z.strictObject({ doctorId: DoctorIdSchema }),
      async run({ doctorId }, { evidence }) {
        const doctor = await catalog.getDoctor(doctorId);
        evidence.recordDoctors([doctor]);
        return {
          doctorId: doctor.id,
          offersTeleconsult: doctor.offersTeleconsult,
          slots: doctor.upcomingSlots,
          ...(doctor.upcomingSlots.length ? {} : { note: 'No free slots in the next 14 days.' }),
        };
      },
      summarize: (output) => ({
        doctorId: (output as { doctorId: string }).doctorId,
        slots: (output as { slots: unknown[] }).slots.length,
      }),
    }),
  ];
}
