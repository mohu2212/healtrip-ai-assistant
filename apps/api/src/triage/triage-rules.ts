import type {
  AssessUrgencyInput,
  MissingInfo,
  TriageReason,
  TriageResult,
} from './triage.schema.js';

/**
 * Deterministic triage rules. Medical severity is decided here — in reviewable, testable code —
 * never by the LLM. Rules are evaluated in order and the first match wins, so the most dangerous
 * conditions are checked first. The rules are deliberately conservative (when in doubt, escalate);
 * they are a demo of the architecture, not clinically validated guidance.
 */

const SPECIALTY_BY_COMPLAINT: Record<AssessUrgencyInput['chiefComplaint'], string> = {
  chest_pain: 'cardiology',
  palpitations: 'cardiology',
  shortness_of_breath: 'pulmonology',
  headache: 'neurology',
  abdominal_pain: 'gastroenterology',
  other: 'internal_medicine',
};

const CARDIAC_COMPLAINTS = new Set(['chest_pain', 'palpitations']);

export function assessUrgency(input: AssessUrgencyInput): TriageResult {
  const specialty = SPECIALTY_BY_COMPLAINT[input.chiefComplaint];
  const isCardiac = CARDIAC_COMPLAINTS.has(input.chiefComplaint);

  // R1 — any reported red flag means emergency care now, regardless of anything else.
  if (input.redFlags.length > 0) {
    return result('emergency', 'ER_NOW', 'emergency_medicine', {
      rule: 'R1_RED_FLAG',
      explanation: `Warning signs reported: ${input.redFlags.join(', ')}`,
    });
  }

  // R2 — severe cardiac-type pain is treated as an emergency even without other red flags.
  if (isCardiac && input.severity !== null && input.severity >= 7) {
    return result('emergency', 'ER_NOW', 'emergency_medicine', {
      rule: 'R2_SEVERE_CARDIAC_PAIN',
      explanation: `Severity ${input.severity}/10 for a possible cardiac symptom`,
    });
  }

  // R3 — for cardiac symptoms we cannot rule out an emergency until warning signs and onset are known.
  if (isCardiac) {
    const missing: MissingInfo[] = [];
    if (!input.redFlagsScreened) missing.push('red_flags');
    if (input.onset === 'unknown') missing.push('onset');
    if (input.severity === null) missing.push('severity');
    if (missing.includes('red_flags') || missing.includes('onset')) {
      return {
        ...result('unknown', 'NEED_MORE_INFO', null, {
          rule: 'R3_CARDIAC_NEEDS_SCREENING',
          explanation: 'Warning signs and onset must be known before excluding an emergency',
        }),
        missingInfo: missing,
      };
    }
  }

  // R4 — new cardiac symptoms in a higher-risk patient need same-day assessment.
  const higherRisk = (input.age !== null && input.age >= 40) || input.riskFactors.length > 0;
  if (isCardiac && input.onset === 'now_or_today' && higherRisk) {
    return result('urgent', 'URGENT_CARE', specialty, {
      rule: 'R4_NEW_CARDIAC_SYMPTOM_WITH_RISK',
      explanation:
        'Symptom started today in a patient aged 40+ or with cardiovascular risk factors',
    });
  }

  // R5 — very severe non-cardiac symptoms also need same-day assessment.
  if (input.severity !== null && input.severity >= 8) {
    return result('urgent', 'URGENT_CARE', specialty, {
      rule: 'R5_SEVERE_SYMPTOM',
      explanation: `Severity ${input.severity}/10`,
    });
  }

  // R6 — a patient with an existing diagnosis and no warning signs is looking for a second opinion.
  if (input.hasExistingDiagnosis) {
    return result('routine', 'SECOND_OPINION', specialty, {
      rule: 'R6_SECOND_OPINION',
      explanation: 'Existing diagnosis to review, no warning signs reported',
    });
  }

  // R7 — otherwise route to the matching specialist, or a GP for unspecific complaints.
  if (input.chiefComplaint === 'other') {
    return result('routine', 'GP', specialty, {
      rule: 'R7_GENERAL',
      explanation: 'No specific specialty indicated; start with internal medicine',
    });
  }
  return result(input.onset === 'now_or_today' ? 'soon' : 'routine', 'SPECIALIST', specialty, {
    rule: 'R7_SPECIALIST',
    explanation: `No warning signs; ${specialty.replace('_', ' ')} is the matching specialty`,
  });
}

function result(
  level: TriageResult['level'],
  nextStep: TriageResult['nextStep'],
  recommendedSpecialty: string | null,
  reason: TriageReason,
): TriageResult {
  return { level, nextStep, recommendedSpecialty, reasons: [reason], missingInfo: [] };
}
