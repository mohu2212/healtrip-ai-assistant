import type { Locale, NextStep, Urgency } from '@healtrip/shared';

/**
 * UI strings. Plain data only (no functions) so a dictionary can be passed from a Server Component
 * to Client Components; placeholders like {count} are filled with `fill()` from ./format.
 * `ar` is typed as `Dictionary`, so a missing Arabic key is a compile error.
 */
const en = {
  meta: {
    title: 'HealTrip Patient Decision Assistant',
    description:
      'Describe your symptoms and get guidance on the right next step — emergency care, a specialist, or a second opinion.',
  },
  header: {
    brand: 'HealTrip',
    tagline: 'Patient Decision Assistant',
    switchLanguage: 'العربية',
    newConversation: 'New conversation',
  },
  welcome: {
    title: 'How can I help you today?',
    body: 'Describe what you are feeling. I will ask a few questions, tell you how urgent it seems, and suggest the right next step with options from the HealTrip network.',
    examplesTitle: 'Try an example',
    examples: [
      "I have chest pain and I'm not sure whether I should see a cardiologist, go to the ER, or seek a second opinion.",
      'I was diagnosed with angina and would like a second opinion in Cairo.',
      'Chest pain since this morning and it is spreading to my left arm.',
    ],
  },
  composer: {
    label: 'Your message',
    placeholder: 'Describe your symptoms…',
    send: 'Send',
    hint: 'Enter to send · Shift+Enter for a new line',
    counter: '{count}/{max}',
  },
  thinking: 'Checking your situation…',
  nextStep: {
    ER_NOW: 'Go to the emergency room now',
    URGENT_CARE: 'Same-day assessment',
    SPECIALIST: 'See a specialist',
    SECOND_OPINION: 'Get a second opinion',
    GP: 'See a general practitioner',
    NEED_MORE_INFO: 'A few questions first',
  } satisfies Record<NextStep, string>,
  urgency: {
    emergency: 'Emergency',
    urgent: 'Urgent',
    soon: 'Soon',
    routine: 'Routine',
    unknown: 'Not assessed yet',
  } satisfies Record<Urgency, string>,
  emergency: {
    title: 'This may be an emergency',
    body: 'Call your local emergency number or go to the nearest emergency department now. Do not wait for an appointment.',
    call: 'Call',
    numbers: [
      { country: 'Egypt', number: '123' },
      { country: 'UAE', number: '998' },
      { country: 'Türkiye', number: '112' },
    ],
  },
  questions: { title: 'Please tell me:' },
  quickReplies: { label: 'Quick replies' },
  cards: {
    doctorsTitle: 'Doctors in the HealTrip network',
    hospitalsTitle: 'Hospitals in the HealTrip network',
    experience: '{years} years experience',
    rating: 'Rating {rating}',
    fee: 'Consultation from {fee}',
    secondOpinion: 'Second opinion',
    teleconsult: 'Video consultation',
    nextSlot: 'Next available: {date}',
    noSlot: 'No free slots in the next 2 weeks',
    languages: 'Speaks {languages}',
    emergencyDepartment: '24/7 emergency department',
    emergencyLine: 'Emergency line',
    phone: 'Phone',
    accreditation: '{name} accredited',
  },
  trace: {
    title: 'How this answer was produced',
    tools: {
      assess_urgency: 'Triage rules',
      list_specialties: 'Specialty list',
      search_doctors: 'Doctor search',
      search_hospitals: 'Hospital search',
      get_doctor_availability: 'Availability check',
      submit_response: 'Answer checks',
    } as Record<string, string>,
    ok: 'ok',
    failed: 'rejected',
    results: '{count} results',
    decision: 'decision: {step}',
    problems: 'issues: {problems}',
    corrected: 'Safety checks corrected this answer before it was shown.',
    fallback:
      'A safe default answer was shown because the assistant could not complete the request.',
    model: 'Model: {model}',
  },
  errors: {
    RATE_LIMITED: 'You are sending messages too quickly. Please wait a minute and try again.',
    LLM_UNAVAILABLE: 'The assistant is temporarily unavailable. Please try again in a moment.',
    CONFLICT: 'Your previous message is still being answered, or this conversation is full.',
    NETWORK: 'Could not reach the server. Check your connection and try again.',
    TIMEOUT: 'The answer is taking too long. Please try again.',
    default: 'Something went wrong. Please try again.',
    reference: 'Reference: {id}',
    retry: 'Try again',
    notSent: 'Not sent',
  } as Record<string, string>,
  footer: {
    disclaimer:
      'This assistant gives guidance, not a medical diagnosis. In an emergency, call your local emergency number immediately.',
    demoData: 'Demo data: all doctors and hospitals are fictional.',
  },
};

export type Dictionary = typeof en;

const ar: Dictionary = {
  meta: {
    title: 'مساعد القرار الطبي من HealTrip',
    description:
      'صف أعراضك واحصل على إرشاد للخطوة التالية المناسبة — طوارئ، طبيب متخصص، أو رأي طبي ثانٍ.',
  },
  header: {
    brand: 'HealTrip',
    tagline: 'مساعد القرار الطبي',
    switchLanguage: 'English',
    newConversation: 'محادثة جديدة',
  },
  welcome: {
    title: 'كيف يمكنني مساعدتك اليوم؟',
    body: 'صف ما تشعر به. سأطرح بعض الأسئلة، وأوضح مدى الاستعجال، وأقترح الخطوة التالية المناسبة مع خيارات من شبكة HealTrip.',
    examplesTitle: 'جرّب مثالًا',
    examples: [
      'عندي ألم في صدري ولست متأكدًا هل أذهب لطبيب قلب أم للطوارئ أم أطلب رأيًا ثانيًا.',
      'تم تشخيصي بالذبحة الصدرية وأريد رأيًا طبيًا ثانيًا في القاهرة.',
      'ألم في صدري منذ الصباح ويمتد إلى ذراعي اليسرى.',
    ],
  },
  composer: {
    label: 'رسالتك',
    placeholder: 'صف أعراضك…',
    send: 'إرسال',
    hint: 'Enter للإرسال · Shift+Enter لسطر جديد',
    counter: '{count}/{max}',
  },
  thinking: 'جارٍ تقييم حالتك…',
  nextStep: {
    ER_NOW: 'توجّه إلى الطوارئ الآن',
    URGENT_CARE: 'تقييم طبي في نفس اليوم',
    SPECIALIST: 'زيارة طبيب متخصص',
    SECOND_OPINION: 'الحصول على رأي طبي ثانٍ',
    GP: 'زيارة طبيب باطنة',
    NEED_MORE_INFO: 'بعض الأسئلة أولًا',
  },
  urgency: {
    emergency: 'طارئ',
    urgent: 'عاجل',
    soon: 'قريبًا',
    routine: 'غير عاجل',
    unknown: 'لم يُقيَّم بعد',
  },
  emergency: {
    title: 'قد تكون هذه حالة طارئة',
    body: 'اتصل برقم الطوارئ المحلي أو توجّه إلى أقرب قسم طوارئ الآن. لا تنتظر موعدًا.',
    call: 'اتصل',
    numbers: [
      { country: 'مصر', number: '123' },
      { country: 'الإمارات', number: '998' },
      { country: 'تركيا', number: '112' },
    ],
  },
  questions: { title: 'من فضلك أخبرني:' },
  quickReplies: { label: 'ردود سريعة' },
  cards: {
    doctorsTitle: 'أطباء من شبكة HealTrip',
    hospitalsTitle: 'مستشفيات من شبكة HealTrip',
    experience: 'خبرة {years} سنة',
    rating: 'التقييم {rating}',
    fee: 'الكشف من {fee}',
    secondOpinion: 'رأي ثانٍ',
    teleconsult: 'استشارة بالفيديو',
    nextSlot: 'أقرب موعد: {date}',
    noSlot: 'لا توجد مواعيد متاحة خلال أسبوعين',
    languages: 'يتحدث {languages}',
    emergencyDepartment: 'قسم طوارئ على مدار الساعة',
    emergencyLine: 'خط الطوارئ',
    phone: 'الهاتف',
    accreditation: 'معتمد من {name}',
  },
  trace: {
    title: 'كيف تم تكوين هذه الإجابة',
    tools: {
      assess_urgency: 'قواعد الفرز الطبي',
      list_specialties: 'قائمة التخصصات',
      search_doctors: 'البحث عن أطباء',
      search_hospitals: 'البحث عن مستشفيات',
      get_doctor_availability: 'التحقق من المواعيد',
      submit_response: 'فحوصات الإجابة',
    },
    ok: 'تم',
    failed: 'مرفوض',
    results: '{count} نتيجة',
    decision: 'القرار: {step}',
    problems: 'مشكلات: {problems}',
    corrected: 'قامت فحوصات الأمان بتصحيح هذه الإجابة قبل عرضها.',
    fallback: 'تم عرض إجابة آمنة افتراضية لأن المساعد لم يتمكن من إكمال الطلب.',
    model: 'النموذج: {model}',
  },
  errors: {
    RATE_LIMITED: 'أنت ترسل الرسائل بسرعة كبيرة. انتظر دقيقة ثم حاول مرة أخرى.',
    LLM_UNAVAILABLE: 'المساعد غير متاح مؤقتًا. حاول مرة أخرى بعد قليل.',
    CONFLICT: 'ما زال يتم الرد على رسالتك السابقة، أو أن هذه المحادثة وصلت إلى الحد الأقصى.',
    NETWORK: 'تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.',
    TIMEOUT: 'الإجابة تستغرق وقتًا طويلًا. حاول مرة أخرى.',
    default: 'حدث خطأ ما. حاول مرة أخرى.',
    reference: 'رقم المرجع: {id}',
    retry: 'حاول مرة أخرى',
    notSent: 'لم تُرسل',
  },
  footer: {
    disclaimer:
      'هذا المساعد يقدم إرشادًا وليس تشخيصًا طبيًا. في حالات الطوارئ اتصل برقم الطوارئ المحلي فورًا.',
    demoData: 'بيانات تجريبية: جميع الأطباء والمستشفيات وهميون.',
  },
};

export const LOCALES = ['en', 'ar'] as const satisfies readonly Locale[];

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);

export const dictionaries: Record<Locale, Dictionary> = { en, ar };

export const directionOf = (locale: Locale) => (locale === 'ar' ? 'rtl' : 'ltr');
