import type { PaginationInput } from 'shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/** Persist a client message idempotently under the database uniqueness constraint. */
export async function persistMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId: string;
}) {
  try {
    return await prisma.message.upsert({
      where: {
        uniq_conv_client_msg: {
          conversationId: input.conversationId,
          clientMsgId: input.clientMsgId,
        },
      },
      create: input,
      update: {},
    });
  } catch (error) {
    // Under high concurrency PostgreSQL can reject one of Prisma's concurrent
    // upsert INSERT paths with P2002. The unique constraint has done its job;
    // return the committed winner so every retry receives the same server id.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await prisma.message.findUnique({
        where: {
          uniq_conv_client_msg: {
            conversationId: input.conversationId,
            clientMsgId: input.clientMsgId,
          },
        },
      });
      if (winner) return winner;
    }
    throw error;
  }
}

/** Check whether a user is the tenant or listing owner associated with a conversation. */
export async function checkConversationMembership(conversationId: string, userId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      interest: {
        include: {
          tenantProfile: { select: { userId: true } },
          listing: { select: { ownerId: true } },
        },
      },
    },
  });

  if (!conversation) return false;

  return (
    conversation.interest.tenantProfile.userId === userId ||
    conversation.interest.listing.ownerId === userId
  );
}

/** Return a user's conversations, most recently active first, with unread message counts. */
export async function getConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      interest: {
        OR: [{ listing: { ownerId: userId } }, { tenantProfile: { userId } }],
      },
    },
    include: {
      interest: {
        include: {
          listing: {
            select: {
              title: true,
              ownerId: true,
              owner: { select: { id: true, name: true, email: true } },
              photos: { orderBy: { position: 'asc' }, take: 1 },
            },
          },
          tenantProfile: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const mappedConversations = await Promise.all(
    conversations.map(async (conversation) => {
      const lastMessage = conversation.messages[0] ?? null;
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: userId },
          readAt: null,
        },
      });
      const isOwner = conversation.interest.listing.ownerId === userId;
      const otherUser = isOwner
        ? conversation.interest.tenantProfile.user
        : conversation.interest.listing.owner;

      return {
        id: conversation.id,
        interestId: conversation.interestId,
        createdAt: conversation.createdAt.toISOString(),
        lastMessage: lastMessage
          ? {
              ...lastMessage,
              createdAt: lastMessage.createdAt.toISOString(),
              readAt: lastMessage.readAt?.toISOString() ?? null,
            }
          : null,
        unreadCount,
        otherUser,
        listingTitle: conversation.interest.listing.title,
        photoUrl: conversation.interest.listing.photos[0]?.url ?? null,
      };
    })
  );

  mappedConversations.sort((left, right) => {
    const leftTime = new Date(left.lastMessage?.createdAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.lastMessage?.createdAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  });

  return mappedConversations;
}

/** Fetch a conversation's messages by cursor after confirming membership. */
export async function getConversationMessages(
  userId: string,
  conversationId: string,
  params: PaginationInput
) {
  const isMember = await checkConversationMembership(conversationId, userId);
  if (!isMember) {
    throw Object.assign(new Error('Unauthorized to view this conversation'), { statusCode: 403 });
  }

  const limit = params.limit ?? 20;
  let cursorBoundary: { id: string; createdAt: Date } | null = null;
  if (params.cursor) {
    cursorBoundary = await prisma.message.findFirst({
      where: { id: params.cursor, conversationId },
      select: { id: true, createdAt: true },
    });
    if (!cursorBoundary) {
      throw Object.assign(new Error('Message cursor not found in this conversation'), { statusCode: 400 });
    }
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(cursorBoundary
        ? {
            OR: [
              { createdAt: { lt: cursorBoundary.createdAt } },
              { createdAt: cursorBoundary.createdAt, id: { lt: cursorBoundary.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  return {
    messages,
    meta: {
      cursor: messages.length > 0 ? messages[messages.length - 1]!.id : null,
      hasMore,
    },
  };
}
