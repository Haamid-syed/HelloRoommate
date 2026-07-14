import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { format } from 'date-fns';
import { Building2, CheckCircle2, ChevronDown, Clock, MapPin, Search, Send, SlidersHorizontal, Wallet, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { ApiResponse, Interest, Listing, ListingsFilterInput } from 'shared';
import { api } from '@/lib/api';
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

function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ApiResponse>(error)) return error.response?.data.error?.message ?? fallback;
  return fallback;
}

/* ── Animated SVG Score Ring ── */
function ScoreRing({ score }: { score: number }) {
  const size = 56;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;

  const color =
    score >= 80 ? 'hsl(152, 45%, 48%)' :
    score >= 60 ? 'hsl(37, 78%, 60%)' :
    'hsl(0, 65%, 60%)';

  const textClass =
    score >= 80 ? 'score-high' :
    score >= 60 ? 'score-mid' :
    'score-low';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-sm font-bold leading-none ${textClass}`}>{score}</span>
        <span className="text-[9px] text-muted-foreground leading-none mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

function ListingResultCard({ listing, index }: { listing: Listing; index: number }) {
  const score = listing.score?.score;
  const queryClient = useQueryClient();
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
      className="card-elevated card-hover rounded-2xl overflow-hidden flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Image / gradient header */}
      <div className="relative h-44 overflow-hidden">
        {listing.photos[0] ? (
          <img src={listing.photos[0].url} alt={listing.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, hsl(var(--surface-2)), hsl(var(--surface)))' }}
          >
            <Building2 className="h-10 w-10" style={{ color: 'hsl(37 78% 60% / 0.4)' }} />
          </div>
        )}
        {/* Room type pill */}
        <span className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm"
          style={{ background: 'hsl(var(--background) / 0.85)', color: 'hsl(var(--foreground))' }}
        >
          {listing.roomType.replace('_', ' ')}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 p-5 flex flex-col gap-4">
        {/* Title + Score */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-foreground leading-snug line-clamp-2">
              {listing.title}
            </h2>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {listing.area}, {listing.city}
            </p>
          </div>
          {score !== undefined && <ScoreRing score={score} />}
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-gold shrink-0" />
            <span className="font-semibold text-foreground">{currency.format(listing.rent)}/mo</span>
            <span className="text-muted-foreground text-xs">· {listing.furnishing.replace('_', ' ')}</span>
          </div>
          <p className="text-xs text-muted-foreground pl-5">
            Available {format(new Date(listing.availableFrom), 'MMM d, yyyy')}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-auto pt-3 border-t border-border space-y-2">
          {activeInterest ? (
            <div className="flex items-center gap-2 text-xs font-medium">
              {activeInterest.status === 'PENDING' && (
                <span className="badge-pending"><Clock className="h-3 w-3" /> Pending</span>
              )}
              {activeInterest.status === 'ACCEPTED' && (
                <span className="badge-accepted"><CheckCircle2 className="h-3 w-3" /> Accepted</span>
              )}
              {activeInterest.status === 'DECLINED' && (
                <span className="badge-declined"><XCircle className="h-3 w-3" /> Declined</span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => expressInterestMutation.mutate()}
              disabled={expressInterestMutation.isPending}
              className="w-full h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50"
              style={{ background: 'hsl(37 78% 60% / 0.12)', color: 'hsl(37 78% 65%)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'hsl(37 78% 60% / 0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'hsl(37 78% 60% / 0.12)')}
            >
              <Send className="h-3.5 w-3.5" />
              {expressInterestMutation.isPending ? 'Sending…' : 'Express Interest'}
            </button>
          )}
          <Link
            to={`/dashboard/listings/${listing.id}`}
            className="flex w-full h-9 items-center justify-center rounded-lg text-xs font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-surface-2"
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
      {/* Page header */}
      <div className="mb-8">
        <p className="label-overline">Tenant Dashboard</p>
        <h1 className="font-serif text-display-md text-foreground mt-2">Find your next room</h1>
        <p className="text-muted-foreground text-sm mt-2">AI-ranked listings matched to your preferences.</p>
      </div>

      {/* Filter panel */}
      <div className="card-elevated rounded-2xl mb-8 overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between p-4 text-sm font-semibold text-foreground hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gold" />
            Filters
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>

        {filtersOpen && (
          <form onSubmit={applyFilters} className="border-t border-border p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <input aria-label="City" value={draft.city} onChange={(e) => setDraft((c) => ({ ...c, city: e.target.value }))} placeholder="City" className="input-dark h-10 px-3 text-sm" />
              <input aria-label="Min rent" type="number" min={1} value={draft.minRent} onChange={(e) => setDraft((c) => ({ ...c, minRent: e.target.value }))} placeholder="Min rent" className="input-dark h-10 px-3 text-sm" />
              <input aria-label="Max rent" type="number" min={1} value={draft.maxRent} onChange={(e) => setDraft((c) => ({ ...c, maxRent: e.target.value }))} placeholder="Max rent" className="input-dark h-10 px-3 text-sm" />
              <select aria-label="Room type" value={draft.roomType} onChange={(e) => setDraft((c) => ({ ...c, roomType: e.target.value }))} className="input-dark h-10 px-3 text-sm">
                <option value="">Any room type</option>
                <option value="PRIVATE">Private Room</option>
                <option value="SHARED">Shared Room</option>
                <option value="STUDIO">Studio</option>
                <option value="ONE_BHK">1 BHK</option>
                <option value="TWO_BHK">2 BHK</option>
              </select>
              <select aria-label="Furnishing" value={draft.furnishing} onChange={(e) => setDraft((c) => ({ ...c, furnishing: e.target.value }))} className="input-dark h-10 px-3 text-sm">
                <option value="">Any furnishing</option>
                <option value="UNFURNISHED">Unfurnished</option>
                <option value="SEMI_FURNISHED">Semi-Furnished</option>
                <option value="FURNISHED">Furnished</option>
              </select>
              <select aria-label="Sort" value={draft.sort} onChange={(e) => setDraft((c) => ({ ...c, sort: e.target.value as FilterForm['sort'] }))} className="input-dark h-10 px-3 text-sm">
                <option value="score">Best match</option>
                <option value="rent">Price: low → high</option>
                <option value="recency">Newest</option>
              </select>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={resetFilters} className="h-9 px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Reset
              </button>
              <button type="submit" className="btn-gold h-9 px-4 text-sm flex items-center gap-2">
                <Search className="h-4 w-4" /> Apply filters
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Results */}
      {listingsQuery.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-[380px] rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : listingsQuery.isError ? (
        <div className="rounded-2xl border border-destructive/20 p-8 text-center"
          style={{ background: 'hsl(0 65% 60% / 0.05)' }}
        >
          <p className="font-medium text-red-400">Listings could not be loaded.</p>
          <button type="button" onClick={() => listingsQuery.refetch()} className="mt-3 text-sm font-semibold text-gold hover:underline">
            Try again
          </button>
        </div>
      ) : listings.length === 0 ? (
        <div className="card-elevated rounded-2xl px-8 py-16 text-center border-dashed">
          <Building2 className="mx-auto h-8 w-8 text-gold opacity-50" />
          <h2 className="mt-4 font-serif text-lg font-semibold text-foreground">No listings match your filters</h2>
          <p className="mt-2 text-sm text-muted-foreground">Try adjusting your search to see more rooms.</p>
        </div>
      ) : (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            Showing <span className="text-foreground font-semibold">{listings.length}</span> {listings.length === 1 ? 'listing' : 'listings'}
          </p>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((listing, i) => (
              <ListingResultCard key={listing.id} listing={listing} index={i} />
            ))}
          </div>
          {listingsQuery.hasNextPage && (
            <div className="mt-10 text-center">
              <button
                type="button"
                disabled={listingsQuery.isFetchingNextPage}
                onClick={() => listingsQuery.fetchNextPage()}
                className="btn-ghost h-11 px-8 text-sm font-medium disabled:opacity-50"
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
