import { detectEmergency } from './emergency-guard.js';

describe('detectEmergency', () => {
  it.each([
    ['I have crushing chest pain', 'crushing_chest_pain'],
    ["I can't breathe properly", 'breathing_difficulty'],
    ['the pain is spreading to my left arm', 'radiating_pain'],
    ['I fainted this morning', 'fainting'],
    ["I'm in a cold sweat", 'cold_sweat'],
    ['ألم في صدري يمتد إلى الذراع', 'radiating_pain'],
    ['مش قادر أتنفس', 'breathing_difficulty'],
    ['أُغمي عليّ من ساعة', 'fainting'],
    ['عندي ضغط شديد على الصدر', 'crushing_chest_pain'],
    ['خايف تكون جلطة', 'heart_attack'],
  ])('flags "%s"', (text, label) => {
    const result = detectEmergency(text);
    expect(result.suspected).toBe(true);
    expect(result.matches).toContain(label);
  });

  it.each([
    'I have chest pain and I am not sure whether to see a cardiologist',
    'no shortness of breath, no sweating',
    "the pain doesn't spread to my arm",
    'I want a second opinion on my heart scan',
    'عندي ألم في صدري من أسبوع',
    'لا يوجد ضيق في التنفس',
    'مفيش إغماء',
  ])('does not flag "%s"', (text) => {
    expect(detectEmergency(text)).toEqual({ suspected: false, matches: [] });
  });
});
