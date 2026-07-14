import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Save, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { ApiResponse, TenantProfile, UpsertTenantProfileInput } from 'shared';
import { api } from '@/lib/api';
import { motion } from 'framer-motion';

type ProfileFormState = {
  preferredCity: string;
  preferredAreas: string;
  budgetMin: string;
  budgetMax: string;
  moveInDate: string;
};

const initialForm: ProfileFormState = {
  preferredCity: '', preferredAreas: '', budgetMin: '', budgetMax: '',
  moveInDate: new Date().toISOString().slice(0, 10),
};

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function StatCard({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 p-4 rounded-xl" style={{ background: 'hsl(var(--surface-2))' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'hsl(37 78% 60% / 0.1)' }}
      >
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2 tracking-wide uppercase">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
    onError: () => toast.error('Could not save your profile. Please check the details.'),
  });

  const updateField = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const preferredAreas = form.preferredAreas.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
    const budgetMin = Number(form.budgetMin);
    const budgetMax = Number(form.budgetMax);
    if (preferredAreas.length === 0) { toast.error('Add at least one preferred area.'); return; }
    if (budgetMin > budgetMax) { toast.error('Minimum budget cannot exceed maximum.'); return; }
    upsertMutation.mutate({ preferredCity: form.preferredCity.trim(), preferredAreas, budgetMin, budgetMax, moveInDate: form.moveInDate, preferences: {} });
  };

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-20 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />)}
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="card-elevated rounded-2xl p-8 text-center">
        <p className="font-medium text-red-400">We couldn't load your profile. Please refresh.</p>
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <section>
      <div className="mb-8">
        <p className="label-overline">Tenant Dashboard</p>
        <h1 className="font-serif text-display-md text-foreground mt-2">Your search profile</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          These preferences power your AI compatibility scores.
        </p>
      </div>

      {profile ? (
        <motion.div
          className="mb-8 grid gap-3 sm:grid-cols-3 card-elevated rounded-2xl p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <StatCard icon={MapPin} label="Preferred location">
            <p className="font-semibold text-sm text-foreground">{profile.preferredCity}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.preferredAreas.map((area) => (
                <span key={area} className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'hsl(37 78% 60% / 0.12)', color: 'hsl(37 78% 65%)' }}
                >
                  {area}
                </span>
              ))}
            </div>
          </StatCard>
          <StatCard icon={Wallet} label="Monthly budget">
            <p className="font-semibold text-sm text-foreground">{currency.format(profile.budgetMin)} – {currency.format(profile.budgetMax)}</p>
          </StatCard>
          <StatCard icon={CalendarDays} label="Move-in date">
            <p className="font-semibold text-sm text-foreground">{format(new Date(profile.moveInDate), 'MMMM d, yyyy')}</p>
          </StatCard>
        </motion.div>
      ) : (
        <motion.div
          className="mb-8 rounded-2xl p-5 border"
          style={{ background: 'hsl(37 78% 60% / 0.06)', borderColor: 'hsl(37 78% 60% / 0.2)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="font-semibold text-foreground">Set up your profile to start finding rooms</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tell us where and when you want to move, plus your budget range.</p>
        </motion.div>
      )}

      <motion.form
        onSubmit={handleSubmit}
        className="max-w-3xl card-elevated rounded-2xl p-6 sm:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="font-serif text-lg font-semibold text-foreground">
          {profile ? 'Update preferences' : 'Search preferences'}
        </h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Preferred city">
            <input id="preferredCity" value={form.preferredCity} onChange={(e) => updateField('preferredCity', e.target.value)}
              placeholder="Mumbai" required minLength={2} className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
          <Field label="Preferred areas" hint="Separate areas with commas">
            <input id="preferredAreas" value={form.preferredAreas} onChange={(e) => updateField('preferredAreas', e.target.value)}
              placeholder="Andheri West, Bandra, Juhu" required className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
          <Field label="Minimum budget (₹)">
            <input id="budgetMin" type="number" value={form.budgetMin} onChange={(e) => updateField('budgetMin', e.target.value)}
              required min={1} step={1} placeholder="15000" className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
          <Field label="Maximum budget (₹)">
            <input id="budgetMax" type="number" value={form.budgetMax} onChange={(e) => updateField('budgetMax', e.target.value)}
              required min={1} step={1} placeholder="22000" className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
          <Field label="Move-in date">
            <input id="moveInDate" type="date" value={form.moveInDate} onChange={(e) => updateField('moveInDate', e.target.value)}
              required className="input-dark w-full h-12 px-4 text-sm" />
          </Field>
        </div>

        <div className="mt-8 flex justify-end border-t border-border pt-6">
          <button
            type="submit"
            disabled={upsertMutation.isPending}
            className="btn-gold h-11 px-6 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {upsertMutation.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </motion.form>
    </section>
  );
}
