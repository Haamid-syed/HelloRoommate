import { PrismaClient, type Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { performance } from 'node:perf_hooks';

const prisma = new PrismaClient();
const LISTING_COUNT = Number(process.env['BENCH_LISTINGS'] ?? 10_000);
const MESSAGE_COUNT = Number(process.env['BENCH_MESSAGES'] ?? 100_000);
const BATCH_SIZE = 1_000;

const IDS = {
  owner: '00000000-0000-4000-8000-000000000001',
  tenant: '00000000-0000-4000-8000-000000000002',
  secondTenant: '00000000-0000-4000-8000-000000000003',
  profile: '20000000-0000-4000-8000-000000000001',
  secondProfile: '20000000-0000-4000-8000-000000000002',
  interest: '30000000-0000-4000-8000-000000000001',
  conversation: '40000000-0000-4000-8000-000000000001',
} as const;

function indexedUuid(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function listingId(index: number): string {
  return indexedUuid('10000000', index);
}

function messageId(index: number): string {
  return indexedUuid('50000000', index);
}

function clientMessageId(index: number): string {
  return indexedUuid('60000000', index);
}

async function insertBatches<T>(
  rows: T[],
  insert: (batch: T[]) => Promise<unknown>
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await insert(rows.slice(start, start + BATCH_SIZE));
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  if (!databaseUrl.includes('127.0.0.1:55432/roomfinder_benchmark')) {
    throw new Error('Refusing to seed: DATABASE_URL is not the isolated benchmark database');
  }

  const startedAt = performance.now();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    messages, conversations, interests, compatibility_scores, listing_photos,
    listings, tenant_profiles, refresh_tokens, notifications_outbox, audit_logs, users
    RESTART IDENTITY CASCADE`);

  const passwordHash = await argon2.hash('benchmark-password');
  await prisma.user.createMany({
    data: [
      { id: IDS.owner, email: 'bench-owner@local.test', name: 'Benchmark Owner', passwordHash, role: 'OWNER' },
      { id: IDS.tenant, email: 'bench-tenant@local.test', name: 'Benchmark Tenant', passwordHash, role: 'TENANT' },
      { id: IDS.secondTenant, email: 'bench-tenant-2@local.test', name: 'Benchmark Tenant Two', passwordHash, role: 'TENANT' },
    ],
  });
  await prisma.tenantProfile.createMany({
    data: [
      {
        id: IDS.profile,
        userId: IDS.tenant,
        preferredCity: 'Mumbai',
        preferredAreas: ['Andheri West', 'Bandra West'],
        budgetMin: 12_000,
        budgetMax: 40_000,
        moveInDate: new Date('2026-10-01T00:00:00.000Z'),
      },
      {
        id: IDS.secondProfile,
        userId: IDS.secondTenant,
        preferredCity: 'Mumbai',
        preferredAreas: ['Andheri West'],
        budgetMin: 12_000,
        budgetMax: 40_000,
        moveInDate: new Date('2026-10-01T00:00:00.000Z'),
      },
    ],
  });

  const listings: Prisma.ListingCreateManyInput[] = Array.from({ length: LISTING_COUNT }, (_, offset) => {
    const index = offset + 1;
    return {
      id: listingId(index),
      ownerId: IDS.owner,
      title: `Synthetic room ${index}`,
      city: index % 10 === 0 ? 'Pune' : 'Mumbai',
      area: ['Andheri West', 'Bandra West', 'Powai', 'Dadar', 'Chembur'][index % 5]!,
      rent: 12_000 + (index % 281) * 100,
      availableFrom: new Date(Date.UTC(2026, 8, 1 + (index % 28))),
      roomType: ['PRIVATE', 'SHARED', 'STUDIO', 'ONE_BHK', 'TWO_BHK'][index % 5] as Prisma.ListingCreateManyInput['roomType'],
      furnishing: ['UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED'][index % 3] as Prisma.ListingCreateManyInput['furnishing'],
      description: `Deterministic synthetic benchmark listing ${index}`,
      status: index % 20 === 0 ? 'FILLED' : 'ACTIVE',
      createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1_000),
      updatedAt: new Date(Date.UTC(2026, 0, 1) + index * 1_000),
    };
  });
  await insertBatches(listings, (data) => prisma.listing.createMany({ data }));

  const scores: Prisma.CompatibilityScoreCreateManyInput[] = listings.map((listing, offset) => ({
    tenantProfileId: IDS.profile,
    listingId: listing.id!,
    score: ((offset + 1) * 37) % 101,
    source: 'RULE_BASED',
    inputHash: String(offset + 1).padStart(64, '0').slice(-64),
    computedAt: new Date('2026-09-01T00:00:00.000Z'),
  }));
  await insertBatches(scores, (data) => prisma.compatibilityScore.createMany({ data }));

  await prisma.interest.create({
    data: {
      id: IDS.interest,
      tenantProfileId: IDS.profile,
      listingId: listingId(1),
      status: 'ACCEPTED',
      scoreAtInterest: 37,
      respondedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  });
  await prisma.conversation.create({
    data: { id: IDS.conversation, interestId: IDS.interest },
  });

  const baseMessageTime = Date.UTC(2026, 0, 1);
  const messages: Prisma.MessageCreateManyInput[] = Array.from({ length: MESSAGE_COUNT }, (_, offset) => {
    const index = offset + 1;
    return {
      id: messageId(index),
      conversationId: IDS.conversation,
      senderId: index % 2 === 0 ? IDS.owner : IDS.tenant,
      body: `Synthetic benchmark message ${index}`,
      clientMsgId: clientMessageId(index),
      createdAt: new Date(baseMessageTime + index * 1_000),
      readAt: index <= MESSAGE_COUNT - 100 ? new Date(baseMessageTime + index * 1_000 + 500) : null,
    };
  });
  await insertBatches(messages, (data) => prisma.message.createMany({ data }));

  await prisma.$executeRawUnsafe('ANALYZE');
  const elapsedSeconds = (performance.now() - startedAt) / 1_000;
  process.stdout.write(`${JSON.stringify({
    database: 'roomfinder_benchmark@127.0.0.1:55432',
    listings: LISTING_COUNT,
    compatibilityScores: scores.length,
    messages: MESSAGE_COUNT,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    credentials: { email: 'bench-tenant@local.test', password: 'benchmark-password' },
    conversationId: IDS.conversation,
    deepMessageCursor: messageId(Math.floor(MESSAGE_COUNT / 2)),
  }, null, 2)}\n`);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
