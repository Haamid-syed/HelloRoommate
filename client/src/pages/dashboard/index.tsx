import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LogOut, Home, User } from 'lucide-react';

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

      {/* Main content */}
      <main className="container py-8">
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold mb-4">Welcome, {user?.name}! 👋</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {user?.role === 'OWNER'
              ? 'Start listing your rooms and manage tenant interests.'
              : user?.role === 'TENANT'
                ? 'Set up your profile and find your perfect room.'
                : 'Manage the platform from the admin dashboard.'}
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Dashboard features coming in Phase 2... 🚧
          </p>
        </div>
      </main>
    </div>
  );
}
