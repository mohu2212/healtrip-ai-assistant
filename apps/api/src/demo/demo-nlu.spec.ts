import { extractFacts } from './demo-nlu.js';

describe('extractFacts (demo brain NLU)', () => {
  it('reads the task example as unscreened chest pain', () => {
    const { triage, city } = extractFacts(
      "I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.",
      false,
    );
    expect(triage).toMatchObject({
      chiefComplaint: 'chest_pain',
      redFlagsScreened: false,
      redFlags: [],
      onset: 'unknown',
      hasExistingDiagnosis: false, // a second opinion is only listed as an option
    });
    expect(city).toBeNull();
  });

  it('extracts onset, severity, age, risk factors and city (EN)', () => {
    const { triage, city } = extractFacts(
      "Chest pain for weeks, about 4/10. I'm 52, a smoker with diabetes. I live in Istanbul.",
      true,
    );
    expect(triage).toMatchObject({
      onset: 'weeks_or_longer',
      severity: 4,
      age: 52,
      riskFactors: ['diabetes', 'smoker'],
      redFlagsScreened: true,
    });
    expect(city).toBe('Istanbul');
  });

  it('extracts facts from Arabic, including Arabic-Indic digits', () => {
    const { triage, city } = extractFacts(
      'ألم في صدري من يومين وشدته ٦ من 10، عمري ٤٥ سنة وأنا في دبي',
      false,
    );
    expect(triage).toMatchObject({
      chiefComplaint: 'chest_pain',
      onset: 'days',
      severity: 6,
      age: 45,
    });
    expect(city).toBe('Dubai');
  });

  it('detects an explicit second-opinion request or an existing diagnosis', () => {
    expect(
      extractFacts('I want a second opinion on my heart', false).triage.hasExistingDiagnosis,
    ).toBe(true);
    expect(extractFacts('I was diagnosed with angina', false).triage.hasExistingDiagnosis).toBe(
      true,
    );
    expect(extractFacts('عايز رأي تاني في التشخيص', false).triage.hasExistingDiagnosis).toBe(true);
  });

  it('recognizes off-topic requests', () => {
    expect(extractFacts('What is the best pizza place in Cairo?', false).isHealthRelated).toBe(
      false,
    );
    expect(extractFacts('I feel dizzy', false).isHealthRelated).toBe(true);
    expect(extractFacts('عندي وجع في بطني', false).isHealthRelated).toBe(true);
  });

  it('maps reported warning signs to triage red flags and respects denials', () => {
    expect(
      extractFacts('chest pain spreading to my jaw and I feel nauseous', false).triage.redFlags,
    ).toEqual(['pain_radiating_arm_jaw_back', 'nausea_vomiting']);
    expect(
      extractFacts('chest pain, none of these, no shortness of breath', true).triage.redFlags,
    ).toEqual([]);
  });
});
