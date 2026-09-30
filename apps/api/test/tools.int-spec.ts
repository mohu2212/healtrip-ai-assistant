import type { NestExpressApplication } from '@nestjs/platform-express';
import { EvidenceRegistry } from '../src/tools/evidence.js';
import { ToolRegistry } from '../src/tools/tool-registry.js';
import { createTestApp } from './create-test-app.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** The agent's tools, executed exactly as the agent will, against the seeded catalog. */
describe.skipIf(!TEST_DATABASE_URL)('Agent tools (integration, seeded DB)', () => {
  let app: NestExpressApplication;
  let registry: ToolRegistry;

  beforeAll(async () => {
    ({ app } = await createTestApp({
      realDatabase: true,
      env: { DATABASE_URL: TEST_DATABASE_URL! },
    }));
    registry = app.get(ToolRegistry);
  });
  afterAll(() => app?.close());

  it('chest-pain second opinion in Cairo: finds the right cardiologists and records evidence', async () => {
    const evidence = new EvidenceRegistry();
    const { result } = await registry.execute(
      {
        id: 'c1',
        name: 'search_doctors',
        input: { specialty: 'cardiology', city: 'Cairo', offersSecondOpinion: true },
      },
      { evidence },
    );
    const body = JSON.parse(result.content);
    expect(body.doctors.map((d: { id: string }) => d.id)).toEqual(['doc_001', 'doc_002']);
    expect(evidence.doctorIds()).toEqual(['doc_001', 'doc_002']);
    expect(evidence.hasHospital('hosp_01')).toBe(true);
  });

  it('emergency hospitals in Dubai', async () => {
    const evidence = new EvidenceRegistry();
    const { result } = await registry.execute(
      { id: 'c2', name: 'search_hospitals', input: { city: 'دبي', hasEmergency: true } },
      { evidence },
    );
    expect(JSON.parse(result.content).hospitals.map((h: { id: string }) => h.id)).toEqual([
      'hosp_05',
    ]);
  });

  it('unknown specialty → error result listing the valid codes', async () => {
    const { result } = await registry.execute(
      { id: 'c3', name: 'search_doctors', input: { specialty: 'cardiac_surgery' } },
      { evidence: new EvidenceRegistry() },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('cardiology');
  });
});
