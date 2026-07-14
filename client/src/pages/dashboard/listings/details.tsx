import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Send,
  Sparkles,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ApiResponse, Interest, Listing } from 'shared';
import { api } from '@/lib/api';

type ListingDetailResponse = ApiResponse<{ listing: Listing }>;
type ExplanationResponse = ApiResponse<{
  score: number;
  explanation: string;
  explanationSource: 'LLM' | 'TEMPLATED';
  explanationVersion: string;
}>;

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function scoreColor(score: number) {
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400';
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400';
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400';
}

export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // 1. Fetch listing details (non-blocking, fast read path)
  const listingQuery = useQuery({
    queryKey: ['listing', id],
    queryFn: async (): Promise<Listing> => {
      const response = await api.get<ListingDetailResponse>(`/listings/${id}`);
      const listing = response.data.data?.listing;
      if (!listing) throw new Error('Listing not found');
      return listing;
    },
  });

  // 2. Fetch compatibility explanation (lazy, on-demand, blocks only this section)
  const explanationQuery = useQuery({
    queryKey: ['listing-explanation', id],
    queryFn: async () => {
      const response = await api.get<ExplanationResponse>(`/listings/${id}/explanation`);
      return response.data.data;
    },
    enabled: !!listingQuery.data?.score, // only fetch if a score exists
  });

  // Express interest mutation
  const expressInterestMutation = useMutation({
    mutationFn: async (): Promise<Interest> => {
      const response = await api.post<ApiResponse<{ interest: Interest }>>('/interests', {
        listingId: id,
      });
      const interest = response.data.data?.interest;
      if (!interest) throw new Error('Interest was not returned by the server');
      return interest;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listing', id] });
      void queryClient.invalidateQueries({ queryKey: ['my-interests'] });
      toast.success('Interest expressed successfully!');
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message ?? 'Failed to express interest';
      toast.error(message);
    },
  });

  if (listingQuery.isLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading room details...</p>
      </div>
    );
  }

  if (listingQuery.isError || !listingQuery.data) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Failed to load listing details.</p>
        <Link
          to="/dashboard/browse"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to browse
        </Link>
      </div>
    );
  }

  const listing = listingQuery.data;
  const score = listing.score?.score;
  const activeInterest = listing.interest;

  return (
    <div className="mx-auto max-w-4xl animate-fade-in space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/dashboard/browse"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to browse
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Cover Image */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm h-64 md:h-96 flex items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-secondary">
            {listing.photos[0] ? (
              <img src={listing.photos[0].url} alt={listing.title} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-16 w-16 text-primary/60" />
            )}
            <span className="absolute bottom-4 left-4 rounded-full bg-card/90 px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur">
              {listing.roomType.replace('_', ' ')}
            </span>
          </div>

          {/* Heading */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                {listing.area}, {listing.city}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Rent</span>
                <p className="flex items-center gap-1 font-bold text-foreground">
                  <Wallet className="h-4 w-4 text-primary" />
                  {currency.format(listing.rent)}/mo
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Furnishing</span>
                <p className="font-medium text-foreground">{listing.furnishing.replace('_', ' ')}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Availability</span>
                <p className="flex items-center gap-1 font-medium text-foreground">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {format(new Date(listing.availableFrom), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Listed By</span>
                <p className="flex items-center gap-1 font-medium text-foreground">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  {listing.owner?.name ?? 'Room Owner'}
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold">About this place</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground whitespace-pre-line">
              {listing.description || 'The owner has not provided a description yet.'}
            </p>
          </div>
        </div>

        {/* Sidebar / Match Widget */}
        <div className="space-y-6">
          {/* Match Score & Explanation Widget */}
          {score !== undefined && (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground">Match Quality</h3>
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Est. Match</span>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-xl font-extrabold shadow-sm ${scoreColor(
                    score
                  )}`}
                >
                  {score}%
                </span>
                <div>
                  <h4 className="font-semibold text-sm">Deterministic Match</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Based on budget, city, location, and dates.</p>
                </div>
              </div>

              {/* Dynamic Explanation Section */}
              <div className="border-t border-border pt-4">
                {explanationQuery.isLoading ? (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary animate-pulse">
                      <Sparkles className="h-3.5 w-3.5 text-primary animate-spin" />
                      Generating AI compatibility breakdown...
                    </div>
                    <div className="h-16 w-full animate-pulse rounded-lg bg-secondary" />
                  </div>
                ) : explanationQuery.isError ? (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 p-3 text-xs text-rose-700 dark:text-rose-400">
                    Failed to fetch AI explanation. Please reload to try again.
                  </div>
                ) : explanationQuery.data ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                        {explanationQuery.data.explanationSource === 'LLM'
                          ? '🤖 AI Compatibility Match'
                          : '📊 Compatibility Summary'}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground bg-secondary/30 rounded-lg p-3 border border-border/50">
                      {explanationQuery.data.explanation}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Interest & Interaction Widget */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-foreground">Next Steps</h3>

            {activeInterest ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {activeInterest.status === 'PENDING' && (
                    <div className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400">
                      <Clock className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-bold">Interest Pending</p>
                        <p className="text-xs text-amber-600/80 font-normal mt-0.5">Waiting for owner response.</p>
                      </div>
                    </div>
                  )}
                  {activeInterest.status === 'ACCEPTED' && (
                    <div className="flex w-full flex-col gap-3">
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-bold">Interest Accepted!</p>
                          <p className="text-xs text-emerald-600/80 font-normal mt-0.5">Check your inbox to chat.</p>
                        </div>
                      </div>
                      <Link
                        to="/dashboard/chat"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                      >
                        Open Inbox to Chat
                      </Link>
                    </div>
                  )}
                  {activeInterest.status === 'DECLINED' && (
                    <div className="flex w-full items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-bold">Interest Declined</p>
                        <p className="text-xs text-rose-600/80 font-normal mt-0.5">This interest was declined.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => expressInterestMutation.mutate()}
                disabled={expressInterestMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {expressInterestMutation.isPending ? 'Sending interest...' : 'Express interest'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
