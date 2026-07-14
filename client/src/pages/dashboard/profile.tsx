import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Save, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { ApiResponse, TenantProfile, UpsertTenantProfileInput } from 'shared';
import { api } from '@/lib/api';

type ProfileFormState = {
  preferredCity: string;
  preferredAreas: string;
  budgetMin: string;
  budgetMax: string;
  moveInDate: string;
};

const initialForm: ProfileFormState = {
  preferredCity: '',
  preferredAreas: '',
  budgetMin: '',
  budgetMax: '',
  moveInDate: new Date().toISOString().slice(0, 10),
};

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export default function TenantProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProfileFormState>(initialForm);
  const profileQuery = useQuery({
    queryKey: ['tenant-profile'],
    queryFn: async (): Promise<TenantProfile | null> => {
      const response = await api.get<ApiResponse<{ profile: TenantProfile | null }>>('/tenants/me/profile');
      return response.data.data?.profile ?? null;
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;

    setForm({
      preferredCity: profile.preferredCity,
      preferredAreas: profile.preferredAreas.join(', '),
      budgetMin: String(profile.budgetMin),
      budgetMax: String(profile.budgetMax),
      moveInDate: profile.moveInDate.slice(0, 10),
    });
  }, [profileQuery.data]);

  const upsertMutation = useMutation({
    mutationFn: (payload: UpsertTenantProfileInput) => api.put('/tenants/me/profile', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-profile'] });
      toast.success('Profile saved!');
    },
    onError: () => toast.error('Could not save your profile. Please check the details and try again.'),
  });

  const updateField = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const preferredAreas = form.preferredAreas.split(',').map((area) => area.trim()).filter((area) => area.length > 0);
    const budgetMin = Number(form.budgetMin);
    const budgetMax = Number(form.budgetMax);

    if (preferredAreas.length === 0) {
      toast.error('Add at least one preferred area.');
      return;
    }

    if (budgetMin > budgetMax) {
      toast.error('Minimum budget cannot exceed maximum budget.');
      return;
    }

    upsertMutation.mutate({
      preferredCity: form.preferredCity.trim(),
      preferredAreas,
      budgetMin,
      budgetMax,
      moveInDate: form.moveInDate,
      preferences: {},
    });
  };

  if (profileQuery.isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading your profile…</div>;
  }

  if (profileQuery.isError) {
    return <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive">We couldn’t load your profile. Please refresh and try again.</div>;
  }

  const profile = profileQuery.data;

  return (
    <section className="animate-fade-in">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Tenant dashboard</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Your room search profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">These preferences help surface listings that fit your move.</p>
      </div>

      {profile ? (
        <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-3">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 text-primary" />
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preferred city</p><p className="mt-1 font-semibold">{profile.preferredCity}</p><div className="mt-2 flex flex-wrap gap-1.5">{profile.preferredAreas.map((area) => <span key={area} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{area}</span>)}</div></div>
          </div>
          <div className="flex gap-3">
            <Wallet className="mt-0.5 h-5 w-5 text-primary" />
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly budget</p><p className="mt-1 font-semibold">{currency.format(profile.budgetMin)} – {currency.format(profile.budgetMax)}</p></div>
          </div>
          <div className="flex gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 text-primary" />
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Move-in date</p><p className="mt-1 font-semibold">{format(new Date(profile.moveInDate), 'MMMM d, yyyy')}</p></div>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="font-semibold">Set up your profile to start finding rooms.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tell us where and when you want to move, plus your budget.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-8">
        <h2 className="text-lg font-semibold">{profile ? 'Update preferences' : 'Search preferences'}</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="preferredCity" className="mb-2 block text-sm font-medium">Preferred city</label>
            <input id="preferredCity" value={form.preferredCity} onChange={(event) => updateField('preferredCity', event.target.value)} placeholder="Mumbai" required minLength={2} className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label htmlFor="preferredAreas" className="mb-2 block text-sm font-medium">Preferred areas</label>
            <input id="preferredAreas" value={form.preferredAreas} onChange={(event) => updateField('preferredAreas', event.target.value)} placeholder="Andheri West, Bandra, Juhu" required className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <p className="mt-1.5 text-xs text-muted-foreground">Separate areas with commas.</p>
          </div>
          <div>
            <label htmlFor="budgetMin" className="mb-2 block text-sm font-medium">Minimum budget (₹)</label>
            <input id="budgetMin" type="number" value={form.budgetMin} onChange={(event) => updateField('budgetMin', event.target.value)} required min={1} step={1} placeholder="15000" className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label htmlFor="budgetMax" className="mb-2 block text-sm font-medium">Maximum budget (₹)</label>
            <input id="budgetMax" type="number" value={form.budgetMax} onChange={(event) => updateField('budgetMax', event.target.value)} required min={1} step={1} placeholder="22000" className="h-11 w-full rounded-lg border border-input bg-background px-4 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label htmlFor="moveInDate" className="mb-2 block text-sm font-medium">Move-in date</label>
            <input id="moveInDate" type="date" value={form.moveInDate} onChange={(event) => updateField('moveInDate', event.target.value)} required className="h-11 w-full rounded-lg border border-input bg-background px-4 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        <div className="mt-8 flex justify-end border-t border-border pt-6">
          <button type="submit" disabled={upsertMutation.isPending} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            <Save className="h-4 w-4" />
            {upsertMutation.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </section>
  );
}
