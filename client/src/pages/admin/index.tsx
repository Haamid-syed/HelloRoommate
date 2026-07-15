import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity, AlertTriangle, BarChart3, Bell, Building2, ShieldAlert, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { ApiResponse, AuditLog, Listing, NotificationOutbox, PlatformMetrics, User } from 'shared';
import { motion } from 'framer-motion';

type TabType = 'metrics' | 'users' | 'listings' | 'activity' | 'outbox';
type ActivityLogRow = AuditLog & { actor: Pick<User, 'name' | 'email'> };

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const tabs: Array<{ id: TabType; label: string; icon: typeof BarChart3 }> = [
  { id: 'metrics',  label: 'Metrics',     icon: BarChart3 },
  { id: 'users',    label: 'Users',        icon: Users },
  { id: 'listings', label: 'Moderation',   icon: Building2 },
  { id: 'activity', label: 'Activity',     icon: Activity },
  { id: 'outbox',   label: 'Email Outbox', icon: Bell },
];

const SURFACE   = 'oklch(0.135 0.006 240)';
const SURFACE2  = 'oklch(0.175 0.008 240)';
const BORDER    = 'oklch(0.210 0.006 240)';
const INK       = 'oklch(0.930 0 0)';
const MUTED     = 'oklch(0.520 0.010 240)';
const PRIMARY   = 'oklch(0.530 0.115 195)';

function LoadingSkeleton() {
  return (
    <div className="space-y-3 pt-4">
      {[0, 1, 2].map(i => <div key={i} className="skeleton h-14 rounded-lg" style={{ animationDelay: `${i * 0.1}s` }} />)}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm font-medium" style={{ color: 'oklch(0.580 0.185 25)' }}>{message}</p>;
}

function StatusBadge({ status }: { status: Listing['status'] | NotificationOutbox['status'] }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  if (status === 'FAILED' || status === 'REMOVED') return <span className="badge-error">{label}</span>;
  if (status === 'PENDING' || status === 'FILLED')  return <span className="badge-warning">{label}</span>;
  return <span className="badge-success">{label}</span>;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('metrics');
  const metricsQuery = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async (): Promise<PlatformMetrics> => {
      const response = await api.get<ApiResponse<{ metrics: PlatformMetrics }>>('/admin/metrics');
      return response.data.data!.metrics;
    },
  });

  return (
    <section>
      <div className="page-header">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-4 w-4" style={{ color: PRIMARY }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Admin workspace</span>
        </div>
        <h1>Platform control</h1>
        <p>Metrics, moderation, and operations dashboard.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Sidebar tabs */}
        <aside className="w-full md:w-48 shrink-0">
          <div className="rounded-xl p-2" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
            <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>Navigation</p>
            <div className="space-y-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150"
                    style={isActive
                      ? { backgroundColor: 'oklch(0.530 0.115 195 / 0.12)', color: PRIMARY }
                      : { color: MUTED }
                    }
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = SURFACE2; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 rounded-xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === 'metrics'  && <MetricsView query={metricsQuery} />}
            {activeTab === 'users'    && <UsersView />}
            {activeTab === 'listings' && <ListingsView />}
            {activeTab === 'activity' && <ActivityView />}
            {activeTab === 'outbox'   && <OutboxView />}
          </motion.div>
        </main>
      </div>
    </section>
  );
}

function MetricsView({ query }: { query: UseQueryResult<PlatformMetrics, Error> }) {
  if (query.isLoading) return <LoadingSkeleton />;
  if (query.isError || !query.data) return <ErrorState message="Failed to load platform metrics." />;

  const metrics = query.data;
  const cards = [
    { label: 'Total Users',          value: metrics.totalUsers,    detail: `${metrics.totalOwners} owners · ${metrics.totalTenants} tenants`, icon: Users,         color: PRIMARY },
    { label: 'Listings',             value: metrics.totalListings, detail: `${metrics.activeListings} currently active`,                      icon: Building2,     color: 'oklch(0.680 0.145 148)' },
    { label: 'Notification Issues',  value: metrics.failedNotifications + metrics.pendingNotifications, detail: `${metrics.failedNotifications} dispatch failures`, icon: AlertTriangle, color: 'oklch(0.580 0.185 25)' },
  ];

  return (
    <div>
      <h2 className="text-heading-md mb-1" style={{ color: INK }}>Platform Overview</h2>
      <p className="text-xs" style={{ color: MUTED }}>Live aggregates from platform data</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              className="rounded-xl p-4"
              style={{ backgroundColor: SURFACE2, border: `1px solid ${BORDER}` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.07 }}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center mb-3"
                style={{ backgroundColor: `${card.color.replace(')', ' / 0.12)')}` }}
              >
                <Icon className="h-4 w-4" style={{ color: card.color }} />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{card.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight" style={{ color: INK }}>{card.value}</p>
              <p className="mt-1 text-[11px]" style={{ color: MUTED }}>{card.detail}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function UsersView() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<User[]> => {
      const response = await api.get<ApiResponse<{ users: User[] }>>('/admin/users');
      return response.data.data!.users;
    },
  });
  const toggleUserMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/admin/${id}/status`, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] });
      toast.success('User status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (usersQuery.isLoading) return <LoadingSkeleton />;
  if (usersQuery.isError) return <ErrorState message="Failed to load user accounts." />;
  const users = usersQuery.data ?? [];

  return (
    <div>
      <h2 className="text-heading-md mb-0.5" style={{ color: INK }}>User Moderation</h2>
      <p className="text-xs mb-5" style={{ color: MUTED }}>Suspend or restore user access</p>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[680px]">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Status</th><th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="font-semibold" style={{ color: INK }}>{user.name}</td>
                <td className="text-xs" style={{ color: MUTED }}>{user.email}</td>
                <td>
                  <span className="badge-primary text-[11px]">{user.role}</span>
                </td>
                <td className="text-xs" style={{ color: MUTED }}>{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
                <td>
                  <span className={`text-xs font-bold ${user.isActive ? '' : ''}`} style={{ color: user.isActive ? 'oklch(0.680 0.145 148)' : 'oklch(0.580 0.185 25)' }}>
                    ● {user.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => toggleUserMutation.mutate({ id: user.id, isActive: !user.isActive })}
                    disabled={toggleUserMutation.isPending}
                    className="inline-flex h-7 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-all duration-150 disabled:opacity-60"
                    style={user.isActive
                      ? { borderColor: 'oklch(0.580 0.185 25 / 0.3)', color: 'oklch(0.580 0.185 25)' }
                      : { borderColor: 'oklch(0.680 0.145 148 / 0.3)', color: 'oklch(0.680 0.145 148)' }
                    }
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = user.isActive ? 'oklch(0.580 0.185 25 / 0.08)' : 'oklch(0.680 0.145 148 / 0.08)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                  >
                    {user.isActive ? 'Suspend' : 'Restore'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="py-8 text-center text-sm" style={{ color: MUTED }}>No user accounts found.</p>}
      </div>
    </div>
  );
}

function ListingsView() {
  const queryClient = useQueryClient();
  const listingsQuery = useQuery({
    queryKey: ['admin-listings'],
    queryFn: async (): Promise<Listing[]> => {
      const response = await api.get<ApiResponse<{ listings: Listing[] }>>('/admin/listings');
      return response.data.data!.listings;
    },
  });
  const moderateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/listings/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] });
      toast.success('Listing removed');
    },
    onError: () => toast.error('Failed to moderate listing'),
  });

  if (listingsQuery.isLoading) return <LoadingSkeleton />;
  if (listingsQuery.isError) return <ErrorState message="Failed to load listings." />;
  const listings = listingsQuery.data ?? [];

  return (
    <div>
      <h2 className="text-heading-md mb-0.5" style={{ color: INK }}>Listing Moderation</h2>
      <p className="text-xs mb-5" style={{ color: MUTED }}>Remove listings that violate platform rules</p>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[700px]">
          <thead>
            <tr>
              <th>Title</th><th>Owner</th><th>Location</th><th>Rent</th><th>Status</th><th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr key={listing.id}>
                <td className="font-semibold" style={{ color: INK }}>{listing.title}</td>
                <td className="text-xs" style={{ color: MUTED }}>{listing.owner?.name ?? '—'}</td>
                <td className="text-xs" style={{ color: MUTED }}>{listing.area}, {listing.city}</td>
                <td className="font-medium" style={{ color: INK }}>{currency.format(listing.rent)}/mo</td>
                <td><StatusBadge status={listing.status} /></td>
                <td className="text-right">
                  {listing.status !== 'REMOVED' && (
                    <button
                      type="button"
                      onClick={() => moderateMutation.mutate(listing.id)}
                      disabled={moderateMutation.isPending}
                      className="inline-flex h-7 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-all duration-150 hover:bg-red-500/10 disabled:opacity-60"
                      style={{ borderColor: 'oklch(0.580 0.185 25 / 0.3)', color: 'oklch(0.580 0.185 25)' }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listings.length === 0 && <p className="py-8 text-center text-sm" style={{ color: MUTED }}>No listings found.</p>}
      </div>
    </div>
  );
}

function ActivityView() {
  const activityQuery = useQuery({
    queryKey: ['admin-activity'],
    queryFn: async (): Promise<ActivityLogRow[]> => {
      const response = await api.get<ApiResponse<{ logs: ActivityLogRow[] }>>('/admin/activity');
      return response.data.data!.logs;
    },
  });

  if (activityQuery.isLoading) return <LoadingSkeleton />;
  if (activityQuery.isError) return <ErrorState message="Failed to load activity logs." />;
  const logs = activityQuery.data ?? [];

  return (
    <div>
      <h2 className="text-heading-md mb-0.5" style={{ color: INK }}>Activity Log</h2>
      <p className="text-xs mb-5" style={{ color: MUTED }}>Historical records of platform audit events</p>
      <div className="space-y-2.5">
        {logs.length === 0 ? (
          <p className="p-4 text-center text-sm" style={{ color: MUTED }}>No events recorded.</p>
        ) : logs.map((log) => (
          <article
            key={log.id}
            className="rounded-lg p-3.5 text-sm transition-colors"
            style={{ backgroundColor: SURFACE2, border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.1)', color: PRIMARY, border: '1px solid oklch(0.530 0.115 195 / 0.2)' }}
              >
                {log.action}
              </span>
              <span className="text-[10px]" style={{ color: MUTED }}>{format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <p className="mt-2 text-sm" style={{ color: INK }}>
              Target: <span style={{ color: PRIMARY }}>{log.entityType} ({log.entityId.slice(0, 8)}…)</span>
            </p>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>By {log.actor.name} · {log.actor.email}</p>
            {Object.keys(log.meta).length > 0 && (
              <pre
                className="mt-2.5 overflow-x-auto rounded-md p-2 text-[10px]"
                style={{ backgroundColor: 'oklch(0.090 0 0)', color: MUTED }}
              >
                {JSON.stringify(log.meta, null, 2)}
              </pre>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function OutboxView() {
  const queryClient = useQueryClient();
  const outboxQuery = useQuery({
    queryKey: ['admin-outbox'],
    queryFn: async (): Promise<NotificationOutbox[]> => {
      const response = await api.get<ApiResponse<{ notifications: NotificationOutbox[] }>>('/admin/notifications');
      return response.data.data!.notifications;
    },
  });
  const retryMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/notifications/${id}/retry`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-outbox'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] });
      toast.success('Queued for retry');
    },
    onError: () => toast.error('Failed to retry notification'),
  });

  if (outboxQuery.isLoading) return <LoadingSkeleton />;
  if (outboxQuery.isError) return <ErrorState message="Failed to load email outbox." />;
  const notifications = outboxQuery.data ?? [];

  return (
    <div>
      <h2 className="text-heading-md mb-0.5" style={{ color: INK }}>Email Outbox Monitor</h2>
      <p className="text-xs mb-5" style={{ color: MUTED }}>Monitor delivery status and retry failures</p>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[700px]">
          <thead>
            <tr>
              <th>Type</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last Error</th><th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id}>
                <td className="font-semibold text-xs" style={{ color: INK }}>{n.type}</td>
                <td><StatusBadge status={n.status} /></td>
                <td style={{ color: MUTED }}>{n.attempts}</td>
                <td className="text-xs" style={{ color: MUTED }}>{format(new Date(n.createdAt), 'MMM d, yyyy')}</td>
                <td className="max-w-xs truncate font-mono text-xs" style={{ color: 'oklch(0.580 0.185 25)' }} title={n.lastError ?? ''}>{n.lastError ?? '—'}</td>
                <td className="text-right">
                  {n.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => retryMutation.mutate(n.id)}
                      disabled={retryMutation.isPending}
                      className="inline-flex h-7 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-all duration-150 disabled:opacity-60"
                      style={{ borderColor: 'oklch(0.530 0.115 195 / 0.3)', color: PRIMARY }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.530 0.115 195 / 0.1)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {notifications.length === 0 && <p className="py-8 text-center text-sm" style={{ color: MUTED }}>No notification rows found.</p>}
      </div>
    </div>
  );
}
