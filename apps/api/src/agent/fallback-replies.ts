import type { AssistantReply, Locale } from '@healtrip/shared';

export type FallbackKind = 'emergency' | 'unavailable' | 'refused' | 'incomplete';

const MESSAGES: Record<FallbackKind, Record<Locale, string>> = {
  emergency: {
    en:
      'Your symptoms may need emergency care. Please call your local emergency number now or go to the ' +
      'nearest emergency department — do not wait for an appointment. Emergency numbers: Egypt 123, ' +
      'UAE 998, Türkiye 112.',
    ar:
      'قد تحتاج أعراضك إلى رعاية طارئة. اتصل برقم الطوارئ المحلي الآن أو توجّه إلى أقرب قسم طوارئ — ' +
      'لا تنتظر موعدًا. أرقام الطوارئ: مصر 123، الإمارات 998، تركيا 112.',
  },
  unavailable: {
    en:
      "Sorry, I couldn't complete your request right now. Please try again in a moment. If your " +
      'symptoms are severe or getting worse, seek emergency care.',
    ar:
      'عذرًا، لم أتمكن من إكمال طلبك الآن. يُرجى المحاولة بعد قليل. إذا كانت الأعراض شديدة أو تزداد سوءًا، ' +
      'فاطلب الرعاية الطارئة.',
  },
  refused: {
    en:
      "I'm not able to help with that request. If you have a health concern, describe your symptoms and " +
      "I'll help you find the right next step. In an emergency, call your local emergency number.",
    ar:
      'لا أستطيع المساعدة في هذا الطلب. إذا كان لديك قلق صحي، صِف أعراضك وسأساعدك في تحديد الخطوة التالية ' +
      'المناسبة. في حالة الطوارئ اتصل برقم الطوارئ المحلي.',
  },
  incomplete: {
    en:
      "I couldn't put together a reliable answer. Could you describe your main symptom, when it " +
      'started, and how severe it is (0–10)?',
    ar: 'لم أتمكن من تكوين إجابة موثوقة. هل يمكنك وصف العرض الرئيسي، ومتى بدأ، ومدى شدته (من 0 إلى 10)؟',
  },
};

/** Deterministic replies used whenever the model can't produce a trustworthy answer. */
export function fallbackReply(kind: FallbackKind, language: Locale): AssistantReply {
  const emergency = kind === 'emergency';
  return {
    message: MESSAGES[kind][language],
    language,
    nextStep: emergency ? 'ER_NOW' : 'NEED_MORE_INFO',
    urgency: emergency ? 'emergency' : 'unknown',
    emergency,
    clarifyingQuestions: [],
    quickReplies: [],
    recommendedDoctorIds: [],
    recommendedHospitalIds: [],
  };
}

export function emergencyMessage(language: Locale): string {
  return MESSAGES.emergency[language];
}

/** Neutral text used when the model's own text can't be verified (e.g. mentions unknown doctors). */
export function groundedIntro(language: Locale, hasRecommendations: boolean): string {
  if (!hasRecommendations) return MESSAGES.incomplete[language];
  return language === 'ar'
    ? 'إليك الخيارات المناسبة من شبكة HealTrip. التفاصيل في البطاقات أدناه.'
    : 'Here are suitable options from the HealTrip network. See the cards below for details.';
}
