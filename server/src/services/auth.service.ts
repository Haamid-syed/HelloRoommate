import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import type { AuthPayload, LoginResponse } from 'shared';

/**
 * Register a new user. Returns access token + refresh token.
 */
export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  role: 'TENANT' | 'OWNER';
}): Promise<{ user: LoginResponse['user']; accessToken: string; refreshToken: string }> {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
  }

  const passwordHash = await hashPassword(input.password);
  const family = crypto.randomUUID();

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role,
    },
  });

  const authPayload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(authPayload);
  const refreshToken = signRefreshToken({ userId: user.id, family, tokenId: crypto.randomUUID() });

  // Store refresh token hash
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      family,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Login with email + password. Returns access token + refresh token.
 */
export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: LoginResponse['user']; accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  if (!user.isActive) {
    throw Object.assign(new Error('Account has been deactivated'), { statusCode: 403 });
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  const family = crypto.randomUUID();
  const authPayload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(authPayload);
  const refreshToken = signRefreshToken({ userId: user.id, family, tokenId: crypto.randomUUID() });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      family,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh tokens with rotation and reuse detection.
 * If a refresh token is reused, revoke the entire family.
 */
export async function refreshTokens(oldRefreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  let decoded: { userId: string; family: string };

  try {
    decoded = verifyRefreshToken(oldRefreshToken);
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }

  const tokenHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
  const result = await prisma.$transaction(async (tx) => {
    const storedToken = await tx.refreshToken.findFirst({ where: { tokenHash } });

    if (!storedToken || storedToken.revokedAt) {
      // Commit the family revocation before reporting reuse. Throwing inside this
      // transaction would roll the security update back.
      await tx.refreshToken.updateMany({
        where: { family: storedToken?.family ?? decoded.family },
        data: { revokedAt: new Date() },
      });
      return { error: 'reuse' as const };
    }

    if (storedToken.expiresAt < new Date()) {
      return { error: 'expired' as const };
    }

    // Atomic compare-and-set: only one concurrent request can rotate this token.
    const transition = await tx.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });

    if (transition.count !== 1) {
      await tx.refreshToken.updateMany({
        where: { family: storedToken.family },
        data: { revokedAt: new Date() },
      });
      return { error: 'reuse' as const };
    }

    const user = await tx.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) {
      return { error: 'inactive' as const };
    }

    const authPayload: AuthPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = signAccessToken(authPayload);
    const refreshToken = signRefreshToken({
      userId: user.id,
      family: storedToken.family,
      tokenId: crypto.randomUUID(),
    });
    const newTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        family: storedToken.family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  });

  if ('error' in result) {
    const message = result.error === 'expired'
      ? 'Refresh token expired'
      : result.error === 'inactive'
        ? 'User not found or deactivated'
        : 'Refresh token reuse detected';
    throw Object.assign(new Error(message), { statusCode: 401 });
  }

  return result;
}

/**
 * Logout — revoke the refresh token.
 */
export async function logoutUser(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Get the current user's profile.
 */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      tenantProfile: true,
    },
  });

  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  return user;
}
