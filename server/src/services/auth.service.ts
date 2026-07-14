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
  const refreshToken = signRefreshToken({ userId: user.id, family });

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
  const refreshToken = signRefreshToken({ userId: user.id, family });

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
  const storedToken = await prisma.refreshToken.findFirst({
    where: { tokenHash },
  });

  if (!storedToken) {
    // Token not found — possibly reuse attack. Revoke entire family.
    await prisma.refreshToken.updateMany({
      where: { family: decoded.family },
      data: { revokedAt: new Date() },
    });
    throw Object.assign(new Error('Refresh token reuse detected'), { statusCode: 401 });
  }

  if (storedToken.revokedAt) {
    // Already revoked — reuse attack. Revoke entire family.
    await prisma.refreshToken.updateMany({
      where: { family: storedToken.family },
      data: { revokedAt: new Date() },
    });
    throw Object.assign(new Error('Refresh token reuse detected'), { statusCode: 401 });
  }

  if (storedToken.expiresAt < new Date()) {
    throw Object.assign(new Error('Refresh token expired'), { statusCode: 401 });
  }

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revokedAt: new Date() },
  });

  // Issue new pair
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.isActive) {
    throw Object.assign(new Error('User not found or deactivated'), { statusCode: 401 });
  }

  const authPayload: AuthPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const newAccessToken = signAccessToken(authPayload);
  const newRefreshToken = signRefreshToken({ userId: user.id, family: storedToken.family });

  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: newTokenHash,
      family: storedToken.family,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
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
