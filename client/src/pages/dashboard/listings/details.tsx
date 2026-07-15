import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, Building2, Calendar, CheckCircle2, Clock,
  Loader2, MapPin, Send, Sparkles, UserRound, Wallet, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ApiResponse, Interest, Listing } from 'shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';
import { isAxiosError } from 'axios';

type ListingDetailResponse = ApiResponse<{ listing: Listing }>;
type ExplanationResponse = ApiResponse<{
  score: number;
  explanation: string;
  explanationSource: 'LLM' | 'TEMPLATED';
  explanationVersion: string;
}>;

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const SURFACE  = 'oklch(0.135 0.006 240)';
const SURFACE2 = 'oklch(0.175 0.008 240)';
const BORDER   = 'oklch(0.210 0.006 240)';
const INK      = 'oklch(0.930 0 0)';
const MUTED    = 'oklch(0.520 0.010 240)';
const PRIMARY  = 'oklch(0.530 0.115 195)';

function scoreColor(score: number): string {
  if (score >= 80) return 'oklch(0.680 0.145 148)';
  if (score >= 60) return 'oklch(0.720 0.130 75)';
  return 'oklch(0.580 0.185 25)';
}

function ScoreCircle({ score }: { score: number }) {
  const size = 64;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={SURFACE2} strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold" style={{ color }}>{score}</span>
        <span className="text-[9px]" style={{ color: MUTED }}>/ 100</span>
      </div>
    </div>
  );
}

export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // ── ALL HOOKS MUST BE AT THE TOP — before any conditional returns ──
  const user = useAuthStore((s) => s.user);
  const isTenant = user?.role === 'TENANT';

  const listingQuery = useQuery({
    queryKey: ['listing', id],
    queryFn: async (): Promise<Listing> => {
      const response = await api.get<ListingDetailResponse>(`/listings/${id}`);
      const listing = response.data.data?.listing;
      if (!listing) throw new Error('Listing not found');
      return listing;
    },
  });

  const explanationQuery = useQuery({
    queryKey: ['listing-explanation', id],
    queryFn: async () => {
      const response = await api.get<ExplanationResponse>(`/listings/${id}/explanation`);
      return response.data.data;
    },
    // Only run if we have a listing with a score AND the user is a tenant
    enabled: isTenant && !!listingQuery.data?.score,
    // Don't treat a 400 (no profile) as a hard error — just show nothing
    retry: false,
  });

  const expressInterestMutation = useMutation({
    mutationFn: async (): Promise<Interest> => {
      const response = await api.post<ApiResponse<{ interest: Interest }>>('/interests', { listingId: id });
      const interest = response.data.data?.interest;
      if (!interest) throw new Error('Interest was not returned by the server');
      return interest;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listing', id] });
      void queryClient.invalidateQueries({ queryKey: ['my-interests'] });
      toast.success('Interest expressed successfully!');
    },
    onError: (error: unknown) => {
      if (isAxiosError<ApiResponse>(error)) {
        const msg = error.response?.data?.error?.message;
        if (msg?.includes('profile')) {
          toast.error('Set up your tenant profile first before expressing interest.');
          return;
        }
        toast.error(msg ?? 'Failed to express interest');
      } else {
        toast.error('Failed to express interest');
      }
    },
  });

  // ── Early returns AFTER all hooks ──
  if (listingQuery.isLoading) {
    return (
      <div className="flex h-80 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: PRIMARY }} />
        <p className="text-sm" style={{ color: MUTED }}>Loading room details…</p>
      </div>
    );
  }

  if (listingQuery.isError || !listingQuery.data) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: SURFACE, border: `1px solid oklch(0.580 0.185 25 / 0.3)` }}>
        <p className="font-semibold text-sm" style={{ color: 'oklch(0.580 0.185 25)' }}>Failed to load listing details.</p>
        <Link to="/dashboard/browse" className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-4 w-4" /> Back to browse
        </Link>
      </div>
    );
  }

  const listing = listingQuery.data;
  const score = listing.score?.score;
  const activeInterest = listing.interest;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        to="/dashboard/browse"
        className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
        style={{ color: MUTED }}
        onMouseEnter={e => (e.currentTarget.style.color = INK)}
        onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
      >
        <ArrowLeft className="h-4 w-4" /> Back to browse
      </Link>

      <div className="grid gap-5 md:grid-cols-3">
        {/* Main content */}
        <div className="md:col-span-2 space-y-4">
          {/* Cover image */}
          <div
            className="relative overflow-hidden rounded-xl h-60 md:h-80 flex items-center justify-center"
            style={{ backgroundColor: SURFACE2 }}
          >
            {listing.photos[0] ? (
              <img src={listing.photos[0].url} alt={listing.title} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-12 w-12" style={{ color: 'oklch(0.530 0.115 195 / 0.3)' }} />
            )}
            <span
              className="absolute bottom-3 left-3 rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: 'oklch(0.090 0 0 / 0.75)', color: INK, backdropFilter: 'blur(4px)' }}
            >
              {listing.roomType.replace('_', ' ')}
            </span>
          </div>

          {/* Details card */}
          <div className="rounded-xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
            <h1 className="text-heading-lg" style={{ color: INK }}>{listing.title}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: MUTED }}>
              <MapPin className="h-4 w-4" style={{ color: PRIMARY }} />
              {listing.area}, {listing.city}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              {[
                { label: 'Rent', value: `${currency.format(listing.rent)}/mo`, icon: Wallet },
                { label: 'Furnishing', value: listing.furnishing.replace('_', ' '), icon: null },
                { label: 'Available', value: format(new Date(listing.availableFrom), 'MMM d, yyyy'), icon: Calendar },
                { label: 'Listed by', value: listing.owner?.name ?? 'Room Owner', icon: UserRound },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</span>
                  <p className="flex items-center gap-1 text-sm font-medium" style={{ color: INK }}>
                    {Icon && <Icon className="h-4 w-4" style={{ color: MUTED }} />}
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
            <h2 className="text-heading-sm mb-3" style={{ color: INK }}>About this place</h2>
            <p className="text-sm leading-6 whitespace-pre-line" style={{ color: MUTED }}>
              {listing.description || 'The owner has not provided a description yet.'}
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Match score widget — only for tenants with a score */}
          {isTenant && score !== undefined && (
            <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
              <h3 className="text-sm font-semibold" style={{ color: INK }}>Match Quality</h3>

              <div className="flex items-center gap-4">
                <ScoreCircle score={score} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: INK }}>Deterministic Match</p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    Based on budget, city, location, and dates.
                  </p>
                </div>
              </div>

              <div className="pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                {explanationQuery.isLoading ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold animate-pulse" style={{ color: PRIMARY }}>
                      <Sparkles className="h-3.5 w-3.5 animate-spin" />
                      Generating AI breakdown…
                    </div>
                    <div className="skeleton h-14 rounded-lg" />
                  </div>
                ) : explanationQuery.isError ? (
                  <p className="text-xs rounded-lg p-3" style={{ backgroundColor: 'oklch(0.580 0.185 25 / 0.08)', color: 'oklch(0.580 0.185 25)' }}>
                    AI explanation unavailable. Set up your tenant profile to enable this.
                  </p>
                ) : explanationQuery.data ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: PRIMARY }}>
                      <Sparkles className="h-3.5 w-3.5" />
                      {explanationQuery.data.explanationSource === 'LLM' ? 'AI Compatibility Match' : 'Compatibility Summary'}
                    </div>
                    <p
                      className="text-xs leading-relaxed rounded-lg p-3"
                      style={{ backgroundColor: SURFACE2, color: MUTED, border: `1px solid ${BORDER}` }}
                    >
                      {explanationQuery.data.explanation}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Interest widget — only shown to tenants */}
          {isTenant && (
            <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
              <h3 className="text-sm font-semibold" style={{ color: INK }}>Next Steps</h3>

              {activeInterest ? (
                <div className="space-y-2.5">
                  {activeInterest.status === 'PENDING' && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-3.5 py-3 text-sm"
                      style={{ backgroundColor: 'oklch(0.720 0.130 75 / 0.1)', color: 'oklch(0.720 0.130 75)', border: '1px solid oklch(0.720 0.130 75 / 0.25)' }}
                    >
                      <Clock className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Interest Pending</p>
                        <p className="text-xs opacity-80 font-normal mt-0.5">Waiting for owner response.</p>
                      </div>
                    </div>
                  )}
                  {activeInterest.status === 'ACCEPTED' && (
                    <div className="flex flex-col gap-2.5">
                      <div
                        className="flex items-center gap-2 rounded-lg px-3.5 py-3 text-sm"
                        style={{ backgroundColor: 'oklch(0.680 0.145 148 / 0.1)', color: 'oklch(0.680 0.145 148)', border: '1px solid oklch(0.680 0.145 148 / 0.25)' }}
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-semibold">Interest Accepted!</p>
                          <p className="text-xs opacity-80 font-normal mt-0.5">Check your inbox to chat.</p>
                        </div>
                      </div>
                      <Link
                        to="/dashboard/chat"
                        className="btn-primary w-full h-9 text-sm justify-center"
                      >
                        Open Inbox
                      </Link>
                    </div>
                  )}
                  {activeInterest.status === 'DECLINED' && (
                    <div
                      className="flex items-center gap-2 rounded-lg px-3.5 py-3 text-sm"
                      style={{ backgroundColor: 'oklch(0.580 0.185 25 / 0.1)', color: 'oklch(0.580 0.185 25)', border: '1px solid oklch(0.580 0.185 25 / 0.25)' }}
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Interest Declined</p>
                        <p className="text-xs opacity-80 font-normal mt-0.5">This interest was declined.</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => expressInterestMutation.mutate()}
                  disabled={expressInterestMutation.isPending}
                  className="btn-primary w-full h-9 text-sm justify-center disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {expressInterestMutation.isPending ? 'Sending…' : 'Express Interest'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
