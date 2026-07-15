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
  if (user?.role === 'OWNER')  return <Navigate to="listings" replace />;
  if (user?.role === 'TENANT') return <Navigate to="profile" replace />;
  if (user?.role === 'ADMIN')  return <Navigate to="/dashboard/admin" replace />;
  return null;
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof Building2;
  end?: boolean;
};

const ownerNav: NavItem[] = [
  { to: '/dashboard/listings',     label: 'My Listings',    icon: Building2,    end: true },
  { to: '/dashboard/listings/new', label: 'New Listing',    icon: Plus },
  { to: '/dashboard/interests',    label: 'Interests',      icon: Send },
  { to: '/dashboard/chat',         label: 'Inbox',          icon: MessageSquare },
];

const tenantNav: NavItem[] = [
  { to: '/dashboard/profile',   label: 'My Profile',    icon: UserRoundPen },
  { to: '/dashboard/browse',    label: 'Browse Rooms',  icon: Search },
  { to: '/dashboard/interests', label: 'Sent Interests', icon: Send },
  { to: '/dashboard/chat',      label: 'Inbox',         icon: MessageSquare },
];

const adminNav: NavItem[] = [
  { to: '/dashboard/admin', label: 'Admin Panel', icon: BarChart3 },
];

const SIDEBAR_BG    = 'oklch(0.135 0.006 240)';
const BORDER_COLOR  = 'oklch(0.210 0.006 240)';
const MUTED_COLOR   = 'oklch(0.520 0.010 240)';
const INK_COLOR     = 'oklch(0.930 0 0)';
const PRIMARY_COLOR = 'oklch(0.530 0.115 195)';

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const navItems =
    user?.role === 'OWNER'  ? ownerNav  :
    user?.role === 'TENANT' ? tenantNav :
    adminNav;

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* noop */ }
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: SIDEBAR_BG }}>
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.15)', border: '1px solid oklch(0.530 0.115 195 / 0.3)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill={PRIMARY_COLOR} />
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-tight" style={{ color: INK_COLOR }}>
          Room<span style={{ color: PRIMARY_COLOR }}>Finder</span>
        </span>
      </div>

      {/* User chip */}
      <div className="px-3 py-3" style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'oklch(0.175 0.008 240)' }}>
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold"
            style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.15)', color: PRIMARY_COLOR }}
          >
            {user?.name?.[0]?.toUpperCase() ?? <User className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate" style={{ color: INK_COLOR }}>{user?.name}</p>
            <p className="text-[10px] font-medium" style={{ color: MUTED_COLOR }}>{user?.role}</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive ? '' : ''
                }`
              }
              style={({ isActive }) => isActive
                ? { backgroundColor: 'oklch(0.530 0.115 195 / 0.12)', color: PRIMARY_COLOR }
                : { color: MUTED_COLOR }
              }
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                if (!el.classList.contains('active')) {
                  el.style.backgroundColor = 'oklch(0.175 0.008 240)';
                  el.style.color = INK_COLOR;
                }
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                if (!el.dataset.active) {
                  el.style.backgroundColor = '';
                  el.style.color = '';
                }
              }}
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? PRIMARY_COLOR : 'inherit' }} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-3" style={{ borderTop: `1px solid ${BORDER_COLOR}` }}>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
          style={{ color: MUTED_COLOR }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.580 0.185 25 / 0.08)';
            (e.currentTarget as HTMLElement).style.color = 'oklch(0.580 0.185 25)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '';
            (e.currentTarget as HTMLElement).style.color = MUTED_COLOR;
          }}
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
    <div className="min-h-screen flex" style={{ backgroundColor: 'oklch(0.090 0 0)' }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex lg:w-56 xl:w-60 shrink-0 flex-col fixed top-0 left-0 h-full z-40"
        style={{ borderRight: `1px solid oklch(0.210 0.006 240)` }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              key="overlay"
              className="fixed inset-0 z-50 lg:hidden"
              style={{ backgroundColor: 'oklch(0.090 0 0 / 0.7)', backdropFilter: 'blur(4px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.aside
              key="drawer"
              className="fixed top-0 left-0 h-full w-56 z-50 lg:hidden"
              style={{ borderRight: `1px solid oklch(0.210 0.006 240)` }}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            >
              <button
                className="absolute top-3 right-3 p-1.5 rounded-md transition-colors"
                style={{ color: MUTED_COLOR }}
                onClick={() => setMobileSidebarOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent onClose={() => setMobileSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 lg:ml-56 xl:ml-60 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-40 flex items-center justify-between h-12 px-4"
          style={{ backgroundColor: 'oklch(0.135 0.006 240)', borderBottom: `1px solid oklch(0.210 0.006 240)` }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: MUTED_COLOR }}
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold" style={{ color: INK_COLOR }}>
            Room<span style={{ color: PRIMARY_COLOR }}>Finder</span>
          </span>
          <div className="w-8" />
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Routes>
                <Route path="listings"          element={<RoleOnly role="OWNER"><OwnerListings /></RoleOnly>} />
                <Route path="listings/new"      element={<RoleOnly role="OWNER"><CreateListing /></RoleOnly>} />
                <Route path="listings/:id/edit" element={<RoleOnly role="OWNER"><CreateListing /></RoleOnly>} />
                <Route path="listings/:id"      element={<RoleOnly role="TENANT"><ListingDetails /></RoleOnly>} />
                <Route path="profile"           element={<RoleOnly role="TENANT"><TenantProfilePage /></RoleOnly>} />
                <Route path="browse"            element={<RoleOnly role="TENANT"><BrowseListings /></RoleOnly>} />
                <Route path="interests"         element={<InterestsPage />} />
                <Route path="chat"              element={<ChatPage />} />
                <Route path="admin/*"           element={<RoleOnly role="ADMIN"><AdminDashboard /></RoleOnly>} />
                <Route index  element={<DashboardHome />} />
                <Route path="*" element={<DashboardHome />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
