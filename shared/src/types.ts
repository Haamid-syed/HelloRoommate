import type { Role, ListingStatus, RoomType, FurnishingType, InterestStatus, ScoreSource, NotificationStatus, NotificationType } from './constants.js';

// ============================================
// User & Auth
// ============================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

// ============================================
// Tenant Profile
// ============================================

export interface TenantProfile {
  id: string;
  userId: string;
  preferredCity: string;
  preferredAreas: string[];
  budgetMin: number;
  budgetMax: number;
  moveInDate: string;
  preferences: Record<string, unknown>;
  updatedAt: string;
}

// ============================================
// Listing
// ============================================

export interface Listing {
  id: string;
  ownerId: string;
  title: string;
  city: string;
  area: string;
  lat: number | null;
  lng: number | null;
  rent: number;
  availableFrom: string;
  roomType: RoomType;
  furnishing: FurnishingType;
  description: string;
  status: ListingStatus;
  photos: ListingPhoto[];
  owner?: Pick<User, 'id' | 'name' | 'email'>;
  score?: CompatibilityScore | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingPhoto {
  id: string;
  url: string;
  position: number;
}

// ============================================
// Compatibility Score
// ============================================

export interface CompatibilityScore {
  tenantProfileId: string;
  listingId: string;
  score: number;
  explanation: string;
  source: ScoreSource;
  inputHash: string;
  model: string | null;
  computedAt: string;
}

// ============================================
// Interest
// ============================================

export interface Interest {
  id: string;
  tenantProfileId: string;
  listingId: string;
  status: InterestStatus;
  scoreAtInterest: number | null;
  createdAt: string;
  respondedAt: string | null;
  listing?: Listing;
  tenantProfile?: TenantProfile & { user?: User };
}

// ============================================
// Chat
// ============================================

export interface Conversation {
  id: string;
  interestId: string;
  createdAt: string;
  interest?: Interest;
  lastMessage?: Message;
  unreadCount?: number;
  otherUser?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId: string;
  createdAt: string;
  readAt: string | null;
}

// ============================================
// Notifications
// ============================================

export interface NotificationOutbox {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupKey: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

// ============================================
// API Response Envelope
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

// ============================================
// WebSocket Events
// ============================================

export interface WsEvents {
  // Client → Server
  'message:send': { conversationId: string; clientMsgId: string; body: string };
  'message:read': { conversationId: string; upToMessageId: string };
  'typing:start': { conversationId: string };
  'typing:stop': { conversationId: string };
  'join:conversation': { conversationId: string };

  // Server → Client
  'message:new': Message;
  'message:ack': { clientMsgId: string; serverId: string; createdAt: string };
  'interest:accepted': { interestId: string; conversationId: string };
  'interest:declined': { interestId: string };
  'score:updated': { listingId: string; score: number; explanation: string; source: ScoreSource };
  'typing:indicator': { conversationId: string; userId: string; isTyping: boolean };
}

// ============================================
// Admin
// ============================================

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformMetrics {
  totalUsers: number;
  totalOwners: number;
  totalTenants: number;
  totalListings: number;
  activeListings: number;
  totalInterests: number;
  totalMessages: number;
  pendingNotifications: number;
  failedNotifications: number;
}
