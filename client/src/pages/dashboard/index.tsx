import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { Navigate, NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Building2,
  LogOut,
  MessageSquare,
  Search,
  Send,
  Shield,
  User,
  UserRoundPen,
  Plus,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import OwnerListings from './listings/mine';
import CreateListing from './listings/create';
import ListingDetails from './listings/details';
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
  return null;
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof Building2;
  end?: boolean;
};

const ownerNav: NavItem[] = [
  { to: '/dashboard/listings', label: 'My Listings', icon: Building2, end: true },
  { to: '/dashboard/listings/new', label: 'Create Listing', icon: Plus },
  { to: '/dashboard/interests', label: 'Interests', icon: Send },
  { to: '/dashboard/chat', label: 'Inbox', icon: MessageSquare },
];

const tenantNav: NavItem[] = [
  { to: '/dashboard/profile', label: 'My Profile', icon: UserRoundPen },
  { to: '/dashboard/browse', label: 'Browse Rooms', icon: Search },
  { to: '/dashboard/interests', label: 'Sent Interests', icon: Send },
  { to: '/dashboard/chat', label: 'Inbox', icon: MessageSquare },
];

const adminNav: NavItem[] = [
  { to: '/dashboard/admin', label: 'Admin Panel', icon: BarChart3 },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const navItems = user?.role === 'OWNER' ? ownerNav : user?.role === 'TENANT' ? tenantNav : adminNav;

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* noop */ }
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Logo */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill="hsl(22, 12%, 6%)" />
            </svg>
          </div>
          <span className="font-serif text-lg font-semibold text-foreground tracking-tight">
            Room<span className="text-gold">Finder</span>
          </span>
        </div>
      </div>

      {/* User chip */}
      <div className="mx-4 mb-6 p-3 rounded-xl" style={{ background: 'hsl(var(--surface-2))' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'hsl(37 78% 60% / 0.15)' }}
          >
            <User className="w-4 h-4 text-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
            <span className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: 'hsl(37 78% 60%)' }}
            >
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Nav section label */}
      <div className="px-6 mb-2">
        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground">Navigation</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'text-background font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'linear-gradient(135deg, hsl(37 78% 60%), hsl(33 64% 48%))' }
                  : {}
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-background' : 'text-muted-foreground group-hover:text-foreground'}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom: logout */}
      <div className="p-4 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 xl:w-64 shrink-0 flex-col fixed top-0 left-0 h-full border-r border-border z-40"
        style={{ background: 'hsl(var(--surface))' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              key="overlay"
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              key="drawer"
              className="fixed top-0 left-0 h-full w-72 z-50 lg:hidden border-r border-border"
              style={{ background: 'hsl(var(--surface))' }}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <button
                className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                onClick={() => setMobileSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent onClose={() => setMobileSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 lg:ml-60 xl:ml-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="lg:hidden glass-heavy sticky top-0 z-40 flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif text-base font-semibold text-foreground">
            Room<span className="text-gold">Finder</span>
          </span>
          <div className="w-9" /> {/* spacer */}
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <Routes>
                <Route path="listings" element={<RoleOnly role="OWNER"><OwnerListings /></RoleOnly>} />
                <Route path="listings/new" element={<RoleOnly role="OWNER"><CreateListing /></RoleOnly>} />
                <Route path="listings/:id/edit" element={<RoleOnly role="OWNER"><CreateListing /></RoleOnly>} />
                <Route path="listings/:id" element={<RoleOnly role="TENANT"><ListingDetails /></RoleOnly>} />
                <Route path="profile" element={<RoleOnly role="TENANT"><TenantProfilePage /></RoleOnly>} />
                <Route path="browse" element={<RoleOnly role="TENANT"><BrowseListings /></RoleOnly>} />
                <Route path="interests" element={<InterestsPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="admin/*" element={<RoleOnly role="ADMIN"><AdminDashboard /></RoleOnly>} />
                <Route index element={<DashboardHome />} />
                <Route path="*" element={<DashboardHome />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
