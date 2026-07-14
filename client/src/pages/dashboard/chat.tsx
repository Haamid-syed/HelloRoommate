import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Building2, Circle, MessageSquare, Send } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import type { ApiResponse, Conversation, Message, User, WsEvents } from 'shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

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
      merged.set(message.clientMsgId, {
        ...existing,
        ...message,
        id: message.id ?? existing?.id,
        status: message.status ?? existing?.status,
      });
    }
  }

  return [...merged.values()].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
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

  const activeConversation = conversationsQuery.data?.find((conversation) => conversation.id === activeConvId);

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
    getNextPageParam: (lastPage): string | undefined =>
      lastPage.meta?.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
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

    const history = messagesQuery.data.pages
      .flatMap((page) => page.data?.messages ?? [])
      .reverse();

    setMessages((current) => mergeMessages(history, current));
  }, [messagesQuery.data]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!token) return;

    const socketUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    const socket: ChatSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const currentConversationId = activeConvIdRef.current;
      if (currentConversationId) {
        socket.emit('join:conversation', { conversationId: currentConversationId });
      }
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

    socket.on('message:ack', (acknowledgement) => {
      setMessages((current) => current.map((message) => (
        message.clientMsgId === acknowledgement.clientMsgId
          ? { ...message, id: acknowledgement.serverId, createdAt: acknowledgement.createdAt, status: 'delivered' }
          : message
      )));
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    socket.on('typing:indicator', (indicator) => {
      if (indicator.conversationId === activeConvIdRef.current && indicator.userId !== user?.id) {
        setOtherUserTyping(indicator.isTyping);
      }
    });

    socket.on('error', ({ message }) => {
      toast.error(message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient, token, user?.id]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (!activeConvId || !latestMessage?.id || !socketRef.current) return;

    socketRef.current.emit('message:read', {
      conversationId: activeConvId,
      upToMessageId: latestMessage.id,
    });
  }, [activeConvId, messages]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, []);

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = inputText.trim();
    const socket = socketRef.current;
    if (!body || !activeConvId || !socket || !user?.id) return;

    const clientMsgId = crypto.randomUUID();
    const newMessage: ChatMessage = {
      clientMsgId,
      conversationId: activeConvId,
      senderId: user.id,
      body,
      createdAt: new Date().toISOString(),
      readAt: null,
      status: 'sending',
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

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing:start', { conversationId: activeConvId });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('typing:stop', { conversationId: activeConvId });
      setIsTyping(false);
    }, 2_000);
  };

  return (
    <section className="flex h-[calc(100vh-10rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-fade-in">
      <aside className={`w-full shrink-0 border-r border-border md:flex md:w-80 md:flex-col ${activeConvId ? 'hidden' : 'flex flex-col'}`}>
        <div className="border-b border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Live messaging</p>
          <h1 className="mt-1 text-lg font-bold">Inbox</h1>
        </div>
        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {conversationsQuery.isLoading ? <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div> : conversationsQuery.isError ? <div className="p-6 text-center text-sm text-muted-foreground">Conversations could not be loaded.</div> : !conversationsQuery.data?.length ? <div className="p-8 text-center text-sm text-muted-foreground">Accepted interests will open a private chat here.</div> : conversationsQuery.data.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => setActiveConvId(conversation.id)} className={`relative flex w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/40 ${conversation.id === activeConvId ? 'bg-secondary/60' : ''}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
                {conversation.photoUrl ? <img src={conversation.photoUrl} alt={conversation.listingTitle} className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{conversation.otherUser.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{conversation.lastMessage ? format(new Date(conversation.lastMessage.createdAt), 'h:mm a') : ''}</span></div>
                <p className="mt-0.5 truncate text-xs font-medium text-primary">{conversation.listingTitle}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{conversation.lastMessage?.body ?? 'No messages yet'}</p>
              </div>
              {conversation.unreadCount > 0 && <span className="absolute bottom-3 right-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{conversation.unreadCount}</span>}
            </button>
          ))}
        </div>
      </aside>

      <div className={`h-full flex-1 flex-col bg-secondary/5 ${activeConvId ? 'flex' : 'hidden md:flex md:items-center md:justify-center'}`}>
        {activeConvId && activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-card p-4">
              <button type="button" onClick={() => setActiveConvId(null)} className="rounded-lg p-1.5 transition hover:bg-secondary md:hidden"><ArrowLeft className="h-5 w-5 text-muted-foreground" /></button>
              <div><h2 className="text-sm font-bold">{activeConversation.otherUser.name}</h2><p className="text-xs font-medium text-primary">{activeConversation.listingTitle}</p></div>
            </header>

            <div className="flex flex-1 flex-col space-y-3 overflow-y-auto p-4">
              {messagesQuery.hasNextPage && <button type="button" onClick={() => messagesQuery.fetchNextPage()} disabled={messagesQuery.isFetchingNextPage} className="mx-auto my-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50">{messagesQuery.isFetchingNextPage ? 'Loading previous messages…' : 'Load previous messages'}</button>}
              {messagesQuery.isLoading && <div className="my-auto text-center text-sm text-muted-foreground">Loading messages…</div>}
              {messages.map((message) => {
                const isMine = message.senderId === user?.id;
                return <div key={message.clientMsgId} className={`flex max-w-[75%] flex-col ${isMine ? 'self-end items-end' : 'self-start items-start'}`}>
                  <div className={`rounded-2xl px-4 py-2 text-sm shadow-sm ${isMine ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground'}`}><p className="break-words leading-relaxed">{message.body}</p></div>
                  <span className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">{format(new Date(message.createdAt), 'h:mm a')}{isMine && message.status === 'sending' && <Circle className="h-1.5 w-1.5 animate-pulse" />}</span>
                </div>;
              })}
              {otherUserTyping && <div className="self-start rounded-2xl border border-border bg-card px-4 py-2 text-xs italic text-muted-foreground animate-pulse">typing…</div>}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border bg-card p-4">
              <input type="text" placeholder="Type a message…" value={inputText} onChange={handleInputChange} className="h-10 flex-1 rounded-lg border border-input bg-background px-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              <button type="submit" disabled={!inputText.trim()} className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </form>
          </>
        ) : (
          <div className="max-w-sm p-8 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><MessageSquare className="h-6 w-6 text-primary" /></div><h2 className="text-lg font-semibold">Your conversations</h2><p className="mt-1 text-sm text-muted-foreground">Select an accepted interest from the inbox to start messaging.</p></div>
        )}
      </div>
    </section>
  );
}
