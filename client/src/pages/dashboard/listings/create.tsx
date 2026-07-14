import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Home, Save } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { ApiResponse, CreateListingInput, Listing, UpdateListingInput } from 'shared';
import { api } from '@/lib/api';

const roomTypes = [
  ['PRIVATE', 'Private Room'],
  ['SHARED', 'Shared Room'],
  ['STUDIO', 'Studio'],
  ['ONE_BHK', '1 BHK'],
  ['TWO_BHK', '2 BHK'],
] as const;

const furnishingTypes = [
  ['UNFURNISHED', 'Unfurnished'],
  ['SEMI_FURNISHED', 'Semi-Furnished'],
  ['FURNISHED', 'Furnished'],
] as const;

type ListingFormState = {
  title: string;
  city: string;
  area: string;
  rent: string;
  availableFrom: string;
  roomType: CreateListingInput['roomType'];
  furnishing: CreateListingInput['furnishing'];
  description: string;
};

const initialForm: ListingFormState = {
  title: '',
  city: '',
  area: '',
  rent: '',
  availableFrom: new Date().toISOString().slice(0, 10),
  roomType: 'PRIVATE',
  furnishing: 'SEMI_FURNISHED',
  description: '',
};

function toDateInput(value: string) {
  return value.slice(0, 10);
}

export default function CreateListing() {
  const navigate = useNavigate();
  const { id: listingId } = useParams<{ id: string }>();
  const isEditing = Boolean(listingId);
  const [form, setForm] = useState<ListingFormState>(initialForm);

  const listingQuery = useQuery({
    queryKey: ['listing', listingId],
    enabled: isEditing,
    queryFn: async (): Promise<Listing> => {
      if (!listingId) throw new Error('Listing ID is missing');
      const response = await api.get<ApiResponse<{ listing: Listing }>>(`/listings/${listingId}`);
      const listing = response.data.data?.listing;
      if (!listing) throw new Error('Listing was not found');
      return listing;
    },
  });

  useEffect(() => {
    const listing = listingQuery.data;
    if (!listing) return;

    setForm({
      title: listing.title,
      city: listing.city,
      area: listing.area,
      rent: String(listing.rent),
      availableFrom: toDateInput(listing.availableFrom),
      roomType: listing.roomType,
      furnishing: listing.furnishing,
      description: listing.description,
    });
  }, [listingQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateListingInput) => api.post('/listings', payload),
    onSuccess: () => {
      toast.success('Listing created!');
      navigate('/dashboard/listings');
    },
    onError: () => toast.error('Could not create the listing. Check the details and try again.'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateListingInput) => api.patch(`/listings/${listingId}`, payload),
    onSuccess: () => {
      toast.success('Listing updated!');
      navigate('/dashboard/listings');
    },
    onError: () => toast.error('Could not update the listing. Please try again.'),
  });

  const updateField = <K extends keyof ListingFormState>(field: K, value: ListingFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: CreateListingInput = {
      title: form.title.trim(),
      city: form.city.trim(),
      area: form.area.trim(),
      rent: Number(form.rent),
      availableFrom: form.availableFrom,
      roomType: form.roomType,
      furnishing: form.furnishing,
      description: form.description.trim(),
      photoUrls: [],
    };

    if (isEditing) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  if (isEditing && listingQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading listing…</div>;
  }

  if (isEditing && listingQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">This listing could not be loaded.</p>
        <Link to="/dashboard/listings" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          Back to listings
        </Link>
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="animate-fade-in">
      <Link to="/dashboard/listings" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to listings
      </Link>

      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Owner dashboard</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{isEditing ? 'Edit listing' : 'Create a listing'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Clear details help the right tenant find this room quickly.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-8">
        <div className="space-y-6">
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium">Listing title</label>
            <input
              id="title"
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="Bright private room near the metro"
              required
              minLength={3}
              maxLength={200}
              className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="mb-2 block text-sm font-medium">City</label>
              <input id="city" value={form.city} onChange={(event) => updateField('city', event.target.value)} placeholder="Mumbai" required minLength={2} className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label htmlFor="area" className="mb-2 block text-sm font-medium">Area</label>
              <input id="area" value={form.area} onChange={(event) => updateField('area', event.target.value)} placeholder="Andheri West" required minLength={2} className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="rent" className="mb-2 block text-sm font-medium">Monthly rent (₹)</label>
              <input id="rent" type="number" value={form.rent} onChange={(event) => updateField('rent', event.target.value)} placeholder="18000" required min={1} step={1} className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label htmlFor="availableFrom" className="mb-2 block text-sm font-medium">Available from</label>
              <input id="availableFrom" type="date" value={form.availableFrom} onChange={(event) => updateField('availableFrom', event.target.value)} required className="h-11 w-full rounded-lg border border-input bg-background px-4 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="roomType" className="mb-2 block text-sm font-medium">Room type</label>
              <select id="roomType" value={form.roomType} onChange={(event) => updateField('roomType', event.target.value as CreateListingInput['roomType'])} className="h-11 w-full rounded-lg border border-input bg-background px-4 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
                {roomTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="furnishing" className="mb-2 block text-sm font-medium">Furnishing</label>
              <select id="furnishing" value={form.furnishing} onChange={(event) => updateField('furnishing', event.target.value as CreateListingInput['furnishing'])} className="h-11 w-full rounded-lg border border-input bg-background px-4 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
                {furnishingTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="description" className="mb-2 block text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="description" value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Share what makes this room and the home a great fit." maxLength={2000} rows={5} className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            <Home className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p><span className="font-medium text-foreground">Photos are coming soon.</span> You’ll be able to add room photos here when Cloudinary uploads are connected.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Link to="/dashboard/listings" className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Cancel</Link>
          <button type="submit" disabled={isSaving} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create listing'}
          </button>
        </div>
      </form>
    </section>
  );
}
