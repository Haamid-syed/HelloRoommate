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

const SURFACE  = 'oklch(0.135 0.006 240)';
const SURFACE2 = 'oklch(0.175 0.008 240)';
const BORDER   = 'oklch(0.210 0.006 240)';
const INK      = 'oklch(0.930 0 0)';
const MUTED    = 'oklch(0.520 0.010 240)';
const PRIMARY  = 'oklch(0.530 0.115 195)';

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
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }

  if (interestsQuery.isError) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-medium" style={{ color: 'oklch(0.580 0.185 25)' }}>Interests could not be loaded.</p>
        <button type="button" onClick={() => interestsQuery.refetch()} className="mt-3 text-sm font-medium" style={{ color: PRIMARY }}>
          Try again
        </button>
      </div>
    );
  }

  const interests = interestsQuery.data ?? [];

  return (
    <section className="mx-auto max-w-2xl">
      <div className="page-header">
        <h1>{isOwner ? 'Expressed interests' : 'Sent interests'}</h1>
        <p>
          {isOwner
            ? 'Review requests from prospective tenants and open a conversation.'
            : 'Track every listing you have reached out about.'}
        </p>
      </div>

      {interests.length === 0 ? (
        <div
          className="rounded-xl px-8 py-14 text-center"
          style={{ backgroundColor: SURFACE, border: `1px dashed ${BORDER}` }}
        >
          <Inbox className="mx-auto h-7 w-7 mb-3" style={{ color: 'oklch(0.530 0.115 195 / 0.4)' }} />
          <h2 className="text-heading-sm" style={{ color: INK }}>No interests yet</h2>
          <p className="mt-1 text-sm max-w-xs mx-auto" style={{ color: MUTED }}>
            {isOwner
              ? 'New tenant requests will appear here for your active listings.'
              : 'Express interest from Browse listings to keep track here.'}
          </p>
          {!isOwner && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/browse')}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{ color: PRIMARY }}
            >
              Browse listings <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {interests.map((item, i) => (
            <motion.article
              key={item.id}
              className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Thumbnail */}
              <div
                className="h-12 w-12 shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: SURFACE2 }}
              >
                {item.listing.photos[0] ? (
                  <img src={item.listing.photos[0].url} alt={item.listing.title} className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-5 w-5" style={{ color: 'oklch(0.530 0.115 195 / 0.4)' }} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold truncate" style={{ color: INK }}>{item.listing.title}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: MUTED }}>
                  <span>{item.listing.area}, {item.listing.city}</span>
                  <span>·</span>
                  <span className="font-semibold" style={{ color: INK }}>{currency.format(item.listing.rent)}/mo</span>
                </div>
                <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                  {format(new Date(item.createdAt), 'MMM d, yyyy · h:mm a')}
                </p>
                {isOwner && (
                  <div
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                    style={{ backgroundColor: SURFACE2 }}
                  >
                    <span style={{ color: MUTED }}>By</span>
                    <span className="font-semibold" style={{ color: INK }}>{item.tenantProfile.user.name}</span>
                    {item.scoreAtInterest !== null && (
                      <>
                        <span style={{ color: MUTED }}>·</span>
                        <span className="font-bold" style={{ color: PRIMARY }}>{item.scoreAtInterest}/100</span>
                        <span style={{ color: MUTED }}>match</span>
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
                      className="btn-destructive h-8 px-3 text-xs disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => acceptMutation.mutate(item.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="btn-primary h-8 px-3 text-xs disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Accept
                    </button>
                  </>
                ) : (
                  <>
                    {item.status === 'PENDING'  && <span className="badge-warning"><Clock className="h-3 w-3" />Pending</span>}
                    {item.status === 'ACCEPTED' && <span className="badge-success"><CheckCircle2 className="h-3 w-3" />Accepted</span>}
                    {item.status === 'DECLINED' && <span className="badge-error"><XCircle className="h-3 w-3" />Declined</span>}
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
