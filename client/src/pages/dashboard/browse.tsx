import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2, ChevronDown, MapPin, Search, SlidersHorizontal, UserRound, Wallet } from 'lucide-react';
import type { ApiResponse, Listing, ListingsFilterInput } from 'shared';
import { api } from '@/lib/api';

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

const initialFilterForm: FilterForm = {
  city: '',
  minRent: '',
  maxRent: '',
  roomType: '',
  furnishing: '',
  sort: 'score',
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function scoreColor(score: number) {
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function ListingResultCard({ listing }: { listing: Listing }) {
  const score = listing.score?.score;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-secondary">
        {listing.photos[0] ? (
          <img src={listing.photos[0].url} alt={listing.title} className="h-full w-full object-cover" />
        ) : (
          <Building2 className="h-10 w-10 text-primary/60" />
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur">
          {listing.roomType.replace('_', ' ')}
        </span>
        {score !== undefined && (
          <div className="absolute right-3 top-3 flex flex-col items-center gap-0.5">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold shadow-sm ${scoreColor(score)}`}
              title={`Compatibility score: ${score}/100`}
            >
              {score}
            </span>
            <span className="rounded-full bg-card/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              {listing.score?.source === 'LLM' ? 'AI' : 'Est.'}
            </span>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{listing.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{listing.area}, {listing.city}</p>
          </div>
          {score === undefined && <span className="shrink-0 text-sm font-medium text-muted-foreground">N/A</span>}
        </div>

        <div className="mt-5 space-y-2.5 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-primary" />{currency.format(listing.rent)}/mo <span className="font-normal text-muted-foreground">• {listing.furnishing.replace('_', ' ')}</span></p>
          <p className="text-muted-foreground">Available {format(new Date(listing.availableFrom), 'MMM d, yyyy')}</p>
          <p className="flex items-center gap-2 text-muted-foreground"><UserRound className="h-4 w-4" />Listed by {listing.owner?.name ?? 'Room owner'}</p>
        </div>

        <details className="group mt-5 border-t border-border pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-primary hover:text-primary/80">
            View details
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="pt-3 text-sm leading-6 text-muted-foreground">
            {listing.description || 'The owner has not added a description yet.'}
            {listing.score?.explanation && (
              <p className={`mt-3 rounded-lg p-3 text-sm ${
                listing.score.source === 'LLM'
                  ? 'border border-primary/20 bg-primary/5 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {listing.score.source === 'LLM' ? '🤖 AI Match: ' : '📊 Estimated: '}
                {listing.score.explanation}
              </p>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}

export default function BrowseListings() {
  const [draft, setDraft] = useState<FilterForm>(initialFilterForm);
  const [filters, setFilters] = useState<BrowseFilters>({ sort: 'score', limit: 20 });

  const listingsQuery = useInfiniteQuery({
    queryKey: ['listings', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ListingSearchResponse> => {
      const response = await api.get<ListingSearchResponse>('/listings', {
        params: { ...filters, cursor: pageParam },
      });
      return response.data;
    },
    getNextPageParam: (lastPage): string | undefined =>
      lastPage.meta?.hasMore ? lastPage.meta.cursor ?? undefined : undefined,
  });

  const listings = listingsQuery.data?.pages.flatMap((page) => page.data?.listings ?? []) ?? [];

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
    <section className="animate-fade-in">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Tenant dashboard</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Find your next room</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search active rooms by the location, price, and setup that work for you.</p>
      </div>

      <form onSubmit={applyFilters} className="mb-7 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><h2 className="font-semibold">Filters</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <input aria-label="City" value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="City" className="h-10 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <input aria-label="Minimum monthly rent" type="number" min={1} value={draft.minRent} onChange={(event) => setDraft((current) => ({ ...current, minRent: event.target.value }))} placeholder="Min rent" className="h-10 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <input aria-label="Maximum monthly rent" type="number" min={1} value={draft.maxRent} onChange={(event) => setDraft((current) => ({ ...current, maxRent: event.target.value }))} placeholder="Max rent" className="h-10 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <select aria-label="Room type" value={draft.roomType} onChange={(event) => setDraft((current) => ({ ...current, roomType: event.target.value }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><option value="">Any room type</option><option value="PRIVATE">Private Room</option><option value="SHARED">Shared Room</option><option value="STUDIO">Studio</option><option value="ONE_BHK">1 BHK</option><option value="TWO_BHK">2 BHK</option></select>
          <select aria-label="Furnishing" value={draft.furnishing} onChange={(event) => setDraft((current) => ({ ...current, furnishing: event.target.value }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><option value="">Any furnishing</option><option value="UNFURNISHED">Unfurnished</option><option value="SEMI_FURNISHED">Semi-Furnished</option><option value="FURNISHED">Furnished</option></select>
          <select aria-label="Sort listings" value={draft.sort} onChange={(event) => setDraft((current) => ({ ...current, sort: event.target.value as FilterForm['sort'] }))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"><option value="score">Relevance</option><option value="rent">Price: low to high</option><option value="recency">Newest</option></select>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={resetFilters} className="h-10 px-3 text-sm font-medium text-muted-foreground hover:text-foreground">Reset</button>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Search className="h-4 w-4" />Apply filters</button>
        </div>
      </form>

      {listingsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <div key={index} className="h-80 animate-pulse rounded-2xl bg-secondary" />)}</div>
      ) : listingsQuery.isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center"><p className="font-medium text-destructive">Listings could not be loaded.</p><button type="button" onClick={() => listingsQuery.refetch()} className="mt-3 text-sm font-semibold text-primary hover:underline">Try again</button></div>
      ) : listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center"><Building2 className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-4 text-lg font-semibold">No listings match your filters.</h2><p className="mt-2 text-sm text-muted-foreground">Try adjusting your search to see more rooms.</p></div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">Showing {listings.length} matching {listings.length === 1 ? 'listing' : 'listings'}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{listings.map((listing) => <ListingResultCard key={listing.id} listing={listing} />)}</div>
          {listingsQuery.hasNextPage && <div className="mt-8 text-center"><button type="button" disabled={listingsQuery.isFetchingNextPage} onClick={() => listingsQuery.fetchNextPage()} className="h-10 rounded-lg border border-input bg-card px-5 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50">{listingsQuery.isFetchingNextPage ? 'Loading…' : 'Load more listings'}</button></div>}
        </>
      )}
    </section>
  );
}
