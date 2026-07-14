import { sendMessageSchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { checkConversationMembership } from '../services/chat.service.js';
import type { RealtimeServer, RealtimeSocket } from './types.js';

async function emitTyping(
  socket: RealtimeSocket,
  conversationId: string,
  isTyping: boolean
): Promise<void> {
  const userId = socket.data.user.userId;
  const isMember = await checkConversationMembership(conversationId, userId);
  if (!isMember) return;

  socket.to(`conversation:${conversationId}`).emit('typing:indicator', {
    conversationId,
    userId,
    isTyping,
  });
}

/** Register authenticated, membership-checked chat handlers for one Socket.IO client. */
export function registerChatHandlers(io: RealtimeServer, socket: RealtimeSocket): void {
  const userId = socket.data.user.userId;

  socket.on('join:conversation', async ({ conversationId }) => {
    try {
      const isMember = await checkConversationMembership(conversationId, userId);
      if (!isMember) {
        socket.emit('error', { message: 'Access denied: not a conversation member' });
        return;
      }

      socket.join(`conversation:${conversationId}`);
      logger.debug({ userId, conversationId }, 'User joined conversation room');
    } catch (error) {
      logger.error({ error, userId, conversationId }, 'Failed to join conversation room');
      socket.emit('error', { message: 'Failed to join conversation room' });
    }
  });

  socket.on('message:send', async (payload) => {
    try {
      const parsed = sendMessageSchema.safeParse(payload);
      if (!parsed.success || !parsed.data.body.trim()) {
        socket.emit('error', { message: 'Validation failed: invalid message properties' });
        return;
      }

      const { conversationId, clientMsgId } = parsed.data;
      const body = parsed.data.body.trim();
      const isMember = await checkConversationMembership(conversationId, userId);
      if (!isMember) {
        socket.emit('error', { message: 'Access denied: not a conversation member' });
        return;
      }

      const message = await prisma.message.upsert({
        where: { uniq_conv_client_msg: { conversationId, clientMsgId } },
        create: { conversationId, senderId: userId, body, clientMsgId },
        update: {},
      });

      socket.emit('message:ack', {
        clientMsgId,
        serverId: message.id,
        createdAt: message.createdAt.toISOString(),
      });

      io.to(`conversation:${conversationId}`).emit('message:new', {
        id: message.id,
        conversationId,
        senderId: message.senderId,
        body: message.body,
        clientMsgId,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt?.toISOString() ?? null,
      });
    } catch (error) {
      logger.error({ error, userId }, 'Error inside socket handler message:send');
      socket.emit('error', { message: 'Server failed to deliver message' });
    }
  });

  socket.on('message:read', async ({ conversationId }) => {
    try {
      const isMember = await checkConversationMembership(conversationId, userId);
      if (!isMember) return;

      const readAt = new Date();
      await prisma.message.updateMany({
        where: { conversationId, senderId: { not: userId }, readAt: null },
        data: { readAt },
      });

      io.to(`conversation:${conversationId}`).emit('message:read', {
        conversationId,
        userId,
        readAt: readAt.toISOString(),
      });
    } catch (error) {
      logger.error({ error, userId, conversationId }, 'Error processing message:read packet');
    }
  });

  socket.on('typing:start', ({ conversationId }) => {
    void emitTyping(socket, conversationId, true).catch((error: unknown) => {
      logger.error({ error, userId, conversationId }, 'Error processing typing:start packet');
    });
  });

  socket.on('typing:stop', ({ conversationId }) => {
    void emitTyping(socket, conversationId, false).catch((error: unknown) => {
      logger.error({ error, userId, conversationId }, 'Error processing typing:stop packet');
    });
  });
}
