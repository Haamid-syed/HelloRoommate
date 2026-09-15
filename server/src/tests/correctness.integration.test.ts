import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { refreshTokens, registerUser } from '../services/auth.service.js';
import { persistMessage } from '../services/chat.service.js';
import { acceptInterest } from '../services/interest.service.js';
import { fillListing, searchListings } from '../services/listing.service.js';
import { rateLimiter } from '../middleware/rate-limiter.js';

function suffix(): string {
  return crypto.randomUUID();
}

async function fixture() {
  const key = suffix();
  const owner = await prisma.user.create({
    data: { email: `correct-owner-${key}@local.test`, name: 'Owner', passwordHash: 'test', role: 'OWNER' },
  });
  const tenant = await prisma.user.create({
    data: { email: `correct-tenant-${key}@local.test`, name: 'Tenant', passwordHash: 'test', role: 'TENANT' },
  });
  const profile = await prisma.tenantProfile.create({
    data: {
      userId: tenant.id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Andheri West'],
      budgetMin: 10_000,
      budgetMax: 50_000,
      moveInDate: new Date('2026-10-01'),
    },
  });
  return { owner, tenant, profile };
}

async function cleanupUsers(ids: string[]): Promise<void> {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url.includes('127.0.0.1:55432/roomfinder_benchmark')) {
    throw new Error('Correctness integration tests require the isolated benchmark database');
  }
  await redis.ping();
});

afterAll(async () => {
  await redis.quit();
  await prisma.$disconnect();
});

describe('confirmed correctness fixes and invariants', () => {
  it('globally sorts all score rows and preserves order across cursors', async () => {
    const { owner, tenant, profile } = await fixture();
    const ids = Array.from({ length: 130 }, () => crypto.randomUUID());
    try {
      await prisma.listing.createMany({
        data: ids.map((id, index) => ({
          id,
          ownerId: owner.id,
          title: `Score order ${index}`,
          city: 'Mumbai',
          area: 'Andheri West',
          rent: 20_000,
          availableFrom: new Date('2026-09-01'),
          roomType: 'PRIVATE',
          furnishing: 'FURNISHED',
          createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1_000),
        })),
      });
      await prisma.compatibilityScore.createMany({
        data: ids.map((listingId, index) => ({
          tenantProfileId: profile.id,
          listingId,
          score: index,
          source: 'RULE_BASED',
          inputHash: String(index).padStart(64, '0'),
        })),
      });

      const first = await searchListings({ sort: 'score', limit: 50 }, profile.id);
      const second = await searchListings(
        { sort: 'score', limit: 50, cursor: first.meta.cursor! },
        profile.id
      );
      const scores = [...first.listings, ...second.listings].map((item) => item.score!.score);
      expect(first.listings[0]!.score!.score).toBe(129);
      expect(scores).toEqual([...scores].sort((left, right) => right - left));
      expect(new Set([...first.listings, ...second.listings].map((item) => item.id)).size).toBe(100);
    } finally {
      await cleanupUsers([owner.id, tenant.id]);
    }
  });

  it('counts concurrent same-millisecond rate-limit requests without collisions', async () => {
    const routeGroup = `test-${suffix()}`;
    const ip = '127.0.0.77';
    const limiter = rateLimiter({ windowMs: 60_000, max: 10, routeGroup });
    await redis.del(`ratelimit:${ip}:${routeGroup}`);

    const statuses = await Promise.all(Array.from({ length: 50 }, () => new Promise<number>((resolve, reject) => {
      let statusCode = 200;
      const req = { ip, socket: { remoteAddress: ip } } as any;
      const res = {
        setHeader: () => {},
        status(code: number) { statusCode = code; return this; },
        json() { resolve(statusCode); return this; },
      } as any;
      void limiter(req, res, () => resolve(statusCode)).catch(reject);
    })));

    expect(statuses.filter((status) => status === 200)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(40);
  });

  it('serializes an overlapping fill before acceptance and preserves all invariants', async () => {
    const { owner, tenant, profile } = await fixture();
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.id,
        title: 'Overlapping fill/accept',
        city: 'Mumbai',
        area: 'Andheri West',
        rent: 20_000,
        availableFrom: new Date('2026-09-01'),
        roomType: 'PRIVATE',
        furnishing: 'FURNISHED',
      },
    });
    const interest = await prisma.interest.create({
      data: { tenantProfileId: profile.id, listingId: listing.id, status: 'PENDING' },
    });

    let releaseLock!: () => void;
    let locked!: () => void;
    const lockAcquired = new Promise<void>((resolve) => { locked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listing.id} FOR UPDATE`;
      locked();
      await release;
    });

    try {
      await lockAcquired;
      const fill = fillListing(listing.id, owner.id);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const accept = acceptInterest(owner.id, interest.id);
      releaseLock();
      await blocker;

      const [fillResult, acceptResult] = await Promise.allSettled([fill, accept]);
      expect(fillResult.status).toBe('fulfilled');
      expect(acceptResult.status).toBe('rejected');
      expect((acceptResult as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });

      const [storedListing, storedInterest, conversationCount, outboxCount] = await Promise.all([
        prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }),
        prisma.interest.findUniqueOrThrow({ where: { id: interest.id } }),
        prisma.conversation.count({ where: { interestId: interest.id } }),
        prisma.notificationOutbox.count({ where: { dedupKey: `accepted:${interest.id}` } }),
      ]);
      expect(storedListing.status).toBe('FILLED');
      expect(storedInterest.status).toBe('PENDING');
      expect(conversationCount).toBe(0);
      expect(outboxCount).toBe(0);
    } finally {
      releaseLock();
      await blocker.catch(() => {});
      await cleanupUsers([owner.id, tenant.id]);
    }
  });

  it('persists one message row for 50 concurrent duplicate client IDs', async () => {
    const { owner, tenant, profile } = await fixture();
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.id, title: 'Message dedup', city: 'Mumbai', area: 'Powai', rent: 20_000,
        availableFrom: new Date('2026-09-01'), roomType: 'PRIVATE', furnishing: 'FURNISHED',
      },
    });
    const interest = await prisma.interest.create({
      data: { tenantProfileId: profile.id, listingId: listing.id, status: 'ACCEPTED' },
    });
    const conversation = await prisma.conversation.create({ data: { interestId: interest.id } });
    const clientMsgId = crypto.randomUUID();
    try {
      const results = await Promise.all(Array.from({ length: 50 }, () => persistMessage({
        conversationId: conversation.id,
        senderId: tenant.id,
        body: 'Retry-safe message',
        clientMsgId,
      })));
      expect(new Set(results.map((message) => message.id)).size).toBe(1);
      expect(await prisma.message.count({ where: { conversationId: conversation.id, clientMsgId } })).toBe(1);
    } finally {
      await cleanupUsers([owner.id, tenant.id]);
    }
  });

  it('detects concurrent refresh-token replay and revokes the entire family', async () => {
    const key = suffix();
    const registered = await registerUser({
      email: `refresh-${key}@local.test`,
      password: 'benchmark-password',
      name: 'Refresh Test',
      role: 'TENANT',
    });
    try {
      const results = await Promise.allSettled([
        refreshTokens(registered.refreshToken),
        refreshTokens(registered.refreshToken),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const tokens = await prisma.refreshToken.findMany({ where: { userId: registered.user.id } });
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);

      const issued = results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<{
        accessToken: string;
        refreshToken: string;
      }>;
      await expect(refreshTokens(issued.value.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    } finally {
      await cleanupUsers([registered.user.id]);
    }
  });
});
