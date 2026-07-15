import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import type { ReactNode } from 'react';

// Pages — will be created as we build each phase
import LoginPage from '@/pages/auth/login';
import RegisterPage from '@/pages/auth/register';
import DashboardPage from '@/pages/dashboard';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

import { Link } from 'react-router-dom';
import BrowseListings from '@/pages/dashboard/browse';

function GuestLandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'oklch(0.090 0 0)' }}>
      {/* Top Header */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between h-14 px-6 animate-fade-in"
        style={{ backgroundColor: 'oklch(0.135 0.006 240)', borderBottom: '1px solid oklch(0.210 0.006 240)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.15)', border: '1px solid oklch(0.530 0.115 195 / 0.3)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill="oklch(0.530 0.115 195)" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'oklch(0.930 0 0)' }}>
            Room<span style={{ color: 'oklch(0.530 0.115 195)' }}>Finder</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
            style={{ color: 'oklch(0.930 0 0)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'oklch(0.175 0.008 240)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
            style={{ backgroundColor: 'oklch(0.530 0.115 195)', color: 'oklch(0.090 0 0)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'oklch(0.580 0.125 195)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'oklch(0.530 0.115 195)'}
          >
            Sign up
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 lg:p-8">
        <BrowseListings />
      </main>
    </div>
  );
}

function LandingRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <GuestLandingPage />;
}

export default function App() {
  return (
    <Routes>
      {/* Landing page */}
      <Route path="/" element={<LandingRoute />} />

      {/* Public routes */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />

      {/* Protected routes */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
