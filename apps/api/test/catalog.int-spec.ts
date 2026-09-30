import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './create-test-app.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Verifies the real Prisma queries (filters, ordering, slot rules) against the seeded catalog.
 * Run: TEST_DATABASE_URL=… pnpm --filter @healtrip/api test:int  (after db:migrate + db:seed)
 */
describe.skipIf(!TEST_DATABASE_URL)('Catalog queries (integration, seeded DB)', () => {
  let app: NestExpressApplication;
  const ids = (body: { data: { id: string }[] }) => body.data.map((x) => x.id);

  beforeAll(async () => {
    ({ app } = await createTestApp({
      realDatabase: true,
      env: { DATABASE_URL: TEST_DATABASE_URL! },
    }));
  });
  afterAll(() => app?.close());

  const get = (url: string) => request(app.getHttpServer()).get(url).expect(200);

  it('finds Cairo cardiologists offering second opinions, best rated first', async () => {
    const res = await get('/api/doctors?specialty=cardiology&city=cairo&offersSecondOpinion=true');
    expect(ids(res.body)).toEqual(['doc_001', 'doc_002']);
  });

  it('matches the city by its Arabic name too', async () => {
    const res = await get(
      `/api/doctors?specialty=cardiology&city=${encodeURIComponent('القاهرة')}&offersSecondOpinion=true`,
    );
    expect(ids(res.body)).toEqual(['doc_001', 'doc_002']);
  });

  it('filters by spoken language and fee', async () => {
    const turkish = await get('/api/doctors?language=tr');
    for (const d of turkish.body.data) expect(d.languages).toContain('tr');

    const cheap = await get('/api/doctors?specialty=cardiology&maxFeeUsd=60');
    expect(ids(cheap.body)).toEqual(['doc_001', 'doc_002', 'doc_005']);
  });

  it('returns an empty list (not an error) when valid filters match nothing', async () => {
    const res = await get('/api/doctors?specialty=oncology&city=Dubai');
    expect(res.body).toEqual({ data: [], meta: { count: 0, limit: 10 } });
  });

  it('filters hospitals by emergency department and specialty', async () => {
    expect(ids((await get('/api/hospitals?hasEmergency=false')).body).sort()).toEqual([
      'hosp_04',
      'hosp_06',
    ]);
    expect(
      ids((await get('/api/hospitals?city=Dubai&hasEmergency=true&specialty=cardiology')).body),
    ).toEqual(['hosp_05']);
  });

  it('fetches a batch by IDs (used to render recommendation cards)', async () => {
    const res = await get('/api/doctors?ids=doc_013,doc_001');
    expect(ids(res.body).sort()).toEqual(['doc_001', 'doc_013']);
  });

  it('only exposes future, unbooked slots in chronological order', async () => {
    const res = await get('/api/doctors/doc_001');
    const slots: { startsAt: string }[] = res.body.data.upcomingSlots;
    expect(slots.length).toBeGreaterThan(0);
    const times = slots.map((s) => Date.parse(s.startsAt));
    expect(times.every((t) => t > Date.now())).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
