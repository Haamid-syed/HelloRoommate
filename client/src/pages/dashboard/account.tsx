import { useAuthStore } from '@/stores/auth-store';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Mail, Shield, Calendar, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const SURFACE   = 'oklch(0.135 0.006 240)';
const SURFACE2  = 'oklch(0.175 0.008 240)';
const BORDER    = 'oklch(0.210 0.006 240)';
const INK       = 'oklch(0.930 0 0)';
const MUTED     = 'oklch(0.520 0.010 240)';
const PRIMARY   = 'oklch(0.530 0.115 195)';

const ROLE_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  OWNER:  { bg: 'oklch(0.530 0.115 195 / 0.12)', color: PRIMARY,                   border: 'oklch(0.530 0.115 195 / 0.3)' },
  TENANT: { bg: 'oklch(0.680 0.145 148 / 0.12)', color: 'oklch(0.680 0.145 148)',  border: 'oklch(0.680 0.145 148 / 0.3)' },
  ADMIN:  { bg: 'oklch(0.720 0.130 75 / 0.12)',  color: 'oklch(0.720 0.130 75)',   border: 'oklch(0.720 0.130 75 / 0.3)' },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AccountPanel({ open, onClose }: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* noop */ }
    logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const badge = ROLE_BADGE[user?.role ?? 'TENANT'] ?? ROLE_BADGE['TENANT']!
  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  // Approximate join date from UUID v4 (not reliable), so just show role info
  const roleLabel =
    user?.role === 'OWNER'  ? 'Room Owner'     :
    user?.role === 'TENANT' ? 'Tenant'          :
    user?.role === 'ADMIN'  ? 'Administrator'   : '';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'oklch(0.09 0 0 / 0.6)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            className="fixed top-0 right-0 h-full w-80 z-50 flex flex-col"
            style={{ backgroundColor: SURFACE, borderLeft: `1px solid ${BORDER}` }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-sm font-semibold" style={{ color: INK }}>My Account</span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: MUTED }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = SURFACE2}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ''}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Avatar + name */}
            <div className="px-5 py-6 flex flex-col items-center text-center" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold mb-3"
                style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.15)', color: PRIMARY, border: `2px solid oklch(0.530 0.115 195 / 0.3)` }}
              >
                {initials}
              </div>
              <p className="text-base font-semibold" style={{ color: INK }}>{user?.name}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>{user?.email}</p>
              <span
                className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}
              >
                <Shield className="w-3 h-3" />
                {roleLabel}
              </span>
            </div>

            {/* Info rows */}
            <div className="px-5 py-4 flex-1 space-y-3">
              {[
                { icon: User,     label: 'Full name',  value: user?.name ?? '—' },
                { icon: Mail,     label: 'Email',      value: user?.email ?? '—' },
                { icon: Calendar, label: 'Account type', value: roleLabel },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 px-3 py-3 rounded-xl" style={{ backgroundColor: SURFACE2 }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.12)' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
                    <p className="text-sm font-medium mt-0.5 break-all" style={{ color: INK }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Sign out */}
            <div className="px-5 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-medium transition-colors duration-150"
                style={{ backgroundColor: 'oklch(0.580 0.185 25 / 0.1)', color: 'oklch(0.580 0.185 25)', border: '1px solid oklch(0.580 0.185 25 / 0.25)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.580 0.185 25 / 0.18)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'oklch(0.580 0.185 25 / 0.1)'}
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
