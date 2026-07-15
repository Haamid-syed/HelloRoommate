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
  title: '', city: '', area: '', rent: '',
  availableFrom: new Date().toISOString().slice(0, 10),
  roomType: 'PRIVATE', furnishing: 'SEMI_FURNISHED', description: '', photoUrls: [],
};

function toDateInput(value: string) { return value.slice(0, 10); }

const SURFACE  = 'oklch(0.135 0.006 240)';
const SURFACE2 = 'oklch(0.175 0.008 240)';
const BORDER   = 'oklch(0.210 0.006 240)';
const INK      = 'oklch(0.930 0 0)';
const MUTED    = 'oklch(0.520 0.010 240)';
const PRIMARY  = 'oklch(0.530 0.115 195)';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: MUTED }}>{label}</label>
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err.response?.data?.error?.message ?? 'Failed to upload photo', { id: toastId });
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
    return <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>;
  }

  if (isEditing && listingQuery.isError) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-medium" style={{ color: 'oklch(0.580 0.185 25)' }}>This listing could not be loaded.</p>
        <Link to="/dashboard/listings" className="mt-3 inline-block text-sm font-medium" style={{ color: PRIMARY }}>
          Back to listings
        </Link>
      </div>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <section>
      <Link
        to="/dashboard/listings"
        className="mb-5 inline-flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: MUTED }}
        onMouseEnter={e => (e.currentTarget.style.color = INK)}
        onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to listings
      </Link>

      <div className="page-header">
        <h1>{isEditing ? 'Edit listing' : 'Create a listing'}</h1>
        <p>Clear details help the right tenant find this room quickly.</p>
      </div>

      <motion.form
        onSubmit={handleSubmit}
        className="max-w-2xl rounded-xl p-5 sm:p-6 space-y-5"
        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <Field label="Listing title">
          <input
            id="title"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="Bright private room near the metro"
            required
            minLength={3}
            maxLength={200}
            className="input-field h-10 px-3"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City">
            <input id="city" value={form.city} onChange={(e) => updateField('city', e.target.value)}
              placeholder="Mumbai" required minLength={2} className="input-field h-10 px-3" />
          </Field>
          <Field label="Area">
            <input id="area" value={form.area} onChange={(e) => updateField('area', e.target.value)}
              placeholder="Andheri West" required minLength={2} className="input-field h-10 px-3" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly rent (₹)">
            <input id="rent" type="number" value={form.rent} onChange={(e) => updateField('rent', e.target.value)}
              placeholder="18000" required min={1} step={1} className="input-field h-10 px-3" />
          </Field>
          <Field label="Available from">
            <input id="availableFrom" type="date" value={form.availableFrom}
              onChange={(e) => updateField('availableFrom', e.target.value)}
              required className="input-field h-10 px-3" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room type">
            <select id="roomType" value={form.roomType}
              onChange={(e) => updateField('roomType', e.target.value as CreateListingInput['roomType'])}
              className="input-field h-10 px-3"
            >
              {roomTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Furnishing">
            <select id="furnishing" value={form.furnishing}
              onChange={(e) => updateField('furnishing', e.target.value as CreateListingInput['furnishing'])}
              className="input-field h-10 px-3"
            >
              {furnishingTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Description (optional)">
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Share what makes this room and home a great fit."
            maxLength={2000}
            rows={4}
            className="input-field px-3 py-2.5 resize-y"
          />
        </Field>

        {/* Photo upload zone */}
        <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: SURFACE2, border: `1px dashed ${BORDER}` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: INK }}>Room Photos</p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>PNG, JPG, WEBP · Max 5MB each</p>
          </div>

          {form.photoUrls.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {form.photoUrls.map((url, index) => (
                <div key={url} className="group relative aspect-[4/3] overflow-hidden rounded-lg">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: 'oklch(0.090 0 0 / 0.5)' }} />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
                    style={{ backgroundColor: 'oklch(0.580 0.185 25)', color: 'white' }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150"
              style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.1)', color: PRIMARY }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.530 0.115 195 / 0.18)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.530 0.115 195 / 0.1)')}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {isUploading ? 'Uploading…' : 'Add photo'}
              <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isUploading} className="sr-only" />
            </label>
            <span className="text-xs" style={{ color: MUTED }}>{form.photoUrls.length} photo{form.photoUrls.length !== 1 ? 's' : ''} added</span>
          </div>
        </div>

        <div
          className="flex flex-col-reverse gap-2.5 pt-5 sm:flex-row sm:justify-end"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <Link
            to="/dashboard/listings"
            className="inline-flex h-9 items-center justify-center px-4 text-sm font-medium rounded-lg transition-colors"
            style={{ color: MUTED }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = INK; (e.currentTarget as HTMLElement).style.backgroundColor = SURFACE2; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSaving || isUploading}
            className="btn-primary h-9 px-5 text-sm disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'oklch(0.930 0 0 / 0.3)', borderTopColor: 'oklch(0.930 0 0)' }} />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create listing'}
          </button>
        </div>
      </motion.form>
    </section>
  );
}
