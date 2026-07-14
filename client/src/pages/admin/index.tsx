import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Activity, AlertTriangle, BarChart3, Bell, Building2, ShieldAlert, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  AuditLog,
  Listing,
  NotificationOutbox,
  PlatformMetrics,
  User,
} from 'shared';

type TabType = 'metrics' | 'users' | 'listings' | 'activity' | 'outbox';
type ActivityLogRow = AuditLog & { actor: Pick<User, 'name' | 'email'> };

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const tabs: Array<{ id: TabType; label: string; icon: typeof BarChart3 }> = [
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
  { id: 'users', label: 'User Accounts', icon: Users },
  { id: 'listings', label: 'Listing Moderation', icon: Building2 },
  { id: 'activity', label: 'Platform Activity', icon: Activity },
  { id: 'outbox', label: 'Email Outbox', icon: Bell },
];

function LoadingState() {
  return (
    <div className="flex h-40 items-center justify-center" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm font-medium text-destructive">{message}</p>;
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
    <div className="flex flex-col gap-6 animate-fade-in md:flex-row">
      <aside className="w-full shrink-0 md:w-60">
        <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
          <p className="px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Admin Workspace
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
        {activeTab === 'metrics' && <MetricsView query={metricsQuery} />}
        {activeTab === 'users' && <UsersView />}
        {activeTab === 'listings' && <ListingsView />}
        {activeTab === 'activity' && <ActivityView />}
        {activeTab === 'outbox' && <OutboxView />}
      </main>
    </div>
  );
}

function MetricsView({ query }: { query: UseQueryResult<PlatformMetrics, Error> }) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message="Failed to load platform metrics." />;

  const metrics = query.data;
  const cards = [
    {
      label: 'Total User Accounts',
      value: metrics.totalUsers,
      detail: `${metrics.totalOwners} owners · ${metrics.totalTenants} tenants`,
      icon: Users,
    },
    {
      label: 'Listings Uploaded',
      value: metrics.totalListings,
      detail: `${metrics.activeListings} active listing boards`,
      icon: Building2,
    },
    {
      label: 'Transactional Notifications',
      value: metrics.failedNotifications + metrics.pendingNotifications,
      detail: `${metrics.failedNotifications} dispatch failures`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold">Platform Overview</h2>
      <p className="text-xs text-muted-foreground">Live aggregates from platform data</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-border bg-secondary/20 p-5 shadow-sm">
              <Icon className="h-5 w-5 text-primary" />
              <p className="mt-4 text-xs font-semibold text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">{card.value}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">{card.detail}</p>
            </div>
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
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/${id}/status`, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] });
      toast.success('User status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  if (usersQuery.isLoading) return <LoadingState />;
  if (usersQuery.isError) return <ErrorState message="Failed to load user accounts." />;
  const users = usersQuery.data ?? [];

  return (
    <section>
      <h2 className="text-lg font-bold">User Moderation</h2>
      <p className="text-xs text-muted-foreground">Suspend or restore user logins</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[680px] table-auto border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-xs font-bold uppercase text-muted-foreground">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-secondary/10">
                <td className="px-4 py-3 font-semibold">{user.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-3"><span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{user.role}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
                <td className="px-4 py-3"><span className={`text-xs font-bold ${user.isActive ? 'text-emerald-600' : 'text-rose-600'}`}>{user.isActive ? 'Active' : 'Banned'}</span></td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleUserMutation.mutate({ id: user.id, isActive: !user.isActive })}
                    disabled={toggleUserMutation.isPending}
                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${user.isActive ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                  >
                    {user.isActive ? 'Suspend' : 'Unsuspend'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No user accounts found.</p>}
    </section>
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
  const moderateListingMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/listings/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-listings'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] });
      toast.success('Listing removed successfully');
    },
    onError: () => toast.error('Failed to moderate listing'),
  });

  if (listingsQuery.isLoading) return <LoadingState />;
  if (listingsQuery.isError) return <ErrorState message="Failed to load listings." />;
  const listings = listingsQuery.data ?? [];

  return (
    <section>
      <h2 className="text-lg font-bold">Listing Moderation</h2>
      <p className="text-xs text-muted-foreground">Remove listings that violate platform rules</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] table-auto border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-xs font-bold uppercase text-muted-foreground">
              <th className="px-4 py-3">Title</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Rent</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {listings.map((listing) => (
              <tr key={listing.id} className="hover:bg-secondary/10">
                <td className="px-4 py-3 font-semibold">{listing.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{listing.owner?.name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{listing.area}, {listing.city}</td>
                <td className="px-4 py-3 font-medium">{currency.format(listing.rent)}/mo</td>
                <td className="px-4 py-3"><StatusBadge status={listing.status} /></td>
                <td className="px-4 py-3 text-right">
                  {listing.status !== 'REMOVED' && (
                    <button type="button" onClick={() => moderateListingMutation.mutate(listing.id)} disabled={moderateListingMutation.isPending} className="inline-flex h-8 items-center justify-center rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {listings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No listings found.</p>}
    </section>
  );
}

function StatusBadge({ status }: { status: Listing['status'] | NotificationOutbox['status'] }) {
  const colour = status === 'FAILED' || status === 'REMOVED' ? 'text-rose-600' : status === 'PENDING' || status === 'FILLED' ? 'text-amber-600' : 'text-emerald-600';
  return <span className={`text-xs font-bold ${colour}`}>{status.charAt(0)}{status.slice(1).toLowerCase()}</span>;
}

function ActivityView() {
  const activityQuery = useQuery({
    queryKey: ['admin-activity'],
    queryFn: async (): Promise<ActivityLogRow[]> => {
      const response = await api.get<ApiResponse<{ logs: ActivityLogRow[] }>>('/admin/activity');
      return response.data.data!.logs;
    },
  });

  if (activityQuery.isLoading) return <LoadingState />;
  if (activityQuery.isError) return <ErrorState message="Failed to load activity logs." />;
  const logs = activityQuery.data ?? [];

  return (
    <section>
      <h2 className="text-lg font-bold">Activity Feed Log</h2>
      <p className="text-xs text-muted-foreground">Historical records of platform audits</p>
      <div className="mt-6 flex flex-col gap-4">
        {logs.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">No events recorded in the audit log.</p> : logs.map((log) => (
          <article key={log.id} className="rounded-xl border border-border bg-secondary/15 p-4 text-sm shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary">{log.action}</span>
              <span className="text-[10px] text-muted-foreground">{format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <p className="mt-2.5 font-medium">Target entity: <strong className="text-primary">{log.entityType} ({log.entityId.slice(0, 8)})</strong></p>
            <p className="mt-2 text-xs text-muted-foreground">By: {log.actor.name} ({log.actor.email})</p>
            {Object.keys(log.meta).length > 0 && <pre className="mt-2.5 overflow-x-auto rounded-lg bg-card/60 p-2 text-[10px] text-muted-foreground">{JSON.stringify(log.meta, null, 2)}</pre>}
          </article>
        ))}
      </div>
    </section>
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
      toast.success('Notification queued for retry');
    },
    onError: () => toast.error('Failed to retry notification'),
  });

  if (outboxQuery.isLoading) return <LoadingState />;
  if (outboxQuery.isError) return <ErrorState message="Failed to load email outbox." />;
  const notifications = outboxQuery.data ?? [];

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="h-5 w-5 text-primary" />Email Outbox Monitor</h2>
      <p className="text-xs text-muted-foreground">Monitor delivery status and retry dispatch failures</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] table-auto border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30 text-xs font-bold uppercase text-muted-foreground">
              <th className="px-4 py-3">Type</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Created</th><th className="px-4 py-3">Last Error</th><th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {notifications.map((notification) => (
              <tr key={notification.id} className="hover:bg-secondary/10">
                <td className="px-4 py-3 font-semibold">{notification.type}</td>
                <td className="px-4 py-3"><StatusBadge status={notification.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{notification.attempts}</td>
                <td className="px-4 py-3 text-muted-foreground">{format(new Date(notification.createdAt), 'MMM d, yyyy')}</td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-rose-600" title={notification.lastError ?? ''}>{notification.lastError ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  {notification.status === 'FAILED' && <button type="button" onClick={() => retryMutation.mutate(notification.id)} disabled={retryMutation.isPending} className="inline-flex h-8 items-center justify-center rounded-lg border border-primary px-3 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60">Retry</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notifications.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No notification rows found.</p>}
    </section>
  );
}
