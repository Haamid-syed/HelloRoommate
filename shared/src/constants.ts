// ============================================
// Role & Status Constants
// ============================================

export const ROLES = {
  TENANT: 'TENANT',
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const LISTING_STATUS = {
  ACTIVE: 'ACTIVE',
  FILLED: 'FILLED',
  REMOVED: 'REMOVED',
} as const;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

export const ROOM_TYPES = {
  PRIVATE: 'PRIVATE',
  SHARED: 'SHARED',
  STUDIO: 'STUDIO',
  ONE_BHK: 'ONE_BHK',
  TWO_BHK: 'TWO_BHK',
} as const;

export type RoomType = (typeof ROOM_TYPES)[keyof typeof ROOM_TYPES];

export const FURNISHING = {
  UNFURNISHED: 'UNFURNISHED',
  SEMI_FURNISHED: 'SEMI_FURNISHED',
  FURNISHED: 'FURNISHED',
} as const;

export type FurnishingType = (typeof FURNISHING)[keyof typeof FURNISHING];

export const INTEREST_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type InterestStatus = (typeof INTEREST_STATUS)[keyof typeof INTEREST_STATUS];

export const NOTIFICATION_STATUS = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];

// ScoreSource: how the numeric score was computed.
// LLM removed — scores are rule-based/deterministic; LLM is only used for explanations.
export const SCORE_SOURCE = {
  RULE_BASED: 'RULE_BASED',
} as const;

export type ScoreSource = (typeof SCORE_SOURCE)[keyof typeof SCORE_SOURCE];

export const NOTIFICATION_TYPE = {
  HIGH_MATCH_INTEREST: 'HIGH_MATCH_INTEREST',
  INTEREST_ACCEPTED: 'INTEREST_ACCEPTED',
  INTEREST_DECLINED: 'INTEREST_DECLINED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];
