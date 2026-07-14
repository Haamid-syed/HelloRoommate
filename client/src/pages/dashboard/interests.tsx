import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import { ArrowUpRight, Building2, Check, CheckCircle2, Clock, Inbox, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import type { ApiResponse, Interest, Listing, TenantProfile, User } from 'shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

type InterestListItem = Interest & {
  listing: Listing;
  tenantProfile: TenantProfile & { user: Pick<User, 'name' | 'email'> };
};

type InterestListResponse = ApiResponse<{ interests: InterestListItem[] }>;

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiResponse>(error)) {
    return error.response?.data.error?.message ?? fallback;
  }

  return fallback;
}

function InterestStatusBadge({ status }: { status: Interest['status'] }) {
  if (status === 'PENDING') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"><Clock className="h-3.5 w-3.5" />Pending</span>;
  }

  if (status === 'ACCEPTED') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Accepted</span>;
  }

  if (status === 'DECLINED') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"><XCircle className="h-3.5 w-3.5" />Declined</span>;
  }

  return <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">Withdrawn</span>;
}

export default function InterestsPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOwner = user?.role === 'OWNER';

  const interestsQuery = useQuery({
    queryKey: ['my-interests'],
    queryFn: async (): Promise<InterestListItem[]> => {
      const response = await api.get<InterestListResponse>('/interests');
      return response.data.data?.interests ?? [];
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.post(`/interests/${id}/accept`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-interests'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Interest accepted! Conversation created.');
      navigate('/dashboard/chat');
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'Failed to accept interest'));
    },
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => api.post(`/interests/${id}/decline`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-interests'] });
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success('Interest declined');
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'Failed to decline interest'));
    },
  });

  if (interestsQuery.isLoading) {
    return <div className="flex h-60 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  if (interestsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">Interests could not be loaded.</p>
        <button type="button" onClick={() => interestsQuery.refetch()} className="mt-3 text-sm font-semibold text-primary hover:underline">Try again</button>
      </div>
    );
  }

  const interests = interestsQuery.data ?? [];

  return (
    <section className="mx-auto max-w-4xl animate-fade-in">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Match management</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{isOwner ? 'Expressed interests' : 'Sent interests'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isOwner ? 'Review requests from prospective tenants and open a conversation when it feels right.' : 'Track every listing you have reached out about in one place.'}
        </p>
      </div>

      {interests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Inbox className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">No interests yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isOwner ? 'New tenant requests will appear here for your active listings.' : 'Express interest from Browse listings to keep track of a room here.'}
          </p>
          {!isOwner && <button type="button" onClick={() => navigate('/dashboard/browse')} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">Browse listings <ArrowUpRight className="h-4 w-4" /></button>}
        </div>
      ) : (
        <div className="space-y-4">
          {interests.map((item) => (
            <article key={item.id} className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
                  {item.listing.photos[0] ? <img src={item.listing.photos[0].url} alt={item.listing.title} className="h-full w-full object-cover" /> : <Building2 className="h-6 w-6 text-primary" />}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{item.listing.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span>{item.listing.area}, {item.listing.city}</span><span>•</span><span className="font-semibold text-foreground">{currency.format(item.listing.rent)}/mo</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Expressed {format(new Date(item.createdAt), 'MMM d, yyyy h:mm a')}</p>
                  {isOwner && (
                    <div className="mt-2 rounded-lg bg-secondary/60 p-2.5 text-xs text-muted-foreground">
                      Sent by <strong className="text-foreground">{item.tenantProfile.user.name}</strong>
                      {item.scoreAtInterest !== null && <> · compatibility <strong className="text-primary">{item.scoreAtInterest}/100</strong></>}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
                {item.status === 'PENDING' && isOwner ? (
                  <>
                    <button type="button" onClick={() => declineMutation.mutate(item.id)} disabled={acceptMutation.isPending || declineMutation.isPending} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"><X className="h-4 w-4" />Decline</button>
                    <button type="button" onClick={() => acceptMutation.mutate(item.id)} disabled={acceptMutation.isPending || declineMutation.isPending} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Accept</button>
                  </>
                ) : <InterestStatusBadge status={item.status} />}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
