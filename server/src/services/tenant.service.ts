import type { Prisma } from '@prisma/client';
import type { UpsertTenantProfileInput } from 'shared';
import { prisma } from '../lib/prisma.js';

/** Create or update the authenticated tenant's matching preferences. */
export async function upsertTenantProfile(userId: string, input: UpsertTenantProfileInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  if (user.role !== 'TENANT') {
    throw Object.assign(new Error('Only tenants can manage a tenant profile'), { statusCode: 403 });
  }

  const preferences = (input.preferences ?? {}) as Prisma.InputJsonValue;

  return prisma.tenantProfile.upsert({
    where: { userId },
    create: {
      userId,
      preferredCity: input.preferredCity,
      preferredAreas: input.preferredAreas,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      moveInDate: new Date(input.moveInDate),
      preferences,
    },
    update: {
      preferredCity: input.preferredCity,
      preferredAreas: input.preferredAreas,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      moveInDate: new Date(input.moveInDate),
      preferences,
    },
  });
}

/** A missing profile is valid until a tenant has set up their search preferences. */
export async function getTenantProfile(userId: string) {
  return prisma.tenantProfile.findUnique({ where: { userId } });
}
