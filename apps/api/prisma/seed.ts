/**
 * Seeds the mock catalog. Run with `pnpm --filter @healtrip/api db:seed`.
 *
 * Idempotent: a single transaction replaces the catalog tables (specialties, hospitals, doctors,
 * availability). Conversation / message / audit tables are never touched.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  buildAvailabilitySlots,
  doctors,
  hospitalSpecialties,
  hospitals,
  specialties,
} from './seed-data.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const slots = buildAvailabilitySlots(new Date());

  await prisma.$transaction(
    async (tx) => {
      // Delete children before parents (FK order).
      await tx.availabilitySlot.deleteMany();
      await tx.doctor.deleteMany();
      await tx.hospitalSpecialty.deleteMany();
      await tx.hospital.deleteMany();
      await tx.specialty.deleteMany();

      await tx.specialty.createMany({ data: specialties });
      await tx.hospital.createMany({ data: hospitals });
      await tx.hospitalSpecialty.createMany({ data: hospitalSpecialties });
      await tx.doctor.createMany({ data: doctors });
      await tx.availabilitySlot.createMany({ data: slots });
    },
    { timeout: 30_000 },
  );

  console.table({
    specialties: await prisma.specialty.count(),
    hospitals: await prisma.hospital.count(),
    hospitalSpecialties: await prisma.hospitalSpecialty.count(),
    doctors: await prisma.doctor.count(),
    availabilitySlots: await prisma.availabilitySlot.count(),
  });
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
