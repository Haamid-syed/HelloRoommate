import type { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { createRedisSubscriber, redis } from '../lib/redis.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { registerChatHandlers } from './chat.handler.js';
import type { RealtimeServer, SocketData } from './types.js';

export function setupSocketIO(server: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(server, {
    cors: {
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
    },
  });

  const subClient = createRedisSubscriber();
  io.adapter(createAdapter(redis, subClient));

  io.use((socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: unknown };
      const candidate = auth.token ?? socket.handshake.headers.authorization;

      if (typeof candidate !== 'string' || candidate.length === 0) {
        next(new Error('Authentication error: Token missing'));
        return;
      }

      const token = candidate.startsWith('Bearer ') ? candidate.slice(7) : candidate;
      socket.data.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Authentication error: Token is invalid or expired'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.userId;
    logger.debug({ userId, socketId: socket.id }, 'Socket.IO client connected');

    socket.join(`user:${userId}`);
    registerChatHandlers(io, socket);

    socket.on('disconnect', () => {
      logger.debug({ userId, socketId: socket.id }, 'Socket.IO client disconnected');
    });
  });

  logger.info('🔌 Socket.IO server setup complete');
  return io;
}

export type { RealtimeServer, SocketData };
