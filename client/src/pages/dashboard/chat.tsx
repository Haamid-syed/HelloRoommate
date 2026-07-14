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
  'message:send': (payload: WsEvents['message:send']) => void;
  'message:read': (payload: WsEvents['message:read']) => void;
  'typing:start': (payload: WsEvents['typing:start']) => void;
  'typing:stop': (payload: WsEvents['typing:stop']) => void;
  'join:conversation': (payload: WsEvents['join:conversation']) => void;
};

type ServerToClientEvents = {
  'message:new': (payload: WsEvents['message:new']) => void;
  'message:ack': (payload: WsEvents['message:ack']) => void;
  'typing:indicator': (payload: WsEvents['typing:indicator']) => void;
  'message:read': (payload: { conversationId: string; userId: string; readAt: string }) => void;
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

function ConversationAvatar({ name }: { name: string }) {
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm"
      style={{ background: 'linear-gradient(135deg, hsl(37 78% 60% / 0.2), hsl(37 78% 60% / 0.05))', color: 'hsl(37 78% 65%)' }}
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
      <div className="mb-6">
        <p className="label-overline">Live Messaging</p>
        <h1 className="font-serif text-display-md text-foreground mt-2">Inbox</h1>
      </div>

      <section className="flex h-[calc(100vh-14rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-border"
        style={{ background: 'hsl(var(--surface))' }}
      >
        {/* Conversations sidebar */}
        <aside className={`w-full shrink-0 border-r border-border md:flex md:w-72 md:flex-col ${activeConvId ? 'hidden' : 'flex flex-col'}`}>
          <div className="p-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/50">
            {conversationsQuery.isLoading ? (
              <div className="p-4 space-y-3">
                {[0,1,2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
              </div>
            ) : conversationsQuery.isError ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Conversations could not be loaded.</p>
            ) : !conversationsQuery.data?.length ? (
              <div className="p-8 text-center">
                <MessageSquare className="mx-auto h-7 w-7 mb-3" style={{ color: 'hsl(37 78% 60% / 0.4)' }} />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Accepted interests will open a private chat here.
                </p>
              </div>
            ) : conversationsQuery.data.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => setActiveConvId(conv.id)}
                className={`relative flex w-full items-center gap-3 p-4 text-left transition-all duration-150 ${
                  conv.id === activeConvId
                    ? 'bg-surface-2'
                    : 'hover:bg-surface-2/60'
                }`}
              >
                {conv.photoUrl ? (
                  <div className="w-10 h-10 rounded-xl shrink-0 overflow-hidden">
                    <img src={conv.photoUrl} alt={conv.listingTitle} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <ConversationAvatar name={conv.otherUser.name} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{conv.otherUser.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {conv.lastMessage ? format(new Date(conv.lastMessage.createdAt), 'h:mm a') : ''}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-gold">{conv.listingTitle}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {conv.lastMessage?.body ?? 'No messages yet'}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="absolute bottom-3 right-3 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                    style={{ background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))', color: 'hsl(22, 12%, 6%)' }}
                  >
                    {conv.unreadCount}
                  </span>
                )}
                {conv.id === activeConvId && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full"
                    style={{ background: 'linear-gradient(to bottom, hsl(37 78% 60%), hsl(33 64% 48%))' }}
                  />
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
              <header className="flex items-center gap-3 border-b border-border p-4"
                style={{ background: 'hsl(var(--surface-2))' }}
              >
                <button type="button" onClick={() => setActiveConvId(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <ConversationAvatar name={activeConversation.otherUser.name} />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{activeConversation.otherUser.name}</h2>
                  <p className="text-xs text-gold font-medium">{activeConversation.listingTitle}</p>
                </div>
              </header>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3"
                style={{ background: 'hsl(var(--background))' }}
              >
                {messagesQuery.hasNextPage && (
                  <button type="button" onClick={() => messagesQuery.fetchNextPage()} disabled={messagesQuery.isFetchingNextPage}
                    className="mx-auto block text-xs font-semibold text-gold hover:underline disabled:opacity-50 py-2"
                  >
                    {messagesQuery.isFetchingNextPage ? 'Loading…' : 'Load previous messages'}
                  </button>
                )}
                {messagesQuery.isLoading && (
                  <div className="flex justify-center py-4">
                    <div className="h-5 w-5 rounded-full border-2 border-gold border-t-transparent animate-spin" />
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((message) => {
                    const isMine = message.senderId === user?.id;
                    return (
                      <motion.div
                        key={message.clientMsgId}
                        className={`flex max-w-[78%] flex-col ${isMine ? 'self-end items-end ml-auto' : 'self-start items-start'}`}
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <div
                          className="rounded-2xl px-4 py-2.5 text-sm shadow-sm"
                          style={isMine
                            ? { background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))', color: 'hsl(22, 12%, 6%)' }
                            : { background: 'hsl(var(--surface-2))', color: 'hsl(var(--foreground))', border: '1px solid hsl(var(--border))' }
                          }
                        >
                          <p className="break-words leading-relaxed">{message.body}</p>
                        </div>
                        <span className="mt-1 text-[9px] text-muted-foreground">
                          {format(new Date(message.createdAt), 'h:mm a')}
                          {isMine && message.status === 'sending' && ' · sending'}
                          {isMine && message.status === 'delivered' && ' · ✓'}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {otherUserTyping && (
                  <div className="self-start flex items-center gap-1.5 rounded-2xl px-4 py-2.5 border border-border text-xs text-muted-foreground italic animate-pulse"
                    style={{ background: 'hsl(var(--surface-2))' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-4"
                style={{ background: 'hsl(var(--surface-2))' }}
              >
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={inputText}
                  onChange={handleInputChange}
                  className="input-dark flex-1 h-11 px-4 text-sm"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-40"
                  style={{ background: inputText.trim() ? 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' : 'hsl(var(--surface))' }}
                >
                  <Send className="h-4 w-4" style={{ color: inputText.trim() ? 'hsl(22, 12%, 6%)' : 'hsl(var(--muted-foreground))' }} />
                </button>
              </form>
            </>
          ) : (
            <div className="max-w-xs p-8 text-center">
              <div className="mx-auto mb-5 w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'hsl(37 78% 60% / 0.1)' }}
              >
                <MessageSquare className="h-7 w-7 text-gold" />
              </div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Your conversations</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Select an accepted interest from the inbox to start messaging.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
