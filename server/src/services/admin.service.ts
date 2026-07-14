import type { PaginationInput } from 'shared';
import { prisma } from '../lib/prisma.js';

export async function getUsers(params: PaginationInput) {
  const limit = params.limit ?? 20;
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = users.length > limit;
  if (hasMore) users.pop();

  return {
    users,
    meta: {
      cursor: users.length > 0 ? users[users.length - 1]!.id : null,
      hasMore,
    },
  };
}

export async function updateUserStatus(actorId: string, targetUserId: string, isActive: boolean) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!isActive) {
      await tx.refreshToken.deleteMany({ where: { userId: targetUserId } });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'USER_STATUS_UPDATE',
        entityType: 'USER',
        entityId: targetUserId,
        meta: { isActive },
      },
    });

    return user;
  });
}

export async function getListings(params: PaginationInput) {
  const limit = params.limit ?? 20;
  const listings = await prisma.listing.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true } },
      photos: { orderBy: { position: 'asc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = listings.length > limit;
  if (hasMore) listings.pop();

  return {
    listings,
    meta: {
      cursor: listings.length > 0 ? listings[listings.length - 1]!.id : null,
      hasMore,
    },
  };
}

export async function moderateListing(actorId: string, listingId: string) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({ where: { id: listingId } });

    if (!listing) {
      throw Object.assign(new Error('Listing not found'), { statusCode: 404 });
    }

    const updatedListing = await tx.listing.update({
      where: { id: listingId },
      data: { status: 'REMOVED' },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        photos: { orderBy: { position: 'asc' }, take: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'LISTING_MODERATED',
        entityType: 'LISTING',
        entityId: listingId,
        meta: { previousStatus: listing.status },
      },
    });

    return updatedListing;
  });
}

export async function getActivityLogs(params: PaginationInput) {
  const limit = params.limit ?? 20;
  const logs = await prisma.auditLog.findMany({
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > limit;
  if (hasMore) logs.pop();

  return {
    logs,
    meta: {
      cursor: logs.length > 0 ? logs[logs.length - 1]!.id : null,
      hasMore,
    },
  };
}

export async function getMetrics() {
  const [
    totalUsers,
    totalOwners,
    totalTenants,
    totalListings,
    activeListings,
    totalInterests,
    totalMessages,
    pendingNotifications,
    failedNotifications,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'OWNER' } }),
    prisma.user.count({ where: { role: 'TENANT' } }),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: 'ACTIVE' } }),
    prisma.interest.count(),
    prisma.message.count(),
    prisma.notificationOutbox.count({ where: { status: 'PENDING' } }),
    prisma.notificationOutbox.count({ where: { status: 'FAILED' } }),
  ]);

  return {
    totalUsers,
    totalOwners,
    totalTenants,
    totalListings,
    activeListings,
    totalInterests,
    totalMessages,
    pendingNotifications,
    failedNotifications,
  };
}

export async function getNotifications(params: PaginationInput) {
  const limit = params.limit ?? 20;
  const notifications = await prisma.notificationOutbox.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });

  const hasMore = notifications.length > limit;
  if (hasMore) notifications.pop();

  return {
    notifications,
    meta: {
      cursor: notifications.length > 0 ? notifications[notifications.length - 1]!.id : null,
      hasMore,
    },
  };
}

export async function retryNotification(actorId: string, notificationId: string) {
  return prisma.$transaction(async (tx) => {
    const notification = await tx.notificationOutbox.findUnique({ where: { id: notificationId } });

    if (!notification) {
      throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
    }

    if (notification.status !== 'FAILED') {
      throw Object.assign(new Error('Only failed notifications can be retried'), { statusCode: 400 });
    }

    const updatedNotification = await tx.notificationOutbox.update({
      where: { id: notificationId },
      data: { status: 'PENDING', attempts: 0, lastError: null },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'NOTIFICATION_RETRY',
        entityType: 'NOTIFICATION',
        entityId: notificationId,
      },
    });

    return updatedNotification;
  });
}
