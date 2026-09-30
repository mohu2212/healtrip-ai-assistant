import type { Urgency } from '@healtrip/shared';
import type { TriageResult } from '../triage/triage.schema.js';

const URGENCY_RANK: Record<Urgency, number> = {
  unknown: 0,
  routine: 1,
  soon: 2,
  urgent: 3,
  emergency: 4,
};

/**
 * Everything the tools actually returned during one agent turn. The grounding validator (agent)
 * accepts a doctor/hospital in the final answer only if its ID is recorded here — i.e. it came
 * from the database in this turn, not from the model's imagination.
 */
export class EvidenceRegistry {
  private readonly doctors = new Map<string, { hospitalId: string }>();
  private readonly hospitals = new Set<string>();
  private readonly triage: TriageResult[] = [];

  recordDoctors(doctors: { id: string; hospital: { id: string } }[]): void {
    for (const d of doctors) {
      this.doctors.set(d.id, { hospitalId: d.hospital.id });
      this.hospitals.add(d.hospital.id); // a doctor's hospital was returned from the DB too
    }
  }

  recordHospitals(hospitals: { id: string }[]): void {
    for (const h of hospitals) this.hospitals.add(h.id);
  }

  recordTriage(result: TriageResult): void {
    this.triage.push(result);
  }

  hasDoctor(id: string): boolean {
    return this.doctors.has(id);
  }

  hasHospital(id: string): boolean {
    return this.hospitals.has(id);
  }

  doctorIds(): string[] {
    return [...this.doctors.keys()];
  }

  hospitalIds(): string[] {
    return [...this.hospitals];
  }

  triageResults(): readonly TriageResult[] {
    return this.triage;
  }

  /** The most severe triage outcome of the turn (a later, milder call can't downgrade it). */
  mostUrgentTriage(): TriageResult | undefined {
    return this.triage.reduce<TriageResult | undefined>(
      (worst, t) => (!worst || URGENCY_RANK[t.level] > URGENCY_RANK[worst.level] ? t : worst),
      undefined,
    );
  }
}
