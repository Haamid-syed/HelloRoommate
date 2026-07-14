import type { AuthPayload, WsEvents } from 'shared';
import type { Server, Socket } from 'socket.io';

export interface ClientToServerEvents {
  'message:send': (payload: WsEvents['message:send']) => void;
  'message:read': (payload: WsEvents['message:read']) => void;
  'typing:start': (payload: WsEvents['typing:start']) => void;
  'typing:stop': (payload: WsEvents['typing:stop']) => void;
  'join:conversation': (payload: WsEvents['join:conversation']) => void;
}

export interface ServerToClientEvents {
  'message:new': (payload: WsEvents['message:new']) => void;
  'message:ack': (payload: WsEvents['message:ack']) => void;
  'interest:accepted': (payload: WsEvents['interest:accepted']) => void;
  'interest:declined': (payload: WsEvents['interest:declined']) => void;
  'typing:indicator': (payload: WsEvents['typing:indicator']) => void;
  'message:read': (payload: { conversationId: string; userId: string; readAt: string }) => void;
  error: (payload: { message: string }) => void;
}

export interface SocketData {
  user: AuthPayload;
}

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
