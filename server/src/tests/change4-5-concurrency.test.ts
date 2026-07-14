/**
 * Tests for Changes 4 & 5: Concurrency races
 *
 * Change 4: Concurrent interest creation — both requests must get same interest ID
 * Change 5: Concurrent fill + accept — only one succeeds; no double-booking
 *
 * These tests use the real DB (PostgreSQL) — they require a running Postgres instance.
 * Run with: DATABASE_URL=... npx vitest run
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../lib/prisma.js';

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
async function createTestOwner(suffix: string) {
  return prisma.user.create({
    data: {
      email: `race-owner-${suffix}-${Date.now()}@test.local`,
      name: `Race Owner ${suffix}`,
      passwordHash: 'test-hash',
      role: 'OWNER',
    },
  });
}

async function createTestTenant(suffix: string) {
  return prisma.user.create({
    data: {
      email: `race-tenant-${suffix}-${Date.now()}@test.local`,
      name: `Race Tenant ${suffix}`,
      passwordHash: 'test-hash',
      role: 'TENANT',
    },
  });
}

async function createTestListing(ownerId: string) {
  return prisma.listing.create({
    data: {
      ownerId,
      title: 'Race Test Listing',
      city: 'Mumbai',
      area: 'Andheri W',
      rent: 18000,
      availableFrom: new Date('2026-08-01'),
      roomType: 'PRIVATE',
      furnishing: 'SEMI_FURNISHED',
    },
  });
}

async function createTestProfile(tenantUserId: string) {
  return prisma.tenantProfile.create({
    data: {
      userId: tenantUserId,
      preferredCity: 'Mumbai',
      preferredAreas: ['Andheri W'],
      budgetMin: 15000,
      budgetMax: 22000,
      moveInDate: new Date('2026-08-01'),
    },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Change 4: Concurrent interest creation (TOCTOU test)
// ──────────────────────────────────────────────────────────────────────
describe('Change 4 — Concurrent interest creation (partial unique index)', () => {
  it('two concurrent createInterest calls return the same interest ID and create exactly one DB row', async () => {
    const { createInterest } = await import('../services/interest.service.js');

    const owner = await createTestOwner('c4');
    const tenant = await createTestTenant('c4');
    const listing = await createTestListing(owner.id);
    await createTestProfile(tenant.id);

    // Add compatibility score so createInterest can proceed
    const profile = await prisma.tenantProfile.findUniqueOrThrow({ where: { userId: tenant.id } });
    await prisma.compatibilityScore.create({
      data: {
        tenantProfileId: profile.id,
        listingId: listing.id,
        score: 75,
        source: 'RULE_BASED',
        inputHash: 'test-hash',
        computedAt: new Date(),
      },
    });

    // Fire two concurrent requests
    const [r1, r2] = await Promise.all([
      createInterest(tenant.id, listing.id),
      createInterest(tenant.id, listing.id),
    ]);

    // Both must return the same interest
    expect(r1.id).toBe(r2.id);
    expect(r1.status).toBe('PENDING');

    // Exactly one DB row for this (tenant, listing) with PENDING or ACCEPTED
    const rows = await prisma.interest.findMany({
      where: {
        tenantProfileId: profile.id,
        listingId: listing.id,
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
    });
    expect(rows).toHaveLength(1);

    // Cleanup
    await prisma.interest.deleteMany({ where: { tenantProfileId: profile.id, listingId: listing.id } });
    await prisma.compatibilityScore.deleteMany({ where: { tenantProfileId: profile.id, listingId: listing.id } });
    await prisma.tenantProfile.delete({ where: { id: profile.id } });
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, tenant.id] } } });
  });

  it('DECLINED interest does NOT block a new interest for the same (tenant, listing) pair', async () => {
    const { createInterest } = await import('../services/interest.service.js');
    const owner = await createTestOwner('c4-declined');
    const tenant = await createTestTenant('c4-declined');
    const listing = await createTestListing(owner.id);
    const profile = await createTestProfile(tenant.id);

    await prisma.compatibilityScore.create({
      data: {
        tenantProfileId: profile.id,
        listingId: listing.id,
        score: 60,
        source: 'RULE_BASED',
        inputHash: 'test-hash-declined',
        computedAt: new Date(),
      },
    });

    // Create and immediately decline
    const interest1 = await createInterest(tenant.id, listing.id);
    await prisma.interest.update({
      where: { id: interest1.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });

    // Should be able to create a new interest after DECLINED
    const interest2 = await createInterest(tenant.id, listing.id);
    expect(interest2.id).not.toBe(interest1.id);
    expect(interest2.status).toBe('PENDING');

    // Cleanup
    await prisma.interest.deleteMany({ where: { tenantProfileId: profile.id } });
    await prisma.compatibilityScore.deleteMany({ where: { tenantProfileId: profile.id } });
    await prisma.tenantProfile.delete({ where: { id: profile.id } });
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, tenant.id] } } });
  });
});

// ──────────────────────────────────────────────────────────────────────
// Change 5: Listing fill race condition
// ──────────────────────────────────────────────────────────────────────
describe('Change 5 — Listing fill race condition (conditional UPDATE)', () => {
  it('two concurrent fillListing calls: exactly one succeeds, one gets 409', async () => {
    const { fillListing } = await import('../services/listing.service.js');

    const owner = await createTestOwner('c5-fill');
    const listing = await createTestListing(owner.id);

    const [r1, r2] = await Promise.allSettled([
      fillListing(listing.id, owner.id),
      fillListing(listing.id, owner.id),
    ]);

    const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
    const failures = [r1, r2].filter((r) => r.status === 'rejected');

    // Exactly one succeeds
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // The failure must be 409 (not 500)
    const err = (failures[0] as PromiseRejectedResult).reason as { statusCode?: number; message?: string };
    expect(err.statusCode).toBe(409);

    // Listing should now be FILLED
    const final = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(final.status).toBe('FILLED');

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { entityId: listing.id } });
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  it('fillListing returns 409 (not 400) for already-filled listing', async () => {
    const { fillListing } = await import('../services/listing.service.js');

    const owner = await createTestOwner('c5-alreadyfilled');
    const listing = await createTestListing(owner.id);

    // Fill once
    await fillListing(listing.id, owner.id);

    // Try to fill again
    await expect(fillListing(listing.id, owner.id)).rejects.toMatchObject({
      statusCode: 409,
    });

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { entityId: listing.id } });
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  it('acceptInterest rejects with 409 when listing was filled in the meantime', async () => {
    const { acceptInterest } = await import('../services/interest.service.js');
    const { fillListing } = await import('../services/listing.service.js');

    const owner = await createTestOwner('c5-accept-race');
    const tenant = await createTestTenant('c5-accept-race');
    const listing = await createTestListing(owner.id);
    const profile = await createTestProfile(tenant.id);

    await prisma.compatibilityScore.create({
      data: {
        tenantProfileId: profile.id,
        listingId: listing.id,
        score: 70,
        source: 'RULE_BASED',
        inputHash: 'test-hash-accept',
        computedAt: new Date(),
      },
    });

    // Create a pending interest
    const interest = await prisma.interest.create({
      data: {
        tenantProfileId: profile.id,
        listingId: listing.id,
        status: 'PENDING',
        scoreAtInterest: 70,
      },
    });

    // Fill the listing BEFORE accepting the interest
    await fillListing(listing.id, owner.id);

    // Now try to accept — should fail with 409
    await expect(acceptInterest(owner.id, interest.id)).rejects.toMatchObject({
      statusCode: 409,
    });

    // No conversation should have been created
    const conversations = await prisma.conversation.findMany({ where: { interestId: interest.id } });
    expect(conversations).toHaveLength(0);

    // Cleanup
    await prisma.notificationOutbox.deleteMany({ where: { userId: owner.id } });
    await prisma.interest.delete({ where: { id: interest.id } });
    await prisma.compatibilityScore.deleteMany({ where: { tenantProfileId: profile.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [listing.id, interest.id] } } });
    await prisma.tenantProfile.delete({ where: { id: profile.id } });
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, tenant.id] } } });
  });
});
