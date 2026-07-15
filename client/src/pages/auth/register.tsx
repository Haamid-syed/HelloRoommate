import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ArrowRight, Search, Home } from 'lucide-react';
import { motion } from 'framer-motion';

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'TENANT' | 'OWNER'>('TENANT');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { name, email, password, role });
      setAuth(data.data.user, data.data.accessToken);
      toast.success('Account created!');
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(error.response?.data?.error?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'oklch(0.090 0 0)' }}>
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'oklch(0.530 0.115 195 / 0.15)', border: '1px solid oklch(0.530 0.115 195 / 0.3)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 9.5L12 3L21 9.5V21H15V15H9V21H3V9.5Z" fill="oklch(0.530 0.115 195)" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight" style={{ color: 'oklch(0.930 0 0)' }}>
            Room<span style={{ color: 'oklch(0.530 0.115 195)' }}>Finder</span>
          </span>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-heading-lg" style={{ color: 'oklch(0.930 0 0)' }}>
            Create account
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'oklch(0.520 0.010 240)' }}>
            Free to use · AI handles the matching
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role selector */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'oklch(0.520 0.010 240)' }}>
              I'm a
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['TENANT', 'Tenant', Search] as const,
                ['OWNER',  'Owner',  Home]   as const,
              ]).map(([value, label, Icon]) => {
                const isActive = role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className="h-10 rounded-lg text-sm font-medium transition-all duration-150 flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: isActive ? 'oklch(0.530 0.115 195 / 0.15)' : 'oklch(0.175 0.008 240)',
                      color: isActive ? 'oklch(0.590 0.125 195)' : 'oklch(0.520 0.010 240)',
                      border: `1px solid ${isActive ? 'oklch(0.530 0.115 195 / 0.4)' : 'oklch(0.210 0.006 240)'}`,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1.5" style={{ color: 'oklch(0.520 0.010 240)' }}>
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              minLength={2}
              className="input-field h-10 px-3"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: 'oklch(0.520 0.010 240)' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="input-field h-10 px-3"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: 'oklch(0.520 0.010 240)' }}>
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                className="input-field h-10 px-3 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: 'oklch(0.520 0.010 240)' }}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            id="register-submit"
            disabled={loading}
            className="btn-primary w-full h-10 mt-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'oklch(0.930 0 0 / 0.3)', borderTopColor: 'oklch(0.930 0 0)' }} />
            ) : (
              <>
                Create account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'oklch(0.520 0.010 240)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium transition-colors" style={{ color: 'oklch(0.590 0.125 195)' }}>
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
