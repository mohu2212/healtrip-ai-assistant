import type { Locale } from '@healtrip/shared';
import { SUBMIT_RESPONSE, type Submission } from '../agent/submit-response.tool.js';
import type { LlmMessage, LlmRequest, LlmResponse } from '../llm/llm.types.js';
import type { LlmScript } from '../llm/providers/scripted.provider.js';
import type { TriageResult } from '../triage/triage.schema.js';
import { extractFacts } from './demo-nlu.js';

/**
 * Offline "demo brain" used when LLM_PROVIDER=mock. It plays the model's role with deterministic
 * rules so the product can be demonstrated without an API key — but everything around it is real:
 * tool calls go through the ToolRegistry and database, the triage rules decide urgency, and the
 * answer passes the same grounding and safety checks as a real model's answer.
 *
 * Stateless: every decision is derived from the request (conversation + this turn's tool results).
 */
export const demoLlmScript: LlmScript = (request, callIndex) => {
  const turn = readTurn(request);
  const facts = extractFacts(turn.patientText, turn.alreadyAsked);
  const call = (name: string, input: unknown) => toolCall(`demo_${callIndex}_${name}`, name, input);

  const triage = turn.lastResult<TriageResult>('assess_urgency');
  if (!triage) return call('assess_urgency', facts.triage);

  const t = texts[turn.language];

  if (triage.nextStep === 'NEED_MORE_INFO') {
    return call(SUBMIT_RESPONSE, {
      message: turn.alreadyAsked ? t.askFollowUp : t.askIntro,
      nextStep: 'NEED_MORE_INFO',
      clarifyingQuestions: triage.missingInfo.map((item) => t.questions[item]),
      quickReplies: [...t.quickReplies],
      recommendedDoctorIds: [],
      recommendedHospitalIds: [],
    } satisfies Submission);
  }

  if (triage.nextStep === 'ER_NOW') {
    const hospitals = turn.lastResult<{ hospitals: HospitalView[] }>('search_hospitals');
    if (!hospitals) {
      return call('search_hospitals', {
        hasEmergency: true,
        ...(facts.city ? { city: facts.city } : {}),
        limit: 3,
      });
    }
    const list = hospitals.hospitals.slice(0, 2);
    return call(SUBMIT_RESPONSE, {
      message: [t.emergency(facts.triage.redFlags), ...list.map((h) => t.hospitalLine(h))].join(
        '\n',
      ),
      nextStep: 'ER_NOW',
      clarifyingQuestions: [],
      quickReplies: [],
      recommendedDoctorIds: [],
      recommendedHospitalIds: list.map((h) => h.id),
    } satisfies Submission);
  }

  // Specialist / second opinion / urgent care / GP: find doctors in the recommended specialty.
  const searches = turn.results<{ doctors: DoctorView[] }>('search_doctors');
  const latest = searches.at(-1);
  if (!latest) {
    return call('search_doctors', {
      specialty: triage.recommendedSpecialty ?? 'internal_medicine',
      ...(facts.city ? { city: facts.city } : {}),
      ...(triage.nextStep === 'SECOND_OPINION' ? { offersSecondOpinion: true } : {}),
      limit: 3,
    });
  }
  if (latest.doctors.length === 0 && searches.length === 1 && facts.city) {
    // Nothing in that city: widen the search once instead of giving up.
    return call('search_doctors', {
      specialty: triage.recommendedSpecialty ?? 'internal_medicine',
      ...(triage.nextStep === 'SECOND_OPINION' ? { offersSecondOpinion: true } : {}),
      limit: 3,
    });
  }

  const doctors = latest.doctors.slice(0, 3);
  return call(SUBMIT_RESPONSE, {
    message: doctors.length
      ? [t.recommendIntro(triage), ...doctors.map((d) => t.doctorLine(d)), t.disclaimer].join('\n')
      : `${t.recommendIntro(triage)}\n${t.noMatch}`,
    nextStep: triage.nextStep,
    clarifyingQuestions: [],
    quickReplies: facts.city ? [] : [...t.cityReplies],
    recommendedDoctorIds: doctors.map((d) => d.id),
    recommendedHospitalIds: [],
  } satisfies Submission);
};

// ─── Reading the conversation ────────────────────────────────────────────────────────

interface DoctorView {
  id: string;
  name: { en: string; ar: string };
  title: string;
  hospital: { name: { en: string; ar: string }; city: { en: string; ar: string } };
  rating: number;
  consultationFeeUsd: number;
}
interface HospitalView {
  id: string;
  name: { en: string; ar: string };
  city: { en: string; ar: string };
  emergencyPhone: string | null;
}

const CONTEXT_BLOCK = /\n*<turn_context>[\s\S]*?<\/turn_context>\s*$/;

function readTurn(request: LlmRequest) {
  const { messages } = request;
  // The current turn starts at the last user message carrying the per-turn context block.
  const start = messages.findLastIndex((m) => m.role === 'user' && CONTEXT_BLOCK.test(m.text));
  const current = messages[start] as Extract<LlmMessage, { role: 'user' }>;
  const language: Locale = /reply_language: Arabic/.test(current.text) ? 'ar' : 'en';

  const patientText = messages
    .slice(0, start + 1)
    .filter((m): m is Extract<LlmMessage, { role: 'user' }> => m.role === 'user')
    .map((m) => m.text.replace(CONTEXT_BLOCK, ''))
    .join('\n');
  const alreadyAsked = messages.slice(0, start).some((m) => m.role === 'assistant');

  // Successful tool results of this turn, in order, with the name of the tool that produced them.
  const names = new Map<string, string>();
  const results: { name: string; body: unknown }[] = [];
  for (const m of messages.slice(start + 1)) {
    if (m.role === 'assistant') {
      for (const b of m.blocks) if (b.type === 'tool_call') names.set(b.id, b.name);
    } else if (m.role === 'tool_results') {
      for (const r of m.results) {
        if (!r.isError)
          results.push({ name: names.get(r.toolCallId) ?? '', body: JSON.parse(r.content) });
      }
    }
  }

  return {
    language,
    patientText,
    alreadyAsked,
    results: <T>(name: string) => results.filter((r) => r.name === name).map((r) => r.body as T),
    lastResult: <T>(name: string) =>
      results.filter((r) => r.name === name).at(-1)?.body as T | undefined,
  };
}

function toolCall(id: string, name: string, input: unknown): LlmResponse {
  const blocks = [{ type: 'tool_call' as const, id, name, input }];
  return {
    stopReason: 'tool_use',
    blocks,
    native: { provider: 'mock', content: blocks },
    usage: { inputTokens: 0, outputTokens: 0 },
    model: 'healtrip-demo-brain',
  };
}

// ─── Bilingual copy ─────────────────────────────────────────────────────────────────────

const STEP_LABEL: Record<Locale, Record<string, string>> = {
  en: {
    URGENT_CARE: 'a same-day assessment (please don’t wait more than a few hours)',
    SPECIALIST: 'an appointment with a specialist',
    SECOND_OPINION: 'a second opinion from a specialist',
    GP: 'a visit to an internal-medicine doctor (GP)',
  },
  ar: {
    URGENT_CARE: 'تقييم طبي في نفس اليوم (يُفضَّل ألا تنتظر أكثر من بضع ساعات)',
    SPECIALIST: 'موعد مع طبيب متخصص',
    SECOND_OPINION: 'رأي طبي ثانٍ من طبيب متخصص',
    GP: 'زيارة طبيب باطنة',
  },
};

const RED_FLAG_LABEL: Record<Locale, Record<string, string>> = {
  en: {
    pain_at_rest_over_20_min: 'pain at rest for more than 20 minutes',
    pain_radiating_arm_jaw_back: 'pain spreading to the arm, jaw or back',
    shortness_of_breath: 'shortness of breath',
    cold_sweat: 'cold sweat',
    nausea_vomiting: 'nausea or vomiting',
    fainting_or_near_fainting: 'fainting',
    sudden_severe_onset: 'sudden, severe onset',
    one_sided_weakness_or_speech_difficulty: 'weakness on one side or trouble speaking',
    confusion: 'confusion',
    coughing_blood: 'coughing blood',
  },
  ar: {
    pain_at_rest_over_20_min: 'ألم أثناء الراحة لأكثر من 20 دقيقة',
    pain_radiating_arm_jaw_back: 'ألم يمتد إلى الذراع أو الفك أو الظهر',
    shortness_of_breath: 'ضيق في التنفس',
    cold_sweat: 'عرق بارد',
    nausea_vomiting: 'غثيان أو قيء',
    fainting_or_near_fainting: 'إغماء',
    sudden_severe_onset: 'بداية مفاجئة وشديدة',
    one_sided_weakness_or_speech_difficulty: 'ضعف في جانب واحد أو صعوبة في الكلام',
    confusion: 'تشوش ذهني',
    coughing_blood: 'سعال مصحوب بدم',
  },
};

/** Human-readable list of the red flags the patient reported (from the triage input facts). */
const flagsText = (language: Locale, flags: string[]) =>
  flags.map((f) => RED_FLAG_LABEL[language][f] ?? f).join(language === 'ar' ? '، ' : ', ');

const texts = {
  en: {
    askIntro: 'Thank you for sharing this. To judge how urgent it is, I need a few details:',
    askFollowUp: 'Thanks, that helps. I just need a little more information:',
    questions: {
      red_flags:
        'Does the pain spread to your arm, jaw or back, or do you have shortness of breath, a cold sweat, nausea or fainting?',
      onset: 'When did it start — today, a few days ago, or weeks ago?',
      severity: 'How strong is it on a scale from 0 to 10?',
    },
    quickReplies: ['None of these', 'Started today', 'A few days ago', 'For weeks'],
    cityReplies: ['I am in Cairo', 'I am in Istanbul', 'I am in Dubai'],
    emergency: (flags: string[]) =>
      `What you describe includes warning signs${flags.length ? ` (${flagsText('en', flags)})` : ''}. ` +
      'Please call your local emergency number or go to the nearest emergency department now — do not wait for an appointment. ' +
      'Emergency numbers: Egypt 123, UAE 998, Türkiye 112. Emergency departments in our network:',
    hospitalLine: (h: HospitalView) =>
      `- ${h.name.en} (${h.city.en})${h.emergencyPhone ? ` — emergency line ${h.emergencyPhone}` : ''}`,
    recommendIntro: (t: TriageResult) =>
      `Based on what you shared, the recommended next step is ${STEP_LABEL.en[t.nextStep] ?? t.nextStep}. Options from the HealTrip network:`,
    doctorLine: (d: DoctorView) =>
      `- Dr. ${d.name.en}, ${d.title} at ${d.hospital.name.en} (${d.hospital.city.en}) — rated ${d.rating}, consultation from $${d.consultationFeeUsd}.`,
    noMatch: 'I could not find a matching doctor in the HealTrip network for this request.',
    disclaimer:
      'This is guidance, not a medical diagnosis. If symptoms get worse, seek emergency care.',
  },
  ar: {
    askIntro: 'شكرًا لمشاركتك. لتحديد مدى الاستعجال أحتاج إلى بعض التفاصيل:',
    askFollowUp: 'شكرًا، هذا مفيد. أحتاج فقط إلى معلومات إضافية قليلة:',
    questions: {
      red_flags:
        'هل يمتد الألم إلى الذراع أو الفك أو الظهر، أو تعاني من ضيق في التنفس أو عرق بارد أو غثيان أو إغماء؟',
      onset: 'متى بدأ — اليوم، منذ أيام، أم منذ أسابيع؟',
      severity: 'ما شدته على مقياس من 0 إلى 10؟',
    },
    quickReplies: ['لا شيء من هذا', 'بدأ اليوم', 'منذ أيام', 'منذ أسابيع'],
    cityReplies: ['أنا في القاهرة', 'أنا في إسطنبول', 'أنا في دبي'],
    emergency: (flags: string[]) =>
      `ما تصفه يتضمن علامات تحذيرية${flags.length ? ` (${flagsText('ar', flags)})` : ''}. ` +
      'اتصل برقم الطوارئ المحلي أو توجّه إلى أقرب قسم طوارئ الآن — لا تنتظر موعدًا. ' +
      'أرقام الطوارئ: مصر 123، الإمارات 998، تركيا 112. أقسام الطوارئ في شبكتنا:',
    hospitalLine: (h: HospitalView) =>
      `- ${h.name.ar} (${h.city.ar})${h.emergencyPhone ? ` — خط الطوارئ ${h.emergencyPhone}` : ''}`,
    recommendIntro: (t: TriageResult) =>
      `بناءً على ما ذكرته، الخطوة التالية المقترحة هي ${STEP_LABEL.ar[t.nextStep] ?? t.nextStep}. خيارات من شبكة HealTrip:`,
    doctorLine: (d: DoctorView) =>
      `- د. ${d.name.ar} — ${d.hospital.name.ar} (${d.hospital.city.ar})، التقييم ${d.rating}، الكشف من ${d.consultationFeeUsd}$.`,
    noMatch: 'لم أجد طبيبًا مناسبًا في شبكة HealTrip لهذا الطلب.',
    disclaimer: 'هذه إرشادات وليست تشخيصًا طبيًا. إذا ساءت الأعراض فاطلب الرعاية الطارئة.',
  },
} as const;
