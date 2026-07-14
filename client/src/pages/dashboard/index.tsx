import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, Home, LogOut, MessageSquare, Search, Send, Shield, User, UserRoundPen } from 'lucide-react';
import type { ReactNode } from 'react';
import OwnerListings from './listings/mine';
import CreateListing from './listings/create';
import TenantProfilePage from './profile';
import BrowseListings from './browse';
import InterestsPage from './interests';
import ChatPage from './chat';
import AdminDashboard from '../admin';

function RoleOnly({ role, children }: { role: 'OWNER' | 'TENANT' | 'ADMIN'; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  return user?.role === role ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function DashboardHome() {
  const user = useAuthStore((state) => state.user);

  if (user?.role === 'OWNER') return <Navigate to="listings" replace />;
  if (user?.role === 'TENANT') return <Navigate to="profile" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/dashboard/admin" replace />;

  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold">Admin tools are on the way</h1>
      <p className="mt-2 text-sm text-muted-foreground">The platform-management workspace will arrive in a later phase.</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors
    }
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Home className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold">
              Room<span className="text-primary">Finder</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {user?.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card/50">
        <nav className="container flex gap-1 overflow-x-auto" aria-label="Dashboard navigation">
          {user?.role === 'OWNER' && (
            <>
              <NavLink to="/dashboard/listings" end className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Building2 className="h-4 w-4" />My listings</NavLink>
              <NavLink to="/dashboard/listings/new" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Home className="h-4 w-4" />Create listing</NavLink>
              <NavLink to="/dashboard/interests" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Send className="h-4 w-4" />Interests</NavLink>
              <NavLink to="/dashboard/chat" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><MessageSquare className="h-4 w-4" />Inbox</NavLink>
            </>
          )}
          {user?.role === 'TENANT' && (
            <>
              <NavLink to="/dashboard/profile" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><UserRoundPen className="h-4 w-4" />My profile</NavLink>
              <NavLink to="/dashboard/browse" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Search className="h-4 w-4" />Browse listings</NavLink>
              <NavLink to="/dashboard/interests" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Send className="h-4 w-4" />Sent interests</NavLink>
              <NavLink to="/dashboard/chat" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><MessageSquare className="h-4 w-4" />Inbox</NavLink>
            </>
          )}
          {user?.role === 'ADMIN' && (
            <NavLink to="/dashboard/admin" className={({ isActive }) => `inline-flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Shield className="h-4 w-4" /> Admin dashboard
            </NavLink>
          )}
        </nav>
      </div>

      <main className="container py-8">
        <Routes>
          <Route path="listings" element={<RoleOnly role="OWNER"><OwnerListings /></RoleOnly>} />
          <Route path="listings/new" element={<RoleOnly role="OWNER"><CreateListing /></RoleOnly>} />
          <Route path="listings/:id/edit" element={<RoleOnly role="OWNER"><CreateListing /></RoleOnly>} />
          <Route path="profile" element={<RoleOnly role="TENANT"><TenantProfilePage /></RoleOnly>} />
          <Route path="browse" element={<RoleOnly role="TENANT"><BrowseListings /></RoleOnly>} />
          <Route path="interests" element={<InterestsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="admin/*" element={<RoleOnly role="ADMIN"><AdminDashboard /></RoleOnly>} />
          <Route index element={<DashboardHome />} />
          <Route path="*" element={<DashboardHome />} />
        </Routes>
      </main>
    </div>
  );
}
