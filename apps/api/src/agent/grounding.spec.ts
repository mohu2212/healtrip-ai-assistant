import { EvidenceRegistry } from '../tools/evidence.js';
import type { TriageResult } from '../triage/triage.schema.js';
import { findUnverifiedDoctorNames, validateSubmission } from './grounding.js';
import type { Submission } from './submit-response.tool.js';

const triage = (
  nextStep: TriageResult['nextStep'],
  level: TriageResult['level'] = 'routine',
): TriageResult => ({
  level,
  nextStep,
  recommendedSpecialty: 'cardiology',
  reasons: [{ rule: 'TEST', explanation: 'test' }],
  missingInfo: [],
});

function evidenceWith(...triages: TriageResult[]) {
  const evidence = new EvidenceRegistry();
  evidence.recordDoctors([
    {
      id: 'doc_001',
      name: { en: 'Ahmed Mansour', ar: 'أحمد منصور' },
      hospital: { id: 'hosp_01', hasEmergency: true },
    },
  ]);
  evidence.recordHospitals([{ id: 'hosp_04', hasEmergency: false }]);
  for (const t of triages) evidence.recordTriage(t);
  return evidence;
}

const submission = (overrides: Partial<Submission> = {}): Submission => ({
  message: 'I recommend Dr. Ahmed Mansour, a cardiologist.',
  nextStep: 'SPECIALIST',
  clarifyingQuestions: [],
  quickReplies: [],
  recommendedDoctorIds: ['doc_001'],
  recommendedHospitalIds: [],
  ...overrides,
});

const codes = (r: ReturnType<typeof validateSubmission>) => r.problems.map((p) => p.code);

describe('validateSubmission', () => {
  it('accepts a grounded submission that follows triage', () => {
    const result = validateSubmission(submission(), evidenceWith(triage('SPECIALIST')), {
      triageRequired: false,
    });
    expect(result.problems).toEqual([]);
    expect(result.sanitized).toEqual({
      nextStep: 'SPECIALIST',
      recommendedDoctorIds: ['doc_001'],
      recommendedHospitalIds: [],
    });
  });

  it('rejects and drops doctor/hospital IDs no tool returned', () => {
    const result = validateSubmission(
      submission({
        recommendedDoctorIds: ['doc_001', 'doc_099'],
        recommendedHospitalIds: ['hosp_77'],
      }),
      evidenceWith(triage('SPECIALIST')),
      { triageRequired: false },
    );
    expect(codes(result)).toEqual(['UNKNOWN_DOCTOR_ID', 'UNKNOWN_HOSPITAL_ID']);
    expect(result.problems[0].message).toContain('doc_099');
    expect(result.sanitized.recommendedDoctorIds).toEqual(['doc_001']);
    expect(result.dropped).toEqual({ doctorIds: ['doc_099'], hospitalIds: ['hosp_77'] });
  });

  it('rejects doctor names in the text that no tool returned (EN and AR)', () => {
    for (const message of [
      'You should see Dr. Karim Nabil tomorrow.',
      'أنصحك بزيارة الدكتور كريم نبيل',
    ]) {
      const result = validateSubmission(
        submission({ message }),
        evidenceWith(triage('SPECIALIST')),
        {
          triageRequired: false,
        },
      );
      expect(codes(result)).toEqual(['UNVERIFIED_DOCTOR_NAME']);
    }
  });

  it('enforces the triage decision and never lets an emergency be downgraded', () => {
    const result = validateSubmission(
      submission({ nextStep: 'SPECIALIST' }),
      evidenceWith(triage('ER_NOW', 'emergency'), triage('SPECIALIST')),
      { triageRequired: false },
    );
    expect(codes(result)).toEqual(['NEXT_STEP_MISMATCH']);
    expect(result.requiredNextStep).toBe('ER_NOW');
    // Emergency: no appointment recommendations; only hospitals with an emergency department.
    expect(result.sanitized).toEqual({
      nextStep: 'ER_NOW',
      recommendedDoctorIds: [],
      recommendedHospitalIds: [],
    });
  });

  it('keeps only emergency-capable hospitals for ER', () => {
    const result = validateSubmission(
      submission({
        message: 'Go to the emergency department now.',
        nextStep: 'ER_NOW',
        recommendedDoctorIds: [],
        recommendedHospitalIds: ['hosp_01', 'hosp_04'],
      }),
      evidenceWith(triage('ER_NOW', 'emergency')),
      { triageRequired: false },
    );
    expect(result.problems).toEqual([]);
    expect(result.sanitized.recommendedHospitalIds).toEqual(['hosp_01']);
  });

  it('requires a triage before any recommendation', () => {
    const result = validateSubmission(submission(), evidenceWith(), { triageRequired: false });
    expect(codes(result)).toEqual(['TRIAGE_REQUIRED']);
    // Even real, evidenced doctors are withheld until the urgency is assessed.
    expect(result.sanitized).toEqual({
      nextStep: 'NEED_MORE_INFO',
      recommendedDoctorIds: [],
      recommendedHospitalIds: [],
    });
  });

  it('allows clarifying questions without triage, unless an emergency is suspected', () => {
    const asking = submission({
      message: 'When did the pain start?',
      nextStep: 'NEED_MORE_INFO',
      recommendedDoctorIds: [],
    });
    expect(validateSubmission(asking, evidenceWith(), { triageRequired: false }).problems).toEqual(
      [],
    );
    expect(codes(validateSubmission(asking, evidenceWith(), { triageRequired: true }))).toEqual([
      'TRIAGE_REQUIRED',
    ]);
  });
});

describe('findUnverifiedDoctorNames', () => {
  const evidence = evidenceWith();
  it.each([
    ['Dr. Ahmed Mansour is available', []],
    ['Doctor Mansour is available', []],
    ['د. أحمد منصور متاح', []],
    ['يمكنك مراجعة الدكتور المختص', []], // generic "the specialist"
    ['Dr. House can help', ['House']],
    ['a doctor can help', []],
  ])('%s → %j', (text, expected) => {
    expect(findUnverifiedDoctorNames(text, evidence)).toEqual(expected);
  });
});
