import type {
  AssistantMessageDto,
  AssistantReply,
  ConversationDto,
  DoctorDto,
  HospitalDto,
  SendMessageResult,
} from '@healtrip/shared';

export const doctor: DoctorDto = {
  id: 'doc_001',
  name: { en: 'Ahmed Mansour', ar: 'أحمد منصور' },
  title: { en: 'Consultant Cardiologist', ar: 'استشاري أمراض القلب' },
  specialty: { code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } },
  subspecialty: null,
  hospital: {
    id: 'hosp_01',
    name: { en: 'Nile Heart & Vascular Institute', ar: 'معهد النيل للقلب والأوعية الدموية' },
    city: { en: 'Cairo', ar: 'القاهرة' },
    country: 'EG',
    hasEmergency: true,
  },
  languages: ['ar', 'en'],
  yearsExperience: 18,
  rating: 4.8,
  consultationFeeUsd: 60,
  offersSecondOpinion: true,
  offersTeleconsult: false,
  nextAvailableSlot: { startsAt: '2026-10-02T08:00:00.000Z', durationMin: 30, mode: 'IN_PERSON' },
};

export const hospital: HospitalDto = {
  id: 'hosp_05',
  name: { en: 'Gulf Specialist Hospital', ar: 'مستشفى الخليج التخصصي' },
  city: { en: 'Dubai', ar: 'دبي' },
  country: 'AE',
  hasEmergency: true,
  emergencyPhone: '+971 4 555 0500',
  phone: '+971 4 555 0501',
  accreditation: 'JCI',
  rating: 4.6,
  specialties: [{ code: 'cardiology', name: { en: 'Cardiology', ar: 'أمراض القلب' } }],
};

export function reply(overrides: Partial<AssistantReply> = {}): AssistantReply {
  return {
    message: 'A cardiologist is the right next step.',
    language: 'en',
    nextStep: 'SPECIALIST',
    urgency: 'routine',
    emergency: false,
    clarifyingQuestions: [],
    quickReplies: [],
    recommendedDoctorIds: ['doc_001'],
    recommendedHospitalIds: [],
    ...overrides,
  };
}

export function assistantMessage(
  overrides: Partial<AssistantMessageDto> = {},
): AssistantMessageDto {
  return {
    id: 'm2',
    role: 'assistant',
    reply: reply(),
    doctors: [doctor],
    hospitals: [],
    trace: [
      { tool: 'assess_urgency', ok: true, latencyMs: 1, summary: { nextStep: 'SPECIALIST' } },
      { tool: 'search_doctors', ok: true, latencyMs: 30, summary: { count: 1, ids: ['doc_001'] } },
    ],
    meta: { outcome: 'completed', fallbackReason: null, model: 'test-model' },
    createdAt: '2026-10-01T10:00:01.000Z',
    ...overrides,
  };
}

export function sendResult(text: string, assistant = assistantMessage()): SendMessageResult {
  return {
    userMessage: { id: 'm1', role: 'user', text, createdAt: '2026-10-01T10:00:00.000Z' },
    assistantMessage: assistant,
  };
}

export const emptyConversation: ConversationDto = {
  id: '11111111-1111-4111-8111-111111111111',
  locale: 'en',
  createdAt: '2026-10-01T09:59:00.000Z',
  messages: [],
};
