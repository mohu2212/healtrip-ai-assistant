import type { NextStep } from '@healtrip/shared';
import type { EvidenceRegistry } from '../tools/evidence.js';
import { normalizeArabic } from './language.js';
import type { Submission } from './submit-response.tool.js';

export type GroundingProblemCode =
  | 'INVALID_SUBMISSION'
  | 'UNKNOWN_DOCTOR_ID'
  | 'UNKNOWN_HOSPITAL_ID'
  | 'UNVERIFIED_DOCTOR_NAME'
  | 'NEXT_STEP_MISMATCH'
  | 'TRIAGE_REQUIRED';

export interface GroundingProblem {
  code: GroundingProblemCode;
  message: string;
}

export interface GroundingResult {
  problems: GroundingProblem[];
  /** The next step decided by code (triage), or null when no triage ran this turn. */
  requiredNextStep: NextStep | null;
  /** Submission with every unverifiable recommendation removed and the triage decision applied. */
  sanitized: Pick<Submission, 'recommendedDoctorIds' | 'recommendedHospitalIds'> & {
    nextStep: NextStep;
  };
  dropped: { doctorIds: string[]; hospitalIds: string[] };
}

/**
 * Checks a submission against what the tools actually returned *before* the model wrote it.
 * Pure function — the agent decides whether to ask for a correction or apply `sanitized`.
 */
export function validateSubmission(
  submission: Submission,
  evidence: EvidenceRegistry,
  options: { triageRequired: boolean },
): GroundingResult {
  const problems: GroundingProblem[] = [];

  // 1–2. Recommendations must be entities returned by a tool in this turn.
  const unknownDoctors = submission.recommendedDoctorIds.filter((id) => !evidence.hasDoctor(id));
  const unknownHospitals = submission.recommendedHospitalIds.filter(
    (id) => !evidence.hasHospital(id),
  );
  if (unknownDoctors.length) {
    problems.push({
      code: 'UNKNOWN_DOCTOR_ID',
      message: `Doctor IDs not returned by any tool in this turn: ${unknownDoctors.join(', ')}`,
    });
  }
  if (unknownHospitals.length) {
    problems.push({
      code: 'UNKNOWN_HOSPITAL_ID',
      message: `Hospital IDs not returned by any tool in this turn: ${unknownHospitals.join(', ')}`,
    });
  }

  // 3. Doctor names written in the text must belong to doctors the tools returned.
  const unverified = findUnverifiedDoctorNames(submission.message, evidence);
  if (unverified.length) {
    problems.push({
      code: 'UNVERIFIED_DOCTOR_NAME',
      message: `The message names doctors that no tool returned: ${unverified.join(', ')}. Only mention doctors from tool results.`,
    });
  }

  // 4. The triage decision is binding (an emergency can never be downgraded).
  const requiredNextStep = requiredStep(evidence);
  if (requiredNextStep && submission.nextStep !== requiredNextStep) {
    problems.push({
      code: 'NEXT_STEP_MISMATCH',
      message: `assess_urgency decided nextStep=${requiredNextStep}; the answer must use it${
        requiredNextStep === 'ER_NOW' ? ' and tell the patient to seek emergency care now' : ''
      }.`,
    });
  }

  // 5. A recommendation (or any answer when an emergency is suspected) needs a triage first.
  const needsTriage = options.triageRequired || submission.nextStep !== 'NEED_MORE_INFO';
  if (needsTriage && evidence.triageResults().length === 0) {
    problems.push({
      code: 'TRIAGE_REQUIRED',
      message: 'Call assess_urgency with the facts the patient gave before answering.',
    });
  }

  const nextStep =
    requiredNextStep ?? (evidence.triageResults().length ? submission.nextStep : 'NEED_MORE_INFO');
  const emergency = nextStep === 'ER_NOW';
  const doctorIds = emergency
    ? [] // in an emergency the action is the emergency department, not an appointment
    : submission.recommendedDoctorIds.filter((id) => evidence.hasDoctor(id));
  const hospitalIds = submission.recommendedHospitalIds.filter(
    (id) => evidence.hasHospital(id) && (!emergency || evidence.hospital(id)?.hasEmergency),
  );

  return {
    problems,
    requiredNextStep,
    sanitized: { nextStep, recommendedDoctorIds: doctorIds, recommendedHospitalIds: hospitalIds },
    dropped: {
      doctorIds: submission.recommendedDoctorIds.filter((id) => !doctorIds.includes(id)),
      hospitalIds: submission.recommendedHospitalIds.filter((id) => !hospitalIds.includes(id)),
    },
  };
}

/** ER if any triage said so this turn; otherwise the latest triage decision. */
function requiredStep(evidence: EvidenceRegistry): NextStep | null {
  const triage = evidence.triageResults();
  if (!triage.length) return null;
  if (triage.some((t) => t.nextStep === 'ER_NOW')) return 'ER_NOW';
  return triage[triage.length - 1].nextStep;
}

// "Dr. Ahmed", "Doctor Mona", "د. أحمد", "دكتور أحمد", "الدكتورة منى" …
const EN_TITLE = /\b(?:Dr\.?|Doctor)\s+([A-Z][\p{L}'-]+)/gu;
const AR_TITLE = /(?:^|\s)(?:د\.|الدكتور|الدكتوره|دكتور|دكتوره)\s*([ء-ي]+)/gu;

/** Title-prefixed names in the text that match no evidenced doctor (first name or any name part). */
export function findUnverifiedDoctorNames(text: string, evidence: EvidenceRegistry): string[] {
  const known = new Set<string>();
  for (const d of evidence.allDoctors()) {
    for (const part of `${d.name.en} ${normalizeArabic(d.name.ar)}`.toLowerCase().split(/[\s-]+/)) {
      if (part) known.add(part);
    }
  }
  const mentioned = [
    ...[...text.matchAll(EN_TITLE)].map((m) => m[1]),
    ...[...normalizeArabic(text).matchAll(AR_TITLE)]
      .map((m) => m[1])
      .filter((w) => !w.startsWith('ال')), // "الدكتور المختص" = "the specialist", not a name
  ];
  return [...new Set(mentioned.filter((name) => !known.has(name.toLowerCase())))];
}
