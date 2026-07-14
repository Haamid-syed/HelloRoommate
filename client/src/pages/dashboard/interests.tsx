import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import { ArrowUpRight, Building2, Check, CheckCircle2, Clock, Inbox, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import type { ApiResponse, Interest, Listing, TenantProfile, User } from 'shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';

type InterestListItem = Interest & {
  listing: Listing;
  tenantProfile: TenantProfile & { user: Pick<User, 'name' | 'email'> };
};

type InterestListResponse = ApiResponse<{ interests: InterestListItem[] }>;

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiResponse>(error)) return error.response?.data.error?.message ?? fallback;
  return fallback;
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
      toast.success('Interest accepted! Conversation opened.');
      navigate('/dashboard/chat');
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error, 'Failed to accept interest')),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => api.post(`/interests/${id}/decline`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-interests'] });
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success('Interest declined');
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error, 'Failed to decline interest')),
  });

  if (interestsQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }

  if (interestsQuery.isError) {
    return (
      <div className="card-elevated rounded-2xl p-8 text-center">
        <p className="font-medium text-red-400">Interests could not be loaded.</p>
        <button type="button" onClick={() => interestsQuery.refetch()} className="mt-3 text-sm font-semibold text-gold hover:underline">Try again</button>
      </div>
    );
  }

  const interests = interestsQuery.data ?? [];

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-8">
        <p className="label-overline">Match Management</p>
        <h1 className="font-serif text-display-md text-foreground mt-2">
          {isOwner ? 'Expressed interests' : 'Sent interests'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isOwner
            ? 'Review requests from prospective tenants and open a conversation.'
            : 'Track every listing you have reached out about.'}
        </p>
      </div>

      {interests.length === 0 ? (
        <div className="card-elevated rounded-2xl px-8 py-16 text-center border border-dashed border-border">
          <Inbox className="mx-auto h-8 w-8 mb-4" style={{ color: 'hsl(37 78% 60% / 0.5)' }} />
          <h2 className="font-serif text-lg font-semibold text-foreground">No interests yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
            {isOwner
              ? 'New tenant requests will appear here for your active listings.'
              : 'Express interest from Browse listings to keep track here.'}
          </p>
          {!isOwner && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/browse')}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline underline-offset-4"
            >
              Browse listings <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {interests.map((item, i) => (
            <motion.article
              key={item.id}
              className="card-elevated rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Thumbnail */}
              <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                style={{ background: 'hsl(var(--surface-2))' }}
              >
                {item.listing.photos[0] ? (
                  <img src={item.listing.photos[0].url} alt={item.listing.title} className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-6 w-6" style={{ color: 'hsl(37 78% 60% / 0.5)' }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="font-serif text-base font-semibold text-foreground truncate">{item.listing.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{item.listing.area}, {item.listing.city}</span>
                  <span>·</span>
                  <span className="font-semibold text-foreground">{currency.format(item.listing.rent)}/mo</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {format(new Date(item.createdAt), 'MMM d, yyyy · h:mm a')}
                </p>
                {isOwner && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
                    style={{ background: 'hsl(var(--surface-2))' }}
                  >
                    <span className="text-muted-foreground">By</span>
                    <span className="font-semibold text-foreground">{item.tenantProfile.user.name}</span>
                    {item.scoreAtInterest !== null && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-bold text-gold">{item.scoreAtInterest}/100</span>
                        <span className="text-muted-foreground">match</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {item.status === 'PENDING' && isOwner ? (
                  <>
                    <button
                      type="button"
                      onClick={() => declineMutation.mutate(item.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="h-9 px-3 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                      style={{ background: 'hsl(0 65% 60% / 0.1)', color: 'hsl(0 65% 68%)', border: '1px solid hsl(0 65% 60% / 0.25)' }}
                    >
                      <X className="h-3.5 w-3.5 inline mr-1" />
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => acceptMutation.mutate(item.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="btn-gold h-9 px-3 text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Accept
                    </button>
                  </>
                ) : (
                  <>
                    {item.status === 'PENDING' && <span className="badge-pending"><Clock className="h-3 w-3" />Pending</span>}
                    {item.status === 'ACCEPTED' && <span className="badge-accepted"><CheckCircle2 className="h-3 w-3" />Accepted</span>}
                    {item.status === 'DECLINED' && <span className="badge-declined"><XCircle className="h-3 w-3" />Declined</span>}
                  </>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </section>
  );
}
