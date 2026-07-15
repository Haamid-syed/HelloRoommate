import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Building2, MessageSquare, Send } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type { ApiResponse, Conversation, Message, User, WsEvents } from 'shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion, AnimatePresence } from 'framer-motion';

type ConversationSummary = Omit<Conversation, 'createdAt' | 'lastMessage' | 'unreadCount' | 'otherUser'> & {
  createdAt: string;
  lastMessage: Message | null;
  unreadCount: number;
  otherUser: Pick<User, 'id' | 'name' | 'email'>;
  listingTitle: string;
  photoUrl: string | null;
};

type ChatMessage = Omit<Message, 'id'> & {
  id?: string;
  status?: 'sending' | 'delivered';
};

type ClientToServerEvents = {
  'message:send':      (payload: WsEvents['message:send']) => void;
  'message:read':      (payload: WsEvents['message:read']) => void;
  'typing:start':      (payload: WsEvents['typing:start']) => void;
  'typing:stop':       (payload: WsEvents['typing:stop']) => void;
  'join:conversation': (payload: WsEvents['join:conversation']) => void;
};

type ServerToClientEvents = {
  'message:new':    (payload: WsEvents['message:new']) => void;
  'message:ack':    (payload: WsEvents['message:ack']) => void;
  'typing:indicator': (payload: WsEvents['typing:indicator']) => void;
  'message:read':   (payload: { conversationId: string; userId: string; readAt: string }) => void;
  error: (payload: { message: string }) => void;
};

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConversationsResponse = ApiResponse<{ conversations: ConversationSummary[] }>;
type MessagesResponse = ApiResponse<{ messages: Message[] }>;

function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const merged = new Map<string, ChatMessage>();
  for (const group of groups) {
    for (const message of group) {
      const existing = merged.get(message.clientMsgId);
      merged.set(message.clientMsgId, { ...existing, ...message, id: message.id ?? existing?.id, status: message.status ?? existing?.status });
    }
  }
  return [...merged.values()].sort((l, r) => new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime());
}

const SURFACE   = 'oklch(0.135 0.006 240)';
const SURFACE2  = 'oklch(0.175 0.008 240)';
const BORDER    = 'oklch(0.210 0.006 240)';
const BG        = 'oklch(0.090 0 0)';
const INK       = 'oklch(0.930 0 0)';
const MUTED     = 'oklch(0.520 0.010 240)';
const PRIMARY   = 'oklch(0.530 0.115 195)';

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
      style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.12)', color: PRIMARY }}
    >
      {name[0]?.toUpperCase()}
    </div>
  );
}

export default function ChatPage() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);

  const socketRef = useRef<ChatSocket | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<ConversationSummary[]> => {
      const response = await api.get<ConversationsResponse>('/conversations');
      return response.data.data?.conversations ?? [];
    },
    refetchInterval: 30_000,
  });

  const activeConversation = conversationsQuery.data?.find((c) => c.id === activeConvId);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', activeConvId] as const,
    queryFn: async ({ pageParam }): Promise<MessagesResponse> => {
      if (!activeConvId) return { success: true, data: { messages: [] }, meta: { cursor: null, hasMore: false } };
      const response = await api.get<MessagesResponse>(`/conversations/${activeConvId}/messages`, {
        params: { cursor: pageParam, limit: 30 },
      });
      return response.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage): string | undefined => lastPage.meta?.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
    enabled: Boolean(activeConvId),
  });

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
    setMessages([]);
    setOtherUserTyping(false);
    if (activeConvId && socketRef.current) {
      socketRef.current.emit('join:conversation', { conversationId: activeConvId });
    }
  }, [activeConvId]);

  useEffect(() => {
    if (!messagesQuery.data) return;
    const history = messagesQuery.data.pages.flatMap((p) => p.data?.messages ?? []).reverse();
    setMessages((current) => mergeMessages(history, current));
  }, [messagesQuery.data]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!token) return;
    const socketUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    const socket: ChatSocket = io(socketUrl, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      const cid = activeConvIdRef.current;
      if (cid) socket.emit('join:conversation', { conversationId: cid });
    });
    socket.on('message:new', (message) => {
      if (message.conversationId === activeConvIdRef.current) {
        setMessages((current) => {
          if (current.some((item) => item.clientMsgId === message.clientMsgId)) return current;
          return mergeMessages(current, [message]);
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('message:ack', (ack) => {
      setMessages((current) => current.map((m) =>
        m.clientMsgId === ack.clientMsgId ? { ...m, id: ack.serverId, createdAt: ack.createdAt, status: 'delivered' } : m
      ));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    socket.on('typing:indicator', (indicator) => {
      if (indicator.conversationId === activeConvIdRef.current && indicator.userId !== user?.id) {
        setOtherUserTyping(indicator.isTyping);
      }
    });
    socket.on('error', ({ message }) => toast.error(message));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [queryClient, token, user?.id]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!activeConvId || !latest?.id || !socketRef.current) return;
    socketRef.current.emit('message:read', { conversationId: activeConvId, upToMessageId: latest.id });
  }, [activeConvId, messages]);

  useEffect(() => () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); }, []);

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = inputText.trim();
    const socket = socketRef.current;
    if (!body || !activeConvId || !socket || !user?.id) return;
    const clientMsgId = crypto.randomUUID();
    const newMessage: ChatMessage = {
      clientMsgId, conversationId: activeConvId, senderId: user.id,
      body, createdAt: new Date().toISOString(), readAt: null, status: 'sending',
    };
    setMessages((current) => mergeMessages(current, [newMessage]));
    socket.emit('message:send', { conversationId: activeConvId, clientMsgId, body });
    setInputText('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing:stop', { conversationId: activeConvId });
    setIsTyping(false);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value);
    const socket = socketRef.current;
    if (!socket || !activeConvId) return;
    if (!isTyping) { setIsTyping(true); socket.emit('typing:start', { conversationId: activeConvId }); }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing:stop', { conversationId: activeConvId });
      setIsTyping(false);
    }, 2_000);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Inbox</h1>
      </div>

      <section
        className="flex h-[calc(100vh-13rem)] min-h-[32rem] overflow-hidden rounded-xl"
        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
      >
        {/* Conversations sidebar */}
        <aside
          className={`w-full shrink-0 md:flex md:w-64 md:flex-col ${activeConvId ? 'hidden' : 'flex flex-col'}`}
          style={{ borderRight: `1px solid ${BORDER}` }}
        >
          <div className="px-3 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversationsQuery.isLoading ? (
              <div className="p-3 space-y-2">
                {[0,1,2].map(i => <div key={i} className="skeleton h-14 rounded-lg" />)}
              </div>
            ) : conversationsQuery.isError ? (
              <p className="p-6 text-center text-sm" style={{ color: MUTED }}>Conversations could not be loaded.</p>
            ) : !conversationsQuery.data?.length ? (
              <div className="p-6 text-center">
                <MessageSquare className="mx-auto h-6 w-6 mb-2" style={{ color: 'oklch(0.530 0.115 195 / 0.35)' }} />
                <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                  Accepted interests will open a chat here.
                </p>
              </div>
            ) : conversationsQuery.data.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => setActiveConvId(conv.id)}
                className="relative flex w-full items-center gap-2.5 p-3 text-left transition-colors duration-100"
                style={{
                  backgroundColor: conv.id === activeConvId ? SURFACE2 : 'transparent',
                  borderBottom: `1px solid ${BORDER}`,
                }}
                onMouseEnter={e => { if (conv.id !== activeConvId) (e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.175 0.008 240 / 0.5)'; }}
                onMouseLeave={e => { if (conv.id !== activeConvId) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                {/* Active indicator */}
                {conv.id === activeConvId && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-7 rounded-full"
                    style={{ backgroundColor: PRIMARY }}
                  />
                )}
                {conv.photoUrl ? (
                  <div className="w-9 h-9 rounded-lg shrink-0 overflow-hidden">
                    <img src={conv.photoUrl} alt={conv.listingTitle} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <Avatar name={conv.otherUser.name} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-sm font-semibold" style={{ color: INK }}>{conv.otherUser.name}</span>
                    <span className="shrink-0 text-[10px]" style={{ color: MUTED }}>
                      {conv.lastMessage ? format(new Date(conv.lastMessage.createdAt), 'h:mm a') : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: PRIMARY }}>{conv.listingTitle}</p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: MUTED }}>
                    {conv.lastMessage?.body ?? 'No messages yet'}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span
                    className="absolute bottom-2.5 right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{ backgroundColor: PRIMARY, color: 'oklch(0.090 0 0)' }}
                  >
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Chat area */}
        <div className={`flex-1 h-full flex-col ${activeConvId ? 'flex' : 'hidden md:flex md:items-center md:justify-center'}`}>
          {activeConvId && activeConversation ? (
            <>
              {/* Chat header */}
              <header
                className="flex items-center gap-2.5 px-4 py-3"
                style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: SURFACE2 }}
              >
                <button
                  type="button"
                  onClick={() => setActiveConvId(null)}
                  className="rounded-lg p-1.5 transition-colors md:hidden"
                  style={{ color: MUTED }}
                  onMouseEnter={e => (e.currentTarget.style.color = INK)}
                  onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Avatar name={activeConversation.otherUser.name} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: INK }}>{activeConversation.otherUser.name}</p>
                  <p className="text-xs font-medium" style={{ color: PRIMARY }}>{activeConversation.listingTitle}</p>
                </div>
              </header>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5" style={{ backgroundColor: BG }}>
                {messagesQuery.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => messagesQuery.fetchNextPage()}
                    disabled={messagesQuery.isFetchingNextPage}
                    className="mx-auto block text-xs font-medium py-2 transition-colors disabled:opacity-50"
                    style={{ color: PRIMARY }}
                  >
                    {messagesQuery.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                  </button>
                )}
                {messagesQuery.isLoading && (
                  <div className="flex justify-center py-4">
                    <div className="h-4 w-4 rounded-full border-2 animate-spin" style={{ borderColor: 'oklch(0.530 0.115 195 / 0.3)', borderTopColor: PRIMARY }} />
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((message) => {
                    const isMine = message.senderId === user?.id;
                    return (
                      <motion.div
                        key={message.clientMsgId}
                        className={`flex max-w-[76%] flex-col ${isMine ? 'self-end items-end ml-auto' : 'self-start items-start'}`}
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div
                          className="rounded-2xl px-3.5 py-2 text-sm shadow-sm"
                          style={isMine
                            ? { backgroundColor: PRIMARY, color: INK }
                            : { backgroundColor: SURFACE2, color: INK, border: `1px solid ${BORDER}` }
                          }
                        >
                          <p className="break-words leading-relaxed">{message.body}</p>
                        </div>
                        <span className="mt-1 text-[9px]" style={{ color: MUTED }}>
                          {format(new Date(message.createdAt), 'h:mm a')}
                          {isMine && message.status === 'sending' && ' · sending'}
                          {isMine && message.status === 'delivered' && ' · ✓'}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {otherUserTyping && (
                  <div
                    className="self-start flex items-center gap-1 rounded-2xl px-3.5 py-2.5 border text-xs"
                    style={{ backgroundColor: SURFACE2, borderColor: BORDER }}
                  >
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ backgroundColor: PRIMARY, animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderTop: `1px solid ${BORDER}`, backgroundColor: SURFACE2 }}
              >
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={inputText}
                  onChange={handleInputChange}
                  className="input-field flex-1 h-10 px-3 text-sm"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-40"
                  style={{
                    backgroundColor: inputText.trim() ? PRIMARY : SURFACE,
                    border: `1px solid ${inputText.trim() ? 'transparent' : BORDER}`,
                  }}
                >
                  <Send className="h-4 w-4" style={{ color: inputText.trim() ? 'oklch(0.090 0 0)' : MUTED }} />
                </button>
              </form>
            </>
          ) : (
            <div className="max-w-xs p-8 text-center">
              <div
                className="mx-auto mb-4 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.1)' }}
              >
                <MessageSquare className="h-6 w-6" style={{ color: PRIMARY }} />
              </div>
              <h2 className="text-heading-sm" style={{ color: INK }}>Your conversations</h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MUTED }}>
                Select an accepted interest to start messaging.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
