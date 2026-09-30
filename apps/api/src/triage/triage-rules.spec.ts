import { assessUrgency } from './triage-rules.js';
import type { AssessUrgencyInput } from './triage.schema.js';

/** A fully screened, low-risk, non-urgent chest-pain case; each test changes one thing. */
const baseline: AssessUrgencyInput = {
  chiefComplaint: 'chest_pain',
  redFlagsScreened: true,
  redFlags: [],
  onset: 'weeks_or_longer',
  severity: 3,
  age: 30,
  riskFactors: [],
  hasExistingDiagnosis: false,
};
const assess = (overrides: Partial<AssessUrgencyInput>) =>
  assessUrgency({ ...baseline, ...overrides });

describe('assessUrgency (deterministic triage rules)', () => {
  it.each([
    'pain_radiating_arm_jaw_back',
    'shortness_of_breath',
    'cold_sweat',
    'fainting_or_near_fainting',
    'one_sided_weakness_or_speech_difficulty',
  ] as const)('R1: red flag "%s" → emergency / ER_NOW', (flag) => {
    expect(assess({ redFlags: [flag] })).toMatchObject({
      level: 'emergency',
      nextStep: 'ER_NOW',
      recommendedSpecialty: 'emergency_medicine',
      reasons: [{ rule: 'R1_RED_FLAG' }],
    });
  });

  it('R1 beats everything else, including a second-opinion request', () => {
    const result = assess({ redFlags: ['cold_sweat'], hasExistingDiagnosis: true });
    expect(result.nextStep).toBe('ER_NOW');
  });

  it('R1 applies to non-cardiac complaints too', () => {
    expect(assess({ chiefComplaint: 'headache', redFlags: ['confusion'] }).nextStep).toBe('ER_NOW');
  });

  it('R2: severe chest pain (≥7) → emergency even without red flags', () => {
    expect(assess({ severity: 7 })).toMatchObject({ level: 'emergency', nextStep: 'ER_NOW' });
    expect(assess({ severity: 6 }).nextStep).not.toBe('ER_NOW');
  });

  it('R3: chest pain without warning-sign screening → ask first, list what is missing', () => {
    expect(assess({ redFlagsScreened: false, onset: 'unknown', severity: null })).toMatchObject({
      level: 'unknown',
      nextStep: 'NEED_MORE_INFO',
      recommendedSpecialty: null,
      missingInfo: ['red_flags', 'onset', 'severity'],
    });
  });

  it('R3: a missing severity alone does not block a decision', () => {
    expect(assess({ severity: null }).nextStep).toBe('SPECIALIST');
  });

  it('R3 does not block non-cardiac complaints', () => {
    expect(assess({ chiefComplaint: 'headache', redFlagsScreened: false }).nextStep).toBe(
      'SPECIALIST',
    );
  });

  it.each([
    { age: 55, riskFactors: [] },
    { age: 30, riskFactors: ['smoker'] as const },
    { age: null, riskFactors: ['known_heart_disease'] as const },
  ])('R4: new chest pain today with risk (%j) → urgent care, cardiology', (risk) => {
    expect(
      assess({ onset: 'now_or_today', ...risk, riskFactors: [...risk.riskFactors] }),
    ).toMatchObject({
      level: 'urgent',
      nextStep: 'URGENT_CARE',
      recommendedSpecialty: 'cardiology',
    });
  });

  it('R4 needs risk: a young patient without risk factors is routed to a specialist', () => {
    expect(assess({ onset: 'now_or_today' })).toMatchObject({
      level: 'soon',
      nextStep: 'SPECIALIST',
    });
  });

  it('R5: very severe non-cardiac symptom → urgent care', () => {
    expect(assess({ chiefComplaint: 'abdominal_pain', severity: 9 })).toMatchObject({
      nextStep: 'URGENT_CARE',
      recommendedSpecialty: 'gastroenterology',
    });
  });

  it('R6: existing diagnosis without warning signs → second opinion in the right specialty', () => {
    expect(assess({ hasExistingDiagnosis: true })).toMatchObject({
      level: 'routine',
      nextStep: 'SECOND_OPINION',
      recommendedSpecialty: 'cardiology',
    });
  });

  it.each([
    ['chest_pain', 'cardiology'],
    ['palpitations', 'cardiology'],
    ['shortness_of_breath', 'pulmonology'],
    ['headache', 'neurology'],
    ['abdominal_pain', 'gastroenterology'],
  ] as const)('R7: %s → specialist %s', (chiefComplaint, specialty) => {
    expect(assess({ chiefComplaint })).toMatchObject({
      nextStep: 'SPECIALIST',
      recommendedSpecialty: specialty,
    });
  });

  it('R7: unspecific complaint → GP (internal medicine)', () => {
    expect(assess({ chiefComplaint: 'other' })).toMatchObject({
      nextStep: 'GP',
      recommendedSpecialty: 'internal_medicine',
    });
  });

  it('always explains its decision', () => {
    for (const input of [baseline, { ...baseline, redFlags: ['cold_sweat' as const] }]) {
      const { reasons } = assessUrgency(input);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons[0].explanation).not.toBe('');
    }
  });
});
