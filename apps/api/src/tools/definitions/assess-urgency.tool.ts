import { assessUrgency } from '../../triage/triage-rules.js';
import { AssessUrgencyInputSchema, type TriageResult } from '../../triage/triage.schema.js';
import { defineTool } from '../tool.types.js';

export const assessUrgencyTool = defineTool({
  name: 'assess_urgency',
  description:
    "Decides how urgent the patient's situation is and the recommended next step, using clinical " +
    'triage rules. Call it as soon as you know the main symptom, and again whenever the patient ' +
    'gives new information. Report only what the patient actually said. Its decision is binding: ' +
    'if it returns ER_NOW you must tell the patient to seek emergency care now. If it returns ' +
    'NEED_MORE_INFO, ask about the items in `missingInfo`.',
  inputSchema: AssessUrgencyInputSchema,
  strict: true, // every property is required (nullable where unknown), so strict mode applies
  async run(input, { evidence }) {
    const result = assessUrgency(input);
    evidence.recordTriage(result);
    return result;
  },
  summarize: (output) => {
    const t = output as TriageResult;
    return { level: t.level, nextStep: t.nextStep, rules: t.reasons.map((r) => r.rule) };
  },
});
