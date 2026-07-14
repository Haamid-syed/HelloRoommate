import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2, CheckCircle2, Edit3, MapPin, Plus, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { ApiResponse, Listing } from 'shared';
import { api } from '@/lib/api';

type MyListingsResponse = ApiResponse<{ listings: Listing[] }>;

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function ListingCard({ listing, onFill, isFilling }: { listing: Listing; onFill: (id: string) => void; isFilling: boolean }) {
  const isActive = listing.status === 'ACTIVE';

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex min-h-28 items-stretch">
        <div className="flex w-24 shrink-0 items-center justify-center bg-gradient-to-br from-primary/20 via-primary/10 to-transparent sm:w-32">
          {listing.photos[0] ? (
            <img src={listing.photos[0].url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-8 w-8 text-primary/70" />
          )}
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{listing.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {listing.area}, {listing.city}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isActive ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
              }`}
            >
              {listing.status}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <Wallet className="h-4 w-4 text-primary" />
              {currency.format(listing.rent)}/mo
            </span>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {listing.roomType.replace('_', ' ')}
            </span>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
              {listing.furnishing.replace('_', ' ')}
            </span>
            <span className="text-xs text-muted-foreground">
              Listed {format(new Date(listing.createdAt), 'MMM d, yyyy')}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={`/dashboard/listings/${listing.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium hover:bg-secondary"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit
            </Link>
            {isActive && (
              <button
                type="button"
                disabled={isFilling}
                onClick={() => onFill(listing.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark as filled
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function OwnerListings() {
  const queryClient = useQueryClient();
  const listingsQuery = useQuery({
    queryKey: ['my-listings'],
    queryFn: async (): Promise<Listing[]> => {
      const response = await api.get<MyListingsResponse>('/listings/mine');
      return response.data.data?.listings ?? [];
    },
  });

  const fillMutation = useMutation({
    mutationFn: (listingId: string) => api.post(`/listings/${listingId}/fill`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      toast.success('Listing marked as filled');
    },
    onError: () => toast.error('Could not update this listing. Please try again.'),
  });

  if (listingsQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading your listings…</div>;
  }

  if (listingsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">We couldn’t load your listings.</p>
        <button type="button" onClick={() => listingsQuery.refetch()} className="mt-3 text-sm font-medium text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  }

  const listings = listingsQuery.data ?? [];

  return (
    <section className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Owner dashboard</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Your listings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Keep availability up to date so tenants only see open rooms.</p>
        </div>
        <Link
          to="/dashboard/listings/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">You haven’t listed any rooms yet.</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add your first room and start connecting with compatible tenants.
          </p>
          <Link to="/dashboard/listings/new" className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">
            Create your first listing →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onFill={fillMutation.mutate}
              isFilling={fillMutation.isPending && fillMutation.variables === listing.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
