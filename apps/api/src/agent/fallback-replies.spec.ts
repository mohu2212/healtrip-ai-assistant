import { AssistantReplySchema } from '@healtrip/shared';
import {
  emergencyMessage,
  fallbackReply,
  groundedIntro,
  type FallbackKind,
} from './fallback-replies.js';

const KINDS: FallbackKind[] = ['emergency', 'unavailable', 'refused', 'incomplete'];

describe('fallback replies', () => {
  it.each(KINDS.flatMap((kind) => (['en', 'ar'] as const).map((lang) => [kind, lang] as const)))(
    '%s (%s) is a valid, recommendation-free reply in the right language',
    (kind, language) => {
      const reply = fallbackReply(kind, language);
      expect(AssistantReplySchema.parse(reply)).toEqual(reply);
      expect(reply.language).toBe(language);
      expect(reply.recommendedDoctorIds).toEqual([]);
      expect(reply.recommendedHospitalIds).toEqual([]);
      if (language === 'ar') expect(reply.message).toMatch(/[؀-ۿ]/);
    },
  );

  it('keeps the emergency fields consistent', () => {
    for (const language of ['en', 'ar'] as const) {
      expect(fallbackReply('emergency', language)).toMatchObject({
        nextStep: 'ER_NOW',
        urgency: 'emergency',
        emergency: true,
      });
      expect(fallbackReply('unavailable', language)).toMatchObject({
        emergency: false,
        nextStep: 'NEED_MORE_INFO',
      });
    }
  });

  it('always includes local emergency numbers in the emergency message', () => {
    for (const language of ['en', 'ar'] as const) {
      const message = emergencyMessage(language);
      for (const number of ['123', '998', '112']) expect(message).toContain(number);
    }
  });

  it('uses a neutral intro when the model text cannot be trusted', () => {
    expect(groundedIntro('en', true)).toMatch(/HealTrip network/);
    expect(groundedIntro('ar', true)).toMatch(/HealTrip/);
    expect(groundedIntro('en', false)).toBe(fallbackReply('incomplete', 'en').message);
  });
});
