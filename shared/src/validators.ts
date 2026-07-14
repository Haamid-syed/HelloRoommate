import { z } from 'zod';
import { ROLES, ROOM_TYPES, FURNISHING } from './constants.js';

// ============================================
// Auth Validators
// ============================================

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum([ROLES.TENANT, ROLES.OWNER], {
    errorMap: () => ({ message: 'Role must be TENANT or OWNER' }),
  }),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ============================================
// Listing Validators
// ============================================

export const createListingSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  city: z.string().min(2, 'City is required').max(100),
  area: z.string().min(2, 'Area is required').max(100),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  rent: z.number().int().positive('Rent must be a positive number'),
  availableFrom: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  roomType: z.enum([
    ROOM_TYPES.PRIVATE,
    ROOM_TYPES.SHARED,
    ROOM_TYPES.STUDIO,
    ROOM_TYPES.ONE_BHK,
    ROOM_TYPES.TWO_BHK,
  ]),
  furnishing: z.enum([
    FURNISHING.UNFURNISHED,
    FURNISHING.SEMI_FURNISHED,
    FURNISHING.FURNISHED,
  ]),
  description: z.string().max(2000).optional().default(''),
  photoUrls: z.array(z.string().url()).max(10).optional().default([]),
});

export const updateListingSchema = createListingSchema.partial();

// ============================================
// Tenant Profile Validators
// ============================================

export const upsertTenantProfileSchema = z.object({
  preferredCity: z.string().min(2, 'City is required').max(100),
  preferredAreas: z.array(z.string().min(1).max(100)).min(1, 'At least one area is required').max(10),
  budgetMin: z.number().int().positive('Minimum budget must be positive'),
  budgetMax: z.number().int().positive('Maximum budget must be positive'),
  moveInDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  preferences: z.record(z.unknown()).optional().default({}),
}).refine((data) => data.budgetMin <= data.budgetMax, {
  message: 'Minimum budget must be less than or equal to maximum budget',
  path: ['budgetMin'],
});

// ============================================
// Interest Validators
// ============================================

export const createInterestSchema = z.object({
  listingId: z.string().uuid('Invalid listing ID'),
});

// ============================================
// Chat Validators
// ============================================

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
  clientMsgId: z.string().uuid('Invalid client message ID'),
  body: z.string().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
});

// ============================================
// Admin Validators
// ============================================

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// ============================================
// Pagination
// ============================================

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const listingsFilterSchema = paginationSchema.extend({
  city: z.string().optional(),
  minRent: z.coerce.number().int().positive().optional(),
  maxRent: z.coerce.number().int().positive().optional(),
  availableFrom: z.string().optional(),
  roomType: z.enum([
    ROOM_TYPES.PRIVATE,
    ROOM_TYPES.SHARED,
    ROOM_TYPES.STUDIO,
    ROOM_TYPES.ONE_BHK,
    ROOM_TYPES.TWO_BHK,
  ]).optional(),
  furnishing: z.enum([
    FURNISHING.UNFURNISHED,
    FURNISHING.SEMI_FURNISHED,
    FURNISHING.FURNISHED,
  ]).optional(),
  sort: z.enum(['score', 'rent', 'recency']).optional().default('score'),
});

// ============================================
// Export types from schemas
// ============================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type UpsertTenantProfileInput = z.infer<typeof upsertTenantProfileSchema>;
export type CreateInterestInput = z.infer<typeof createInterestSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type ListingsFilterInput = z.infer<typeof listingsFilterSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
