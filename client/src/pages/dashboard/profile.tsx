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

const SURFACE   = 'oklch(0.135 0.006 240)';
const SURFACE2  = 'oklch(0.175 0.008 240)';
const BORDER    = 'oklch(0.210 0.006 240)';
const INK       = 'oklch(0.930 0 0)';
const MUTED     = 'oklch(0.520 0.010 240)';
const PRIMARY   = 'oklch(0.530 0.115 195)';

function StatCard({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg" style={{ backgroundColor: SURFACE2, border: `1px solid ${BORDER}` }}>
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.12)' }}
      >
        <Icon className="h-4 w-4" style={{ color: PRIMARY }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium" style={{ color: MUTED }}>{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: MUTED }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs" style={{ color: MUTED }}>{hint}</p>}
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
      <div className="space-y-3">
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-16 rounded-lg" style={{ animationDelay: `${i * 0.1}s` }} />)}
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="p-6 text-center rounded-lg" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
        <p className="text-sm font-medium" style={{ color: 'oklch(0.580 0.185 25)' }}>We couldn't load your profile. Please refresh.</p>
      </div>
    );
  }

  const profile = profileQuery.data;

  return (
    <section>
      <div className="page-header">
        <h1>Your search profile</h1>
        <p>These preferences power your AI compatibility scores.</p>
      </div>

      {profile ? (
        <motion.div
          className="mb-6 grid gap-3 sm:grid-cols-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <StatCard icon={MapPin} label="Preferred location">
            <p className="text-sm font-semibold" style={{ color: INK }}>{profile.preferredCity}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.preferredAreas.map((area) => (
                <span
                  key={area}
                  className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.12)', color: PRIMARY }}
                >
                  {area}
                </span>
              ))}
            </div>
          </StatCard>
          <StatCard icon={Wallet} label="Monthly budget">
            <p className="text-sm font-semibold" style={{ color: INK }}>
              {currency.format(profile.budgetMin)} – {currency.format(profile.budgetMax)}
            </p>
          </StatCard>
          <StatCard icon={CalendarDays} label="Move-in date">
            <p className="text-sm font-semibold" style={{ color: INK }}>
              {format(new Date(profile.moveInDate), 'MMMM d, yyyy')}
            </p>
          </StatCard>
        </motion.div>
      ) : (
        <motion.div
          className="mb-6 rounded-lg p-4"
          style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.08)', border: '1px solid oklch(0.530 0.115 195 / 0.2)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-sm font-semibold" style={{ color: INK }}>Set up your profile to start finding rooms</p>
          <p className="mt-0.5 text-sm" style={{ color: MUTED }}>Tell us where and when you want to move, plus your budget range.</p>
        </motion.div>
      )}

      <motion.form
        onSubmit={handleSubmit}
        className="max-w-2xl rounded-xl p-5 sm:p-6"
        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
      >
        <h2 className="text-heading-sm mb-5" style={{ color: INK }}>
          {profile ? 'Update preferences' : 'Search preferences'}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred city">
            <input
              id="preferredCity"
              value={form.preferredCity}
              onChange={(e) => updateField('preferredCity', e.target.value)}
              placeholder="Mumbai"
              required
              minLength={2}
              className="input-field h-10 px-3"
            />
          </Field>
          <Field label="Preferred areas" hint="Separate areas with commas">
            <input
              id="preferredAreas"
              value={form.preferredAreas}
              onChange={(e) => updateField('preferredAreas', e.target.value)}
              placeholder="Andheri West, Bandra, Juhu"
              required
              className="input-field h-10 px-3"
            />
          </Field>
          <Field label="Minimum budget (₹)">
            <input
              id="budgetMin"
              type="number"
              value={form.budgetMin}
              onChange={(e) => updateField('budgetMin', e.target.value)}
              required
              min={1}
              step={1}
              placeholder="15000"
              className="input-field h-10 px-3"
            />
          </Field>
          <Field label="Maximum budget (₹)">
            <input
              id="budgetMax"
              type="number"
              value={form.budgetMax}
              onChange={(e) => updateField('budgetMax', e.target.value)}
              required
              min={1}
              step={1}
              placeholder="22000"
              className="input-field h-10 px-3"
            />
          </Field>
          <Field label="Move-in date">
            <input
              id="moveInDate"
              type="date"
              value={form.moveInDate}
              onChange={(e) => updateField('moveInDate', e.target.value)}
              required
              className="input-field h-10 px-3"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '1.25rem' }}>
          <button
            type="submit"
            disabled={upsertMutation.isPending}
            className="btn-primary h-9 px-5 text-sm"
          >
            {upsertMutation.isPending ? (
              <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'oklch(0.930 0 0 / 0.3)', borderTopColor: 'oklch(0.930 0 0)' }} />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {upsertMutation.isPending ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </motion.form>
    </section>
  );
}
