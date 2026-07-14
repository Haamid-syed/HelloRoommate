import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Camera, Loader2, Save, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { ApiResponse, CreateListingInput, Listing, UpdateListingInput } from 'shared';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';

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
  photoUrls: string[];
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
  photoUrls: [],
};

function toDateInput(value: string) {
  return value.slice(0, 10);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function CreateListing() {
  const navigate = useNavigate();
  const { id: listingId } = useParams<{ id: string }>();
  const isEditing = Boolean(listingId);
  const [form, setForm] = useState<ListingFormState>(initialForm);
  const [isUploading, setIsUploading] = useState(false);

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
      title: listing.title, city: listing.city, area: listing.area,
      rent: String(listing.rent), availableFrom: toDateInput(listing.availableFrom),
      roomType: listing.roomType, furnishing: listing.furnishing,
      description: listing.description, photoUrls: listing.photos.map((p) => p.url),
    });
  }, [listingQuery.data]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateListingInput) => api.post('/listings', payload),
    onSuccess: () => { toast.success('Listing created!'); navigate('/dashboard/listings'); },
    onError: () => toast.error('Could not create the listing.'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateListingInput) => api.patch(`/listings/${listingId}`, payload),
    onSuccess: () => { toast.success('Listing updated!'); navigate('/dashboard/listings'); },
    onError: () => toast.error('Could not update the listing.'),
  });

  const updateField = <K extends keyof ListingFormState>(field: K, value: ListingFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files are allowed'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image size must be under 5MB'); return; }

    const formData = new FormData();
    formData.append('photo', file);
    setIsUploading(true);
    const toastId = toast.loading('Uploading…');
    try {
      const response = await api.post<ApiResponse<{ url: string }>>('/listings/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = response.data.data?.url;
      if (!url) throw new Error('URL missing');
      setForm((current) => ({ ...current, photoUrls: [...current.photoUrls, url] }));
      toast.success('Uploaded!', { id: toastId });
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message ?? 'Failed to upload photo', { id: toastId });
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const removePhoto = (indexToRemove: number) => {
    setForm((current) => ({ ...current, photoUrls: current.photoUrls.filter((_, idx) => idx !== indexToRemove) }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: CreateListingInput = {
      title: form.title.trim(), city: form.city.trim(), area: form.area.trim(),
      rent: Number(form.rent), availableFrom: form.availableFrom,
      roomType: form.roomType, furnishing: form.furnishing,
      description: form.description.trim(), photoUrls: form.photoUrls,
    };
    if (isEditing) updateMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  if (isEditing && listingQuery.isLoading) {
    return <div className="space-y-4">{[0,1,2].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>;
  }

  if (isEditing && listingQuery.isError) {
    return (
      <div className="card-elevated rounded-2xl p-8 text-center">
        <p className="font-medium text-red-400">This listing could not be loaded.</p>
        <Link to="/dashboard/listings" className="mt-3 inline-block text-sm font-medium text-gold hover:underline">Back to listings</Link>
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <section>
      <Link to="/dashboard/listings" className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to listings
      </Link>

      <div className="mb-8">
        <p className="label-overline">Owner Dashboard</p>
        <h1 className="font-serif text-display-md text-foreground mt-2">
          {isEditing ? 'Edit listing' : 'Create a listing'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Clear details help the right tenant find this room quickly.</p>
      </div>

      <motion.form
        onSubmit={handleSubmit}
        className="max-w-3xl card-elevated rounded-2xl p-6 sm:p-8 space-y-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <Field label="Listing title">
          <input
            id="title" value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="Bright private room near the metro"
            required minLength={3} maxLength={200}
            className="input-dark w-full h-12 px-4 text-sm"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City">
            <input id="city" value={form.city} onChange={(e) => updateField('city', e.target.value)}
              placeholder="Mumbai" required minLength={2} className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
          <Field label="Area">
            <input id="area" value={form.area} onChange={(e) => updateField('area', e.target.value)}
              placeholder="Andheri West" required minLength={2} className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Monthly rent (₹)">
            <input id="rent" type="number" value={form.rent} onChange={(e) => updateField('rent', e.target.value)}
              placeholder="18000" required min={1} step={1} className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
          <Field label="Available from">
            <input id="availableFrom" type="date" value={form.availableFrom}
              onChange={(e) => updateField('availableFrom', e.target.value)}
              required className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Room type">
            <select id="roomType" value={form.roomType}
              onChange={(e) => updateField('roomType', e.target.value as CreateListingInput['roomType'])}
              className="input-dark w-full h-12 px-4 text-sm"
            >
              {roomTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Furnishing">
            <select id="furnishing" value={form.furnishing}
              onChange={(e) => updateField('furnishing', e.target.value as CreateListingInput['furnishing'])}
              className="input-dark w-full h-12 px-4 text-sm"
            >
              {furnishingTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Description (optional)">
          <textarea id="description" value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Share what makes this room and home a great fit."
            maxLength={2000} rows={4}
            className="input-dark w-full px-4 py-3 text-sm resize-y"
          />
        </Field>

        {/* Photo upload zone */}
        <div className="rounded-xl border border-dashed border-border p-5 space-y-4"
          style={{ background: 'hsl(var(--surface-2) / 0.5)' }}
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">Room Photos</h3>
            <p className="text-xs text-muted-foreground mt-0.5">PNG, JPG, WEBP · Max 5MB each</p>
          </div>

          {form.photoUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {form.photoUrls.map((url, index) => (
                <div key={url} className="group relative aspect-[4/3] overflow-hidden rounded-xl">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                    style={{ background: 'hsl(0 65% 60%)', color: 'white' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200"
            style={{ background: 'hsl(37 78% 60% / 0.1)', color: 'hsl(37 78% 65%)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'hsl(37 78% 60% / 0.2)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'hsl(37 78% 60% / 0.1)')}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {isUploading ? 'Uploading…' : 'Add a photo'}
            <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isUploading} className="sr-only" />
          </label>
          <span className="text-xs text-muted-foreground">{form.photoUrls.length} photo{form.photoUrls.length !== 1 ? 's' : ''} added</span>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Link to="/dashboard/listings"
            className="inline-flex h-11 items-center justify-center px-5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-surface-2"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving || isUploading}
            className="btn-gold inline-flex h-11 items-center justify-center gap-2 px-6 text-sm disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create listing'}
          </button>
        </div>
      </motion.form>
    </section>
  );
}
