import type { LocalizedText, Urgency } from '@healtrip/shared';
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
export interface EvidencedDoctor {
  id: string;
  name: LocalizedText;
  hospital: EvidencedHospital;
}

export interface EvidencedHospital {
  id: string;
  hasEmergency: boolean;
}

export class EvidenceRegistry {
  private readonly doctors = new Map<string, EvidencedDoctor>();
  private readonly hospitals = new Map<string, EvidencedHospital>();
  private readonly triage: TriageResult[] = [];

  recordDoctors(doctors: EvidencedDoctor[]): void {
    for (const d of doctors) {
      this.doctors.set(d.id, { id: d.id, name: d.name, hospital: d.hospital });
      this.recordHospitals([d.hospital]); // a doctor's hospital was returned from the DB too
    }
  }

  recordHospitals(hospitals: EvidencedHospital[]): void {
    for (const h of hospitals) this.hospitals.set(h.id, { id: h.id, hasEmergency: h.hasEmergency });
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
    return [...this.hospitals.keys()];
  }

  allDoctors(): EvidencedDoctor[] {
    return [...this.doctors.values()];
  }

  hospital(id: string): EvidencedHospital | undefined {
    return this.hospitals.get(id);
  }

  /** Independent copy — used to judge an answer against what the model had seen *before* it. */
  snapshot(): EvidenceRegistry {
    const copy = new EvidenceRegistry();
    copy.recordDoctors(this.allDoctors());
    copy.recordHospitals([...this.hospitals.values()]);
    for (const t of this.triage) copy.recordTriage(t);
    return copy;
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
