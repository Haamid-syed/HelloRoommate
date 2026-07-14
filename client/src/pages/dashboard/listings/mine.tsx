import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Building2, CheckCircle2, Edit3, MapPin, Plus, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { ApiResponse, Listing } from 'shared';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';

type MyListingsResponse = ApiResponse<{ listings: Listing[] }>;

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function ListingCard({ listing, onFill, isFilling }: { listing: Listing; onFill: (id: string) => void; isFilling: boolean }) {
  const isActive = listing.status === 'ACTIVE';

  return (
    <article className="card-elevated card-hover rounded-2xl overflow-hidden">
      <div className="flex min-h-32 items-stretch">
        {/* Thumbnail */}
        <div className="w-28 sm:w-36 shrink-0 relative overflow-hidden">
          {listing.photos[0] ? (
            <img src={listing.photos[0].url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(145deg, hsl(var(--surface-2)), hsl(var(--surface)))' }}
            >
              <Building2 className="h-7 w-7" style={{ color: 'hsl(37 78% 60% / 0.35)' }} />
            </div>
          )}
          {/* Status overlay */}
          <div className="absolute top-2 left-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isActive
                ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/30'
                : 'text-amber-300 bg-amber-500/20 border border-amber-500/30'
            }`}>
              {listing.status}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <h2 className="font-serif text-base font-semibold text-foreground truncate">{listing.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {listing.area}, {listing.city}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
              <Wallet className="h-3.5 w-3.5 text-gold" />
              {currency.format(listing.rent)}/mo
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
              style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--muted-foreground))' }}
            >
              {listing.roomType.replace('_', ' ')}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
              style={{ background: 'hsl(var(--surface-2))', color: 'hsl(var(--muted-foreground))' }}
            >
              {listing.furnishing.replace('_', ' ')}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(listing.createdAt), 'MMM d, yyyy')}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/dashboard/listings/${listing.id}/edit`}
              className="btn-ghost inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit
            </Link>
            {isActive && (
              <button
                type="button"
                disabled={isFilling}
                onClick={() => onFill(listing.id)}
                className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                style={{ background: 'hsl(152 45% 48% / 0.15)', color: 'hsl(152 45% 58%)', border: '1px solid hsl(152 45% 48% / 0.3)' }}
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-listings'] }); toast.success('Listing marked as filled'); },
    onError: () => toast.error('Could not update this listing. Please try again.'),
  });

  if (listingsQuery.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36 rounded-2xl" style={{ animationDelay: `${i * 0.08}s` }} />)}
      </div>
    );
  }

  if (listingsQuery.isError) {
    return (
      <div className="rounded-2xl p-8 text-center card-elevated">
        <p className="font-medium text-red-400">We couldn't load your listings.</p>
        <button type="button" onClick={() => listingsQuery.refetch()} className="mt-3 text-sm font-semibold text-gold hover:underline">Try again</button>
      </div>
    );
  }

  const listings = listingsQuery.data ?? [];

  return (
    <section>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="label-overline">Owner Dashboard</p>
          <h1 className="font-serif text-display-md text-foreground mt-2">Your listings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Keep availability current so tenants only see open rooms.</p>
        </div>
        <Link
          to="/dashboard/listings/new"
          className="btn-gold inline-flex h-10 items-center gap-2 px-5 text-sm shrink-0"
        >
          <Plus className="h-4 w-4" />
          Create listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="card-elevated rounded-2xl px-8 py-16 text-center border border-dashed border-border">
          <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'hsl(37 78% 60% / 0.1)' }}
          >
            <Building2 className="h-6 w-6 text-gold" />
          </div>
          <h2 className="font-serif text-lg font-semibold text-foreground">No listings yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add your first room and start connecting with AI-matched tenants.
          </p>
          <Link to="/dashboard/listings/new" className="mt-5 inline-flex text-sm font-semibold text-gold hover:underline underline-offset-4">
            Create your first listing →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {listings.map((listing, i) => (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            >
              <ListingCard
                listing={listing}
                onFill={fillMutation.mutate}
                isFilling={fillMutation.isPending && fillMutation.variables === listing.id}
              />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
