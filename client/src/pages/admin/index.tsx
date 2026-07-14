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
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
  { id: 'users', label: 'User Accounts', icon: Users },
  { id: 'listings', label: 'Listing Moderation', icon: Building2 },
  { id: 'activity', label: 'Activity Log', icon: Activity },
  { id: 'outbox', label: 'Email Outbox', icon: Bell },
];

function LoadingSkeleton() {
  return (
    <div className="space-y-4 pt-4">
      {[0, 1, 2].map(i => <div key={i} className="skeleton h-16 rounded-xl" style={{ animationDelay: `${i * 0.1}s` }} />)}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm font-medium text-red-400">{message}</p>;
}

function StatusBadge({ status }: { status: Listing['status'] | NotificationOutbox['status'] }) {
  if (status === 'FAILED' || status === 'REMOVED') return <span className="badge-declined">{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
  if (status === 'PENDING' || status === 'FILLED') return <span className="badge-pending">{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
  return <span className="badge-accepted">{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
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
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="h-5 w-5 text-gold" />
          <p className="label-overline">Admin workspace</p>
        </div>
        <h1 className="font-serif text-display-md text-foreground">Platform control</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Metrics, moderation, and operations dashboard.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar tabs */}
        <aside className="w-full md:w-56 shrink-0">
          <div className="card-elevated rounded-2xl p-2">
            <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Navigation</p>
            <div className="space-y-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all duration-200"
                    style={activeTab === tab.id
                      ? { background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))', color: 'hsl(22, 12%, 6%)' }
                      : { color: 'hsl(var(--muted-foreground))' }
                    }
                    onMouseEnter={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--surface-2))'; }}
                    onMouseLeave={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.background = ''; }}
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
        <main className="flex-1 min-w-0 card-elevated rounded-2xl p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === 'metrics' && <MetricsView query={metricsQuery} />}
            {activeTab === 'users' && <UsersView />}
            {activeTab === 'listings' && <ListingsView />}
            {activeTab === 'activity' && <ActivityView />}
            {activeTab === 'outbox' && <OutboxView />}
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
    { label: 'Total Users', value: metrics.totalUsers, detail: `${metrics.totalOwners} owners · ${metrics.totalTenants} tenants`, icon: Users, color: 'hsl(37 78% 60%)' },
    { label: 'Listings', value: metrics.totalListings, detail: `${metrics.activeListings} currently active`, icon: Building2, color: 'hsl(152 45% 48%)' },
    { label: 'Notification Issues', value: metrics.failedNotifications + metrics.pendingNotifications, detail: `${metrics.failedNotifications} dispatch failures`, icon: AlertTriangle, color: 'hsl(0 65% 60%)' },
  ];

  return (
    <div>
      <h2 className="font-serif text-lg font-bold text-foreground">Platform Overview</h2>
      <p className="text-xs text-muted-foreground mt-1">Live aggregates from platform data</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              className="card-elevated rounded-xl p-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                style={{ background: `${card.color}20` }}
              >
                <Icon className="h-4.5 w-4.5" style={{ color: card.color }} />
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
              <p className="mt-1.5 text-3xl font-extrabold tracking-tight text-foreground font-serif">{card.value}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{card.detail}</p>
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin-users'] }); void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] }); toast.success('User status updated'); },
    onError: () => toast.error('Failed to update status'),
  });

  if (usersQuery.isLoading) return <LoadingSkeleton />;
  if (usersQuery.isError) return <ErrorState message="Failed to load user accounts." />;
  const users = usersQuery.data ?? [];

  return (
    <div>
      <h2 className="font-serif text-lg font-bold text-foreground">User Moderation</h2>
      <p className="text-xs text-muted-foreground mt-1">Suspend or restore user access</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th><th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border/50 hover:bg-surface-2/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-foreground">{user.name}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'hsl(37 78% 60% / 0.1)', color: 'hsl(37 78% 65%)' }}
                  >{user.role}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold ${user.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {user.isActive ? '● Active' : '● Suspended'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleUserMutation.mutate({ id: user.id, isActive: !user.isActive })}
                    disabled={toggleUserMutation.isPending}
                    className="inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-all duration-200 disabled:opacity-60"
                    style={user.isActive
                      ? { borderColor: 'hsl(0 65% 60% / 0.3)', color: 'hsl(0 65% 68%)' }
                      : { borderColor: 'hsl(152 45% 48% / 0.3)', color: 'hsl(152 45% 58%)' }
                    }
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = user.isActive ? 'hsl(0 65% 60% / 0.08)' : 'hsl(152 45% 48% / 0.08)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                  >
                    {user.isActive ? 'Suspend' : 'Restore'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No user accounts found.</p>}
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin-listings'] }); void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] }); toast.success('Listing removed'); },
    onError: () => toast.error('Failed to moderate listing'),
  });

  if (listingsQuery.isLoading) return <LoadingSkeleton />;
  if (listingsQuery.isError) return <ErrorState message="Failed to load listings." />;
  const listings = listingsQuery.data ?? [];

  return (
    <div>
      <h2 className="font-serif text-lg font-bold text-foreground">Listing Moderation</h2>
      <p className="text-xs text-muted-foreground mt-1">Remove listings that violate platform rules</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Title</th><th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Location</th><th className="px-4 py-3">Rent</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr key={listing.id} className="border-b border-border/50 hover:bg-surface-2/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-foreground">{listing.title}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{listing.owner?.name ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{listing.area}, {listing.city}</td>
                <td className="px-4 py-3 font-medium text-foreground">{currency.format(listing.rent)}/mo</td>
                <td className="px-4 py-3"><StatusBadge status={listing.status} /></td>
                <td className="px-4 py-3 text-right">
                  {listing.status !== 'REMOVED' && (
                    <button
                      type="button"
                      onClick={() => moderateMutation.mutate(listing.id)}
                      disabled={moderateMutation.isPending}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-red-500/30 px-3 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-500/10 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No listings found.</p>}
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
      <h2 className="font-serif text-lg font-bold text-foreground">Activity Feed Log</h2>
      <p className="text-xs text-muted-foreground mt-1">Historical records of platform audit events</p>
      <div className="mt-6 space-y-3">
        {logs.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No events recorded.</p>
        ) : logs.map((log) => (
          <article key={log.id} className="rounded-xl border border-border/50 p-4 text-sm transition-all hover:border-border"
            style={{ background: 'hsl(var(--surface-2))' }}
          >
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: 'hsl(37 78% 60% / 0.1)', color: 'hsl(37 78% 65%)', border: '1px solid hsl(37 78% 60% / 0.2)' }}
              >
                {log.action}
              </span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <p className="mt-2.5 text-sm font-medium text-foreground">
              Target: <span className="text-gold">{log.entityType} ({log.entityId.slice(0, 8)}…)</span>
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">By {log.actor.name} · {log.actor.email}</p>
            {Object.keys(log.meta).length > 0 && (
              <pre className="mt-3 overflow-x-auto rounded-lg p-2.5 text-[10px] text-muted-foreground"
                style={{ background: 'hsl(var(--background))' }}
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
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin-outbox'] }); void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] }); toast.success('Queued for retry'); },
    onError: () => toast.error('Failed to retry notification'),
  });

  if (outboxQuery.isLoading) return <LoadingSkeleton />;
  if (outboxQuery.isError) return <ErrorState message="Failed to load email outbox." />;
  const notifications = outboxQuery.data ?? [];

  return (
    <div>
      <h2 className="font-serif text-lg font-bold text-foreground">Email Outbox Monitor</h2>
      <p className="text-xs text-muted-foreground mt-1">Monitor delivery status and retry failures</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last Error</th><th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id} className="border-b border-border/50 hover:bg-surface-2/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-foreground text-xs">{n.type}</td>
                <td className="px-4 py-3"><StatusBadge status={n.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{n.attempts}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(n.createdAt), 'MMM d, yyyy')}</td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-red-400" title={n.lastError ?? ''}>{n.lastError ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  {n.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => retryMutation.mutate(n.id)}
                      disabled={retryMutation.isPending}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-gold/30 px-3 text-xs font-semibold text-gold transition-all duration-200 hover:bg-gold/10 disabled:opacity-60"
                    >
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {notifications.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No notification rows found.</p>}
      </div>
    </div>
  );
}
