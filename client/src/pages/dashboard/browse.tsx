import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import {
  AlertCircle, Building2, CheckCircle2, ChevronDown, Clock, MapPin,
  Search, Send, SlidersHorizontal, Wallet, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ApiResponse, Interest, Listing, ListingsFilterInput } from 'shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { motion } from 'framer-motion';

type ListingSearchResponse = ApiResponse<{ listings: Listing[] }>;
type BrowseFilters = Pick<ListingsFilterInput, 'city' | 'minRent' | 'maxRent' | 'roomType' | 'furnishing' | 'sort'> & {
  limit: number;
};
type FilterForm = {
  city: string;
  minRent: string;
  maxRent: string;
  roomType: string;
  furnishing: string;
  sort: 'score' | 'rent' | 'recency';
};

const initialFilterForm: FilterForm = { city: '', minRent: '', maxRent: '', roomType: '', furnishing: '', sort: 'score' };
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const SURFACE   = 'oklch(0.135 0.006 240)';
const SURFACE2  = 'oklch(0.175 0.008 240)';
const BORDER    = 'oklch(0.210 0.006 240)';
const INK       = 'oklch(0.930 0 0)';
const MUTED     = 'oklch(0.520 0.010 240)';
const PRIMARY   = 'oklch(0.530 0.115 195)';

function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiResponse>(error)) return error.response?.data.error?.message ?? fallback;
  return fallback;
}

/* ── Animated SVG Score Ring ── */
function ScoreRing({ score }: { score: number }) {
  const size = 52;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  const color =
    score >= 80 ? 'oklch(0.680 0.145 148)' :
    score >= 60 ? 'oklch(0.720 0.130 75)' :
    'oklch(0.580 0.185 25)';

  const textColor =
    score >= 80 ? 'oklch(0.680 0.145 148)' :
    score >= 60 ? 'oklch(0.720 0.130 75)' :
    'oklch(0.580 0.185 25)';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="oklch(0.210 0.006 240)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold leading-none" style={{ color: textColor }}>{score}</span>
        <span className="text-[9px] leading-none mt-0.5" style={{ color: MUTED }}>/ 100</span>
      </div>
    </div>
  );
}

function ListingResultCard({ listing, index }: { listing: Listing; index: number }) {
  const score = listing.score?.score;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isTenant = user?.role === 'TENANT';
  const expressInterestMutation = useMutation({
    mutationFn: async (): Promise<Interest> => {
      const response = await api.post<ApiResponse<{ interest: Interest }>>('/interests', { listingId: listing.id });
      const interest = response.data.data?.interest;
      if (!interest) throw new Error('Interest was not returned');
      return interest;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      void queryClient.invalidateQueries({ queryKey: ['my-interests'] });
      toast.success('Interest expressed!');
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error, 'Failed to express interest')),
  });
  const activeInterest = listing.interest;

  return (
    <motion.article
      className="rounded-xl overflow-hidden flex flex-col card-hover"
      style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Image */}
      <div className="relative h-40 overflow-hidden flex-shrink-0">
        {listing.photos[0] ? (
          <img
            src={listing.photos[0].url}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: SURFACE2 }}>
            <Building2 className="h-8 w-8" style={{ color: 'oklch(0.530 0.115 195 / 0.3)' }} />
          </div>
        )}
        <span
          className="absolute bottom-2.5 left-2.5 rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: 'oklch(0.090 0 0 / 0.8)', color: INK, backdropFilter: 'blur(4px)' }}
        >
          {listing.roomType.replace('_', ' ')}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: INK }}>
              {listing.title}
            </h2>
            <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: MUTED }}>
              <MapPin className="h-3 w-3 shrink-0" />
              {listing.area}, {listing.city}
            </p>
          </div>
          {score !== undefined && <ScoreRing score={score} />}
        </div>

        <div className="text-sm">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 shrink-0" style={{ color: PRIMARY }} />
            <span className="font-semibold" style={{ color: INK }}>{currency.format(listing.rent)}/mo</span>
            <span className="text-xs" style={{ color: MUTED }}>· {listing.furnishing.replace('_', ' ')}</span>
          </div>
          <p className="text-xs mt-1 pl-5" style={{ color: MUTED }}>
            Available {format(new Date(listing.availableFrom), 'MMM d, yyyy')}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-auto pt-3 space-y-2" style={{ borderTop: `1px solid ${BORDER}` }}>
          {activeInterest ? (
            <div className="flex items-center gap-1.5 text-xs">
              {activeInterest.status === 'PENDING'  && <span className="badge-warning"><Clock className="h-3 w-3" /> Pending</span>}
              {activeInterest.status === 'ACCEPTED' && <span className="badge-success"><CheckCircle2 className="h-3 w-3" /> Accepted</span>}
              {activeInterest.status === 'DECLINED' && <span className="badge-error"><XCircle className="h-3 w-3" /> Declined</span>}
            </div>
          ) : isTenant ? (
            <button
              type="button"
              onClick={() => expressInterestMutation.mutate()}
              disabled={expressInterestMutation.isPending}
              className="w-full h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors duration-150 disabled:opacity-50"
              style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.1)', color: PRIMARY, border: '1px solid oklch(0.530 0.115 195 / 0.25)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'oklch(0.530 0.115 195 / 0.18)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'oklch(0.530 0.115 195 / 0.1)')}
            >
              <Send className="h-3 w-3" />
              {expressInterestMutation.isPending ? 'Sending…' : 'Express Interest'}
            </button>
          ) : null}
          <Link
            to={`/dashboard/listings/${listing.id}`}
            className="flex w-full h-7 items-center justify-center rounded-md text-xs font-medium transition-colors duration-150"
            style={{ color: MUTED }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = INK; (e.currentTarget as HTMLElement).style.backgroundColor = SURFACE2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
          >
            View AI match details →
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export default function BrowseListings() {
  const [draft, setDraft] = useState<FilterForm>(initialFilterForm);
  const [filters, setFilters] = useState<BrowseFilters>({ sort: 'score', limit: 20 });
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Check if the tenant has a profile set up (so we can show a banner if not)
  const profileQuery = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<{ profile: unknown }>>('/tenants/me/profile');
      return response.data.data?.profile ?? null;
    },
    retry: false,
  });
  const hasProfile = !!profileQuery.data;

  const listingsQuery = useInfiniteQuery({
    queryKey: ['listings', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ListingSearchResponse> => {
      const response = await api.get<ListingSearchResponse>('/listings', { params: { ...filters, cursor: pageParam } });
      return response.data;
    },
    getNextPageParam: (lastPage): string | undefined =>
      lastPage.meta?.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
  });

  const listings = listingsQuery.data?.pages.flatMap((p) => p.data?.listings ?? []) ?? [];

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({
      city: draft.city.trim() || undefined,
      minRent: draft.minRent ? Number(draft.minRent) : undefined,
      maxRent: draft.maxRent ? Number(draft.maxRent) : undefined,
      roomType: draft.roomType ? draft.roomType as BrowseFilters['roomType'] : undefined,
      furnishing: draft.furnishing ? draft.furnishing as BrowseFilters['furnishing'] : undefined,
      sort: draft.sort,
      limit: 20,
    });
  };

  const resetFilters = () => {
    setDraft(initialFilterForm);
    setFilters({ sort: 'score', limit: 20 });
  };

  return (
    <section>
      <div className="page-header">
        <h1>Browse rooms</h1>
        <p>AI-ranked listings matched to your preferences.</p>
      </div>

      {/* No-profile banner */}
      {!profileQuery.isLoading && !hasProfile && (
        <div
          className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3.5"
          style={{ backgroundColor: 'oklch(0.720 0.130 75 / 0.08)', border: '1px solid oklch(0.720 0.130 75 / 0.3)' }}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'oklch(0.720 0.130 75)' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'oklch(0.720 0.130 75)' }}>Tenant profile not set up</p>
            <p className="text-xs mt-0.5" style={{ color: 'oklch(0.520 0.010 240)' }}>
              Set up your profile to get AI-matched scores and express interest in listings.
            </p>
          </div>
          <Link
            to="/dashboard/profile"
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: 'oklch(0.720 0.130 75 / 0.15)', color: 'oklch(0.720 0.130 75)' }}
          >
            Set up now →
          </Link>
        </div>
      )}

      {/* Filter panel */}
      <div className="rounded-xl mb-6 overflow-hidden" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
          style={{ color: INK }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = SURFACE2)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" style={{ color: PRIMARY }} />
            Filters
          </div>
          <ChevronDown
            className="h-4 w-4 transition-transform duration-200"
            style={{ color: MUTED, transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>

        {filtersOpen && (
          <form onSubmit={applyFilters} className="px-4 pb-4" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '1rem' }}>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <input aria-label="City"     value={draft.city}       onChange={(e) => setDraft((c) => ({ ...c, city: e.target.value }))}      placeholder="City"           className="input-field h-9 px-3 text-sm" />
              <input aria-label="Min rent" type="number" min={1}    value={draft.minRent}    onChange={(e) => setDraft((c) => ({ ...c, minRent: e.target.value }))}   placeholder="Min rent"       className="input-field h-9 px-3 text-sm" />
              <input aria-label="Max rent" type="number" min={1}    value={draft.maxRent}    onChange={(e) => setDraft((c) => ({ ...c, maxRent: e.target.value }))}   placeholder="Max rent"       className="input-field h-9 px-3 text-sm" />
              <select aria-label="Room type"  value={draft.roomType}   onChange={(e) => setDraft((c) => ({ ...c, roomType: e.target.value }))} className="input-field h-9 px-3 text-sm">
                <option value="">Any room type</option>
                <option value="PRIVATE">Private Room</option>
                <option value="SHARED">Shared Room</option>
                <option value="STUDIO">Studio</option>
                <option value="ONE_BHK">1 BHK</option>
                <option value="TWO_BHK">2 BHK</option>
              </select>
              <select aria-label="Furnishing" value={draft.furnishing} onChange={(e) => setDraft((c) => ({ ...c, furnishing: e.target.value }))} className="input-field h-9 px-3 text-sm">
                <option value="">Any furnishing</option>
                <option value="UNFURNISHED">Unfurnished</option>
                <option value="SEMI_FURNISHED">Semi-Furnished</option>
                <option value="FURNISHED">Furnished</option>
              </select>
              <select aria-label="Sort" value={draft.sort} onChange={(e) => setDraft((c) => ({ ...c, sort: e.target.value as FilterForm['sort'] }))} className="input-field h-9 px-3 text-sm">
                <option value="score">Best match</option>
                <option value="rent">Price: low → high</option>
                <option value="recency">Newest</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={resetFilters} className="btn-ghost h-8 px-3 text-sm">
                Reset
              </button>
              <button type="submit" className="btn-primary h-8 px-3 text-sm">
                <Search className="h-3.5 w-3.5" />
                Apply
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Results */}
      {listingsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-[340px] rounded-xl" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : listingsQuery.isError ? (
        <div className="rounded-xl p-8 text-center" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
          <p className="text-sm font-medium" style={{ color: 'oklch(0.580 0.185 25)' }}>Listings could not be loaded.</p>
          <button type="button" onClick={() => listingsQuery.refetch()} className="mt-3 text-sm font-medium transition-colors" style={{ color: PRIMARY }}>
            Try again
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-xl px-8 py-14 text-center" style={{ backgroundColor: SURFACE, border: `1px dashed ${BORDER}` }}>
          <Building2 className="mx-auto h-7 w-7 mb-3" style={{ color: 'oklch(0.530 0.115 195 / 0.4)' }} />
          <h2 className="text-heading-sm" style={{ color: INK }}>No listings match your filters</h2>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>Try adjusting your search to see more rooms.</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs" style={{ color: MUTED }}>
            Showing <span className="font-medium" style={{ color: INK }}>{listings.length}</span>{' '}
            {listings.length === 1 ? 'listing' : 'listings'}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing, i) => (
              <ListingResultCard key={listing.id} listing={listing} index={i} />
            ))}
          </div>
          {listingsQuery.hasNextPage && (
            <div className="mt-8 text-center">
              <button
                type="button"
                disabled={listingsQuery.isFetchingNextPage}
                onClick={() => listingsQuery.fetchNextPage()}
                className="btn-ghost h-9 px-6 text-sm disabled:opacity-50"
              >
                {listingsQuery.isFetchingNextPage ? 'Loading…' : 'Load more listings'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
