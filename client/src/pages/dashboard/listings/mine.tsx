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

const SURFACE   = 'oklch(0.135 0.006 240)';
const SURFACE2  = 'oklch(0.175 0.008 240)';
const BORDER    = 'oklch(0.210 0.006 240)';
const INK       = 'oklch(0.930 0 0)';
const MUTED     = 'oklch(0.520 0.010 240)';
const PRIMARY   = 'oklch(0.530 0.115 195)';

function ListingCard({ listing, onFill, isFilling }: { listing: Listing; onFill: (id: string) => void; isFilling: boolean }) {
  const isActive = listing.status === 'ACTIVE';

  return (
    <article
      className="rounded-xl overflow-hidden card-hover"
      style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <div className="flex min-h-28 items-stretch">
        {/* Thumbnail */}
        <div className="w-24 sm:w-32 shrink-0 relative overflow-hidden">
          {listing.photos[0] ? (
            <img src={listing.photos[0].url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: SURFACE2 }}>
              <Building2 className="h-6 w-6" style={{ color: 'oklch(0.530 0.115 195 / 0.3)' }} />
            </div>
          )}
          <div className="absolute top-2 left-2">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
              isActive
                ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/30'
                : 'text-amber-300 bg-amber-500/20 border border-amber-500/30'
            }`}>
              {listing.status}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 p-3.5 sm:p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold truncate" style={{ color: INK }}>{listing.title}</h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: MUTED }}>
              <MapPin className="h-3 w-3 shrink-0" />
              {listing.area}, {listing.city}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-sm" style={{ color: INK }}>
              <Wallet className="h-3.5 w-3.5" style={{ color: PRIMARY }} />
              {currency.format(listing.rent)}/mo
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: SURFACE2, color: MUTED }}>
              {listing.roomType.replace('_', ' ')}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: SURFACE2, color: MUTED }}>
              {listing.furnishing.replace('_', ' ')}
            </span>
            <span className="text-xs ml-auto" style={{ color: MUTED }}>
              {format(new Date(listing.createdAt), 'MMM d, yyyy')}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Link
              to={`/dashboard/listings/${listing.id}/edit`}
              className="btn-ghost inline-flex h-7 items-center gap-1.5 px-2.5 text-xs"
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </Link>
            {isActive && (
              <button
                type="button"
                disabled={isFilling}
                onClick={() => onFill(listing.id)}
                className="inline-flex h-7 items-center gap-1.5 px-2.5 rounded-md text-xs font-medium transition-all duration-150 disabled:opacity-50"
                style={{ backgroundColor: 'oklch(0.680 0.145 148 / 0.1)', color: 'oklch(0.680 0.145 148)', border: '1px solid oklch(0.680 0.145 148 / 0.25)' }}
              >
                <CheckCircle2 className="h-3 w-3" />
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
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32 rounded-xl" style={{ animationDelay: `${i * 0.08}s` }} />)}
      </div>
    );
  }

  if (listingsQuery.isError) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-medium" style={{ color: 'oklch(0.580 0.185 25)' }}>We couldn't load your listings.</p>
        <button type="button" onClick={() => listingsQuery.refetch()} className="mt-3 text-sm font-medium" style={{ color: PRIMARY }}>
          Try again
        </button>
      </div>
    );
  }

  const listings = listingsQuery.data ?? [];

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Your listings</h1>
          <p>Keep availability current so tenants only see open rooms.</p>
        </div>
        <Link to="/dashboard/listings/new" className="btn-primary h-9 px-4 text-sm shrink-0">
          <Plus className="h-4 w-4" />
          New listing
        </Link>
      </div>

      {listings.length === 0 ? (
        <div
          className="rounded-xl px-8 py-14 text-center"
          style={{ backgroundColor: SURFACE, border: `1px dashed ${BORDER}` }}
        >
          <div
            className="mx-auto w-10 h-10 rounded-xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.1)' }}
          >
            <Building2 className="h-5 w-5" style={{ color: PRIMARY }} />
          </div>
          <h2 className="text-heading-sm" style={{ color: INK }}>No listings yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm" style={{ color: MUTED }}>
            Add your first room and start connecting with AI-matched tenants.
          </p>
          <Link to="/dashboard/listings/new" className="mt-4 inline-flex text-sm font-medium transition-colors" style={{ color: PRIMARY }}>
            Create your first listing →
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {listings.map((listing, i) => (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
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
